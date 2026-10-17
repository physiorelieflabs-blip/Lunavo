#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
TMP_ROOT=$(mktemp -d)
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM
MOCK_BIN="$TMP_ROOT/bin"
BACKUP_DIR="$TMP_ROOT/backups"
mkdir -p "$MOCK_BIN" "$BACKUP_DIR"

cat > "$MOCK_BIN/pg_dump" <<'MOCK'
#!/bin/sh
set -eu
for arg in "$@"; do
  case "$arg" in
    --file=*) output=${arg#--file=} ;;
  esac
done
[ -n "${output:-}" ]
printf 'mock PostgreSQL archive\n' > "$output"
MOCK

cat > "$MOCK_BIN/pg_restore" <<'MOCK'
#!/bin/sh
set -eu
[ "$1" = "--list" ]
[ -s "$2" ]
MOCK

cat > "$MOCK_BIN/sleep" <<'MOCK'
#!/bin/sh
# Stop the otherwise continuous scheduler after the first cycle.
exit 99
MOCK

chmod 0755 "$MOCK_BIN/pg_dump" "$MOCK_BIN/pg_restore" "$MOCK_BIN/sleep"

set +e
PATH="$MOCK_BIN:$PATH" BACKUP_DIR="$BACKUP_DIR" BACKUP_INTERVAL_SECONDS=60 BACKUP_RETENTION_DAYS=14 sh "$ROOT/backup.sh" >/dev/null 2>&1
status=$?
set -e

# The mock sleep exits with 99 after a successful backup. The dump and atomic
# success marker must exist, and partial artifacts must not be retained.
[ "$status" -eq 99 ]
set -- "$BACKUP_DIR"/lunavo-*.dump
[ -f "$1" ]
[ -s "$BACKUP_DIR/.last-success" ]
[ ! -e "$1.partial" ]
echo "PostgreSQL backup worker smoke test: PASS"
