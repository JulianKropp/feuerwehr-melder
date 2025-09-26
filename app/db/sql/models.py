import datetime
from sqlalchemy import Column, Integer, String, DateTime, Enum, Float, Table, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..sql.connect import Base
import enum

class IncidentStatus(str, enum.Enum):
    new = "new"
    active = "active"
    closed = "closed"

class UserRole(str, enum.Enum):
    admin = "admin"
    viewer = "viewer"

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(String)
    status = Column(Enum(IncidentStatus), default=IncidentStatus.new)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Location and scheduling
    address = Column(String, nullable=False, default="")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    # relationships
    vehicles = relationship(
        "Vehicle",
        secondary="incident_vehicles",
        back_populates="incidents",
        lazy="selectin",
    )

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    status = Column(Integer, nullable=False, default=1)
    incidents = relationship(
        "Incident",
        secondary="incident_vehicles",
        back_populates="vehicles",
        lazy="selectin",
    )

# Association table for many-to-many Incident<->Vehicle
incident_vehicles = Table(
    "incident_vehicles",
    Base.metadata,
    Column("incident_id", Integer, ForeignKey("incidents.id", ondelete="CASCADE"), primary_key=True),
    Column("vehicle_id", Integer, ForeignKey("vehicles.id", ondelete="CASCADE"), primary_key=True),
)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(Enum(UserRole), default=UserRole.viewer)

class Options(Base):
    __tablename__ = "options"

    id = Column(Integer, primary_key=True, index=True)
    audio_enabled = Column(Boolean, default=True, nullable=False)
    speech_enabled = Column(Boolean, default=True, nullable=False)
    alarm_sound = Column(String, default="gong1.mp3", nullable=False)
    speech_language = Column(String, default="de-DE", nullable=False)
    # Weather settings (dashboard)
    weather_location = Column(String, default="", nullable=False)
