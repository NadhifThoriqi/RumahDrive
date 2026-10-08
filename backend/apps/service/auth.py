"""
Module:
    service/auth.py
Deskripsi:
    Logika bisnis untuk sistem login keluarga RumahDrive.
    - register : membuat akun anggota keluarga baru
    - login    : verifikasi email + password, menerbitkan JWT
    - logout   : mem-blacklist token agar tidak bisa dipakai lagi
    - me       : profil singkat user yang sedang login
"""

from datetime import timedelta
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.security import (
    create_access_token,
    hash_password,
    has_any_user,
    verify_password,
)
from ..db.config import save_db, settings
from ..models.auth_model import Auth, BlacklistToken
from ..schemas.auth import SignInAuth, SignUpAuth


async def find_by_email(session: AsyncSession, email: str) -> Optional[Auth]:
    result = await session.exec(select(Auth).where(Auth.email == email))
    return result.first()


async def register(session: AsyncSession, data: SignUpAuth, current_user: Optional[Auth]) -> Auth:
    """
    Mode bootstrap: selama belum ada satupun akun di database, siapa saja boleh
    mendaftar tanpa login (dipakai untuk membuat akun keluarga pertama kali).
    Setelah akun pertama ada, pendaftaran akun baru wajib dilakukan oleh
    anggota keluarga yang sudah login (mencegah orang asing daftar sendiri
    di server rumah yang terbuka di jaringan).
    """
    bootstrap_mode = not await has_any_user(session)
    if not bootstrap_mode and current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Silakan login terlebih dahulu untuk menambahkan akun keluarga baru.",
        )

    existing = await find_by_email(session, data.email)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email sudah terdaftar.")

    user = Auth(nama=data.nama, email=data.email, hashed_password=hash_password(data.password))
    await save_db(session, user)
    return user


async def authenticate(session: AsyncSession, data: SignInAuth) -> Auth:
    user = await find_by_email(session, data.email)
    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email atau kata sandi salah.",
        )
    return user


async def login(session: AsyncSession, data: SignInAuth) -> Dict[str, Any]:
    user = await authenticate(session, data)

    expires_delta = (
        timedelta(days=settings.remember_token_expire_days)
        if data.remember
        else timedelta(minutes=settings.access_token_expire_minutes)
    )
    token, expire = create_access_token(str(user.id), expires_delta)

    return {
            "access_token": token,
            "token_type": "bearer",
            "expires_at": expire.isoformat(),
            "expires_at_dt": expire,
            "user": {
                "id": str(user.id),
                "nama": user.nama,
                "email": user.email,
            },
    }


async def logout(session: AsyncSession, token: str) -> None:
    already = await session.get(BlacklistToken, token)
    if already is not None:
        return
    await save_db(session, BlacklistToken(token=token))


async def bootstrap_from_env(session: AsyncSession) -> None:
    """Dipanggil sekali saat startup (lihat main.py). Jika belum ada akun sama
    sekali DAN kredensial admin sudah diisi di .env, buatkan akun itu otomatis
    supaya keluarga langsung bisa login tanpa harus memanggil /auth/register
    secara manual lewat /docs."""
    if await has_any_user(session):
        return
    if not settings.admin_email or not settings.admin_password:
        return

    user = Auth(
        nama=settings.admin_nama or "Keluarga",
        email=settings.admin_email,
        hashed_password=hash_password(settings.admin_password),
    )
    await save_db(session, user)
    print(f"[AUTH] Akun keluarga awal dibuat otomatis untuk: {settings.admin_email}")
