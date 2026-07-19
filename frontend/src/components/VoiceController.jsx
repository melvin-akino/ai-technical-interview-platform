import React, { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react'

function VoiceController({ 
  inputValue, 
  onTranscriptChange, 
  aiSpeechEnabled, 
  onToggleSpeech,
  onSpeakRequestRef
}) {
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)
  
  // Initialize Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      const rec = new SpeechRecognition()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'

      rec.onresult = (event) => {
        let finalTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' '
          }
        }
        if (finalTranscript) {
          onTranscriptChange(prev => {
            const trimmed = prev.trim()
            return trimmed ? `${trimmed} ${finalTranscript.trim()}` : finalTranscript.trim()
          })
        }
      }

      rec.onerror = (e) => {
        console.error('Speech Recognition Error:', e.error)
        setIsListening(false)
      }

      rec.onend = () => {
        setIsListening(false)
      }

      recognitionRef.current = rec
    } else {
      console.warn('Speech Recognition API not supported in this browser.')
    }
  }, [onTranscriptChange])

  // Provide external trigger to speak AI messages
  useEffect(() => {
    if (onSpeakRequestRef) {
      onSpeakRequestRef.current = (text) => {
        if (!aiSpeechEnabled) return

        // Cancel current speak actions
        window.speechSynthesis.cancel()
        
        // Clean markdown structures from AI text for smooth reading
        const cleanText = text
          .replace(/[#*`_]/g, '') // remove markdown symbols
          .replace(/\[.*?\]\(.*?\)/g, '') // remove links
          .trim()

        const utterance = new SpeechSynthesisUtterance(cleanText)
        
        // Try to pick a natural-sounding English voice
        const voices = window.speechSynthesis.getVoices()
        const englishVoice = voices.find(voice => 
          voice.name.includes('Google US English') || 
          voice.name.includes('Microsoft David') || 
          voice.lang.startsWith('en-US')
        )
        if (englishVoice) {
          utterance.voice = englishVoice
        }

        utterance.rate = 1.05 // Slightly faster for natural pacing
        window.speechSynthesis.speak(utterance)
      }
    }
  }, [aiSpeechEnabled, onSpeakRequestRef])

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech Recognition is not supported by your current browser. Please try using Google Chrome or Edge.')
      return
    }

    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      // Clear before starting to prevent overlap
      setIsListening(true)
      recognitionRef.current.start()
    }
  }

  return (
    <div className="voice-controller">
      <button 
        type="button" 
        onClick={toggleListening}
        className={`voice-btn ${isListening ? 'listening' : ''}`}
        title={isListening ? 'Stop Listening' : 'Start Voice Input (Speech-to-Text)'}
      >
        {isListening ? (
          <>
            <div className="pulse-dot"></div>
            <Mic size={18} />
            <span>Listening...</span>
          </>
        ) : (
          <>
            <MicOff size={18} />
            <span>Voice Input</span>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onToggleSpeech}
        className={`voice-btn ${aiSpeechEnabled ? 'speech-active' : ''}`}
        title={aiSpeechEnabled ? 'Mute AI Voice Responses' : 'Enable AI Voice Responses (Text-to-Speech)'}
      >
        {aiSpeechEnabled ? (
          <>
            <Volume2 size={18} />
            <span>AI Voice On</span>
          </>
        ) : (
          <>
            <VolumeX size={18} />
            <span>AI Voice Off</span>
          </>
        )}
      </button>

      <style dangerouslySetInnerHTML={{__html: `
        .voice-controller {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .voice-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--bg-surface-elevated);
          border: 1px solid var(--border);
          padding: 0.5rem 0.85rem;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary);
          transition: var(--transition-smooth);
        }
        .voice-btn:hover {
          color: var(--text-primary);
          border-color: var(--text-muted);
        }
        .voice-btn.listening {
          background: var(--danger-glow);
          border-color: var(--danger);
          color: hsl(355, 85%, 75%);
        }
        .voice-btn.speech-active {
          background: var(--primary-glow);
          border-color: var(--primary);
          color: hsl(260, 85%, 85%);
        }
        .pulse-dot {
          width: 8px;
          height: 8px;
          background-color: var(--danger);
          border-radius: 50%;
          animation: pulse 1s infinite alternate;
        }
        @keyframes pulse {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.2); opacity: 1; }
        }
      `}} />
    </div>
  )
}

export default VoiceController
