
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError


def main() -> int:
    env_path = Path(__file__).parent / ".env"
    load_dotenv(env_path)

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("Database connection failed: DATABASE_URL is not configured.", file=sys.stderr)
        return 1

    engine = None
    try:
        engine = create_engine(database_url)
        with engine.connect() as connection:
            database, user = connection.execute(
                text("SELECT current_database(), current_user")
            ).one()
        print("Database connection successful!")
        print(f"Database: {database}")
        print(f"User: {user}")
        return 0
    except (SQLAlchemyError, ImportError) as error:
        print(
            f"Database connection failed ({type(error).__name__}). "
            "Check DATABASE_URL and database availability.",
            file=sys.stderr,
        )
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
