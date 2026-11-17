import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


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


class RedemptionStatus(str, enum.Enum):
    requested = "requested"
    fulfilled = "fulfilled"


class Family(Base):
    __tablename__ = "families"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    # Shared with new members so they can join; regenerated on demand.
    invite_code = Column(String, unique=True, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    members = relationship("User", back_populates="family")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=True)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.child)
    # Bumped on every password change so older tokens stop working.
    token_version = Column(Integer, nullable=False, default=0)
    # Self-signed-up accounts must open the link we email before they can sign in.
    email_verified = Column(Boolean, nullable=False, default=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=True, index=True)
    avatar = Column(String(8), nullable=True)
    color = Column(String(7), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    family = relationship("Family", back_populates="members")
    tasks_created = relationship("Task", back_populates="creator", cascade="all, delete-orphan")
    assignments = relationship("TaskAssignment", back_populates="child", cascade="all, delete-orphan")
    completion_events = relationship("CompletionEvent", back_populates="child", cascade="all, delete-orphan")
    redemptions = relationship("Redemption", back_populates="child", cascade="all, delete-orphan")
    push_subscriptions = relationship("PushSubscription", cascade="all, delete-orphan")

    @property
    def family_name(self):
        return self.family.name if self.family else None


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
    # When true, a child's completion waits for a parent to approve it before stars are awarded.
    requires_approval = Column(Boolean, nullable=False, default=False)

    creator = relationship("User", back_populates="tasks_created")
    assignments = relationship("TaskAssignment", back_populates="task", cascade="all, delete-orphan")
    status_logs = relationship("TaskStatusLog", back_populates="task", cascade="all, delete-orphan")
    occurrences = relationship(
        "TaskOccurrence",
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="TaskOccurrence.occurrence_date.desc()",
    )


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
    awaiting_approval = Column(Boolean, nullable=False, default=False)
    reminded_at = Column(DateTime(timezone=True), nullable=True)

    task = relationship("Task", back_populates="assignments")
    child = relationship("User", back_populates="assignments")


class TaskOccurrence(Base):
    __tablename__ = "task_occurrences"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    occurrence_date = Column(DateTime(timezone=True), nullable=False)
    status = Column(Enum(TaskStatus), nullable=False, default=TaskStatus.pending)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    # Who completed it; while awaiting approval, the child waiting for it.
    completed_by = Column(Integer, nullable=True)
    awaiting_approval = Column(Boolean, nullable=False, default=False)
    reminded_at = Column(DateTime(timezone=True), nullable=True)

    task = relationship("Task", back_populates="occurrences")


class CompletionEvent(Base):
    """A star award: one row per chore a child completes. Survives task deletion and rotation resets."""

    __tablename__ = "completion_events"

    id = Column(Integer, primary_key=True, index=True)
    child_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(Integer, nullable=True)
    task_title = Column(String, nullable=False)
    stars = Column(Integer, nullable=False, default=1)
    completed_at = Column(DateTime(timezone=True), nullable=False)

    child = relationship("User", back_populates="completion_events")


class Reward(Base):
    __tablename__ = "rewards"

    id = Column(Integer, primary_key=True, index=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    emoji = Column(String(8), nullable=True)
    cost = Column(Integer, nullable=False)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Redemption(Base):
    """A child spending stars on a reward. Keeps the name and cost even if the reward is later changed or deleted."""

    __tablename__ = "redemptions"

    id = Column(Integer, primary_key=True, index=True)
    reward_id = Column(Integer, ForeignKey("rewards.id", ondelete="SET NULL"), nullable=True)
    reward_name = Column(String, nullable=False)
    reward_emoji = Column(String(8), nullable=True)
    child_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    cost = Column(Integer, nullable=False)
    status = Column(Enum(RedemptionStatus), nullable=False, default=RedemptionStatus.requested)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    fulfilled_at = Column(DateTime(timezone=True), nullable=True)

    child = relationship("User", back_populates="redemptions")

    @property
    def child_name(self):
        return self.child.full_name or self.child.username or self.child.email


class AppSecret(Base):
    __tablename__ = "app_secrets"

    name = Column(String, primary_key=True)
    value = Column(String, nullable=False)


class PushSubscription(Base):
    """A browser or phone that asked for notifications. One row per push endpoint."""

    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    endpoint = Column(String, unique=True, nullable=False)
    p256dh = Column(String, nullable=False)
    auth = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
