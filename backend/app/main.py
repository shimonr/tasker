from fastapi import Body, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from . import auth, crud, deps, schemas, database, models
import os

app = FastAPI(title="Family Task Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
        os.getenv("VERCEL_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def create_default_admin(db: Session) -> None:
    # Use a valid example TLD to satisfy EmailStr validation
    admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
    # Accept previous legacy email and migrate it to the new admin email if present
    legacy_email = "admin@tasker.local"
    existing = crud.get_user_by_email(db, admin_email) or crud.get_user_by_email(db, legacy_email)
    if existing:
        # ensure admin role and update password/email/username if needed
        existing.role = models.UserRole.admin
        existing.hashed_password = auth.get_password_hash(admin_password)
        existing.email = admin_email
        existing.username = os.getenv("ADMIN_USERNAME", "admin")
        db.add(existing)
        db.commit()
    else:
        hashed_password = auth.get_password_hash(admin_password)
        admin_user = models.User(email=admin_email, username=os.getenv("ADMIN_USERNAME", "admin"), full_name="Administrator", hashed_password=hashed_password, role=models.UserRole.admin)
        db.add(admin_user)
        db.commit()


@app.on_event("startup")
def startup_event():
    database.init_db()
    db = database.SessionLocal()
    try:
        create_default_admin(db)
    finally:
        db.close()

@app.post("/api/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(deps.get_db)):
    user = crud.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    access_token = auth.create_access_token(data={"sub": user.email, "role": user.role.value})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/admin/users", response_model=schemas.UserRead)
def create_user(user_in: schemas.UserCreate, current_user: models.User = Depends(deps.require_role(models.UserRole.admin)), db: Session = Depends(deps.get_db)):
    existing_by_email = crud.get_user_by_email(db, user_in.email) if user_in.email else None
    existing_by_username = crud.get_user_by_username(db, user_in.username) if getattr(user_in, 'username', None) else None
    if existing_by_email or existing_by_username:
        raise HTTPException(status_code=400, detail="Email or username already registered")
    return crud.create_user(db, user_in)


@app.get("/api/admin/users", response_model=list[schemas.UserRead])
def list_users(current_user: models.User = Depends(deps.require_role(models.UserRole.admin)), db: Session = Depends(deps.get_db)):
    return crud.get_users(db)


@app.put("/api/admin/users/{user_id}", response_model=schemas.UserRead)
def update_user(user_id: int, user_update: schemas.UserUpdate, current_user: models.User = Depends(deps.require_role(models.UserRole.admin)), db: Session = Depends(deps.get_db)):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return crud.update_user(db, user, user_update)


@app.delete("/api/admin/users/{user_id}")
def delete_user(user_id: int, current_user: models.User = Depends(deps.require_role(models.UserRole.admin)), db: Session = Depends(deps.get_db)):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    crud.delete_user(db, user)
    return {"message": "User deleted"}


@app.post("/api/admin/reset-password")
def reset_password(
    email: str = Body(...),
    new_password: str = Body(...),
    current_user: models.User = Depends(deps.require_role(models.UserRole.admin)),
    db: Session = Depends(deps.get_db),
):
    user = crud.get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = auth.get_password_hash(new_password)
    db.add(user)
    db.commit()
    return {"message": "Password reset successfully"}

@app.post("/api/parent/tasks", response_model=schemas.TaskRead)
def create_task(task_in: schemas.TaskCreate, current_user: models.User = Depends(deps.require_role(models.UserRole.parent)), db: Session = Depends(deps.get_db)):
    if task_in.task_type == schemas.TaskType.rotating:
        if not task_in.assignee_ids or len(task_in.assignee_ids) < 2:
            raise HTTPException(status_code=400, detail="Rotating tasks require at least 2 assignees")
    return crud.create_task(db, task_in, current_user.id)

@app.get("/api/parent/children", response_model=list[schemas.UserRead])
def list_children(current_user: models.User = Depends(deps.require_role(models.UserRole.parent)), db: Session = Depends(deps.get_db)):
    return crud.get_children(db)

@app.get("/api/parent/tasks", response_model=list[schemas.TaskRead])
def list_parent_tasks(status: str | None = None, child_id: int | None = None, current_user: models.User = Depends(deps.require_role(models.UserRole.parent)), db: Session = Depends(deps.get_db)):
    return crud.get_tasks_for_parent(db, current_user.id, status=status, child_id=child_id)

@app.get("/api/parent/tasks/stats")
def parent_task_stats(current_user: models.User = Depends(deps.require_role(models.UserRole.parent)), db: Session = Depends(deps.get_db)):
    return crud.get_completion_stats(db, current_user.id)

@app.post("/api/tasks/{task_id}/status")
def update_task_status(task_id: int, status_update: schemas.TaskStatusUpdate, current_user: models.User = Depends(deps.get_current_user), db: Session = Depends(deps.get_db)):
    task = crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.role == models.UserRole.parent:
        if task.created_by != current_user.id:
            raise HTTPException(status_code=404, detail="Task not found")
    elif current_user.role == models.UserRole.child:
        assignment = (
            db.query(models.TaskAssignment)
            .filter(models.TaskAssignment.task_id == task_id, models.TaskAssignment.child_id == current_user.id)
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=404, detail="Task not found")
    else:
        raise HTTPException(status_code=403, detail="Permission denied")

    new_status = models.TaskStatus(status_update.status)
    crud.update_task_status(db, task, current_user.id, new_status)
    return {"message": "Task status updated"}

@app.get("/api/parent/tasks/{task_id}/log", response_model=list[schemas.TaskStatusLogRead])
def get_task_logs(task_id: int, current_user: models.User = Depends(deps.require_role(models.UserRole.parent)), db: Session = Depends(deps.get_db)):
    task = crud.get_task(db, task_id)
    if not task or task.created_by != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    return crud.get_task_status_logs(db, task_id)

@app.put("/api/parent/tasks/{task_id}", response_model=schemas.TaskRead)
def update_task(task_id: int, task_update: schemas.TaskUpdate, current_user: models.User = Depends(deps.require_role(models.UserRole.parent)), db: Session = Depends(deps.get_db)):
    task = crud.get_task(db, task_id)
    if not task or task.created_by != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    return crud.update_task(db, task, task_update)

@app.delete("/api/parent/tasks/{task_id}")
def delete_task(task_id: int, current_user: models.User = Depends(deps.require_role(models.UserRole.parent)), db: Session = Depends(deps.get_db)):
    task = crud.get_task(db, task_id)
    if not task or task.created_by != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    crud.delete_task(db, task)
    return {"message": "Task deleted"}

@app.post("/api/parent/tasks/{task_id}/advance", response_model=schemas.TaskRead)
def advance_rotating_task(task_id: int, current_user: models.User = Depends(deps.require_role(models.UserRole.parent)), db: Session = Depends(deps.get_db)):
    task = crud.get_task(db, task_id)
    if not task or task.created_by != current_user.id:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.task_type != models.TaskType.rotating:
        raise HTTPException(status_code=400, detail="Only rotating tasks can be advanced")
    updated_task = crud.advance_rotating_task(db, task_id, current_user.id)
    return updated_task

@app.get("/api/child/tasks", response_model=list[schemas.TaskRead])
def get_child_tasks(current_user: models.User = Depends(deps.require_role(models.UserRole.child)), db: Session = Depends(deps.get_db)):
    assignments = crud.get_tasks_for_child(db, current_user.id)
    return [assignment.task for assignment in assignments]

@app.get("/api/tasks/{task_id}/occurrences", response_model=list[schemas.OccurrenceRead])
def get_task_occurrences(task_id: int, current_user: models.User = Depends(deps.get_current_user), db: Session = Depends(deps.get_db)):
    task = crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.role == models.UserRole.child:
        assignment = (
            db.query(models.TaskAssignment)
            .filter(models.TaskAssignment.task_id == task_id, models.TaskAssignment.child_id == current_user.id)
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=404, detail="Task not found")
    elif current_user.role == models.UserRole.parent:
        if task.created_by != current_user.id:
            raise HTTPException(status_code=404, detail="Task not found")
    return crud.get_occurrences_for_task(db, task_id)

@app.put("/api/occurrences/{occurrence_id}/status")
def update_occurrence_status(occurrence_id: int, status_update: schemas.TaskStatusUpdate, current_user: models.User = Depends(deps.get_current_user), db: Session = Depends(deps.get_db)):
    occurrence = crud.get_occurrence(db, occurrence_id)
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    task = crud.get_task(db, occurrence.task_id)
    if current_user.role == models.UserRole.child:
        assignment = (
            db.query(models.TaskAssignment)
            .filter(models.TaskAssignment.task_id == task.id, models.TaskAssignment.child_id == current_user.id)
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=404, detail="Task not found")
    elif current_user.role == models.UserRole.parent:
        if task.created_by != current_user.id:
            raise HTTPException(status_code=404, detail="Task not found")
    new_status = models.TaskStatus(status_update.status)
    return crud.update_occurrence_status(db, occurrence, current_user.id, new_status)

@app.post("/api/occurrences/{occurrence_id}/complete")
def complete_occurrence(occurrence_id: int, current_user: models.User = Depends(deps.require_role(models.UserRole.child)), db: Session = Depends(deps.get_db)):
    occurrence = crud.get_occurrence(db, occurrence_id)
    if not occurrence:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    assignment = (
        db.query(models.TaskAssignment)
        .filter(models.TaskAssignment.task_id == occurrence.task_id, models.TaskAssignment.child_id == current_user.id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Task not found")
    return crud.complete_occurrence(db, occurrence, current_user.id)

@app.post("/api/child/tasks/{task_id}/complete")
def complete_task(task_id: int, current_user: models.User = Depends(deps.require_role(models.UserRole.child)), db: Session = Depends(deps.get_db)):
    assignment = (
        db.query(models.TaskAssignment)
        .filter(models.TaskAssignment.task_id == task_id, models.TaskAssignment.child_id == current_user.id)
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.completed:
        return {"message": "Task already completed"}
    if assignment.task.task_type == models.TaskType.rotating and not assignment.is_active:
        raise HTTPException(status_code=400, detail="This task is not active for you yet")
    crud.mark_assignment_complete(db, assignment, current_user.id)
    return {"message": "Task marked completed"}

@app.get("/api/me", response_model=schemas.UserRead)
def read_current_user(current_user: models.User = Depends(deps.get_current_user)):
    return current_user
