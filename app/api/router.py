from fastapi import APIRouter

from .routes.incidents.endpoints import router as incidents_router
from .routes.vehicles.endpoints import router as vehicles_router
from .routes.system.endpoints import router as system_router
from .routes.user.endpoints import router as user_router
from .routes.options.endpoints import router as options_router

api_router = APIRouter()

# The user router contains the /token endpoint, which should be at the root of the API
api_router.include_router(user_router)

api_router.include_router(incidents_router, prefix="/incidents", tags=["incidents"])
api_router.include_router(vehicles_router, prefix="/vehicles", tags=["vehicles"])
api_router.include_router(system_router, prefix="/system", tags=["system"])
api_router.include_router(options_router, prefix="/options", tags=["options"])

