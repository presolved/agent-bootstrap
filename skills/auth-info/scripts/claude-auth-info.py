#!/usr/bin/env python3
"""Report which credential Claude Code will use in this environment.

Prints redacted metadata only (token type prefix + length); never a full token.
Walks the documented precedence order (code.claude.com/docs/en/authentication)
and stops at the first source that is set, then lists the other stored logins
on the machine so you can tell accounts apart.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
CFG_ENV = os.environ.get("CLAUDE_CONFIG_DIR")
CFG = Path(CFG_ENV).expanduser() if CFG_ENV else HOME / ".claude"
CFG_STR = str(CFG).rstrip("/")
IS_DEFAULT_CFG = CFG_ENV is None
DARWIN = sys.platform == "darwin"
PROJECT = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())


def redact(token: str | None) -> str:
    if not token:
        return "<empty>"
    return f"{token[:14]}… ({len(token)} chars)"


def when(ms: int | None) -> str:
    if not ms:
        return "n/a"
    t = dt.datetime.fromtimestamp(ms / 1000).astimezone()
    flag = " EXPIRED" if t < dt.datetime.now().astimezone() else ""
    return t.strftime("%Y-%m-%d %H:%M %Z") + flag


def load_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def keychain_read(service: str) -> dict | None:
    if not DARWIN:
        return None
    try:
        out = subprocess.run(
            ["security", "find-generic-password", "-s", service, "-w"],
            capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode != 0:
        return None
    try:
        return json.loads(out.stdout.strip())
    except ValueError:
        return None


def keychain_services() -> list[str]:
    if not DARWIN:
        return []
    try:
        out = subprocess.run(["security", "dump-keychain"], capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.TimeoutExpired):
        return []
    names = set()
    for line in out.stdout.splitlines():
        if '"svce"<blob>="Claude Code-credentials' in line:
            names.add(line.split('="', 1)[1].rstrip('"'))
    return sorted(names)


def service_for(cfg_dir: str, is_default: bool) -> str:
    if is_default:
        return "Claude Code-credentials"
    return "Claude Code-credentials-" + hashlib.sha256(cfg_dir.encode()).hexdigest()[:8]


def account_file(cfg_dir: Path, is_default: bool) -> Path:
    return HOME / ".claude.json" if is_default else cfg_dir / ".claude.json"


def account_line(cfg_dir: Path, is_default: bool) -> str:
    data = load_json(account_file(cfg_dir, is_default)) or {}
    acct = data.get("oauthAccount") or {}
    if not acct:
        return "(no oauthAccount in " + str(account_file(cfg_dir, is_default)) + ")"
    parts = [acct.get("emailAddress", "?"), acct.get("organizationName", "?"),
             acct.get("organizationType", "?")]
    if acct.get("seatTier"):
        parts.append("seat " + acct["seatTier"])
    return " · ".join(parts)


def oauth_lines(blob: dict) -> list[str]:
    o = blob.get("claudeAiOauth") or {}
    if not o:
        return ["  (no claudeAiOauth block)"]
    lines = [
        f"  access token    {redact(o.get('accessToken'))}  expires {when(o.get('expiresAt'))}",
        f"  refresh token   {redact(o.get('refreshToken'))}  expires {when(o.get('refreshTokenExpiresAt'))}",
        f"  plan / tier     {o.get('subscriptionType', '?')} / {o.get('rateLimitTier', '?')}",
        f"  scopes          {', '.join(o.get('scopes', []))}",
    ]
    if o.get("expiresAt") and o["expiresAt"] / 1000 < dt.datetime.now().timestamp():
        lines.append("  note            access token is past expiry; Claude Code refreshes it on use while the refresh token is valid")
    return lines


def settings_candidates() -> list[Path]:
    managed = (Path("/Library/Application Support/ClaudeCode/managed-settings.json") if DARWIN
               else Path("/etc/claude-code/managed-settings.json"))
    return [managed, CFG / "settings.json", CFG / "settings.local.json",
            PROJECT / ".claude" / "settings.json", PROJECT / ".claude" / "settings.local.json"]


def settings_hits(key: str) -> list[tuple[Path, object]]:
    hits = []
    for p in settings_candidates():
        d = load_json(p)
        if d and key in d:
            hits.append((p, d[key]))
    return hits


def main() -> int:
    out: list[str] = []
    out.append(f"Claude Code auth · {dt.datetime.now().astimezone().strftime('%Y-%m-%d %H:%M %Z')} · {os.uname().nodename}")
    out.append(f"config dir        {CFG_STR}  ({'CLAUDE_CONFIG_DIR' if CFG_ENV else 'default, CLAUDE_CONFIG_DIR unset'})")

    checked: list[str] = []
    active: str | None = None
    detail: list[str] = []

    # 1. cloud provider flags
    cloud = [k for k in ("CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY") if os.environ.get(k)]
    if cloud:
        active = "cloud provider (" + ", ".join(f"{k}={os.environ[k]}" for k in cloud) + ")"
    else:
        checked.append("CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY")

    # 2/3. bearer token, api key
    for env, label, note in (
        ("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN env (bearer, gateway/proxy)", ""),
        ("ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY env (Console API key)", "needs one-time approval in interactive mode; always used with -p"),
    ):
        if active:
            break
        if os.environ.get(env):
            active = label
            detail.append(f"  value           {redact(os.environ[env])}")
            if note:
                detail.append(f"  note            {note}")
        else:
            checked.append(env)

    # 4. apiKeyHelper
    helpers = settings_hits("apiKeyHelper")
    if not active and helpers:
        p, v = helpers[0]
        active = f"apiKeyHelper script from {p}"
        detail.append(f"  helper          {v}")
    elif not helpers:
        checked.append("apiKeyHelper in " + ", ".join(str(p).replace(str(HOME), "~") for p in settings_candidates() if p.exists()))

    # 5. long-lived OAuth token
    if not active and os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        active = "CLAUDE_CODE_OAUTH_TOKEN env (claude setup-token)"
        detail.append(f"  value           {redact(os.environ['CLAUDE_CODE_OAUTH_TOKEN'])}")
    elif not active:
        checked.append("CLAUDE_CODE_OAUTH_TOKEN")

    # 6. Anthropic profile / federation
    profile = os.environ.get("ANTHROPIC_PROFILE")
    fed = os.environ.get("ANTHROPIC_FEDERATION_RULE_ID") and os.environ.get("ANTHROPIC_ORGANIZATION_ID")
    ant_dir = Path(os.environ.get("ANTHROPIC_CONFIG_DIR") or (HOME / ".config" / "anthropic"))
    active_cfg = ant_dir / "active_config"
    if not active and profile:
        active = f"Anthropic profile '{profile}' (ANTHROPIC_PROFILE)"
    elif not active and fed:
        active = "Workload Identity Federation (ANTHROPIC_FEDERATION_RULE_ID + ANTHROPIC_ORGANIZATION_ID)"
    else:
        checked.append("ANTHROPIC_PROFILE / federation vars")
        if active_cfg.exists():
            detail.append(f"  note            {active_cfg} exists (active profile '{active_cfg.read_text().strip()}'); "
                          "an oidc_federation profile outranks /login, a user_oauth one ranks below it")
        else:
            checked.append(str(active_cfg).replace(str(HOME), "~"))

    # 7. stored /login credential
    cred_file = CFG / ".credentials.json"
    service = service_for(CFG_STR, IS_DEFAULT_CFG)
    file_blob = load_json(cred_file)
    kc_blob = keychain_read(service)
    stored_src = None
    blob = None
    if kc_blob and kc_blob.get("claudeAiOauth"):
        stored_src, blob = f'macOS Keychain item "{service}"', kc_blob
    if file_blob and file_blob.get("claudeAiOauth"):
        if stored_src:
            detail.append(f"  note            {cred_file} ALSO holds a claudeAiOauth block (keychain fallback file); both listed below")
        else:
            stored_src, blob = str(cred_file), file_blob
    if not active:
        if blob:
            active = f"stored /login OAuth in {stored_src}"
        else:
            active = "NONE FOUND (expect a login prompt or 401)"

    out.append(f"active source     {active}")
    out.extend(detail)
    if blob:
        out.append(f"account           {account_line(CFG, IS_DEFAULT_CFG)}")
        out.extend(oauth_lines(blob))
        if file_blob and kc_blob and file_blob is not blob and file_blob.get("claudeAiOauth"):
            out.append(f"  fallback file   {cred_file}")
            out.extend(oauth_lines(file_blob))
    elif not blob and active.startswith("NONE"):
        out.append(f"  looked in       {service if DARWIN else '(keychain n/a)'} and {cred_file}")

    for key in ("forceLoginMethod", "forceLoginOrgUUID"):
        for p, v in settings_hits(key):
            out.append(f"policy            {key}={v}  ({p})")

    if checked:
        out.append("checked, unset    " + "; ".join(checked))

    # other stored logins on this machine
    others: list[str] = []
    candidates = {service_for(str(d).rstrip("/"), False): d for d in HOME.glob(".claude*") if d.is_dir()}
    candidates["Claude Code-credentials"] = HOME / ".claude"
    for svc in keychain_services():
        if svc == service:
            continue
        b = keychain_read(svc)
        o = (b or {}).get("claudeAiOauth") or {}
        d = candidates.get(svc)
        where = (str(d).replace(str(HOME), "~") + (" (default)" if svc == "Claude Code-credentials" else "")) if d else "(config dir unknown)"
        acct = account_line(d, svc == "Claude Code-credentials") if d else "?"
        others.append(f"  {svc:<34} {where:<28} {acct}")
        if o:
            others.append(f"  {'':<34} {o.get('subscriptionType', '?')}/{o.get('rateLimitTier', '?')} · access {when(o.get('expiresAt'))} · refresh {when(o.get('refreshTokenExpiresAt'))}")
    for d in sorted(HOME.glob(".claude*")):
        f = d / ".credentials.json"
        if d.is_dir() and f != cred_file and f.exists():
            b = load_json(f) or {}
            o = b.get("claudeAiOauth") or {}
            others.append(f"  {str(f).replace(str(HOME), '~'):<34} {'':<28} {account_line(d, False)}")
            if o:
                others.append(f"  {'':<34} {o.get('subscriptionType', '?')}/{o.get('rateLimitTier', '?')} · access {when(o.get('expiresAt'))}")
    if others:
        out.append("other stored logins on this machine (not used by this session)")
        out.extend(others)

    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
