from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    parent = "parent"
    child = "child"


class TaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    failed = "failed"
    completed = "completed"


class TaskType(str, enum.Enum):
    adhoc = "adhoc"
    recurring = "recurring"
    rotating = "rotating"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=True)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.child)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    tasks_created = relationship("Task", back_populates="creator")
    assignments = relationship("TaskAssignment", back_populates="child")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=True)
    priority = Column(String, nullable=True)
    status = Column(Enum(TaskStatus), nullable=False, default=TaskStatus.pending)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    recurrence = Column(String, nullable=True)
    task_type = Column(Enum(TaskType), nullable=False, default=TaskType.adhoc)

    creator = relationship("User", back_populates="tasks_created")
    assignments = relationship("TaskAssignment", back_populates="task", cascade="all, delete")
    status_logs = relationship("TaskStatusLog", back_populates="task", cascade="all, delete-orphan")
    occurrences = relationship("TaskOccurrence", back_populates="task", cascade="all, delete-orphan")


class TaskStatusLog(Base):
    __tablename__ = "task_status_logs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    previous_status = Column(Enum(TaskStatus), nullable=False)
    new_status = Column(Enum(TaskStatus), nullable=False)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("Task", back_populates="status_logs")


class TaskAssignment(Base):
    __tablename__ = "task_assignments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    child_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    completed = Column(Boolean, default=False)
    rotation_order = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)

    task = relationship("Task", back_populates="assignments")
    child = relationship("User", back_populates="assignments")


class TaskOccurrence(Base):
    __tablename__ = "task_occurrences"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    occurrence_date = Column(DateTime(timezone=True), nullable=False)
    status = Column(Enum(TaskStatus), nullable=False, default=TaskStatus.pending)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    task = relationship("Task", back_populates="occurrences")
