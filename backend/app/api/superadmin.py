from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db import models
from app.api.auth import get_current_superadmin
from app.core import security
from pydantic import BaseModel, Field

router = APIRouter(dependencies=[Depends(get_current_superadmin)])

# Pydantic schemas
class CompanyCreate(BaseModel):
    name: str
    license_user_limit: int = 5
    subscription_tier: str = "standard"
    custom_api_key: str | None = None

class CompanyEdit(BaseModel):
    license_user_limit: int
    subscription_tier: str
    custom_api_key: str | None = None

class UserCreateUnderCompany(BaseModel):
    email: str
    password: str
    role: str = "recruiter" # company_admin / recruiter

class ApiKeyCreate(BaseModel):
    api_key: str
    label: str | None = None  # optional human-friendly name, e.g. "prod-key-2"

# 1. Manage Companies
@router.post("/companies")
def create_company(payload: CompanyCreate, db: Session = Depends(get_db)):
    # Check if exists
    existing = db.query(models.Company).filter(models.Company.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Company name already exists")
        
    company = models.Company(
        name=payload.name,
        license_user_limit=payload.license_user_limit,
        subscription_tier=payload.subscription_tier,
        custom_api_key=payload.custom_api_key
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company

@router.get("/companies")
def list_companies(db: Session = Depends(get_db)):
    companies = db.query(models.Company).all()
    results = []
    for c in companies:
        user_count = db.query(models.User).filter(models.User.company_id == c.id).count()
        session_count = db.query(models.InterviewSession).filter(models.InterviewSession.company_id == c.id).count()
        results.append({
            "id": c.id,
            "name": c.name,
            "license_user_limit": c.license_user_limit,
            "subscription_tier": c.subscription_tier,
            "custom_api_key": "***" if c.custom_api_key else None,
            "created_at": c.created_at.isoformat(),
            "user_count": user_count,
            "session_count": session_count
        })
    return results

@router.put("/companies/{id}")
def edit_company(id: int, payload: CompanyEdit, db: Session = Depends(get_db)):
    company = db.query(models.Company).filter(models.Company.id == id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    company.license_user_limit = payload.license_user_limit
    company.subscription_tier = payload.subscription_tier
    if payload.custom_api_key is not None:
        company.custom_api_key = payload.custom_api_key if payload.custom_api_key != "" else None
        
    db.commit()
    db.refresh(company)
    return company

@router.post("/companies/{id}/users")
def add_user_to_company(id: int, payload: UserCreateUnderCompany, db: Session = Depends(get_db)):
    company = db.query(models.Company).filter(models.Company.id == id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    # Check seat limit
    active_users = db.query(models.User).filter(
        models.User.company_id == id,
        models.User.is_active == True
    ).count()
    if active_users >= company.license_user_limit:
        raise HTTPException(
            status_code=400,
            detail=f"Registration failed. Company seat limit of {company.license_user_limit} has been reached."
        )
        
    # Check if user email exists
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email is already registered")
        
    user = models.User(
        company_id=id,
        email=payload.email,
        hashed_password=security.get_password_hash(payload.password),
        role=payload.role
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "company_id": user.company_id
    }

@router.get("/companies/{id}/users")
def get_company_users(id: int, db: Session = Depends(get_db)):
    company = db.query(models.Company).filter(models.Company.id == id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    users = db.query(models.User).filter(models.User.company_id == id).all()
    return [{
        "id": u.id,
        "email": u.email,
        "role": u.role,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None
    } for u in users]

@router.post("/users/{user_id}/assume")
def assume_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "superadmin":
        raise HTTPException(status_code=400, detail="Cannot assume another superadmin user")
        
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

# 2. Manage Platform Keys
@router.post("/api-keys")
def add_platform_key(payload: ApiKeyCreate, db: Session = Depends(get_db)):
    key = models.PlatformApiKey(api_key=payload.api_key, label=getattr(payload, "label", None))
    db.add(key)
    db.commit()
    db.refresh(key)
    return {"id": key.id, "api_key": "***", "is_active": key.is_active}

@router.get("/api-keys")
def list_platform_keys(db: Session = Depends(get_db)):
    """Pool status. Keys rotate least-recently-used; a key that returns 429 is put on a
    cooldown and skipped until it expires, and one rejected for auth is deactivated."""
    import datetime as _dt
    now = _dt.datetime.utcnow()
    keys = db.query(models.PlatformApiKey).order_by(models.PlatformApiKey.id).all()
    result = []
    for k in keys:
        cooling = bool(k.cooldown_until and k.cooldown_until > now)
        result.append({
            "id": k.id,
            "label": k.label,
            "api_key": k.api_key[:6] + "..." + k.api_key[-4:],
            "is_active": k.is_active,
            "status": "disabled" if not k.is_active else ("cooling_down" if cooling else "available"),
            "cooldown_until": k.cooldown_until.isoformat() if k.cooldown_until else None,
            "cooldown_seconds_remaining": int((k.cooldown_until - now).total_seconds()) if cooling else 0,
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
            "failure_count": k.failure_count or 0,
            "total_calls": k.total_calls or 0,
            "last_error": k.last_error,
        })
    return result

@router.delete("/api-keys/{id}")
def delete_platform_key(id: int, db: Session = Depends(get_db)):
    key = db.query(models.PlatformApiKey).filter(models.PlatformApiKey.id == id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    db.delete(key)
    db.commit()
    return {"status": "success"}

# 3. Global Stats
@router.get("/stats")
def get_global_stats(db: Session = Depends(get_db)):
    companies_count = db.query(models.Company).count()
    users_count = db.query(models.User).count()
    sessions_count = db.query(models.InterviewSession).count()
    active_sessions = db.query(models.InterviewSession).filter(models.InterviewSession.status == "active").count()
    return {
        "companies_count": companies_count,
        "users_count": users_count,
        "sessions_count": sessions_count,
        "active_sessions": active_sessions,
        "total_companies": companies_count,
        "total_users": users_count,
        "total_sessions": sessions_count
    }

# 4. Manage System Logs
@router.get("/logs")
def list_system_logs(db: Session = Depends(get_db)):
    logs = db.query(models.SystemLog).order_by(models.SystemLog.created_at.desc()).limit(100).all()
    return [{
        "id": l.id,
        "level": l.level,
        "message": l.message,
        "detail": l.detail,
        "created_at": l.created_at.isoformat()
    } for l in logs]

@router.delete("/logs")
def clear_system_logs(db: Session = Depends(get_db)):
    db.query(models.SystemLog).delete()
    db.commit()
    return {"status": "success"}
