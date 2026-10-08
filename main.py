from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Any

import backend
import frontend

from backend.apps.db.config import settings
from backend.apps.db.session import create_db_and_tables, get_session
from backend.apps.service.auth import bootstrap_from_env

# Path direktori proyek & folder assets frontend
BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "frontend" / "assets"

@asynccontextmanager
async def lifespan(app: FastAPI):
    
    # --- DIJALANKAN SAAT STARTUP ---
    print("Aplikasi sedang berjalan, membuat tabel...")
    await create_db_and_tables()

    # Buat akun keluarga pertama otomatis jika ADMIN_EMAIL/ADMIN_PASSWORD
    # sudah diisi di .env dan tabel auth masih kosong.
    async for session in get_session():
        await bootstrap_from_env(session)
        break

    # Aplikasi mulai menerima request setelah ini
    yield
    
    # --- DIJALANKAN SAAT SHUTDOWN ---
    print("Aplikasi sedang dimatikan...")
    
# PENTING: Tambahkan root_path agar sinkron dengan Nginx /thorix/
app = FastAPI(root_path="/storage", lifespan=lifespan) 

# === TAMBAHKAN INI (PENTING!) ===
# Jika tidak diinisialisasi di sini, middleware akan eror karena variabel belum ada saat dicek
app.state.is_lockdown = False
# ================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["DELETE", "GET", "POST", "PUT", "PATCH"],
    allow_headers=["*"],
)

@app.middleware("http")
async def kunci_operasi_sistem(request: Request, call_next: Any):
    # Mengecek status lockdown dari state app
    if request.app.state.is_lockdown and request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        raise HTTPException(
            status_code=503,
            detail="Server sedang bersiap untuk restart/shutdown. Operasi perubahan data dimatikan."
        )
    
    return await call_next(request)


app.mount(
    "/thorix-assets",
    StaticFiles(directory=str(ASSETS_DIR)),
    name="assets",
)


# Root route untuk testing apakah aplikasi sudah "up"
@app.get("/status")
def read_root():
    return {"status": "FastAPI is running", "path": "/thorix/"}

app.include_router(backend.run)
app.include_router(frontend.run)

if __name__ == "__main__":
    uvicorn.run("main:app", host='0.0.0.0', port=settings.port, reload=settings.debug) # nosec