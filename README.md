# Family Task Manager

A lightweight family task manager with a React + TypeScript frontend and a FastAPI backend.

## Version

- Release state: **0.1**
- This repository is prepared for the first tagged GitHub release at version `v0.1`.

## Architecture

- `backend/` — FastAPI REST API, SQLAlchemy models, SQLite persistence
- `frontend/` — Vite React TypeScript app with role-aware UI flows
- `docker-compose.yml` — containerized backend + frontend for local development

## Key features

- Admin user management and password reset
- Parent task creation with child assignment and recurrence options
- Child task view with completion actions
- JWT authentication and role-based access control
- Task recurrence saved on backend and displayed in UI

## Setup

### Backend

1. Open a terminal in `backend`
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. (Optional) Install developer test dependencies:
   ```bash
   pip install -r requirements-dev.txt
   ```
4. Run the API:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

The backend stores its database file at `backend/tasker.db`.

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

Automated backend tests are available in `backend/tests`.

From the backend folder:

```bash
cd backend
pytest
```

Developer dependencies are tracked in `backend/requirements-dev.txt`.

## API Endpoints

- `POST /api/token` — login
- `POST /api/admin/users` — create parent or child accounts (admin only)
- `POST /api/admin/reset-password` — reset a user password (admin only)
- `POST /api/parent/tasks` — create tasks (parent only)
- `GET /api/parent/tasks` — list tasks (parent only)
- `GET /api/parent/tasks/stats` — task completion summary (parent only)
- `PUT /api/parent/tasks/{task_id}` — update task (parent only)
- `DELETE /api/parent/tasks/{task_id}` — delete task (parent only)
- `GET /api/parent/children` — list child accounts for assignment (parent only)
- `GET /api/child/tasks` — child task list (child only)
- `POST /api/child/tasks/{task_id}/complete` — mark task completed (child only)
- `GET /api/me` — current user info

## Developer notes

- The admin password reset UI now uses selectable user accounts from the admin user list.
- The parent task creation form uses checkbox selection for children and supports task recurrence.
- `frontend/src/api.ts` and `backend/app/main.py` now both support `/api/parent/children`.
- `backend/app/schemas.py` includes recurrence metadata for tasks.

## Environment variables

The app supports these optional environment variables:

- `ADMIN_EMAIL` — default admin email
- `ADMIN_PASSWORD` — default admin password
- `ADMIN_USERNAME` — default admin username
- `FRONTEND_ORIGIN` — allowed CORS origin for the frontend
- `TASKER_SECRET_KEY` — JWT signing secret

## GitHub release process

This state is intended as the first release version `0.1`.
After initialization, the repository will be tagged as `v0.1` and pushed to GitHub.
