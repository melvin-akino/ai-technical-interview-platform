import React, { useState, useEffect } from 'react'
import { Camera, Mic, ShieldAlert, CheckCircle, AlertCircle, Play } from 'lucide-react'

function ProctoringCheck({ onStartExam }) {
  const [cameraAccess, setCameraAccess] = useState(null) // null | 'granted' | 'denied'
  const [micAccess, setMicAccess] = useState(null) // null | 'granted' | 'denied'
  const [agreed, setAgreed] = useState(false)
  const [checking, setChecking] = useState(false)

  const requestPermissions = async () => {
    setChecking(true)
    
    // Check Camera
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true })
      setCameraAccess('granted')
      // Stop stream tracks immediately
      videoStream.getTracks().forEach(track => track.stop())
    } catch (err) {
      console.warn("Camera permission denied:", err)
      setCameraAccess('denied')
    }

    // Check Microphone
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicAccess('granted')
      // Stop stream tracks immediately
      audioStream.getTracks().forEach(track => track.stop())
    } catch (err) {
      console.warn("Microphone permission denied:", err)
      setMicAccess('denied')
    }
    
    setChecking(false)
  }

  // Auto-request on mount
  useEffect(() => {
    requestPermissions()
  }, [])

  const allApproved = cameraAccess === 'granted' && micAccess === 'granted'

  return (
    <div className="proctoring-check-card glass-panel animate-fade-in" style={{
      maxWidth: '550px',
      margin: '2rem auto',
      padding: '2.5rem',
      borderRadius: '24px',
      border: '1px solid var(--border)',
      background: 'var(--bg-surface-elevated)',
      boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
      textAlign: 'center'
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
        <div style={{
          background: 'var(--primary-glow)',
          border: '1px solid var(--primary)',
          borderRadius: '50%',
          width: '64px',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--primary)'
        }}>
          <ShieldAlert size={32} />
        </div>
      </div>

      <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>
        Technical Exam Integrity Check
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '2rem' }}>
        AuraInterview uses automated AI proctoring to ensure a fair evaluation environment. Please authorize permissions to unlock your exam.
      </p>

      {/* Permissions Status List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem', textAlign: 'left' }}>
        
        {/* Camera Permission status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderRadius: '12px',
          background: 'var(--bg-base)',
          border: `1px solid ${cameraAccess === 'granted' ? 'rgba(16, 185, 129, 0.2)' : cameraAccess === 'denied' ? 'rgba(239, 68, 68, 0.2)' : 'var(--border)'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Camera size={18} style={{ color: cameraAccess === 'granted' ? 'var(--success)' : 'var(--text-secondary)' }} />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Camera Verification</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Required to ensure candidate identity</div>
            </div>
          </div>
          <div>
            {cameraAccess === 'granted' && <CheckCircle size={20} style={{ color: 'var(--success)' }} />}
            {cameraAccess === 'denied' && <AlertCircle size={20} style={{ color: 'var(--danger)' }} />}
            {cameraAccess === null && <div className="spinner-micro"></div>}
          </div>
        </div>

        {/* Microphone Permission status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderRadius: '12px',
          background: 'var(--bg-base)',
          border: `1px solid ${micAccess === 'granted' ? 'rgba(16, 185, 129, 0.2)' : micAccess === 'denied' ? 'rgba(239, 68, 68, 0.2)' : 'var(--border)'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Mic size={18} style={{ color: micAccess === 'granted' ? 'var(--success)' : 'var(--text-secondary)' }} />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Microphone Authorization</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Required for acoustic workspace analysis</div>
            </div>
          </div>
          <div>
            {micAccess === 'granted' && <CheckCircle size={20} style={{ color: 'var(--success)' }} />}
            {micAccess === 'denied' && <AlertCircle size={20} style={{ color: 'var(--danger)' }} />}
            {micAccess === null && <div className="spinner-micro"></div>}
          </div>
        </div>

      </div>

      {(!allApproved && !checking) && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
          padding: '0.85rem',
          fontSize: '0.8rem',
          color: 'var(--danger)',
          textAlign: 'left',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '8px'
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            Please allow camera/mic access in your browser settings to continue. Check the lock icon next to your URL bar, grant permissions, and click the retry button below.
          </span>
        </div>
      )}

      {/* Proctoring Consent Checkbox */}
      {allApproved && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', textAlign: 'left', marginBottom: '2rem' }}>
          <input 
            type="checkbox" 
            id="consent-check"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: '3px', cursor: 'pointer' }}
          />
          <label htmlFor="consent-check" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', lineHeight: 1.4 }}>
            I agree to the live proctoring terms. I understand that tab focus switches, browser sizing, and clipboard actions are monitored and reported as part of my integrity rating.
          </label>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        {!allApproved ? (
          <button 
            type="button" 
            onClick={requestPermissions}
            className="gradient-btn"
            style={{ borderRadius: '8px', padding: '0.75rem 2rem', fontSize: '0.85rem' }}
          >
            Retry Permissions Verification
          </button>
        ) : (
          <button 
            type="button"
            onClick={onStartExam}
            disabled={!agreed}
            className="gradient-btn start-exam-btn"
            style={{ 
              borderRadius: '8px', 
              padding: '0.85rem 2.5rem', 
              fontSize: '0.9rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              opacity: agreed ? 1 : 0.5,
              cursor: agreed ? 'pointer' : 'not-allowed'
            }}
          >
            <Play size={16} /> Start Technical Exam
          </button>
        )}
      </div>
      
      <style>{`
        .spinner-micro {
          width: 16px;
          height: 16px;
          border: 2px solid var(--border);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin-micro 0.8s linear infinite;
        }
        @keyframes spin-micro {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default ProctoringCheck
