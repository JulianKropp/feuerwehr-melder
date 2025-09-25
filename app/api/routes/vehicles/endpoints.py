from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from . import crud, schemas
from ....db.sql.connect import get_db
from ....db.sql import models
from ....core.security import get_current_active_admin

router = APIRouter()

@router.post("/", response_model=schemas.Vehicle)
async def create_vehicle(
    vehicle: schemas.VehicleCreate, 
    db: AsyncSession = Depends(get_db),
    current_admin: models.User = Depends(get_current_active_admin)
):
    return await crud.create_vehicle(db=db, vehicle=vehicle)

@router.get("/", response_model=List[schemas.Vehicle])
async def read_vehicles(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    vehicles = await crud.get_vehicles(db, skip=skip, limit=limit)
    return vehicles

@router.get("/{vehicle_id}", response_model=schemas.Vehicle)
async def read_vehicle(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    db_vehicle = await crud.get_vehicle(db, vehicle_id=vehicle_id)
    if db_vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return db_vehicle

@router.put("/{vehicle_id}", response_model=schemas.Vehicle)
async def update_vehicle(
    vehicle_id: int, 
    vehicle: schemas.VehicleUpdate, 
    db: AsyncSession = Depends(get_db),
    current_admin: models.User = Depends(get_current_active_admin)
):
    db_vehicle = await crud.update_vehicle(db, vehicle_id=vehicle_id, vehicle_update=vehicle)
    if db_vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return db_vehicle

@router.delete("/{vehicle_id}", response_model=schemas.Vehicle)
async def delete_vehicle(
    vehicle_id: int, 
    db: AsyncSession = Depends(get_db),
    current_admin: models.User = Depends(get_current_active_admin)
):
    db_vehicle = await crud.delete_vehicle(db, vehicle_id=vehicle_id)
    if db_vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return db_vehicle
