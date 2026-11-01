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

import main
from database import Base, get_db
from main import app
from models import StockClearanceListing, User


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


def create_account(session_factory, email: str, role: str):
    with session_factory() as db:
        user = User(
            full_name=f"Test {role}",
            email=email,
            password_hash="test-only-not-used-for-authentication",
            role=role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id

    token = jwt.encode(
        {
            "sub": str(user_id),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        },
        os.environ["JWT_SECRET_KEY"],
        algorithm=os.environ["JWT_ALGORITHM"],
    )
    return user_id, {"Authorization": f"Bearer {token}"}


def test_stock_clearance_claim_updates_quantity_and_is_user_scoped(api):
    client, session_factory = api
    restaurant_id, restaurant_headers = create_account(
        session_factory, "restaurant@example.com", "restaurant"
    )
    _, customer_headers = create_account(
        session_factory, "customer@example.com", "user"
    )
    _, another_customer_headers = create_account(
        session_factory, "another@example.com", "user"
    )
    _, ngo_headers = create_account(
        session_factory, "ngo@example.com", "ngo"
    )

    offer_response = client.post(
        "/stock-clearance",
        headers=restaurant_headers,
        json={
            "title": "Surplus lunch meals",
            "description": "Freshly prepared",
            "quantity": 5,
            "unit": "meals",
            "original_price_paise": 10000,
            "pickup_location": "12 Green Street",
            "expires_at": (
                datetime.now(timezone.utc) + timedelta(hours=2)
            ).isoformat(),
        },
    )
    assert offer_response.status_code == 201
    offer = offer_response.json()
    assert offer["discount_percent"] == 10
    assert offer["discounted_price_paise"] == 9000

    expired_offer_response = client.post(
        "/stock-clearance",
        headers=restaurant_headers,
        json={
            "title": "Already expired",
            "quantity": 1,
            "unit": "meal",
            "original_price_paise": 10000,
            "pickup_location": "12 Green Street",
            "expires_at": (
                datetime.now(timezone.utc) - timedelta(minutes=1)
            ).isoformat(),
        },
    )
    assert expired_offer_response.status_code == 400

    assert client.post(
        f"/stock-clearance/{offer['id']}/claim",
        headers=restaurant_headers,
        json={"quantity": 1},
    ).status_code == 403
    assert client.post(
        f"/stock-clearance/{offer['id']}/claim",
        headers=ngo_headers,
        json={"quantity": 1},
    ).status_code == 403

    excessive_claim = client.post(
        f"/stock-clearance/{offer['id']}/claim",
        headers=customer_headers,
        json={"quantity": 6},
    )
    assert excessive_claim.status_code == 400
    assert client.post(
        f"/stock-clearance/{offer['id']}/claim",
        headers=customer_headers,
        json={"quantity": 0},
    ).status_code == 422

    claim_response = client.post(
        f"/stock-clearance/{offer['id']}/claim",
        headers=customer_headers,
        json={"quantity": 2},
    )
    assert claim_response.status_code == 201
    claim = claim_response.json()
    assert claim["quantity"] == 2
    assert claim["discount_percent"] == offer["discount_percent"]
    assert claim["unit_price_paise"] == offer["discounted_price_paise"]

    remaining = client.get("/stock-clearance").json()
    assert len(remaining) == 1
    assert remaining[0]["quantity"] == 3

    own_claims = client.get(
        "/stock-clearance/my-claims",
        headers=customer_headers,
    )
    assert own_claims.status_code == 200
    assert [item["id"] for item in own_claims.json()] == [claim["id"]]
    assert client.get(
        "/stock-clearance/my-claims",
        headers=another_customer_headers,
    ).json() == []
    assert client.get(
        "/stock-clearance/my-claims",
        headers=ngo_headers,
    ).status_code == 403

    expired_offer = StockClearanceListing(
        title="Expired meals",
        description=None,
        quantity=2,
        unit="meals",
        original_price_paise=10000,
        pickup_location="12 Green Street",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        creator_id=restaurant_id,
    )
    with session_factory() as db:
        db.add(expired_offer)
        db.commit()
        db.refresh(expired_offer)
        expired_offer_id = expired_offer.id

    expired_claim = client.post(
        f"/stock-clearance/{expired_offer_id}/claim",
        headers=customer_headers,
        json={"quantity": 1},
    )
    assert expired_claim.status_code == 400


def test_stock_clearance_discount_boundaries(monkeypatch):
    fixed_now = datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc)

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed_now if tz is None else fixed_now.astimezone(tz)

    monkeypatch.setattr(main, "datetime", FrozenDateTime)

    expected_discounts = (
        (0, 10),
        (59.999, 10),
        (60, 20),
        (119.999, 20),
        (120, 30),
        (179.999, 30),
        (180, 40),
        (239.999, 40),
        (240, 50),
        (600, 50),
    )
    for elapsed_seconds, expected_discount in expected_discounts:
        created_at = fixed_now - timedelta(seconds=elapsed_seconds)
        assert main.get_stock_discount(created_at) == expected_discount


def test_protected_endpoints_reject_missing_bearer_tokens(api):
    client, _ = api
    valid_expiry = (
        datetime.now(timezone.utc) + timedelta(hours=2)
    ).isoformat()
    protected_requests = (
        ("GET", "/users/me", None),
        ("POST", "/food-listings", {
            "title": "Test donation",
            "source_type": "restaurant",
            "quantity": 1,
            "unit": "meal",
            "price_paise": 0,
            "pickup_location": "Test location",
            "expires_at": valid_expiry,
        }),
        ("POST", "/food-listings/1/claim", None),
        ("GET", "/ngo/claims", None),
        ("GET", "/volunteer/tasks", None),
        ("POST", "/volunteer/tasks/1/collect", None),
        ("POST", "/volunteer/tasks/1/deliver", None),
        ("POST", "/stock-clearance", {
            "title": "Test meals",
            "quantity": 1,
            "unit": "meal",
            "original_price_paise": 100,
            "pickup_location": "Test location",
            "expires_at": valid_expiry,
        }),
        ("POST", "/stock-clearance/1/claim", {"quantity": 1}),
        ("GET", "/stock-clearance/my-claims", None),
        ("GET", "/restaurant/donations", None),
        ("GET", "/restaurant/analytics", None),
        ("GET", "/restaurant/stock-clearance", None),
        ("GET", "/restaurant/claims", None),
        ("GET", "/restaurant/stock-clearance-claims", None),
        ("PATCH", "/restaurant/donations/1", {"is_available": False}),
        ("PATCH", "/restaurant/stock-clearance/1", {"is_available": False}),
        ("PUT", "/restaurant/donations/1", {"title": "New title"}),
        ("PUT", "/restaurant/stock-clearance/1", {"title": "New title"}),
        ("GET", "/ngo/claims/search", None),
        ("GET", "/volunteer/tasks/search", None),
        ("POST", "/volunteer/tasks/1/accept", None),
        ("GET", "/volunteer/tasks/1", None),
        ("GET", "/stock-clearance/my-claims/search", None),
    )

    for method, path, body in protected_requests:
        response = client.request(method, path, json=body)
        assert response.status_code == 401, f"{method} {path}: {response.text}"


def test_ngo_claim_history_is_private_to_each_ngo(api):
    client, session_factory = api
    _, restaurant_headers = create_account(
        session_factory, "privacy-host@example.com", "restaurant"
    )
    _, first_ngo_headers = create_account(
        session_factory, "first-ngo@example.com", "ngo"
    )
    _, second_ngo_headers = create_account(
        session_factory, "second-ngo@example.com", "ngo"
    )

    listing_ids = []
    for title in ("First NGO meal", "Second NGO meal"):
        response = client.post(
            "/food-listings",
            headers=restaurant_headers,
            json={
                "title": title,
                "source_type": "restaurant",
                "quantity": 4,
                "unit": "meals",
                "price_paise": 0,
                "pickup_location": "12 Green Street",
                "expires_at": (
                    datetime.now(timezone.utc) + timedelta(hours=2)
                ).isoformat(),
            },
        )
        assert response.status_code == 201
        listing_ids.append(response.json()["id"])

    first_claim = client.post(
        f"/food-listings/{listing_ids[0]}/claim",
        headers=first_ngo_headers,
    )
    second_claim = client.post(
        f"/food-listings/{listing_ids[1]}/claim",
        headers=second_ngo_headers,
    )
    assert first_claim.status_code == 201
    assert second_claim.status_code == 201

    first_history = client.get("/ngo/claims", headers=first_ngo_headers)
    second_history = client.get("/ngo/claims", headers=second_ngo_headers)
    assert [claim["id"] for claim in first_history.json()] == [
        first_claim.json()["id"]
    ]
    assert [claim["id"] for claim in second_history.json()] == [
        second_claim.json()["id"]
    ]


def test_bulk_donation_claim_and_volunteer_assignment_workflow(api):
    client, session_factory = api
    _, restaurant_headers = create_account(
        session_factory, "host@example.com", "restaurant"
    )
    _, other_restaurant_headers = create_account(
        session_factory, "other-host@example.com", "restaurant"
    )
    _, ngo_headers = create_account(
        session_factory, "relief@example.com", "ngo"
    )
    _, agent_headers = create_account(
        session_factory, "agent@example.com", "agent"
    )
    _, other_agent_headers = create_account(
        session_factory, "other-agent@example.com", "agent"
    )
    _, customer_headers = create_account(
        session_factory, "community@example.com", "user"
    )
    _, admin_headers = create_account(
        session_factory, "workflow-admin@example.com", "admin"
    )

    donation = client.post(
        "/food-listings",
        headers=restaurant_headers,
        json={
            "title": "Community meal boxes",
            "description": "Prepared meals",
            "source_type": "restaurant",
            "quantity": 20,
            "unit": "boxes",
            "price_paise": 0,
            "pickup_location": "12 Green Street",
            "expires_at": (
                datetime.now(timezone.utc) + timedelta(hours=2)
            ).isoformat(),
        },
    )
    assert donation.status_code == 201
    available_search = client.get(
        "/food-listings/search?search=meal&limit=1&sort=title"
    )
    assert available_search.status_code == 200
    assert available_search.json()["total"] == 1

    forbidden_claim = client.post(
        f"/food-listings/{donation.json()['id']}/claim",
        headers=customer_headers,
    )
    assert forbidden_claim.status_code == 403

    ngo_claim = client.post(
        f"/food-listings/{donation.json()['id']}/claim",
        headers=ngo_headers,
    )
    assert ngo_claim.status_code == 201
    claim_id = ngo_claim.json()["id"]

    available_tasks = client.get(
        "/volunteer/tasks/search?scope=available",
        headers=agent_headers,
    )
    assert available_tasks.status_code == 200
    assert available_tasks.json()["items"][0]["listing"]["pickup_location"] == "12 Green Street"
    accepted = client.post(
        f"/volunteer/tasks/{claim_id}/accept",
        headers=agent_headers,
    )
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "assigned"
    assert accepted.json()["listing"]["title"] == "Community meal boxes"
    assert client.get(
        "/notifications",
        headers=ngo_headers,
    ).json()["items"][0]["title"] == "Volunteer accepted task"
    assert client.post(
        f"/volunteer/tasks/{claim_id}/accept",
        headers=other_agent_headers,
    ).status_code == 409
    assert client.get(
        f"/volunteer/tasks/{claim_id}",
        headers=other_agent_headers,
    ).status_code == 403

    assert len(client.get("/volunteer/tasks", headers=agent_headers).json()) == 1
    assert len(
        client.get("/volunteer/tasks", headers=other_agent_headers).json()
    ) == 0

    collected = client.post(
        f"/volunteer/tasks/{claim_id}/collect",
        headers=agent_headers,
    )
    assert collected.status_code == 200
    assert collected.json()["status"] == "collected"

    assert client.get(
        "/volunteer/tasks",
        headers=other_agent_headers,
    ).json() == []
    assert client.post(
        f"/volunteer/tasks/{claim_id}/collect",
        headers=other_agent_headers,
    ).status_code == 409
    assert client.post(
        f"/volunteer/tasks/{claim_id}/deliver",
        headers=other_agent_headers,
    ).status_code == 403

    delivered = client.post(
        f"/volunteer/tasks/{claim_id}/deliver",
        headers=agent_headers,
    )
    assert delivered.status_code == 200
    assert delivered.json()["status"] == "delivered"

    assert client.get("/stats").json() == {
        "total_donations": 1,
        "total_claims": 1,
        "total_deliveries": 1,
    }
    assert client.get(
        "/restaurant/analytics",
        headers=restaurant_headers,
    ).json() == {
        "donations_posted": 1,
        "food_claims": 1,
        "deliveries_completed": 1,
    }
    assert client.get(
        "/restaurant/analytics",
        headers=other_restaurant_headers,
    ).json() == {
        "donations_posted": 0,
        "food_claims": 0,
        "deliveries_completed": 0,
    }
    analytics = client.get("/admin/analytics", headers=admin_headers)
    assert analytics.status_code == 200
    assert analytics.json()["restaurants"] == 2
    assert analytics.json()["ngos"] == 1
    assert analytics.json()["volunteers"] == 2
    assert analytics.json()["pending_claims"] == 0
    impact = client.get("/admin/reports/impact?days=7", headers=admin_headers)
    assert impact.status_code == 200
    assert impact.json()["period_days"] == 7
    assert len(impact.json()["trends"]["donations_created"]) == 7
    assert impact.json()["quantity_by_unit"]["listed"]["boxes"] == 20
    assert impact.json()["quantity_by_unit"]["delivered"]["boxes"] == 20
    assert sum(point["count"] for point in impact.json()["trends"]["donations_created"]) == 1
    assert sum(point["count"] for point in impact.json()["trends"]["claims_created"]) == 1
    assert sum(point["count"] for point in impact.json()["trends"]["deliveries_completed"]) == 1


def test_admin_apis_require_admin_and_record_management_actions(api):
    client, session_factory = api
    admin_id, admin_headers = create_account(
        session_factory, "admin@example.com", "admin"
    )
    user_id, user_headers = create_account(
        session_factory, "managed-user@example.com", "user"
    )

    admin_routes = (
        ("GET", "/admin/analytics", None),
        ("GET", "/admin/reports/impact", None),
        ("GET", "/admin/users", None),
        ("GET", f"/admin/users/{user_id}", None),
        ("GET", "/admin/food-listings", None),
        ("GET", "/admin/stock-clearance", None),
        ("GET", "/admin/food-claims", None),
        ("GET", "/admin/stock-clearance-claims", None),
        ("GET", "/admin/deliveries", None),
        ("GET", "/admin/audit-logs", None),
    )
    for method, path, body in admin_routes:
        assert client.request(method, path, json=body, headers=user_headers).status_code == 403
        response = client.request(method, path, json=body, headers=admin_headers)
        assert response.status_code == 200, (path, response.text)

    listed_users = client.get("/admin/users", headers=admin_headers)
    assert listed_users.status_code == 200
    assert listed_users.json()["items"]
    assert all("password_hash" not in item for item in listed_users.json()["items"])
    filtered_users = client.get(
        "/admin/users?role=user&active=true&verified=false&limit=1",
        headers=admin_headers,
    )
    assert filtered_users.status_code == 200
    assert filtered_users.json()["total"] == 1
    assert filtered_users.json()["items"][0]["id"] == user_id
    assert client.patch(
        f"/admin/users/{user_id}",
        headers=user_headers,
        json={"is_active": False},
    ).status_code == 403

    update = client.patch(
        f"/admin/users/{user_id}",
        headers=admin_headers,
        json={"is_active": False, "is_verified": True},
    )
    assert update.status_code == 200
    assert update.json()["is_active"] is False
    assert update.json()["is_verified"] is True
    assert client.patch(
        f"/admin/users/{admin_id}",
        headers=admin_headers,
        json={"is_active": False},
    ).status_code == 409
    assert client.patch(
        f"/admin/users/{user_id}",
        headers=admin_headers,
        json={"role": "admin"},
    ).status_code == 422
    rejected_user_id, _ = create_account(
        session_factory, "rejected-user@example.com", "user"
    )
    assert client.patch(
        f"/admin/users/{rejected_user_id}",
        headers=admin_headers,
        json={"is_active": False, "is_verified": False, "reason": "  "},
    ).status_code == 422
    rejected = client.patch(
        f"/admin/users/{rejected_user_id}",
        headers=admin_headers,
        json={"is_active": False, "is_verified": False, "reason": "Incomplete account details"},
    )
    assert rejected.status_code == 200
    from models import Notification
    with session_factory() as db:
        rejected_notice = db.query(Notification).filter_by(
            user_id=rejected_user_id
        ).one()
        assert rejected_notice.title == "Account rejected"

    logs = client.get("/admin/audit-logs", headers=admin_headers)
    assert logs.status_code == 200
    assert logs.json()["total"] == 2
    assert logs.json()["items"][0]["action"] == "user.rejected"
    assert logs.json()["items"][0]["details"]["reason"] == "Incomplete account details"
    assert logs.json()["items"][0]["actor_type"] == "admin"


def test_notifications_are_private_and_can_be_marked_read(api):
    from models import Notification

    client, session_factory = api
    user_id, user_headers = create_account(
        session_factory, "notification-owner@example.com", "user"
    )
    _, other_headers = create_account(
        session_factory, "notification-other@example.com", "user"
    )
    with session_factory() as db:
        notification = Notification(
            user_id=user_id,
            title="Claim update",
            message="A claim changed status.",
            category="claim",
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)
        notification_id = notification.id

    assert client.get("/notifications").status_code == 401
    assert client.get("/notifications", headers=user_headers).json()["unread"] == 1
    assert client.post(
        f"/notifications/{notification_id}/read",
        headers=other_headers,
    ).status_code == 404
    marked_read = client.post(
        f"/notifications/{notification_id}/read",
        headers=user_headers,
    )
    assert marked_read.status_code == 200
    assert marked_read.json()["read_at"] is not None


def test_restaurant_history_is_scoped_and_includes_claims(api):
    client, session_factory = api
    restaurant_id, restaurant_headers = create_account(
        session_factory, "history-owner@example.com", "restaurant"
    )
    _, other_restaurant_headers = create_account(
        session_factory, "history-other@example.com", "restaurant"
    )
    _, ngo_headers = create_account(
        session_factory, "history-ngo@example.com", "ngo"
    )
    _, customer_headers = create_account(
        session_factory, "history-customer@example.com", "user"
    )

    donation = client.post(
        "/food-listings",
        headers=restaurant_headers,
        json={
            "title": "Owner donation",
            "source_type": "restaurant",
            "quantity": 3,
            "unit": "meals",
            "price_paise": 0,
            "pickup_location": "1 Green Street",
            "expires_at": (
                datetime.now(timezone.utc) + timedelta(hours=2)
            ).isoformat(),
        },
    )
    assert donation.status_code == 201
    edit_donation = client.put(
        f"/restaurant/donations/{donation.json()['id']}",
        headers=restaurant_headers,
        json={"title": "Edited owner donation", "description": None},
    )
    assert edit_donation.status_code == 200
    assert edit_donation.json()["title"] == "Edited owner donation"
    assert client.put(
        f"/restaurant/donations/{donation.json()['id']}",
        headers=other_restaurant_headers,
        json={"title": "Attempted cross-owner edit"},
    ).status_code == 404
    assert client.put(
        f"/restaurant/donations/{donation.json()['id']}",
        headers=restaurant_headers,
        json={},
    ).status_code == 422
    donation_claim = client.post(
        f"/food-listings/{donation.json()['id']}/claim",
        headers=ngo_headers,
    )
    assert donation_claim.status_code == 201
    assert client.put(
        f"/restaurant/donations/{donation.json()['id']}",
        headers=restaurant_headers,
        json={"title": "Claimed donation edit"},
    ).status_code == 409
    assert client.patch(
        f"/restaurant/donations/{donation.json()['id']}",
        headers=other_restaurant_headers,
        json={"is_available": False},
    ).status_code == 404
    assert client.patch(
        f"/restaurant/donations/{donation.json()['id']}",
        headers=customer_headers,
        json={"is_available": False},
    ).status_code == 403
    assert client.get(
        "/ngo/claims/search?status_filter=claimed",
        headers=ngo_headers,
    ).json()["total"] == 1
    assert client.get(
        "/volunteer/tasks/search?scope=available",
        headers=ngo_headers,
    ).status_code == 403
    assert client.get(
        "/notifications",
        headers=restaurant_headers,
    ).json()["items"][0]["title"] == "Donation claimed"

    offer = client.post(
        "/stock-clearance",
        headers=restaurant_headers,
        json={
            "title": "Owner offer",
            "quantity": 4,
            "unit": "meals",
            "original_price_paise": 10000,
            "pickup_location": "1 Green Street",
            "expires_at": (
                datetime.now(timezone.utc) + timedelta(hours=2)
            ).isoformat(),
        },
    )
    assert offer.status_code == 201
    edit_offer = client.put(
        f"/restaurant/stock-clearance/{offer.json()['id']}",
        headers=restaurant_headers,
        json={"title": "Edited owner offer"},
    )
    assert edit_offer.status_code == 200
    assert edit_offer.json()["title"] == "Edited owner offer"
    deal_search = client.get("/stock-clearance/search?search=owner&limit=1")
    assert deal_search.status_code == 200
    assert deal_search.json()["items"][0]["id"] == offer.json()["id"]
    offer_claim = client.post(
        f"/stock-clearance/{offer.json()['id']}/claim",
        headers=customer_headers,
        json={"quantity": 1},
    )
    assert offer_claim.status_code == 201
    assert client.put(
        f"/restaurant/stock-clearance/{offer.json()['id']}",
        headers=restaurant_headers,
        json={"title": "Claimed offer edit"},
    ).status_code == 409
    assert client.patch(
        f"/restaurant/stock-clearance/{offer.json()['id']}",
        headers=restaurant_headers,
        json={"is_available": False},
    ).status_code == 200
    assert client.get(
        "/notifications",
        headers=restaurant_headers,
    ).json()["items"][0]["title"] == "Flash Deal claimed"

    with session_factory() as db:
        historical_listing = StockClearanceListing(
            title="Unavailable historical offer",
            quantity=0,
            unit="meals",
            original_price_paise=10000,
            pickup_location="1 Green Street",
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            is_available=False,
            creator_id=restaurant_id,
        )
        db.add(historical_listing)
        db.commit()

    donations = client.get("/restaurant/donations", headers=restaurant_headers)
    assert donations.status_code == 200
    assert donations.json()["total"] == 1
    assert donations.json()["items"][0]["claims"][0]["id"] == donation_claim.json()["id"]

    offers = client.get(
        "/restaurant/stock-clearance?sort=oldest",
        headers=restaurant_headers,
    )
    assert offers.status_code == 200
    assert offers.json()["total"] == 2
    assert any(not item["is_available"] for item in offers.json()["items"])

    stock_claims = client.get(
        "/restaurant/stock-clearance-claims",
        headers=restaurant_headers,
    )
    assert stock_claims.status_code == 200
    assert [claim["id"] for claim in stock_claims.json()["items"]] == [
        offer_claim.json()["id"]
    ]
    unavailable_offers = client.get(
        "/restaurant/stock-clearance?available=false&search=unavailable",
        headers=restaurant_headers,
    )
    assert unavailable_offers.status_code == 200
    assert unavailable_offers.json()["total"] == 1

    other_history = client.get(
        "/restaurant/donations",
        headers=other_restaurant_headers,
    )
    assert other_history.status_code == 200
    assert other_history.json()["items"] == []
    assert client.get(
        "/restaurant/stock-clearance-claims",
        headers=other_restaurant_headers,
    ).json()["items"] == []
    expired_offers = client.get(
        "/restaurant/stock-clearance?expired=true",
        headers=restaurant_headers,
    )
    assert expired_offers.status_code == 200
    assert expired_offers.json()["total"] == 1
    assert client.get(
        "/restaurant/donations",
        headers=customer_headers,
    ).status_code == 403
