from datetime import datetime
from enum import Enum
from typing import Annotated, List, Literal, Optional

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator

from .timeutil import as_utc

# Datetimes are normalized to aware UTC both on input and on output, so the frontend
# always receives an explicit offset and SQLite round-trips do not shift times.
UTCDateTime = Annotated[datetime, AfterValidator(as_utc)]
Priority = Literal["Low", "Medium", "High"]
Password = Annotated[str, Field(min_length=8, max_length=128)]


class UserRole(str, Enum):
    admin = "admin"
    parent = "parent"
    child = "child"


class TaskStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    failed = "failed"
    completed = "completed"


class TaskRecurrence(str, Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"


class TaskType(str, Enum):
    adhoc = "adhoc"
    recurring = "recurring"
    rotating = "rotating"


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str


class Message(BaseModel):
    message: str


class Health(BaseModel):
    status: str
    version: str
    environment: str


class _UserFields(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("username", "full_name", mode="before", check_fields=False)
    @classmethod
    def blank_to_none(cls, value):
        # Empty strings would collide on the unique username column.
        return str(value or "").strip() or None


class UserCreate(_UserFields):
    email: EmailStr
    username: Optional[str] = Field(None, max_length=50)
    full_name: Optional[str] = Field(None, max_length=100)
    role: UserRole
    password: Password


class UserUpdate(_UserFields):
    email: Optional[EmailStr] = None
    username: Optional[str] = Field(None, max_length=50)
    full_name: Optional[str] = Field(None, max_length=100)
    role: Optional[UserRole] = None


class UserRead(ORMModel):
    id: int
    email: str
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: UserRole
    created_at: UTCDateTime


class AdminPasswordReset(BaseModel):
    email: str
    new_password: Password


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: Password


class _TaskFields(BaseModel):
    model_config = ConfigDict(use_enum_values=True, str_strip_whitespace=True)


class TaskCreate(_TaskFields):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    due_date: Optional[UTCDateTime] = None
    start_date: Optional[UTCDateTime] = None
    priority: Optional[Priority] = None
    assignee_ids: List[int] = []
    recurrence: Optional[TaskRecurrence] = None
    task_type: TaskType = TaskType.adhoc


class TaskUpdate(_TaskFields):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    due_date: Optional[UTCDateTime] = None
    start_date: Optional[UTCDateTime] = None
    priority: Optional[Priority] = None
    status: Optional[TaskStatus] = None
    assignee_ids: Optional[List[int]] = None
    recurrence: Optional[TaskRecurrence] = None
    task_type: Optional[TaskType] = None


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskStatusLogRead(ORMModel):
    id: int
    task_id: int
    changed_by: int
    previous_status: TaskStatus
    new_status: TaskStatus
    changed_at: UTCDateTime


class AssignmentRead(ORMModel):
    id: int
    child_id: int
    completed: bool
    completed_at: Optional[UTCDateTime] = None
    assigned_at: UTCDateTime
    rotation_order: Optional[int] = None
    is_active: bool = True


class OccurrenceRead(ORMModel):
    id: int
    task_id: int
    occurrence_date: UTCDateTime
    status: TaskStatus
    completed_at: Optional[UTCDateTime] = None
    completed_by: Optional[int] = None


class TaskRead(ORMModel):
    id: int
    title: str
    description: Optional[str] = None
    due_date: Optional[UTCDateTime] = None
    start_date: Optional[UTCDateTime] = None
    priority: Optional[str] = None
    recurrence: Optional[TaskRecurrence] = None
    task_type: TaskType = TaskType.adhoc
    status: TaskStatus
    created_by: int
    created_at: UTCDateTime
    assignments: List[AssignmentRead] = []
    occurrences: List[OccurrenceRead] = []


class ChildStats(BaseModel):
    stars: int
    completed_count: int
    streak_days: int


class ChildLeaderboardEntry(ChildStats):
    child_id: int
    name: str


class ParentStats(BaseModel):
    total_tasks: int
    completed_tasks: int
    pending_tasks: int
    in_progress_tasks: int
    failed_tasks: int
    children: List[ChildLeaderboardEntry]
