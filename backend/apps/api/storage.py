from fastapi import APIRouter

from ..service import storage

router = APIRouter(prefix="/storage", tags=["storage"])

@router.get("/info")
async def get_storage_info():
    return await storage.info()