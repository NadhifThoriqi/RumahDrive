"""
Module: 
    database.py
Deskripsi: 
    Mengelola koneksi SQLAlchemy engine, pembuatan skema tabel otomatis, 
    dan generator session untuk Dependency Injection.
Author: 
    Nadhif Thoriqi
"""
from typing import AsyncGenerator

from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine

from .config import settings

MYDB = settings.database_url

# Inisialisasi engine database
engine = create_async_engine(
    MYDB, 
    echo=True,
)

async def create_db_and_tables():
    """
    Membuat semua tabel yang didefinisikan dalam model SQLModel.
    
    Fungsi ini biasanya dipanggil sekali saat aplikasi startup untuk 
    memastikan skema database sudah sesuai dengan kode.
    """
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Generator untuk menyediakan session database yang thread-safe.
    
    Menggunakan context manager 'with' untuk memastikan session 
    otomatis ditutup setelah digunakan, mencegah kebocoran koneksi.
    
    Yields:
        Session: 
            Object session SQLModel untuk operasi database.
    """
    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session