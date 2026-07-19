from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.session import engine, SessionLocal
from app.db.models import Base
from app.api import resumes, interviews, feedback, admin, auth, superadmin
from app.core.security import get_password_hash

# Create all database tables on start
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS configuration
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "*"  # Allow all during prototyping
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers — public (no auth)
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Auth"])
app.include_router(interviews.router, prefix=f"{settings.API_V1_STR}/interviews", tags=["Interviews"])
app.include_router(feedback.router, prefix=f"{settings.API_V1_STR}/feedback", tags=["Feedback"])

# Register routers — authenticated
app.include_router(resumes.router, prefix=f"{settings.API_V1_STR}/resumes", tags=["Resumes"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin"])
app.include_router(superadmin.router, prefix=f"{settings.API_V1_STR}/superadmin", tags=["Superadmin"])

@app.on_event("startup")
def seed_superadmin():
    """Ensure a default superadmin account and company exist on first boot."""
    from app.db import models
    db = SessionLocal()
    try:
        existing = db.query(models.User).filter(models.User.role == "superadmin").first()
        if not existing:
            # Ensure the platform company exists
            company = db.query(models.Company).filter(models.Company.name == "AuraInterview Corp").first()
            if not company:
                company = models.Company(name="AuraInterview Corp", license_user_limit=999, subscription_tier="enterprise")
                db.add(company)
                db.commit()
                db.refresh(company)
            
            superadmin_user = models.User(
                email="admin@aurainterview.com",
                hashed_password=get_password_hash("admin123"),
                role="superadmin",
                company_id=company.id
            )
            db.add(superadmin_user)
            db.commit()
            print("✅ Default superadmin seeded: admin@aurainterview.com / admin123")
    except Exception as e:
        db.rollback()
        print(f"⚠️ Superadmin seed skipped: {e}")
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"message": "AI Technical Interview Platform API is running successfully."}

