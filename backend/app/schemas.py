from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, EmailStr


class UserRole(str, Enum):
    admin = "admin"
    parent = "parent"
    child = "child"


class TaskStatus(str, Enum):
    pending = "pending"
    completed = "completed"


class TaskRecurrence(str, Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[UserRole] = None


class UserBase(BaseModel):
    email: EmailStr
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: UserRole


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None


class UserRead(UserBase):
    username: Optional[str] = None
    id: int
    created_at: datetime

    class Config:
        orm_mode = True


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    assignee_ids: Optional[List[int]] = []
    recurrence: Optional[TaskRecurrence] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    status: Optional[TaskStatus] = None
    assignee_ids: Optional[List[int]] = None
    recurrence: Optional[TaskRecurrence] = None


class AssignmentRead(BaseModel):
    id: int
    child_id: int
    completed: bool
    completed_at: Optional[datetime] = None
    assigned_at: datetime

    class Config:
        orm_mode = True


class TaskRead(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    recurrence: Optional[TaskRecurrence] = None
    status: TaskStatus
    created_by: int
    created_at: datetime
    assignments: List[AssignmentRead] = []

    class Config:
        orm_mode = True


class LoginData(BaseModel):
    email: EmailStr
    password: str
