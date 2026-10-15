# Family Task Adventure 🎈

A cheerful family chore app: parents create tasks, kids complete them and collect stars ⭐, admins manage the family.
React + TypeScript (Vite, Tailwind) frontend and a FastAPI + SQLAlchemy backend.

- Release: **0.4**

## Features

- **Kids** see their missions grouped by kind, tap “I did it!” (with confetti 🎉), earn stars by priority
  (🌱 1, 🌟 2, 🔥 3), and keep a daily streak 🔥. Finished tasks sink to the bottom.
- **Parents** create one-time, repeating (daily/weekly/monthly/yearly) and taking-turns tasks, edit them,
  change statuses, see a status log, pass rotating chores to the next kid and follow a star leaderboard.
- **Admins** add, edit and remove family members and reset passwords.
- **Email via Brevo**: welcome emails, self-service “Forgot password” links, “new task”/“your turn” emails
  for kids and “task finished” emails for parents.
- **Mobile first**: responsive layouts, big touch targets, bottom-sheet dialogs, installable as an app (PWA manifest).
- **Security**: hashed passwords only (no plaintext copies), sessions revoked on password change, login and
  reset rate limits, strict security headers, role and ownership checks on every endpoint.

## Project layout

- `backend/` – FastAPI API (`app/`), tests (`tests/`, 100% line + branch coverage enforced)
- `frontend/` – Vite React app (`src/`), tests next to the code (100% coverage enforced)
- `deploy/oracle/` – production (prod + qa) on an Oracle Cloud Always Free VM → [deploy/oracle/README.md](deploy/oracle/README.md)
- `.github/workflows/ci-cd.yml` – tests on every push/PR, then deploys `master` → prod and `qa` → QA

## Local development

Backend (Python 3.12):

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
ADMIN_PASSWORD=choose-a-password uvicorn app.main:app --reload --port 8000
```

Frontend (Node 20+), in another terminal. Vite proxies `/api` to `http://localhost:8000`:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in as `admin` with the password you chose. If you don't set
`ADMIN_PASSWORD`, a random one is generated and printed in the backend log on first start.

Production-like stack with Docker: `docker compose up --build`, then open http://localhost:8080
(admin password: `change-me-please`, or set `ADMIN_PASSWORD`).

## Tests

```bash
cd backend && pytest            # SQLite, fails below 100% coverage
TEST_DATABASE_URL=postgresql://user:pass@localhost/tasker_test pytest --no-cov   # against PostgreSQL
cd frontend && npm test         # Vitest, fails below 100% coverage
```

## Configuration (backend environment variables)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy URL. Default `sqlite:///./tasker.db`; `postgres://` URLs are accepted. |
| `TASKER_SECRET_KEY` | JWT signing key (use 32+ random characters). If unset, a random key is generated and stored in the database. |
| `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Bootstrap admin. `ADMIN_PASSWORD` also works as a break-glass reset. |
| `FRONTEND_ORIGIN` | Allowed CORS origin(s), comma separated (only needed when the frontend is on another domain). |
| `APP_BASE_URL` | Public URL of the frontend, used in email links. |
| `APP_ENV` | Shown by `/api/health` (`prod`, `qa`, …). |
| `BREVO_API_KEY` | Brevo API key (`xkeysib-…`, REST API) or SMTP key (`xsmtpsib-…`, sent via `smtp-relay.brevo.com`). Without it emails are logged and skipped. |
| `BREVO_SMTP_LOGIN` | Only for SMTP keys: the SMTP login from Brevo (*SMTP & API → SMTP*). Defaults to `EMAIL_SENDER_ADDRESS`. |
| `EMAIL_SENDER_ADDRESS`, `EMAIL_SENDER_NAME` | Sender; the address must be a verified sender in Brevo. |
| `EMAIL_OVERRIDE_RECIPIENT` | Send every email to this address instead (use on QA). |

Frontend build variable: `VITE_API_BASE_URL` – API base URL when the API is on another domain.
Defaults to same-origin `/api`.

## Deployment

Oracle Cloud (prod + qa): pushes to `master` deploy prod and pushes to `qa` deploy QA, after all tests pass.
One-time setup: [deploy/oracle/README.md](deploy/oracle/README.md). The old Railway + Vercel deployment is retired;
`frontend/vercel.json` only turns off Vercel's automatic Git deployments.

## API overview

All endpoints are under `/api`.

- `GET /health` · `POST /token` · `GET /me`
- `POST /auth/forgot-password` · `POST /auth/reset-password`
- Admin: `GET|POST /admin/users` · `PUT|DELETE /admin/users/{id}` · `POST /admin/reset-password`
- Parent: `GET /parent/children` · `GET|POST /parent/tasks` · `PUT|DELETE /parent/tasks/{id}` ·
  `GET /parent/tasks/stats` · `GET /parent/tasks/{id}/log` · `POST /parent/tasks/{id}/advance` ·
  `PUT /occurrences/{id}/status`
- Child: `GET /child/tasks` · `GET /child/stats` · `POST /child/tasks/{id}/complete` · `POST /occurrences/{id}/complete`
- Shared: `POST /tasks/{id}/status` · `GET /tasks/{id}/occurrences`
