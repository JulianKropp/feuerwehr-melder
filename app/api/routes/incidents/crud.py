from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List, Optional
from fastapi import HTTPException

from ....db.sql import models
from . import schemas
from ....core.websockets import manager
from ....core.geocoding import geocode_address

async def get_incident(db: AsyncSession, incident_id: int) -> Optional[models.Incident]:
    result = await db.execute(
        select(models.Incident)
        .options(selectinload(models.Incident.vehicles))
        .filter(models.Incident.id == incident_id)
    )
    incident = result.scalars().first()
    if incident:
        await db.refresh(incident) # Refresh to load server-defaults like created_at
        # Backfill legacy rows without created_at
        if getattr(incident, "created_at", None) is None:
            import datetime
            incident.created_at = datetime.datetime.now(datetime.timezone.utc)
            await db.commit()
    return incident

async def get_incidents(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[models.Incident]:
    result = await db.execute(
        select(models.Incident)
        .options(selectinload(models.Incident.vehicles))
        .offset(skip)
        .limit(limit)
    )
    incidents = result.scalars().all()
    # Refresh each incident to ensure server-defaults are loaded
    needs_commit = False
    for incident in incidents:
        await db.refresh(incident)
        if getattr(incident, "created_at", None) is None:
            import datetime
            incident.created_at = datetime.datetime.now(datetime.timezone.utc)
            needs_commit = True
    if needs_commit:
        await db.commit()
    return incidents

async def create_incident(db: AsyncSession, incident: schemas.IncidentCreate) -> models.Incident:
    try:
        data = incident.dict()
        # Coerce status from schema enum/string to models enum
        if "status" in data and data["status"] is not None:
            val = data["status"]
            data["status"] = models.IncidentStatus(val.value if hasattr(val, "value") else val)
        # Upsert behavior: find an existing incident by (title + scheduled_at) or (title + address)
        title = data.get("title")
        scheduled_at = data.get("scheduled_at")
        address = (data.get("address") or "").strip()
        existing = None
        if title:
            if scheduled_at is not None:
                # Prefer exact match on title + scheduled_at when provided
                res = await db.execute(
                    select(models.Incident).where(
                        models.Incident.title == title,
                        models.Incident.scheduled_at == scheduled_at,
                    )
                )
                existing = res.scalars().first()
            if existing is None and address:
                # Fallback: case-insensitive trimmed title + address
                res = await db.execute(
                    select(models.Incident).where(
                        func.lower(models.Incident.title) == func.lower(func.trim(func.cast(title, models.Incident.title.type))),
                        func.lower(func.trim(models.Incident.address)) == func.lower(func.trim(address)),
                    )
                )
                existing = res.scalars().first()

        if existing is not None:
            # Update existing incident using same rules as update_incident
            update_data = dict(data)  # from create payload
            # If address is updated and lat/lon not explicitly provided, geocode
            if "address" in update_data and update_data.get("address"):
                if not ("latitude" in update_data and "longitude" in update_data and update_data["latitude"] is not None and update_data["longitude"] is not None):
                    lat, lon = await geocode_address(update_data["address"])
                    update_data["latitude"], update_data["longitude"] = lat, lon
            # Handle vehicle assignment
            vehicle_ids = update_data.pop("vehicle_ids", None)
            if vehicle_ids is not None:
                res = await db.execute(select(models.Vehicle).where(models.Vehicle.id.in_(vehicle_ids)))
                existing.vehicles = list(res.scalars().all())
            for key, value in update_data.items():
                setattr(existing, key, value)
            await db.commit()
            await db.refresh(existing, attribute_names=["vehicles", "created_at"])  # ensure fields loaded

            import asyncio
            asyncio.create_task(
                manager.broadcast({
                    "type": "incident_updated",
                    "incident": schemas.IncidentOut.model_validate(existing).model_dump()
                })
            )
            return existing
        # Backend geocoding: if address provided and lat/lon missing
        if data.get("address") and (data.get("latitude") is None or data.get("longitude") is None):
            lat, lon = await geocode_address(data["address"])
            data["latitude"], data["longitude"] = lat, lon
        vehicle_ids = data.pop("vehicle_ids", []) or []
        db_incident = models.Incident(**data)
        db.add(db_incident)
        # attach vehicles if provided
        if vehicle_ids:
            res = await db.execute(select(models.Vehicle).where(models.Vehicle.id.in_(vehicle_ids)))
            db_incident.vehicles = list(res.scalars().all())
        await db.commit()
        # Ensure server defaults and relationships are loaded
        await db.refresh(db_incident, attribute_names=["created_at", "vehicles"])  # created_at via server_default
        created_incident = db_incident
        # Fallback: if created_at still None (SQLite timing), set it manually and persist
        if getattr(created_incident, "created_at", None) is None:
            import datetime
            created_incident.created_at = datetime.datetime.now(datetime.timezone.utc)
            await db.commit()

        import asyncio
        asyncio.create_task(
            manager.broadcast({
                "type": "incident_created",
                "incident": schemas.IncidentOut.model_validate(created_incident).model_dump()
            })
        )
        return created_incident
    except Exception:
        await db.rollback()
        raise

async def update_incident(db: AsyncSession, incident_id: int, incident_update: schemas.IncidentUpdate) -> Optional[models.Incident]:
    try:
        db_incident = await get_incident(db, incident_id)
        if db_incident:
            update_data = incident_update.dict(exclude_unset=True)
            # Coerce status if provided
            if "status" in update_data and update_data["status"] is not None:
                val = update_data["status"]
                update_data["status"] = models.IncidentStatus(val.value if hasattr(val, "value") else val)
            # If address is updated and lat/lon not explicitly provided, geocode
            if "address" in update_data and update_data.get("address"):
                if not ("latitude" in update_data and "longitude" in update_data and update_data["latitude"] is not None and update_data["longitude"] is not None):
                    lat, lon = await geocode_address(update_data["address"])
                    update_data["latitude"], update_data["longitude"] = lat, lon
            # Handle vehicle assignment
            if "vehicle_ids" in update_data:
                vehicle_ids = update_data.pop("vehicle_ids")
                if vehicle_ids is not None:
                    res = await db.execute(select(models.Vehicle).where(models.Vehicle.id.in_(vehicle_ids)))
                    db_incident.vehicles = list(res.scalars().all())
            for key, value in update_data.items():
                setattr(db_incident, key, value)
            await db.commit()
            # Ensure relationships are loaded for serialization
            await db.refresh(db_incident, attribute_names=["vehicles", "created_at"])  # ensure fields loaded

            import asyncio
            asyncio.create_task(
                manager.broadcast({
                    "type": "incident_updated",
                    "incident": schemas.IncidentOut.model_validate(db_incident).model_dump()
                })
            )
            return db_incident

        # If not found, perform an upsert: create a new incident using the provided update data
        create_data = incident_update.dict(exclude_unset=True)
        # Coerce status for upsert path
        if "status" in create_data and create_data["status"] is not None:
            val = create_data["status"]
            create_data["status"] = models.IncidentStatus(val.value if hasattr(val, "value") else val)
        # Geocode if address present and coords missing
        if create_data.get("address") and (create_data.get("latitude") is None or create_data.get("longitude") is None):
            lat, lon = await geocode_address(create_data["address"])
            create_data["latitude"], create_data["longitude"] = lat, lon
        vehicle_ids = create_data.pop("vehicle_ids", []) or []
        db_new = models.Incident(
            title=create_data.get("title", "Einsatz"),
            description=create_data.get("description"),
            address=create_data.get("address"),
            latitude=create_data.get("latitude"),
            longitude=create_data.get("longitude"),
            scheduled_at=create_data.get("scheduled_at"),
            status=create_data.get("status", models.IncidentStatus.new),
        )
        db.add(db_new)
        if vehicle_ids:
            res = await db.execute(select(models.Vehicle).where(models.Vehicle.id.in_(vehicle_ids)))
            db_new.vehicles = list(res.scalars().all())
        await db.commit()
        await db.refresh(db_new, attribute_names=["vehicles", "created_at"])  # ensure fields loaded

        import asyncio
        asyncio.create_task(
            manager.broadcast({
                "type": "incident_created",
                "incident": schemas.IncidentOut.model_validate(db_new).model_dump()
            })
        )
        return db_new
    except Exception:
        await db.rollback()
        raise

async def delete_incident(db: AsyncSession, incident_id: int) -> Optional[models.Incident]:
    try:
        db_incident = await get_incident(db, incident_id)
        if db_incident:
            await db.delete(db_incident)
            await db.commit()
            import asyncio
            asyncio.create_task(
                manager.broadcast({"type": "incident_deleted", "incident_id": incident_id})
            )
        return db_incident
    except Exception:
        await db.rollback()
        raise
