from pydantic import BaseModel, EmailStr, AfterValidator
from typing import Optional, Annotated

# from ..core.security import get_current_user
# from ..models.user import Auth

import re
import uuid

def validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password minimal harus 8 karakter.")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password harus mengandung setidaknya satu huruf besar.")
    if not re.search(r"[a-z]", v):
        raise ValueError("Password harus mengandung setidaknya satu huruf kecil.")
    if not re.search(r"\d", v):
        raise ValueError("Password harus mengandung setidaknya satu angka.")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
        raise ValueError("Password harus mengandung setidaknya satu simbol khusus.")
    return v

class SignUpAuth(BaseModel):
    """
    nama: str  
    email: EmailStr  
    password: str  
    """
    nama: str
    email: EmailStr
    password: Annotated[
        str, 
        AfterValidator(validate_password_strength)
    ]

class SignInAuth(BaseModel):
    """  
    email: EmailStr  
    password: str  
    """
    email: EmailStr
    # Catatan: sengaja TIDAK memakai validate_password_strength di sini.
    # Validasi kekuatan password hanya relevan saat SignUp (membuat password baru).
    # Saat login, kita hanya perlu tahu "kosong atau tidak" — pengecekan benar/salah
    # dilakukan lewat verifikasi hash di service/auth.py, bukan lewat aturan format.
    password: str
    remember: bool = False
    
class ShowMe(BaseModel):
    id: uuid.UUID
    nama: str
    email: str

class EditAuth(BaseModel):
    nama: Optional[str]
    email: Optional[EmailStr]
    password: Annotated[
        str, 
        AfterValidator(validate_password_strength)
    ]