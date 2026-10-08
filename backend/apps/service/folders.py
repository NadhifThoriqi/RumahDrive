from fastapi import HTTPException
from typing import Dict, Any

from .files import (
    virtual_to_real, 
    file_to_item as folder_to_item,
    id_to_path
)

import os
import shutil

async def create(name: str, root:bool, path: str) -> Dict[str, Any]:
    # 1. Validasi path induk
    dir = virtual_to_real(f"{path}", root)

    if not dir.exists() or not dir.is_dir():
        raise HTTPException(status_code=404, detail="Folder induk tidak ditemukan")

    # 2. KEAMANAN: Gabungkan path lalu validasi ulang seluruh path baru tersebut
    # Ini mencegah user memasukkan 'name' seperti '../../nama_folder'
    full_virtual_path = f"{path.strip('/')}/{name.strip('/')}".lstrip("/")
    new_path = virtual_to_real(full_virtual_path, root)

    # 3. Cek apakah folder sudah ada
    if new_path.exists():
        raise HTTPException(status_code=400, detail=f"Folder dengan nama ini ('{name}') sudah ada.")

    # 4. Eksekusi pembuatan folder
    try:
        new_path.mkdir(parents=False, exist_ok=False)
        return folder_to_item(new_path, f"{path}/{name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal membuat folder: {str(e)}")
    
async def detail(id: str, root: bool) -> Dict[str, Any]:
    path = id_to_path(id)
    real_path = virtual_to_real(path, root)

    if not real_path.exists() or not real_path.is_dir():
        raise HTTPException(status_code=404, detail="Folder tidak ditemukan")

    return folder_to_item(real_path, path)

async def rename(id: str, new_folder_name: str, root: bool) -> Dict[str, Any]:
    path = virtual_to_real(id_to_path(id), root)

    # Validasi apakah file yang ingin diedit memang ada
    if not path.is_dir():
        raise HTTPException(status_code=404, detail="Folder yang ingin diedit tidak ditemukan")

    new_folder_path = path.parent / new_folder_name
    if new_folder_path.exists():
        raise HTTPException(status_code=400, detail=f"Sudah ada folder dengan nama '{new_folder_name}' di lokasi yang sama.") 

    os.rename(path, new_folder_path)

    return {"filename": new_folder_name, "status": "Folder berhasil diubah namanya"}
# *
async def move(id: str, new_parent_path: str, timpa: bool = False, root: bool = False) -> Dict[str, Any]:
    path = virtual_to_real(id_to_path(id), root)
    new_parent_real = virtual_to_real(new_parent_path, root)

    # Validasi apakah folder yang ingin dipindahkan memang ada
    if not path.is_dir():
        raise HTTPException(status_code=404, detail="Folder yang ingin dipindahkan tidak ditemukan")

    # Validasi apakah parent baru memang ada dan merupakan folder
    if not new_parent_real.exists() or not new_parent_real.is_dir():
        raise HTTPException(status_code=404, detail="Parent folder baru tidak ditemukan")

    new_folder_path = new_parent_real / path.name

    if not timpa :
        if new_folder_path.exists() or not new_parent_real.is_dir():
            raise HTTPException(status_code=409, detail=f"Sudah ada folder dengan nama '{path.name}' di lokasi tujuan.")

    os.rename(path, new_folder_path)

    return folder_to_item(new_folder_path, f"{new_parent_path}/{path.name}")

async def delete(id: str, root: bool) -> Dict[str, Any]:
    real_path = virtual_to_real(id_to_path(id), root)

    if not real_path.exists() or not real_path.is_dir():
        raise HTTPException(status_code=404, detail="Folder yang ingin dihapus tidak ditemukan")

    try:
        shutil.rmtree(real_path)
        return {"message": "Folder deleted successfully"}
    except OSError as e:
        raise HTTPException(status_code=400, detail=f"Folder tidak kosong atau terjadi kesalahan: {str(e)}")
