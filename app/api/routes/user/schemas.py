from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional
import enum

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)

    @field_validator("username")
    @classmethod
    def username_rules(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("username must not be blank")
        # allow letters, numbers, underscores, dashes, dots
        import re
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", v):
            raise ValueError("username may contain only letters, numbers, underscores, dashes and dots")
        return v

class UserRole(str, enum.Enum):
    admin = "admin"
    viewer = "viewer"

class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=128)
    role: UserRole = UserRole.viewer

class User(UserBase):
    id: int
    role: UserRole

    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
