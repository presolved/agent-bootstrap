#!/usr/bin/env bash
# Cursor cloud agent install step. Run it from the repo root after cloning this
# repo to ~/.agent-bootstrap (see cursor/orchestrator.md, "One-time setup").
# Cursor runs install when it builds the environment and may rerun it on the
# disk state a build left behind, so every step is idempotent. Processes started
# here do not survive into an agent run; start.sh starts them.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_ROOT"

if [ -n "$DATABASES" ]; then
  if command -v initdb >/dev/null 2>&1 || compgen -G '/usr/lib/postgresql/*/bin/initdb' >/dev/null; then
    echo "install: PostgreSQL server binaries present"
  else
    echo "install: installing PostgreSQL"
    sudo apt-get update -q
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -q postgresql
  fi
fi

if declare -F adapter_install >/dev/null; then
  echo "install: $(repo_key) adapter"
  adapter_install
else
  echo "install: no adapter for $(repo_key); nothing repo-specific to install"
fi
echo "install: done"
