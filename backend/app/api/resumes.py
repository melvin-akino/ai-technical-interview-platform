import json
import datetime
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db import models
from app.services.resume_parser import parse_pdf_resume
from app.core.gemini import match_resume_to_job, get_gemini_client, get_system_settings, batch_parse_resumes, batch_match_resumes
from google.genai import types
from pydantic import BaseModel, Field
from app.api.auth import get_current_user
from app.core.logging_db import log_error_to_db

router = APIRouter(dependencies=[Depends(get_current_user)])

# Pydantic schemas for request/response validation
class JobPostingCreate(BaseModel):
    title: str
    description: str
    required_skills: str
    interviewer_persona: str = "standard"

class JobPostingResponse(BaseModel):
    id: int
    company_id: int
    title: str
    description: str
    required_skills: str
    interviewer_persona: str

    class Config:
        from_attributes = True

@router.get("/jobs", response_model=list[JobPostingResponse])
def get_jobs(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    jobs = db.query(models.JobPosting).filter(models.JobPosting.company_id == current_user.company_id).all()
    # Seed default jobs if company has no jobs
    if not jobs:
        default_jobs = [
            models.JobPosting(
                company_id=current_user.company_id,
                title="Senior Python Backend Engineer",
                description="We are seeking a senior backend engineer proficient in Python, FastAPI, and PostgreSQL. Experience with Docker, SQL optimization, and designing scalable WebSockets architectures is highly valued.",
                required_skills="Python, FastAPI, PostgreSQL, SQL, Docker, WebSockets, System Design"
            ),
            models.JobPosting(
                company_id=current_user.company_id,
                title="Full Stack Engineer (React & TypeScript)",
                description="Join our team to build elegant, high-performance web applications. You will work heavily with React, Vite, CSS Modules, TypeScript, and state management. Experience with real-time UI dashboards and Monaco editor integrations is a plus.",
                required_skills="React, TypeScript, JavaScript, CSS, Monaco Editor, Frontend Architecture"
            ),
            models.JobPosting(
                company_id=current_user.company_id,
                title="Data & AI Engineer",
                description="Looking for an engineer experienced in building data processing pipelines and LLM integrations. Proficient in Python, SQL, BigQuery/PostgreSQL, and utilizing API models like Gemini or OpenAI. Experience with vector search is a plus.",
                required_skills="Python, SQL, Gemini API, PySpark, BigQuery, Machine Learning, Data Pipelines"
            )
        ]
        for job in default_jobs:
            db.add(job)
        db.commit()
        jobs = db.query(models.JobPosting).filter(models.JobPosting.company_id == current_user.company_id).all()
    return jobs

@router.post("/jobs", response_model=JobPostingResponse)
def create_job(
    job: JobPostingCreate, 
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    db_job = models.JobPosting(
        company_id=current_user.company_id,
        title=job.title,
        description=job.description,
        required_skills=job.required_skills,
        interviewer_persona=job.interviewer_persona
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job

@router.put("/jobs/{job_id}", response_model=JobPostingResponse)
def update_job(
    job_id: int, 
    job: JobPostingCreate, 
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    db_job = db.query(models.JobPosting).filter(
        models.JobPosting.id == job_id,
        models.JobPosting.company_id == current_user.company_id
    ).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job posting not found")
    db_job.title = job.title
    db_job.description = job.description
    db_job.required_skills = job.required_skills
    db_job.interviewer_persona = job.interviewer_persona
    db.commit()
    db.refresh(db_job)
    return db_job

@router.delete("/jobs/{job_id}")
def delete_job(
    job_id: int, 
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    db_job = db.query(models.JobPosting).filter(
        models.JobPosting.id == job_id,
        models.JobPosting.company_id == current_user.company_id
    ).first()
    if not db_job:
        raise HTTPException(status_code=404, detail="Job posting not found")
    
    # Check if there are associated sessions
    sessions_count = db.query(models.InterviewSession).filter(models.InterviewSession.job_id == job_id).count()
    if sessions_count > 0:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete job posting because there are active or completed interview sessions associated with it."
        )
        
    db.delete(db_job)
    db.commit()
    return {"message": "Job posting deleted successfully"}

@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    job_id: int = Form(...),
    selected_language: str = Form("python"),
    expires_at: str = Form(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify job exists and belongs to company
    job = db.query(models.JobPosting).filter(
        models.JobPosting.id == job_id,
        models.JobPosting.company_id == current_user.company_id
    ).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Job posting with ID {job_id} not found"
        )
        
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF resume files are supported at this time."
        )
        
    try:
        file_bytes = await file.read()
        extracted_info = parse_pdf_resume(file_bytes)
        
        # Store Candidate scoped by company
        candidate = db.query(models.Candidate).filter(
            models.Candidate.email == extracted_info.email,
            models.Candidate.company_id == current_user.company_id
        ).first()
        if not candidate:
            candidate = models.Candidate(
                company_id=current_user.company_id,
                name=extracted_info.name,
                email=extracted_info.email,
                extracted_skills=", ".join(extracted_info.skills),
                experience_summary=extracted_info.experience_summary,
                resume_path=file.filename
            )
            db.add(candidate)
        else:
            candidate.name = extracted_info.name
            candidate.extracted_skills = ", ".join(extracted_info.skills)
            candidate.experience_summary = extracted_info.experience_summary
            candidate.resume_path = file.filename
        
        db.commit()
        db.refresh(candidate)
        
        # Perform matching
        match_result = match_resume_to_job(
            resume_skills=candidate.extracted_skills,
            resume_summary=extracted_info.experience_summary,
            job_title=job.title,
            job_description=job.description
        )
        
        # Resolve expiration
        db_expires_at = None
        if expires_at:
            try:
                db_expires_at = datetime.datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            except Exception:
                pass
        if not db_expires_at:
            db_expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=7)

        # Create a new active interview session scoped by company
        session = models.InterviewSession(
            company_id=current_user.company_id,
            candidate_id=candidate.id,
            job_id=job.id,
            selected_language=selected_language,
            status="active",
            expires_at=db_expires_at
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        
        return {
            "session_id": session.id,
            "session_token": session.session_token,
            "expires_at": session.expires_at.isoformat() if session.expires_at else None,
            "candidate": {
                "id": candidate.id,
                "name": candidate.name,
                "email": candidate.email,
                "skills": extracted_info.skills
            },
            "job": {
                "id": job.id,
                "title": job.title
            },
            "match": {
                "score": match_result.match_score,
                "matching_skills": match_result.matching_skills,
                "missing_skills": match_result.missing_skills,
                "analysis": match_result.analysis
            }
        }
        
    except Exception as e:
        db.rollback()
        log_error_to_db(
            db=db,
            message=f"Resume upload & match failed for job_id={job_id} using language={selected_language}",
            exception=e
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The AI matching engine encountered an unexpected error while analyzing the candidate resume. The platform administrator has been notified. Please try again or verify the PDF formatting."
        )

# Pydantic schemas for Exams
class ExamTemplateCreate(BaseModel):
    title: str
    problem_statement: str
    starter_code: str
    difficulty: str = "medium"
    questions_json: str | None = None
    test_cases_code: str | None = None

class ExamTemplateResponse(BaseModel):
    id: int
    job_id: int
    title: str
    problem_statement: str
    starter_code: str
    difficulty: str
    is_active: bool
    questions_json: str | None
    test_cases_code: str | None

    class Config:
        from_attributes = True

class ExamSuggestion(BaseModel):
    challenge_title: str = Field(description="A short, clear title for the challenge")
    problem_statement: str = Field(description="Markdown description of the problem, with input/output examples and constraints")
    starter_code: str = Field(description="Boilerplate starter template in Python or generic format")
    difficulty: str = Field(description="Must be 'easy', 'medium', or 'hard'")

@router.get("/jobs/{job_id}/exams", response_model=list[ExamTemplateResponse])
def get_job_exams(
    job_id: int, 
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    job = db.query(models.JobPosting).filter(
        models.JobPosting.id == job_id,
        models.JobPosting.company_id == current_user.company_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found")
    return db.query(models.ExamTemplate).filter(models.ExamTemplate.job_id == job_id).all()

@router.post("/jobs/{job_id}/exams", response_model=ExamTemplateResponse)
def create_exam_template(
    job_id: int, 
    data: ExamTemplateCreate, 
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    job = db.query(models.JobPosting).filter(
        models.JobPosting.id == job_id,
        models.JobPosting.company_id == current_user.company_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found")
        
    exams_count = db.query(models.ExamTemplate).filter(models.ExamTemplate.job_id == job_id).count()
    is_active = (exams_count == 0)

    db_exam = models.ExamTemplate(
        job_id=job_id,
        title=data.title,
        problem_statement=data.problem_statement,
        starter_code=data.starter_code,
        difficulty=data.difficulty,
        is_active=is_active,
        questions_json=data.questions_json,
        test_cases_code=data.test_cases_code
    )
    db.add(db_exam)
    db.commit()
    db.refresh(db_exam)
    return db_exam

@router.put("/jobs/{job_id}/exams/{exam_id}", response_model=ExamTemplateResponse)
def update_exam_template(
    job_id: int,
    exam_id: int,
    data: ExamTemplateCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    job = db.query(models.JobPosting).filter(
        models.JobPosting.id == job_id,
        models.JobPosting.company_id == current_user.company_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found")
        
    exam = db.query(models.ExamTemplate).filter(
        models.ExamTemplate.id == exam_id,
        models.ExamTemplate.job_id == job_id
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam template not found")
        
    exam.title = data.title
    exam.problem_statement = data.problem_statement
    exam.starter_code = data.starter_code
    exam.difficulty = data.difficulty
    if data.questions_json is not None:
        exam.questions_json = data.questions_json
    if data.test_cases_code is not None:
        exam.test_cases_code = data.test_cases_code
    
    db.commit()
    db.refresh(exam)
    return exam

@router.post("/jobs/{job_id}/exams/{exam_id}/activate")
def activate_exam_template(
    job_id: int,
    exam_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    job = db.query(models.JobPosting).filter(
        models.JobPosting.id == job_id,
        models.JobPosting.company_id == current_user.company_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found")
        
    # Deactivate all others for this job
    db.query(models.ExamTemplate).filter(
        models.ExamTemplate.job_id == job_id
    ).update({models.ExamTemplate.is_active: False})
    
    # Activate this one
    exam = db.query(models.ExamTemplate).filter(
        models.ExamTemplate.id == exam_id,
        models.ExamTemplate.job_id == job_id
    ).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam template not found")
        
    exam.is_active = True
    db.commit()
    return {"status": "activated", "exam_id": exam.id}

@router.post("/jobs/{job_id}/exams/ai-suggest", response_model=ExamSuggestion)
def suggest_job_exam(
    job_id: int, 
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    job = db.query(models.JobPosting).filter(
        models.JobPosting.id == job_id,
        models.JobPosting.company_id == current_user.company_id
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job posting not found")
        
    client = get_gemini_client()
    api_model, _, _ = get_system_settings()
    
    prompt = f"""
    You are an expert technical recruiter and interviewer.
    Suggest a coding challenge template suited for the following role:
    
    Job Title: {job.title}
    Job Description: {job.description}
    Required Skills: {job.required_skills}
    
    The coding challenge must:
    1. Be highly relevant to the role parameters.
    2. Have a clear, descriptive title.
    3. Include a problem statement with clear specifications, examples, and constraints.
    4. Provide simple starter code skeleton.
    5. Be categorized as 'easy', 'medium', or 'hard'.
    """
    
    try:
        response = client.models.generate_content(
            model=api_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ExamSuggestion,
                temperature=0.7
            )
        )
        return response.parsed
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate AI suggestion: {str(e)}"
        )

# Candidate Directory endpoints
class CandidateResponse(BaseModel):
    id: int
    company_id: int
    name: str
    email: str
    extracted_skills: str | None
    experience_summary: str | None
    created_at: str

    class Config:
        from_attributes = True

@router.get("/candidates")
def list_candidates(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    candidates = db.query(models.Candidate).filter(models.Candidate.company_id == current_user.company_id).all()
    return [
        {
            "id": c.id,
            "company_id": c.company_id,
            "name": c.name,
            "email": c.email,
            "extracted_skills": c.extracted_skills,
            "experience_summary": c.experience_summary,
            "created_at": c.created_at.isoformat()
        } for c in candidates
    ]

class MatchExistingPayload(BaseModel):
    candidate_id: int
    job_id: int
    selected_language: str = "python"
    expires_at: datetime.datetime | None = None

@router.post("/match-existing")
def match_existing_candidate(
    payload: MatchExistingPayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    candidate = db.query(models.Candidate).filter(
        models.Candidate.id == payload.candidate_id,
        models.Candidate.company_id == current_user.company_id
    ).first()
    job = db.query(models.JobPosting).filter(
        models.JobPosting.id == payload.job_id,
        models.JobPosting.company_id == current_user.company_id
    ).first()
    
    if not candidate or not job:
        raise HTTPException(status_code=404, detail="Candidate or Job Posting not found")
        
    try:
        # Match resume to job
        match_result = match_resume_to_job(
            resume_skills=candidate.extracted_skills or "",
            resume_summary=candidate.experience_summary or "",
            job_title=job.title,
            job_description=job.description
        )
        
        db_expires_at = payload.expires_at
        if not db_expires_at:
            db_expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=7)

        # Create active interview session
        session = models.InterviewSession(
            company_id=current_user.company_id,
            candidate_id=candidate.id,
            job_id=job.id,
            selected_language=payload.selected_language,
            status="active",
            expires_at=db_expires_at
        )
        db.add(session)
        db.commit()
        db.refresh(session)
    except Exception as e:
        db.rollback()
        log_error_to_db(
            db=db,
            message=f"Match existing candidate failed for candidate_id={payload.candidate_id} job_id={payload.job_id}",
            exception=e
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The AI matching engine encountered an unexpected error while analyzing the candidate profile. The platform administrator has been notified. Please try again later."
        )
    
    return {
        "session_id": session.id,
        "session_token": session.session_token,
        "expires_at": session.expires_at.isoformat() if session.expires_at else None,
        "candidate": {
            "id": candidate.id,
            "name": candidate.name,
            "email": candidate.email
        },
        "job": {
            "id": job.id,
            "title": job.title
        },
        "match": {
            "score": match_result.match_score,
            "matching_skills": match_result.matching_skills,
            "missing_skills": match_result.missing_skills,
            "analysis": match_result.analysis
        }
    }


from typing import List
from app.services.resume_parser import extract_text_from_pdf

@router.post("/batch-upload")
async def batch_upload_resumes(
    files: List[UploadFile] = File(...),
    job_id: int = Form(...),
    selected_language: str = Form("python"),
    expires_at: str = Form(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify job exists and belongs to company
    job = db.query(models.JobPosting).filter(
        models.JobPosting.id == job_id,
        models.JobPosting.company_id == current_user.company_id
    ).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Job posting with ID {job_id} not found"
        )

    # Restrict batch size to 5
    if len(files) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Batch upload is limited to a maximum of 5 resumes per transaction."
        )

    # Verify all files are PDFs
    for f in files:
        if not f.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file format: '{f.filename}'. Only PDF resumes are supported."
            )

    try:
        raw_texts = []
        filenames = []
        for file in files:
            file_bytes = await file.read()
            text = extract_text_from_pdf(file_bytes)
            raw_texts.append(text)
            filenames.append(file.filename)

        # 1. AI Batch Extraction (1 API call)
        extracted_batch = batch_parse_resumes(raw_texts, company_id=current_user.company_id)
        
        candidates = []
        candidates_data_for_match = []
        
        for item in extracted_batch:
            idx = item.get("index")
            if idx is None or idx >= len(filenames):
                continue
                
            email = item.get("email")
            name = item.get("name")
            skills = item.get("skills", [])
            experience_summary = item.get("experience_summary", "")

            # Store or update candidate in DB
            candidate = db.query(models.Candidate).filter(
                models.Candidate.email == email,
                models.Candidate.company_id == current_user.company_id
            ).first()
            
            skills_str = ", ".join(skills)
            
            if not candidate:
                candidate = models.Candidate(
                    company_id=current_user.company_id,
                    name=name,
                    email=email,
                    extracted_skills=skills_str,
                    experience_summary=experience_summary,
                    resume_path=filenames[idx]
                )
                db.add(candidate)
            else:
                candidate.name = name
                candidate.extracted_skills = skills_str
                candidate.experience_summary = experience_summary
                candidate.resume_path = filenames[idx]
            
            db.commit()
            db.refresh(candidate)
            candidates.append(candidate)
            
            candidates_data_for_match.append({
                "email": email,
                "skills": skills_str,
                "experience_summary": experience_summary
            })

        # 2. AI Batch Job Matching (1 API call)
        match_batch = batch_match_resumes(
            candidates_data=candidates_data_for_match,
            job_title=job.title,
            job_description=job.description,
            company_id=current_user.company_id
        )

        db_expires_at = None
        if expires_at:
            try:
                db_expires_at = datetime.datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            except Exception:
                pass
        if not db_expires_at:
            db_expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=7)

        results = []
        for match_item in match_batch:
            email = match_item.get("email")
            cand = next((c for c in candidates if c.email == email), None)
            if not cand:
                continue

            session = models.InterviewSession(
                company_id=current_user.company_id,
                candidate_id=cand.id,
                job_id=job.id,
                selected_language=selected_language,
                status="active",
                expires_at=db_expires_at
            )
            db.add(session)
            db.commit()
            db.refresh(session)

            results.append({
                "session_id": session.id,
                "session_token": session.session_token,
                "expires_at": session.expires_at.isoformat() if session.expires_at else None,
                "candidate": {
                    "id": cand.id,
                    "name": cand.name,
                    "email": cand.email
                },
                "match": {
                    "score": match_item.get("match_score", 0),
                    "matching_skills": match_item.get("matching_skills", []),
                    "missing_skills": match_item.get("missing_skills", []),
                    "analysis": match_item.get("analysis", "")
                }
            })

        return results

    except Exception as e:
        db.rollback()
        log_error_to_db(
            db=db,
            message=f"Batch resume upload failed for job_id={job_id}",
            exception=e
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The AI matching engine encountered an unexpected error during batch processing. The platform administrator has been notified. Please verify that all uploaded PDF files are formatted correctly."
        )

@router.get("/test-bank")
def get_test_bank(current_user: models.User = Depends(get_current_user)):
    challenges = [
        {
            "id": 1,
            "title": "Two Sum Sequence",
            "difficulty": "easy",
            "problem_statement": "Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.",
            "starter_code": "def two_sum(nums: list[int], target: int) -> list[int]:\n    return []",
            "test_cases_code": "assert two_sum([2, 7, 11, 15], 9) == [0, 1]\nassert two_sum([3, 2, 4], 6) == [1, 2]",
            "questions_json": json.dumps([
                {
                    "index": 0,
                    "title": "Two Sum (Warm-up)",
                    "problem_statement": "Implement two_sum to find two numbers that sum to target. Return their indices.",
                    "starter_code": "def two_sum(nums, target):\n    return []",
                    "test_cases_code": "assert two_sum([2, 7, 11, 15], 9) == [0, 1]\nassert two_sum([3, 2, 4], 6) == [1, 2]"
                },
                {
                    "index": 1,
                    "title": "Three Sum (Algorithmic)",
                    "problem_statement": "Extend the logic to three_sum to find three numbers that sum to target. Return their values as sorted lists.",
                    "starter_code": "def three_sum(nums, target):\n    return []",
                    "test_cases_code": "assert sorted([sorted(x) for x in three_sum([-1, 0, 1, 2, -1, -4], 0)]) == [[-1, -1, 2], [-1, 0, 1]]"
                },
                {
                    "index": 2,
                    "title": "Sum Refactoring (Optimization)",
                    "problem_statement": "Refactor your solution to run in optimal time complexity (O(N^2) for three_sum and O(N) for two_sum). Add comments explaining space/time complexity.",
                    "starter_code": "def optimized_three_sum(nums, target):\n    # TODO: Optimize\n    return []",
                    "test_cases_code": "assert sorted([sorted(x) for x in optimized_three_sum([-1, 0, 1, 2, -1, -4], 0)]) == [[-1, -1, 2], [-1, 0, 1]]"
                }
            ])
        },
        {
            "id": 2,
            "title": "Balanced Syntax Checker",
            "difficulty": "medium",
            "problem_statement": "Check if a string containing '(', ')', '{', '}', '[' and ']' is valid.",
            "starter_code": "def is_valid(s: str) -> bool:\n    return True",
            "test_cases_code": "assert is_valid('()') == True\nassert is_valid('()[]{}') == True\nassert is_valid('(]') == False",
            "questions_json": json.dumps([
                {
                    "index": 0,
                    "title": "Valid Parentheses (Warm-up)",
                    "problem_statement": "Check if a string containing '(', ')', '{', '}', '[' and ']' is valid.",
                    "starter_code": "def is_valid(s):\n    return True",
                    "test_cases_code": "assert is_valid('()') == True\nassert is_valid('()[]{}') == True\nassert is_valid('(]') == False"
                },
                {
                    "index": 1,
                    "title": "Longest Valid Substring (Algorithmic)",
                    "problem_statement": "Find the length of the longest valid (well-formed) parentheses substring.",
                    "starter_code": "def longest_valid(s):\n    return 0",
                    "test_cases_code": "assert longest_valid('(()') == 2\nassert longest_valid(')()())') == 4"
                },
                {
                    "index": 2,
                    "title": "Syntax Parser Refactoring (Optimization)",
                    "problem_statement": "Optimize your brackets stack analyzer to run in O(N) time complexity and O(1) auxiliary space.",
                    "starter_code": "def optimized_longest_valid(s):\n    # TODO: Optimize space complexity\n    return 0",
                    "test_cases_code": "assert optimized_longest_valid(')()())') == 4"
                }
            ])
        },
        {
            "id": 3,
            "title": "LRU Cache Architecture",
            "difficulty": "hard",
            "problem_statement": "Implement an LRUCache class with get(key) and put(key, value) operations.",
            "starter_code": "class LRUCache:\n    def __init__(self, capacity: int):\n        pass",
            "test_cases_code": "cache = LRUCache(2)\ncache.put(1, 1)\ncache.put(2, 2)\nassert cache.get(1) == 1",
            "questions_json": json.dumps([
                {
                    "index": 0,
                    "title": "LRU Cache Setup (Warm-up)",
                    "problem_statement": "Implement an LRUCache class with get(key) and put(key, value) operations.",
                    "starter_code": "class LRUCache:\n    def __init__(self, capacity: int):\n        pass\n    def get(self, key: int) -> int:\n        return -1\n    def put(self, key: int, value: int) -> None:\n        pass",
                    "test_cases_code": "cache = LRUCache(2)\ncache.put(1, 1)\ncache.put(2, 2)\nassert cache.get(1) == 1\ncache.put(3, 3)\nassert cache.get(2) == -1"
                },
                {
                    "index": 1,
                    "title": "LFU Cache Extension (Algorithmic)",
                    "problem_statement": "Upgrade the LRU Cache into a Least Frequently Used (LFU) Cache, prioritizing frequency of access.",
                    "starter_code": "class LFUCache:\n    def __init__(self, capacity: int):\n        pass\n    def get(self, key: int) -> int:\n        return -1\n    def put(self, key: int, value: int) -> None:\n        pass",
                    "test_cases_code": "cache = LFUCache(2)\ncache.put(1, 1)\ncache.put(2, 2)\nassert cache.get(1) == 1\ncache.put(3, 3)\nassert cache.get(2) == -1"
                },
                {
                    "index": 2,
                    "title": "Concurrency Guard (Optimization)",
                    "problem_statement": "Refactor your cache implementation to be thread-safe using locking primitives. Add comments explaining lock mechanisms.",
                    "starter_code": "import threading\nclass ThreadSafeCache:\n    def __init__(self, capacity: int):\n        self.lock = threading.Lock()\n    def get(self, key: int) -> int:\n        return -1\n    def put(self, key: int, value: int) -> None:\n        pass",
                    "test_cases_code": "cache = ThreadSafeCache(2)\ncache.put(1, 1)\nassert cache.get(1) == 1"
                }
            ])
        }
    ]
    return challenges
