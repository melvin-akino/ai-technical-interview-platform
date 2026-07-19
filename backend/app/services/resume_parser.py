import io
from pypdf import PdfReader
from app.core.gemini import analyze_resume_text, ExtractedResumeInfo

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extracts raw text from PDF bytes locally.
    """
    pdf_file = io.BytesIO(file_bytes)
    reader = PdfReader(pdf_file)
    
    extracted_text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            extracted_text += page_text + "\n"
            
    if not extracted_text.strip():
        raise ValueError("Could not extract any text from the uploaded PDF. Make sure it contains readable text.")
        
    return extracted_text

def parse_pdf_resume(file_bytes: bytes, company_id: int = None) -> ExtractedResumeInfo:
    """
    Extracts text from PDF bytes and uses Gemini to structure candidate details.
    """
    extracted_text = extract_text_from_pdf(file_bytes)
    # Analyze the raw text using Gemini structured output
    structured_info = analyze_resume_text(extracted_text, company_id=company_id)
    return structured_info
