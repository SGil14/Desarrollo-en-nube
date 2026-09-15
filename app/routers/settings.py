from fastapi import APIRouter

from app.db import get_settings, save_settings, wipe_all_rows
from app.schemas import SettingsUpdate

router = APIRouter()


@router.put("/api/settings")
async def update_settings(body: SettingsUpdate):
    current = await get_settings()
    patch = body.model_dump(exclude_unset=True)
    await save_settings({**current, **patch})
    return {"ok": True}


@router.post("/api/clear-examples")
async def clear_examples():
    current = await get_settings()
    if current.get("isExample"):
        await wipe_all_rows()
        await save_settings({**current, "isExample": False})
    return {"ok": True}


@router.post("/api/wipe")
async def wipe_everything():
    await wipe_all_rows()
    current = await get_settings()
    await save_settings({**current, "isExample": False})
    return {"ok": True}
