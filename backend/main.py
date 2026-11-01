

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, FastAPI, HTTPException, Query, status
from pwdlib import PasswordHash
from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import (
    JWT_ALGORITHM,
    JWT_SECRET_KEY,
    get_admin_user,
    get_current_user,
)
from database import get_db, initialize_database
from models import (
    FoodClaim,
    FoodListing,
    AdminAuditLog,
    Notification,
    StockClearanceClaim,
    StockClearanceListing,
    User,
)

from schemas import (
    FoodClaimResponse,
    FoodListingCreate,
    FoodListingResponse,
    AdminAuditLogResponse,
    AdminListingUpdate,
    AdminUserUpdate,
    NotificationResponse,
    Page,
    RestaurantFoodListingResponse,
    RestaurantListingUpdate,
    StockClearanceCreate,
    StockClearanceResponse,
    StockClearanceClaimCreate,
    StockClearanceClaimResponse,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
    VolunteerTaskResponse,
)

from fastapi.middleware.cors import CORSMiddleware

initialize_database()

app = FastAPI(
    title="FoodRescue API",
    description="API for connecting surplus food with people and organizations.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

password_hash = PasswordHash.recommended()


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@app.get("/")
def home():
    return {"message": "Welcome to FoodRescue API", "status": "running"}


@app.get("/health")
def health():
    return {"status": "healthy"}

@app.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    total_donations = db.query(FoodListing).count()

    total_claims = db.query(FoodClaim).count()

    total_deliveries = (
        db.query(FoodClaim)
        .filter(FoodClaim.status == "delivered")
        .count()
    )

    return {
        "total_donations": total_donations,
        "total_claims": total_claims,
        "total_deliveries": total_deliveries,
    }


@app.get("/health/db")
def database_health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "connected", "database": "foodrescue"}


@app.post(
    "/users/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(user_data: UserCreate, db: Session = Depends(get_db)):
    normalized_email = str(user_data.email).lower()
    existing_user = db.query(User).filter(
        func.lower(User.email) == normalized_email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        full_name=user_data.full_name,
        email=normalized_email,
        password_hash=password_hash.hash(user_data.password),
        role="user",
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    return user


ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
)

if ACCESS_TOKEN_EXPIRE_MINUTES <= 0:
    raise RuntimeError("ACCESS_TOKEN_EXPIRE_MINUTES must be a positive integer.")


@app.post("/users/login", response_model=TokenResponse)
def login_user(user_data: UserLogin, db: Session = Depends(get_db)):
    email = str(user_data.email).lower()

    user = db.query(User).filter(
        func.lower(User.email) == email
    ).first()

    if (
        not user
        or not password_hash.verify(
            user_data.password, user.password_hash
        )
        or not user.is_active
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password, or account inactive.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    token = jwt.encode(
        {
            "sub": str(user.id),
            "role": user.role,
            "exp": expires_at,
        },
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


@app.get("/users/me", response_model=UserResponse)
def read_current_user(
    current_user: User = Depends(get_current_user),
):
    return current_user


@app.post(
    "/food-listings",
    response_model=FoodListingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_food_listing(
    listing_data: FoodListingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restaurants can create food listings.",
        )

    if ensure_utc(listing_data.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expiry time must be in the future.",
        )

    listing = FoodListing(
        **listing_data.model_dump(),
        creator_id=current_user.id,
    )
    db.add(listing)
    ngo_ids = db.query(User.id).filter(
        User.role == "ngo",
        User.is_active.is_(True),
    ).all()
    for (ngo_id,) in ngo_ids:
        db.add(Notification(
            user_id=ngo_id,
            title="New donation available",
            message=f"{listing.title} is available for claim.",
            category="donation",
        ))
    db.commit()
    db.refresh(listing)
    return listing


@app.get("/food-listings", response_model=list[FoodListingResponse])
def list_food_listings(db: Session = Depends(get_db)):
    return (
        db.query(FoodListing)
        .filter(
            FoodListing.is_available.is_(True),
            FoodListing.expires_at > datetime.now(timezone.utc),
        )
        .order_by(FoodListing.created_at.desc())
        .all()
    )


@app.get("/food-listings/search", response_model=Page[FoodListingResponse])
def search_food_listings(
    search: str = Query(default="", max_length=100),
    source_type: str | None = Query(default=None, pattern="^(restaurant|event)$"),
    sort: str = Query(default="newest", pattern="^(newest|expiry|title)$"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(FoodListing).filter(
        FoodListing.is_available.is_(True),
        FoodListing.expires_at > datetime.now(timezone.utc),
    )
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            FoodListing.title.ilike(term),
            FoodListing.description.ilike(term),
            FoodListing.pickup_location.ilike(term),
        ))
    if source_type:
        query = query.filter(FoodListing.source_type == source_type)
    order_column = {
        "newest": FoodListing.created_at.desc(),
        "expiry": FoodListing.expires_at.asc(),
        "title": FoodListing.title.asc(),
    }[sort]
    total = query.count()
    items = query.order_by(order_column).offset(offset).limit(limit).all()
    return Page(items=items, total=total, limit=limit, offset=offset)


@app.post(
    "/food-listings/{listing_id}/claim",
    response_model=FoodClaimResponse,
    status_code=status.HTTP_201_CREATED,
)
def claim_food(
    listing_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "ngo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only NGOs can claim food.",
        )

    listing = (
        db.query(FoodListing)
        .filter(FoodListing.id == listing_id)
        .with_for_update()
        .first()
    )

    if not listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food listing not found.",
        )

    if not listing.is_available:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This food has already been claimed.",
        )

    if ensure_utc(listing.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This food listing has expired.",
        )

    claim = FoodClaim(
        listing_id=listing.id,
        ngo_id=current_user.id,
        status="claimed",
    )

    listing.is_available = False
    db.add(Notification(
        user_id=listing.creator_id,
        title="Donation claimed",
        message=f"{listing.title} was claimed by an NGO.",
        category="claim",
    ))

    try:
        db.add(claim)
        db.commit()
        db.refresh(claim)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This food has already been claimed.",
        )

    return claim

@app.get(
    "/ngo/claims",
    response_model=list[FoodClaimResponse],
)
def get_ngo_claims(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "ngo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only NGOs can view their claims.",
        )

    return (
        db.query(FoodClaim)
        .filter(FoodClaim.ngo_id == current_user.id)
        .order_by(FoodClaim.claimed_at.desc())
        .all()
    )


@app.get("/ngo/claims/search", response_model=Page[FoodClaimResponse])
def search_ngo_claims(
    status_filter: str | None = Query(
        default=None,
        pattern="^(claimed|collected|delivered)$",
    ),
    sort: str = Query(default="newest", pattern="^(newest|oldest)$"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "ngo":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only NGOs can view their claims.",
        )
    query = db.query(FoodClaim).filter(FoodClaim.ngo_id == current_user.id)
    if status_filter:
        query = query.filter(FoodClaim.status == status_filter)
    total = query.count()
    order_column = FoodClaim.claimed_at.desc() if sort == "newest" else FoodClaim.claimed_at.asc()
    items = query.order_by(order_column).offset(offset).limit(limit).all()
    return Page(items=items, total=total, limit=limit, offset=offset)


@app.get(
    "/volunteer/tasks",
    response_model=list[FoodClaimResponse],
)
def get_volunteer_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "agent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only volunteers can view pickup tasks.",
        )

    return (
        db.query(FoodClaim)
        .filter(
            or_(
                (
                    (FoodClaim.status == "claimed")
                    & (FoodClaim.volunteer_id.is_(None))
                ),
                FoodClaim.volunteer_id == current_user.id,
            )
        )
        .order_by(FoodClaim.claimed_at.desc())
        .all()
    )


@app.get("/volunteer/tasks/search", response_model=Page[VolunteerTaskResponse])
def search_volunteer_tasks(
    scope: str = Query(default="available", pattern="^(available|mine)$"),
    status_filter: str | None = Query(
        default=None,
        pattern="^(claimed|assigned|collected|delivered)$",
    ),
    sort: str = Query(default="newest", pattern="^(newest|oldest)$"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "agent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only volunteers can view pickup tasks.",
        )
    query = db.query(FoodClaim)
    if scope == "available":
        query = query.filter(
            FoodClaim.status == "claimed",
            FoodClaim.volunteer_id.is_(None),
        )
    else:
        query = query.filter(FoodClaim.volunteer_id == current_user.id)
    if status_filter:
        query = query.filter(FoodClaim.status == status_filter)
    total = query.count()
    order_column = FoodClaim.claimed_at.desc() if sort == "newest" else FoodClaim.claimed_at.asc()
    claims = query.order_by(order_column).offset(offset).limit(limit).all()
    listings = {
        listing.id: listing
        for listing in db.query(FoodListing).filter(
            FoodListing.id.in_([claim.listing_id for claim in claims])
        ).all()
    } if claims else {}
    items = []
    for claim in claims:
        listing = listings.get(claim.listing_id)
        if listing is None:
            continue
        items.append({
            **FoodClaimResponse.model_validate(claim).model_dump(),
            "listing": {
                "id": listing.id,
                "title": listing.title,
                "quantity": listing.quantity,
                "unit": listing.unit,
                "pickup_location": listing.pickup_location,
                "expires_at": listing.expires_at,
            },
        })
    return Page(items=items, total=total, limit=limit, offset=offset)


@app.post(
    "/volunteer/tasks/{claim_id}/accept",
    response_model=VolunteerTaskResponse,
)
def accept_volunteer_task(
    claim_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "agent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only volunteers can accept pickup tasks.",
        )
    claim = (
        db.query(FoodClaim)
        .filter(FoodClaim.id == claim_id)
        .with_for_update()
        .first()
    )
    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pickup task not found.",
        )
    if claim.status != "claimed" or claim.volunteer_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This task is no longer available.",
        )
    listing = db.get(FoodListing, claim.listing_id)
    if not listing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The donation listing for this task is no longer available.",
        )
    claim.volunteer_id = current_user.id
    claim.status = "assigned"
    db.add(Notification(
        user_id=claim.ngo_id,
        title="Volunteer accepted task",
        message="A volunteer accepted your donation delivery task.",
        category="delivery",
    ))
    db.commit()
    db.refresh(claim)
    return {
        **FoodClaimResponse.model_validate(claim).model_dump(),
        "listing": {
            "id": listing.id,
            "title": listing.title,
            "quantity": listing.quantity,
            "unit": listing.unit,
            "pickup_location": listing.pickup_location,
            "expires_at": listing.expires_at,
        },
    }


@app.get(
    "/volunteer/tasks/{claim_id}",
    response_model=VolunteerTaskResponse,
)
def get_volunteer_task(
    claim_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "agent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only volunteers can view pickup tasks.",
        )
    claim = db.get(FoodClaim, claim_id)
    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pickup task not found.",
        )
    if claim.volunteer_id not in (None, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This task is assigned to another volunteer.",
        )
    listing = db.get(FoodListing, claim.listing_id)
    if not listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Food listing not found.",
        )
    return {
        **FoodClaimResponse.model_validate(claim).model_dump(),
        "listing": {
            "id": listing.id,
            "title": listing.title,
            "quantity": listing.quantity,
            "unit": listing.unit,
            "pickup_location": listing.pickup_location,
            "expires_at": listing.expires_at,
        },
    }


@app.post(
    "/volunteer/tasks/{claim_id}/collect",
    response_model=FoodClaimResponse,
)
def collect_food(
    claim_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "agent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only volunteers can collect food.",
        )

    claim = (
        db.query(FoodClaim)
        .filter(FoodClaim.id == claim_id)
        .with_for_update()
        .first()
    )

    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pickup task not found.",
        )

    if claim.status not in ("claimed", "assigned"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This task is not awaiting collection.",
        )

    if claim.volunteer_id is not None and claim.volunteer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This task has already been assigned to another volunteer.",
        )

    claim.volunteer_id = current_user.id
    claim.status = "collected"
    claim.collected_at = datetime.now(timezone.utc)

    db.add(Notification(
        user_id=claim.ngo_id,
        title="Food collected",
        message="Your claimed donation has been collected.",
        category="delivery",
    ))
    db.commit()
    db.refresh(claim)
    return claim


@app.post(
    "/volunteer/tasks/{claim_id}/deliver",
    response_model=FoodClaimResponse,
)
def deliver_food(
    claim_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "agent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only volunteers can deliver food.",
        )

    claim = (
        db.query(FoodClaim)
        .filter(FoodClaim.id == claim_id)
        .with_for_update()
        .first()
    )

    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pickup task not found.",
        )

    if claim.volunteer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This task is assigned to another volunteer.",
        )

    if claim.status != "collected":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Food must be collected before delivery.",
        )

    claim.status = "delivered"
    claim.delivered_at = datetime.now(timezone.utc)

    db.add(Notification(
        user_id=claim.ngo_id,
        title="Food delivered",
        message="Your claimed donation has been delivered.",
        category="delivery",
    ))
    db.commit()
    db.refresh(claim)
    return claim


def get_stock_discount(created_at: datetime) -> int:
    now = datetime.now(timezone.utc)
    created_at = ensure_utc(created_at)

    elapsed_seconds = max(0, (now - created_at).total_seconds())
    discount = 10 * (int(elapsed_seconds // 60) + 1)

    return min(discount, 50)


def stock_clearance_response(listing: StockClearanceListing):
    discount = get_stock_discount(listing.created_at)

    discounted_price = round(
        listing.original_price_paise * (100 - discount) / 100
    )

    return {
        "id": listing.id,
        "title": listing.title,
        "description": listing.description,
        "quantity": listing.quantity,
        "unit": listing.unit,
        "original_price_paise": listing.original_price_paise,
        "pickup_location": listing.pickup_location,
        "expires_at": listing.expires_at,
        "is_available": listing.is_available,
        "created_at": listing.created_at,
        "creator_id": listing.creator_id,
        "discount_percent": discount,
        "discounted_price_paise": discounted_price,
    }


@app.post(
    "/stock-clearance",
    response_model=StockClearanceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_stock_clearance(
    listing_data: StockClearanceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restaurants can create stock-clearance offers.",
        )

    if ensure_utc(listing_data.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expiry time must be in the future.",
        )

    listing = StockClearanceListing(
        **listing_data.model_dump(),
        creator_id=current_user.id,
    )

    db.add(listing)
    user_ids = db.query(User.id).filter(
        User.role == "user",
        User.is_active.is_(True),
    ).all()
    for (user_id,) in user_ids:
        db.add(Notification(
            user_id=user_id,
            title="New Flash Deal",
            message=f"{listing.title} is available.",
            category="stock_clearance",
        ))
    db.commit()
    db.refresh(listing)

    return stock_clearance_response(listing)


@app.get(
    "/stock-clearance",
    response_model=list[StockClearanceResponse],
)
def list_stock_clearance(db: Session = Depends(get_db)):
    listings = (
        db.query(StockClearanceListing)
        .filter(
            StockClearanceListing.is_available.is_(True),
            StockClearanceListing.expires_at > datetime.now(timezone.utc),
            StockClearanceListing.quantity > 0,
        )
        .order_by(StockClearanceListing.created_at.desc())
        .all()
    )

    return [stock_clearance_response(item) for item in listings]


@app.get("/stock-clearance/search", response_model=Page[StockClearanceResponse])
def search_stock_clearance(
    search: str = Query(default="", max_length=100),
    sort: str = Query(default="newest", pattern="^(newest|expiry|title)$"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(StockClearanceListing).filter(
        StockClearanceListing.is_available.is_(True),
        StockClearanceListing.expires_at > datetime.now(timezone.utc),
        StockClearanceListing.quantity > 0,
    )
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            StockClearanceListing.title.ilike(term),
            StockClearanceListing.description.ilike(term),
            StockClearanceListing.pickup_location.ilike(term),
        ))
    order_column = {
        "newest": StockClearanceListing.created_at.desc(),
        "expiry": StockClearanceListing.expires_at.asc(),
        "title": StockClearanceListing.title.asc(),
    }[sort]
    total = query.count()
    listings = query.order_by(order_column).offset(offset).limit(limit).all()
    return Page(
        items=[stock_clearance_response(item) for item in listings],
        total=total,
        limit=limit,
        offset=offset,
    )


@app.post(
    "/stock-clearance/{listing_id}/claim",
    response_model=StockClearanceClaimResponse,
    status_code=status.HTTP_201_CREATED,
)
def claim_stock_clearance(
    listing_id: int,
    claim_data: StockClearanceClaimCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only community users can purchase stock-clearance food.",
        )

    listing = (
        db.query(StockClearanceListing)
        .filter(StockClearanceListing.id == listing_id)
        .with_for_update()
        .first()
    )

    if not listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock-clearance offer not found.",
        )

    if not listing.is_available or listing.quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This offer is no longer available.",
        )

    now = datetime.now(timezone.utc)
    expiry = ensure_utc(listing.expires_at)

    if expiry <= now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This food offer has expired.",
        )

    if claim_data.quantity > listing.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Requested quantity exceeds available stock.",
        )

    discount = get_stock_discount(listing.created_at)

    unit_price = round(
        listing.original_price_paise * (100 - discount) / 100
    )

    claim = StockClearanceClaim(
        listing_id=listing.id,
        customer_id=current_user.id,
        quantity=claim_data.quantity,
        discount_percent=discount,
        unit_price_paise=unit_price,
    )

    listing.quantity -= claim_data.quantity

    if listing.quantity == 0:
        listing.is_available = False

    try:
        db.add(claim)
        db.add(Notification(
            user_id=listing.creator_id,
            title="Flash Deal claimed",
            message=f"{listing.title} has a new claim.",
            category="stock_clearance",
        ))
        db.commit()
        db.refresh(claim)
    except Exception:
        db.rollback()
        raise

    return claim


@app.get(
    "/stock-clearance/my-claims",
    response_model=list[StockClearanceClaimResponse],
)
def get_my_stock_clearance_claims(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only community users can view stock-clearance claims.",
        )

    return (
        db.query(StockClearanceClaim)
        .filter(StockClearanceClaim.customer_id == current_user.id)
        .order_by(StockClearanceClaim.claimed_at.desc())
        .all()
    )


@app.get(
    "/stock-clearance/my-claims/search",
    response_model=Page[StockClearanceClaimResponse],
)
def search_my_stock_clearance_claims(
    search: str = Query(default="", max_length=100),
    sort: str = Query(default="newest", pattern="^(newest|oldest)$"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only community users can view Stock Clearance claims.",
        )
    query = (
        db.query(StockClearanceClaim)
        .join(
            StockClearanceListing,
            StockClearanceClaim.listing_id == StockClearanceListing.id,
        )
        .filter(StockClearanceClaim.customer_id == current_user.id)
    )
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            StockClearanceListing.title.ilike(term),
            StockClearanceListing.pickup_location.ilike(term),
        ))
    total = query.count()
    order_column = StockClearanceClaim.claimed_at.desc() if sort == "newest" else StockClearanceClaim.claimed_at.asc()
    claims = query.order_by(order_column).offset(offset).limit(limit).all()
    return Page(items=claims, total=total, limit=limit, offset=offset)


def record_admin_action(
    db: Session,
    admin_id: int,
    action: str,
    resource_type: str,
    resource_id: int | None,
    details: dict[str, object],
) -> None:
    db.add(AdminAuditLog(
        admin_id=admin_id,
        actor_type="admin",
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
    ))


@app.get("/notifications")
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    return {
        "items": query.order_by(
            Notification.created_at.desc(),
            Notification.id.desc(),
        ).offset(offset).limit(limit).all(),
        "total": query.count(),
        "unread": query.filter(Notification.read_at.is_(None)).count(),
        "limit": limit,
        "offset": offset,
    }


@app.post("/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    if notification.read_at is None:
        notification.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notification)
    return notification


@app.get(
    "/restaurant/donations",
    response_model=Page[RestaurantFoodListingResponse],
)
def restaurant_donation_history(
    search: str = Query(default="", max_length=100),
    available: bool | None = None,
    expired: bool | None = None,
    sort: str = Query(default="newest", pattern="^(newest|oldest|expiry)$"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restaurants can view their donation history.",
        )

    query = db.query(FoodListing).filter(
        FoodListing.creator_id == current_user.id
    )
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            FoodListing.title.ilike(term),
            FoodListing.pickup_location.ilike(term),
        ))
    if available is not None:
        query = query.filter(FoodListing.is_available.is_(available))
    if expired is not None:
        now = datetime.now(timezone.utc)
        query = query.filter(
            FoodListing.expires_at <= now
            if expired
            else FoodListing.expires_at > now
        )
    order_column = {
        "newest": FoodListing.created_at.desc(),
        "oldest": FoodListing.created_at.asc(),
        "expiry": FoodListing.expires_at.asc(),
    }[sort]
    total = query.count()
    listings = query.order_by(order_column).offset(offset).limit(limit).all()
    claims_by_listing: dict[int, list[FoodClaimResponse]] = {
        listing.id: [] for listing in listings
    }
    if listings:
        claims = (
            db.query(FoodClaim)
            .filter(FoodClaim.listing_id.in_(claims_by_listing))
            .order_by(FoodClaim.claimed_at.desc())
            .all()
        )
        for claim in claims:
            claims_by_listing[claim.listing_id].append(
                FoodClaimResponse.model_validate(claim)
            )

    items = []
    for listing in listings:
        item = FoodListingResponse.model_validate(listing).model_dump()
        item["claims"] = claims_by_listing[listing.id]
        items.append(item)
    return Page(items=items, total=total, limit=limit, offset=offset)


@app.get("/restaurant/analytics")
def restaurant_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restaurants can view their analytics.",
        )
    donation_query = db.query(FoodListing).filter(
        FoodListing.creator_id == current_user.id
    )
    claims_query = (
        db.query(FoodClaim)
        .join(FoodListing, FoodClaim.listing_id == FoodListing.id)
        .filter(FoodListing.creator_id == current_user.id)
    )
    return {
        "donations_posted": donation_query.count(),
        "food_claims": claims_query.count(),
        "deliveries_completed": claims_query.filter(
            FoodClaim.status == "delivered"
        ).count(),
    }


@app.patch("/restaurant/donations/{listing_id}", response_model=FoodListingResponse)
def cancel_restaurant_donation(
    listing_id: int,
    changes: AdminListingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restaurants can manage their donation listings.",
        )
    if changes.is_available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A cancelled donation cannot be reactivated.",
        )
    listing = db.query(FoodListing).filter(
        FoodListing.id == listing_id,
        FoodListing.creator_id == current_user.id,
    ).with_for_update().first()
    if not listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation listing not found.",
        )
    listing.is_available = False
    db.commit()
    db.refresh(listing)
    return listing


@app.put("/restaurant/donations/{listing_id}", response_model=FoodListingResponse)
def edit_restaurant_donation(
    listing_id: int,
    changes: RestaurantListingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restaurants can edit their donation listings.",
        )
    listing = db.query(FoodListing).filter(
        FoodListing.id == listing_id,
        FoodListing.creator_id == current_user.id,
    ).with_for_update().first()
    if not listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Donation listing not found.",
        )
    has_claim = db.query(FoodClaim.id).filter(
        FoodClaim.listing_id == listing.id
    ).first()
    if has_claim or not listing.is_available or ensure_utc(listing.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only active, unclaimed donation listings can be edited.",
        )
    for field, value in changes.model_dump(exclude_unset=True).items():
        setattr(listing, field, value)
    db.commit()
    db.refresh(listing)
    return listing


@app.patch(
    "/restaurant/stock-clearance/{listing_id}",
    response_model=StockClearanceResponse,
)
def cancel_restaurant_stock_clearance(
    listing_id: int,
    changes: AdminListingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restaurants can manage their Stock Clearance offers.",
        )
    if changes.is_available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A cancelled offer cannot be reactivated.",
        )
    listing = db.query(StockClearanceListing).filter(
        StockClearanceListing.id == listing_id,
        StockClearanceListing.creator_id == current_user.id,
    ).with_for_update().first()
    if not listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock Clearance offer not found.",
        )
    listing.is_available = False
    db.commit()
    db.refresh(listing)
    return stock_clearance_response(listing)


@app.put(
    "/restaurant/stock-clearance/{listing_id}",
    response_model=StockClearanceResponse,
)
def edit_restaurant_stock_clearance(
    listing_id: int,
    changes: RestaurantListingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restaurants can edit their Stock Clearance offers.",
        )
    listing = db.query(StockClearanceListing).filter(
        StockClearanceListing.id == listing_id,
        StockClearanceListing.creator_id == current_user.id,
    ).with_for_update().first()
    if not listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock Clearance offer not found.",
        )
    has_claims = db.query(StockClearanceClaim.id).filter(
        StockClearanceClaim.listing_id == listing.id
    ).first()
    if has_claims or not listing.is_available or listing.quantity <= 0 or ensure_utc(listing.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only active, unclaimed Stock Clearance offers can be edited.",
        )
    for field, value in changes.model_dump(exclude_unset=True).items():
        setattr(listing, field, value)
    db.commit()
    db.refresh(listing)
    return stock_clearance_response(listing)


@app.get("/restaurant/stock-clearance", response_model=Page[StockClearanceResponse])
def restaurant_stock_clearance_history(
    search: str = Query(default="", max_length=100),
    available: bool | None = None,
    expired: bool | None = None,
    sort: str = Query(default="newest", pattern="^(newest|oldest|expiry)$"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restaurants can view their Stock Clearance history.",
        )

    query = db.query(StockClearanceListing).filter(
        StockClearanceListing.creator_id == current_user.id
    )
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            StockClearanceListing.title.ilike(term),
            StockClearanceListing.pickup_location.ilike(term),
        ))
    if available is not None:
        query = query.filter(StockClearanceListing.is_available.is_(available))
    if expired is not None:
        now = datetime.now(timezone.utc)
        query = query.filter(
            StockClearanceListing.expires_at <= now
            if expired
            else StockClearanceListing.expires_at > now
        )
    order_column = {
        "newest": StockClearanceListing.created_at.desc(),
        "oldest": StockClearanceListing.created_at.asc(),
        "expiry": StockClearanceListing.expires_at.asc(),
    }[sort]
    total = query.count()
    listings = query.order_by(order_column).offset(offset).limit(limit).all()
    return Page(
        items=[stock_clearance_response(listing) for listing in listings],
        total=total,
        limit=limit,
        offset=offset,
    )


@app.get("/restaurant/claims", response_model=Page[FoodClaimResponse])
def restaurant_claim_history(
    status_filter: str | None = Query(
        default=None,
        pattern="^(claimed|assigned|collected|delivered)$",
    ),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restaurants can view claims on their donations.",
        )

    query = (
        db.query(FoodClaim)
        .join(FoodListing, FoodClaim.listing_id == FoodListing.id)
        .filter(FoodListing.creator_id == current_user.id)
    )
    if status_filter:
        query = query.filter(FoodClaim.status == status_filter)
    total = query.count()
    claims = query.order_by(FoodClaim.claimed_at.desc()).offset(offset).limit(limit).all()
    return Page(items=claims, total=total, limit=limit, offset=offset)


@app.get(
    "/restaurant/stock-clearance-claims",
    response_model=Page[StockClearanceClaimResponse],
)
def restaurant_stock_clearance_claim_history(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "restaurant":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restaurants can view claims on their Stock Clearance offers.",
        )

    query = (
        db.query(StockClearanceClaim)
        .join(
            StockClearanceListing,
            StockClearanceClaim.listing_id == StockClearanceListing.id,
        )
        .filter(StockClearanceListing.creator_id == current_user.id)
    )
    total = query.count()
    claims = query.order_by(StockClearanceClaim.claimed_at.desc()).offset(offset).limit(limit).all()
    return Page(items=claims, total=total, limit=limit, offset=offset)


@app.get("/admin/analytics")
def admin_analytics(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    return {
        "users": db.query(User).count(),
        "active_users": db.query(User).filter(User.is_active.is_(True)).count(),
        "pending_approval": db.query(User).filter(User.is_verified.is_(False)).count(),
        "restaurants": db.query(User).filter(User.role == "restaurant").count(),
        "ngos": db.query(User).filter(User.role == "ngo").count(),
        "volunteers": db.query(User).filter(User.role == "agent").count(),
        "community_users": db.query(User).filter(User.role == "user").count(),
        "food_listings": db.query(FoodListing).count(),
        "available_food_listings": db.query(FoodListing).filter(
            FoodListing.is_available.is_(True),
            FoodListing.expires_at > now,
        ).count(),
        "food_claims": db.query(FoodClaim).count(),
        "pending_claims": db.query(FoodClaim).filter(FoodClaim.status == "claimed").count(),
        "deliveries_completed": db.query(FoodClaim).filter(FoodClaim.status == "delivered").count(),
        "stock_clearance_listings": db.query(StockClearanceListing).count(),
        "active_stock_clearance_offers": db.query(StockClearanceListing).filter(
            StockClearanceListing.is_available.is_(True),
            StockClearanceListing.quantity > 0,
            StockClearanceListing.expires_at > now,
        ).count(),
        "stock_clearance_claims": db.query(StockClearanceClaim).count(),
        "expired_food_listings": db.query(FoodListing).filter(
            FoodListing.expires_at <= now
        ).count(),
        "expired_stock_clearance_offers": db.query(StockClearanceListing).filter(
            StockClearanceListing.expires_at <= now
        ).count(),
    }


@app.get("/admin/reports/impact")
def admin_impact_report(
    days: int = Query(default=30, ge=7, le=90),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    today = datetime.now(timezone.utc).date()
    start_date = today - timedelta(days=days - 1)

    def trend_counts(timestamp_column, filter_expression=None):
        query = db.query(
            func.date(timestamp_column).label("day"),
            func.count().label("count"),
        ).filter(timestamp_column >= datetime.combine(
            start_date,
            datetime.min.time(),
            tzinfo=timezone.utc,
        ))
        if filter_expression is not None:
            query = query.filter(filter_expression)
        return {
            row.day.isoformat() if hasattr(row.day, "isoformat") else str(row.day): row.count
            for row in query.group_by(func.date(timestamp_column)).all()
        }

    def format_trend(counts):
        return [
            {"date": (start_date + timedelta(days=index)).isoformat(),
             "count": counts.get((start_date + timedelta(days=index)).isoformat(), 0)}
            for index in range(days)
        ]

    role_counts = dict(
        db.query(User.role, func.count(User.id)).group_by(User.role).all()
    )
    food_claim_statuses = dict(
        db.query(FoodClaim.status, func.count(FoodClaim.id)).group_by(FoodClaim.status).all()
    )
    donation_quantity_by_unit = dict(
        db.query(FoodListing.unit, func.sum(FoodListing.quantity))
        .group_by(FoodListing.unit)
        .all()
    )
    claimed_quantity_by_unit = dict(
        db.query(FoodListing.unit, func.sum(FoodListing.quantity))
        .join(FoodClaim, FoodClaim.listing_id == FoodListing.id)
        .group_by(FoodListing.unit)
        .all()
    )
    delivered_quantity_by_unit = dict(
        db.query(FoodListing.unit, func.sum(FoodListing.quantity))
        .join(FoodClaim, FoodClaim.listing_id == FoodListing.id)
        .filter(FoodClaim.status == "delivered")
        .group_by(FoodListing.unit)
        .all()
    )
    stock_claimed_by_unit = dict(
        db.query(StockClearanceListing.unit, func.sum(StockClearanceClaim.quantity))
        .join(
            StockClearanceClaim,
            StockClearanceClaim.listing_id == StockClearanceListing.id,
        )
        .group_by(StockClearanceListing.unit)
        .all()
    )
    return {
        "analytics": admin_analytics(admin, db),
        "users_by_role": role_counts,
        "food_claims_by_status": food_claim_statuses,
        "quantity_by_unit": {
            "listed": donation_quantity_by_unit,
            "claimed": claimed_quantity_by_unit,
            "delivered": delivered_quantity_by_unit,
            "stock_clearance_claimed": stock_claimed_by_unit,
        },
        "trends": {
            "donations_created": format_trend(trend_counts(
                FoodListing.created_at,
            )),
            "claims_created": format_trend(trend_counts(
                FoodClaim.claimed_at,
            )),
            "deliveries_completed": format_trend(trend_counts(
                FoodClaim.delivered_at,
                FoodClaim.status == "delivered",
            )),
        },
        "period_days": days,
    }


@app.get("/admin/users", response_model=Page[UserResponse])
def admin_list_users(
    search: str = Query(default="", max_length=100),
    role: str | None = Query(
        default=None,
        pattern="^(user|restaurant|ngo|agent|school|admin)$",
    ),
    active: bool | None = None,
    verified: bool | None = None,
    sort: str = Query(default="newest", pattern="^(newest|oldest|name)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
) -> Page[UserResponse]:
    query = db.query(User)
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(User.full_name.ilike(term), User.email.ilike(term)))
    if role:
        query = query.filter(User.role == role)
    if active is not None:
        query = query.filter(User.is_active.is_(active))
    if verified is not None:
        query = query.filter(User.is_verified.is_(verified))
    total = query.count()
    order_column = {
        "newest": User.id.desc(),
        "oldest": User.id.asc(),
        "name": User.full_name.asc(),
    }[sort]
    users = query.order_by(order_column).offset(offset).limit(limit).all()
    return Page(
        items=[UserResponse.model_validate(user) for user in users],
        total=total,
        limit=limit,
        offset=offset,
    )


@app.get("/admin/users/{user_id}", response_model=UserResponse)
def admin_get_user(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


@app.patch("/admin/users/{user_id}", response_model=UserResponse)
def admin_update_user(
    user_id: int,
    changes: AdminUserUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    updates = changes.model_dump(exclude_unset=True, exclude={"reason"})
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No changes supplied.")
    if user.id == admin.id and updates.get("is_active") is False:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You cannot deactivate your own Admin account.")
    if user.role == "admin" and updates.get("role") not in (None, "admin"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin roles can only be changed through the protected provisioning process.")
    before = {key: getattr(user, key) for key in updates}
    rejected = updates.get("is_active") is False and updates.get("is_verified") is False
    approved = updates.get("is_verified") is True
    for key, value in updates.items():
        setattr(user, key, value)
    db.add(Notification(
        user_id=user.id,
        title="Account rejected" if rejected else ("Account approved" if approved else "Account status updated"),
        message=(
            f"An administrator rejected your account: {changes.reason.strip()}"
            if rejected and changes.reason
            else (
                "An administrator approved your account."
                if approved
                else "An administrator updated your account status."
            )
        ),
        category="account",
    ))
    action = "user.rejected" if rejected else ("user.approved" if approved else "user.status_changed")
    audit_details: dict[str, object] = {"before": before, "after": updates}
    if rejected and changes.reason:
        audit_details["reason"] = changes.reason.strip()
    record_admin_action(db, admin.id, action, "user", user.id, audit_details)
    db.commit()
    db.refresh(user)
    return user


@app.get("/admin/food-listings")
def admin_list_food_listings(
    search: str = Query(default="", max_length=100),
    available: bool | None = None,
    expired: bool | None = None,
    sort: str = Query(default="newest", pattern="^(newest|oldest|expiry|title)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    query = db.query(FoodListing)
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(FoodListing.title.ilike(term), FoodListing.pickup_location.ilike(term)))
    if available is not None:
        query = query.filter(FoodListing.is_available.is_(available))
    if expired is not None:
        now = datetime.now(timezone.utc)
        query = query.filter(
            FoodListing.expires_at <= now
            if expired
            else FoodListing.expires_at > now
        )
    order_column = {
        "newest": FoodListing.created_at.desc(),
        "oldest": FoodListing.created_at.asc(),
        "expiry": FoodListing.expires_at.asc(),
        "title": FoodListing.title.asc(),
    }[sort]
    total = query.count()
    items = query.order_by(order_column).offset(offset).limit(limit).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@app.patch("/admin/food-listings/{listing_id}")
def admin_update_food_listing(
    listing_id: int,
    changes: AdminListingUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    listing = db.query(FoodListing).filter(FoodListing.id == listing_id).with_for_update().first()
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Food listing not found.")
    previous = listing.is_available
    listing.is_available = changes.is_available
    db.add(Notification(
        user_id=listing.creator_id,
        title="Donation availability updated",
        message="An administrator updated your donation listing availability.",
        category="donation",
    ))
    record_admin_action(db, admin.id, "food_listing.availability_changed", "food_listing", listing.id, {"before": previous, "after": changes.is_available})
    db.commit()
    db.refresh(listing)
    return listing


@app.get("/admin/stock-clearance")
def admin_list_stock_clearance(
    search: str = Query(default="", max_length=100),
    available: bool | None = None,
    expired: bool | None = None,
    sort: str = Query(default="newest", pattern="^(newest|oldest|expiry|title)$"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    query = db.query(StockClearanceListing)
    if search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(StockClearanceListing.title.ilike(term), StockClearanceListing.pickup_location.ilike(term)))
    if available is not None:
        query = query.filter(StockClearanceListing.is_available.is_(available))
    if expired is not None:
        now = datetime.now(timezone.utc)
        query = query.filter(
            StockClearanceListing.expires_at <= now
            if expired
            else StockClearanceListing.expires_at > now
        )
    order_column = {
        "newest": StockClearanceListing.created_at.desc(),
        "oldest": StockClearanceListing.created_at.asc(),
        "expiry": StockClearanceListing.expires_at.asc(),
        "title": StockClearanceListing.title.asc(),
    }[sort]
    total = query.count()
    items = query.order_by(order_column).offset(offset).limit(limit).all()
    return {"items": [stock_clearance_response(item) for item in items], "total": total, "limit": limit, "offset": offset}


@app.patch("/admin/stock-clearance/{listing_id}")
def admin_update_stock_clearance(
    listing_id: int,
    changes: AdminListingUpdate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    listing = db.query(StockClearanceListing).filter(StockClearanceListing.id == listing_id).with_for_update().first()
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stock-clearance offer not found.")
    previous = listing.is_available
    listing.is_available = changes.is_available
    db.add(Notification(
        user_id=listing.creator_id,
        title="Flash Deal availability updated",
        message="An administrator updated your Stock Clearance offer availability.",
        category="stock_clearance",
    ))
    record_admin_action(db, admin.id, "stock_clearance.availability_changed", "stock_clearance_listing", listing.id, {"before": previous, "after": changes.is_available})
    db.commit()
    db.refresh(listing)
    return stock_clearance_response(listing)


@app.get("/admin/food-claims")
def admin_list_food_claims(
    status_filter: str | None = Query(
        default=None,
        pattern="^(claimed|assigned|collected|delivered)$",
    ),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    query = db.query(FoodClaim)
    if status_filter:
        query = query.filter(FoodClaim.status == status_filter)
    total = query.count()
    return {"items": query.order_by(FoodClaim.claimed_at.desc()).offset(offset).limit(limit).all(), "total": total, "limit": limit, "offset": offset}


@app.get("/admin/stock-clearance-claims")
def admin_list_stock_clearance_claims(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    query = db.query(StockClearanceClaim)
    total = query.count()
    return {"items": query.order_by(StockClearanceClaim.claimed_at.desc()).offset(offset).limit(limit).all(), "total": total, "limit": limit, "offset": offset}


@app.get("/admin/deliveries")
def admin_list_deliveries(
    status_filter: str | None = Query(
        default=None,
        pattern="^(claimed|assigned|collected|delivered)$",
    ),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    query = db.query(FoodClaim)
    if status_filter:
        query = query.filter(FoodClaim.status == status_filter)
    total = query.count()
    return {"items": query.order_by(FoodClaim.claimed_at.desc()).offset(offset).limit(limit).all(), "total": total, "limit": limit, "offset": offset}


@app.get("/admin/audit-logs", response_model=Page[AdminAuditLogResponse])
def admin_list_audit_logs(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    query = db.query(AdminAuditLog)
    return Page(
        items=query.order_by(
            AdminAuditLog.created_at.desc(),
            AdminAuditLog.id.desc(),
        ).offset(offset).limit(limit).all(),
        total=query.count(),
        limit=limit,
        offset=offset,
    )
