import os
import json
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from app.core.config import settings
from app.db.session import SessionLocal
from app.db import models

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
        model = "gemini-3.5-flash"
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
        return "gemini-3.5-flash", 0.7, ""
    finally:
        db.close()

def get_gemini_client(company_id: int = None):
    db = SessionLocal()
    custom_api_key = None
    try:
        # 1. Resolve Company custom API Key override
        if company_id:
            company = db.query(models.Company).filter(models.Company.id == company_id).first()
            if company and company.custom_api_key:
                custom_api_key = company.custom_api_key
                
        # 2. Check Platform-level active keys
        if not custom_api_key:
            plat_key = db.query(models.PlatformApiKey).filter(models.PlatformApiKey.is_active == True).first()
            if plat_key:
                custom_api_key = plat_key.api_key
    except Exception:
        pass
    finally:
        db.close()
        
    api_key_to_use = custom_api_key or settings.GEMINI_API_KEY or None
    return genai.Client(api_key=api_key_to_use)

def get_gemini_api_key(company_id: int = None) -> str:
    db = SessionLocal()
    custom_api_key = None
    try:
        if company_id:
            company = db.query(models.Company).filter(models.Company.id == company_id).first()
            if company and company.custom_api_key:
                custom_api_key = company.custom_api_key
        if not custom_api_key:
            plat_key = db.query(models.PlatformApiKey).filter(models.PlatformApiKey.is_active == True).first()
            if plat_key:
                custom_api_key = plat_key.api_key
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
    client = get_gemini_client(company_id=company_id)
    prompt = f"""
    You are an expert HR resume screening assistant.
    Analyze the following extracted resume text and extract the candidate details.
    
    Resume Text:
    {text}
    """
    
    model_name, _, _ = get_system_settings(company_id=company_id)
    response = client.models.generate_content(
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
    client = get_gemini_client(company_id=company_id)
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
    response = client.models.generate_content(
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
    client = get_gemini_client(company_id=company_id)
    
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
    response = client.models.generate_content(
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
    client = get_gemini_client(company_id=company_id)
    
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
    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=batch_match_schema,
            temperature=0.1
        ),
    )
    return json.loads(response.text)
