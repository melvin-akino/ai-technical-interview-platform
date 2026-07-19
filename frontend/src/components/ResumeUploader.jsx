import React, { useState, useEffect } from 'react'
import { Upload, Briefcase, CheckCircle2, AlertCircle, Sparkles, ArrowRight, Mail, Loader2, Users } from 'lucide-react'

function ResumeUploader({ onStartInterview }) {
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('python')
  const [files, setFiles] = useState([])
  const [batchEmailLoading, setBatchEmailLoading] = useState({})
  const [batchEmailSuccess, setBatchEmailSuccess] = useState({})
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  
  // Results of the match
  const [matchData, setMatchData] = useState(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)

  // Talent Pool Selection State
  const [candidates, setCandidates] = useState([])
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [matchType, setMatchType] = useState('upload') // 'upload' | 'saved'
  const [expirationDate, setExpirationDate] = useState('')

  const handleSendEmail = async () => {
    if (!matchData) return
    setSendingEmail(true)
    setEmailSuccess(false)
    try {
      const res = await authFetch(`${API_URL}/api/v1/interviews/session/${matchData.session_id}/email-invite`, {
        method: 'POST'
      })
      if (!res.ok) throw new Error('Failed to send email invite')
      setEmailSuccess(true)
    } catch (err) {
      console.error(err)
      setError('Failed to send email invite link. Please try again.')
    } finally {
      setSendingEmail(false)
    }
  }

  const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')

  // JWT-authenticated fetch wrapper
  const authFetch = (url, options = {}) => {
    const token = localStorage.getItem('auth_token')
    const headers = {
      ...(options.headers || {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
    return fetch(url, { ...options, headers })
  }

  useEffect(() => {
    // Fetch available jobs from backend
    authFetch(`${API_URL}/api/v1/resumes/jobs`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load job postings')
        return res.json()
      })
      .then(data => {
        setJobs(data)
        if (data.length > 0) setSelectedJobId(data[0].id.toString())
      })
      .catch(err => {
        console.error(err)
        setError('Could not contact the backend server. Make sure the docker containers are running.')
      })

    // Fetch existing candidates
    authFetch(`${API_URL}/api/v1/resumes/candidates`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load candidates pool')
        return res.json()
      })
      .then(data => {
        setCandidates(data)
        if (data.length > 0) setSelectedCandidateId(data[0].id.toString())
      })
      .catch(err => {
        console.error(err)
      })
  }, [])

  const handleFileChange = (e) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      if (selectedFiles.length > 5) {
        setError('Batch upload is limited to a maximum of 5 resumes per transaction.')
        return
      }
      const invalid = selectedFiles.filter(f => f.type !== 'application/pdf')
      if (invalid.length > 0) {
        setError('Only PDF resumes are supported')
        return
      }
      setFiles(selectedFiles)
      setError('')
    }
  }

  const handleAnalyzeFit = async (e) => {
    e.preventDefault()
    if (!selectedJobId) {
      setError('Please select a target job position')
      return
    }
    if (matchType === 'upload' && files.length === 0) {
      setError('Please select at least one PDF resume file')
      return
    }
    if (matchType === 'saved' && !selectedCandidateId) {
      setError('Please select a saved candidate profile')
      return
    }

    setUploading(true)
    setError('')
    setMatchData(null)
    setBatchEmailLoading({})
    setBatchEmailSuccess({})

    try {
      let response
      if (matchType === 'upload') {
        if (files.length > 1) {
          const formData = new FormData()
          files.forEach(f => {
            formData.append('files', f)
          })
          formData.append('job_id', selectedJobId)
          formData.append('selected_language', selectedLanguage)
          if (expirationDate) {
            formData.append('expires_at', new Date(expirationDate).toISOString())
          }

          response = await authFetch(`${API_URL}/api/v1/resumes/batch-upload`, {
            method: 'POST',
            body: formData
          })
        } else {
          const formData = new FormData()
          formData.append('file', files[0])
          formData.append('job_id', selectedJobId)
          formData.append('selected_language', selectedLanguage)
          if (expirationDate) {
            formData.append('expires_at', new Date(expirationDate).toISOString())
          }

          response = await authFetch(`${API_URL}/api/v1/resumes/upload`, {
            method: 'POST',
            body: formData
          })
        }
      } else {
        response = await authFetch(`${API_URL}/api/v1/resumes/match-existing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate_id: parseInt(selectedCandidateId, 10),
            job_id: parseInt(selectedJobId, 10),
            selected_language: selectedLanguage,
            expires_at: expirationDate ? new Date(expirationDate).toISOString() : null
          })
        })
      }

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to analyze fit')
      }

      setMatchData(data)

      // Re-fetch candidates list to pull in newly added profiles
      authFetch(`${API_URL}/api/v1/resumes/candidates`)
        .then(res => res.json())
        .then(cands => setCandidates(cands))
        .catch(err => console.error(err))

    } catch (err) {
      console.error(err)
      setError(err.message || 'An error occurred during resume analysis.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="resume-uploader-container animate-fade-in">
      <div className="glass-panel uploader-card">
        {uploading && (
          <div className="uploader-loading-overlay animate-fade-in">
            <div className="loader-spinner"></div>
            <h3 className="loading-title">AI Matching Engine Active</h3>
            <p className="loading-subtitle">Parsing PDF CV, extracting core skills, and evaluating candidate compatibility via Gemini AI...</p>
          </div>
        )}
        <h2 className="uploader-title">
          <Sparkles className="logo-icon" size={24} />
          AI Resume Matcher
        </h2>
        <p className="uploader-subtitle">
          Upload your resume in PDF format to evaluate your alignment and initiate a live coding interview.
        </p>

        {error && (
          <div className="error-banner">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {!matchData ? (
          <form onSubmit={handleAnalyzeFit} className="uploader-form">
            <div className="form-group">
              <label className="form-label">1. Select Target Job</label>
              <div className="select-wrapper">
                <Briefcase className="select-icon" size={18} />
                <select 
                  value={selectedJobId} 
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="ru-form-select"
                >
                  {jobs.map(job => (
                    <option key={job.id} value={job.id}>{job.title}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selector Tabs */}
            <div className="match-type-tabs">
              <button
                type="button"
                onClick={() => {
                  setMatchType('upload')
                  setError('')
                }}
                className={`tab-btn ${matchType === 'upload' ? 'active' : ''}`}
              >
                Upload New PDF Resume
              </button>
              <button
                type="button"
                onClick={() => {
                  setMatchType('saved')
                  setError('')
                  if (candidates.length > 0 && !selectedCandidateId) {
                    setSelectedCandidateId(candidates[0].id.toString())
                  }
                }}
                className={`tab-btn ${matchType === 'saved' ? 'active' : ''}`}
                disabled={candidates.length === 0}
              >
                Select Saved Candidate ({candidates.length})
              </button>
            </div>

            {matchType === 'upload' ? (
              <div className="form-group animate-fade-in">
                <label className="form-label">2. Upload PDF Resume</label>
                <div className="file-dropzone">
                  <input 
                    type="file" 
                    id="resume-file" 
                    accept=".pdf" 
                    multiple
                    onChange={handleFileChange}
                    className="file-input"
                  />
                  <label htmlFor="resume-file" className="file-label">
                    <Upload size={32} className="upload-icon" />
                    <span className="file-text-main">
                      {files.length > 0 
                        ? (files.length === 1 ? files[0].name : `${files.length} resumes selected`) 
                        : 'Choose PDF files or drag them here'}
                    </span>
                    <span className="file-text-sub">PDF up to 5MB (Max 5 files)</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="form-group animate-fade-in">
                <label className="form-label">2. Choose Saved Candidate</label>
                <div className="select-wrapper">
                  <Users className="select-icon" size={18} />
                  <select 
                    value={selectedCandidateId} 
                    onChange={(e) => setSelectedCandidateId(e.target.value)}
                    className="ru-form-select"
                  >
                    {candidates.map(cand => (
                      <option key={cand.id} value={cand.id}>
                        {cand.name} ({cand.email}) {cand.resume_path ? `📄 ${cand.resume_path}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label">3. Programming Language for Live Coding</label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="ru-form-select"
              >
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="go">Go</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">4. Expiration Date & Time (Optional)</label>
              <input 
                type="datetime-local" 
                value={expirationDate} 
                onChange={(e) => setExpirationDate(e.target.value)} 
                className="ru-form-select"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface-elevated)' }}
              />
              <span className="input-hint" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.35rem' }}>
                💡 If left blank, candidate invitations will expire in 7 days by default.
              </span>
            </div>

            <button 
              type="submit" 
              disabled={uploading} 
              className="gradient-btn submit-btn"
            >
              {uploading ? 'Analyzing Fit via Gemini...' : 'Analyze Fit'}
            </button>
          </form>
        ) : Array.isArray(matchData) ? (
          <div className="match-results-container batch-results-container animate-fade-in" style={{ width: '100%' }}>
            <h3 className="batch-results-title" style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
              Batch Analysis Complete ({matchData.length} Resumes)
            </h3>
            <p className="batch-results-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              We matched candidates against the job posting using only 2 Gemini API calls. Review results below:
            </p>

            <div className="batch-results-actions-top" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button 
                onClick={async () => {
                  const uninvited = matchData.filter(m => !batchEmailSuccess[m.session_id])
                  if (uninvited.length === 0) return
                  for (let m of uninvited) {
                    setBatchEmailLoading(prev => ({ ...prev, [m.session_id]: true }))
                    try {
                      const res = await authFetch(`${API_URL}/api/v1/interviews/session/${m.session_id}/email-invite`, { method: 'POST' })
                      if (res.ok) {
                        setBatchEmailSuccess(prev => ({ ...prev, [m.session_id]: true }))
                      }
                    } catch (err) {
                      console.error(err)
                    } finally {
                      setBatchEmailLoading(prev => ({ ...prev, [m.session_id]: false }))
                    }
                  }
                }}
                className="gradient-btn"
                style={{ padding: '0.55rem 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                disabled={matchData.every(m => batchEmailSuccess[m.session_id])}
              >
                <Mail size={14} /> Email Invites to All
              </button>
            </div>

            <div className="sa-table-wrap glass-panel" style={{ overflowX: 'auto', marginBottom: '2rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <table className="sa-table sa-table-compact" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', background: 'rgba(255,255,255,0.01)' }}>
                    <th style={{ padding: '0.75rem' }}>Candidate</th>
                    <th style={{ padding: '0.75rem', width: '80px' }}>Fit Score</th>
                    <th style={{ padding: '0.75rem' }}>Key Matching Skills</th>
                    <th style={{ padding: '0.75rem', width: '220px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matchData.map((m) => {
                    const isEmailloading = batchEmailLoading[m.session_id]
                    const isEmailSuccess = batchEmailSuccess[m.session_id]
                    const score = m.match.score
                    const scoreColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'

                    return (
                      <tr key={m.session_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '0.85rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.candidate.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{m.candidate.email}</div>
                        </td>
                        <td style={{ padding: '0.85rem' }}>
                          <span style={{ 
                            background: `${scoreColor}15`, 
                            color: scoreColor, 
                            border: `1px solid ${scoreColor}30`,
                            padding: '0.2rem 0.5rem',
                            borderRadius: '20px',
                            fontWeight: 700,
                            fontSize: '0.8rem'
                          }}>
                            {score}%
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {m.match.matching_skills.slice(0, 3).map((s, idx) => (
                              <span key={idx} className="skill-pill matching" style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem' }}>{s}</span>
                            ))}
                            {m.match.matching_skills.length > 3 && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>+{m.match.matching_skills.length - 3}</span>
                            )}
                            {m.match.matching_skills.length === 0 && (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No skill overlap</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                              onClick={async () => {
                                setBatchEmailLoading(prev => ({ ...prev, [m.session_id]: true }))
                                try {
                                  const res = await authFetch(`${API_URL}/api/v1/interviews/session/${m.session_id}/email-invite`, { method: 'POST' })
                                  if (res.ok) {
                                    setBatchEmailSuccess(prev => ({ ...prev, [m.session_id]: true }))
                                  }
                                } catch (err) {
                                  console.error(err)
                                } finally {
                                  setBatchEmailLoading(prev => ({ ...prev, [m.session_id]: false }))
                                }
                              }}
                              disabled={isEmailSuccess || isEmailloading}
                              className="btn-secondary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem', minWidth: '85px', justifyContent: 'center' }}
                            >
                              {isEmailloading ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : isEmailSuccess ? (
                                <CheckCircle2 size={12} color="var(--success)" />
                              ) : (
                                <Mail size={12} />
                              )}
                              {isEmailSuccess ? 'Emailed' : 'Email Invite'}
                            </button>
                            <button 
                              onClick={() => onStartInterview(m.session_token || m.session_id, selectedJobId)}
                              className="gradient-btn"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                            >
                              Start Exam
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="results-actions" style={{ justifyContent: 'center' }}>
              <button 
                onClick={() => {
                  setMatchData(null)
                  setFiles([])
                }} 
                className="btn-secondary"
                style={{ padding: '0.75rem 2rem' }}
              >
                Upload Different Resumes
              </button>
            </div>
          </div>
        ) : (
          <div className="match-results-container">
            <div className="score-section">
              <div className="score-ring-wrapper">
                <svg className="score-ring" width="120" height="120">
                  <circle 
                    className="score-ring-bg" 
                    stroke="var(--border)" 
                    strokeWidth="8" 
                    fill="transparent" 
                    r="50" 
                    cx="60" 
                    cy="60"
                  />
                  <circle 
                    className="score-ring-fill" 
                    stroke="var(--primary)" 
                    strokeWidth="8" 
                    strokeDasharray={2 * Math.PI * 50}
                    strokeDashoffset={2 * Math.PI * 50 * (1 - matchData.match.score / 100)}
                    strokeLinecap="round"
                    fill="transparent" 
                    r="50" 
                    cx="60" 
                    cy="60"
                  />
                </svg>
                <div className="score-number-box">
                  <span className="score-number">{matchData.match.score}</span>
                  <span className="score-label">Fit Score</span>
                </div>
              </div>

              <div className="job-meta">
                <span className="matched-job-title">{matchData.job.title}</span>
                <span className="candidate-name">Candidate: {matchData.candidate.name}</span>
              </div>
            </div>

            <div className="skills-breakdown">
              <div className="skills-column">
                <h4><CheckCircle2 size={16} color="var(--success)" /> Matching Skills</h4>
                <div className="skills-list">
                  {matchData.match.matching_skills.map((skill, i) => (
                    <span key={i} className="skill-pill matching">{skill}</span>
                  ))}
                  {matchData.match.matching_skills.length === 0 && <span className="no-skills">None identified</span>}
                </div>
              </div>
              <div className="skills-column">
                <h4><AlertCircle size={16} color="var(--warning)" /> Missing / Desired Skills</h4>
                <div className="skills-list">
                  {matchData.match.missing_skills.map((skill, i) => (
                    <span key={i} className="skill-pill missing">{skill}</span>
                  ))}
                  {matchData.match.missing_skills.length === 0 && <span className="no-skills">None identified</span>}
                </div>
              </div>
            </div>

            <div className="analysis-summary">
              <h4>Gemini Analysis</h4>
              <p>{matchData.match.analysis}</p>
            </div>

             {emailSuccess && (
               <div className="email-success-message">
                 <CheckCircle2 size={16} color="var(--success)" />
                 <span>Interview invitation link successfully emailed to {matchData.candidate.email}!</span>
               </div>
             )}

             <div className="results-actions">
              <button 
                onClick={() => {
                  setMatchData(null)
                  setEmailSuccess(false)
                  setFiles([])
                }} 
                className="btn-secondary"
              >
                Upload Different Resume
              </button>

              <button 
                onClick={handleSendEmail}
                disabled={sendingEmail}
                className="btn-secondary flex-center"
              >
                {sendingEmail ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>Emailing...</span>
                  </>
                ) : (
                  <>
                    <Mail size={16} />
                    <span>Email Invite Link</span>
                  </>
                )}
              </button>

              <button 
                onClick={() => onStartInterview(matchData.session_token || matchData.session_id, matchData.job.id)}
                className="gradient-btn proceed-btn"
              >
                Start Interview Now
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )
      }
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .resume-uploader-container {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 2rem;
          max-width: 800px;
          margin: 0 auto;
        }
        .uploader-card {
          width: 100%;
          padding: 2.5rem;
          border-radius: 20px;
          position: relative;
          overflow: hidden;
        }
        .uploader-loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(10, 12, 22, 0.85);
          backdrop-filter: blur(12px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 2rem;
          text-align: center;
        }
        .loader-spinner {
          width: 60px;
          height: 60px;
          border: 4px solid rgba(255, 255, 255, 0.05);
          border-top-color: var(--primary);
          border-bottom-color: #a855f7;
          border-radius: 50%;
          animation: spinner-rotate 1.5s cubic-bezier(0.68, -0.55, 0.27, 1.55) infinite;
          margin-bottom: 1.5rem;
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.2);
        }
        .loading-title {
          font-size: 1.25rem;
          font-weight: 800;
          margin: 0 0 0.5rem 0;
          background: linear-gradient(135deg, #fff 40%, var(--primary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .loading-subtitle {
          color: var(--text-secondary);
          font-size: 0.85rem;
          line-height: 1.5;
          max-width: 320px;
          margin: 0;
          animation: pulse-text 2s ease-in-out infinite;
        }
        @keyframes spinner-rotate {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        .uploader-title {
          font-size: 2rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .uploader-subtitle {
          color: var(--text-secondary);
          margin-bottom: 2rem;
          font-size: 0.95rem;
        }
        .error-banner {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: var(--danger-glow);
          border: 1px solid var(--danger);
          padding: 1rem;
          border-radius: 10px;
          color: var(--text-primary);
          margin-bottom: 1.5rem;
          font-size: 0.9rem;
        }
        .email-success-message {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: var(--success-glow);
          border: 1px solid var(--success);
          padding: 1rem;
          border-radius: 10px;
          color: var(--text-primary);
          margin-bottom: 1.5rem;
          font-size: 0.9rem;
        }
        .uploader-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .form-label {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .select-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .select-icon {
          position: absolute;
          left: 1rem;
          color: var(--text-muted);
        }
        .ru-form-select {
          width: 100%;
          padding: 0.85rem 1rem 0.85rem 2.75rem;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text-primary);
          appearance: none;
          outline: none;
          transition: var(--transition-smooth);
        }
        .ru-form-select option {
          background-color: #121621;
          color: var(--text-primary);
        }
        .ru-form-select:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 0 2px var(--primary-glow);
        }
        .file-dropzone {
          position: relative;
          border: 2px dashed var(--border);
          border-radius: 10px;
          padding: 2rem;
          text-align: center;
          transition: var(--transition-smooth);
          cursor: pointer;
        }
        .file-dropzone:hover {
          border-color: var(--primary);
          background: rgba(255, 255, 255, 0.01);
        }
        .file-input {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
        }
        .file-label {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }
        .upload-icon {
          color: var(--primary);
        }
        .file-text-main {
          font-weight: 600;
          font-size: 1rem;
        }
        .file-text-sub {
          color: var(--text-muted);
          font-size: 0.8rem;
        }
        .submit-btn {
          padding: 1rem;
          border-radius: 10px;
          font-size: 1rem;
          margin-top: 1rem;
        }
        
        /* Match Results Styles */
        .match-results-container {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .score-section {
          display: flex;
          align-items: center;
          gap: 2rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 1.5rem;
        }
        .score-ring-wrapper {
          position: relative;
          width: 120px;
          height: 120px;
        }
        .score-ring {
          transform: rotate(-90deg);
        }
        .score-ring-fill {
          transition: stroke-dashoffset 1s ease-out;
        }
        .score-number-box {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .score-number {
          font-size: 1.75rem;
          font-weight: 800;
        }
        .score-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .job-meta {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .matched-job-title {
          font-size: 1.5rem;
          font-weight: 700;
        }
        .candidate-name {
          color: var(--text-secondary);
          font-size: 0.95rem;
        }
        .skills-breakdown {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
        .skills-column h4 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.95rem;
          margin-bottom: 0.75rem;
          color: var(--text-secondary);
        }
        .skills-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .skill-pill {
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .skill-pill.matching {
          background: var(--success-glow);
          color: hsl(145, 80%, 75%);
          border: 1px solid hsla(145, 80%, 45%, 0.3);
        }
        .skill-pill.missing {
          background: var(--danger-glow);
          color: hsl(355, 85%, 75%);
          border: 1px solid hsla(355, 85%, 55%, 0.3);
        }
        .no-skills {
          color: var(--text-muted);
          font-size: 0.85rem;
          font-style: italic;
        }
        .analysis-summary h4 {
          font-size: 1rem;
          margin-bottom: 0.5rem;
          color: var(--text-secondary);
        }
        .analysis-summary p {
          font-size: 0.95rem;
          line-height: 1.6;
          color: var(--text-primary);
          background: var(--bg-surface);
          padding: 1rem;
          border-radius: 10px;
          border: 1px solid var(--border);
        }
        .results-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1.5rem;
          margin-top: 1rem;
        }
        .btn-secondary {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-primary);
          padding: 0.85rem 1.5rem;
          border-radius: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .btn-secondary:hover {
          background: var(--bg-surface-elevated);
          border-color: var(--text-muted);
        }
        .proceed-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.85rem;
          border-radius: 10px;
        }

        /* Match Type Tabs Styling */
        .match-type-tabs {
          display: flex;
          background: rgba(0, 0, 0, 0.25);
          padding: 0.25rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          margin-bottom: 0.5rem;
          gap: 0.25rem;
        }
        .match-type-tabs .tab-btn {
          flex: 1;
          padding: 0.55rem;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.75rem;
          font-weight: 700;
          border-radius: 6px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .match-type-tabs .tab-btn:hover:not(:disabled) {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.02);
        }
        .match-type-tabs .tab-btn.active {
          background: var(--bg-surface-elevated);
          color: var(--primary);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }
        .match-type-tabs .tab-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}} />
    </div>
  )
}

export default ResumeUploader
