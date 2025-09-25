from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api.router import api_router
from app.db.sql.connect import create_tables, AsyncSessionLocal
from app.core.websockets import manager
from app.api.routes.user.crud import create_user, get_user_by_username
from app.api.routes.user.schemas import UserCreate
from app.api.routes.options import crud as options_crud
from app.db.sql import models
from sqlalchemy import select
import asyncio
import datetime
from app.api.routes.incidents import schemas as incident_schemas

app = FastAPI(
    title="Feuerwehr Melder",
    description="An application to manage fire department incidents and vehicles.",
    version="0.1.0"
)

@app.on_event("startup")
async def on_startup():
    await create_tables()
    # Create a default admin user if none exists
    async with AsyncSessionLocal() as db:
        admin_user = await get_user_by_username(db, "admin")
        if not admin_user:
            print("No admin user found. Creating default admin...")
            default_admin = UserCreate(username="admin", password="admin", role="admin")
            await create_user(db, default_admin)
            print("Default admin created with username 'admin' and password 'admin'")
        # Ensure a default options row exists
        await options_crud.ensure_default_options(db)
    # Start background activation task
    asyncio.create_task(activation_worker())

app.mount("/static", StaticFiles(directory="app/web/static"), name="static")

app.include_router(api_router, prefix="/api")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/")
async def read_index():
    return FileResponse('app/web/index.html')

# Serve SPA for client-side routes
@app.get("/incidents")
async def spa_incidents():
    return FileResponse('app/web/index.html')

@app.get("/dashboard")
async def spa_dashboard():
    # Serve dedicated fullscreen dashboard without header/nav
    return FileResponse('app/web/dashboard.html')

@app.get("/vehicles")
async def spa_vehicles():
    return FileResponse('app/web/index.html')

@app.get("/options")
async def spa_options():
    return FileResponse('app/web/index.html')

# Background worker: set incidents to active when scheduled_at reached
async def activation_worker():
    """Periodically activates incidents that have reached their scheduled time.
    Broadcasts an update for each newly activated incident so the dashboard can react.
    """
    # Small initial delay to ensure app is fully started
    await asyncio.sleep(0.5)
    while True:
        try:
            now = datetime.datetime.now(datetime.timezone.utc)
            async with AsyncSessionLocal() as db:
                # Find incidents in 'new' state with a scheduled time that has passed
                stmt = (
                    select(models.Incident)
                    .where(models.Incident.status == models.IncidentStatus.new)
                    .where(models.Incident.scheduled_at.is_not(None))
                )
                result = await db.execute(stmt)
                to_check = list(result.scalars().all())
                changed = []
                for inc in to_check:
                    # Normalize scheduled_at to aware UTC if naive
                    sch = inc.scheduled_at
                    if sch is None:
                        continue
                    if sch.tzinfo is None:
                        sch = sch.replace(tzinfo=datetime.timezone.utc)
                    if sch <= now:
                        inc.status = models.IncidentStatus.active
                        changed.append(inc)
                if changed:
                    await db.commit()
                    # Refresh and broadcast each
                    for inc in changed:
                        await db.refresh(inc)
                        payload = incident_schemas.IncidentOut.model_validate(inc).model_dump()
                        # Fire-and-forget websocket message
                        asyncio.create_task(manager.broadcast({"type": "incident_updated", "incident": payload}))
        except Exception as e:
            # Avoid crashing the worker
            print("activation_worker error:", e)
        # Run every second
        await asyncio.sleep(1)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)