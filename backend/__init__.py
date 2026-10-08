from fastapi import APIRouter

from backend.apps.api import folders, files, storage, pysystem, auth

run = APIRouter(prefix="/thorix-api")

run.include_router(auth.router)
run.include_router(folders.router)
run.include_router(files.router)
run.include_router(storage.router)
run.include_router(pysystem.router)