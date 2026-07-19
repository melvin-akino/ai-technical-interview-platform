import json
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db import models
from app.services.interview_conductor import generate_initial_problem, generate_interviewer_response, translate_problem_to_language
from app.services.email_sender import send_interview_invite
from pydantic import BaseModel
import datetime

router = APIRouter()


def localize_static_questions(q_list, target_language, job, company_id):
    """Static exam templates are authored in Python. When a session's language isn't Python,
    translate the whole question set (problem statement, starter code, and unit tests) into the
    target language so the candidate isn't handed Python code to run under, e.g., Node — reusing
    the same translator the mid-exam language switch uses. Returns the possibly-translated q_list.
    On any translation failure we fall back to the original Python content rather than blocking
    the interview from starting."""
    if not q_list or (target_language or "python").lower() in ("python", "py"):
        return q_list
    try:
        translated = translate_problem_to_language(
            job_title=job.title,
            job_description=job.description,
            original_questions_json=json.dumps(q_list),
            target_language=target_language,
            company_id=company_id
        )
        localized = []
        for original, tq in zip(q_list, translated.questions):
            localized.append({
                "title": tq.translated_title,
                "problem_statement": tq.translated_problem_statement,
                "starter_code": tq.translated_starter_code,
                "test_cases_code": tq.translated_test_cases_code,
                "submitted_code": tq.translated_starter_code
            })
        # Guard against a short/misaligned response: keep any untranslated originals as-is.
        if len(localized) == len(q_list):
            return localized
    except Exception:
        pass
    return q_list


class SessionCreate(BaseModel):
    candidate_id: int
    job_id: int
    selected_language: str = "python"
    expires_at: datetime.datetime | None = None

class SessionResponse(BaseModel):
    session_id: int
    session_token: str | None
    expires_at: str | None
    candidate_name: str
    job_title: str
    selected_language: str
    status: str

@router.post("/session", response_model=SessionResponse)
def start_session(data: SessionCreate, db: Session = Depends(get_db)):
    candidate = db.query(models.Candidate).filter(models.Candidate.id == data.candidate_id).first()
    job = db.query(models.JobPosting).filter(models.JobPosting.id == data.job_id).first()
    
    if not candidate or not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate or Job Posting not found"
        )
        
    expires_at = data.expires_at
    if not expires_at:
        # Default to 7 days from now
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=7)

    # Create the session
    session = models.InterviewSession(
        company_id=job.company_id,  # NOT NULL — inherit the tenant from the job posting
        candidate_id=candidate.id,
        job_id=job.id,
        selected_language=data.selected_language,
        status="active",
        started_at=datetime.datetime.utcnow(),
        expires_at=expires_at
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    # Try to load configured active exam template from the database first
    try:
        active_exam = db.query(models.ExamTemplate).filter(
            models.ExamTemplate.job_id == job.id,
            models.ExamTemplate.is_active == True
        ).first()
        
        if active_exam:
            # Use configured exam template
            if active_exam.questions_json:
                q_list = json.loads(active_exam.questions_json)
            else:
                q_list = [{
                    "title": active_exam.title,
                    "problem_statement": active_exam.problem_statement,
                    "starter_code": active_exam.starter_code,
                    "test_cases_code": active_exam.test_cases_code,
                    "submitted_code": active_exam.starter_code
                }]
            # Templates are authored in Python; translate to the session language if needed.
            q_list = localize_static_questions(q_list, data.selected_language, job, session.company_id)
            session.questions_json = json.dumps(q_list)
            problem_title = q_list[0]["title"]
            problem_statement = q_list[0]["problem_statement"]
            starter_code = q_list[0]["starter_code"]
            session.test_cases_code = q_list[0]["test_cases_code"]
            session.current_question_index = 0
        else:
            # Fallback: Generate dynamically on the fly using Gemini
            problem = generate_initial_problem(
                job_title=job.title,
                job_description=job.description,
                candidate_skills=candidate.extracted_skills or "Python, coding",
                language=data.selected_language,
                company_id=session.company_id,
                persona=job.interviewer_persona or "standard"
            )
            
            questions_list = []
            for idx, q in enumerate(problem.questions):
                questions_list.append({
                    "title": q.title,
                    "problem_statement": q.problem_statement,
                    "starter_code": q.starter_code,
                    "test_cases_code": q.test_cases_code,
                    "submitted_code": q.starter_code
                })
            
            session.questions_json = json.dumps(questions_list)
            session.current_question_index = 0
            
            problem_title = problem.questions[0].title
            problem_statement = problem.questions[0].problem_statement
            starter_code = problem.questions[0].starter_code
            session.test_cases_code = problem.questions[0].test_cases_code
            
        # Save this initial problem description as the first AI message
        first_message = models.InterviewMessage(
            session_id=session.id,
            sender="ai",
            message_text=f"Welcome, {candidate.name}! I am your AI interviewer today. Let's start with a live coding question.\n\n### Problem: {problem_title}\n\n{problem_statement}",
            code_state=starter_code,
            timestamp=datetime.datetime.utcnow()
        )
        db.add(first_message)
        session.latest_code = starter_code
        db.commit()
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialize coding problem: {str(e)}"
        )
        
    return SessionResponse(
        session_id=session.id,
        session_token=session.session_token,
        expires_at=session.expires_at.isoformat() if session.expires_at else None,
        candidate_name=candidate.name,
        job_title=job.title,
        selected_language=session.selected_language,
        status=session.status
    )

@router.get("/session/{session_id}")
def get_session_details(session_id: str, db: Session = Depends(get_db)):
    session = None
    try:
        sess_id_int = int(session_id)
        session = db.query(models.InterviewSession).filter(models.InterviewSession.id == sess_id_int).first()
    except ValueError:
        pass
        
    if not session:
        session = db.query(models.InterviewSession).filter(models.InterviewSession.session_token == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    messages = db.query(models.InterviewMessage).filter(
        models.InterviewMessage.session_id == session.id
    ).order_by(models.InterviewMessage.timestamp.asc()).all()
    
    # Check if session is expired
    is_expired = session.expires_at is not None and session.expires_at < datetime.datetime.utcnow()
    
    # If no messages exist in the database, initialize the coding problem dynamically
    if not messages and not is_expired and session.status not in ["completed", "graded"]:
        language = session.selected_language or "python"
        if not session.selected_language:
            session.selected_language = language
            
        session.started_at = datetime.datetime.utcnow()
        
        try:
            # Try to load configured active exam template from the database first
            active_exam = db.query(models.ExamTemplate).filter(
                models.ExamTemplate.job_id == session.job_id,
                models.ExamTemplate.is_active == True
            ).first()
            
            if active_exam:
                if active_exam.questions_json:
                    q_list = json.loads(active_exam.questions_json)
                else:
                    q_list = [{
                        "title": active_exam.title,
                        "problem_statement": active_exam.problem_statement,
                        "starter_code": active_exam.starter_code,
                        "test_cases_code": active_exam.test_cases_code,
                        "submitted_code": active_exam.starter_code
                    }]
                # Templates are authored in Python; translate to the session language if needed.
                q_list = localize_static_questions(q_list, language, session.job, session.company_id)
                session.questions_json = json.dumps(q_list)
                problem_title = q_list[0]["title"]
                problem_statement = q_list[0]["problem_statement"]
                starter_code = q_list[0]["starter_code"]
                session.test_cases_code = q_list[0]["test_cases_code"]
                session.current_question_index = 0
            else:
                problem = generate_initial_problem(
                    job_title=session.job.title,
                    job_description=session.job.description,
                    candidate_skills=session.candidate.extracted_skills or "Python, coding",
                    language=language,
                    company_id=session.company_id,
                    persona=session.job.interviewer_persona or "standard"
                )
                
                questions_list = []
                for idx, q in enumerate(problem.questions):
                    questions_list.append({
                        "title": q.title,
                        "problem_statement": q.problem_statement,
                        "starter_code": q.starter_code,
                        "test_cases_code": q.test_cases_code,
                        "submitted_code": q.starter_code
                    })
                
                session.questions_json = json.dumps(questions_list)
                session.current_question_index = 0
                
                problem_title = problem.questions[0].title
                problem_statement = problem.questions[0].problem_statement
                starter_code = problem.questions[0].starter_code
                session.test_cases_code = problem.questions[0].test_cases_code
                
            first_message = models.InterviewMessage(
                session_id=session.id,
                sender="ai",
                message_text=f"Welcome, {session.candidate.name}! I am your AI interviewer today. Let's start with a live coding question.\n\n### Problem: {problem_title}\n\n{problem_statement}",
                code_state=starter_code,
                timestamp=datetime.datetime.utcnow()
            )
            db.add(first_message)
            session.latest_code = starter_code
            db.commit()
            
            # Refresh references
            messages = [first_message]
            latest_code = starter_code
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to auto-initialize coding problem: {str(e)}"
            )
    else:
        # Extract starter code or current code from the latest messages or session cache
        latest_code = session.latest_code or ""
        if not latest_code:
            for msg in reversed(messages):
                if msg.code_state:
                    latest_code = msg.code_state
                    break
            
    return {
        "session_id": session.id,
        "session_token": session.session_token,
        "expires_at": session.expires_at.isoformat() if session.expires_at else None,
        "is_expired": is_expired,
        "candidate": {
            "name": session.candidate.name,
            "skills": session.candidate.extracted_skills
        },
        "job": {
            "title": session.job.title,
            "description": session.job.description
        },
        "status": session.status,
        "selected_language": session.selected_language,
        "latest_code": latest_code,
        "questions_json": session.questions_json,
        "current_question_index": session.current_question_index,
        "messages": [
            {
                "sender": m.sender,
                "message_text": m.message_text,
                "timestamp": m.timestamp.isoformat()
            } for m in messages
        ]
    }

class SessionResetPayload(BaseModel):
    expires_at: datetime.datetime | None = None

@router.post("/session/{session_id}/reset")
def reset_session(session_id: str, payload: SessionResetPayload = None, db: Session = Depends(get_db)):
    session = None
    try:
        sess_id_int = int(session_id)
        session = db.query(models.InterviewSession).filter(models.InterviewSession.id == sess_id_int).first()
    except ValueError:
        pass
        
    if not session:
        session = db.query(models.InterviewSession).filter(models.InterviewSession.session_token == session_id).first()
        
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    # Reset status back to active, clear proctoring logs and metadata
    session.status = "active"
    session.ended_at = None
    session.focus_losses = 0
    session.copy_pastes = 0
    session.time_away_seconds = 0
    session.latest_code = None
    
    # Extend expiration
    new_expiration = payload.expires_at if payload else None
    if not new_expiration:
        new_expiration = datetime.datetime.utcnow() + datetime.timedelta(days=7)
    session.expires_at = new_expiration
    
    # Delete previous messages and reports
    db.query(models.InterviewMessage).filter(models.InterviewMessage.session_id == session.id).delete()
    db.query(models.FeedbackReport).filter(models.FeedbackReport.session_id == session.id).delete()
    
    db.commit()
    return {
        "message": "Session successfully reset. Candidate can now take the exam again.",
        "session_token": session.session_token,
        "expires_at": session.expires_at.isoformat()
    }

@router.post("/session/{session_id}/email-invite")
def email_session_invite(session_id: str, db: Session = Depends(get_db)):
    session = None
    try:
        sess_id_int = int(session_id)
        session = db.query(models.InterviewSession).filter(models.InterviewSession.id == sess_id_int).first()
    except ValueError:
        pass
        
    if not session:
        session = db.query(models.InterviewSession).filter(models.InterviewSession.session_token == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    try:
        success = send_interview_invite(
            email=session.candidate.email,
            candidate_name=session.candidate.name,
            job_title=session.job.title,
            # We now send the session_token in the email invitation!
            session_id=session.session_token
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to send email invite")
        return {"message": f"Interview invitation successfully sent to {session.candidate.email}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Connection manager for active WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, WebSocket] = {}

    async def connect(self, session_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: int):
        if session_id in self.active_connections:
            del self.active_connections[session_id]

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

manager = ConnectionManager()

@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    # Retrieve DB session manually since FastAPI WebSocket dependencies are handled differently
    from app.db.session import SessionLocal
    db = SessionLocal()
    
    session = None
    try:
        sess_id_int = int(session_id)
        session = db.query(models.InterviewSession).filter(models.InterviewSession.id == sess_id_int).first()
    except ValueError:
        pass
        
    if not session:
        session = db.query(models.InterviewSession).filter(models.InterviewSession.session_token == session_id).first()

    if not session:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        db.close()
        return

    # Check expiration date range
    if session.expires_at and session.expires_at < datetime.datetime.utcnow():
        await websocket.accept()
        await websocket.send_json({
            "type": "error",
            "message": "This technical exam session has expired. Please contact your hiring coordinator."
        })
        await websocket.close()
        db.close()
        return

    # Check completed/graded status (restrict re-entry)
    if session.status in ["completed", "graded"]:
        await websocket.accept()
        await websocket.send_json({
            "type": "error",
            "message": "This exam has already been submitted. Re-entry is not allowed unless enabled by your recruiter."
        })
        await websocket.close()
        db.close()
        return

    await manager.connect(session.id, websocket)
    
    # Store the latest code state in memory during websocket session to reduce DB write spam
    latest_code_state = session.latest_code or ""
    messages = db.query(models.InterviewMessage).filter(
        models.InterviewMessage.session_id == session.id
    ).order_by(models.InterviewMessage.timestamp.asc()).all()
    
    if not latest_code_state:
        for msg in reversed(messages):
            if msg.code_state:
                latest_code_state = msg.code_state
                break

    try:
        while True:
            data = await websocket.receive_text()
            event = json.loads(data)
            
            event_type = event.get("type")
            
            if event_type == "code_sync":
                # Heartbeat or edit update from client
                latest_code_state = event.get("code", "")
                session.latest_code = latest_code_state
                if session.questions_json:
                    try:
                        q_list = json.loads(session.questions_json)
                        if 0 <= session.current_question_index < len(q_list):
                            q_list[session.current_question_index]["submitted_code"] = latest_code_state
                            session.questions_json = json.dumps(q_list)
                    except Exception:
                        pass
                
                # Log code snapshot for time-lapse playback
                seconds_elapsed = 0
                if session.started_at:
                    delta = datetime.datetime.utcnow() - session.started_at
                    seconds_elapsed = int(delta.total_seconds())
                
                keystroke_log = models.CodeKeystrokeLog(
                    session_id=session.id,
                    question_index=session.current_question_index,
                    code_state=latest_code_state,
                    seconds_elapsed=seconds_elapsed,
                    timestamp=datetime.datetime.utcnow()
                )
                db.add(keystroke_log)
                db.commit()
                
            elif event_type == "proctoring_sync":
                new_focus_losses = event.get("focus_losses", 0)
                new_copy_pastes = event.get("copy_pastes", 0)
                new_time_away = event.get("time_away_seconds", 0)
                
                seconds_elapsed = 0
                if session.started_at:
                    delta = datetime.datetime.utcnow() - session.started_at
                    seconds_elapsed = int(delta.total_seconds())
                
                # Log focus loss events if count increased
                if new_focus_losses > session.focus_losses:
                    diff = new_focus_losses - session.focus_losses
                    for _ in range(diff):
                        evt = models.ProctoringEvent(
                            session_id=session.id,
                            event_type="focus_loss",
                            seconds_elapsed=seconds_elapsed,
                            timestamp=datetime.datetime.utcnow()
                        )
                        db.add(evt)
                        
                # Log copy paste events if count increased
                if new_copy_pastes > session.copy_pastes:
                    diff = new_copy_pastes - session.copy_pastes
                    for _ in range(diff):
                        evt = models.ProctoringEvent(
                            session_id=session.id,
                            event_type="copy_paste",
                            seconds_elapsed=seconds_elapsed,
                            timestamp=datetime.datetime.utcnow()
                        )
                        db.add(evt)
                
                session.focus_losses = new_focus_losses
                session.copy_pastes = new_copy_pastes
                session.time_away_seconds = new_time_away
                db.commit()
                
            elif event_type == "candidate_message":
                candidate_text = event.get("message", "")
                
                # Save candidate message to DB
                cand_db_msg = models.InterviewMessage(
                    session_id=session.id,
                    sender="candidate",
                    message_text=candidate_text,
                    code_state=latest_code_state,
                    timestamp=datetime.datetime.utcnow()
                )
                db.add(cand_db_msg)
                db.commit()
                
                # Retrieve full history for LLM
                all_messages = db.query(models.InterviewMessage).filter(
                    models.InterviewMessage.session_id == session.id
                ).order_by(models.InterviewMessage.timestamp.asc()).all()
                
                # Generate AI Interviewer response
                ai_response = generate_interviewer_response(
                    messages=all_messages,
                    current_code=latest_code_state,
                    job_title=session.job.title,
                    job_description=session.job.description,
                    language=session.selected_language,
                    company_id=session.company_id,
                    persona=session.job.interviewer_persona or "standard"
                )
                
                # Save AI response to DB
                ai_db_msg = models.InterviewMessage(
                    session_id=session.id,
                    sender="ai",
                    message_text=ai_response.interviewer_message,
                    code_state=latest_code_state,
                    timestamp=datetime.datetime.utcnow()
                )
                db.add(ai_db_msg)
                
                if ai_response.should_end:
                    session.status = "completed"
                    session.ended_at = datetime.datetime.utcnow()
                
                db.commit()
                
                # Send the response back to candidate
                await manager.send_personal_message({
                    "type": "ai_response",
                    "message": ai_response.interviewer_message,
                    "should_end": ai_response.should_end,
                    "timestamp": ai_db_msg.timestamp.isoformat()
                }, websocket)
                
    except WebSocketDisconnect:
        manager.disconnect(session.id)
        if latest_code_state:
            session.latest_code = latest_code_state
            db.commit()
    except Exception as e:
        # In case of any unhandled websocket errors
        pass
    finally:
        db.close()


class CodeRunRequest(BaseModel):
    code: str
    language: str

class TestRunRequest(BaseModel):
    code: str

def execute_in_sandbox(code: str, language: str):
    import subprocess
    import tempfile
    import os
    import sys
    
    lang = language.lower()
    
    # Map languages to file extensions
    ext_map = {
        "python": ".py",
        "javascript": ".js",
        "typescript": ".js",  # run as standard JS in node
        "go": ".go",
        "php": ".php",
        "cpp": ".cpp",
        "c": ".c"
    }
    
    suffix = ext_map.get(lang, ".txt")
    if lang not in ext_map:
        return {
            "stdout": "",
            "stderr": f"Execution Error: Language '{language}' is not supported in the live sandbox.",
            "exit_code": -1
        }
        
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(code.encode("utf-8"))
        temp_path = f.name
        
    # Ensure the sandbox user has permission to read and execute the temporary script
    os.chmod(temp_path, 0o755)
        
    # Resolve sandbox user UID/GID for Unix platforms
    sandbox_user = None
    if sys.platform != "win32":
        try:
            import pwd
            sandbox_user = pwd.getpwnam("sandboxuser").pw_uid
        except Exception:
            pass
            
    # Runtimes with heavier native startup (V8, the Go scheduler/GC) reserve far more
    # *virtual* address space at boot than they actually touch, even for a trivial script —
    # 128MB is enough for Python/PHP/compiled C but makes Node/Go fail to even initialize
    # (mmap for a thread stack fails, or the runtime just hangs until the CPU-time limit
    # kills it). RLIMIT_AS caps reserved virtual memory, not resident/actually-used memory.
    #
    # Go is a special case: its page allocator reserves a fixed-size address-space summary
    # region at startup ("failed to reserve page summary memory") sized off the architecture's
    # max heap address bits, not off what the program will actually use — no RLIMIT_AS value
    # short of several GB satisfies it, which defeats the point of a tight sandbox cap. So for
    # Go we skip RLIMIT_AS entirely and cap *actual* heap usage instead via GOMEMLIMIT (a soft
    # limit Go's GC enforces against real usage, not virtual reservation) plus GOMAXPROCS=1 to
    # keep it well under the RLIMIT_NPROC ceiling below.
    as_limit_mb = 256 if lang in ("javascript", "typescript") else 128

    def set_sandbox_limits():
        if sys.platform != "win32":
            import resource
            # Limit CPU time to 3 seconds max (prevent infinite loops)
            resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
            # Limit memory size (prevent memory leaks / OOM) — see as_limit_mb/Go note above
            if lang != "go":
                resource.setrlimit(resource.RLIMIT_AS, (as_limit_mb * 1024 * 1024, as_limit_mb * 1024 * 1024))
            # Limit processes/threads for the sandbox uid (prevents fork-bombs). This is a
            # per-uid ceiling across every process/thread that uid owns system-wide, not
            # just this one run — 20 was too tight: Node alone needs several native threads
            # at startup (V8 background threads + libuv's thread pool + main thread) and
            # failed with "Assertion failed: uv_thread_create" before even running the code.
            resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))

    binary_path = None
    try:
        if lang == "python":
            cmd = ["python", "-W", "ignore", temp_path]
        elif lang == "javascript" or lang == "typescript":
            # --jitless: skips V8's large JIT code-range virtual memory reservation, which
            # otherwise fails outright under our RLIMIT_AS sandbox cap even at 512MB+. Fine
            # here since candidate test snippets run for a few seconds, not long enough for
            # JIT compilation to matter anyway.
            cmd = ["node", "--jitless", temp_path]
        elif lang == "php":
            cmd = ["php", temp_path]
        elif lang == "go":
            cmd = ["go", "run", temp_path]
        elif lang in ["cpp", "c"]:
            binary_path = temp_path + ".bin"
            compiler = "g++" if lang == "cpp" else "gcc"
            # Compile first (run compiler under root so it can write the binary safely)
            compile_res = subprocess.run(
                [compiler, temp_path, "-o", binary_path],
                capture_output=True,
                text=True,
                timeout=5.0
            )
            if compile_res.returncode != 0:
                return {
                    "stdout": "",
                    "stderr": f"Compilation Error:\n{compile_res.stderr or compile_res.stdout}",
                    "exit_code": -1
                }
            # Give execute permission on compiled binary to the sandbox user
            os.chmod(binary_path, 0o755)
            cmd = [binary_path]
            
        # Build clean environment without sensitive API keys
        safe_env = {
            "PATH": os.environ.get("PATH", ""),
            "HOME": "/home/sandboxuser"  # home dir for sandbox user
        }
        if lang == "go":
            # Since RLIMIT_AS is skipped for Go (see set_sandbox_limits), cap its *actual*
            # heap usage via GOMEMLIMIT instead, and keep it to one OS thread so it stays
            # well under the RLIMIT_NPROC ceiling.
            safe_env["GOMEMLIMIT"] = "100MiB"
            safe_env["GOMAXPROCS"] = "1"
            # Pre-warmed at image build time (see backend/Dockerfile) so candidate code
            # doesn't pay Go's ~17s cold stdlib-compile cost on every run — warm, it's ~0.1s.
            safe_env["GOCACHE"] = "/opt/gocache"
        
        # Subprocess execution args
        exec_kwargs = {
            "capture_output": True,
            "text": True,
            "timeout": 3.0,
            "env": safe_env
        }
        
        # On Linux/production Docker: apply sandbox limits and downgrade user privileges
        if sandbox_user is not None:
            exec_kwargs["user"] = sandbox_user
            exec_kwargs["preexec_fn"] = set_sandbox_limits

        result = subprocess.run(cmd, **exec_kwargs)
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": "Execution Timeout: Code execution exceeded 3-second limit (possible infinite loop).",
            "exit_code": -1
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": f"Execution Error: {str(e)}",
            "exit_code": -1
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        if binary_path and os.path.exists(binary_path):
            os.remove(binary_path)

@router.post("/run-code")
def run_sandbox_code(data: CodeRunRequest):
    res = execute_in_sandbox(data.code, data.language)
    return {
        "stdout": res["stdout"],
        "stderr": res["stderr"]
    }

@router.post("/session/{session_id}/run-tests")
def run_session_tests(session_id: str, data: TestRunRequest, db: Session = Depends(get_db)):
    from sqlalchemy import String
    session = db.query(models.InterviewSession).filter(
        (models.InterviewSession.session_token == session_id) |
        (models.InterviewSession.id.cast(String) == session_id)
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    if not session.test_cases_code:
        return {
            "stdout": "",
            "stderr": "No automated unit tests are configured for this coding challenge.",
            "passed": False
        }
        
    if session.selected_language.lower() == "sql":
        import sqlite3
        conn = sqlite3.connect(":memory:")
        cursor = conn.cursor()
        
        test_cases = session.test_cases_code or ""
        seed_part = test_cases
        expected_query = ""
        
        if "-- EXPECTED_QUERY --" in test_cases:
            parts = test_cases.split("-- EXPECTED_QUERY --")
            seed_part = parts[0]
            expected_query = parts[1].strip()
            
        seed_part = seed_part.replace("-- SEED --", "").strip()
        
        try:
            # 1. Execute seeding commands
            for stmt in seed_part.split(";"):
                stmt = stmt.strip()
                if stmt:
                    cursor.execute(stmt)
            conn.commit()
            
            # 2. Run candidate query
            candidate_query = data.code.strip()
            cursor.execute(candidate_query)
            cand_rows = cursor.fetchall()
            cand_cols = [desc[0] for desc in cursor.description] if cursor.description else []
            
            # 3. Run validation query
            passed = True
            mismatch_err = ""
            if expected_query:
                cursor2 = conn.cursor()
                cursor2.execute(expected_query)
                val_rows = cursor2.fetchall()
                
                if cand_rows != val_rows:
                    passed = False
                    mismatch_err = f"Output rows do not match expected answer.\nExpected:\n{val_rows}\n\nGot:\n{cand_rows}"
            
            return {
                "stdout": "Query executed successfully.",
                "stderr": mismatch_err,
                "passed": passed,
                "sql_result": {
                    "columns": cand_cols,
                    "rows": [[str(cell) for cell in row] for row in cand_rows]
                }
            }
        except Exception as sql_err:
            return {
                "stdout": "",
                "stderr": f"SQL Execution Error: {str(sql_err)}",
                "passed": False
            }
        finally:
            conn.close()

    combined_code = data.code + "\n\n" + session.test_cases_code
    res = execute_in_sandbox(combined_code, session.selected_language)
    
    # If the return code is 0, the script completed its assertions successfully
    passed = (res.get("exit_code") == 0)
    
    return {
        "stdout": res["stdout"],
        "stderr": res["stderr"],
        "passed": passed
    }

class LanguageSwitchRequest(BaseModel):
    language: str
    code: str

@router.post("/session/{session_id}/change-language")
def change_session_language(session_id: str, data: LanguageSwitchRequest, db: Session = Depends(get_db)):
    from sqlalchemy import String
    session = db.query(models.InterviewSession).filter(
        (models.InterviewSession.session_token == session_id) |
        (models.InterviewSession.id.cast(String) == session_id)
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    target_lang = data.language.lower()

    # 1. Fetch the original first problem message
    first_message = db.query(models.InterviewMessage).filter(
        models.InterviewMessage.session_id == session.id,
        models.InterviewMessage.sender == "ai"
    ).order_by(models.InterviewMessage.timestamp.asc()).first()

    # Build the multi-question list to translate. Prefer the session's stored questions_json
    # (the full 3-question set); fall back to a single question synthesized from session fields.
    try:
        q_list = json.loads(session.questions_json) if session.questions_json else []
    except Exception:
        q_list = []
    if not q_list:
        q_list = [{
            "title": session.job.title,
            "problem_statement": (first_message.message_text if first_message else ""),
            "starter_code": session.latest_code or "",
            "test_cases_code": session.test_cases_code or "",
            "submitted_code": data.code or session.latest_code or ""
        }]

    active_idx = session.current_question_index or 0
    if active_idx >= len(q_list):
        active_idx = 0
    # The candidate's current editor code belongs to the active question — translate it too.
    q_list[active_idx]["submitted_code"] = data.code

    try:
        # 2. Call Gemini translation service over the whole question set
        translated = translate_problem_to_language(
            job_title=session.job.title,
            job_description=session.job.description,
            original_questions_json=json.dumps(q_list),
            target_language=target_lang,
            company_id=session.company_id
        )

        # 3. Map translated questions back into the stored question set
        new_q_list = []
        for original, tq in zip(q_list, translated.questions):
            new_q_list.append({
                "title": tq.translated_title,
                "problem_statement": tq.translated_problem_statement,
                "starter_code": tq.translated_starter_code,
                "test_cases_code": tq.translated_test_cases_code,
                "submitted_code": tq.translated_current_code
            })
        # If the model returned fewer questions than expected, keep the originals untouched.
        if len(new_q_list) != len(q_list):
            raise ValueError("Translation returned a mismatched number of questions")

        active_q = new_q_list[active_idx]

        # 4. Update session states for the active question
        session.selected_language = target_lang
        session.questions_json = json.dumps(new_q_list)
        session.test_cases_code = active_q["test_cases_code"]
        session.latest_code = active_q["submitted_code"]

        # 5. Update the first message description so it's persistent
        if first_message:
            first_message.message_text = f"Welcome, {session.candidate.name}! I am your AI interviewer today. Let's start with a live coding question.\n\n### Problem: {active_q['title']}\n\n{active_q['problem_statement']}"
            
        # 5. Insert translation system notification message
        switch_notification = models.InterviewMessage(
            session_id=session.id,
            sender="ai",
            message_text=f"🔄 Notice: Candidate changed session language to {target_lang.upper()}. The coding problem statement, starter code template, and unit tests have been translated.",
            timestamp=datetime.datetime.utcnow()
        )
        db.add(switch_notification)
        db.commit()
        
        # 6. Retrieve all updated messages to return to frontend
        updated_messages = db.query(models.InterviewMessage).filter(
            models.InterviewMessage.session_id == session.id
        ).order_by(models.InterviewMessage.timestamp.asc()).all()
        
        return {
            "selected_language": session.selected_language,
            "latest_code": session.latest_code,
            "messages": [
                {
                    "sender": msg.sender,
                    "message_text": msg.message_text,
                    "timestamp": msg.timestamp.isoformat()
                } for msg in updated_messages
            ]
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"AI Language translation failed: {str(e)}"
        )

class QuestionSwitchRequest(BaseModel):
    code: str
    target_index: int

@router.post("/session/{session_id}/switch-question")
def switch_session_question(session_id: str, data: QuestionSwitchRequest, db: Session = Depends(get_db)):
    from sqlalchemy import String
    session = db.query(models.InterviewSession).filter(
        (models.InterviewSession.session_token == session_id) |
        (models.InterviewSession.id.cast(String) == session_id)
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
        
    if not session.questions_json:
        raise HTTPException(status_code=400, detail="This session does not support multiple questions")
        
    try:
        q_list = json.loads(session.questions_json)
        
        # Validate indices
        if data.target_index < 0 or data.target_index >= len(q_list):
            raise HTTPException(status_code=400, detail="Invalid target question index")
            
        # 1. Save candidate's code to current index
        q_list[session.current_question_index]["submitted_code"] = data.code
        
        # 2. Update active index
        session.current_question_index = data.target_index
        
        # 3. Retrieve code and test cases for target index
        target_q = q_list[data.target_index]
        session.latest_code = target_q.get("submitted_code") or target_q.get("starter_code")
        session.test_cases_code = target_q.get("test_cases_code")
        
        # 4. Add system switch message with the problem description
        switch_msg = models.InterviewMessage(
            session_id=session.id,
            sender="ai",
            message_text=f"📋 Now viewing Question {data.target_index + 1}: **{target_q.get('title')}**\n\n### Problem Description\n\n{target_q.get('problem_statement')}",
            timestamp=datetime.datetime.utcnow()
        )
        db.add(switch_msg)
        
        # 5. Commit changes
        session.questions_json = json.dumps(q_list)
        db.commit()
        
        # 6. Retrieve all updated messages to return to frontend
        updated_messages = db.query(models.InterviewMessage).filter(
            models.InterviewMessage.session_id == session.id
        ).order_by(models.InterviewMessage.timestamp.asc()).all()
        
        return {
            "current_question_index": session.current_question_index,
            "latest_code": session.latest_code,
            "questions_json": session.questions_json,
            "messages": [
                {
                    "sender": msg.sender,
                    "message_text": msg.message_text,
                    "timestamp": msg.timestamp.isoformat()
                } for msg in updated_messages
            ]
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to switch question: {str(e)}"
        )

@router.websocket("/ws/{session_id}/voice")
async def websocket_voice_endpoint(websocket: WebSocket, session_id: str):
    # 1. Accept browser socket
    await websocket.accept()
    
    # 2. Retrieve session and API Key
    from app.db.session import SessionLocal
    from app.core.gemini import get_gemini_api_key
    
    db = SessionLocal()
    session = None
    try:
        sess_id_int = int(session_id)
        session = db.query(models.InterviewSession).filter(models.InterviewSession.id == sess_id_int).first()
    except ValueError:
        pass
    if not session:
        session = db.query(models.InterviewSession).filter(models.InterviewSession.session_token == session_id).first()
        
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        db.close()
        return
        
    api_key = get_gemini_api_key(session.company_id)
    if not api_key:
        await websocket.send_json({"type": "error", "message": "Gemini API key is not configured"})
        await websocket.close()
        db.close()
        return
        
    # Get persona instruction
    from app.services.interview_conductor import PERSONA_PROMPTS
    persona_name = session.job.interviewer_persona or "standard"
    persona_prompt = PERSONA_PROMPTS.get(persona_name, "")
    
    system_instruction = f"""
    You are an expert technical interviewer in a live SPOKEN voice session.
    {persona_prompt}
    
    Candidate Name: {session.candidate.name}
    Target Role: {session.job.title}
    Job Requirements: {session.job.description}
    
    Keep your responses brief, conversational, and direct. Avoid reading out large chunks of code or markdown structures.
    If they ask you questions about the coding problem, guide them verbally.
    """
    
    import websockets
    import asyncio
    import base64
    
    gemini_uri = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={api_key}"
    
    try:
        async with websockets.connect(gemini_uri) as gemini_ws:
            # Send setup message
            setup_message = {
                "setup": {
                    "model": "models/gemini-2.0-flash-exp",
                    "generation_config": {
                        "response_modalities": ["AUDIO"],
                        "speech_config": {
                            "voice_config": {
                                "prebuilt_voice_config": {
                                    "voice_name": "Aoede"
                                }
                            }
                        }
                    },
                    "system_instruction": {
                        "parts": [
                            {
                                "text": system_instruction
                            }
                        ]
                    }
                }
            }
            await gemini_ws.send(json.dumps(setup_message))
            
            # Keep track of active speech turn to log transcript text to DB
            current_turn_text = []
            
            async def receive_from_browser():
                nonlocal current_turn_text
                try:
                    while True:
                        # Capture client frames (can be binary audio or JSON text)
                        message = await websocket.receive()
                        
                        if "bytes" in message:
                            # Incoming raw PCM audio chunk
                            audio_bytes = message["bytes"]
                            base64_audio = base64.b64encode(audio_bytes).decode("utf-8")
                            
                            media_chunk = {
                                "realtime_input": {
                                    "media_chunks": [
                                        {
                                            "mime_type": "audio/pcm",
                                            "data": base64_audio
                                        }
                                    ]
                                }
                            }
                            await gemini_ws.send(json.dumps(media_chunk))
                            
                        elif "text" in message:
                            # Incoming JSON text control message
                            text_data = message["text"]
                            event = json.loads(text_data)
                            
                            if event.get("type") == "candidate_message":
                                text_msg = event.get("message", "")
                                # Log candidate message to database transcript
                                cand_db_msg = models.InterviewMessage(
                                    session_id=session.id,
                                    sender="candidate",
                                    message_text=text_msg,
                                    code_state=session.latest_code,
                                    timestamp=datetime.datetime.utcnow()
                                )
                                db.add(cand_db_msg)
                                db.commit()
                                
                                # Send confirmation event back to browser to append message locally
                                await websocket.send_json({
                                    "type": "message_logged",
                                    "sender": "candidate",
                                    "message_text": text_msg,
                                    "timestamp": cand_db_msg.timestamp.isoformat()
                                })
                                
                                # Send text prompt directly to Gemini Live
                                gemini_text_msg = {
                                    "realtime_input": {
                                        "parts": [
                                            {
                                                "text": text_msg
                                            }
                                        ]
                                    }
                                }
                                await gemini_ws.send(json.dumps(gemini_text_msg))
                                
                            elif event.get("type") == "code_update":
                                code_txt = event.get("code", "")
                                context_msg = {
                                    "realtime_input": {
                                        "parts": [
                                            {
                                                "text": f"[SYSTEM NOTIFICATION: The candidate's current editor code is:\n\n```\n{code_txt}\n```\n\nOnly comment on this if they ask you a question about it or are making a major mistake. Do not repeat this code back word-for-word.]"
                                            }
                                        ]
                                    }
                                }
                                await gemini_ws.send(json.dumps(context_msg))
                except Exception as e:
                    print(f"Browser receive loop error: {e}")
                    
            async def receive_from_gemini():
                nonlocal current_turn_text
                try:
                    async for raw_msg in gemini_ws:
                        msg = json.loads(raw_msg)
                        
                        # Parse server content (turn parts)
                        server_content = msg.get("server_content", {})
                        model_turn = server_content.get("model_turn", {})
                        parts = model_turn.get("parts", [])
                        
                        for part in parts:
                            # 1. Forward raw audio bytes to browser
                            if "inline_data" in part and part["inline_data"].get("mime_type", "").startswith("audio/pcm"):
                                b64_audio = part["inline_data"]["data"]
                                audio_binary = base64.b64decode(b64_audio)
                                await websocket.send_bytes(audio_binary)
                                
                            # 2. Accumulate text transcripts and broadcast to browser
                            if "text" in part:
                                text_chunk = part["text"]
                                current_turn_text.append(text_chunk)
                                await websocket.send_json({
                                    "type": "transcript",
                                    "text": text_chunk
                                })
                                
                        # 3. Check turn completion to write AI message log
                        if server_content.get("turn_complete") == True:
                            complete_text = "".join(current_turn_text)
                            if complete_text.strip():
                                # Save AI spoken message to DB transcript logs
                                ai_db_msg = models.InterviewMessage(
                                    session_id=session.id,
                                    sender="ai",
                                    message_text=complete_text,
                                    timestamp=datetime.datetime.utcnow()
                                )
                                db.add(ai_db_msg)
                                db.commit()
                                
                                # Send log event to browser to append message to chat
                                await websocket.send_json({
                                    "type": "message_logged",
                                    "sender": "ai",
                                    "message_text": complete_text,
                                    "timestamp": ai_db_msg.timestamp.isoformat()
                                })
                            current_turn_text = []
                except Exception as e:
                    print(f"Gemini receive loop error: {e}")
                    
            # Run both loops concurrently
            await asyncio.gather(
                receive_from_browser(),
                receive_from_gemini()
            )
            
    except Exception as e:
        print(f"Voice WebSocket proxy error: {e}")
        await websocket.close()
    finally:
        db.close()

