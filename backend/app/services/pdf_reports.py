"""PDF generation for recruiter-facing downloads (CV assessment + interview evaluation).

Both reports are rendered from data already stored on the interview session, so nothing
depends on retaining the candidate's original CV file.
"""
import io
import re
import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)

ACCENT = colors.HexColor("#6d5efc")
MUTED = colors.HexColor("#6b7280")


def _styles():
    ss = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=ss["Title"], fontSize=18, textColor=ACCENT, spaceAfter=2),
        "sub": ParagraphStyle("s", parent=ss["Normal"], fontSize=9, textColor=MUTED, spaceAfter=10),
        "h2": ParagraphStyle("h", parent=ss["Heading2"], fontSize=12, spaceBefore=12, spaceAfter=4),
        "body": ParagraphStyle("b", parent=ss["Normal"], fontSize=9.5, leading=14, alignment=TA_LEFT),
    }


def _clean(text):
    """Strip markdown emphasis/heading markers the LLM emits and escape XML for reportlab."""
    if not text:
        return "—"
    t = str(text)
    t = re.sub(r"^#{1,6}\s*", "", t, flags=re.MULTILINE)   # headings
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)                  # bold
    t = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"\1", t)  # italics
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return t.replace("\n", "<br/>")


def _meta_table(rows):
    t = Table([[k, v] for k, v in rows], colWidths=[1.5 * inch, 5.0 * inch])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
    ]))
    return t


def _build(title, subtitle, flowables):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=LETTER,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        title=title,
    )
    st = _styles()
    story = [
        Paragraph("AuraInterview", st["title"]),
        Paragraph(subtitle, st["sub"]),
        HRFlowable(width="100%", color=ACCENT, thickness=1.2, spaceAfter=10),
    ] + flowables
    story += [
        Spacer(1, 18),
        HRFlowable(width="100%", color=colors.HexColor("#e5e7eb"), thickness=0.6, spaceAfter=6),
        Paragraph(
            f"Generated {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · AuraInterview",
            st["sub"],
        ),
    ]
    doc.build(story)
    buf.seek(0)
    return buf.getvalue()


def build_cv_assessment_pdf(session):
    """CV assessment: parsed profile + AI fit analysis captured at match time."""
    st = _styles()
    cand, job = session.candidate, session.job
    score = session.fit_score if session.fit_score is not None else "—"

    story = [
        Paragraph("CV Assessment", st["h2"]),
        _meta_table([
            ("Candidate", _clean(cand.name)),
            ("Email", _clean(cand.email)),
            ("Position", _clean(job.title)),
            ("CV File", _clean(cand.resume_path)),
            ("Fit Score", f"<b>{score}%</b>" if score != "—" else "—"),
        ]),
        Paragraph("Matching Skills", st["h2"]),
        Paragraph(_clean(session.matching_skills), st["body"]),
        Paragraph("Missing / Desired Skills", st["h2"]),
        Paragraph(_clean(session.missing_skills), st["body"]),
        Paragraph("AI Analysis", st["h2"]),
        Paragraph(_clean(session.match_analysis), st["body"]),
        Paragraph("Experience Summary (parsed from CV)", st["h2"]),
        Paragraph(_clean(cand.experience_summary), st["body"]),
        Paragraph("Extracted Skills (parsed from CV)", st["h2"]),
        Paragraph(_clean(cand.extracted_skills), st["body"]),
    ]
    return _build("CV Assessment", f"CV Assessment — {cand.name} · {job.title}", story)


def build_evaluation_pdf(session, feedback):
    """Interview evaluation: AI grading, proctoring integrity, and final code submissions."""
    st = _styles()
    cand, job = session.candidate, session.job

    story = [
        Paragraph("Interview Evaluation", st["h2"]),
        _meta_table([
            ("Candidate", _clean(cand.name)),
            ("Email", _clean(cand.email)),
            ("Position", _clean(job.title)),
            ("Language", _clean((session.selected_language or "").upper())),
            ("Status", _clean((session.status or "").upper())),
            ("Overall Score", f"<b>{feedback.overall_score}%</b>"),
        ]),
        Paragraph("Code Quality", st["h2"]),
        Paragraph(_clean(feedback.code_quality_feedback), st["body"]),
        Paragraph("Communication & Collaboration", st["h2"]),
        Paragraph(_clean(feedback.communication_feedback), st["body"]),
        Paragraph("Technical Accuracy & Problem Solving", st["h2"]),
        Paragraph(_clean(feedback.technical_accuracy_feedback), st["body"]),
        Paragraph("Proctoring Integrity", st["h2"]),
        _meta_table([
            ("Focus Losses", str(session.focus_losses or 0)),
            ("Clipboard Actions", str(session.copy_pastes or 0)),
            ("Time Away", f"{session.time_away_seconds or 0}s"),
        ]),
        Paragraph("Detailed Report", st["h2"]),
        Paragraph(_clean(feedback.detailed_report), st["body"]),
    ]

    # Final code submission per question
    if session.questions_json:
        try:
            import json
            questions = json.loads(session.questions_json)
            code_style = ParagraphStyle(
                "code", parent=st["body"], fontName="Courier", fontSize=7.5, leading=9.5,
                backColor=colors.HexColor("#f6f7f9"), borderPadding=5,
            )
            story.append(Paragraph("Final Code Submissions", st["h2"]))
            for i, q in enumerate(questions):
                story.append(Paragraph(
                    f"<b>Q{i + 1}. {_clean(q.get('title') or '')}</b>", st["body"]))
                code = q.get("submitted_code") or q.get("starter_code") or ""
                story.append(Paragraph(_clean(code) or "—", code_style))
                story.append(Spacer(1, 6))
        except Exception:
            pass

    return _build("Interview Evaluation", f"Interview Evaluation — {cand.name} · {job.title}", story)
