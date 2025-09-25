from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional

from ....db.sql import models
from . import schemas
from ....core.websockets import manager

async def get_vehicle(db: AsyncSession, vehicle_id: int) -> Optional[models.Vehicle]:
    result = await db.execute(select(models.Vehicle).filter(models.Vehicle.id == vehicle_id))
    return result.scalars().first()

async def get_vehicles(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[models.Vehicle]:
    result = await db.execute(select(models.Vehicle).offset(skip).limit(limit))
    return result.scalars().all()

async def create_vehicle(db: AsyncSession, vehicle: schemas.VehicleCreate) -> models.Vehicle:
    try:
        db_vehicle = models.Vehicle(**vehicle.dict())
        db.add(db_vehicle)
        await db.commit()
        await db.refresh(db_vehicle)
        # Create a new task for the broadcast to avoid blocking
        import asyncio
        asyncio.create_task(manager.broadcast({
            "type": "vehicle_created", 
            "vehicle": schemas.Vehicle.model_validate(db_vehicle).model_dump()
        }))
        return db_vehicle
    except Exception as e:
        await db.rollback()
        raise e

async def update_vehicle(db: AsyncSession, vehicle_id: int, vehicle_update: schemas.VehicleUpdate) -> Optional[models.Vehicle]:
    try:
        db_vehicle = await get_vehicle(db, vehicle_id)
        if db_vehicle:
            update_data = vehicle_update.dict(exclude_unset=True)
            for key, value in update_data.items():
                setattr(db_vehicle, key, value)
            await db.commit()
            await db.refresh(db_vehicle)
            # Create a new task for the broadcast to avoid blocking
            import asyncio
            asyncio.create_task(manager.broadcast({
                "type": "vehicle_updated", 
                "vehicle": schemas.Vehicle.model_validate(db_vehicle).model_dump()
            }))
        return db_vehicle
    except Exception as e:
        await db.rollback()
        raise e

async def delete_vehicle(db: AsyncSession, vehicle_id: int) -> Optional[models.Vehicle]:
    try:
        db_vehicle = await get_vehicle(db, vehicle_id)
        if db_vehicle:
            vehicle_id = db_vehicle.id
            await db.delete(db_vehicle)
            await db.commit()
            # Create a new task for the broadcast to avoid blocking
            import asyncio
            asyncio.create_task(manager.broadcast({
                "type": "vehicle_deleted", 
                "vehicle_id": vehicle_id
            }))
        return db_vehicle
    except Exception as e:
        await db.rollback()
        raise e
