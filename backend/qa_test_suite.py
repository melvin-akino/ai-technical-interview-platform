"""
QA endpoint test suite for AuraInterview.

Exercises every REST endpoint across auth, resumes, admin, superadmin, interviews,
and feedback routers against a running backend (default: http://localhost:8000).

Run inside the backend container:
    docker exec ai_interview_backend_prod python3 /app/qa_test_suite.py

Creates namespaced fixtures (QATEST_*) and cleans them up at the end. Gemini-backed
endpoints (ai-suggest, change-language, grade) are exercised too; they need a valid
GEMINI_API_KEY in the environment.
"""
import os
import sys
import json
import requests

BASE = os.environ.get("QA_BASE", "http://localhost:8000/api/v1")

# Credentials come from the environment so no secrets live in source control.
# Set QA_RECRUITER_EMAIL/QA_RECRUITER_PASSWORD and QA_SUPERADMIN_EMAIL/QA_SUPERADMIN_PASSWORD
# before running (see the QA runbook), e.g.:
#   QA_RECRUITER_PASSWORD=... QA_SUPERADMIN_PASSWORD=... python3 qa_test_suite.py
RECRUITER = (os.environ.get("QA_RECRUITER_EMAIL", "recruiter@aurainterview.com"),
             os.environ.get("QA_RECRUITER_PASSWORD", ""))
SUPERADMIN = (os.environ.get("QA_SUPERADMIN_EMAIL", "akino.melvin@gmail.com"),
              os.environ.get("QA_SUPERADMIN_PASSWORD", ""))

results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    mark = "PASS" if ok else "FAIL"
    line = f"[{mark}] {name}"
    if detail:
        line += f"  --  {detail}"
    print(line, flush=True)


def req(method, path, token=None, expect=None, **kw):
    """Make a request; if `expect` (status or set of statuses) given, returns (ok, resp)."""
    headers = kw.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = BASE + path
    r = requests.request(method, url, headers=headers, timeout=120, **kw)
    if expect is not None:
        allowed = expect if isinstance(expect, (set, list, tuple)) else {expect}
        return (r.status_code in allowed), r
    return True, r


def purge_test_data():
    """Remove any leftover QATEST_* fixtures from a prior interrupted run so the suite is
    fully idempotent (job/company names and candidate email carry unique constraints)."""
    from app.db.session import SessionLocal
    from app.db import models
    db = SessionLocal()
    try:
        for cand in db.query(models.Candidate).filter(models.Candidate.email == "qatest.candidate@example.com").all():
            for s in db.query(models.InterviewSession).filter(models.InterviewSession.candidate_id == cand.id).all():
                db.query(models.InterviewMessage).filter(models.InterviewMessage.session_id == s.id).delete()
                db.query(models.ProctoringEvent).filter(models.ProctoringEvent.session_id == s.id).delete()
                db.query(models.FeedbackReport).filter(models.FeedbackReport.session_id == s.id).delete()
                db.delete(s)
            db.flush()
            db.delete(cand)
        for job in db.query(models.JobPosting).filter(models.JobPosting.title.like("QATEST%")).all():
            db.query(models.ExamTemplate).filter(models.ExamTemplate.job_id == job.id).delete()
            db.delete(job)
        for comp in db.query(models.Company).filter(models.Company.name.like("QATEST%")).all():
            db.query(models.User).filter(models.User.company_id == comp.id).delete()
            db.delete(comp)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def main():
    purge_test_data()
    # ---------- AUTH ----------
    ok, r = req("POST", "/auth/login", json={"email": RECRUITER[0], "password": RECRUITER[1]}, expect=200)
    token_r = r.json().get("access_token") if ok else None
    record("auth/login recruiter (200 + token)", ok and bool(token_r), f"status={r.status_code}")

    ok, r = req("POST", "/auth/login", json={"email": SUPERADMIN[0], "password": SUPERADMIN[1]}, expect=200)
    token_s = r.json().get("access_token") if ok else None
    record("auth/login superadmin (200 + token)", ok and bool(token_s), f"status={r.status_code}")

    ok, r = req("POST", "/auth/login", json={"email": RECRUITER[0], "password": "wrong"}, expect=400)
    record("auth/login wrong password (400)", ok, f"status={r.status_code}")

    ok, r = req("GET", "/auth/me", token=token_r, expect=200)
    record("auth/me with token (200)", ok and r.json().get("email") == RECRUITER[0], f"status={r.status_code}")

    ok, r = req("GET", "/auth/me", expect={401, 403})
    record("auth/me no token (401/403)", ok, f"status={r.status_code}")

    # ---------- RESUMES / JOBS / EXAMS ----------
    ok, r = req("GET", "/resumes/jobs", token=token_r, expect=200)
    jobs = r.json() if ok else []
    record("resumes/jobs GET (200 list)", ok and isinstance(jobs, list), f"count={len(jobs)}")

    ok, r = req("GET", "/resumes/jobs", expect={401, 403})
    record("resumes/jobs GET unauth (401/403)", ok, f"status={r.status_code}")

    ok, r = req("POST", "/resumes/jobs", token=token_r, expect=200,
                json={"title": "QATEST_Job", "description": "QA temp job for backend automation",
                      "required_skills": "Python, Testing", "interviewer_persona": "standard"})
    qa_job_id = r.json().get("id") if ok else None
    record("resumes/jobs POST create (200)", ok and bool(qa_job_id), f"job_id={qa_job_id}")

    if qa_job_id:
        ok, r = req("PUT", f"/resumes/jobs/{qa_job_id}", token=token_r, expect=200,
                    json={"title": "QATEST_Job_Updated", "description": "updated",
                          "required_skills": "Python", "interviewer_persona": "tech_lead"})
        record("resumes/jobs PUT update (200)", ok and r.json().get("title") == "QATEST_Job_Updated", f"status={r.status_code}")

        ok, r = req("GET", f"/resumes/jobs/{qa_job_id}/exams", token=token_r, expect=200)
        record("resumes/jobs/{id}/exams GET (200)", ok, f"status={r.status_code}")

        ok, r = req("POST", f"/resumes/jobs/{qa_job_id}/exams", token=token_r, expect=200,
                    json={"title": "QATEST_Exam", "problem_statement": "Add two numbers",
                          "starter_code": "def add(a,b):\n    return 0", "difficulty": "easy",
                          "test_cases_code": "assert add(1,2)==3",
                          "questions_json": json.dumps([{"title": "Add", "problem_statement": "add",
                                                         "starter_code": "def add(a,b):\n    return 0",
                                                         "test_cases_code": "assert add(1,2)==3",
                                                         "submitted_code": "def add(a,b):\n    return 0"}])})
        qa_exam_id = r.json().get("id") if ok else None
        record("resumes exam POST create (200)", ok and bool(qa_exam_id), f"exam_id={qa_exam_id}")

        if qa_exam_id:
            ok, r = req("POST", f"/resumes/jobs/{qa_job_id}/exams/{qa_exam_id}/activate", token=token_r, expect=200)
            record("resumes exam activate (200)", ok, f"status={r.status_code}")

            ok, r = req("PUT", f"/resumes/jobs/{qa_job_id}/exams/{qa_exam_id}", token=token_r, expect=200,
                        json={"title": "QATEST_Exam2", "problem_statement": "p", "starter_code": "x=1",
                              "difficulty": "medium"})
            record("resumes exam PUT update (200)", ok, f"status={r.status_code}")

        # Gemini-backed
        ok, r = req("POST", f"/resumes/jobs/{qa_job_id}/exams/ai-suggest", token=token_r, expect=200)
        record("resumes exam ai-suggest (200, Gemini)", ok,
               f"status={r.status_code} title={r.json().get('challenge_title','') if ok else r.text[:80]}")

    ok, r = req("GET", "/resumes/candidates", token=token_r, expect=200)
    record("resumes/candidates GET (200)", ok, f"count={len(r.json()) if ok else '-'}")

    ok, r = req("GET", "/resumes/test-bank", token=token_r, expect=200)
    record("resumes/test-bank GET (200)", ok, f"count={len(r.json()) if ok else '-'}")

    # ---------- ADMIN ----------
    ok, r = req("GET", "/admin/sessions", token=token_r, expect=200)
    record("admin/sessions GET (200)", ok, f"count={len(r.json()) if ok else '-'}")

    ok, r = req("GET", "/admin/analytics", token=token_r, expect=200)
    record("admin/analytics GET (200)", ok, f"status={r.status_code}")

    ok, r = req("GET", "/admin/settings", token=token_r, expect=200)
    settings_body = r.json() if ok else {}
    record("admin/settings GET (200)", ok, f"status={r.status_code}")

    ok, r = req("PUT", "/admin/settings", token=token_r, expect=200,
                json={"webhook_url": "https://example.com/hook", "temperature": 0.7,
                      "system_prompt_modifier": ""})
    record("admin/settings PUT (200)", ok, f"status={r.status_code}")

    # ---------- SUPERADMIN ----------
    ok, r = req("GET", "/superadmin/companies", token=token_s, expect=200)
    record("superadmin/companies GET as superadmin (200)", ok, f"count={len(r.json()) if ok else '-'}")

    ok, r = req("GET", "/superadmin/companies", token=token_r, expect=403)
    record("superadmin/companies GET as recruiter (403)", ok, f"status={r.status_code}")

    ok, r = req("GET", "/superadmin/stats", token=token_s, expect=200)
    record("superadmin/stats GET (200)", ok, f"status={r.status_code}")

    ok, r = req("GET", "/superadmin/logs", token=token_s, expect=200)
    record("superadmin/logs GET (200)", ok, f"status={r.status_code}")

    ok, r = req("GET", "/superadmin/api-keys", token=token_s, expect=200)
    record("superadmin/api-keys GET (200)", ok, f"status={r.status_code}")

    ok, r = req("POST", "/superadmin/companies", token=token_s, expect=200,
                json={"name": "QATEST_Company", "license_user_limit": 5, "subscription_tier": "standard"})
    qa_company_id = r.json().get("id") if ok else None
    record("superadmin/companies POST create (200)", ok and bool(qa_company_id), f"company_id={qa_company_id}")

    if qa_company_id:
        ok, r = req("GET", f"/superadmin/companies/{qa_company_id}/users", token=token_s, expect=200)
        record("superadmin company users GET (200)", ok, f"status={r.status_code}")

    # ---------- INTERVIEWS (needs a candidate fixture) ----------
    from app.db.session import SessionLocal
    from app.db import models
    db = SessionLocal()
    recruiter = db.query(models.User).filter(models.User.email == RECRUITER[0]).first()
    # Idempotent fixture: purge any leftover test candidate + its sessions from a prior run.
    for stale in db.query(models.Candidate).filter(models.Candidate.email == "qatest.candidate@example.com").all():
        for s in db.query(models.InterviewSession).filter(models.InterviewSession.candidate_id == stale.id).all():
            db.query(models.InterviewMessage).filter(models.InterviewMessage.session_id == s.id).delete()
            db.query(models.ProctoringEvent).filter(models.ProctoringEvent.session_id == s.id).delete()
            db.query(models.FeedbackReport).filter(models.FeedbackReport.session_id == s.id).delete()
            db.delete(s)
        db.flush()
        db.delete(stale)
    db.commit()
    cand = models.Candidate(company_id=recruiter.company_id, name="QATEST_Candidate",
                            email="qatest.candidate@example.com", extracted_skills="Python, JS")
    db.add(cand)
    db.commit()
    db.refresh(cand)
    qa_candidate_id = cand.id
    # use the first real seeded job (has an active exam) so session init has content
    real_job = db.query(models.JobPosting).filter(models.JobPosting.company_id == recruiter.company_id,
                                                  models.JobPosting.title.notlike("QATEST%")).first()
    real_job_id = real_job.id if real_job else qa_job_id
    db.close()

    ok, r = req("POST", "/interviews/session", expect=200,
                json={"candidate_id": qa_candidate_id, "job_id": real_job_id, "selected_language": "python"})
    sess = r.json() if ok else {}
    qa_session_token = sess.get("session_token")
    record("interviews/session POST create (200)", ok and bool(qa_session_token), f"token={str(qa_session_token)[:8]}")

    if qa_session_token:
        ok, r = req("GET", f"/interviews/session/{qa_session_token}", expect=200)
        sd = r.json() if ok else {}
        record("interviews/session GET (200)", ok, f"lang={sd.get('selected_language')}")

        ok, r = req("POST", "/interviews/run-code", expect=200,
                    json={"code": "print(2+2)", "language": "python"})
        record("interviews/run-code python (200, stdout=4)", ok and r.json().get("stdout", "").strip() == "4",
               f"stdout={r.json().get('stdout','').strip() if ok else '-'}")

        ok, r = req("POST", "/interviews/run-code", expect=200,
                    json={"code": "console.log(2+2)", "language": "javascript"})
        record("interviews/run-code javascript (200, stdout=4)", ok and "4" in r.json().get("stdout", ""),
               f"stdout={r.json().get('stdout','').strip() if ok else '-'}")

        ok, r = req("POST", "/interviews/run-code", expect=200,
                    json={"code": "package main\nimport \"fmt\"\nfunc main(){fmt.Println(2+2)}", "language": "go"})
        record("interviews/run-code go (200, stdout=4)", ok and "4" in r.json().get("stdout", ""),
               f"stdout={r.json().get('stdout','').strip() if ok else r.text[:60]}")

        # run-tests against the active seeded exam's own starter (may fail assertions = still a valid 200)
        ok, r = req("POST", f"/interviews/session/{qa_session_token}/run-tests", expect=200,
                    json={"code": sd.get("questions", [{}])[0].get("starter_code", "") if isinstance(sd.get("questions"), list) else "def f():pass"})
        record("interviews/run-tests (200 responds)", ok, f"passed={r.json().get('passed') if ok else '-'}")

        ok, r = req("POST", f"/interviews/session/{qa_session_token}/switch-question", expect={200, 400, 404},
                    json={"code": "x=1", "target_index": 1})
        record("interviews/switch-question (200)", r.status_code == 200, f"status={r.status_code}")

        # Gemini-backed language switch
        ok, r = req("POST", f"/interviews/session/{qa_session_token}/change-language", expect=200,
                    json={"language": "javascript", "code": "def f():\n    return 1"})
        record("interviews/change-language py->js (200, Gemini)", ok,
               f"status={r.status_code} lang={r.json().get('selected_language') if ok else r.text[:80]}")

        ok, r = req("POST", f"/interviews/session/{qa_session_token}/reset", expect={200, 201})
        record("interviews/session reset (200)", r.status_code in (200, 201), f"status={r.status_code}")

        ok, r = req("POST", f"/interviews/session/{qa_session_token}/email-invite", expect={200, 500, 502})
        record("interviews/email-invite (responds; 500 ok if SMTP unset)", r.status_code in (200, 500, 502),
               f"status={r.status_code} (info: SMTP may be unconfigured)")

        # ---------- FEEDBACK ----------
        ok, r = req("POST", f"/feedback/grade/{qa_session_token}", expect={200, 202})
        record("feedback/grade (200/202, Gemini)", r.status_code in (200, 202), f"status={r.status_code} body={r.text[:80]}")

        ok, r = req("GET", f"/feedback/{qa_session_token}", expect={200, 404})
        record("feedback GET (200/404)", r.status_code in (200, 404), f"status={r.status_code}")

    # ---------- CLEANUP ----------
    db = SessionLocal()
    try:
        # Delete ALL sessions belonging to the test candidate (reset may have spawned extras),
        # plus each session's child rows, before removing the candidate itself (FK order).
        cand_row = db.query(models.Candidate).filter(models.Candidate.email == "qatest.candidate@example.com").first()
        if cand_row:
            sess_rows = db.query(models.InterviewSession).filter(models.InterviewSession.candidate_id == cand_row.id).all()
            for s in sess_rows:
                db.query(models.InterviewMessage).filter(models.InterviewMessage.session_id == s.id).delete()
                db.query(models.ProctoringEvent).filter(models.ProctoringEvent.session_id == s.id).delete()
                db.query(models.FeedbackReport).filter(models.FeedbackReport.session_id == s.id).delete()
                db.delete(s)
            db.flush()
            db.delete(cand_row)
        if qa_job_id:
            for ex in db.query(models.ExamTemplate).filter(models.ExamTemplate.job_id == qa_job_id).all():
                db.delete(ex)
            j = db.query(models.JobPosting).filter(models.JobPosting.id == qa_job_id).first()
            if j:
                db.delete(j)
        if qa_company_id:
            c = db.query(models.Company).filter(models.Company.id == qa_company_id).first()
            if c:
                db.delete(c)
        db.commit()
        record("cleanup fixtures", True, "removed QATEST_* rows")
    except Exception as e:
        db.rollback()
        record("cleanup fixtures", False, str(e)[:120])
    finally:
        db.close()

    # ---------- SUMMARY ----------
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [(n, d) for n, ok, d in results if not ok]
    print("\n" + "=" * 60)
    print(f"TOTAL: {passed}/{len(results)} passed, {len(failed)} failed")
    if failed:
        print("FAILURES:")
        for n, d in failed:
            print(f"  - {n}  ::  {d}")
    print("=" * 60)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
