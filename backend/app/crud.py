import calendar
import secrets
from datetime import datetime, timedelta
from typing import Iterable, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from . import auth, models, schemas
from .timeutil import as_utc, utcnow

PRIORITY_STARS = {"Low": 1, "Medium": 2, "High": 3}
MAX_OCCURRENCES = 100


# ---------------------------------------------------------------- users


def display_name(user: models.User) -> str:
    return user.full_name or user.username or user.email


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(func.lower(models.User.email) == email.lower()).first()


def get_user_by_username(db: Session, username: str) -> Optional[models.User]:
    return db.query(models.User).filter(func.lower(models.User.username) == username.lower()).first()


def get_user_by_identifier(db: Session, identifier: str) -> Optional[models.User]:
    identifier_lower = identifier.lower()
    return (
        db.query(models.User)
        .filter((func.lower(models.User.email) == identifier_lower) | (func.lower(models.User.username) == identifier_lower))
        .first()
    )


def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.get(models.User, user_id)


def get_users(db: Session) -> List[models.User]:
    return db.query(models.User).order_by(models.User.created_at.desc(), models.User.id.desc()).all()


def get_children(db: Session) -> List[models.User]:
    return (
        db.query(models.User)
        .filter(models.User.role == models.UserRole.child)
        .order_by(models.User.created_at.desc(), models.User.id.desc())
        .all()
    )


def find_identity_conflict(db: Session, email: Optional[str], username: Optional[str], exclude_id: Optional[int] = None) -> bool:
    for user in (email and get_user_by_email(db, email), username and get_user_by_username(db, username)):
        if user and user.id != exclude_id:
            return True
    return False


def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    db_user = models.User(
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        hashed_password=auth.get_password_hash(user.password),
        role=user.role,
        token_version=0,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def update_user(db: Session, user: models.User, user_update: schemas.UserUpdate) -> models.User:
    for field, value in user_update.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def set_password(db: Session, user: models.User, new_password: str) -> None:
    user.hashed_password = auth.get_password_hash(new_password)
    user.token_version = (user.token_version or 0) + 1
    db.commit()


def delete_user(db: Session, user: models.User) -> None:
    # Tasks they created, their assignments and star history cascade through the ORM.
    db.query(models.TaskStatusLog).filter(models.TaskStatusLog.changed_by == user.id).delete()
    db.query(models.TaskOccurrence).filter(models.TaskOccurrence.completed_by == user.id).update({"completed_by": None})
    db.delete(user)
    db.commit()


def authenticate_user(db: Session, identifier: str, password: str) -> Optional[models.User]:
    user = get_user_by_identifier(db, identifier)
    if user and auth.verify_password(password, user.hashed_password):
        return user
    return None


def get_or_create_app_secret(db: Session, name: str) -> str:
    secret = db.get(models.AppSecret, name)
    if secret is None:
        secret = models.AppSecret(name=name, value=secrets.token_urlsafe(48))
        db.add(secret)
        db.commit()
    return secret.value


# ---------------------------------------------------------------- tasks


def all_children(db: Session, child_ids: Iterable[int]) -> bool:
    ids = set(child_ids)
    found = db.query(models.User).filter(models.User.id.in_(ids), models.User.role == models.UserRole.child).count()
    return found == len(ids)


def task_shape_error(task_type: str, recurrence: Optional[str], assignee_ids: List[int]) -> Optional[str]:
    if task_type == models.TaskType.rotating and len(set(assignee_ids)) < 2:
        return "Rotating tasks require at least 2 assignees"
    if task_type == models.TaskType.recurring and not recurrence:
        return "Recurring tasks require a recurrence"
    return None


def _log(db: Session, task: models.Task, user_id: int, previous: models.TaskStatus, new: models.TaskStatus) -> None:
    db.add(models.TaskStatusLog(task_id=task.id, changed_by=user_id, previous_status=previous, new_status=new))


def create_task(db: Session, data: schemas.TaskCreate, creator_id: int) -> models.Task:
    recurring = data.task_type == models.TaskType.recurring
    task = models.Task(
        title=data.title,
        description=data.description,
        due_date=data.due_date,
        # Default recurring tasks to the start of today so each period's chore is available all day.
        start_date=data.start_date or (utcnow().replace(hour=0, minute=0, second=0, microsecond=0) if recurring else None),
        priority=data.priority,
        recurrence=data.recurrence if recurring else None,
        task_type=data.task_type,
        status=models.TaskStatus.pending,
        created_by=creator_id,
    )
    db.add(task)
    db.flush()
    assign_task(task, data.assignee_ids)
    _log(db, task, creator_id, task.status, task.status)
    sync_occurrences(task)
    db.commit()
    db.refresh(task)
    return task


def assign_task(task: models.Task, child_ids: List[int]) -> List[int]:
    """Set the task's assignees, keeping progress for children who stay. Returns newly added child ids."""
    child_ids = list(dict.fromkeys(child_ids))
    rotating = task.task_type == models.TaskType.rotating
    existing = {a.child_id: a for a in task.assignments}
    for child_id, assignment in existing.items():
        if child_id not in child_ids:
            task.assignments.remove(assignment)
    added = []
    for order, child_id in enumerate(child_ids):
        assignment = existing.get(child_id)
        if assignment is None:
            assignment = models.TaskAssignment(child_id=child_id, completed=False, is_active=False)
            task.assignments.append(assignment)
            added.append(child_id)
        assignment.rotation_order = order if rotating else None
    ordered = sorted(task.assignments, key=lambda a: child_ids.index(a.child_id))
    active = None
    if rotating:
        active = next((a for a in ordered if a.is_active and not a.completed), None) or next(
            (a for a in ordered if not a.completed), None
        )
    for assignment in ordered:
        assignment.is_active = (assignment is active) if rotating else True
    return added


def _schedule(start: datetime, recurrence: str, step: int) -> datetime:
    if recurrence == "daily":
        return start + timedelta(days=step)
    if recurrence == "weekly":
        return start + timedelta(weeks=step)
    months = step if recurrence == "monthly" else 12 * step
    index = start.month - 1 + months
    year, month = start.year + index // 12, index % 12 + 1
    # Clamp to the month length so the 31st (or Feb 29th) keeps working.
    return start.replace(year=year, month=month, day=min(start.day, calendar.monthrange(year, month)[1]))


def recurrence_dates(start: datetime, recurrence: str, until: datetime) -> List[datetime]:
    dates = []
    current, step = start, 0
    while current <= until:
        dates.append(current)
        step += 1
        current = _schedule(start, recurrence, step)
    return dates[-MAX_OCCURRENCES:]


def sync_occurrences(task: models.Task) -> bool:
    """Make sure a recurring task has one occurrence per scheduled date up to now. Returns True if changed."""
    wanted = set()
    if task.task_type == models.TaskType.recurring and task.recurrence:
        start = as_utc(task.start_date or task.created_at)
        wanted = set(recurrence_dates(start, task.recurrence, utcnow()))
    changed = False
    for occurrence in list(task.occurrences):
        when = as_utc(occurrence.occurrence_date)
        if when in wanted:
            wanted.discard(when)
        elif occurrence.status != models.TaskStatus.completed:
            task.occurrences.remove(occurrence)
            changed = True
    for when in sorted(wanted):
        task.occurrences.append(models.TaskOccurrence(occurrence_date=when, status=models.TaskStatus.pending))
        changed = True
    return changed


def refresh_tasks(db: Session, tasks: List[models.Task]) -> List[models.Task]:
    if any([sync_occurrences(task) for task in tasks]):
        db.commit()
    return tasks


def _task_query(db: Session):
    return db.query(models.Task).options(selectinload(models.Task.assignments), selectinload(models.Task.occurrences))


def get_task(db: Session, task_id: int) -> Optional[models.Task]:
    return db.get(models.Task, task_id)


def get_tasks_for_parent(db: Session, parent_id: int, status: Optional[str] = None, child_id: Optional[int] = None) -> List[models.Task]:
    query = _task_query(db).filter(models.Task.created_by == parent_id)
    if status in models.TaskStatus.__members__:
        query = query.filter(models.Task.status == models.TaskStatus(status))
    if child_id:
        query = query.join(models.Task.assignments).filter(models.TaskAssignment.child_id == child_id)
    return query.order_by(models.Task.created_at.desc(), models.Task.id.desc()).all()


def get_tasks_for_child(db: Session, child_id: int) -> List[models.Task]:
    return (
        _task_query(db)
        .join(models.Task.assignments)
        .filter(models.TaskAssignment.child_id == child_id)
        .filter((models.Task.task_type != models.TaskType.rotating) | (models.TaskAssignment.is_active == True))  # noqa: E712
        .order_by(models.Task.created_at.desc(), models.Task.id.desc())
        .all()
    )


def update_task(db: Session, task: models.Task, task_update: schemas.TaskUpdate) -> List[int]:
    """Apply an update and return child ids that were newly assigned."""
    changes = task_update.model_dump(exclude_unset=True)
    assignee_ids = changes.pop("assignee_ids", None)
    for field, value in changes.items():
        setattr(task, field, value)
    if task.task_type != models.TaskType.recurring:
        task.recurrence = None
    added = assign_task(task, assignee_ids if assignee_ids is not None else [a.child_id for a in task.assignments])
    sync_occurrences(task)
    db.commit()
    db.refresh(task)
    return added


def delete_task(db: Session, task: models.Task) -> None:
    db.delete(task)
    db.commit()


def _rotation(task: models.Task) -> List[models.TaskAssignment]:
    return sorted(task.assignments, key=lambda a: a.rotation_order or 0)


def _next_in_rotation(ordered: List[models.TaskAssignment], current: Optional[models.TaskAssignment]):
    start = ordered.index(current) + 1 if current in ordered else 0
    return next((a for a in ordered[start:] + ordered[:start] if a is not current and not a.completed), None)


def advance_rotating_task(db: Session, task: models.Task, user_id: int) -> Optional[int]:
    """Pass a rotating task to the next child in order. Returns the newly active child id."""
    ordered = _rotation(task)
    current = next((a for a in ordered if a.is_active), None)
    if current is None:
        finished = [a for a in ordered if a.completed_at]
        current = max(finished, key=lambda a: as_utc(a.completed_at)) if finished else None
    following = _next_in_rotation(ordered, current)
    if following is None:
        # Everyone has had their turn: start a new round.
        for assignment in ordered:
            assignment.completed = False
            assignment.completed_at = None
        following = _next_in_rotation(ordered, current)
    for assignment in ordered:
        assignment.is_active = assignment is following
    previous = task.status
    task.status = models.TaskStatus.pending
    _log(db, task, user_id, previous, task.status)
    db.commit()
    db.refresh(task)
    return following.child_id


def _award(db: Session, child_id: int, task: models.Task) -> None:
    db.add(
        models.CompletionEvent(
            child_id=child_id,
            task_id=task.id,
            task_title=task.title,
            stars=PRIORITY_STARS.get(task.priority, 1),
            completed_at=utcnow(),
        )
    )


def complete_assignment(db: Session, assignment: models.TaskAssignment) -> Optional[int]:
    """Mark a child's assignment done and award stars. For rotating tasks returns the next child's id."""
    task = assignment.task
    previous = task.status
    assignment.completed = True
    assignment.completed_at = utcnow()
    next_child_id = None
    if task.task_type == models.TaskType.rotating:
        assignment.is_active = False
        following = _next_in_rotation(_rotation(task), assignment)
        if following:
            following.is_active = True
            next_child_id = following.child_id
            task.status = models.TaskStatus.pending
        else:
            task.status = models.TaskStatus.completed
    elif all(a.completed for a in task.assignments):
        task.status = models.TaskStatus.completed
    else:
        task.status = models.TaskStatus.in_progress
    _award(db, assignment.child_id, task)
    _log(db, task, assignment.child_id, previous, task.status)
    db.commit()
    return next_child_id


def get_task_status_logs(db: Session, task_id: int) -> List[models.TaskStatusLog]:
    return (
        db.query(models.TaskStatusLog)
        .filter(models.TaskStatusLog.task_id == task_id)
        .order_by(models.TaskStatusLog.changed_at.desc(), models.TaskStatusLog.id.desc())
        .all()
    )


def update_task_status(db: Session, task: models.Task, user_id: int, new_status: models.TaskStatus) -> None:
    if task.status != new_status:
        _log(db, task, user_id, task.status, new_status)
        task.status = new_status
        db.commit()


def get_occurrence(db: Session, occurrence_id: int) -> Optional[models.TaskOccurrence]:
    return db.get(models.TaskOccurrence, occurrence_id)


def set_occurrence_status(db: Session, occurrence: models.TaskOccurrence, user_id: int, new_status: models.TaskStatus) -> models.TaskOccurrence:
    previous = occurrence.status
    if previous != new_status:
        occurrence.status = new_status
        done = new_status == models.TaskStatus.completed
        occurrence.completed_at = utcnow() if done else None
        occurrence.completed_by = user_id if done else None
        _log(db, occurrence.task, user_id, previous, new_status)
        db.commit()
    db.refresh(occurrence)
    return occurrence


def complete_occurrence(db: Session, occurrence: models.TaskOccurrence, child_id: int) -> bool:
    """A child completes an occurrence. Returns False if it was already completed."""
    if occurrence.status == models.TaskStatus.completed:
        return False
    _award(db, child_id, occurrence.task)
    set_occurrence_status(db, occurrence, child_id, models.TaskStatus.completed)
    return True


# ---------------------------------------------------------------- stats


def get_child_stats(db: Session, child_id: int) -> dict:
    events = db.query(models.CompletionEvent).filter(models.CompletionEvent.child_id == child_id).all()
    days = {as_utc(event.completed_at).date() for event in events}
    day = utcnow().date()
    if day not in days:
        day -= timedelta(days=1)  # today's streak is still alive until midnight
    streak = 0
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return {"stars": sum(event.stars for event in events), "completed_count": len(events), "streak_days": streak}


def current_status(task: models.Task) -> models.TaskStatus:
    """A recurring task's status is that of its current (newest) occurrence."""
    if task.task_type == models.TaskType.recurring and task.occurrences:
        return task.occurrences[0].status
    return task.status


def get_completion_stats(db: Session, parent_id: int) -> dict:
    tasks = refresh_tasks(db, get_tasks_for_parent(db, parent_id))
    statuses = [current_status(task) for task in tasks]
    counts = {status: statuses.count(status) for status in models.TaskStatus}
    leaderboard = [
        {"child_id": child.id, "name": display_name(child), **get_child_stats(db, child.id)}
        for child in get_children(db)
    ]
    leaderboard.sort(key=lambda entry: entry["stars"], reverse=True)
    return {
        "total_tasks": len(tasks),
        "completed_tasks": counts[models.TaskStatus.completed],
        "pending_tasks": counts[models.TaskStatus.pending],
        "in_progress_tasks": counts[models.TaskStatus.in_progress],
        "failed_tasks": counts[models.TaskStatus.failed],
        "children": leaderboard,
    }
