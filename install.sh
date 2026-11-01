#!/usr/bin/env bash
# Install personal Claude Code config into a Conductor CLOUD workspace (Linux
# sandbox), where the Mac's ~/.claude-personal/{commands,agents} symlinks into
# /Users/... cannot resolve. Driven by the repo-scope SessionStart hook in
# .claude/settings.local.json, so it runs on every cloud session start.
#
#   commands agents skills workflows -> $CLAUDE_CONFIG_DIR/<dir>
#   agent-shared/                    -> ~/.agent-shared/  (workflow docs the skills read, wiki schema)
#   bd (beads) $BD_VERSION           -> ~/.local/bin/bd (+ /usr/local/bin/bd), then bootstrap or
#                                       pull the repo's beads database when origin carries refs/dolt/data
#   $PLUGINS (Claude Code plugins)   -> installed or updated at user scope in $CLAUDE_CONFIG_DIR
#
# Each step is isolated: a failure warns and the next step still runs.
set -uo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
WORKSPACE_DIR="${WORKSPACE_DIR:-$PWD}"
BD_VERSION="${BD_VERSION:-1.3.1}"

# Keep in sync with sync-from-mac.sh.
DIRS="commands agents skills workflows"

# Plugins to install from GitHub marketplaces, one "<plugin>@<marketplace>=<owner/repo>"
# per entry. Plugins are not mirrored from the Mac; list each one here.
PLUGINS="pstack@pstack-claude=michael-denyer/pstack-claude"

warn() { echo "install.sh: WARNING $*" >&2; }

# On macOS these paths ARE the source of truth (usually symlinked into
# ~/.claude-personal). Copying over them would clobber the originals.
if [ "$(uname -s)" = "Darwin" ] && [ "${FORCE_INSTALL:-0}" != "1" ]; then
  echo "install.sh: refusing to run on macOS (local files are the source of truth)."
  echo "            set FORCE_INSTALL=1 to override."
  exit 0
fi

# Conductor forwards the Mac's CLAUDE_CONFIG_DIR (a /Users/... path) into the
# sandbox verbatim. Claude Code creates it there when it can; if we cannot,
# fall back to the default config dir.
if ! mkdir -p "$DEST" 2>/dev/null; then
  warn "cannot create $DEST; using $HOME/.claude"
  DEST="$HOME/.claude"
  mkdir -p "$DEST"
fi

# Drop symlinks whose target does not exist here. sync-from-mac.sh dereferences
# symlinks so the repo should hold real files, but a config dir populated by an
# older install can still contain dangling links (e.g. skills/lavish pointing at
# ~/.agents on the Mac). Left in place they break the copy outright: cp refuses to
# overwrite a non-directory with a directory.
prune_dangling() {
  find "$1" -type l ! -exec test -e {} \; -print 2>/dev/null | while IFS= read -r link; do
    warn "dropping dangling symlink ${link#$DEST/}"
    rm -f "$link"
  done
}

# Entries this script installed last time, one "<dir>/<name>" per line. Anything
# listed there that the mirror no longer carries gets removed, so deleting a
# skill on the Mac deletes it in the sandbox too. Entries installed by other
# means (org setup scripts, plugins) are never touched.
MANIFEST="$DEST/.local-agent-commands-manifest"
# Removed from the mirror before the manifest existed; old sandboxes still have them.
LEGACY_REMOVED="skills/gastown"

install_config_dirs() {
  local dir count entry name new_manifest
  new_manifest="$(mktemp)"
  for dir in $DIRS; do
    [ -d "$SRC/$dir" ] || continue
    mkdir -p "$DEST/$dir"
    prune_dangling "$DEST/$dir"   # clear stale links so the copy can land
    cp -R "$SRC/$dir/." "$DEST/$dir/" || { warn "copy of $dir failed"; continue; }
    prune_dangling "$DEST/$dir"   # and any the copy brought in
    count=$(find "$SRC/$dir" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')
    echo "install.sh: $dir -> $DEST/$dir ($count item(s))"
    for entry in "$SRC/$dir"/* "$SRC/$dir"/.[!.]*; do
      [ -e "$entry" ] || continue
      echo "$dir/$(basename "$entry")" >> "$new_manifest"
    done
  done
  # Remove what we installed before but the mirror dropped since.
  { [ -f "$MANIFEST" ] && cat "$MANIFEST"; printf '%s\n' $LEGACY_REMOVED; } | sort -u | while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    case "$entry" in */*) ;; *) continue ;; esac   # defensive: never rm a top-level dir
    if ! grep -qxF "$entry" "$new_manifest" && [ -e "$DEST/$entry" ]; then
      rm -rf "${DEST:?}/$entry"
      echo "install.sh: removed stale $entry"
    fi
  done
  mv "$new_manifest" "$MANIFEST"
}

# --- Shared workflow docs --------------------------------------------------
# Commands, skills and agents read ~/.agent-shared/docs/*.md; synthesize-learnings
# reads ~/.agent-shared/wiki/SCHEMA.md. Only those files ship; the wiki's pages
# stay on the machine that wrote them.
install_shared_docs() {
  [ -d "$SRC/agent-shared" ] || return 0
  mkdir -p "$HOME/.agent-shared"
  cp -R "$SRC/agent-shared/." "$HOME/.agent-shared/" || return 1
  echo "install.sh: agent-shared -> $HOME/.agent-shared"
}

# --- beads (bd) -------------------------------------------------------------
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | sed 's/.*= //'
  else python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$1"
  fi
}

ensure_path_line() {
  local rc="$1" line='export PATH="$HOME/.local/bin:$PATH"'
  touch "$rc"
  grep -qF "$line" "$rc" 2>/dev/null || printf '\n# local-agent-commands: bd lives here\n%s\n' "$line" >> "$rc"
}

install_bd() {
  local current
  current="$("$HOME/.local/bin/bd" version 2>/dev/null | grep -o -E '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
  if [ "$current" = "$BD_VERSION" ]; then
    echo "install.sh: bd $BD_VERSION already at $HOME/.local/bin/bd"
    return 0
  fi
  local os arch
  case "$(uname -s)" in Linux) os=linux ;; *) return 0 ;; esac
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) warn "unsupported arch $(uname -m); skipping bd"; return 0 ;;
  esac
  local base="https://github.com/gastownhall/beads/releases/download/v${BD_VERSION}"
  local asset="beads_${BD_VERSION}_${os}_${arch}.tar.gz"
  local tmp; tmp="$(mktemp -d)"
  if ! curl -fsSL -o "$tmp/$asset" "$base/$asset" || ! curl -fsSL -o "$tmp/checksums.txt" "$base/checksums.txt"; then
    warn "could not download bd $BD_VERSION (continuing without beads)"
    rm -rf "$tmp"; return 1
  fi
  local want have
  want="$(grep " $asset\$" "$tmp/checksums.txt" | cut -d' ' -f1)"
  have="$(sha256_of "$tmp/$asset")"
  if [ -z "$want" ] || [ "$want" != "$have" ]; then
    warn "bd checksum mismatch (want ${want:-?}, have $have); not installing"
    rm -rf "$tmp"; return 1
  fi
  tar -xzf "$tmp/$asset" -C "$tmp" bd || { warn "bd extract failed"; rm -rf "$tmp"; return 1; }
  mkdir -p "$HOME/.local/bin"
  install -m 755 "$tmp/bd" "$HOME/.local/bin/bd" || { warn "bd install failed"; rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"
  # Reachable from non-login shells too (Claude's Bash tool, hooks).
  [ -w /usr/local/bin ] && ln -sf "$HOME/.local/bin/bd" /usr/local/bin/bd
  ensure_path_line "$HOME/.bashrc"
  ensure_path_line "$HOME/.profile"
  echo "install.sh: bd $BD_VERSION -> $HOME/.local/bin/bd"
}

# Bootstrap (fresh clone) or pull (existing) the repo's beads database. Only
# repos whose origin carries refs/dolt/data get one (and the bd binary);
# everything else is a no-op.
setup_beads() {
  local repo
  repo="$(git -C "$WORKSPACE_DIR" rev-parse --show-toplevel 2>/dev/null)" || return 0
  # Only pay for the bd download in repos that actually use beads.
  if [ ! -d "$repo/.beads" ] && ! git -C "$repo" ls-remote --exit-code origin refs/dolt/data >/dev/null 2>&1; then
    return 0
  fi
  install_bd || return 1
  [ -x "$HOME/.local/bin/bd" ] || return 1
  export PATH="$HOME/.local/bin:$PATH"
  if [ -d "$repo/.beads" ]; then
    if (cd "$repo" && bd dolt pull >/dev/null 2>&1); then
      echo "install.sh: beads pulled from origin"
    else
      warn "bd dolt pull failed (continuing with the local copy)"
    fi
    return 0
  fi
  if (cd "$repo" && bd bootstrap --yes >/dev/null 2>&1); then
    chmod 700 "$repo/.beads"
    git -C "$repo" config beads.role maintainer
    echo "install.sh: beads bootstrapped from origin refs/dolt/data ($(cd "$repo" && bd --readonly list --json 2>/dev/null | grep -o '"id"' | wc -l | tr -d ' ') issue(s))"
  else
    warn "bd bootstrap failed (run 'bd bootstrap --yes' in $repo to retry)"
    return 1
  fi
}

# --- Claude Code plugins ----------------------------------------------------
# The first install lands after Claude Code has loaded its plugins, so it takes
# effect from the next session in this workspace. Later runs pull updates.
install_plugins() {
  command -v claude >/dev/null 2>&1 || { warn "claude CLI not on PATH; skipping plugins"; return 0; }
  local spec id marketplace repo failed=0
  for spec in $PLUGINS; do
    id="${spec%%=*}"; repo="${spec#*=}"; marketplace="${id#*@}"
    if ! CLAUDE_CONFIG_DIR="$DEST" claude plugin marketplace list 2>/dev/null | grep -qw "$marketplace"; then
      CLAUDE_CONFIG_DIR="$DEST" claude plugin marketplace add "$repo" >/dev/null 2>&1 \
        || { warn "could not add marketplace $repo"; failed=1; continue; }
    fi
    if CLAUDE_CONFIG_DIR="$DEST" claude plugin list 2>/dev/null | grep -qF "$id"; then
      CLAUDE_CONFIG_DIR="$DEST" claude plugin marketplace update "$marketplace" >/dev/null 2>&1
      CLAUDE_CONFIG_DIR="$DEST" claude plugin update "$id" --scope user >/dev/null 2>&1 \
        || { warn "could not update $id"; failed=1; continue; }
      echo "install.sh: plugin $id up to date"
    else
      CLAUDE_CONFIG_DIR="$DEST" claude plugin install "$id" --scope user >/dev/null 2>&1 \
        || { warn "could not install $id"; failed=1; continue; }
      echo "install.sh: plugin $id installed (loads from the next session)"
    fi
  done
  return "$failed"
}

install_config_dirs || warn "config dirs step failed"
install_shared_docs || warn "shared docs step failed"
setup_beads         || warn "beads step failed"
install_plugins     || warn "plugins step failed"
echo "install.sh: done."
