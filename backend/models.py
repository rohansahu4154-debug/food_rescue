
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    food_listings: Mapped[list["FoodListing"]] = relationship(
        back_populates="creator"
    )


class FoodListing(Base):
    __tablename__ = "food_listings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str] = mapped_column(String(30), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit: Mapped[str] = mapped_column(String(30), nullable=False)
    price_paise: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pickup_location: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    is_available: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )

    creator: Mapped["User"] = relationship(back_populates="food_listings")


class FoodClaim(Base):
    __tablename__ = "food_claims"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    listing_id: Mapped[int] = mapped_column(
        ForeignKey("food_listings.id"),
        unique=True,
        nullable=False,
        index=True,
    )

    ngo_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    volunteer_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="claimed",
        nullable=False,
    )

    claimed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    collected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class StockClearanceListing(Base):
    __tablename__ = "stock_clearance_listings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit: Mapped[str] = mapped_column(String(30), nullable=False)
    original_price_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    pickup_location: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    is_available: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    creator_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )


class StockClearanceClaim(Base):
    __tablename__ = "stock_clearance_claims"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("stock_clearance_listings.id"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    discount_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    claimed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    actor_type: Mapped[str] = mapped_column(String(30), nullable=False, default="admin")
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
