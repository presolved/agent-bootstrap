# Cloud-agent adapter for presolved/iem-planning-augmentation. Sourced by
# cursor/lib.sh. Launch mechanics only: values come from the repo at run time.

DATABASES="planning_db proposals_db"

adapter_install() {
  yarn install --frozen-lockfile
  yarn prepare                                   # git hooks: pre-commit formatting
  # Chromium for the repo's verify skill and e2e suite; --with-deps installs its
  # system libraries through apt, so only where apt exists (Cursor's Ubuntu VMs).
  if command -v apt-get >/dev/null 2>&1; then
    npx playwright install --with-deps chromium
  else
    npx playwright install chromium
  fi
}
