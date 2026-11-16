import hashlib
import logging
import os
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timezone
from typing import Optional

import jwt
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import __version__, auth, crud, database, deps, mailer, models, schemas
from .timeutil import utcnow

logger = logging.getLogger("tasker")
Parent = deps.require_role(models.UserRole.parent)
Child = deps.require_role(models.UserRole.child)
Admin = deps.require_role(models.UserRole.admin)


def _fingerprint(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def create_default_admin(db: Session) -> None:
    admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.getenv("ADMIN_PASSWORD")
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    existing = (
        crud.get_user_by_email(db, admin_email)
        or crud.get_user_by_username(db, admin_username)
        or crud.get_user_by_email(db, "admin@tasker.local")
    )
    if existing:
        existing.role = models.UserRole.admin
        existing.email = admin_email
        existing.username = admin_username
        # ADMIN_PASSWORD is a break-glass reset. It is applied only when its value changes, so a
        # password changed inside the app survives later deploys.
        if admin_password and crud.get_app_secret(db, "admin_password_fingerprint") != _fingerprint(admin_password):
            crud.set_password(db, existing, admin_password)
            crud.set_app_secret(db, "admin_password_fingerprint", _fingerprint(admin_password))
        db.commit()
        return
    if not admin_password and db.query(models.User).filter(models.User.role == models.UserRole.admin).first():
        return
    if not admin_password:
        admin_password = secrets.token_urlsafe(12)
        logger.warning("Created admin %s with generated password %s; set ADMIN_PASSWORD to choose one.", admin_email, admin_password)
    crud.add_user(
        db,
        email=admin_email,
        username=admin_username,
        full_name="Administrator",
        password=admin_password,
        role=models.UserRole.admin,
    )
    crud.set_app_secret(db, "admin_password_fingerprint", _fingerprint(admin_password))


def startup() -> None:
    database.init_db()
    db = database.SessionLocal()
    try:
        if not os.getenv("TASKER_SECRET_KEY"):
            auth.SECRET_KEY = crud.get_or_create_app_secret(db, "jwt_secret")
        create_default_admin(db)
        crud.assign_orphan_families(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    startup()
    yield


app = FastAPI(title="Family Task Manager API", version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def not_found(detail: str = "Task not found") -> HTTPException:
    return HTTPException(status_code=404, detail=detail)


def in_family(task: models.Task, user: models.User) -> bool:
    """Tasks belong to their creator's family, so every parent in a family manages them together."""
    return task.creator.family_id == user.family_id


def owned_task(db: Session, task_id: int, parent: models.User) -> models.Task:
    task = crud.get_task(db, task_id)
    if not task or not in_family(task, parent):
        raise not_found()
    return task


def owned_occurrence(db: Session, occurrence_id: int, parent: models.User) -> models.TaskOccurrence:
    occurrence = crud.get_occurrence(db, occurrence_id)
    if not occurrence or not in_family(occurrence.task, parent):
        raise not_found("Occurrence not found")
    return occurrence


def owned_reward(db: Session, reward_id: int, parent: models.User) -> models.Reward:
    reward = crud.get_reward(db, reward_id)
    if not reward or reward.family_id != parent.family_id:
        raise not_found("Reward not found")
    return reward


def visible_task(db: Session, task_id: int, user: models.User) -> models.Task:
    """A task the user may see: a task from their family's parents or a task assigned to the child."""
    task = crud.get_task(db, task_id)
    if task and user.role == models.UserRole.parent and in_family(task, user):
        return task
    if task and user.role == models.UserRole.child and any(a.child_id == user.id for a in task.assignments):
        return task
    raise not_found()


def token_for(user: models.User) -> dict:
    return {"access_token": auth.create_access_token(user.id, user.role.value, user.token_version), "token_type": "bearer"}


def notify_assigned(background: BackgroundTasks, db: Session, child_ids, task: models.Task, parent: models.User, your_turn: bool = False) -> None:
    for child_id in child_ids:
        child = crud.get_user(db, child_id)
        background.add_task(mailer.send_task_assigned, child.email, child.full_name, task.title, crud.display_name(parent), your_turn)


def notify_completed(background: BackgroundTasks, task: models.Task, child: models.User) -> None:
    parent = task.creator
    background.add_task(mailer.send_task_completed, parent.email, parent.full_name, task.title, crud.display_name(child))


def notify_approval_requested(background: BackgroundTasks, task: models.Task, child: models.User) -> None:
    parent = task.creator
    background.add_task(mailer.send_approval_request, parent.email, parent.full_name, crud.display_name(child), task.title)


def validate_task(db: Session, task_type: str, recurrence, assignee_ids: list[int], family_id: int) -> None:
    error = crud.task_shape_error(task_type, recurrence, assignee_ids)
    if error is None and not crud.all_children(db, assignee_ids, family_id):
        error = "Tasks can only be assigned to child accounts"
    if error:
        raise HTTPException(status_code=400, detail=error)


def waiting_assignment(task: models.Task, child_id: int) -> models.TaskAssignment:
    assignment = next((a for a in task.assignments if a.child_id == child_id and a.awaiting_approval), None)
    if assignment is None:
        raise HTTPException(status_code=400, detail="Nothing is waiting for approval from this child")
    return assignment


def family_for_new_user(db: Session, user_in: schemas.UserCreate) -> Optional[int]:
    """Admins have no family. Children join one. A parent without a family gets a new one."""
    if user_in.role == models.UserRole.admin:
        if user_in.family_id is not None:
            raise HTTPException(status_code=400, detail="Admins do not belong to a family")
        return None
    if user_in.family_id is not None:
        if not crud.get_family(db, user_in.family_id):
            raise HTTPException(status_code=400, detail="Family not found")
        return user_in.family_id
    if user_in.role == models.UserRole.child:
        raise HTTPException(status_code=400, detail="Children need a family")
    return crud.create_family(db, f"{user_in.full_name or user_in.email}'s family").id


# ---------------------------------------------------------------- health & auth


@app.get("/api/health", response_model=schemas.Health)
def health(db: Session = Depends(deps.get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "version": __version__, "environment": os.getenv("APP_ENV", "development")}


@app.post("/api/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(deps.get_db)):
    key = form_data.username.strip().lower()
    if auth.login_limiter.is_blocked(key):
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait 15 minutes and try again.")
    user = crud.authenticate_user(db, form_data.username.strip(), form_data.password)
    if not user:
        auth.login_limiter.hit(key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect user or password")
    auth.login_limiter.reset(key)
    return token_for(user)


@app.post("/api/auth/signup", response_model=schemas.Token)
def signup(body: schemas.SignupRequest, background: BackgroundTasks, db: Session = Depends(deps.get_db)):
    if auth.signup_limiter.is_blocked("global"):
        raise HTTPException(status_code=429, detail="Too many new families right now. Please try again later.")
    if crud.find_identity_conflict(db, body.email, body.username):
        raise HTTPException(status_code=400, detail="Email or username already registered")
    auth.signup_limiter.hit("global")
    family = crud.create_family(db, body.family_name)
    user = crud.add_user(
        db,
        email=body.email,
        username=body.username,
        full_name=body.full_name,
        password=body.password,
        role=models.UserRole.parent,
        family_id=family.id,
    )
    background.add_task(mailer.send_welcome, user.email, user.full_name, "parent")
    return token_for(user)


@app.post("/api/auth/join", response_model=schemas.Token)
def join_family(body: schemas.JoinRequest, background: BackgroundTasks, db: Session = Depends(deps.get_db)):
    family = crud.get_family_by_code(db, body.invite_code)
    if family is None:
        raise HTTPException(status_code=400, detail="This invite code is not valid.")
    if crud.find_identity_conflict(db, body.email, body.username):
        raise HTTPException(status_code=400, detail="Email or username already registered")
    user = crud.add_user(
        db,
        email=body.email,
        username=body.username,
        full_name=body.full_name,
        password=body.password,
        role=models.UserRole(body.role),
        family_id=family.id,
    )
    background.add_task(mailer.send_welcome, user.email, user.full_name, user.role.value)
    return token_for(user)


@app.post("/api/auth/forgot-password", response_model=schemas.Message)
def forgot_password(body: schemas.ForgotPasswordRequest, background: BackgroundTasks, db: Session = Depends(deps.get_db)):
    key = body.email.lower()
    user = crud.get_user_by_email(db, body.email)
    if user and not auth.password_reset_limiter.is_blocked(key):
        auth.password_reset_limiter.hit(key)
        token = auth.create_reset_token(user.id, user.token_version)
        background.add_task(mailer.send_password_reset, user.email, user.full_name, token)
    # Same answer either way so the endpoint cannot be used to discover accounts.
    return {"message": "If that account exists, a reset link is on its way."}


@app.post("/api/auth/reset-password", response_model=schemas.Message)
def reset_password_with_token(body: schemas.ResetPasswordRequest, db: Session = Depends(deps.get_db)):
    invalid = HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    try:
        payload = auth.decode_token(body.token, "reset")
        user = crud.get_user(db, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise invalid
    if user is None or payload.get("ver") != user.token_version:
        raise invalid
    crud.set_password(db, user, body.new_password)
    return {"message": "Password updated. You can sign in now."}


@app.get("/api/me", response_model=schemas.UserRead)
def read_current_user(current_user: models.User = Depends(deps.get_current_user)):
    return current_user


@app.put("/api/me/profile", response_model=schemas.UserRead)
def update_profile(profile: schemas.ProfileUpdate, current_user: models.User = Depends(deps.get_current_user), db: Session = Depends(deps.get_db)):
    return crud.update_profile(db, current_user, profile)


# ---------------------------------------------------------------- family


@app.get("/api/family", response_model=schemas.FamilyView)
def read_family(current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    family = crud.get_family(db, current_user.family_id)
    return {"id": family.id, "name": family.name, "invite_code": family.invite_code, "members": crud.family_members(db, family.id)}


@app.post("/api/family/invite-code", response_model=schemas.InviteCode)
def new_invite_code(current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    return {"invite_code": crud.regenerate_invite_code(db, crud.get_family(db, current_user.family_id))}


# ---------------------------------------------------------------- admin


@app.post("/api/admin/users", response_model=schemas.UserRead)
def create_user(user_in: schemas.UserCreate, background: BackgroundTasks, current_user: models.User = Depends(Admin), db: Session = Depends(deps.get_db)):
    if crud.find_identity_conflict(db, user_in.email, user_in.username):
        raise HTTPException(status_code=400, detail="Email or username already registered")
    family_id = family_for_new_user(db, user_in)
    user = crud.add_user(
        db,
        email=user_in.email,
        username=user_in.username,
        full_name=user_in.full_name,
        password=user_in.password,
        role=user_in.role,
        family_id=family_id,
    )
    background.add_task(mailer.send_welcome, user.email, user.full_name, user.role.value)
    return user


@app.get("/api/admin/users", response_model=list[schemas.UserRead])
def list_users(current_user: models.User = Depends(Admin), db: Session = Depends(deps.get_db)):
    return crud.get_users(db)


@app.get("/api/admin/families", response_model=list[schemas.FamilySummary])
def list_families(current_user: models.User = Depends(Admin), db: Session = Depends(deps.get_db)):
    return crud.family_summaries(db)


@app.put("/api/admin/users/{user_id}", response_model=schemas.UserRead)
def update_user(user_id: int, user_update: schemas.UserUpdate, current_user: models.User = Depends(Admin), db: Session = Depends(deps.get_db)):
    user = crud.get_user(db, user_id)
    if not user:
        raise not_found("User not found")
    if crud.find_identity_conflict(db, user_update.email, user_update.username, exclude_id=user.id):
        raise HTTPException(status_code=400, detail="Email or username already registered")
    if user.id == current_user.id and user_update.role not in (None, schemas.UserRole.admin):
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role")
    return crud.update_user(db, user, user_update)


@app.delete("/api/admin/users/{user_id}", response_model=schemas.Message)
def delete_user(user_id: int, current_user: models.User = Depends(Admin), db: Session = Depends(deps.get_db)):
    user = crud.get_user(db, user_id)
    if not user:
        raise not_found("User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    crud.delete_user(db, user)
    return {"message": "User deleted"}


@app.post("/api/admin/reset-password", response_model=schemas.Message)
def admin_reset_password(body: schemas.AdminPasswordReset, current_user: models.User = Depends(Admin), db: Session = Depends(deps.get_db)):
    user = crud.get_user_by_email(db, body.email)
    if not user:
        raise not_found("User not found")
    crud.set_password(db, user, body.new_password)
    return {"message": "Password reset successfully"}


# ---------------------------------------------------------------- parent: children


@app.get("/api/parent/children", response_model=list[schemas.UserRead])
def list_children(current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    return crud.get_children(db, current_user.family_id)


@app.post("/api/parent/children", response_model=schemas.UserRead)
def create_child(child_in: schemas.ChildCreate, background: BackgroundTasks, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    if crud.find_identity_conflict(db, child_in.email, child_in.username):
        raise HTTPException(status_code=400, detail="Email or username already registered")
    child = crud.add_user(
        db,
        email=child_in.email,
        username=child_in.username,
        full_name=child_in.full_name,
        password=child_in.password,
        role=models.UserRole.child,
        family_id=current_user.family_id,
        avatar=child_in.avatar,
        color=child_in.color,
    )
    background.add_task(mailer.send_welcome, child.email, child.full_name, "child")
    return child


# ---------------------------------------------------------------- parent: tasks


@app.post("/api/parent/tasks", response_model=schemas.TaskRead)
def create_task(task_in: schemas.TaskCreate, background: BackgroundTasks, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    validate_task(db, task_in.task_type, task_in.recurrence, task_in.assignee_ids, current_user.family_id)
    task = crud.create_task(db, task_in, current_user.id)
    notify_assigned(background, db, [a.child_id for a in task.assignments if a.is_active], task, current_user)
    return task


@app.get("/api/parent/tasks", response_model=list[schemas.TaskRead])
def list_parent_tasks(status: str | None = None, child_id: int | None = None, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    return crud.refresh_tasks(db, crud.get_tasks_for_family(db, current_user.family_id, status=status, child_id=child_id))


@app.get("/api/parent/tasks/stats", response_model=schemas.ParentStats)
def parent_task_stats(current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    return crud.get_completion_stats(db, current_user.family_id)


@app.get("/api/parent/tasks/{task_id}/log", response_model=list[schemas.TaskStatusLogRead])
def get_task_logs(task_id: int, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    owned_task(db, task_id, current_user)
    return crud.get_task_status_logs(db, task_id)


@app.put("/api/parent/tasks/{task_id}", response_model=schemas.TaskRead)
def update_task(task_id: int, task_update: schemas.TaskUpdate, background: BackgroundTasks, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    task = owned_task(db, task_id, current_user)
    fields = task_update.model_dump(exclude_unset=True)
    assignee_ids = fields.get("assignee_ids")
    if assignee_ids is None:
        assignee_ids = [a.child_id for a in task.assignments]
    validate_task(db, fields.get("task_type", task.task_type), fields.get("recurrence", task.recurrence), assignee_ids, current_user.family_id)
    added = crud.update_task(db, task, task_update)
    notify_assigned(background, db, [a.child_id for a in task.assignments if a.child_id in added and a.is_active], task, current_user)
    return task


@app.delete("/api/parent/tasks/{task_id}", response_model=schemas.Message)
def delete_task(task_id: int, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    crud.delete_task(db, owned_task(db, task_id, current_user))
    return {"message": "Task deleted"}


@app.post("/api/parent/tasks/{task_id}/advance", response_model=schemas.TaskRead)
def advance_rotating_task(task_id: int, background: BackgroundTasks, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    task = owned_task(db, task_id, current_user)
    if task.task_type != models.TaskType.rotating:
        raise HTTPException(status_code=400, detail="Only rotating tasks can be advanced")
    next_child_id = crud.advance_rotating_task(db, task, current_user.id)
    notify_assigned(background, db, [next_child_id], task, current_user, your_turn=True)
    return task


@app.post("/api/parent/tasks/{task_id}/approve", response_model=schemas.TaskRead)
def approve_task(task_id: int, body: schemas.ChildRef, background: BackgroundTasks, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    task = owned_task(db, task_id, current_user)
    next_child_id = crud.complete_assignment(db, waiting_assignment(task, body.child_id))
    if next_child_id:
        notify_assigned(background, db, [next_child_id], task, current_user, your_turn=True)
    return task


@app.post("/api/parent/tasks/{task_id}/reject", response_model=schemas.TaskRead)
def reject_task(task_id: int, body: schemas.ChildRef, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    task = owned_task(db, task_id, current_user)
    crud.reject_assignment(db, waiting_assignment(task, body.child_id))
    return task


@app.post("/api/parent/occurrences/{occurrence_id}/approve", response_model=schemas.OccurrenceRead)
def approve_occurrence(occurrence_id: int, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    occurrence = owned_occurrence(db, occurrence_id, current_user)
    if not occurrence.awaiting_approval:
        raise HTTPException(status_code=400, detail="Nothing is waiting for approval")
    crud.complete_occurrence(db, occurrence, occurrence.completed_by)
    return occurrence


@app.post("/api/parent/occurrences/{occurrence_id}/reject", response_model=schemas.OccurrenceRead)
def reject_occurrence(occurrence_id: int, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    occurrence = owned_occurrence(db, occurrence_id, current_user)
    if not occurrence.awaiting_approval:
        raise HTTPException(status_code=400, detail="Nothing is waiting for approval")
    crud.reject_occurrence(db, occurrence)
    return occurrence


@app.get("/api/parent/week", response_model=schemas.WeekView)
def parent_week(start: date | None = None, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    first_day = start or utcnow().date()
    begin = datetime.combine(first_day, time.min, tzinfo=timezone.utc)
    return {"start": first_day.isoformat(), "days": crud.week_view(db, current_user.family_id, begin)}


# ---------------------------------------------------------------- parent: rewards


@app.get("/api/parent/rewards", response_model=list[schemas.RewardRead])
def list_rewards(current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    return crud.list_rewards(db, current_user.family_id)


@app.post("/api/parent/rewards", response_model=schemas.RewardRead)
def create_reward(data: schemas.RewardCreate, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    return crud.create_reward(db, current_user.family_id, data)


@app.put("/api/parent/rewards/{reward_id}", response_model=schemas.RewardRead)
def update_reward(reward_id: int, data: schemas.RewardUpdate, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    return crud.update_reward(db, owned_reward(db, reward_id, current_user), data)


@app.delete("/api/parent/rewards/{reward_id}", response_model=schemas.Message)
def delete_reward(reward_id: int, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    crud.delete_reward(db, owned_reward(db, reward_id, current_user))
    return {"message": "Reward deleted"}


@app.get("/api/parent/redemptions", response_model=list[schemas.RedemptionRead])
def list_family_redemptions(current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    return crud.list_redemptions(db, family_id=current_user.family_id)


@app.post("/api/parent/redemptions/{redemption_id}/fulfill", response_model=schemas.RedemptionRead)
def fulfill_redemption(redemption_id: int, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    redemption = crud.get_redemption(db, redemption_id)
    if not redemption or redemption.child.family_id != current_user.family_id:
        raise not_found("Redemption not found")
    return crud.fulfill_redemption(db, redemption)


# ---------------------------------------------------------------- shared task endpoints


@app.post("/api/tasks/{task_id}/status", response_model=schemas.Message)
def update_task_status(task_id: int, status_update: schemas.TaskStatusUpdate, current_user: models.User = Depends(deps.get_current_user), db: Session = Depends(deps.get_db)):
    task = visible_task(db, task_id, current_user)
    if current_user.role == models.UserRole.child:
        assignment = next(a for a in task.assignments if a.child_id == current_user.id)
        if status_update.status == schemas.TaskStatus.completed:
            raise HTTPException(status_code=400, detail="Use the complete action to finish a task")
        if task.task_type == models.TaskType.rotating and not assignment.is_active:
            raise HTTPException(status_code=400, detail="This task is not active for you yet")
    crud.update_task_status(db, task, current_user.id, models.TaskStatus(status_update.status))
    return {"message": "Task status updated"}


@app.get("/api/tasks/{task_id}/occurrences", response_model=list[schemas.OccurrenceRead])
def get_task_occurrences(task_id: int, current_user: models.User = Depends(deps.get_current_user), db: Session = Depends(deps.get_db)):
    task = visible_task(db, task_id, current_user)
    crud.refresh_tasks(db, [task])
    return task.occurrences


@app.put("/api/occurrences/{occurrence_id}/status", response_model=schemas.OccurrenceRead)
def update_occurrence_status(occurrence_id: int, status_update: schemas.TaskStatusUpdate, current_user: models.User = Depends(Parent), db: Session = Depends(deps.get_db)):
    occurrence = owned_occurrence(db, occurrence_id, current_user)
    return crud.set_occurrence_status(db, occurrence, current_user.id, models.TaskStatus(status_update.status))


# ---------------------------------------------------------------- child


@app.get("/api/child/tasks", response_model=list[schemas.TaskRead])
def get_child_tasks(current_user: models.User = Depends(Child), db: Session = Depends(deps.get_db)):
    return crud.refresh_tasks(db, crud.get_tasks_for_child(db, current_user.id))


@app.get("/api/child/stats", response_model=schemas.ChildStats)
def get_child_stats(current_user: models.User = Depends(Child), db: Session = Depends(deps.get_db)):
    return crud.get_child_stats(db, current_user.id)


@app.post("/api/child/tasks/{task_id}/complete", response_model=schemas.Message)
def complete_task(task_id: int, background: BackgroundTasks, current_user: models.User = Depends(Child), db: Session = Depends(deps.get_db)):
    task = visible_task(db, task_id, current_user)
    assignment = next(a for a in task.assignments if a.child_id == current_user.id)
    if assignment.completed:
        return {"message": "Task already completed"}
    if task.task_type == models.TaskType.recurring:
        raise HTTPException(status_code=400, detail="Complete today's occurrence of a recurring task instead")
    if task.task_type == models.TaskType.rotating and not assignment.is_active:
        raise HTTPException(status_code=400, detail="This task is not active for you yet")
    if task.requires_approval:
        if assignment.awaiting_approval:
            return {"message": "Already waiting for your parent to approve"}
        crud.request_assignment_approval(db, assignment)
        notify_approval_requested(background, task, current_user)
        return {"message": "Sent to your parent to approve"}
    next_child_id = crud.complete_assignment(db, assignment)
    notify_completed(background, task, current_user)
    if next_child_id:
        notify_assigned(background, db, [next_child_id], task, task.creator, your_turn=True)
    return {"message": "Task marked completed"}


@app.post("/api/occurrences/{occurrence_id}/complete", response_model=schemas.OccurrenceRead)
def complete_occurrence(occurrence_id: int, background: BackgroundTasks, current_user: models.User = Depends(Child), db: Session = Depends(deps.get_db)):
    occurrence = crud.get_occurrence(db, occurrence_id)
    if not occurrence:
        raise not_found("Occurrence not found")
    task = visible_task(db, occurrence.task_id, current_user)
    if task.requires_approval:
        if occurrence.status != models.TaskStatus.completed and not occurrence.awaiting_approval:
            crud.request_occurrence_approval(db, occurrence, current_user.id)
            notify_approval_requested(background, task, current_user)
        return occurrence
    if crud.complete_occurrence(db, occurrence, current_user.id):
        notify_completed(background, task, current_user)
    return occurrence


@app.get("/api/child/rewards", response_model=list[schemas.RewardRead])
def child_rewards(current_user: models.User = Depends(Child), db: Session = Depends(deps.get_db)):
    return crud.list_rewards(db, current_user.family_id, active_only=True)


@app.post("/api/child/rewards/{reward_id}/redeem", response_model=schemas.RedemptionRead)
def redeem_reward(reward_id: int, current_user: models.User = Depends(Child), db: Session = Depends(deps.get_db)):
    reward = crud.get_reward(db, reward_id)
    if not reward or reward.family_id != current_user.family_id or not reward.active:
        raise not_found("Reward not found")
    if crud.get_child_stats(db, current_user.id)["balance"] < reward.cost:
        raise HTTPException(status_code=400, detail="Not enough stars yet")
    return crud.redeem(db, current_user, reward)


@app.get("/api/child/redemptions", response_model=list[schemas.RedemptionRead])
def child_redemptions(current_user: models.User = Depends(Child), db: Session = Depends(deps.get_db)):
    return crud.list_redemptions(db, child_id=current_user.id)


# ---------------------------------------------------------------- reminders (called by the server's cron job)


@app.post("/api/internal/reminders", response_model=schemas.Message)
def send_reminders(x_reminder_token: str | None = Header(None), db: Session = Depends(deps.get_db)):
    expected = os.getenv("REMINDER_TOKEN")
    if not expected or not secrets.compare_digest(x_reminder_token or "", expected):
        raise not_found("Not found")
    now = utcnow()
    for task in db.query(models.Task).filter(models.Task.task_type == models.TaskType.recurring).all():
        crud.sync_occurrences(task)
    db.commit()
    sent = 0
    for assignment in crud.due_soon_assignments(db, now):
        if mailer.send_reminder(assignment.child.email, assignment.child.full_name, assignment.task.title):
            assignment.reminded_at = now
            sent += 1
    for occurrence in crud.open_occurrences(db, now):
        results = [mailer.send_reminder(a.child.email, a.child.full_name, occurrence.task.title) for a in occurrence.task.assignments]
        sent += sum(results)
        if any(results):
            occurrence.reminded_at = now
    db.commit()
    return {"message": f"Sent {sent} reminders"}
