#!/usr/bin/env bash
# One-time setup of an Oracle Cloud (Always Free) VM for the prod + qa environments.
#
# Usage (on the server):  sudo bash bootstrap.sh [prod-domain] [qa-domain]
# Without domains it uses free sslip.io names based on the public IP, e.g. tasker.1.2.3.4.sslip.io.
#
# Safe to re-run: existing env files and secrets are kept.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }
DEPLOY_USER=${SUDO_USER:-ubuntu}
ROOT=${TASKER_ROOT:-/opt/tasker}

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
usermod -aG docker "$DEPLOY_USER"
command -v rsync >/dev/null || { apt-get install -y rsync 2>/dev/null || dnf install -y rsync; }

echo "==> Firewall: allow HTTP/HTTPS (also open 80 and 443 in the VCN security list!)"
if command -v firewall-cmd >/dev/null && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http --add-service=https && firewall-cmd --reload
fi
if command -v iptables >/dev/null; then
  # Oracle's Ubuntu images end the INPUT chain with a REJECT rule; insert ACCEPTs before it.
  for port in 80 443; do
    if ! iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
      reject_line=$(iptables -L INPUT --line-numbers | awk '$2 == "REJECT" {print $1; exit}')
      iptables -I INPUT "${reject_line:-1}" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    fi
  done
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save; fi
fi

echo "==> Swap (helps 1 GB shapes build images)"
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 3000000 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "==> Directories and configuration in $ROOT"
mkdir -p "$ROOT/src/prod" "$ROOT/src/qa" "$ROOT/backups"
PUBLIC_IP=$(curl -fsS --max-time 5 https://ifconfig.me || hostname -I | awk '{print $1}')
PROD_DOMAIN=${1:-tasker.$PUBLIC_IP.sslip.io}
QA_DOMAIN=${2:-qa.tasker.$PUBLIC_IP.sslip.io}

write_env() { # name domain
  local file="$ROOT/$1.env"
  [ -f "$file" ] && return
  local admin_password
  admin_password=$(openssl rand -base64 18 | tr -d '/+=')
  cat >"$file" <<EOF
# Family Task Manager - $1. Edit, then re-run the deploy workflow (or deploy.sh $1).
TASKER_ENV=$1
APP_DOMAIN=$2
POSTGRES_PASSWORD=$(openssl rand -hex 24)
TASKER_SECRET_KEY=$(openssl rand -hex 32)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=$admin_password

# Brevo (https://app.brevo.com > SMTP & API > API keys). The sender must be verified in Brevo.
BREVO_API_KEY=
EMAIL_SENDER_ADDRESS=
EMAIL_SENDER_NAME=Family Task Adventure
EOF
  if [ "$1" = qa ]; then
    printf '# QA: send every email to this address instead of real users.\nEMAIL_OVERRIDE_RECIPIENT=\n' >>"$file"
  fi
  echo "    created $file (the admin password is in that file)"
}
write_env prod "$PROD_DOMAIN"
write_env qa "$QA_DOMAIN"
chmod 600 "$ROOT"/*.env
chown -R "$DEPLOY_USER": "$ROOT"

echo "==> Nightly prod database backup at 03:15 UTC"
echo "15 3 * * * $DEPLOY_USER bash $ROOT/src/prod/deploy/oracle/backup.sh prod >/dev/null 2>&1" >/etc/cron.d/tasker-backup

cat <<EOF

Done. Next steps:
  1. In the Oracle console, add ingress rules for TCP 80 and 443 to the VCN security list.
  2. Point DNS for $PROD_DOMAIN and $QA_DOMAIN at $PUBLIC_IP (not needed for sslip.io names).
  3. Add your Brevo key and sender to $ROOT/prod.env and $ROOT/qa.env.
  4. Push to 'master' (prod) or 'qa' to deploy, or run the "CI/CD" workflow manually.
EOF
