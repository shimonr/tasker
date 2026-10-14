# Oracle Cloud deployment (prod + qa)

Both environments run on one Oracle Cloud **Always Free** VM (Ampere A1 or AMD micro, Ubuntu or Oracle Linux)
with Docker. Each environment has its own PostgreSQL database, API and web container; a shared Caddy proxy
terminates HTTPS with automatic Let's Encrypt certificates.

```
                  ┌──────────────── Oracle VM ────────────────┐
 https://prod ──▶ │ Caddy :443 ─▶ tasker-prod: web ─▶ api ─▶ db │
 https://qa   ──▶ │            └▶ tasker-qa:   web ─▶ api ─▶ db │
                  └──────────────────────────────────────────┘
 failover:  Vercel (web) ─▶ Railway (api + db)   ◀── nightly copy of prod data
```

## One-time setup

1. **Create the VM** (Ubuntu 22.04/24.04 recommended) and note its public IP.
   In *Networking → Virtual cloud network → Security list*, add ingress rules for **TCP 80 and 443** from `0.0.0.0/0`.
2. **Optional DNS:** point two names (for example `tasks.example.com` and `qa.tasks.example.com`) at the IP.
   Without your own domain the scripts use free `sslip.io` names such as `tasker.<ip>.sslip.io`.
3. **Bootstrap the server** (installs Docker, opens the host firewall, adds swap on small shapes, creates
   `/opt/tasker/{prod,qa,edge}.env` with random secrets and schedules nightly backups):

   ```bash
   scp deploy/oracle/bootstrap.sh ubuntu@<ip>:
   ssh ubuntu@<ip> 'sudo bash bootstrap.sh tasks.example.com qa.tasks.example.com'   # or no args for sslip.io
   ```

   It prints the generated admin passwords. They are also in `/opt/tasker/prod.env` and `qa.env`.
4. **Brevo:** in Brevo create an API key (*SMTP & API → API keys*) and verify a sender address
   (*Senders, domains & dedicated IPs*). Put them in `/opt/tasker/prod.env` and `/opt/tasker/qa.env`:

   ```
   BREVO_API_KEY=xkeysib-...
   EMAIL_SENDER_ADDRESS=hello@your-domain.com
   ```

   On QA also set `EMAIL_OVERRIDE_RECIPIENT=you@example.com` so test emails never reach real people.
5. **GitHub:** create a deploy key pair (`ssh-keygen -t ed25519 -f tasker-deploy -N ''`), append
   `tasker-deploy.pub` to `~/.ssh/authorized_keys` on the server, then add these **repository secrets**
   (or per-environment secrets in the `oracle-prod` / `oracle-qa` environments):

   | Secret | Value |
   | --- | --- |
   | `ORACLE_HOST` | Server IP or hostname |
   | `ORACLE_USER` | SSH user (usually `ubuntu` or `opc`) |
   | `ORACLE_SSH_KEY` | Contents of the private key `tasker-deploy` |
   | `ORACLE_KNOWN_HOSTS` | Optional: output of `ssh-keyscan <ip>` (pins the host key) |
   | `RAILWAY_DATABASE_URL` | Railway PostgreSQL *public* URL, for the failover sync |

   Optionally set an `APP_URL` **environment variable** in each GitHub environment (for example
   `https://tasks.example.com`) so the deploy job runs a smoke test.
6. **Deploy:** push to `master` (prod) or create and push a `qa` branch (QA). The *CI/CD* workflow runs all
   tests, uploads the code and runs `deploy.sh` on the server.

## Day to day

- Promote to QA: `git push origin HEAD:qa`. Release to prod: merge to `master`.
- Logs: `docker logs -f tasker-prod-backend-1` (or `-web-1`, `-db-1`, `tasker-edge-caddy-1`).
- Change configuration: edit `/opt/tasker/<env>.env`, then re-run the workflow or `bash /opt/tasker/src/<env>/deploy/oracle/deploy.sh <env>`.
- Backups: `/opt/tasker/backups/prod-*.sql.gz` (nightly, 14 days). Manual: `bash /opt/tasker/src/prod/deploy/oracle/backup.sh prod`.
- Restore a backup: `gunzip -c <file> | docker exec -i tasker-prod-db-1 psql -U tasker -d tasker`.

## Failover to Railway + Vercel

The existing Railway (API) and Vercel (frontend) deployment keeps auto-deploying `master`. The
*Failover database sync* workflow copies the Oracle prod database to Railway every night at 02:30 UTC.

Railway variables to set once: `APP_ENV=failover`, `APP_BASE_URL=<your Vercel URL>`, `FRONTEND_ORIGIN=<your Vercel URL>`,
`TASKER_SECRET_KEY` (32+ random characters), `BREVO_API_KEY`, `EMAIL_SENDER_ADDRESS`.

**When Oracle is down:**
1. Set the repository variable `FAILOVER_ACTIVE` to `true` (*Settings → Secrets and variables → Actions → Variables*)
   so the nightly copy cannot overwrite what families do on Railway.
2. Send the family to the Vercel URL. If you use your own domain, point it at Vercel instead.

**When Oracle is back:**
1. Run *Failover database sync* manually with direction **railway-to-oracle**. It backs up the Oracle
   database first, then copies Railway's data over.
2. Switch DNS/users back to Oracle and set `FAILOVER_ACTIVE` to `false`.
