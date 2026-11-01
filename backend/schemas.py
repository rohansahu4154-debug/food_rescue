

from datetime import datetime
import math
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic import field_validator, model_validator


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["user"] = "user"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    role: str
    is_verified: bool
    is_active: bool


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class FoodListingCreate(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    source_type: Literal["restaurant", "event"]
    quantity: int = Field(gt=0, le=100000)
    unit: str = Field(min_length=1, max_length=30)
    price_paise: int = Field(default=0, ge=0)
    pickup_location: str = Field(min_length=3, max_length=255)
    pickup_latitude: float | None = Field(default=None, ge=-90, le=90)
    pickup_longitude: float | None = Field(default=None, ge=-180, le=180)
    expires_at: datetime

    @field_validator("pickup_location")
    @classmethod
    def strip_pickup_address(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("Pickup location must contain at least 3 characters.")
        return normalized

    @model_validator(mode="after")
    def validate_pickup_coordinates(self):
        if (self.pickup_latitude is None) != (self.pickup_longitude is None):
            raise ValueError("Both pickup coordinates must be provided together.")
        if self.pickup_latitude is not None and self.pickup_longitude is not None and (
            not math.isfinite(self.pickup_latitude)
            or not math.isfinite(self.pickup_longitude)
        ):
            raise ValueError("Pickup coordinates must be finite numbers.")
        return self


class FoodListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    source_type: str
    quantity: int
    unit: str
    price_paise: int
    pickup_location: str
    pickup_latitude: float | None
    pickup_longitude: float | None
    expires_at: datetime
    is_available: bool
    created_at: datetime
    creator_id: int

class FoodClaimResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    listing_id: int
    ngo_id: int
    volunteer_id: int | None
    status: str
    claimed_at: datetime
    collected_at: datetime | None
    delivered_at: datetime | None
    delivery_address: str | None
    delivery_latitude: float | None
    delivery_longitude: float | None
    volunteer_latitude: float | None
    volunteer_longitude: float | None
    volunteer_location_updated_at: datetime | None


class VolunteerTaskListing(BaseModel):
    id: int
    title: str
    quantity: int
    unit: str
    pickup_location: str
    pickup_latitude: float | None
    pickup_longitude: float | None
    expires_at: datetime


class LocationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    address: str = Field(min_length=3, max_length=500)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    @field_validator("address")
    @classmethod
    def strip_location_address(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("Address must contain at least 3 characters.")
        return normalized

    @model_validator(mode="after")
    def validate_finite_coordinates(self):
        if not math.isfinite(self.latitude) or not math.isfinite(self.longitude):
            raise ValueError("Coordinates must be finite numbers.")
        return self


class DeliveryLocationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    @model_validator(mode="after")
    def validate_finite_coordinates(self):
        if not math.isfinite(self.latitude) or not math.isfinite(self.longitude):
            raise ValueError("Coordinates must be finite numbers.")
        return self


class VolunteerTaskResponse(FoodClaimResponse):
    listing: VolunteerTaskListing


class StockClearanceCreate(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    quantity: int = Field(gt=0, le=100000)
    unit: str = Field(min_length=1, max_length=30)
    original_price_paise: int = Field(gt=0)
    pickup_location: str = Field(min_length=3, max_length=255)
    expires_at: datetime


class StockClearanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    quantity: int
    unit: str
    original_price_paise: int
    pickup_location: str
    expires_at: datetime
    is_available: bool
    created_at: datetime
    creator_id: int
    discount_percent: int
    discounted_price_paise: int


class StockClearanceClaimCreate(BaseModel):
    quantity: int = Field(gt=0, le=100000)


class StockClearanceClaimResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    listing_id: int
    customer_id: int
    quantity: int
    discount_percent: int
    unit_price_paise: int
    claimed_at: datetime


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool | None = None
    is_verified: bool | None = None
    reason: str | None = Field(default=None, min_length=3, max_length=500)

    @field_validator("reason")
    @classmethod
    def strip_rejection_reason(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value

    @model_validator(mode="after")
    def require_status_change(self):
        if self.is_active is None and self.is_verified is None:
            raise ValueError("At least one account status change is required.")
        if self.is_active is False and self.is_verified is False and not self.reason:
            raise ValueError("A rejection reason is required.")
        return self


class AdminListingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_available: bool


class RestaurantListingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    pickup_location: str | None = Field(default=None, min_length=3, max_length=255)

    @model_validator(mode="after")
    def require_listing_change(self):
        changed_fields = self.model_dump(exclude_unset=True)
        if not changed_fields:
            raise ValueError("At least one editable listing field is required.")
        if any(changed_fields.get(field) is None for field in ("title", "pickup_location") if field in changed_fields):
            raise ValueError("Title and pickup location cannot be empty.")
        return self


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    message: str
    category: str
    created_at: datetime
    read_at: datetime | None


class AdminAuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admin_id: int
    actor_type: str
    action: str
    resource_type: str
    resource_id: int | None
    details: dict[str, object]
    created_at: datetime


class RestaurantFoodListingResponse(FoodListingResponse):
    claims: list[FoodClaimResponse] = Field(default_factory=list)


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
