
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
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())
        if "admin_audit_logs" in table_names:
            audit_columns = {
                column["name"]
                for column in inspector.get_columns("admin_audit_logs")
            }
        else:
            audit_columns = set()
        if "admin_audit_logs" in table_names and "actor_type" not in audit_columns:
            connection.execute(text(
                "ALTER TABLE admin_audit_logs "
                "ADD COLUMN actor_type VARCHAR(30) NOT NULL DEFAULT 'admin'"
            ))

        location_columns = {
            "food_listings": {
                "pickup_latitude": "FLOAT",
                "pickup_longitude": "FLOAT",
            },
            "food_claims": {
                "delivery_address": "VARCHAR(500)",
                "delivery_latitude": "FLOAT",
                "delivery_longitude": "FLOAT",
                "volunteer_latitude": "FLOAT",
                "volunteer_longitude": "FLOAT",
                "volunteer_location_updated_at": "TIMESTAMP WITH TIME ZONE",
            },
        }
        for table_name, columns in location_columns.items():
            if table_name not in table_names:
                continue
            existing_columns = {
                column["name"] for column in inspector.get_columns(table_name)
            }
            for column_name, column_type in columns.items():
                if column_name not in existing_columns:
                    connection.execute(text(
                        f"ALTER TABLE {table_name} "
                        f"ADD COLUMN {column_name} {column_type}"
                    ))


def get_db():
    """Provide one database session per API request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
