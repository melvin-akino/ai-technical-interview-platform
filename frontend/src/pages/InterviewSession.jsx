import React, { useState, useEffect, useRef } from 'react'
import CodeEditor from '../components/CodeEditor.jsx'
import InterviewConsole from '../components/InterviewConsole.jsx'
import { Sparkles, Play, StopCircle, ArrowLeft, Mic, MicOff } from 'lucide-react'
import { GeminiAudioSession } from '../services/audio_handler'

function InterviewSession({ sessionId, jobId, onEndInterview, onBackToDashboard }) {
  const [session, setSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingText, setLoadingText] = useState('Syncing Workspace Environment...')
  const [focusLosses, setFocusLosses] = useState(0)
  const [copyPastes, setCopyPastes] = useState(0)
  const [timeAwaySeconds, setTimeAwaySeconds] = useState(0)
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')

  const socketRef = useRef(null)
  const codeSyncTimeoutRef = useRef(null)
  const codeRef = useRef('') // Keeps track of current code in ref to avoid closure capture issues
  const voiceSessionRef = useRef(null)

  const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')
  const WS_URL = API_URL.replace('http://', 'ws://').replace('https://', 'wss://')

  // Fetch initial session state
  useEffect(() => {
    fetch(`${API_URL}/api/v1/interviews/session/${sessionId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load session details')
        return res.json()
      })
      .then((data) => {
        setSession(data)
        setMessages(data.messages)
        setCode(data.latest_code || '')
        codeRef.current = data.latest_code || ''
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        alert('Could not start the interview session. Make sure backend container is active.')
        onBackToDashboard()
      })
  }, [sessionId])

  // Manage WebSocket connection
  useEffect(() => {
    if (loading || !session) return

    const ws = new WebSocket(`${WS_URL}/api/v1/interviews/ws/${sessionId}`)
    socketRef.current = ws

    ws.onopen = () => {
      setWsConnected(true)
      // Send current code editor state immediately on connect
      ws.send(JSON.stringify({
        type: 'code_sync',
        code: codeRef.current
      }))
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'error') {
        alert(data.message)
        onBackToDashboard()
        return
      }
      if (data.type === 'ai_response') {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'ai',
            message_text: data.message,
            timestamp: data.timestamp
          }
        ])
        setSending(false)

        if (data.should_end) {
          // AI triggered natural end
          setTimeout(() => {
            handleCompleteSession()
          }, 3000)
        }
      }
    }

    ws.onclose = () => {
      setWsConnected(false)
    }

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err)
      setWsConnected(false)
    }

    return () => {
      ws.close()
    }
  }, [loading, session])

  // Anti-cheat Proctoring Event Listeners
  useEffect(() => {
    if (loading || !session) return

    let timeAwayStart = null

    const handleBlur = () => {
      timeAwayStart = Date.now()
      setFocusLosses((prev) => {
        const next = prev + 1
        syncProctoring(next, copyPastes, timeAwaySeconds)
        return next
      })
    }

    const handleFocus = () => {
      if (timeAwayStart) {
        const diff = Math.round((Date.now() - timeAwayStart) / 1000)
        timeAwayStart = null
        setTimeAwaySeconds((prev) => {
          const next = prev + diff
          syncProctoring(focusLosses, copyPastes, next)
          return next
        })
      }
    }

    const handlePaste = (e) => {
      // Check if focus is inside the code editor or console input
      const activeEl = document.activeElement
      if (activeEl && (activeEl.classList.contains('inputarea') || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
        setCopyPastes((prev) => {
          const next = prev + 1
          syncProctoring(focusLosses, next, timeAwaySeconds)
          return next
        })
      }
    }

    const syncProctoring = (fl, cp, ta) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'proctoring_sync',
          focus_losses: fl,
          copy_pastes: cp,
          time_away_seconds: ta
        }))
      }
    }

    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('paste', handlePaste)

    return () => {
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('paste', handlePaste)
      if (voiceSessionRef.current) {
        voiceSessionRef.current.stop()
      }
    }
  }, [loading, session, focusLosses, copyPastes, timeAwaySeconds])

  // Debounced code sync to server
  const handleCodeChange = (newCode) => {
    setCode(newCode)
    codeRef.current = newCode

    if (codeSyncTimeoutRef.current) {
      clearTimeout(codeSyncTimeoutRef.current)
    }

    codeSyncTimeoutRef.current = setTimeout(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'code_sync',
          code: newCode
        }))
      }
      if (voiceMode && voiceSessionRef.current && voiceSessionRef.current.ws && voiceSessionRef.current.ws.readyState === WebSocket.OPEN) {
        voiceSessionRef.current.ws.send(JSON.stringify({
          type: 'code_update',
          code: newCode
        }))
      }
    }, 1500) // Debounce code sync updates by 1.5 seconds
  }

  const handleSendMessage = (text) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return

    setSending(true)
    // Add message locally immediately
    setMessages((prev) => [
      ...prev,
      {
        sender: 'candidate',
        message_text: text,
        timestamp: new Date().toISOString()
      }
    ])

    // Send through WebSocket
    socketRef.current.send(JSON.stringify({
      type: 'candidate_message',
      message: text
    }))
  }

  const handleChangeLanguage = async (newLang) => {
    setLoadingText('Translating coding workspace via AI...')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/interviews/session/${sessionId}/change-language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: newLang,
          code: codeRef.current
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Language switch failed')
      
      // Update local states
      setSession((prev) => ({
        ...prev,
        selected_language: data.selected_language
      }))
      setCode(data.latest_code)
      codeRef.current = data.latest_code
      setMessages(data.messages)
      
      // Notify websocket of the new code state
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'code_sync',
          code: data.latest_code
        }))
      }
    } catch (err) {
      console.error(err)
      alert(err.message || 'AI could not translate code to the selected language.')
    } finally {
      setLoading(false)
      setLoadingText('Syncing Workspace Environment...')
    }
  }

  const handleToggleVoiceMode = async () => {
    if (voiceMode) {
      if (voiceSessionRef.current) {
        voiceSessionRef.current.stop()
        voiceSessionRef.current = null
      }
      setVoiceMode(false)
      setVoiceTranscript('')
    } else {
      const sessionObj = new GeminiAudioSession(sessionId, API_URL)
      voiceSessionRef.current = sessionObj
      
      sessionObj.onTranscript = (text) => {
        setVoiceTranscript((prev) => prev + text)
      }
      
      sessionObj.onError = (err) => {
        alert(err)
        // Set voiceMode to false directly
        setVoiceMode(false)
        setVoiceTranscript('')
        if (voiceSessionRef.current) {
          voiceSessionRef.current.stop()
          voiceSessionRef.current = null
        }
      }
      
      sessionObj.onClose = () => {
        setVoiceMode(false)
        setVoiceTranscript('')
      }
      
      sessionObj.start()
        .then(() => {
          // Re-bind onmessage to handle message_logged events from voice WS
          if (sessionObj.ws) {
            sessionObj.ws.onmessage = (e) => {
              if (e.data instanceof ArrayBuffer) {
                sessionObj.playAudioChunk(e.data)
              } else {
                try {
                  const event = JSON.parse(e.data)
                  if (event.type === 'transcript') {
                    setVoiceTranscript((prev) => prev + event.text)
                  }
                  if (event.type === 'message_logged') {
                    setMessages((prev) => {
                      const exists = prev.some(m => m.timestamp === event.timestamp && m.message_text === event.message_text)
                      if (exists) return prev
                      return [
                        ...prev,
                        {
                          sender: event.sender,
                          message_text: event.message_text,
                          timestamp: event.timestamp
                        }
                      ]
                    })
                    if (event.sender === 'ai') {
                      setVoiceTranscript('')
                    }
                  }
                } catch (err) {
                  console.error(err)
                }
              }
            }
          }
          setVoiceMode(true)
        })
        .catch((err) => {
          console.error(err)
          alert('Could not start spoken voice session.')
          setVoiceMode(false)
        })
    }
  }

  const handleSwitchQuestion = async (targetIndex) => {
    setLoadingText('Saving and loading challenge...')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/v1/interviews/session/${sessionId}/switch-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code,
          target_index: targetIndex
        })
      })
      const switchData = await res.json()
      if (!res.ok) throw new Error(switchData.detail || 'Switching question failed')
      
      // Update local state with returned values
      setSession(prev => ({
        ...prev,
        current_question_index: switchData.current_question_index,
        questions_json: switchData.questions_json
      }))
      setCode(switchData.latest_code || '')
      codeRef.current = switchData.latest_code || ''
      
      // Update chat messages with the new problem statement notification
      if (switchData.messages) {
        setMessages(switchData.messages)
      }
      
      // Sync the code state over websocket immediately
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'code_sync',
          code: switchData.latest_code || ''
        }))
      }
    } catch (err) {
      console.error(err)
      alert(err.message || 'Error switching question.')
    } finally {
      setLoading(false)
      setLoadingText('Syncing Workspace Environment...')
    }
  }

  const handleCompleteSession = async () => {
    setLoading(true)
    try {
      // Trigger grading
      const res = await fetch(`${API_URL}/api/v1/feedback/grade/${sessionId}`, {
        method: 'POST'
      })
      if (!res.ok) throw new Error('Grading failed')
      onEndInterview(sessionId)
    } catch (err) {
      console.error(err)
      alert('Error finalizing interview grading scorecard. Loading Results directly.')
      onEndInterview(sessionId)
    }
  }

  if (loading) {
    return (
      <div className="session-loading-screen">
        <div className="loader-box">
          <div className="spinner"></div>
          <span className="spinner-text">{loadingText}</span>
        </div>
        <style dangerouslySetInnerHTML={{__html: `
          .session-loading-screen {
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
          .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid var(--border);
            border-top: 4px solid var(--primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          .spinner-text {
            color: var(--text-secondary);
            font-size: 0.95rem;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}} />
      </div>
    )
  }

  return (
    <div className="interview-session-page">
      <header className="session-header">
        <div className="header-meta-group">
          <button onClick={onBackToDashboard} className="back-btn" title="Leave Session">
            <ArrowLeft size={16} />
          </button>
          <div className="header-info">
            <h2 className="session-title">{session.job.title}</h2>
            <span className="session-candidate">Candidate: {session.candidate.name}</span>
          </div>
        </div>

        <div className="header-actions">
          <button 
            onClick={handleCompleteSession} 
            className="gradient-btn finish-btn"
          >
            <StopCircle size={18} />
            Submit Exam
          </button>
        </div>
      </header>

      <main className="session-workspace">
        <div className="workspace-pane editor-pane">
          <CodeEditor 
            code={code} 
            language={session.selected_language} 
            onChange={handleCodeChange} 
            focusLosses={focusLosses}
            copyPastes={copyPastes}
            wsConnected={wsConnected}
            sessionId={sessionId}
            onChangeLanguage={handleChangeLanguage}
            questionsJson={session.questions_json}
            currentQuestionIndex={session.current_question_index}
            onSwitchQuestion={handleSwitchQuestion}
          />
        </div>
        <div className="workspace-pane console-pane">
          <InterviewConsole 
            messages={messages} 
            onSendMessage={handleSendMessage} 
            sending={sending}
            wsConnected={wsConnected}
            voiceMode={voiceMode}
            onToggleVoiceMode={handleToggleVoiceMode}
            voiceTranscript={voiceTranscript}
          />
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .interview-session-page {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
        }
        .session-header {
          height: var(--header-height);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2rem;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .header-meta-group {
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
        .header-info {
          display: flex;
          flex-direction: column;
        }
        .session-title {
          font-size: 1.15rem;
          font-weight: 700;
        }
        .session-candidate {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .finish-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 1.25rem;
          border-radius: 8px;
          font-size: 0.9rem;
        }
        
        .session-workspace {
          flex: 1;
          display: flex;
          padding: 1rem;
          gap: 1rem;
          overflow: hidden;
          background: var(--bg-base);
        }
        .workspace-pane {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .editor-pane {
          flex: 1.2;
        }
        .console-pane {
          flex: 0.8;
          min-width: 450px;
        }
        
        @media (max-width: 900px) {
          .session-workspace {
            flex-direction: column;
            overflow-y: auto;
          }
          .editor-pane, .console-pane {
            height: 500px;
            flex: none;
            width: 100%;
            min-width: 0;
          }
        }
      `}} />
    </div>
  )
}

export default InterviewSession
