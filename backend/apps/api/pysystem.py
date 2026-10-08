# api.py
from fastapi import APIRouter, HTTPException, Request, Depends
import asyncio

from ..core.security import get_current_user, verify_password
from ..service.services_pysystem import system
from ..models.auth_model import Auth
from ..service import files

router = APIRouter(prefix="/system", tags=["System Control"])

@router.post("/{aksi}")
async def pemicu_sistem(aksi: str, request: Request, root_pass: str, current_user: Auth = Depends(get_current_user)):
    if not verify_password(root_pass, current_user.hashed_password) and not files.key(root_pass):
        raise HTTPException(status_code=403, detail="Aksi Terlarang. Anda tidak memiliki izin untuk ini")

    if aksi not in ["reboot", "shutdown"]:
        raise HTTPException(status_code=400, detail="Aksi harus 'reboot' atau 'shutdown'")
    
    # Ambil objek app utama dari request
    app_utama = request.app
    
    # Jalankan di background, oper aksi dan objek app-nya
    asyncio.create_task(system(aksi, app_utama, root_pass))
    
    return {"message": f"Server akan {aksi} dalam 5 detik. Mode baca-saja (GET) diaktifkan."}