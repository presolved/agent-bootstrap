---
name: auth-info
description: Show which Claude Code credential the current session is using (env key, apiKeyHelper, setup-token, or stored /login OAuth), which account and plan it belongs to, token expiry, and the other logins stored on the machine. Use when asked "which auth token / account / login are we using", "am I on the team or personal account", or when a 401 / login-expired error needs diagnosing.
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/claude-auth-info.py *)
---

# Claude Code auth info

Output of `claude-auth-info.py` for this session (tokens are redacted to type prefix + length):

```
!`python3 "${CLAUDE_SKILL_DIR}/scripts/claude-auth-info.py" 2>&1`
```

Relay the block above to the user as-is inside a fenced code block, then add at most two sentences: which source is active and which account that is. If the block is empty or shows an error, run the same script with Bash and relay that instead.

The script follows the documented precedence (cloud provider flags → `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_API_KEY` → `apiKeyHelper` → `CLAUDE_CODE_OAUTH_TOKEN` → Anthropic profile / federation → stored `/login` OAuth). Stored logins live in the macOS Keychain as `Claude Code-credentials` for the default config dir, or `Claude Code-credentials-<sha256(CLAUDE_CONFIG_DIR)[:8]>` for a custom one; on Linux and as a macOS fallback they live in `<config dir>/.credentials.json`. Account identity comes from `<config dir>/.claude.json` (`~/.claude.json` for the default dir).
