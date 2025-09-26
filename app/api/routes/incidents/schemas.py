from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
import datetime
from typing import Optional, List
import pytz

# Assuming models.py is in app/db/sql/models.py
# We need to adjust the import path if it's different
# For now, let's define the Enum here as well for clarity
import enum

class IncidentStatus(str, enum.Enum):
    new = "new"
    active = "active"
    closed = "closed"

class IncidentBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    address: Optional[str] = Field(None, min_length=3, max_length=400)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    scheduled_at: Optional[datetime.datetime] = None
    status: IncidentStatus = IncidentStatus.new

    @field_validator("scheduled_at")
    @classmethod
    def ensure_timezone(cls, v: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
        if v and v.tzinfo is None:
            # If datetime is naive, assume it's UTC
            return v.replace(tzinfo=datetime.timezone.utc)
        return v

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("title must not be blank")
        return v.strip()

    @field_validator("address")
    @classmethod
    def address_not_blank(cls, v: str) -> str:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("address must not be blank")
        return v.strip()

    @model_validator(mode="after")
    def check_location_present(self):
        """Require either address OR both latitude and longitude."""
        if (self.address and self.address.strip()) or (
            self.latitude is not None and self.longitude is not None
        ):
            return self
        raise ValueError("Either address or both latitude and longitude must be provided")

class IncidentCreate(IncidentBase):
    vehicle_ids: List[int] = []

class IncidentUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=5000)
    address: Optional[str] = Field(None, min_length=3, max_length=400)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    scheduled_at: Optional[datetime.datetime] = None
    status: Optional[IncidentStatus] = None
    vehicle_ids: Optional[List[int]] = None

    @field_validator("title")
    @classmethod
    def title_not_blank_if_provided(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("title must not be blank when provided")
        return v.strip()

    @field_validator("address")
    @classmethod
    def address_not_blank_if_provided(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("address must not be blank when provided")
        return v.strip()

class Incident(IncidentBase):
    # Override to allow legacy rows with empty address to serialize
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    scheduled_at: Optional[datetime.datetime] = None
    id: int
    created_at: datetime.datetime

    # Relax address validation for RESPONSE model only
    @field_validator("address")
    @classmethod
    def address_allow_blank(cls, v: Optional[str]) -> Optional[str]:
        # Accept None or empty strings for legacy data when serializing responses
        return v if v is None or v.strip() == "" or len(v.strip()) >= 0 else v

    # Disable the base model's location requirement for RESPONSE serialization
    @model_validator(mode="after")
    def skip_location_requirement(self):
        return self

    model_config = ConfigDict(from_attributes=True)


class IncidentOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: IncidentStatus
    created_at: datetime.datetime
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    scheduled_at: Optional[datetime.datetime] = None
    vehicles: List["VehicleRef"] = []

    model_config = ConfigDict(
        from_attributes=True,
        json_encoders={
            datetime.datetime: lambda dt: dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        }
    )


class VehicleRef(BaseModel):
    id: int
    name: str
    status: int

    model_config = ConfigDict(from_attributes=True)
