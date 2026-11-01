
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Load environment variables from backend/.env
load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing from backend/.env")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        if "admin_audit_logs" not in inspect(connection).get_table_names():
            return
        audit_columns = {
            column["name"]
            for column in inspect(connection).get_columns("admin_audit_logs")
        }
        if "actor_type" not in audit_columns:
            connection.execute(text(
                "ALTER TABLE admin_audit_logs "
                "ADD COLUMN actor_type VARCHAR(30) NOT NULL DEFAULT 'admin'"
            ))


def get_db():
    """Provide one database session per API request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
