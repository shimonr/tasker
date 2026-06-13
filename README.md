# Family Task Manager

A lightweight family task manager with a React + TypeScript frontend and a FastAPI backend.

## Version

- Release state: **0.3**
- GitHub release tag: `v0.3`

## Architecture

- `backend/` — FastAPI REST API, SQLAlchemy models, SQLite/PostgreSQL persistence
- `frontend/` — Vite React TypeScript app with role-aware UI flows
- `docker-compose.yml` — containerized backend + frontend for local development

## Key features

- Admin user management and password reset
- Parent task creation with child assignment and recurrence options
- Rotating tasks with per-child active assignment
- Per-occurrence tracking for recurring tasks
- Task editing for all task types
- Child task view with completion actions
- JWT authentication and role-based access control

## Setup

### Backend

1. Open a terminal in `backend`
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the API:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

### Frontend

1. Open a terminal in `frontend`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the app:
   ```bash
   npm run dev -- --host 0.0.0.0 --port 5173
   ```

### Docker

From the repository root:

```bash
docker compose up --build
```

## Testing

Backend tests:
```bash
cd backend
pytest
```

Frontend tests:
```bash
cd frontend
npm test
```

## Deployment

### Frontend (Vercel)

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) and import the repository
3. Set the root directory to `frontend`
4. Add environment variable:
   - `VITE_API_BASE_URL` = `https://your-app.up.railway.app/api`
5. Deploy

### Backend (Railway)

1. Go to [railway.app](https://railway.app) and import the repository
2. Add a PostgreSQL database (free tier)
3. Set environment variables:
   - `DATABASE_URL` = (auto-set by Railway PostgreSQL)
   - `FRONTEND_ORIGIN` = `https://your-app.vercel.app`
   - `ADMIN_EMAIL` = `admin@example.com`
   - `ADMIN_PASSWORD` = `your-secure-password`
4. Deploy

### Default Credentials

- Admin: `admin@example.com` / `admin123`
- Parent: `shimonro@hotmail.com` / `123`
- Children: `shimon1974@gmail.com` / `123`, `kellycameronnew@gmail.com` / `123`

## API Endpoints

- `POST /api/token` — login
- `POST /api/admin/users` — create user (admin)
- `POST /api/admin/reset-password` — reset password (admin)
- `POST /api/parent/tasks` — create task (parent)
- `GET /api/parent/tasks` — list tasks (parent)
- `PUT /api/parent/tasks/{task_id}` — update task (parent)
- `DELETE /api/parent/tasks/{task_id}` — delete task (parent)
- `POST /api/parent/tasks/{task_id}/advance` — advance rotating task (parent)
- `GET /api/parent/children` — list children (parent)
- `GET /api/child/tasks` — child task list (child)
- `POST /api/child/tasks/{task_id}/complete` — complete task (child)
- `GET /api/tasks/{task_id}/occurrences` — list occurrences
- `PUT /api/occurrences/{occurrence_id}/status` — update occurrence status
- `POST /api/occurrences/{occurrence_id}/complete` — complete occurrence
- `GET /api/me` — current user info

## Environment Variables

- `DATABASE_URL` — database connection string (defaults to SQLite)
- `FRONTEND_ORIGIN` — allowed CORS origin
- `ADMIN_EMAIL` — default admin email
- `ADMIN_PASSWORD` — default admin password
- `ADMIN_USERNAME` — default admin username
