from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi import status as http_status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from . import crud, schemas
from ....db.sql.connect import get_db
from ....db.sql import models
from ....core.security import get_current_active_admin

router = APIRouter()

@router.post("/", response_model=schemas.IncidentOut)
async def create_incident(
    incident: schemas.IncidentCreate, 
    db: AsyncSession = Depends(get_db),
    current_admin: models.User = Depends(get_current_active_admin)
):
    obj = await crud.create_incident(db=db, incident=incident)
    return schemas.IncidentOut.model_validate(obj)

@router.get("/", response_model=List[schemas.IncidentOut])
async def read_incidents(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    incidents = await crud.get_incidents(db, skip=skip, limit=limit)
    return [schemas.IncidentOut.model_validate(i) for i in incidents]

@router.get("/{incident_id}", response_model=schemas.IncidentOut)
async def read_incident(incident_id: int, db: AsyncSession = Depends(get_db)):
    db_incident = await crud.get_incident(db, incident_id=incident_id)
    if db_incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return schemas.IncidentOut.model_validate(db_incident)

@router.put("/{incident_id}", response_model=schemas.IncidentOut)
async def update_incident(
    incident_id: int, 
    incident: schemas.IncidentUpdate, 
    db: AsyncSession = Depends(get_db),
    current_admin: models.User = Depends(get_current_active_admin)
):
    db_incident = await crud.update_incident(db, incident_id=incident_id, incident_update=incident)
    if db_incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return schemas.IncidentOut.model_validate(db_incident)

@router.delete("/{incident_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def delete_incident(
    incident_id: int,
    db: AsyncSession = Depends(get_db),
    current_admin: models.User = Depends(get_current_active_admin)
):
    db_incident = await crud.delete_incident(db, incident_id=incident_id)
    if db_incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return Response(status_code=http_status.HTTP_204_NO_CONTENT)
