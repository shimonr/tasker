#!/usr/bin/env bash
# Dump one environment's database to $TASKER_ROOT/backups and keep the last $KEEP_DAYS days.
# Usage: backup.sh prod|qa   (bootstrap.sh schedules this nightly for prod)
set -euo pipefail

ENV_NAME=${1:-prod}
ROOT=${TASKER_ROOT:-/opt/tasker}
KEEP_DAYS=${KEEP_DAYS:-14}
mkdir -p "$ROOT/backups"
OUT="$ROOT/backups/$ENV_NAME-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

docker exec "tasker-$ENV_NAME-db-1" pg_dump -U tasker --clean --if-exists --no-owner --no-privileges tasker | gzip >"$OUT"
find "$ROOT/backups" -name "$ENV_NAME-*.sql.gz" -mtime "+$KEEP_DAYS" -delete
echo "$OUT"
