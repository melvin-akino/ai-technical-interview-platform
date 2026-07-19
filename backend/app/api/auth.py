from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db import models
from app.core import security
from pydantic import BaseModel, EmailStr

router = APIRouter()
security_scheme = HTTPBearer()

class LoginPayload(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    company_id: int | None
    company_name: str | None

    class Config:
        from_attributes = True

# Dependency to fetch authenticated user
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> models.User:
    token = credentials.credentials
    payload = security.verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claims",
        )
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is suspended",
        )
    return user

# Helper to verify superadmin privilege
def get_current_superadmin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin privileges required",
        )
    return current_user

@router.post("/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not security.verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
    
    # Generate token
    token = security.create_access_token(data={"sub": str(user.id)})
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "company_id": user.company_id,
            "company_name": user.company.name if user.company else None
        }
    }

@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "company_id": current_user.company_id,
        "company_name": current_user.company.name if current_user.company else None
    }
