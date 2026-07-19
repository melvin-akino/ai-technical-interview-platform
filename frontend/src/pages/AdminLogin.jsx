import React, { useState } from 'react'
import { Mail, Lock, ShieldAlert, Sparkles, ArrowLeft, Eye, EyeOff } from 'lucide-react'

const API_BASE = `${import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')}/api/v1`

function AdminLogin({ onLoginSuccess, onBackToLanding }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.detail || 'Login failed. Please check your credentials.')
        setLoading(false)
        return
      }
      
      // Store JWT token and user info
      localStorage.setItem('auth_token', data.access_token)
      localStorage.setItem('user_role', data.user.role)
      localStorage.setItem('user_email', data.user.email)
      localStorage.setItem('company_name', data.user.company_name || '')
      localStorage.setItem('company_id', data.user.company_id || '')
      
      onLoginSuccess(data.user)
    } catch (err) {
      setError('Network error. Unable to reach the server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login-page animate-fade-in">
      <div className="glass-panel login-card">
        <button onClick={onBackToLanding} className="back-link">
          <ArrowLeft size={16} />
          Back to Home
        </button>

        <div className="login-header">
          <div className="logo-icon-wrapper">
            <Sparkles className="logo-icon animate-pulse" size={28} />
          </div>
          <h2 className="login-title">AuraInterview Portal</h2>
          <p className="login-subtitle">Sign in with your recruiter credentials</p>
        </div>

        {error && (
          <div className="login-error">
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={18} />
              <input 
                type="email" 
                placeholder="you@company.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={18} />
              <input 
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                required
              />
              <button 
                type="button" 
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="gradient-btn login-btn"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .admin-login-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: var(--bg-base);
          padding: 2rem;
        }
        .login-card {
          width: 100%;
          max-width: 440px;
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
        .login-header {
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
        .login-title {
          font-size: 1.5rem;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .login-subtitle {
          color: var(--text-secondary);
          font-size: 0.85rem;
          margin-top: 0.25rem;
        }
        .login-error {
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
        .login-form {
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
        .password-toggle {
          position: absolute;
          right: 0.75rem;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.25rem;
          display: flex;
          align-items: center;
        }
        .password-toggle:hover {
          color: var(--text-primary);
        }
        .login-form .form-input {
          width: 100%;
          padding: 0.85rem 2.5rem 0.85rem 2.75rem;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          color: var(--text-primary);
          outline: none;
          font-size: 0.95rem;
          transition: var(--transition-smooth);
        }
        .login-form .form-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 2px var(--primary-glow);
        }
        .login-btn {
          padding: 0.85rem;
          border-radius: 10px;
          font-size: 0.95rem;
          font-weight: 700;
          margin-top: 0.5rem;
        }
      `}} />
    </div>
  )
}

export default AdminLogin
