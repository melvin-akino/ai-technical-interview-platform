import React, { useState, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { Terminal, Code2, Play, ChevronUp, ChevronDown, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'

function CodeEditor({ 
  code, 
  language, 
  onChange, 
  focusLosses = 0, 
  copyPastes = 0, 
  wsConnected = false, 
  sessionId, 
  onChangeLanguage,
  questionsJson,
  currentQuestionIndex = 0,
  onSwitchQuestion
}) {
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [errorOutput, setErrorOutput] = useState('')
  const [testPassed, setTestPassed] = useState(null) // null | true | false
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [sqlResult, setSqlResult] = useState(null)

  const questions = questionsJson ? JSON.parse(questionsJson) : []

  // Clear test/compilation output drawer state when question changes
  useEffect(() => {
    setOutput('')
    setErrorOutput('')
    setTestPassed(null)
    setSqlResult(null)
  }, [currentQuestionIndex])

  const handleLanguageChange = (e) => {
    const newLang = e.target.value
    if (newLang === language.toLowerCase()) return
    
    const confirmSwitch = window.confirm(
      `Are you sure you want to switch your preferred language to ${newLang.toUpperCase()}?\n\n` +
      `This will use AI to translate your current code and the problem description on-the-fly. ` +
      `Your code editor will be reloaded with the translated code.`
    );
    
    if (confirmSwitch && onChangeLanguage) {
      onChangeLanguage(newLang)
    }
  }

  const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')

  // Map our UI languages to Monaco editor languages
  const getMonacoLanguage = (lang) => {
    switch (lang.toLowerCase()) {
      case 'python': return 'python'
      case 'javascript': return 'javascript'
      case 'typescript': return 'typescript'
      case 'go': return 'go'
      case 'java': return 'java'
      case 'cpp': return 'cpp'
      case 'sql': return 'sql'
      default: return 'python'
    }
  }

  const handleEditorChange = (value) => {
    if (onChange) {
      onChange(value)
    }
  }

  const handleRunCode = async () => {
    setIsRunning(true)
    setIsDrawerOpen(true)
    setOutput('')
    setErrorOutput('')
    setTestPassed(null)
    setSqlResult(null)

    try {
      const res = await fetch(`${API_URL}/api/v1/interviews/run-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code,
          language: language
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to run code')

      setOutput(data.stdout || '')
      setErrorOutput(data.stderr || '')
      setSqlResult(data.sql_result || null)
    } catch (err) {
      console.error(err)
      setErrorOutput(err.message || 'Server error running code sandbox.')
    } finally {
      setIsRunning(false)
    }
  }

  const handleRunTests = async () => {
    setIsRunning(true)
    setIsDrawerOpen(true)
    setOutput('')
    setErrorOutput('')
    setTestPassed(null)
    setSqlResult(null)

    try {
      const res = await fetch(`${API_URL}/api/v1/interviews/session/${sessionId}/run-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to run tests')

      setOutput(data.stdout || '')
      setErrorOutput(data.stderr || '')
      setTestPassed(data.passed)
      setSqlResult(data.sql_result || null)
    } catch (err) {
      console.error(err)
      setErrorOutput(err.message || 'Server error running unit tests.')
      setTestPassed(false)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="code-editor-container glass-panel">
      <div className="editor-header">
        <div className="header-left">
          <Code2 className="header-icon" size={18} />
          <span className="header-title">Sandbox Workspace</span>
          
          {questions.length > 1 && (
            <div className="questions-nav">
              <button 
                disabled={currentQuestionIndex === 0 || isRunning}
                onClick={() => onSwitchQuestion(currentQuestionIndex - 1)}
                className="q-nav-btn"
                title="Previous Question"
              >
                &lt;
              </button>
              
              <div className="questions-dots">
                {questions.map((q, idx) => (
                  <button
                    key={idx}
                    disabled={isRunning}
                    onClick={() => onSwitchQuestion(idx)}
                    className={`q-dot-btn ${idx === currentQuestionIndex ? 'active' : ''}`}
                    title={`Go to Question ${idx + 1}: ${q.title}`}
                  >
                    Q{idx + 1}
                  </button>
                ))}
              </div>
              
              <button 
                disabled={currentQuestionIndex === questions.length - 1 || isRunning}
                onClick={() => onSwitchQuestion(currentQuestionIndex + 1)}
                className="q-nav-btn"
                title="Next Question"
              >
                &gt;
              </button>
            </div>
          )}
        </div>
        <div className="header-right">
          <button 
            onClick={handleRunTests} 
            disabled={isRunning}
            className="run-tests-btn"
            title="Execute automated unit tests against your solution"
          >
            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
            {isRunning ? 'Testing...' : 'Run Unit Tests'}
          </button>
          <button 
            onClick={handleRunCode} 
            disabled={isRunning}
            className="run-code-btn"
          >
            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {isRunning ? 'Running...' : 'Run Code'}
          </button>
          <select 
            value={language.toLowerCase()} 
            onChange={handleLanguageChange}
            disabled={isRunning}
            className="lang-selector"
            title="Switch preferred coding language (AI will translate problem & code)"
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="go">Go</option>
            <option value="cpp">C++</option>
            <option value="c">C</option>
            <option value="php">PHP</option>
            <option value="sql">SQL (SQLite)</option>
          </select>
        </div>
      </div>
      
      <div className="monaco-wrapper">
        <Editor
          height="100%"
          language={getMonacoLanguage(language)}
          theme="vs-dark"
          value={code}
          onChange={handleEditorChange}
          options={{
            fontSize: 14,
            fontFamily: "'Fira Code', monospace",
            minimap: { enabled: false },
            lineNumbers: 'on',
            roundedSelection: true,
            scrollBeyondLastLine: false,
            readOnly: false,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            padding: { top: 12, bottom: 12 },
            automaticLayout: true,
          }}
          loading={<div className="editor-loading">Initializing Live Code Editor...</div>}
        />
      </div>

      {/* Workspace Status Bar */}
      <div className="editor-status-bar">
        <div className="status-group-left">
          <span className="status-item font-mono flex-center">
            <span className={`dot-blink ${wsConnected ? 'online' : 'offline'}`}></span>
            {wsConnected ? 'Connected' : 'Offline'}
          </span>
          <span className="status-divider">|</span>
          <span className="status-item uppercase">{language}</span>
        </div>
        <div className="status-group-right">
          <span className={`proctor-badge ${focusLosses > 0 ? 'warning' : 'secure'}`}>
            Focus Switches: <strong>{focusLosses}</strong>
          </span>
          <span className={`proctor-badge ${copyPastes > 0 ? 'warning' : 'secure'}`}>
            Pasted Blocks: <strong>{copyPastes}</strong>
          </span>
          <span className="proctor-badge proctor-integrity-rating">
            Integrity: <strong>{Math.max(100 - (focusLosses * 15) - (copyPastes * 10), 0)}%</strong>
          </span>
        </div>
      </div>

      {/* Terminal Output Drawer */}
      <div className={`terminal-drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="terminal-header" onClick={() => setIsDrawerOpen(!isDrawerOpen)}>
          <div className="header-title-group">
            <Terminal size={14} />
            <span>Execution Console</span>
          </div>
          <button className="toggle-drawer-btn">
            {isDrawerOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
        {isDrawerOpen && (
          <div className="terminal-body">
            {isRunning ? (
              <div className="terminal-loading">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span>Running compilation & test execution...</span>
              </div>
            ) : !output && !errorOutput ? (
              <div className="terminal-empty">No execution logs yet. Write code and click "Run Code" above.</div>
            ) : (
              <div className="terminal-content-wrapper">
                {testPassed === true && (
                  <div className="test-success-banner">
                    <CheckCircle size={16} />
                    <span>All Unit Tests Passed Successfully! (Solution matches specifications)</span>
                  </div>
                )}
                {testPassed === false && (
                  <div className="test-failure-banner">
                    <AlertTriangle size={16} />
                    <span>Unit Test Assertions Failed! Please inspect details below.</span>
                  </div>
                )}
                <pre className="terminal-content">
                  {output && <div className="stdout">{output}</div>}
                  {errorOutput && <div className="stderr">{errorOutput}</div>}
                </pre>
                {sqlResult && (
                  <div className="sql-table-wrapper" style={{ marginTop: '0.75rem', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border)' }}>
                          {sqlResult.columns.map((col, idx) => (
                            <th key={idx} style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sqlResult.rows.length === 0 ? (
                          <tr>
                            <td colSpan={sqlResult.columns.length || 1} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                              Empty Set (0 rows returned)
                            </td>
                          </tr>
                        ) : (
                          sqlResult.rows.map((row, rIdx) => (
                            <tr key={rIdx} style={{ borderBottom: '1px solid var(--border)' }}>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} style={{ padding: '0.5rem 0.75rem', color: 'var(--text-primary)' }}>{cell}</td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .code-editor-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid var(--border);
        }
        .editor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.25rem;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .questions-nav {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--bg-base);
          padding: 0.2rem 0.5rem;
          border-radius: 20px;
          border: 1px solid var(--border);
        }
        .q-nav-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          padding: 0.1rem 0.4rem;
          transition: var(--transition-smooth);
        }
        .q-nav-btn:hover:not(:disabled) {
          color: var(--primary);
        }
        .q-nav-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .questions-dots {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .q-dot-btn {
          font-size: 0.7rem;
          font-weight: 700;
          background: var(--bg-surface-elevated);
          border: 1px solid var(--border);
          color: var(--text-secondary);
          border-radius: 12px;
          padding: 0.15rem 0.5rem;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .q-dot-btn:hover:not(:disabled) {
          border-color: var(--primary);
          color: var(--text-primary);
        }
        .q-dot-btn.active {
          background: var(--primary-glow);
          color: var(--primary);
          border-color: var(--primary);
        }
        .header-icon {
          color: var(--primary);
        }
        .header-title {
          font-size: 0.9rem;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .run-tests-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: transparent;
          border: 1px solid var(--secondary);
          color: var(--secondary) !important;
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .run-tests-btn:hover:not(:disabled) {
          background: var(--secondary-glow);
          box-shadow: 0 0 10px hsla(190, 90%, 50%, 0.15);
        }
        .run-tests-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .run-code-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: var(--primary);
          color: #000 !important;
          border: none;
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .run-code-btn:hover:not(:disabled) {
          background: #fff;
          box-shadow: 0 0 10px var(--primary-glow);
        }
        .run-code-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .test-success-banner {
          background: rgba(46, 204, 113, 0.1);
          border: 1px solid rgba(46, 204, 113, 0.3);
          color: #2ecc71;
          padding: 0.65rem 1rem;
          border-radius: 8px;
          font-weight: 700;
          margin-bottom: 0.75rem;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .test-failure-banner {
          background: rgba(231, 76, 60, 0.1);
          border: 1px solid rgba(231, 76, 60, 0.3);
          color: #e74c3c;
          padding: 0.65rem 1rem;
          border-radius: 8px;
          font-weight: 700;
          margin-bottom: 0.75rem;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .lang-selector {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--secondary);
          background: var(--bg-surface-elevated);
          border: 1px solid hsla(190, 90%, 50%, 0.2);
          padding: 0.35rem 0.65rem;
          border-radius: 6px;
          outline: none;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .lang-selector:hover:not(:disabled) {
          border-color: var(--secondary);
          background: var(--secondary-glow);
        }
        .lang-selector option {
          background: var(--bg-surface-elevated);
          color: var(--text-primary);
        }
        .monaco-wrapper {
          flex: 1;
          min-height: 0;
          position: relative;
        }
        .editor-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        .editor-status-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.45rem 1.25rem;
          background: #111723;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          font-size: 0.75rem;
          color: var(--text-secondary);
          user-select: none;
        }
        .status-group-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .status-divider {
          color: var(--border);
        }
        .status-group-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .proctor-badge {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
          font-size: 0.7rem;
        }
        .proctor-badge.secure {
          background: rgba(46, 204, 113, 0.08);
          border: 1px solid rgba(46, 204, 113, 0.2);
          color: var(--success);
        }
        .proctor-badge.warning {
          background: rgba(230, 126, 34, 0.08);
          border: 1px solid rgba(230, 126, 34, 0.2);
          color: var(--warning);
        }
        .proctor-integrity-rating {
          background: var(--primary-glow);
          border: 1px solid hsla(260, 85%, 65%, 0.2);
          color: var(--primary);
        }
        .dot-blink {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          margin-right: 0.35rem;
        }
        .dot-blink.online {
          background: var(--success);
          box-shadow: 0 0 8px var(--success);
        }
        .dot-blink.offline {
          background: var(--danger);
          box-shadow: 0 0 8px var(--danger);
        }
        .flex-center {
          display: flex;
          align-items: center;
        }

        /* Terminal Drawer */
        .terminal-drawer {
          background: #090d16;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
        }
        .terminal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 1.25rem;
          background: #111723;
          cursor: pointer;
          user-select: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .header-title-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-secondary);
        }
        .toggle-drawer-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .terminal-body {
          height: 140px;
          overflow-y: auto;
          padding: 0.75rem 1.25rem;
          font-family: 'Fira Code', monospace;
          font-size: 0.85rem;
          background: #070a10;
        }
        .terminal-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 0.5rem;
          color: var(--text-muted);
          font-size: 0.8rem;
        }
        .terminal-empty {
          color: var(--text-muted);
          text-align: center;
          padding-top: 2rem;
          font-size: 0.8rem;
        }
        .terminal-content {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .stdout {
          color: #a8ffb2;
        }
        .stderr {
          color: #ff9e9e;
        }
      `}} />
    </div>
  )
}

export default CodeEditor
