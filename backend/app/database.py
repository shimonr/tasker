import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


def engine_options(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True}


DATABASE_URL = normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./tasker.db"))
engine = create_engine(DATABASE_URL, **engine_options(DATABASE_URL))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Columns added after the first release. create_all() never alters existing tables,
# so older databases get them here. Types are valid on both SQLite and PostgreSQL.
ADDED_COLUMNS = [
    ("tasks", "recurrence", "VARCHAR"),
    ("tasks", "start_date", "TIMESTAMP WITH TIME ZONE"),
    ("tasks", "task_type", "VARCHAR(9) DEFAULT 'adhoc'"),
    ("task_assignments", "rotation_order", "INTEGER"),
    ("task_assignments", "is_active", "BOOLEAN DEFAULT TRUE"),
    ("users", "token_version", "INTEGER NOT NULL DEFAULT 0"),
    ("task_occurrences", "completed_by", "INTEGER"),
]


def upgrade_schema(bind: Engine) -> None:
    with bind.begin() as conn:
        # Inspect through the same connection so nothing else resets this transaction.
        inspector = inspect(conn)
        for table, column, ddl in ADDED_COLUMNS:
            if column in {c["name"] for c in inspector.get_columns(table)}:
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            if (table, column) == ("tasks", "task_type"):
                conn.execute(text("UPDATE tasks SET task_type = 'recurring' WHERE recurrence IS NOT NULL"))
        # Older releases stored plaintext copies of passwords. Wipe them.
        if "display_password" in {c["name"] for c in inspector.get_columns("users")}:
            conn.execute(text("UPDATE users SET display_password = NULL WHERE display_password IS NOT NULL"))


def init_db(bind: Engine | None = None) -> None:
    from . import models  # noqa: F401  (registers tables)

    bind = bind or engine
    Base.metadata.create_all(bind=bind)
    upgrade_schema(bind)
