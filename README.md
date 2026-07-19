# AI Technical Interview Platform

A fully containerized, AI-powered Technical Interview Platform featuring a live sandbox code editor, real-time AI interviewing, voice conversation integration, resume matching, and detailed feedback scorecard generation.

---

## Features

1. **AI Resume Matching**: Upload a PDF resume and match it against target job postings. Gemini extracts key skills, experience details, and yields an alignment score.
2. **Synced Code Editor**: Monaco Editor (powering VS Code) with multi-language support (Python, JS, TS, Go, Java, C++) synced in real-time with the interview conductor.
3. **Interactive AI Interviewer**: A WebSocket-driven state machine orchestrates the coding challenge, evaluates updates, and guides you with subtle hints.
4. **Voice Input/Output**: Hands-free conversation powered by the zero-latency browser Web Speech API (transcribes your voice to chat, reads AI responses aloud).
5. **Grading Scorecard**: Dynamic score report evaluating Code Quality, Technical Accuracy, and Communication skills with big-O optimization tips.

---

## Quickstart (With Docker)

### 1. Prerequisites
- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and verify it is running.
- Retrieve a [Gemini API Key](https://aistudio.google.com/).

### 2. Configure Environment Variables
Edit the `.env` file in the root directory and replace the placeholder key:
```env
GEMINI_API_KEY=your_actual_gemini_api_key
```

### 3. Spin Up Containers
Open a terminal in the project root and run:
```bash
docker compose up --build
```

### 4. Access the Applications
- **Frontend App**: [http://localhost:5173](http://localhost:5173)
- **FastAPI Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Running Locally (Without Docker)

If you do not have Docker running, you can run the services directly on your system.

### 1. Run PostgreSQL Database
You will need a PostgreSQL database running locally. Update `backend/app/core/config.py` database settings or set `DATABASE_URL` in your shell environment:
```bash
export DATABASE_URL=postgresql://user:password@localhost:5432/db_name
```

### 2. Run Backend API
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 3. Run Frontend Client
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).
