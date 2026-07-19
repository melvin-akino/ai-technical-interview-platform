import React, { useState, useEffect, useRef } from 'react'
import VoiceController from './VoiceController.jsx'
import { Send, Bot, User, Loader2, Mic, MicOff } from 'lucide-react'

function InterviewConsole({ 
  messages, 
  onSendMessage, 
  sending, 
  wsConnected,
  voiceMode = false,
  onToggleVoiceMode,
  voiceTranscript = ''
}) {
  const [inputText, setInputText] = useState('')
  const [aiSpeechEnabled, setAiSpeechEnabled] = useState(true)
  const chatEndRef = useRef(null)
  const onSpeakRequestRef = useRef(null)

  // Auto scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Triggers TTS when AI receives a message
  useEffect(() => {
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1]
      if (latestMessage.sender === 'ai' && onSpeakRequestRef.current) {
        onSpeakRequestRef.current(latestMessage.message_text)
      }
    }
  }, [messages])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!inputText.trim() || sending || !wsConnected) return

    onSendMessage(inputText)
    setInputText('')
  }

  // Format AI markdown-like responses simply for display
  const formatMessageText = (text) => {
    if (!text) return ''
    return text.split('\n').map((paragraph, idx) => {
      // Bold syntax **text**
      let formatted = paragraph.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Custom basic formatting for markdown sections
      if (paragraph.startsWith('###')) {
        return <h3 key={idx} className="chat-h3">{paragraph.replace('###', '')}</h3>
      }
      if (paragraph.startsWith('##')) {
        return <h2 key={idx} className="chat-h2">{paragraph.replace('##', '')}</h2>
      }
      if (paragraph.startsWith('- ') || paragraph.startsWith('* ')) {
        return <li key={idx} className="chat-li" dangerouslySetInnerHTML={{ __html: formatted.substring(2) }} />
      }
      
      // Inline code `code`
      formatted = formatted.replace(/`(.*?)`/g, '<code class="chat-code">$1</code>')
      
      return <p key={idx} className="chat-p" dangerouslySetInnerHTML={{ __html: formatted }} />
    })
  }

  return (
    <div className="interview-console glass-panel">
      <div className="console-header">
        <div className="header-left">
          <Bot className="bot-logo" size={20} />
          <span className="console-title">AI Interviewer Panel</span>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button 
            type="button"
            onClick={onToggleVoiceMode}
            className={`voice-call-toggle-btn ${voiceMode ? 'active' : ''}`}
            title={voiceMode ? "End Spoken Interview Call" : "Start Spoken Interview Call"}
          >
            {voiceMode ? <MicOff size={14} /> : <Mic size={14} />}
            <span>{voiceMode ? 'End Spoken Call' : 'Start Spoken Call'}</span>
          </button>
          <span className={`status-dot ${wsConnected ? 'connected' : 'disconnected'}`}></span>
          <span className="status-text">{wsConnected ? 'Connected' : 'Reconnecting...'}</span>
        </div>
      </div>

      <div className="chat-scroller">
        <div className="messages-container">
          {messages.map((msg, index) => (
            <div 
              key={index} 
              className={`chat-bubble-wrapper ${msg.sender === 'ai' ? 'ai' : 'candidate'}`}
            >
              <div className="avatar">
                {msg.sender === 'ai' ? <Bot size={16} /> : <User size={16} />}
              </div>
              <div className="bubble-content">
                <div className="bubble-sender">
                  {msg.sender === 'ai' ? 'AI Recruiter' : 'You'}
                </div>
                <div className="bubble-text">
                  {formatMessageText(msg.message_text)}
                </div>
              </div>
            </div>
          ))}
          {sending && (
            <div className="chat-bubble-wrapper ai typing">
              <div className="avatar">
                <Bot size={16} />
              </div>
              <div className="bubble-content">
                <div className="bubble-text flex-center">
                  <Loader2 className="animate-spin" size={16} />
                  <span className="typing-text">AI is evaluating your code & speaking...</span>
                </div>
              </div>
            </div>
          )}
          {voiceTranscript && (
            <div className="chat-bubble-wrapper ai transcript-stream">
              <div className="avatar">
                <Bot size={16} />
              </div>
              <div className="bubble-content">
                <div className="bubble-sender">AI Recruiter (Speaking)</div>
                <div className="bubble-text stream-text">{formatMessageText(voiceTranscript)}</div>
              </div>
            </div>
          )}
          {voiceMode && (
            <div className="voice-call-banner">
              <div className="pulse-indicator">
                <div className="double-bounce1"></div>
                <div className="double-bounce2"></div>
              </div>
              <span>🎤 Spoken Interview Mode is Active. Talk naturally.</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      <div className="console-input-area">
        <div className="voice-controls-row">
          <VoiceController 
            inputValue={inputText} 
            onTranscriptChange={setInputText}
            aiSpeechEnabled={aiSpeechEnabled}
            onToggleSpeech={() => setAiSpeechEnabled(!aiSpeechEnabled)}
            onSpeakRequestRef={onSpeakRequestRef}
          />
        </div>

        <form onSubmit={handleSubmit} className="input-form">
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={wsConnected ? "Type your response, ask questions, or press 'Voice Input' to speak..." : "Connecting to server..."}
            disabled={!wsConnected || sending}
            className="chat-input"
          />
          <button 
            type="submit" 
            disabled={!inputText.trim() || sending || !wsConnected}
            className="send-btn"
          >
            <Send size={18} />
          </button>
        </form>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .interview-console {
          display: flex;
          flex-direction: column;
          height: 100%;
          border-radius: 12px;
          border: 1px solid var(--border);
          overflow: hidden;
        }
        .console-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.25rem;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border);
        }
        .voice-call-toggle-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: var(--bg-surface-elevated);
          border: 1px solid var(--border);
          color: var(--text-secondary);
          padding: 0.3rem 0.65rem;
          border-radius: 20px;
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 700;
          transition: var(--transition-smooth);
        }
        .voice-call-toggle-btn:hover {
          border-color: var(--primary);
          color: var(--primary);
          background: var(--primary-glow);
        }
        .voice-call-toggle-btn.active {
          border-color: var(--danger);
          color: var(--danger);
          background: rgba(239, 68, 68, 0.1);
          animation: pulse-border 1.5s infinite;
        }
        @keyframes pulse-border {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .bot-logo {
          color: var(--primary);
        }
        .console-title {
          font-size: 0.9rem;
          font-weight: 600;
          letter-spacing: 0.5px;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .status-dot.connected {
          background: var(--success);
          box-shadow: 0 0 10px var(--success-glow);
        }
        .status-dot.disconnected {
          background: var(--danger);
          box-shadow: 0 0 10px var(--danger-glow);
        }
        .status-text {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        
        .chat-scroller {
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem;
          background: var(--bg-base);
        }
        .messages-container {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .chat-bubble-wrapper {
          display: flex;
          gap: 0.75rem;
          max-width: 85%;
          animation: messageFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .chat-bubble-wrapper.ai {
          align-self: flex-start;
        }
        .chat-bubble-wrapper.candidate {
          align-self: flex-end;
          flex-direction: row-reverse;
        }
        .avatar {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .chat-bubble-wrapper.ai .avatar {
          background: var(--primary-glow);
          color: var(--primary);
          border: 1px solid hsla(260, 85%, 65%, 0.2);
        }
        .chat-bubble-wrapper.candidate .avatar {
          background: var(--secondary-glow);
          color: var(--secondary);
          border: 1px solid hsla(190, 90%, 50%, 0.2);
        }
        
        .bubble-content {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .bubble-sender {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .chat-bubble-wrapper.candidate .bubble-sender {
          text-align: right;
        }
        .bubble-text {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          padding: 0.85rem 1.15rem;
          border-radius: 12px;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .chat-bubble-wrapper.ai .bubble-text {
          border-top-left-radius: 2px;
          background: var(--bg-surface-elevated);
        }
        .chat-bubble-wrapper.candidate .bubble-text {
          border-top-right-radius: 2px;
          background: var(--primary-glow);
          border-color: hsla(260, 85%, 65%, 0.3);
        }
        
        /* Inner chat styles */
        .chat-p {
          margin-bottom: 0.5rem;
        }
        .chat-p:last-child {
          margin-bottom: 0;
        }
        .chat-h3 {
          font-size: 1rem;
          font-weight: 700;
          margin: 0.75rem 0 0.35rem 0;
        }
        .chat-h2 {
          font-size: 1.15rem;
          font-weight: 800;
          margin: 1rem 0 0.5rem 0;
        }
        .chat-li {
          margin-left: 1.25rem;
          margin-bottom: 0.25rem;
        }
        .chat-code {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          background: rgba(0, 0, 0, 0.4);
          padding: 0.15rem 0.35rem;
          border-radius: 4px;
          color: var(--accent);
        }
        .flex-center {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .typing-text {
          color: var(--text-secondary);
        }
        
        .console-input-area {
          padding: 1rem;
          background: var(--bg-surface);
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .input-form {
          display: flex;
          gap: 0.5rem;
        }
        .chat-input {
          flex: 1;
          padding: 0.75rem 1rem;
          background: var(--bg-base);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-primary);
          outline: none;
          font-size: 0.9rem;
          transition: var(--transition-smooth);
        }
        .chat-input:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 0 2px var(--primary-glow);
        }
        .send-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          background: var(--primary);
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .send-btn:hover {
          background: var(--primary-hover);
        }
        .send-btn:disabled {
          background: var(--bg-surface-elevated);
          color: var(--text-muted);
          cursor: not-allowed;
        }
        
        .voice-call-banner {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.6rem 1rem;
          margin-top: 0.5rem;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: var(--success);
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 500;
          animation: messageFadeIn 0.3s ease-out;
        }
        .pulse-indicator {
          width: 12px;
          height: 12px;
          position: relative;
        }
        .double-bounce1, .double-bounce2 {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background-color: var(--success);
          opacity: 0.6;
          position: absolute;
          top: 0;
          left: 0;
          animation: sk-bounce 2.0s infinite ease-in-out;
        }
        .double-bounce2 {
          animation-delay: -1.0s;
        }
        @keyframes sk-bounce {
          0%, 100% { transform: scale(0.0) }
          50% { transform: scale(1.0) }
        }
        .transcript-stream {
          opacity: 0.85;
          animation: messageFadeIn 0.2s ease-out;
        }
        .stream-text {
          font-style: italic;
          border-left: 2px solid var(--primary);
          padding-left: 0.5rem;
        }
        
        @keyframes messageFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  )
}

export default InterviewConsole
