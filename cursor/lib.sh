# Shared by cursor/install.sh and cursor/start.sh. Sourced, not run.
#
# A repo's adapter lives in cursor/repos/<owner>__<repo>/adapter.sh, named from
# the checkout's origin URL (github.com/acme/web-app -> acme__web-app). It may set
#   DATABASES="a_db b_db"   databases start.sh creates on this machine's own PostgreSQL
# and define
#   adapter_install         the repo's dependency install, run from the repo root
# A repo without an adapter gets neither.

CURSOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"

repo_key() {
  git -C "$REPO_ROOT" remote get-url origin \
    | sed -E 's#^.*github\.com[:/]##; s#\.git$##; s#/$##; s#/#__#'
}

DATABASES=""
ADAPTER_DIR="$CURSOR_DIR/repos/$(repo_key)"
if [ -f "$ADAPTER_DIR/adapter.sh" ]; then
  # shellcheck source=/dev/null
  . "$ADAPTER_DIR/adapter.sh"
fi
