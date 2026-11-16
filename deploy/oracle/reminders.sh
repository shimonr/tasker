#!/usr/bin/env bash
# Sends chore reminders for one environment. Cron runs it hourly (see bootstrap.sh).
# It runs inside the backend container, so the reminder token never leaves the server.
# Usage: reminders.sh prod|qa
set -euo pipefail

ENV_NAME=${1:?usage: reminders.sh prod|qa}
docker exec "tasker-$ENV_NAME-backend-1" python -c '
import os, urllib.request
request = urllib.request.Request(
    "http://127.0.0.1:8000/api/internal/reminders",
    method="POST",
    headers={"X-Reminder-Token": os.environ["REMINDER_TOKEN"]},
)
print(urllib.request.urlopen(request, timeout=60).read().decode())
'
