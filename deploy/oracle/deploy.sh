#!/usr/bin/env bash
# Build and (re)start one environment on the Oracle server.
# Usage: deploy.sh prod|qa
# Run from the synced checkout (CI does this over SSH). Env files live in $TASKER_ROOT (default /opt/tasker).
set -euo pipefail

ENV_NAME=${1:-}
case "$ENV_NAME" in
  prod | qa) ;;
  *) echo "usage: $0 prod|qa" >&2; exit 2 ;;
esac

ROOT=${TASKER_ROOT:-/opt/tasker}
HERE=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$ROOT/$ENV_NAME.env"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (run bootstrap.sh first)" >&2; exit 1; }
[ -f "$ROOT/edge.env" ] || { echo "missing $ROOT/edge.env (run bootstrap.sh first)" >&2; exit 1; }

docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null

echo "==> Starting the HTTPS proxy"
docker compose -f "$HERE/edge/docker-compose.yml" --env-file "$ROOT/edge.env" up -d
docker compose -f "$HERE/edge/docker-compose.yml" --env-file "$ROOT/edge.env" exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null

echo "==> Building and starting tasker-$ENV_NAME"
docker compose -f "$HERE/docker-compose.yml" --env-file "$ENV_FILE" up -d --build --remove-orphans --wait --wait-timeout 300

echo "==> Health check"
docker exec "tasker-$ENV_NAME-web-1" wget -qO- http://127.0.0.1/api/health
echo

docker image prune -f >/dev/null
echo "==> tasker-$ENV_NAME is up"
