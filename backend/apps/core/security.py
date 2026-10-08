"""
Module:
    security.py
Deskripsi:
    Utilitas keamanan untuk sistem login RumahDrive:
    - Hashing & verifikasi kata sandi (bcrypt)
    - Pembuatan & pembacaan JSON Web Token (JWT)
    - Penyimpanan sesi via cookie HttpOnly (di-set & dibaca backend,
      TIDAK bisa diakses/disentuh JavaScript di sisi frontend)
    - Dependency FastAPI untuk mengambil user yang sedang login
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import uuid

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from ..db.config import settings
from ..db.session import get_session
from ..models.auth_model import Auth, BlacklistToken

ALGORITHM = "HS256"

# Nama cookie tempat token JWT disimpan (HttpOnly -> tidak bisa dibaca document.cookie di JS).
COOKIE_NAME = "rumahdrive_token"

# auto_error=False: token via header "Authorization: Bearer <token>" bersifat OPSIONAL.
# Sumber utama sesi login adalah cookie HttpOnly di bawah; header Bearer cuma fallback
# supaya endpoint tetap bisa dites manual lewat /docs atau curl tanpa cookie.
bearer_scheme = HTTPBearer(auto_error=False)


def _get_secret_key() -> str:
    if not settings.secret_key:
        raise RuntimeError("Environment variable 'SECRET_KEY' belum diset di .env")
    return settings.secret_key


# ============================================================
#  HASHING KATA SANDI
# ============================================================
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ============================================================
#  JWT ACCESS TOKEN
# ============================================================
def create_access_token(subject: str, expires_delta: timedelta) -> tuple[bytes, datetime]:
    now = datetime.now(timezone.utc)
    expire = now + expires_delta
    payload: dict[str, Any] = {"sub": subject, "iat": now, "exp": expire}
    token = jwt.encode(payload, _get_secret_key(), algorithm=ALGORITHM)
    return token, expire


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, _get_secret_key(), algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesi sudah kedaluwarsa, silakan login ulang.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak valid.",
        )


# ============================================================
#  COOKIE SESI (di-set & dihapus dari sisi backend)
# ============================================================
def set_auth_cookie(response: Response, token: str, expires_at: datetime) -> None:
    max_age = max(int((expires_at - datetime.now(timezone.utc)).total_seconds()), 0)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age,
        path="/",
        httponly=True,               # tidak bisa dibaca JavaScript -> aman dari XSS
        secure=settings.cookie_secure,  # set True di .env kalau server sudah pakai HTTPS
        samesite="lax",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


def _extract_token(request: Request, credentials: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    if credentials is not None:
        return credentials.credentials
    return request.cookies.get(COOKIE_NAME)


# ============================================================
#  DEPENDENCY: AMBIL USER YANG SEDANG LOGIN
# ============================================================
async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> Auth:
    token = _extract_token(request, credentials)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Silakan login terlebih dahulu.",
        )

    payload = decode_access_token(token)

    # Token yang sudah logout tidak boleh dipakai lagi
    blacklisted = await session.get(BlacklistToken, token)
    if blacklisted is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesi sudah berakhir, silakan login ulang.",
        )

    raw_id = payload.get("sub")
    try:
        user_id = uuid.UUID(str(raw_id))
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak valid.")

    user = await session.get(Auth, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Akun tidak ditemukan.")

    return user


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> Optional[Auth]:
    """Sama seperti get_current_user, tapi mengembalikan None alih-alih error 401
    jika belum login. Dipakai untuk endpoint /auth/register (mode bootstrap)."""
    try:
        return await get_current_user(request, credentials, session)
    except HTTPException:
        return None


async def has_any_user(session: AsyncSession) -> bool:
    result = await session.exec(select(Auth).limit(1))
    return result.first() is not None
