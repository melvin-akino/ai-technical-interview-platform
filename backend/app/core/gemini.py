import os
import json
import datetime
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from app.core.config import settings
from app.core.crypto import decrypt
from app.db.session import SessionLocal
from app.db import models

# The fallback used whenever no SystemSetting row overrides it (there is currently no admin
# UI that writes one, so this is the model actually in effect). Use the "-latest" alias
# rather than a dated version: "gemini-3.5-flash" was hardcoded here before and started
# returning persistent 503 UNAVAILABLE ("experiencing high demand") with no code change on
# our side — likely rotated out of general availability. The alias tracks whatever Gemini
# currently designates as its stable flash model, so this class of failure shouldn't recur.
DEFAULT_GEMINI_MODEL = "gemini-flash-latest"

def pydantic_to_gemini_schema(model_cls):
    """Convert a Pydantic model into a plain JSON-schema dict that google-genai 0.5.0 accepts.

    A Pydantic model that nests another model inside a list (e.g. `questions: list[Question]`)
    serializes to a schema using `$defs` + `$ref`, which this SDK version rejects with
    "Extra inputs are not permitted" when validating `types.Schema`. We resolve every `$ref`
    against `$defs`, inline it, and strip keys the SDK schema doesn't allow (`$defs`, `title`,
    `default`, `additionalProperties`). Pass the result as `response_schema` and parse the
    response text back into the model with `model_cls.model_validate_json(response.text)`.
    """
    raw = model_cls.model_json_schema()
    defs = raw.get("$defs", {})

    def resolve(node):
        if isinstance(node, dict):
            if "$ref" in node:
                ref_name = node["$ref"].split("/")[-1]
                return resolve(defs.get(ref_name, {}))
            return {
                k: resolve(v)
                for k, v in node.items()
                if k not in ("$defs", "title", "default", "additionalProperties")
            }
        if isinstance(node, list):
            return [resolve(x) for x in node]
        return node

    return resolve(raw)


def get_system_settings(company_id: int = None):
    db = SessionLocal()
    try:
        # Default fallbacks
        model = DEFAULT_GEMINI_MODEL
        temperature = 0.7
        prompt_modifier = ""
        
        # Load platform configuration if seeded
        sys_settings = db.query(models.SystemSetting).first()
        if sys_settings:
            model = sys_settings.api_model
            temperature = sys_settings.temperature
            prompt_modifier = sys_settings.system_prompt_modifier or ""
            
        # Override with Company-specific settings if company_id is provided
        if company_id:
            company = db.query(models.Company).filter(models.Company.id == company_id).first()
            if company:
                if company.temperature is not None:
                    temperature = float(company.temperature)
                if company.system_prompt_modifier:
                    prompt_modifier = company.system_prompt_modifier
                    
        return model, temperature, prompt_modifier
    except Exception:
        return DEFAULT_GEMINI_MODEL, 0.7, ""
    finally:
        db.close()

# ---------------------------------------------------------------------------
# Gemini key pool
#
# Every Gemini call goes through generate_content() below. It rotates across the active
# platform keys (least-recently-used) and, when a key is rate limited or rejected, cools it
# down and immediately retries on the next one. Previously a single 429 surfaced to the user
# as a hard 500 — which is exactly what happened during QA once the one key was exhausted.
# ---------------------------------------------------------------------------

QUOTA_COOLDOWN_SECONDS = 60      # base cooldown after a 429; grows with consecutive failures
MAX_COOLDOWN_SECONDS = 900


def _classify_error(exc) -> str:
    """Bucket a provider error so we know whether to rotate, disable, or give up."""
    msg = str(exc).upper()
    if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "QUOTA" in msg or "RATE LIMIT" in msg:
        return "quota"
    if any(t in msg for t in ("API_KEY_INVALID", "PERMISSION_DENIED", "UNAUTHENTICATED", "401", "403")):
        return "auth"
    return "other"


def _candidate_keys(db, company_id):
    """Keys to try, in order: the company's own key, then the platform pool (LRU), then the
    environment fallback. Returns (key_value, PlatformApiKey_row_or_None) tuples."""
    candidates = []

    if company_id:
        company = db.query(models.Company).filter(models.Company.id == company_id).first()
        if company and company.custom_api_key:
            candidates.append((decrypt(company.custom_api_key), None))

    now = datetime.datetime.utcnow()
    pool = db.query(models.PlatformApiKey).filter(
        models.PlatformApiKey.is_active == True,
        (models.PlatformApiKey.cooldown_until == None) | (models.PlatformApiKey.cooldown_until <= now)
    ).order_by(
        models.PlatformApiKey.last_used_at.asc().nullsfirst()  # least-recently-used first
    ).all()
    candidates.extend((decrypt(k.api_key), k) for k in pool)

    if settings.GEMINI_API_KEY:
        candidates.append((settings.GEMINI_API_KEY, None))

    # De-duplicate while preserving order (the env key is often also in the pool)
    seen, unique = set(), []
    for value, row in candidates:
        if value and value not in seen:
            seen.add(value)
            unique.append((value, row))
    return unique


def _record_success(db, row):
    if row is None:
        return
    row.last_used_at = datetime.datetime.utcnow()
    row.total_calls = (row.total_calls or 0) + 1
    row.failure_count = 0
    row.cooldown_until = None
    row.last_error = None
    db.commit()


def _record_failure(db, row, kind, exc):
    if row is None:
        return
    row.failure_count = (row.failure_count or 0) + 1
    row.last_used_at = datetime.datetime.utcnow()
    row.last_error = f"{kind}: {str(exc)[:400]}"
    if kind == "quota":
        # Exponential backoff per key so a persistently throttled key drops out of rotation.
        backoff = min(QUOTA_COOLDOWN_SECONDS * (2 ** (row.failure_count - 1)), MAX_COOLDOWN_SECONDS)
        row.cooldown_until = datetime.datetime.utcnow() + datetime.timedelta(seconds=backoff)
    elif kind == "auth":
        # A rejected key will not fix itself — take it out of rotation for a human to look at.
        row.is_active = False
    db.commit()


def generate_content(*, model, contents, config, company_id: int = None):
    """Single entry point for all Gemini generation, with key rotation and failover.

    Raises the last provider error only after every available key has been tried.
    """
    db = SessionLocal()
    try:
        candidates = _candidate_keys(db, company_id)
        if not candidates:
            raise RuntimeError("No Gemini API key is configured (no company key, no active platform key, no env key).")

        last_exc = None
        for api_key, row in candidates:
            try:
                client = genai.Client(api_key=api_key)
                response = client.models.generate_content(model=model, contents=contents, config=config)
                _record_success(db, row)
                return response
            except Exception as exc:
                kind = _classify_error(exc)
                last_exc = exc
                _record_failure(db, row, kind, exc)
                if kind == "other":
                    # Not a key problem (bad prompt, schema, network) — another key will not help.
                    raise
                # quota/auth: fall through and try the next key
        raise last_exc
    finally:
        db.close()


def get_gemini_api_key(company_id: int = None) -> str:
    """Raw API key string for callers that talk to Gemini directly rather than through the
    genai SDK (e.g. the Gemini Live voice WebSocket proxy, which builds its own URI)."""
    db = SessionLocal()
    custom_api_key = None
    try:
        if company_id:
            company = db.query(models.Company).filter(models.Company.id == company_id).first()
            if company and company.custom_api_key:
                custom_api_key = decrypt(company.custom_api_key)
        if not custom_api_key:
            plat_key = db.query(models.PlatformApiKey).filter(models.PlatformApiKey.is_active == True).first()
            if plat_key:
                custom_api_key = decrypt(plat_key.api_key)
    except Exception:
        pass
    finally:
        db.close()
    return custom_api_key or settings.GEMINI_API_KEY or ""

# Pydantic schemas for Gemini Structured Output
class ExtractedResumeInfo(BaseModel):
    name: str = Field(description="The full name of the candidate")
    email: str = Field(description="The email address of the candidate")
    skills: list[str] = Field(description="List of technical skills, programming languages, and tools")
    experience_summary: str = Field(description="A brief summary of candidate's professional experience and projects")
    suggested_role: str = Field(description="Estimated job title / level (e.g. Senior Backend Engineer, Junior Frontend Dev)")

class JobMatchResult(BaseModel):
    match_score: int = Field(description="Integer score from 0 to 100 indicating suitability for the job")
    matching_skills: list[str] = Field(description="Skills that match between the resume and the job description")
    missing_skills: list[str] = Field(description="Skills required by the job that are missing or weak in the resume")
    analysis: str = Field(description="Detailed textual explanation of the match, strengths, and weaknesses")

def analyze_resume_text(text: str, company_id: int = None) -> ExtractedResumeInfo:
    prompt = f"""
    You are an expert HR resume screening assistant.
    Analyze the following extracted resume text and extract the candidate details.
    
    Resume Text:
    {text}
    """
    
    model_name, _, _ = get_system_settings(company_id=company_id)
    response = generate_content(company_id=company_id,
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ExtractedResumeInfo,
            temperature=0.1
        ),
    )
    return response.parsed

def match_resume_to_job(
    resume_skills: str, 
    resume_summary: str, 
    job_title: str, 
    job_description: str,
    company_id: int = None
) -> JobMatchResult:
    prompt = f"""
    You are an expert technical recruiter matching a candidate's profile to a specific job opening.
    Evaluate the candidate's skills and experience summary against the job title and job description.
    
    Candidate Skills:
    {resume_skills}
    
    Candidate Experience:
    {resume_summary}
    
    Job Title:
    {job_title}
    
    Job Description:
    {job_description}
    """
    
    model_name, _, _ = get_system_settings(company_id=company_id)
    response = generate_content(company_id=company_id,
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=JobMatchResult,
            temperature=0.1
        ),
    )
    return response.parsed


# --- Batch Processing Schemas & Services ---

batch_parse_schema = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "index": {"type": "INTEGER", "description": "The index of the resume text (0-based)"},
            "name": {"type": "STRING", "description": "The full name of the candidate"},
            "email": {"type": "STRING", "description": "The email address of the candidate"},
            "skills": {
                "type": "ARRAY", 
                "items": {"type": "STRING"},
                "description": "List of technical skills, programming languages, and tools"
            },
            "experience_summary": {"type": "STRING", "description": "A brief summary of candidate's professional experience and projects"},
            "suggested_role": {"type": "STRING", "description": "Estimated job title / level"}
        },
        "required": ["index", "name", "email", "skills", "experience_summary", "suggested_role"]
    }
}

batch_match_schema = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "email": {"type": "STRING", "description": "The email address of the candidate to identify them"},
            "match_score": {"type": "INTEGER", "description": "Integer score from 0 to 100 indicating suitability for the job"},
            "matching_skills": {
                "type": "ARRAY",
                "items": {"type": "STRING"},
                "description": "Skills that match between the candidate and the job"
            },
            "missing_skills": {
                "type": "ARRAY",
                "items": {"type": "STRING"},
                "description": "Skills required by the job that are missing or weak in the candidate"
            },
            "analysis": {"type": "STRING", "description": "Detailed textual explanation of the match"}
        },
        "required": ["email", "match_score", "matching_skills", "missing_skills", "analysis"]
    }
}


def batch_parse_resumes(raw_texts: list[str], company_id: int = None) -> list[dict]:
    
    resumes_prompt = ""
    for idx, text in enumerate(raw_texts):
        resumes_prompt += f"\n--- RESUME INDEX {idx} ---\n{text}\n"
        
    prompt = f"""
    You are an expert HR resume screening assistant.
    Analyze the following list of resumes, each marked with an index header.
    Extract candidate details for each resume and return them in a structured list mapping back to their original index.
    
    Resumes:
    {resumes_prompt}
    """
    
    model_name, _, _ = get_system_settings(company_id=company_id)
    response = generate_content(company_id=company_id,
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=batch_parse_schema,
            temperature=0.1
        ),
    )
    return json.loads(response.text)


def batch_match_resumes(
    candidates_data: list[dict],
    job_title: str,
    job_description: str,
    company_id: int = None
) -> list[dict]:
    
    profiles_prompt = ""
    for c in candidates_data:
        profiles_prompt += f"""
        - Email: {c['email']}
          Skills: {c['skills']}
          Experience: {c['experience_summary']}
        """
        
    prompt = f"""
    You are an expert technical recruiter matching multiple candidates' profiles to a specific job opening in a single batch.
    Evaluate each candidate's profile against the job title and description.
    Return an overall fit rating score and analysis list mapped by candidate email.
    
    Job Title: {job_title}
    Job Description: {job_description}
    
    Candidates:
    {profiles_prompt}
    """
    
    model_name, _, _ = get_system_settings(company_id=company_id)
    response = generate_content(company_id=company_id,
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=batch_match_schema,
            temperature=0.1
        ),
    )
    return json.loads(response.text)
