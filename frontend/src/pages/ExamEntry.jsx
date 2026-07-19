import React, { useState } from 'react'
import { Sparkles, ArrowLeft, Search, ArrowRight } from 'lucide-react'
import ProctoringCheck from '../components/ProctoringCheck.jsx'

function ExamEntry({ onStartInterview, onBackToLanding }) {
  const [sessionId, setSessionId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showIntegrityCheck, setShowIntegrityCheck] = useState(false)
  const [verifiedToken, setVerifiedToken] = useState('')

  const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    const token = sessionId.trim()
    if (!token) {
      setError('Please enter a valid session ID or token.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/interviews/session/${token}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Session not found. Please check your session ID or token.')
        setLoading(false)
        return
      }

      if (data.is_expired) {
        setError('This interview invitation has expired. Please contact your recruiter to reactivate it.')
        setLoading(false)
        return
      }

      if (data.status === 'completed' || data.status === 'graded') {
        setError('This interview session has already been completed. Re-entry is not permitted.')
        setLoading(false)
        return
      }

      setVerifiedToken(token)
      setShowIntegrityCheck(true)
    } catch (err) {
      setError('Unable to connect to the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (showIntegrityCheck) {
    return (
      <div className="exam-entry-page animate-fade-in" style={{ background: 'var(--bg-base)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ProctoringCheck onStartExam={() => onStartInterview(verifiedToken)} />
      </div>
    )
  }

  return (
    <div className="exam-entry-page animate-fade-in">
      <div className="glass-panel exam-entry-card">
        <button onClick={onBackToLanding} className="back-link">
          <ArrowLeft size={16} />
          Back to Home
        </button>

        <div className="entry-header">
          <div className="logo-icon-wrapper">
            <Sparkles className="logo-icon animate-pulse" size={28} />
          </div>
          <h2 className="entry-title">Start Your Interview</h2>
          <p className="entry-subtitle">
            Enter your session ID from the invitation email to begin your live coding exam.
          </p>
        </div>

        {error && (
          <div className="entry-error">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="entry-form">
          <div className="form-group">
            <label className="form-label">Session ID</label>
            <div className="input-wrapper">
              <Search className="input-icon" size={18} />
              <input 
                type="text" 
                placeholder="e.g. 1042" 
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="form-input"
                required
                autoFocus
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="gradient-btn entry-btn"
          >
            {loading ? 'Verifying...' : (
              <>
                Enter Exam Room <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="entry-hint">
          <p>
            💡 Don't have a session ID? Check your email for an interview invitation 
            from your recruiter containing your unique session link.
          </p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .exam-entry-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: var(--bg-base);
          padding: 2rem;
        }
        .exam-entry-card {
          width: 100%;
          max-width: 480px;
          padding: 3rem 2.5rem;
          border-radius: 24px;
          position: relative;
        }
        .back-link {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 2rem;
          transition: var(--transition-smooth);
        }
        .back-link:hover {
          color: var(--text-primary);
        }
        .entry-header {
          text-align: center;
          margin-bottom: 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .logo-icon-wrapper {
          width: 54px;
          height: 54px;
          background: var(--primary-glow);
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          margin-bottom: 1rem;
          border: 1px solid hsla(260, 85%, 65%, 0.2);
        }
        .entry-title {
          font-size: 1.5rem;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .entry-subtitle {
          color: var(--text-secondary);
          font-size: 0.85rem;
          margin-top: 0.5rem;
          line-height: 1.5;
        }
        .entry-error {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: var(--danger-glow);
          border: 1px solid var(--danger);
          padding: 0.75rem 1rem;
          border-radius: 8px;
          color: hsl(355, 85%, 75%);
          margin-bottom: 1.5rem;
          font-size: 0.85rem;
        }
        .entry-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-icon {
          position: absolute;
          left: 1rem;
          color: var(--text-muted);
        }
        .entry-form .form-input {
          width: 100%;
          padding: 0.85rem 1rem 0.85rem 2.75rem;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text-primary);
          outline: none;
          font-size: 1.1rem;
          font-weight: 600;
          letter-spacing: 2px;
          transition: var(--transition-smooth);
        }
        .entry-form .form-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 2px var(--primary-glow);
        }
        .entry-btn {
          padding: 0.85rem;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 700;
          margin-top: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .entry-hint {
          margin-top: 2rem;
          padding: 1rem;
          background: var(--bg-surface-elevated);
          border-radius: 12px;
          border: 1px solid var(--border);
        }
        .entry-hint p {
          font-size: 0.8rem;
          color: var(--text-secondary);
          line-height: 1.5;
          margin: 0;
        }
      `}} />
    </div>
  )
}

export default ExamEntry
