import argparse
import getpass
import sys

from pwdlib import PasswordHash
from pydantic import EmailStr, TypeAdapter
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import SessionLocal, initialize_database
from models import AdminAuditLog, User

PRIVILEGED_ROLES = ("restaurant", "ngo", "agent", "school", "admin")
password_hash = PasswordHash.recommended()


def provision_user(
    db: Session,
    *,
    full_name: str,
    email: str,
    password: str,
    role: str,
) -> User:
    if role not in PRIVILEGED_ROLES:
        raise ValueError(f"Role must be one of: {', '.join(PRIVILEGED_ROLES)}")
    if len(full_name.strip()) < 2 or len(full_name) > 120:
        raise ValueError("Full name must be between 2 and 120 characters.")
    if len(password) < 8 or len(password) > 128:
        raise ValueError("Password must be between 8 and 128 characters.")

    try:
        normalized_email = str(TypeAdapter(EmailStr).validate_python(email.strip())).lower()
    except ValueError as error:
        raise ValueError("A valid email address is required.") from error
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        raise ValueError("An account with this email already exists.")

    if role == "admin":
        if db.bind and db.bind.dialect.name == "postgresql":
            db.execute(text("LOCK TABLE users IN EXCLUSIVE MODE"))
        if db.query(User).filter(User.role == "admin").first():
            raise ValueError("An Admin account already exists; bootstrap is one-time.")

    user = User(
        full_name=full_name.strip(),
        email=normalized_email,
        password_hash=password_hash.hash(password),
        role=role,
        is_verified=True,
        is_active=True,
    )
    try:
        db.add(user)
        db.flush()
        db.add(AdminAuditLog(
            admin_id=user.id,
            actor_type="bootstrap_cli" if role == "admin" else "provisioning_cli",
            action="account.provisioned",
            resource_type="user",
            resource_id=user.id,
            details={"role": role, "email": normalized_email},
        ))
        db.commit()
        db.refresh(user)
    except IntegrityError as error:
        db.rollback()
        raise ValueError("Could not provision account; email may already exist.") from error
    return user


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Provision a privileged FoodRescue account from a trusted server shell."
    )
    parser.add_argument("--full-name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", required=True, choices=PRIVILEGED_ROLES)
    args = parser.parse_args()

    password = getpass.getpass("Password (not displayed): ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 2

    try:
        initialize_database()
        with SessionLocal() as db:
            user = provision_user(
                db,
                full_name=args.full_name,
                email=args.email,
                password=password,
                role=args.role,
            )
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    print(f"Provisioned {user.role} account for {user.email} (id={user.id}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
