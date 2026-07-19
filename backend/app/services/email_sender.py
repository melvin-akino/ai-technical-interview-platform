import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "recruiter@aurainterview.com")

def send_interview_invite(email: str, candidate_name: str, job_title: str, session_id: int) -> bool:
    """
    Sends an email invitation containing the unique interview workspace link.
    If SMTP variables are not configured, it logs the email in a clean, visual console layout.
    """
    invite_url = f"http://localhost:5173/?session_id={session_id}"
    
    subject = f"Your Invitation to Interview: {job_title} at AuraInterview"
    
    html_content = f"""
    <html>
      <body style="font-family: sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px;">AuraInterview Invitation</h2>
        <p>Hello <strong>{candidate_name}</strong>,</p>
        <p>Thank you for submitting your resume. We reviewed your profile and would love to invite you to complete a live technical coding assessment for the <strong>{job_title}</strong> role.</p>
        <p>This assessment contains a live code editor synced with an interactive AI interviewer, supporting both text chat and real-time voice guidance.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="{invite_url}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Start Assessment Now</a>
        </div>
        
        <p style="font-size: 0.9em; color: #666;">Alternatively, copy and paste this link into your browser (Chrome or Edge recommended):<br/>
        <a href="{invite_url}" style="color: #6366f1;">{invite_url}</a></p>
        
        <p>Good luck!</p>
        <p>Best regards,<br/>Recruitment Team</p>
      </body>
    </html>
    """
    
    text_content = f"""
    Hello {candidate_name},
    
    We would love to invite you to complete a live technical coding assessment for the {job_title} role.
    
    Start your assessment here: {invite_url}
    
    Good luck!
    
    Best regards,
    Recruitment Team
    """

    # Check if SMTP details are configured
    if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = SMTP_FROM
            msg["To"] = email
            
            msg.attach(MIMEText(text_content, "plain"))
            msg.attach(MIMEText(html_content, "html"))
            
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_FROM, email, msg.as_string())
            print(f"[SMTP] Invite email successfully sent to {email}")
            return True
        except Exception as e:
            print(f"[SMTP ERROR] Failed to send email via SMTP server: {str(e)}")
            # Fallback to console print below...
            
    # Mock Email Logger (Visual Terminal Output)
    print("\n" + "="*80)
    print("                      📧 RECRUITER OUTBOX (MOCK EMAIL)                      ")
    print("="*80)
    print(f" FROM:    {SMTP_FROM}")
    print(f" TO:      {email} ({candidate_name})")
    print(f" SUBJECT: {subject}")
    print("-"*80)
    print(f" ASSESSMENT LINK: {invite_url}")
    print("-"*80)
    print(" HTML BODY:")
    print(html_content.replace("    ", "").strip())
    print("="*80 + "\n")
    
    return True
