from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from app.core.gemini import get_system_settings, generate_content

class GradingResult(BaseModel):
    overall_score: int = Field(description="Integrative performance score from 1 (poor) to 100 (flawless)")
    code_quality_feedback: str = Field(description="Evaluation of styling, readability, modularity, and structure")
    communication_feedback: str = Field(description="Evaluation of candidate's verbal/textual explanations, hint absorption, and clarity")
    technical_accuracy_feedback: str = Field(description="Evaluation of algorithmic correctness, complexity (big O), and edge case handling")
    detailed_report: str = Field(description="Comprehensive Markdown document summarizing candidate highlights, points of improvement, and optimal code solution suggestions")

def generate_session_feedback(
    job_title: str,
    job_description: str,
    messages: list,
    final_code: str,
    language: str,
    company_id: int = None
) -> GradingResult:
    """
    Grades the candidate's final performance by evaluating the entire chat history and code updates using Gemini.
    """
    
    # Format message history
    transcript_str = ""
    for msg in messages:
        sender_label = "Candidate" if msg.sender == "candidate" else "Interviewer"
        transcript_str += f"{sender_label}: {msg.message_text}\n"
        
    prompt = f"""
    You are a Senior Technical Lead evaluating a candidate's technical interview performance for the role '{job_title}'.
    
    Target Job Description:
    {job_description}
    
    Interview Language: {language}
    
    Final Code State:
    ```{language}
    {final_code}
    ```
    
    Complete Conversation Transcript:
    {transcript_str}
    
    Provide a comprehensive, objective, and constructive review of the candidate's session.
    Ensure you evaluate:
    1. Code Quality (modularity, naming, clean practices).
    2. Communication (articulation of ideas, responding to hints, technical vocabulary).
    3. Technical Accuracy (correctness, performance, big O analysis, robustness to edge cases).
    
    Make the detailed_report a beautiful, structured Markdown document.
    """
    
    model_name, _, _ = get_system_settings(company_id=company_id)
    response = generate_content(company_id=company_id,
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GradingResult,
            temperature=0.2
        )
    )
    return response.parsed
