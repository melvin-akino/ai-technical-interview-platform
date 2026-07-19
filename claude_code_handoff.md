# Project Handoff: AuraInterview - AI Technical Interview Platform

This document serves as a comprehensive handoff guide for **Claude Code** to continue development on the AuraInterview SaaS platform. It outlines the technology stack, system architecture, database schema, implemented features, and the immediate development roadmap.

---

## 1. Project Overview & Tech Stack

AuraInterview is a multi-tenant AI-powered technical interviewing platform. Recruiters upload candidate resumes, match them against job requirements, invite candidates to a secure live-proctored coding workspace (Monaco Editor + WebSocket LLM conductor), and receive automated grading reports evaluated by Gemini.

*   **Frontend**: React (Vite), Lucide Icons, Monaco Editor (dev server runs on port `5173`).
*   **Backend**: FastAPI, SQLAlchemy ORM, Uvicorn, Python-genai (Gemini SDK), WebSockets (runs on port `8000`).
*   **Database**: PostgreSQL (packaged inside docker container `ai_interview_db` on port `5432`).
*   **Deployment**: Docker Compose orchestration for local development and GCP Compute Engine VMs.

---

## 2. Key Completed Features

### 🎙️ Real-Time Gemini Multimodal Spoken Voice Call (NEW)
*   **Gemini Live API Integration**: Connects the candidate directly to the Gemini Multimodal Live API over WebSockets (`/ws/{session_id}/voice`) for an interactive, hands-free spoken interview.
*   **Voice Client Downsampler**: Downsamples candidate microphone input to **16kHz mono 16-bit PCM** (via Web Audio API) and pipes it to Gemini.
*   **Gap-free Queueing Player**: Decodes the 24kHz incoming voice chunks from Gemini and queues them to play consecutively with zero latency.
*   **Interviewer Persona Audio**: Voices the conversation matching the assigned job persona (Rigorous Tech Lead, Encouraging Mentor, or Standard) in real-time.
*   **Dynamic Chat Captions & Logs**: Captures live text transcript chunks from the voice stream, rendering them as streaming captions, and logs completed dialogue turns to the database.

### 💻 Live Coding & Proctoring Workspace
*   **Monaco Editor Integration**: Provides a full IDE experience supporting Python, JavaScript, TypeScript, Go, C++, C, and PHP.
*   **Real-Time Code Sync**: Candidate code edits are synchronized to the database via WebSockets (`/ws/{session_token}`).
*   **Tab Proctoring & Focus Tracking**: Monitors focus switches, copy-paste count, and active seconds away.
*   **Integrity Rating**: A real-time compliance score shown on the status bar (starts at 100%, drops by 15% per tab switch and 10% per clipboard action).
*   **Proctoring Consent & Permission Wizard**: Candidates undergo a camera/microphone checklist verification and sign a proctoring consent form before entering the workspace.

### 🧪 Automated Candidate Test Case Runner
*   **AI-Generated Assertions**: Gemini generates language-compliant assertions dynamically matching the selected language when generating the coding challenge.
*   **Run Unit Tests Button**: Fired directly from the Monaco Workspace, compiling and running code in a secure sandbox.
*   **Execution Drawer Status Banners**: Displays a green success banner (`All Unit Tests Passed Successfully!`) or red failure banner (`Unit Test Assertions Failed!`) showing the exact assertion that crashed.

### 🔄 Multi-Language Switcher & AI Translation
*   **Candidate Dropdown Switch**: Allows candidates to switch languages (e.g. from Python to JS) mid-exam.
*   **On-the-Fly AI Translation**: Calls Gemini to automatically convert the markdown problem description (adapting data types), translate the candidate's written code logic, and regenerate language-specific unit tests.

### 📋 Multi-Question Workspace & Progressive Exams
*   **AI progressive challenges**: Redefined Gemini problem generator to produce a list of exactly 3 progressive challenges (Warm-up, Core Algorithmic, and Code Refactoring/Optimization).
*   **Candidate Pagination controls**: Pagination navigation bar (`Q1`, `Q2`, `Q3`) in the Monaco editor header allows switching questions, auto-saving current code templates and switching test case suites.
*   **Scorecard Code Reviewer**: Allows recruiters to toggle through the final candidate submissions of all 3 questions inside the admin dashboard inspector.

### 📈 Visual Proctoring Activity Timeline
*   **Timestamped Event Logs**: Real-time WebSocket triggers log the exact elapsed seconds since the interview started into a `proctoring_events` database table on every tab blur or clipboard copy-paste action.
*   **Recruiter Chart**: Proctoring status cards inside the scorecard inspector display a visual horizontal timeline graph depicting colored glowing markers of the exact moments violations occurred.

### 🤖 AI Recruiter Personas
Recruiters can assign a persona to any Job Posting, modifying the Gemini system prompt:
*   **Encouraging Mentor (🟢)**: Warm, supportive, and provides step-by-step code guidance if the candidate gets stuck.
*   **Standard Interviewer (🟡)**: Balanced, objective professional. Asks candidates to find bugs and review edge cases.
*   **Rigorous Tech Lead (🔴)**: Direct, strict, and demanding. Focuses on Big-O notation, boundary validations (nulls, overflow, empty inputs), and challenges design decisions without giving code hints.

### 📊 Recruiting Analytics & Webhooks
*   **Insights Dashboard**: modern stat cards showing active sessions, fit score distributions (horizontal progress chart), and candidate skills parsed from CVs (tag cloud).
*   **ATS Webhook Integrations**: Company settings panel supports a webhook configuration URL. After grading, a background HTTP POST dispatches candidate info, fit scores, and proctoring stats to the external URL.

### 🔒 Hardened Subprocess Sandbox
*   **Privilege Downgrade**: Subprocesses run under a limited non-root user (`sandboxuser`).
*   **Environment Sanitization**: Sensitive environment variables and credentials are stripped from execution.
*   **Resource limits (rlimit)**: Enforced 3s CPU limit, 128MB virtual memory limit, and 20 max threads to prevent malicious/infinite loop attacks.

---

## 3. Codebase Architecture & File Map

*   **Database Models**: [`backend/app/db/models.py`](file:///c:/Projects/ai%20technical%20interview%20platform/backend/app/db/models.py)
    *   `Company`, `User`, `Candidate`, `JobPosting`, `InterviewSession`, `InterviewMessage`, `FeedbackReport`, `ExamTemplate`, `ProctoringEvent`.
*   **WebSockets & Sandbox Endpoint**: [`backend/app/api/interviews.py`](file:///c:/Projects/ai%20technical%20interview%20platform/backend/app/api/interviews.py)
    *   Handles connection lifecycle, sandbox code runs, automated unit test executions, question switches, proctoring sync events, and **bidirectional Gemini Live Voice WebSocket proxy**.
*   **LLM Prompt & Persona Generation**: [`backend/app/services/interview_conductor.py`](file:///c:/Projects/ai%20technical%20interview%20platform/backend/app/services/interview_conductor.py)
    *   Contains the Gemini client calls, initial problem generator (3-question progression), conductor replies, and on-the-fly language translation logic.
*   **Dashboard & Analytics API**: [`backend/app/api/admin.py`](file:///c:/Projects/ai%20technical%20interview%20platform/backend/app/api/admin.py)
    *   Houses the `/admin/analytics` and `/sessions/{session_id}` inspector detail fetch route.
*   **Resume Matching & Parsing**: [`backend/app/api/resumes.py`](file:///c:/Projects/ai%20technical%20interview%20platform/backend/app/api/resumes.py)
    *   Handles job/resume matching schemas and file parsers.
*   **Recruiter Console**: [`frontend/src/pages/AdminDashboard.jsx`](file:///c:/Projects/ai%20technical%20interview%20platform/frontend/src/pages/AdminDashboard.jsx)
    *   Stat metrics, visual charts, job modals, candidate invite trackers, inspector modal with proctoring activity timeline.
*   **Candidate Workspace Page**: [`frontend/src/pages/InterviewSession.jsx`](file:///c:/Projects/ai%20technical%20interview%20platform/frontend/src/pages/InterviewSession.jsx)
    *   Coordinates Monaco Code Editor, chat console, language switches, question pagination, and live audio session triggers.

---

## 4. Local Execution & Credentials

### Run Locally:
```bash
docker-compose down
docker-compose up --build -d
```

### Seed Credentials (Autoseeded on startup):
*   **Superadmin**: `admin@aurainterview.com` / `admin123`
*   **Recruiter**: `recruiter@aurainterview.com` / `recruiter123`

---

## 5. GCP Deployment Scripts

The following scripts automate VM provisioning, docker installations, firewall rules, and container build orchestration on a GCP Compute VM (Free Tier eligible):
*   **Bash script**: [`deploy_gcp.sh`](file:///c:/Projects/ai%20technical%20interview%20platform/deploy_gcp.sh) (runs on Linux, macOS, or GCP Cloud Shell).
*   **PowerShell script**: [`deploy_gcp.ps1`](file:///c:/Projects/ai%20technical%20interview%20platform/deploy_gcp.ps1) (runs on Windows).

---

## 6. Recommended Next Steps for Claude Code

1.  **Granular Editor Playback**: Record candidate keystrokes chronologically and add a playback scrubber in the recruiter dashboard to watch how the candidate coded their solution.
2.  **Multimodal Coding Guidance**: Teach Gemini Live to inspect the candidate's editor real-time and speak up naturally when it detects a bug or compilation issue.
