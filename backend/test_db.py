
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load credentials from backend/.env
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

database_url = os.getenv("DATABASE_URL")

if not database_url:
    raise RuntimeError("DATABASE_URL is missing from backend/.env")

engine = create_engine(database_url)

try:
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT current_database(), current_user")
        )
        database, user = result.fetchone()
        print("Database connection successful!")
        print(f"Database: {database}")
        print(f"User: {user}")
except Exception as error:
    print(f"Database connection failed: {error}")
finally:
    engine.dispose()
