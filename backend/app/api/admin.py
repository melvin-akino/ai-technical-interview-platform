import re
from fastapi import APIRouter, Depends, HTTPException, status, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db import models
from app.api.auth import get_current_user
from app.services.pdf_reports import build_cv_assessment_pdf, build_evaluation_pdf
from app.core.crypto import encrypt

router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/sessions")
def get_all_sessions(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Filter sessions by current user's company_id
    sessions = db.query(models.InterviewSession).filter(
        models.InterviewSession.company_id == current_user.company_id
    ).order_by(models.InterviewSession.started_at.desc()).all()
    
    result = []
    for s in sessions:
        score = s.feedback.overall_score if s.feedback else None
        result.append({
            "session_id": s.id,
            "session_token": s.session_token,
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "candidate_name": s.candidate.name,
            "candidate_email": s.candidate.email,
            "job_title": s.job.title,
            "status": s.status,
            "started_at": s.started_at.isoformat(),
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "overall_score": score
        })
    return result

@router.get("/analytics")
def get_recruiter_analytics(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. Total counts by status
    sessions = db.query(models.InterviewSession).filter(
        models.InterviewSession.company_id == current_user.company_id
    ).all()
    
    total_sessions = len(sessions)
    active_count = sum(1 for s in sessions if s.status == "active")
    completed_count = sum(1 for s in sessions if s.status == "completed")
    graded_count = sum(1 for s in sessions if s.status == "graded")
    
    # 2. Avg score and score distribution
    feedback_scores = []
    distribution = {"needs_review": 0, "passing": 0, "high_fit": 0}
    
    for s in sessions:
        if s.feedback:
            score = s.feedback.overall_score
            feedback_scores.append(score)
            if score < 60:
                distribution["needs_review"] += 1
            elif score < 80:
                distribution["passing"] += 1
            else:
                distribution["high_fit"] += 1
                
    avg_score = round(sum(feedback_scores) / len(feedback_scores), 1) if feedback_scores else 0
    
    # 3. Avg candidate integrity
    integrity_scores = []
    for s in sessions:
        focus_losses = s.focus_losses or 0
        copy_pastes = s.copy_pastes or 0
        score = max(0, 100 - (focus_losses * 15) - (copy_pastes * 10))
        integrity_scores.append(score)
        
    avg_integrity = round(sum(integrity_scores) / len(integrity_scores), 1) if integrity_scores else 100
    
    # 4. Job postings count
    jobs_count = db.query(models.JobPosting).filter(
        models.JobPosting.company_id == current_user.company_id
    ).count()
    
    # 5. Top skills count from all candidates
    candidates = db.query(models.Candidate).filter(
        models.Candidate.company_id == current_user.company_id
    ).all()
    
    skill_counts = {}
    for c in candidates:
        if c.extracted_skills:
            parts = c.extracted_skills.split(",")
            for p in parts:
                skill = p.strip()
                if skill:
                    normalized = skill.lower()
                    if normalized not in skill_counts:
                        skill_counts[normalized] = {"name": skill, "count": 0}
                    skill_counts[normalized]["count"] += 1
                    
    sorted_skills = sorted(skill_counts.values(), key=lambda x: x["count"], reverse=True)[:6]
    top_skills = [{"skill": s["name"], "count": s["count"]} for s in sorted_skills]
    
    return {
        "total_sessions": total_sessions,
        "active_count": active_count,
        "completed_count": completed_count,
        "graded_count": graded_count,
        "avg_score": avg_score,
        "avg_integrity": avg_integrity,
        "jobs_count": jobs_count,
        "score_distribution": distribution,
        "top_skills": top_skills
    }

@router.get("/sessions/{session_id}")
def get_session_details(
    session_id: int, 
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    session = db.query(models.InterviewSession).filter(
        models.InterviewSession.id == session_id,
        models.InterviewSession.company_id == current_user.company_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    messages = db.query(models.InterviewMessage).filter(
        models.InterviewMessage.session_id == session_id
    ).order_by(models.InterviewMessage.timestamp.asc()).all()
    
    # Grab the final code state from history
    final_code = ""
    for msg in reversed(messages):
        if msg.code_state:
            final_code = msg.code_state
            break
            
    return {
        "session_id": session.id,
        "session_token": session.session_token,
        "expires_at": session.expires_at.isoformat() if session.expires_at else None,
        "candidate": {
            "name": session.candidate.name,
            "email": session.candidate.email,
            "skills": session.candidate.extracted_skills
        },
        "job": {
            "title": session.job.title,
            "description": session.job.description
        },
        "status": session.status,
        "selected_language": session.selected_language,
        "cv_assessment": {
            "fit_score": session.fit_score,
            "matching_skills": session.matching_skills,
            "missing_skills": session.missing_skills,
            "analysis": session.match_analysis
        } if (session.fit_score is not None or session.match_analysis) else None,
        "started_at": session.started_at.isoformat(),
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "final_code": session.latest_code or final_code,
        "focus_losses": session.focus_losses or 0,
        "copy_pastes": session.copy_pastes or 0,
        "time_away_seconds": session.time_away_seconds or 0,
        "transcript": [
            {
                "sender": m.sender,
                "message_text": m.message_text,
                "timestamp": m.timestamp.isoformat()
            } for m in messages
        ],
        "feedback": {
            "overall_score": session.feedback.overall_score,
            "code_quality_feedback": session.feedback.code_quality_feedback,
            "communication_feedback": session.feedback.communication_feedback,
            "technical_accuracy_feedback": session.feedback.technical_accuracy_feedback,
            "detailed_report": session.feedback.detailed_report
        } if session.feedback else None,
        "questions_json": session.questions_json,
        "current_question_index": session.current_question_index,
        "proctoring_events": [
            {
                "event_type": evt.event_type,
                "seconds_elapsed": evt.seconds_elapsed,
                "timestamp": evt.timestamp.isoformat()
            } for evt in sorted(session.proctoring_events, key=lambda x: x.seconds_elapsed)
        ],
        "code_keystroke_logs": [
            {
                "question_index": log.question_index,
                "code_state": log.code_state,
                "seconds_elapsed": log.seconds_elapsed,
                "timestamp": log.timestamp.isoformat()
            } for log in sorted(session.keystroke_logs, key=lambda x: x.seconds_elapsed)
        ]
    }

@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: int, 
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    session = db.query(models.InterviewSession).filter(
        models.InterviewSession.id == session_id,
        models.InterviewSession.company_id == current_user.company_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    db.delete(session)
    db.commit()
    return {"message": "Session and associated logs deleted successfully"}


class CompanySettingsUpdate(BaseModel):
    temperature: float
    system_prompt_modifier: str = None
    api_key: str = None
    webhook_url: str = None

@router.get("/settings")
def get_company_settings(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    company = db.query(models.Company).filter(models.Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    # Default prompt modifier fallback if empty
    prompt_modifier = company.system_prompt_modifier or (
        "Keep all live coding challenges focused strictly on algorithmic problem-solving and finding logic bugs. "
        "The challenge must be entirely self-contained, requiring only standard library functions."
    )
        
    return {
        "company_name": company.name,
        "temperature": company.temperature or 0.7,
        "system_prompt_modifier": prompt_modifier,
        "api_key_configured": bool(company.custom_api_key),
        "webhook_url": company.webhook_url
    }

@router.put("/settings")
def update_company_settings(
    data: CompanySettingsUpdate, 
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    company = db.query(models.Company).filter(models.Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    company.temperature = data.temperature
    company.system_prompt_modifier = data.system_prompt_modifier
    company.webhook_url = data.webhook_url.strip() if data.webhook_url else None
    
    # Handle custom API Key securely
    if data.api_key is not None:
        if data.api_key == "CLEAR":
            company.custom_api_key = None
        elif data.api_key != "••••••••" and data.api_key.strip() != "":
            company.custom_api_key = encrypt(data.api_key.strip())
            
    db.commit()
    db.refresh(company)
    
    return {
        "company_name": company.name,
        "temperature": company.temperature,
        "system_prompt_modifier": company.system_prompt_modifier,
        "api_key_configured": bool(company.custom_api_key),
        "webhook_url": company.webhook_url
    }


def _resolve_session(session_id: str, current_user, db):
    """Look up a session by numeric id or token, scoped to the caller's company."""
    from sqlalchemy import String
    session = db.query(models.InterviewSession).filter(
        models.InterviewSession.company_id == current_user.company_id,
        (models.InterviewSession.session_token == session_id) |
        (models.InterviewSession.id.cast(String) == session_id)
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
    return session


def _pdf_response(content: bytes, filename: str):
    safe = re.sub(r'[^A-Za-z0-9._-]+', '_', filename).strip('_') or "report.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe}"'}
    )


@router.get("/sessions/{session_id}/cv-assessment.pdf")
def download_cv_assessment(
    session_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download the CV assessment (parsed profile + AI fit analysis) as a PDF."""
    session = _resolve_session(session_id, current_user, db)
    if session.fit_score is None and not session.match_analysis:
        raise HTTPException(
            status_code=404,
            detail="No CV assessment stored for this session. Assessments are captured when a "
                   "candidate is matched to a job; re-run the match to generate one."
        )
    pdf = build_cv_assessment_pdf(session)
    return _pdf_response(pdf, f"cv_assessment_{session.candidate.name}_{session.job.title}.pdf")


@router.get("/sessions/{session_id}/evaluation.pdf")
def download_evaluation(
    session_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download the interview evaluation (AI grading + proctoring + code) as a PDF."""
    session = _resolve_session(session_id, current_user, db)
    feedback = db.query(models.FeedbackReport).filter(
        models.FeedbackReport.session_id == session.id
    ).first()
    if not feedback:
        raise HTTPException(
            status_code=404,
            detail="This interview has not been graded yet, so there is no evaluation to download."
        )
    pdf = build_evaluation_pdf(session, feedback)
    return _pdf_response(pdf, f"evaluation_{session.candidate.name}_{session.job.title}.pdf")
