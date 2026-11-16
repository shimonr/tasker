#!/usr/bin/env bash
# Copies the newest nightly database dump of one environment to an Oracle Object Storage bucket
# (its S3-compatible API, via rclone) and deletes copies older than 14 days.
# Needs $TASKER_ROOT/offsite.env (chmod 600) with rclone settings for the remote "oci":
#   BACKUP_BUCKET=family-chores-prod
#   RCLONE_CONFIG_OCI_TYPE=s3
#   RCLONE_CONFIG_OCI_PROVIDER=Other
#   RCLONE_CONFIG_OCI_ENDPOINT=https://<namespace>.compat.objectstorage.<region>.oraclecloud.com
#   RCLONE_CONFIG_OCI_ACCESS_KEY_ID=...
#   RCLONE_CONFIG_OCI_SECRET_ACCESS_KEY=...
# Usage: offsite-backup.sh prod|qa
set -euo pipefail

ENV_NAME=${1:?usage: offsite-backup.sh prod|qa}
ROOT=${TASKER_ROOT:-/opt/tasker}
ENV_FILE="$ROOT/offsite.env"
[ -f "$ENV_FILE" ] || { echo "off-site backup not configured: missing $ENV_FILE" >&2; exit 1; }
BUCKET=$(sed -n 's/^BACKUP_BUCKET=//p' "$ENV_FILE")
[ -n "$BUCKET" ] || { echo "BACKUP_BUCKET is not set in $ENV_FILE" >&2; exit 1; }

LATEST=$(ls -t "$ROOT/backups/$ENV_NAME-"*.sql.gz 2>/dev/null | head -1)
[ -n "$LATEST" ] || { echo "no $ENV_NAME dump in $ROOT/backups (run backup.sh first)" >&2; exit 1; }

# Credentials come from the env file, so they never appear in the process list.
rclone() {
  docker run --rm --network host --env-file "$ENV_FILE" -v "$ROOT/backups:/backups:ro" rclone/rclone:latest "$@"
}
rclone copy "/backups/$(basename "$LATEST")" "oci:$BUCKET/$ENV_NAME/"
rclone delete "oci:$BUCKET/$ENV_NAME/" --min-age 14d
echo "copied $(basename "$LATEST") to $BUCKET/$ENV_NAME/"
