#!/usr/bin/env bash
# Cursor cloud agent start step, and safe to rerun by hand: start this machine's
# own PostgreSQL and create the adapter's DATABASES.
#
# Every agent gets its own database server. Agents must never share one: an app
# with background workers (pg-boss and the like) takes jobs from any server on the
# same database and runs them with that server's code.
#
# The cluster belongs to the agent's user and trusts local connections, so
# postgresql://postgres:postgres@localhost:<port>/<db> works without sudo.
#
#   AGENT_PGDATA   cluster directory (default ~/.local/share/agent-pg)
#   AGENT_PGPORT   port (default 5432)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ -n "$DATABASES" ] || { echo "start: $(repo_key) needs no database"; exit 0; }

PGDATA="${AGENT_PGDATA:-$HOME/.local/share/agent-pg}"
PGPORT="${AGENT_PGPORT:-5432}"

if command -v initdb >/dev/null 2>&1; then
  BIN="$(dirname "$(command -v initdb)")"
else
  BIN="$(compgen -G '/usr/lib/postgresql/*/bin' | sort -V | tail -1 || true)"
  [ -n "$BIN" ] || { echo "start: no PostgreSQL server binaries; run cursor/install.sh" >&2; exit 1; }
fi

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "start: initializing $PGDATA"
  mkdir -p "$PGDATA"
  "$BIN/initdb" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 >/dev/null
fi

if "$BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  echo "start: PostgreSQL already running"
else
  "$BIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/server.log" -w \
    -o "-p $PGPORT -k /tmp -c listen_addresses=localhost" start >/dev/null
  echo "start: PostgreSQL on port $PGPORT (log $PGDATA/server.log)"
fi

for db in $DATABASES; do
  if [ "$("$BIN/psql" -h localhost -p "$PGPORT" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'")" != 1 ]; then
    "$BIN/psql" -h localhost -p "$PGPORT" -U postgres -qc "CREATE DATABASE $db"
    echo "start: created $db"
  fi
done
echo "start: databases ($DATABASES) at postgresql://postgres:postgres@localhost:$PGPORT/<db>"
