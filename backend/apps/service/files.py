from dotenv import load_dotenv
from typing import Dict, Any, List, cast
from fastapi import UploadFile, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from pathlib import Path
from datetime import datetime

import os
import shutil
import base64
import mimetypes
import urllib.parse

from ..db.config import settings

load_dotenv()

def directory() -> str:
    DIR = os.path.abspath(settings.dir) 
    os.makedirs(DIR, exist_ok=True)
    return DIR


def key(
    password: str = Query(
        default="",
        description="Password untuk mengakses file root")
) -> bool:
    KEY_ENV = os.getenv("KEY")
    if KEY_ENV is None: 
        raise RuntimeError("Environment variable 'KEY' is not set")
    return False if path_to_id(password) != KEY_ENV else True


def path_to_id(virtual_path: str) -> str:
    """"/Foto/pantai.jpg" → "L0ZvdG8vcGFudGFpLmpwZw=="""
    return base64.urlsafe_b64encode((virtual_path.replace("./", "/")).encode()).decode()

def id_to_path(item_id: str) -> str:
    """"L0ZvdG8vcGFudGFpLmpwZw==" → "/Foto/pantai.jpg"""
    return base64.urlsafe_b64decode(item_id.encode()).decode()

def virtual_to_real(virtual_path: str, root: bool = False) -> Path:
    """Path logis → path fisik di disk."""
    try:
        # Strip leading slash dan gabungkan dengan root directory
        clean = virtual_path.lstrip("/")
        base_dir = Path(directory()).absolute().resolve()
        
        # Gunakan .absolute() dulu agar path non-eksis bisa dihitung dengan benar
        real = (base_dir / clean).absolute()

        if not root:
            # KEAMANAN: pastikan tidak ada path traversal (../../etc/passwd)
            real.resolve().relative_to(base_dir)

        return real
    
    except ValueError:
        raise HTTPException(status_code=400, detail="Akses path tidak diizinkan")
        
def file_to_item(real_path: Path, virtual_path: str) -> Dict[str, Any]:
    stat = real_path.stat()
    is_folder = real_path.is_dir()
    mime = "Folder" if is_folder else mimetypes.guess_type(real_path.name)[0]
    item_id = path_to_id(virtual_path)

    # Hitung ukuran: jika folder, jumlahkan semua file di dalamnya secara rekursif
    if is_folder:
        try:
            size_bytes = sum(f.stat().st_size for f in real_path.rglob('*') if f.is_file())
            item_count = sum(1 for _ in real_path.iterdir())
        except Exception:
            size_bytes = 0  # Antisipasi jika ada error permission/akses folder
            item_count = 0  # Antisipasi jika ada error permission/akses folder
    else:
        size_bytes = stat.st_size
        item_count = 0

    return {
        "id"            : item_id,
        "name"          : real_path.name,
        "type"          : "folder" if is_folder else "file",
        "path"          : virtual_path, 
        "size_bytes"    : size_bytes,
        "item_count"    : item_count,
        "created_at"    : datetime.fromtimestamp(stat.st_ctime).isoformat() + "Z",
        "modified_at"   : datetime.fromtimestamp(stat.st_mtime).isoformat() + "Z",
        "mime_type"     : mime,
        "thumbnail_url" : f"/storage/thorix-api/files/{item_id}/thumbnail" if mime and mime.startswith("image/") else None,
    }

async def lists(virtual_path: str, root: bool = False) -> Dict[str, Any]:
    # 1. Cari path riil di disk
    target_dir = virtual_to_real(virtual_path, root)

    if not target_dir.exists() or not target_dir.is_dir():
        raise HTTPException(status_code=404, detail="Folder tidak ditemukan")

    file_list: List[Any] = []
    
    for path_object in sorted(target_dir.iterdir(), key=lambda e: (e.is_file(), e.name.lower())):
        # FIX: Jangan lstrip("/") — pertahankan slash di depan agar path konsisten
        child_virtual_path = virtual_path.rstrip("/") + "/" + path_object.name
        item_data = file_to_item(path_object, child_virtual_path)
        file_list.append(item_data)
                
    # FIX: total_size_bytes dari disk usage, bukan dari items list
    disk = shutil.disk_usage(directory())
    return {
        "current_path"      : virtual_path,
        "total_size_bytes"  : disk.total,
        "used_size_bytes"   : disk.used,
        "items"             : file_list
    }

async def upload(file: UploadFile, path: str, root: bool = False) -> Dict[str, Any]: 
    # Mengambil lokasi path tujuan
    dest_dir = virtual_to_real(path, root)

    if not dest_dir.exists() or not dest_dir.is_dir(): 
        raise HTTPException(status_code=404, detail="Folder tujuan tidak ditemukan")

    file_path = virtual_to_real(f"{path}/{file.filename}", root)

    if os.path.exists(file_path): 
        raise HTTPException(status_code=409, detail=f"File '{file.filename}' sudah ada")

    # Menyimpan file ke dalam direktori
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    virtual = path.rstrip("/") + "/" + cast(str, file.filename)

    return file_to_item( file_path, virtual)
    
async def delete(id: str, root: bool = False) -> None:
    path = id_to_path(id)
    file_path = virtual_to_real(path, root)

    # Cek apakah file ada
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    
    # Hapus file atau folder (jika folder, hapus beserta isinya)
    if os.path.isdir(file_path):
        shutil.rmtree(file_path)
    else:
        os.remove(file_path)

async def download(id: str, preview: bool = False, root: bool = False) -> FileResponse:
# 1. Dekode ID menjadi virtual path (misal: "Foto/pantai.jpg")
    try:
        virtual_path = id_to_path(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Format ID tidak valid")
        
    # 2. Translasikan menjadi path fisik di server (misal: "/var/storage/Foto/pantai.jpg")
    real_path = virtual_to_real(virtual_path, root)
    
    # KUNCI KEAMANAN: Pastikan file benar-benar ada dan tidak terkena Path Traversal
    if not real_path.exists() or not real_path.is_file():
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    
    # 3. Ambil nama asli file untuk nama unduhan nanti
    filename = real_path.name
    
    # 4. Deteksi Media Type (MIME) secara otomatis (misal: image/jpeg, application/pdf)
    mime_type, _ = mimetypes.guess_type(real_path)
    if not mime_type:
        mime_type = "application/octet-stream" # Default jika jenis file tidak diketahui
        
    # 5. Kembalikan menggunakan FileResponse
    if preview:
        # Menampilkan kode langsung di browser (seperti pada gambar Anda)
        return FileResponse(real_path, media_type=mime_type)
    else:
        # KUNCI 1: Lakukan URL Encode pada nama file agar karakter spesial aman
        safe_filename = urllib.parse.quote(filename)

        # KUNCI 2: Gabungkan standar lama dan standar modern (RFC 5987) untuk Firefox
        headers = {
                "Content-Disposition": f'attachment; filename="{filename}"; filename*=UTF-8\'\'{safe_filename}',
                "X-Content-Type-Options": "nosniff"  # <-- Mematikan sifat keras kepala Firefox!
            }
        return FileResponse(
                path=real_path,
                media_type=mime_type,  # <-- Mengganti octet-stream menjadi force-download
                # media_type="application/force-download",  # <-- Mengganti octet-stream menjadi force-download
                headers=headers
            )

async def thumbnail(id: str, root: bool = False) -> StreamingResponse:
    file_path = virtual_to_real(id_to_path(id), root=root)

    # Cek apakah file ada
    if not os.path.exists(file_path): 
        raise HTTPException(status_code=404, detail="File tidak ditemukan")

    # FIX: sebelumnya media_type di-hardcode "image/jpeg" untuk SEMUA file,
    # padahal thumbnail bisa berupa .png/.webp/.gif/dll. Sebagian browser/
    # ekstensi jadi menolak menampilkannya karena Content-Type-nya salah.
    # Sekarang dideteksi dari file aslinya, dengan fallback aman kalau tidak dikenali.
    mime, _ = mimetypes.guess_type(str(file_path))
    if not mime or not mime.startswith("image/"):
        mime = "application/octet-stream"
        
    return StreamingResponse(open(file_path, "rb"), media_type=mime)

async def update(filename: str, file: UploadFile, root: bool = False) -> Dict[str, Any]:
    file_path = virtual_to_real(filename, root)
    
    # Validasi apakah file yang ingin diedit memang ada
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File yang ingin diedit tidak ditemukan")
    
    # Timpa file lama dengan file baru yang diunggah
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"filename": filename, "status": "File berhasil diperbarui"}

async def rename(id: str, new_filename: str, root: bool = False) -> Dict[str, Any]:
    file_path = virtual_to_real(id_to_path(id), root)

    # Validasi apakah file yang ingin diedit memang ada
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File yang ingin diedit tidak ditemukan")
    
    # Cek apakah new_filename memiliki ekstensi
    if not os.path.splitext(new_filename)[1]:  # Jika tidak ada ekstensi
        # Ambil ekstensi dari file lama
        old_extension = os.path.splitext(file_path.name)[1]
        new_filename += old_extension  # Tambahkan ekstensi lama ke nama baru
        new_file_path = file_path.parent / new_filename
    else:
        new_file_path = file_path.parent / new_filename
    
    # Ganti nama file
    os.rename(file_path, new_file_path)

    return {"filename": new_filename, "status": "File berhasil diubah namanya"}