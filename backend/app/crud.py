from datetime import datetime
from typing import List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from . import models, schemas, auth


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(func.lower(models.User.email) == email.lower()).first()


def get_user_by_username(db: Session, username: str) -> Optional[models.User]:
    if username is None:
        return None
    return db.query(models.User).filter(func.lower(models.User.username) == username.lower()).first()


def get_user_by_identifier(db: Session, identifier: str) -> Optional[models.User]:
    identifier_lower = identifier.lower()
    return (
        db.query(models.User)
        .filter(
            (func.lower(models.User.email) == identifier_lower) | (func.lower(models.User.username) == identifier_lower)
        )
        .first()
    )


def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_users(db: Session) -> list[models.User]:
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


def update_user(db: Session, user: models.User, user_update: schemas.UserUpdate) -> models.User:
    for field, value in user_update.dict(exclude_unset=True).items():
        setattr(user, field, value)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        username=getattr(user, 'username', None),
        full_name=user.full_name,
        hashed_password=hashed_password,
        role=user.role,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def authenticate_user(db: Session, email: str, password: str) -> Optional[models.User]:
    user = get_user_by_identifier(db, email)
    if not user:
        return None
    if not auth.verify_password(password, user.hashed_password):
        return None
    return user


def create_task(db: Session, task_data: schemas.TaskCreate, creator_id: int) -> models.Task:
    task = models.Task(
        title=task_data.title,
        description=task_data.description,
        due_date=task_data.due_date,
        priority=task_data.priority,
        recurrence=task_data.recurrence,
        created_by=creator_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    assign_task(db, task.id, task_data.assignee_ids or [])
    return task


def assign_task(db: Session, task_id: int, child_ids: List[int]) -> None:
    db.query(models.TaskAssignment).filter(models.TaskAssignment.task_id == task_id).delete()
    for child_id in child_ids:
        assignment = models.TaskAssignment(task_id=task_id, child_id=child_id)
        db.add(assignment)
    db.commit()


def get_task(db: Session, task_id: int) -> Optional[models.Task]:
    return db.query(models.Task).filter(models.Task.id == task_id).first()


def get_tasks_for_parent(db: Session, parent_id: int, status: Optional[str] = None, child_id: Optional[int] = None) -> List[models.Task]:
    query = db.query(models.Task).filter(models.Task.created_by == parent_id)
    if status:
        try:
            status_enum = models.TaskStatus(status)
            query = query.filter(models.Task.status == status_enum)
        except ValueError:
            pass
    if child_id:
        query = query.join(models.Task.assignments).filter(models.TaskAssignment.child_id == child_id)
    return query.order_by(models.Task.created_at.desc()).all()


def get_tasks_for_child(db: Session, child_id: int) -> List[models.TaskAssignment]:
    return (
        db.query(models.TaskAssignment)
        .filter(models.TaskAssignment.child_id == child_id)
        .order_by(models.TaskAssignment.assigned_at.desc())
        .all()
    )


def update_task(db: Session, task: models.Task, task_update: schemas.TaskUpdate) -> models.Task:
    for field, value in task_update.dict(exclude_unset=True).items():
        if field == "assignee_ids":
            assign_task(db, task.id, value)
            continue
        setattr(task, field, value)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task: models.Task) -> None:
    db.delete(task)
    db.commit()


def delete_user(db: Session, user: models.User) -> None:
    db.delete(user)
    db.commit()


def get_children(db: Session) -> list[models.User]:
    return db.query(models.User).filter(models.User.role == models.UserRole.child).order_by(models.User.created_at.desc()).all()


def mark_assignment_complete(db: Session, assignment: models.TaskAssignment) -> models.TaskAssignment:
    assignment.completed = True
    assignment.completed_at = datetime.utcnow()
    assignment.task.status = models.TaskStatus.completed
    db.add(assignment)
    db.add(assignment.task)
    db.commit()
    db.refresh(assignment)
    return assignment


def get_completion_stats(db: Session, parent_id: int) -> dict:
    tasks = get_tasks_for_parent(db, parent_id)
    completed = sum(1 for task in tasks if task.status == models.TaskStatus.completed)
    return {
        "total_tasks": len(tasks),
        "completed_tasks": completed,
        "pending_tasks": len(tasks) - completed,
    }
