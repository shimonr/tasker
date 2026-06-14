from datetime import datetime, timedelta
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


def create_status_log(db: Session, task: models.Task, user_id: int, new_status: models.TaskStatus):
    log = models.TaskStatusLog(
        task_id=task.id,
        changed_by=user_id,
        previous_status=task.status,
        new_status=new_status,
    )
    db.add(log)
    return log


def create_task(db: Session, task_data: schemas.TaskCreate, creator_id: int) -> models.Task:
    task = models.Task(
        title=task_data.title,
        description=task_data.description,
        due_date=task_data.due_date,
        start_date=task_data.start_date,
        priority=task_data.priority,
        recurrence=task_data.recurrence,
        task_type=task_data.task_type or models.TaskType.adhoc,
        created_by=creator_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    assign_task(db, task.id, task_data.assignee_ids or [], task.task_type)
    if task.task_type == models.TaskType.recurring and task.recurrence:
        generate_occurrences(db, task)
    log = create_status_log(db, task, creator_id, task.status)
    db.add(log)
    db.commit()
    return task


def generate_occurrences(db: Session, task: models.Task) -> None:
    start = task.start_date or datetime.utcnow()
    today = datetime.utcnow()
    current = start
    count = 0
    max_occurrences = 52

    while current <= today and count < max_occurrences:
        occurrence = models.TaskOccurrence(
            task_id=task.id,
            occurrence_date=current,
            status=models.TaskStatus.pending,
        )
        db.add(occurrence)
        count += 1
        if task.recurrence == 'daily':
            current += timedelta(days=1)
        elif task.recurrence == 'weekly':
            current += timedelta(weeks=1)
        elif task.recurrence == 'monthly':
            month = current.month + 1
            year = current.year
            if month > 12:
                month = 1
                year += 1
            current = current.replace(year=year, month=month)
        elif task.recurrence == 'yearly':
            current = current.replace(year=current.year + 1)

    db.commit()


def assign_task(db: Session, task_id: int, child_ids: List[int], task_type: models.TaskType = models.TaskType.adhoc) -> None:
    db.query(models.TaskAssignment).filter(models.TaskAssignment.task_id == task_id).delete()
    for idx, child_id in enumerate(child_ids):
        assignment = models.TaskAssignment(
            task_id=task_id,
            child_id=child_id,
            rotation_order=idx if task_type == models.TaskType.rotating else None,
            is_active=(idx == 0) if task_type == models.TaskType.rotating else True,
        )
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
        .join(models.Task)
        .filter(models.TaskAssignment.child_id == child_id)
        .filter(
            (models.Task.task_type != models.TaskType.rotating)
            | ((models.Task.task_type == models.TaskType.rotating) & (models.TaskAssignment.is_active == True))
        )
        .order_by(models.TaskAssignment.assigned_at.desc())
        .all()
    )


def update_task(db: Session, task: models.Task, task_update: schemas.TaskUpdate) -> models.Task:
    for field, value in task_update.dict(exclude_unset=True).items():
        if field == "assignee_ids":
            assign_task(db, task.id, value, task.task_type)
            continue
        setattr(task, field, value)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def delete_task(db: Session, task: models.Task) -> None:
    db.delete(task)
    db.commit()


def advance_rotating_task(db: Session, task_id: int, user_id: int) -> models.Task:
    task = get_task(db, task_id)
    if not task or task.task_type != models.TaskType.rotating:
        return None

    previous_status = task.status

    current_active = (
        db.query(models.TaskAssignment)
        .filter(
            models.TaskAssignment.task_id == task_id,
            models.TaskAssignment.is_active == True,
        )
        .first()
    )

    if current_active:
        current_active.is_active = False
        db.add(current_active)

    next_assignment = (
        db.query(models.TaskAssignment)
        .filter(
            models.TaskAssignment.task_id == task_id,
            models.TaskAssignment.is_active == False,
            models.TaskAssignment.completed == False,
        )
        .order_by(models.TaskAssignment.rotation_order)
        .first()
    )

    if not next_assignment:
        next_assignment = (
            db.query(models.TaskAssignment)
            .filter(
                models.TaskAssignment.task_id == task_id,
                models.TaskAssignment.is_active == False,
            )
            .order_by(models.TaskAssignment.rotation_order)
            .first()
        )

    if next_assignment:
        next_assignment.is_active = True
        db.add(next_assignment)
        task.status = models.TaskStatus.pending
        db.add(task)

    log = models.TaskStatusLog(
        task_id=task_id,
        changed_by=user_id,
        previous_status=previous_status,
        new_status=task.status,
    )
    db.add(log)
    db.commit()
    db.refresh(task)
    return task


def delete_user(db: Session, user: models.User) -> None:
    db.delete(user)
    db.commit()


def get_children(db: Session) -> list[models.User]:
    return db.query(models.User).filter(models.User.role == models.UserRole.child).order_by(models.User.created_at.desc()).all()


def mark_assignment_complete(db: Session, assignment: models.TaskAssignment, user_id: int) -> models.TaskAssignment:
    assignment.completed = True
    assignment.completed_at = datetime.utcnow()
    assignment.is_active = False
    previous_status = assignment.task.status

    if assignment.task.task_type == models.TaskType.rotating:
        next_assignment = (
            db.query(models.TaskAssignment)
            .filter(
                models.TaskAssignment.task_id == assignment.task.id,
                models.TaskAssignment.id != assignment.id,
                models.TaskAssignment.completed == False,
            )
            .order_by(models.TaskAssignment.rotation_order)
            .first()
        )
        if next_assignment:
            assignment.task.status = models.TaskStatus.pending
            next_assignment.is_active = True
            db.add(next_assignment)
        else:
            assignment.task.status = models.TaskStatus.completed
    else:
        assignment.task.status = models.TaskStatus.completed

    db.add(assignment)
    db.add(assignment.task)
    log = models.TaskStatusLog(
        task_id=assignment.task.id,
        changed_by=user_id,
        previous_status=previous_status,
        new_status=assignment.task.status,
    )
    db.add(log)
    db.commit()
    db.refresh(assignment)
    return assignment


def get_task_status_logs(db: Session, task_id: int) -> List[models.TaskStatusLog]:
    return (
        db.query(models.TaskStatusLog)
        .filter(models.TaskStatusLog.task_id == task_id)
        .order_by(models.TaskStatusLog.changed_at.desc())
        .all()
    )


def update_task_status(db: Session, task: models.Task, user_id: int, new_status: models.TaskStatus) -> models.Task:
    previous_status = task.status
    if previous_status == new_status:
        return task
    task.status = new_status
    db.add(task)
    log = models.TaskStatusLog(
        task_id=task.id,
        changed_by=user_id,
        previous_status=previous_status,
        new_status=new_status,
    )
    db.add(log)
    db.commit()
    db.refresh(task)
    return task


def get_completion_stats(db: Session, parent_id: int) -> dict:
    tasks = get_tasks_for_parent(db, parent_id)
    completed = sum(1 for task in tasks if task.status == models.TaskStatus.completed)
    in_progress = sum(1 for task in tasks if task.status == models.TaskStatus.in_progress)
    failed = sum(1 for task in tasks if task.status == models.TaskStatus.failed)
    return {
        "total_tasks": len(tasks),
        "completed_tasks": completed,
        "pending_tasks": len(tasks) - completed - in_progress - failed,
        "in_progress_tasks": in_progress,
        "failed_tasks": failed,
    }


def get_occurrences_for_task(db: Session, task_id: int) -> List[models.TaskOccurrence]:
    return (
        db.query(models.TaskOccurrence)
        .filter(models.TaskOccurrence.task_id == task_id)
        .order_by(models.TaskOccurrence.occurrence_date.desc())
        .all()
    )


def get_occurrence(db: Session, occurrence_id: int) -> Optional[models.TaskOccurrence]:
    return db.query(models.TaskOccurrence).filter(models.TaskOccurrence.id == occurrence_id).first()


def update_occurrence_status(db: Session, occurrence: models.TaskOccurrence, user_id: int, new_status: models.TaskStatus) -> models.TaskOccurrence:
    previous_status = occurrence.status
    if previous_status == new_status:
        return occurrence
    occurrence.status = new_status
    if new_status == models.TaskStatus.completed:
        occurrence.completed_at = datetime.utcnow()
    db.add(occurrence)
    log = models.TaskStatusLog(
        task_id=occurrence.task_id,
        changed_by=user_id,
        previous_status=previous_status,
        new_status=new_status,
    )
    db.add(log)
    db.commit()
    db.refresh(occurrence)
    return occurrence


def complete_occurrence(db: Session, occurrence: models.TaskOccurrence, user_id: int) -> models.TaskOccurrence:
    if occurrence.status == models.TaskStatus.completed:
        return occurrence
    occurrence.status = models.TaskStatus.completed
    occurrence.completed_at = datetime.utcnow()
    db.add(occurrence)
    log = models.TaskStatusLog(
        task_id=occurrence.task_id,
        changed_by=user_id,
        previous_status=occurrence.status,
        new_status=models.TaskStatus.completed,
    )
    db.add(log)
    db.commit()
    db.refresh(occurrence)
    return occurrence
