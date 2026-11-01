import os
from datetime import datetime, timedelta, timezone

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET_KEY"] = "test-only-secret-key-with-at-least-32-bytes"
os.environ["JWT_ALGORITHM"] = "HS256"

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import User


@pytest.fixture
def api():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
    )
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            yield client, session_factory
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def register_user(client: TestClient, email: str = "person@example.com"):
    response = client.post(
        "/users/register",
        json={
            "full_name": "Test Person",
            "email": email,
            "password": "safe-password-123",
            "role": "user",
        },
    )
    assert response.status_code == 201
    return response.json()


def login(client: TestClient, email: str = "person@example.com"):
    return client.post(
        "/users/login",
        json={"email": email, "password": "safe-password-123"},
    )


def test_registration_login_and_authenticated_profile(api):
    client, _ = api
    user = register_user(client)

    response = login(client, "PERSON@example.com")
    assert response.status_code == 200
    token = response.json()["access_token"]
    assert response.json()["token_type"] == "bearer"

    profile = client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert profile.status_code == 200
    assert profile.json()["id"] == user["id"]
    assert profile.json()["email"] == "person@example.com"
    assert "password_hash" not in profile.json()


@pytest.mark.parametrize("role", ["restaurant", "ngo", "agent", "school", "admin"])
def test_public_registration_cannot_assign_privileged_roles(api, role):
    client, session_factory = api
    response = client.post(
        "/users/register",
        json={
            "full_name": "Test Person",
            "email": f"{role}@example.com",
            "password": "safe-password-123",
            "role": role,
        },
    )

    assert response.status_code == 422
    with session_factory() as db:
        assert db.query(User).filter_by(email=f"{role}@example.com").first() is None


def test_public_registration_defaults_to_community_user(api):
    client, _ = api
    response = client.post(
        "/users/register",
        json={
            "full_name": "Test Person",
            "email": "default-role@example.com",
            "password": "safe-password-123",
        },
    )

    assert response.status_code == 201
    assert response.json()["role"] == "user"


def test_registration_prevents_case_insensitive_duplicate_emails(api):
    client, _ = api
    register_user(client, "same@example.com")
    response = client.post(
        "/users/register",
        json={
            "full_name": "Second Person",
            "email": "SAME@example.com",
            "password": "safe-password-456",
        },
    )
    assert response.status_code == 409


def test_privileged_provisioning_is_server_side_and_admin_bootstrap_is_one_time(api):
    from provision_user import provision_user
    from models import AdminAuditLog

    _, session_factory = api
    with session_factory() as db:
        admin = provision_user(
            db,
            full_name="First Admin",
            email="ADMIN@example.com",
            password="secure-admin-password",
            role="admin",
        )
        assert admin.email == "admin@example.com"
        assert admin.role == "admin"
        assert admin.is_active is True
        assert admin.is_verified is True
        assert admin.password_hash != "secure-admin-password"
        audit_entry = db.query(AdminAuditLog).filter_by(
            resource_id=admin.id
        ).one()
        assert audit_entry.actor_type == "bootstrap_cli"
        assert audit_entry.action == "account.provisioned"

        with pytest.raises(ValueError, match="one-time"):
            provision_user(
                db,
                full_name="Second Admin",
                email="second-admin@example.com",
                password="secure-admin-password",
                role="admin",
            )
        with pytest.raises(ValueError, match="Role must"):
            provision_user(
                db,
                full_name="Community User",
                email="other@example.com",
                password="secure-admin-password",
                role="user",
            )


def test_profile_requires_a_valid_bearer_token(api):
    client, _ = api
    register_user(client)

    assert client.get("/users/me").status_code == 401
    invalid = client.get(
        "/users/me",
        headers={"Authorization": "Bearer not-a-jwt"},
    )
    assert invalid.status_code == 401
    assert invalid.headers["www-authenticate"] == "Bearer"


def test_openapi_documents_bearer_token_authentication(api):
    client, _ = api
    schemes = client.get("/openapi.json").json()["components"]["securitySchemes"]

    assert schemes["HTTPBearer"] == {"type": "http", "scheme": "bearer"}


def test_database_initialization_adds_audit_actor_type_without_losing_rows(monkeypatch):
    import database
    from sqlalchemy import create_engine, text

    test_engine = create_engine("sqlite://")
    with test_engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, full_name VARCHAR(120), "
            "email VARCHAR(255), password_hash VARCHAR(255), role VARCHAR(30), "
            "is_verified BOOLEAN, is_active BOOLEAN)"
        ))
        connection.execute(text(
            "CREATE TABLE admin_audit_logs (id INTEGER PRIMARY KEY, "
            "admin_id INTEGER NOT NULL, action VARCHAR(80) NOT NULL, "
            "resource_type VARCHAR(80) NOT NULL, resource_id INTEGER, "
            "details JSON NOT NULL, created_at DATETIME NOT NULL)"
        ))
        connection.execute(text(
            "INSERT INTO users (id, full_name, email, password_hash, role, "
            "is_verified, is_active) VALUES (1, 'Admin', 'admin@test.local', "
            "'hash', 'admin', 1, 1)"
        ))
        connection.execute(text(
            "INSERT INTO admin_audit_logs (id, admin_id, action, resource_type, "
            "resource_id, details, created_at) VALUES "
            "(1, 1, 'user.updated', 'user', 2, '{}', '2026-01-01 00:00:00')"
        ))

    monkeypatch.setattr(database, "engine", test_engine)
    database.initialize_database()
    with test_engine.connect() as connection:
        audit = connection.execute(text(
            "SELECT id, action, actor_type FROM admin_audit_logs"
        )).one()
    assert audit == (1, "user.updated", "admin")
    test_engine.dispose()


def test_expired_token_is_rejected(api):
    client, _ = api
    expired_token = jwt.encode(
        {
            "sub": "1",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
        os.environ["JWT_SECRET_KEY"],
        algorithm=os.environ["JWT_ALGORITHM"],
    )

    response = client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert response.status_code == 401


def test_inactive_account_cannot_log_in_or_use_existing_token(api):
    client, session_factory = api
    register_user(client)
    token = login(client).json()["access_token"]

    with session_factory() as db:
        user = db.query(User).filter_by(email="person@example.com").one()
        user.is_active = False
        db.commit()

    assert login(client).status_code == 401
    response = client.get(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401


def test_login_rejects_unknown_email_and_wrong_password(api):
    client, _ = api
    register_user(client)

    unknown = client.post(
        "/users/login",
        json={"email": "missing@example.com", "password": "safe-password-123"},
    )
    wrong_password = client.post(
        "/users/login",
        json={"email": "person@example.com", "password": "wrong-password"},
    )
    assert unknown.status_code == 401
    assert wrong_password.status_code == 401
