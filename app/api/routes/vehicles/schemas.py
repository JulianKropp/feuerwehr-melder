from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional
import enum

class VehicleStatus(str, enum.Enum):
    available = "available"
    unavailable = "unavailable"
    in_maintenance = "in_maintenance"

class VehicleBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    status: VehicleStatus = VehicleStatus.available

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("name must not be blank")
        return v.strip()

class VehicleCreate(VehicleBase):
    pass

class VehicleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    status: Optional[VehicleStatus] = None

    @field_validator("name")
    @classmethod
    def name_not_blank_if_provided(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("name must not be blank when provided")
        return v.strip()

class Vehicle(VehicleBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
