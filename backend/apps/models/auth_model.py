from sqlmodel import Column, Field, SQLModel
from sqlalchemy import String
from pydantic import EmailStr
from datetime import datetime, timezone
from typing import Any
import uuid

# Pastikan GUID ini me-return CHAR(32) atau BINARY(16) 
# karena MariaDB/MySQL tidak punya native UUID seperti PostgreSQL
from ..db.config import GUID

class Auth(SQLModel, table=True):
    __tablename__: Any = "auth" # Tidak wajib pakai : Any, ini sudah cukup
    
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(GUID(), primary_key=True, index=True, unique=True)
    )
    nama: str
    email: EmailStr = Field(
        sa_column=Column(String(255), index=True, unique=True, nullable=False)
    )
    hashed_password: str = Field(
        nullable=False
    )

class BlacklistToken(SQLModel, table=True):
    __tablename__: Any = "blacklist_token" 
    
    token: str = Field(
        sa_column=Column(String(500), primary_key=True, index=True, unique=True, nullable=False)
    )
    
    # [REVISI UNTUK MARIADB]
    # Ambil waktu UTC, lalu hapus info timezone-nya (replace tzinfo=None).
    # Ini memastikan driver MySQL menerima objek "naive datetime" murni 
    # namun nilainya tetap standar internasional (UTC).
    blacklisted_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )