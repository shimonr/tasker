from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

SQLALCHEMY_DATABASE_URL = "sqlite:///./tasker.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db() -> None:
    from . import models

    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN recurrence VARCHAR"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN start_date DATETIME"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN task_type VARCHAR DEFAULT 'adhoc'"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE task_assignments ADD COLUMN rotation_order INTEGER"))
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE task_assignments ADD COLUMN is_active BOOLEAN DEFAULT 1"))
        except Exception:
            pass
        try:
            conn.execute(text("UPDATE tasks SET task_type = 'recurring' WHERE recurrence IS NOT NULL AND task_type = 'adhoc'"))
        except Exception:
            pass
