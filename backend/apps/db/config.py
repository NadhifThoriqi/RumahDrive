"""
Module: 
    db_config.py
Deskripsi: 
    Utilitas database untuk penanganan tipe data GUID/UUID, 
    operasi CRUD dasar (save/show), dan logika paginasi.
Author:
    Nadhif Thoriqi
"""

import uuid
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql.expression import SelectOfScalar
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from typing import Any, List
from sqlalchemy.engine import Dialect

class GUID(TypeDecorator[uuid.UUID]):
    """
    Tipe data GUID lintas platform.
    
    Menggunakan tipe UUID asli jika pada PostgreSQL,
    dan fallback ke CHAR(36) untuk database lain (seperti SQLite).
    Otomatis mengonversi objek UUID Python menjadi string saat penyimpanan.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> Any:
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(PG_UUID())
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value: Any, dialect: Dialect):
        if value is None:
            return value
        else:
            return str(value) # Memastikan objek UUID jadi String saat simpan

    def process_result_value(self, value: Any, dialect: Dialect):
        if value is None:
            return value
        
        # Jika nilainya sudah berupa objek UUID asli bawaan Python, langsung kembalikan
        if isinstance(value, uuid.UUID):
            return value
            
        # Jika bentuknya objek lain (seperti dari asyncpg), konversi ke string dulu agar aman
        return uuid.UUID(str(value))


# 1. Buat class yang mewarisi BaseSettings
class Settings(BaseSettings):
    # Tulis variabel yang ingin Anda ambil dari .env beserta tipe datanya
    database_url: str = ""
    secret_key: str = ""
    dir: str = "./storage"
    port: int = 8000
    debug: bool = False # Beri nilai default False jika di .env tidak ditulis

    # --- Auth / JWT ---
    access_token_expire_minutes: int = 60 * 24   # 1 hari
    remember_token_expire_days: int = 30         # 30 hari jika "remember me"
    cookie_secure: bool = False                  # set True di .env kalau server sudah pakai HTTPS
    
    # --- Bootstrap akun keluarga pertama (opsional) ---
    # Jika diisi di .env, akun ini otomatis dibuat saat aplikasi pertama kali start
    # dan tabel auth masih kosong. Boleh dikosongkan lalu daftar manual lewat /auth/register.
    admin_nama: str = "Keluarga"
    admin_email: str = ""
    admin_password: str = ""

    # 2. Beritahu Pydantic untuk membaca dari file bernama ".env"
    model_config = SettingsConfigDict(extra="allow", env_file=".env")

# 3. Jalankan / panggil class-nya dan simpan di variabel "settings"

def offsets(input_user: int = 0) -> int:
    """
    Menghitung nilai offset untuk paginasi.
    Rumus: $(input_user // 10) * 10$
    """
    return (input_user // 10) * 10

async def show_db(session: AsyncSession, statement: SelectOfScalar[Any], _limit: int = 10, _offset: int = 0) -> List[Any]: 
    """
    Mengambil data dari database dengan fitur paginasi otomatis.
    """
    statement = statement.offset(offsets(_offset)).limit(_limit)
    result = await session.exec(statement)
    return list(result.all())

async def save_db(session: AsyncSession, model_object: Any) -> None:
    """
    Menyimpan atau memperbarui objek ke database.
    
    Fungsi ini melakukan:
    1. session.add()
    2. session.commit()
    3. session.refresh()
    """
    session.add(model_object)
    await session.commit()
    await session.refresh(model_object)
    return

settings = Settings()