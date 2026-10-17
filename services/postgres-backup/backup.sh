#!/bin/sh
set -eu

PGHOST=${PGHOST:-postgres}
PGPORT=${PGPORT:-5432}
PGDATABASE=${PGDATABASE:-lunavo}
PGUSER=${PGUSER:-lunavo}
BACKUP_DIR=${BACKUP_DIR:-/backups}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
BACKUP_INTERVAL_SECONDS=${BACKUP_INTERVAL_SECONDS:-86400}
export PGHOST PGPORT PGDATABASE PGUSER

case "$BACKUP_RETENTION_DAYS" in
  ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2; exit 2 ;;
esac
case "$BACKUP_INTERVAL_SECONDS" in
  ''|*[!0-9]*) echo "BACKUP_INTERVAL_SECONDS must be a positive integer" >&2; exit 2 ;;
esac
if [ "$BACKUP_RETENTION_DAYS" -lt 1 ] || [ "$BACKUP_INTERVAL_SECONDS" -lt 60 ]; then
  echo "Retention must be at least one day and backup interval at least 60 seconds" >&2
  exit 2
fi

umask 077
mkdir -p "$BACKUP_DIR"

log() { printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

while :; do
  timestamp=$(date -u '+%Y%m%dT%H%M%SZ')
  final_file="$BACKUP_DIR/lunavo-$timestamp.dump"
  temporary_file="$final_file.partial"

  log "Starting PostgreSQL backup for database $PGDATABASE"
  if pg_dump --format=custom --no-owner --no-privileges --file="$temporary_file"; then
    if pg_restore --list "$temporary_file" >/dev/null 2>&1; then
      mv "$temporary_file" "$final_file"
      printf '%s\n' "$timestamp" > "$BACKUP_DIR/.last-success.tmp"
      mv "$BACKUP_DIR/.last-success.tmp" "$BACKUP_DIR/.last-success"
      find "$BACKUP_DIR" -maxdepth 1 -type f -name 'lunavo-*.dump' -mtime "+$BACKUP_RETENTION_DAYS" -delete
      log "Backup completed and archive validated: $(basename "$final_file")"
      sleep "$BACKUP_INTERVAL_SECONDS"
    else
      rm -f "$temporary_file"
      log "ERROR: pg_restore could not read the generated archive; retrying in 300 seconds"
      sleep 300
    fi
  else
    rm -f "$temporary_file"
    log "ERROR: pg_dump failed; no successful backup was recorded; retrying in 300 seconds"
    sleep 300
  fi
done
