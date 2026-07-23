import datetime
import requests
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import String
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db import models
from app.services.grader import generate_session_feedback
from app.core.rate_limit import rate_limit

router = APIRouter()

# Grading is a Gemini call and is public (no auth on this router). Cap per IP.
GRADE_LIMIT = rate_limit("grade", [(8, 60), (40, 3600)])

def dispatch_webhook(webhook_url: str, payload: dict):
    """Asynchronously dispatches webhook payload to target URL."""
    try:
        response = requests.post(webhook_url, json=payload, timeout=10.0)
        response.raise_for_status()
    except Exception as e:
        print(f"Failed to dispatch webhook to {webhook_url}: {e}")

@router.post("/grade/{session_id}", dependencies=[Depends(GRADE_LIMIT)])
def grade_session(session_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # Lookup by session token or cast integer ID
    session = db.query(models.InterviewSession).filter(
        (models.InterviewSession.session_token == session_id) |
        (models.InterviewSession.id.cast(String) == session_id)
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Interview session not found"
        )
        
    # Get all transcript messages (using the integer primary key)
    messages = db.query(models.InterviewMessage).filter(
        models.InterviewMessage.session_id == session.id
    ).order_by(models.InterviewMessage.timestamp.asc()).all()
    
    # Grab the final code state from history
    final_code = ""
    for msg in reversed(messages):
        if msg.code_state:
            final_code = msg.code_state
            break
            
    try:
        # Call Gemini grading service
        grading_data = generate_session_feedback(
            job_title=session.job.title,
            job_description=session.job.description,
            messages=messages,
            final_code=final_code,
            language=session.selected_language,
            company_id=session.company_id
        )
        
        # Check if feedback already exists, update it, otherwise create new
        feedback = db.query(models.FeedbackReport).filter(models.FeedbackReport.session_id == session.id).first()
        if not feedback:
            feedback = models.FeedbackReport(
                session_id=session.id,
                overall_score=grading_data.overall_score,
                code_quality_feedback=grading_data.code_quality_feedback,
                communication_feedback=grading_data.communication_feedback,
                technical_accuracy_feedback=grading_data.technical_accuracy_feedback,
                detailed_report=grading_data.detailed_report
            )
            db.add(feedback)
        else:
            feedback.overall_score = grading_data.overall_score
            feedback.code_quality_feedback = grading_data.code_quality_feedback
            feedback.communication_feedback = grading_data.communication_feedback
            feedback.technical_accuracy_feedback = grading_data.technical_accuracy_feedback
            feedback.detailed_report = grading_data.detailed_report
            
        session.status = "graded"
        db.commit()
        db.refresh(feedback)
        
        # Dispatch Webhook if company has webhook_url configured
        if session.company.webhook_url:
            webhook_payload = {
                "event": "session.graded",
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "company_name": session.company.name,
                "session": {
                    "id": session.id,
                    "token": session.session_token,
                    "status": session.status,
                    "language": session.selected_language,
                    "started_at": session.started_at.isoformat(),
                    "ended_at": session.ended_at.isoformat() if session.ended_at else None,
                    "focus_losses": session.focus_losses or 0,
                    "copy_pastes": session.copy_pastes or 0,
                    "time_away_seconds": session.time_away_seconds or 0
                },
                "candidate": {
                    "name": session.candidate.name,
                    "email": session.candidate.email,
                    "skills": session.candidate.extracted_skills
                },
                "job": {
                    "title": session.job.title,
                    "required_skills": session.job.required_skills
                },
                "feedback": {
                    "overall_score": feedback.overall_score,
                    "code_quality_feedback": feedback.code_quality_feedback,
                    "communication_feedback": feedback.communication_feedback,
                    "technical_accuracy_feedback": feedback.technical_accuracy_feedback
                }
            }
            background_tasks.add_task(dispatch_webhook, session.company.webhook_url, webhook_payload)
        
        return {
            "session_id": session.id,
            "status": session.status,
            "feedback": {
                "overall_score": feedback.overall_score,
                "code_quality_feedback": feedback.code_quality_feedback,
                "communication_feedback": feedback.communication_feedback,
                "technical_accuracy_feedback": feedback.technical_accuracy_feedback,
                "detailed_report": feedback.detailed_report
            }
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to grade interview session: {str(e)}"
        )

@router.get("/{session_id}")
def get_feedback(session_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # Lookup by session token or cast integer ID
    session = db.query(models.InterviewSession).filter(
        (models.InterviewSession.session_token == session_id) |
        (models.InterviewSession.id.cast(String) == session_id)
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    feedback = db.query(models.FeedbackReport).filter(models.FeedbackReport.session_id == session.id).first()
    
    # Auto-grade if session is completed but not graded
    if not feedback:
        if session.status in ["completed", "active"]:
            # Set status to completed just in case
            if session.status == "active":
                session.status = "completed"
                db.commit()
            return grade_session(session_id=session_id, background_tasks=background_tasks, db=db)
        else:
            raise HTTPException(status_code=400, detail="Interview session is not graded yet, and cannot be auto-graded in its current state.")
            
    return {
        "session_id": session.id,
        "job_title": session.job.title,
        "candidate_name": session.candidate.name,
        "overall_score": feedback.overall_score,
        "code_quality_feedback": feedback.code_quality_feedback,
        "communication_feedback": feedback.communication_feedback,
        "technical_accuracy_feedback": feedback.technical_accuracy_feedback,
        "detailed_report": feedback.detailed_report,
        "generated_at": feedback.generated_at.isoformat(),
        "focus_losses": session.focus_losses,
        "copy_pastes": session.copy_pastes,
        "time_away_seconds": session.time_away_seconds,
        "latest_code": session.latest_code,
        "questions_json": session.questions_json,
        "proctoring_events": [
            {
                "event_type": evt.event_type,
                "seconds_elapsed": evt.seconds_elapsed,
                "timestamp": evt.timestamp.isoformat()
            } for evt in sorted(session.proctoring_events, key=lambda x: x.seconds_elapsed)
        ]
    }
