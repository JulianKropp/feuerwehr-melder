from fastapi import APIRouter, Body

from ....core.websockets import manager

router = APIRouter()

@router.post("/trigger-alarm")
async def trigger_alarm(payload: dict = Body(...)):
    """
    Triggers an alarm and broadcasts it to all connected clients.
    The payload should contain a 'message' to be spoken.
    """
    await manager.broadcast({"type": "alarm", "message": payload.get("message", "Alarm!")})
    return {"status": "alarm triggered"}
