import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean, Float
from sqlalchemy.orm import relationship
from app.db.session import Base

class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    license_user_limit = Column(Integer, default=5)
    subscription_tier = Column(String, default="standard")
    custom_api_key = Column(Text, nullable=True)
    temperature = Column(Float, default=0.7)
    system_prompt_modifier = Column(Text, nullable=True)
    webhook_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    users = relationship("User", back_populates="company", cascade="all, delete-orphan")
    jobs = relationship("JobPosting", back_populates="company", cascade="all, delete-orphan")
    candidates = relationship("Candidate", back_populates="company", cascade="all, delete-orphan")
    sessions = relationship("InterviewSession", back_populates="company", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="recruiter") # superadmin / company_admin / recruiter
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    company = relationship("Company", back_populates="users")


class PlatformApiKey(Base):
    """A pooled Gemini API key. Requests rotate across active keys (least-recently-used) and
    fail over to the next key when one is rate limited, so a single exhausted quota no longer
    takes the whole platform down."""
    __tablename__ = "platform_api_keys"

    id = Column(Integer, primary_key=True, index=True)
    api_key = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    label = Column(String, nullable=True)          # human-friendly name, e.g. "prod-key-1"
    last_used_at = Column(DateTime, nullable=True)  # drives least-recently-used rotation
    cooldown_until = Column(DateTime, nullable=True)  # set on 429; key is skipped until then
    failure_count = Column(Integer, default=0)     # consecutive failures; resets on success
    total_calls = Column(Integer, default=0)
    last_error = Column(Text, nullable=True)


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    resume_path = Column(String, nullable=True)  # original filename only
    extracted_skills = Column(Text, nullable=True)
    experience_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    company = relationship("Company", back_populates="candidates")
    sessions = relationship("InterviewSession", back_populates="candidate")


class JobPosting(Base):
    __tablename__ = "job_postings"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String, index=True)
    description = Column(Text)
    required_skills = Column(Text)
    interviewer_persona = Column(String, default="standard", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    company = relationship("Company", back_populates="jobs")
    sessions = relationship("InterviewSession", back_populates="job")
    exams = relationship("ExamTemplate", back_populates="job", cascade="all, delete-orphan")



import uuid

def generate_session_token():
    return uuid.uuid4().hex

class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_token = Column(String, unique=True, index=True, default=generate_session_token, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("candidates.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("job_postings.id"), nullable=False)
    status = Column(String, default="active")
    selected_language = Column(String, default="python")
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    latest_code = Column(Text, nullable=True)
    test_cases_code = Column(Text, nullable=True)
    questions_json = Column(Text, nullable=True)
    current_question_index = Column(Integer, default=0)
    focus_losses = Column(Integer, default=0)
    copy_pastes = Column(Integer, default=0)
    time_away_seconds = Column(Integer, default=0)

    # CV assessment captured at match time. Previously this was computed by Gemini, returned to
    # the browser once, and discarded — so recruiters had no record of why a candidate was
    # shortlisted. Persisted here (rather than storing the raw CV) so it can be reviewed and
    # downloaded later. Skill lists are stored as comma-separated strings.
    fit_score = Column(Integer, nullable=True)
    matching_skills = Column(Text, nullable=True)
    missing_skills = Column(Text, nullable=True)
    match_analysis = Column(Text, nullable=True)

    company = relationship("Company", back_populates="sessions")
    candidate = relationship("Candidate", back_populates="sessions")
    job = relationship("JobPosting", back_populates="sessions")
    messages = relationship("InterviewMessage", back_populates="session", cascade="all, delete-orphan")
    feedback = relationship("FeedbackReport", uselist=False, back_populates="session", cascade="all, delete-orphan")
    proctoring_events = relationship("ProctoringEvent", back_populates="session", cascade="all, delete-orphan")
    keystroke_logs = relationship("CodeKeystrokeLog", back_populates="session", cascade="all, delete-orphan")


class InterviewMessage(Base):
    __tablename__ = "interview_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("interview_sessions.id"), nullable=False)
    sender = Column(String, nullable=False)
    message_text = Column(Text, nullable=True)
    code_state = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("InterviewSession", back_populates="messages")


class FeedbackReport(Base):
    __tablename__ = "feedback_reports"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("interview_sessions.id"), unique=True, nullable=False)
    overall_score = Column(Integer, nullable=False)
    code_quality_feedback = Column(Text)
    communication_feedback = Column(Text)
    technical_accuracy_feedback = Column(Text)
    detailed_report = Column(Text)
    generated_at = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("InterviewSession", back_populates="feedback")


class ExamTemplate(Base):
    __tablename__ = "exam_templates"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("job_postings.id"), nullable=False)
    title = Column(String, index=True)
    problem_statement = Column(Text, nullable=False)
    starter_code = Column(Text, nullable=False)
    test_cases_code = Column(Text, nullable=True)
    questions_json = Column(Text, nullable=True)
    current_question_index = Column(Integer, default=0)
    difficulty = Column(String, default="medium")
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    job = relationship("JobPosting", back_populates="exams")


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    provider_name = Column(String, default="gemini")
    api_model = Column(String, default="gemini-3.5-flash")
    temperature = Column(Float, default=0.7)
    system_prompt_modifier = Column(Text, nullable=True)
    api_key = Column(String, nullable=True)


class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(String, default="error") # error, warning, info
    message = Column(Text, nullable=False)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class ProctoringEvent(Base):
    __tablename__ = "proctoring_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String, nullable=False)  # 'focus_loss' | 'copy_paste'
    seconds_elapsed = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("InterviewSession", back_populates="proctoring_events")

class CodeKeystrokeLog(Base):
    __tablename__ = "code_keystroke_logs"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False)
    question_index = Column(Integer, default=0, nullable=False)
    code_state = Column(Text, nullable=False)
    seconds_elapsed = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("InterviewSession", back_populates="keystroke_logs")
