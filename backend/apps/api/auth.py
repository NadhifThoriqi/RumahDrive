from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlmodel.ext.asyncio.session import AsyncSession

from ..core.security import (
    COOKIE_NAME,
    bearer_scheme,
    clear_auth_cookie,
    get_current_user,
    get_optional_user,
    set_auth_cookie,
)
from ..db.session import get_session
from ..models.auth_model import Auth
from ..schemas.auth import ShowMe, SignInAuth, SignUpAuth
from ..service import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=ShowMe, status_code=status.HTTP_201_CREATED)
async def register(
    data: SignUpAuth,
    session: AsyncSession = Depends(get_session),
    current_user: Optional[Auth] = Depends(get_optional_user),
):
    user = await auth_service.register(session, data, current_user)
    return ShowMe(id=user.id, nama=user.nama, email=user.email)


@router.post("/login")
async def login(
    data: SignInAuth,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    """
    Verifikasi email + password, lalu simpan sesi login lewat cookie HttpOnly
    (jadi frontend TIDAK perlu simpan token apapun sendiri — browser yang
    otomatis kirim cookie ini di setiap request berikutnya).

    "access_token" tetap disertakan di body respons ini untuk kebutuhan
    testing manual lewat /docs atau curl (dipakai sebagai header
    "Authorization: Bearer <token>"), tapi frontend RumahDrive sendiri
    tidak memakainya sama sekali.
    """
    result = await auth_service.login(session, data)
    set_auth_cookie(response, result["access_token"], result["expires_at_dt"])
    return {
        "access_token": result["access_token"],
        "token_type": result["token_type"],
        "expires_at": result["expires_at"],
        "user": result["user"],
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    token = credentials.credentials if credentials is not None else request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token tidak ditemukan.")
    await auth_service.logout(session, token)
    clear_auth_cookie(response)


@router.get("/me", response_model=ShowMe)
async def me(current_user: Auth = Depends(get_current_user)):
    return ShowMe(id=current_user.id, nama=current_user.nama, email=current_user.email)
