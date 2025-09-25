from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....db.sql.connect import get_db
from . import crud, schemas

router = APIRouter()

@router.get("/", response_model=schemas.OptionsOut)
async def get_options_endpoint(db: AsyncSession = Depends(get_db)):
    opts = await crud.ensure_default_options(db)
    return schemas.OptionsOut.model_validate(opts)

@router.put("/", response_model=schemas.OptionsOut)
async def update_options_endpoint(payload: schemas.OptionsUpdate, db: AsyncSession = Depends(get_db)):
    opts = await crud.update_options(db, payload)
    return schemas.OptionsOut.model_validate(opts)
