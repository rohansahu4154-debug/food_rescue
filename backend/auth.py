
import os
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from sqlalchemy.orm import Session

from database import get_db
from models import User

load_dotenv(Path(__file__).parent / ".env")

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

if not JWT_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY is missing from backend/.env")
if len(JWT_SECRET_KEY.encode("utf-8")) < 32:
    raise RuntimeError("JWT_SECRET_KEY must contain at least 32 bytes.")
if JWT_ALGORITHM not in {"HS256", "HS384", "HS512"}:
    raise RuntimeError("JWT_ALGORITHM must be a supported HMAC algorithm.")

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise unauthorized

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
        user_id = payload.get("sub")

        if not user_id:
            raise unauthorized

        user = db.get(User, int(user_id))
        if not user or not user.is_active:
            raise unauthorized

        return user

    except (InvalidTokenError, ValueError, TypeError):
        raise unauthorized


def get_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access is required.",
        )
    return current_user
