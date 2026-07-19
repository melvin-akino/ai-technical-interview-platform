import React, { useState, useEffect } from 'react'
import { Award, BookOpen, MessageSquare, Code, ArrowLeft, RefreshCw, Volume2 } from 'lucide-react'

function Results({ sessionId, onBackToDashboard }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [speaking, setSpeaking] = useState(false)

  const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')

  useEffect(() => {
    fetch(`${API_URL}/api/v1/feedback/${sessionId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to retrieve feedback report')
        return res.json()
      })
      .then((data) => {
        setReport(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        alert('Failed to retrieve grading report. Verify that the backend is active.')
        onBackToDashboard()
      })
  }, [sessionId])

  const handleSpeakSummary = () => {
    if (!report) return

    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }

    const summaryText = `
      Your technical interview evaluation is complete. 
      You achieved an overall score of ${report.overall_score} out of 100. 
      Here is a brief review.
      Regarding Code Quality: ${report.code_quality_feedback}
      Regarding Communication: ${report.communication_feedback}
      Regarding Technical Accuracy: ${report.technical_accuracy_feedback}
    `
    
    const utterance = new SpeechSynthesisUtterance(summaryText)
    utterance.rate = 1.05
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)

    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }

  // Basic markdown parser for display
  const renderMarkdown = (text) => {
    if (!text) return ''
    
    // Split into segments
    const lines = text.split('\n')
    let inCodeBlock = false
    let codeContent = []
    let renderedElements = []

    lines.forEach((line, idx) => {
      // Code block detection
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          // Close code block
          renderedElements.push(
            <pre key={`code-${idx}`} className="result-code-block">
              <code>{codeContent.join('\n')}</code>
            </pre>
          )
          codeContent = []
          inCodeBlock = false
        } else {
          inCodeBlock = true
        }
        return
      }

      if (inCodeBlock) {
        codeContent.push(line)
        return
      }

      // Headers
      if (line.startsWith('# ')) {
        renderedElements.push(<h1 key={idx} className="md-h1">{line.substring(2)}</h1>)
      } else if (line.startsWith('## ')) {
        renderedElements.push(<h2 key={idx} className="md-h2">{line.substring(3)}</h2>)
      } else if (line.startsWith('### ')) {
        renderedElements.push(<h3 key={idx} className="md-h3">{line.substring(4)}</h3>)
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        let boldFormatted = line.substring(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        renderedElements.push(<li key={idx} className="md-li" dangerouslySetInnerHTML={{ __html: boldFormatted }} />)
      } else if (line.trim() === '') {
        renderedElements.push(<div key={idx} className="md-spacer" />)
      } else {
        let boldFormatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        boldFormatted = boldFormatted.replace(/`(.*?)`/g, '<code class="md-inline-code">$1</code>')
        renderedElements.push(<p key={idx} className="md-p" dangerouslySetInnerHTML={{ __html: boldFormatted }} />)
      }
    })

    return renderedElements
  }

  if (loading) {
    return (
      <div className="results-loading-screen animate-fade-in">
        <div className="loader-box">
          <RefreshCw className="animate-spin text-primary" size={40} />
          <span className="spinner-text">Gemini is compiling scorecard analytics...</span>
        </div>
        <style dangerouslySetInnerHTML={{__html: `
          .results-loading-screen {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: var(--bg-base);
          }
          .loader-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
          }
          .spinner-text {
            color: var(--text-secondary);
            font-size: 0.95rem;
            font-weight: 600;
          }
        `}} />
      </div>
    )
  }

  return (
    <div className="results-page animate-fade-in">
      <header className="results-header">
        <div className="header-left">
          <button onClick={onBackToDashboard} className="back-btn" title="Back to Dashboard">
            <ArrowLeft size={16} />
          </button>
          <div className="header-info">
            <h2>Evaluation Scorecard</h2>
            <span>{report.job_title} | Candidate: {report.candidate_name}</span>
          </div>
        </div>

        <div className="header-actions">
          <button 
            onClick={handleSpeakSummary} 
            className={`speak-btn ${speaking ? 'speaking' : ''}`}
            title="Read performance summary aloud"
          >
            <Volume2 size={16} />
            {speaking ? 'Stop Reading' : 'Speak Summary'}
          </button>
        </div>
      </header>

      <main className="results-content">
        <div className="summary-cards-row">
          <div className="glass-panel overall-score-card">
            <div className="score-badge">
              <span className="score-num">{report.overall_score}</span>
              <span className="score-max">/100</span>
            </div>
            <h3 className="score-label">Accumulative Score</h3>
          </div>

          <div className="metrics-column">
            <div className="glass-panel metric-card">
              <div className="metric-icon-box code-icon">
                <Code size={18} />
              </div>
              <div className="metric-details">
                <span className="metric-title">Code Quality & Styling</span>
                <p className="metric-text">{report.code_quality_feedback}</p>
              </div>
            </div>

            <div className="glass-panel metric-card">
              <div className="metric-icon-box comm-icon">
                <MessageSquare size={18} />
              </div>
              <div className="metric-details">
                <span className="metric-title">Communication & Hint Absorption</span>
                <p className="metric-text">{report.communication_feedback}</p>
              </div>
            </div>

            <div className="glass-panel metric-card">
              <div className="metric-icon-box tech-icon">
                <BookOpen size={18} />
              </div>
              <div className="metric-details">
                <span className="metric-title">Technical Logic & Performance</span>
                <p className="metric-text">{report.technical_accuracy_feedback}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel detailed-report-card">
          <h3 className="report-title">
            <Award className="report-title-icon" size={22} />
            Detailed Performance Report
          </h3>
          <div className="report-body">
            {renderMarkdown(report.detailed_report)}
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .results-page {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: var(--bg-base);
        }
        .results-header {
          height: var(--header-height);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2rem;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }
        .back-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-secondary);
          width: 38px;
          height: 38px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .back-btn:hover {
          color: var(--text-primary);
          border-color: var(--text-muted);
          background: var(--bg-surface-elevated);
        }
        .header-info h2 {
          font-size: 1.15rem;
          font-weight: 700;
        }
        .header-info span {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        
        .speak-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--bg-surface-elevated);
          border: 1px solid var(--border);
          padding: 0.55rem 1rem;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 600;
          transition: var(--transition-smooth);
        }
        .speak-btn:hover {
          border-color: var(--primary);
          color: var(--primary-hover);
        }
        .speak-btn.speaking {
          background: var(--primary-glow);
          border-color: var(--primary);
          color: hsl(260, 85%, 85%);
          animation: audioPulse 1.5s infinite alternate;
        }
        
        .results-content {
          max-width: 1200px;
          width: 100%;
          margin: 0 auto;
          padding: 2.5rem 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 2.5rem;
        }
        
        .summary-cards-row {
          display: grid;
          grid-template-columns: 0.7fr 1.3fr;
          gap: 2rem;
          align-items: stretch;
        }
        
        .overall-score-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          border-radius: 16px;
          text-align: center;
        }
        .score-badge {
          display: flex;
          align-items: baseline;
          margin-bottom: 0.5rem;
        }
        .score-num {
          font-size: 5rem;
          font-weight: 900;
          color: var(--primary);
          text-shadow: 0 0 30px var(--primary-glow);
          line-height: 1;
        }
        .score-max {
          font-size: 1.5rem;
          color: var(--text-muted);
          font-weight: 700;
        }
        .score-label {
          font-size: 1rem;
          color: var(--text-secondary);
          font-weight: 600;
        }
        
        .metrics-column {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .metric-card {
          display: flex;
          align-items: flex-start;
          gap: 1.25rem;
          padding: 1.25rem 1.5rem;
          border-radius: 12px;
        }
        .metric-icon-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 8px;
          flex-shrink: 0;
        }
        .code-icon {
          background: var(--primary-glow);
          color: var(--primary);
        }
        .comm-icon {
          background: var(--secondary-glow);
          color: var(--secondary);
        }
        .tech-icon {
          background: hsla(320, 85%, 60%, 0.1);
          color: var(--accent);
        }
        .metric-details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .metric-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .metric-text {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }
        
        .detailed-report-card {
          padding: 2.5rem;
          border-radius: 16px;
        }
        .report-title {
          font-size: 1.4rem;
          font-weight: 800;
          margin-bottom: 2rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 1rem;
        }
        .report-title-icon {
          color: var(--primary);
        }
        
        /* Markdown Report Styles */
        .report-body {
          color: var(--text-primary);
          line-height: 1.7;
          font-size: 0.95rem;
        }
        .md-h1 {
          font-size: 1.75rem;
          font-weight: 800;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
        }
        .md-h2 {
          font-size: 1.35rem;
          font-weight: 700;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          color: var(--text-primary);
        }
        .md-h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .md-p {
          margin-bottom: 1rem;
          color: var(--text-secondary);
        }
        .md-li {
          margin-left: 1.5rem;
          margin-bottom: 0.5rem;
          color: var(--text-secondary);
        }
        .md-spacer {
          height: 1rem;
        }
        .md-inline-code {
          font-family: var(--font-mono);
          font-size: 0.85rem;
          background: var(--bg-surface-elevated);
          padding: 0.15rem 0.35rem;
          border-radius: 4px;
          color: var(--accent);
        }
        .result-code-block {
          background: #1e1e1e;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 1.25rem;
          overflow-x: auto;
          margin: 1.25rem 0;
          font-family: var(--font-mono);
          font-size: 0.85rem;
          line-height: 1.5;
          color: #d4d4d4;
        }
        
        @keyframes audioPulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.02); opacity: 0.9; }
          100% { transform: scale(1); opacity: 1; }
        }

        @media (max-width: 900px) {
          .summary-cards-row {
            grid-template-columns: 1fr;
          }
          .results-header {
            padding: 0 1rem;
          }
        }
      `}} />
    </div>
  )
}

export default Results
