from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional

ALLOWED_STATUS_VALUES = {1, 2, 3, 4, 6}

class VehicleBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    status: int = Field(1, description="Fahrzeugstatus als Zahl (erlaubt: 1,2,3,4,6)")

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("name must not be blank")
        return v.strip()

    @field_validator("status")
    @classmethod
    def status_allowed(cls, v: int) -> int:
        if v not in ALLOWED_STATUS_VALUES:
            raise ValueError("status must be one of {1,2,3,4,6}")
        return v

class VehicleCreate(VehicleBase):
    pass

class VehicleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    status: Optional[int] = None

    @field_validator("name")
    @classmethod
    def name_not_blank_if_provided(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("name must not be blank when provided")
        return v.strip()

    @field_validator("status")
    @classmethod
    def status_allowed_if_provided(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return v
        if v not in ALLOWED_STATUS_VALUES:
            raise ValueError("status must be one of {1,2,3,4,6}")
        return v

class Vehicle(VehicleBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
