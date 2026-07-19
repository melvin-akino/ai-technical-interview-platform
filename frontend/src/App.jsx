import React, { useState, useEffect } from 'react'
import LandingPage from './pages/LandingPage.jsx'
import ExamEntry from './pages/ExamEntry.jsx'
import InterviewSession from './pages/InterviewSession.jsx'
import Results from './pages/Results.jsx'
import AdminLogin from './pages/AdminLogin.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import SuperAdminDashboard from './pages/SuperAdminDashboard.jsx'
import ThankYou from './pages/ThankYou.jsx'
import './App.css'

const API_BASE = `${import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')}/api/v1`

function App() {
  // Pages:
  // PUBLIC:  'landing' | 'exam-entry' | 'interview' | 'thank-you'
  // AUTH:    'admin-login' | 'admin' | 'superadmin'
  const [currentPage, setCurrentPage] = useState('landing')
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [activeJobId, setActiveJobId] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)

  // On mount: check for session_id param (email invite link) or existing auth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const sessionId = urlParams.get('session_id')
    if (sessionId) {
      window.history.replaceState({}, document.title, window.location.pathname)
      setActiveSessionId(sessionId)
      setCurrentPage('interview')
      return
    }

    // Auto-login if token exists
    const token = localStorage.getItem('auth_token')
    if (token) {
      validateToken(token)
    }
  }, [])

  const validateToken = async (token) => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const user = await res.json()
        setCurrentUser(user)
        if (user.role === 'superadmin') {
          setCurrentPage('superadmin')
        } else {
          setCurrentPage('admin')
        }
      } else {
        // Token expired or invalid
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user_role')
        localStorage.removeItem('user_email')
      }
    } catch {
      // Network error, stay on landing
    }
  }

  const navigateTo = (page, sessionId = null, jobId = null) => {
    if (sessionId) setActiveSessionId(sessionId)
    if (jobId) setActiveJobId(jobId)

    // Route Guard for authenticated pages
    if (page === 'admin' || page === 'superadmin') {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setCurrentPage('admin-login')
        return
      }
    }
    
    setCurrentPage(page)
  }

  const handleLoginSuccess = (user) => {
    setCurrentUser(user)
    if (user.role === 'superadmin') {
      navigateTo('superadmin')
    } else {
      navigateTo('admin')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_role')
    localStorage.removeItem('user_email')
    localStorage.removeItem('company_name')
    localStorage.removeItem('company_id')
    setCurrentUser(null)
    navigateTo('landing')
  }

  return (
    <div className="app-container">
      {/* PUBLIC: Marketing Landing Page */}
      {currentPage === 'landing' && (
        <LandingPage 
          onRecruiterLogin={() => navigateTo('admin-login')}
          onCandidateExam={() => navigateTo('exam-entry')}
        />
      )}

      {/* PUBLIC: Candidate Exam Entry */}
      {currentPage === 'exam-entry' && (
        <ExamEntry 
          onStartInterview={(sessId) => navigateTo('interview', sessId)} 
          onBackToLanding={() => navigateTo('landing')}
        />
      )}

      {/* PUBLIC: Active Interview Session */}
      {currentPage === 'interview' && (
        <InterviewSession 
          sessionId={activeSessionId} 
          jobId={activeJobId} 
          onEndInterview={(sessId) => navigateTo('thank-you', sessId)} 
          onBackToDashboard={() => navigateTo('exam-entry')}
        />
      )}
      
      {/* PUBLIC: Thank You page after exam */}
      {currentPage === 'thank-you' && (
        <ThankYou 
          onReturnHome={() => navigateTo('landing')}
        />
      )}

      {/* PUBLIC: Results page (linked from admin dashboard) */}
      {currentPage === 'results' && (
        <Results 
          sessionId={activeSessionId} 
          onBackToDashboard={() => {
            const role = localStorage.getItem('user_role')
            navigateTo(role === 'superadmin' ? 'superadmin' : 'admin')
          }} 
        />
      )}

      {/* AUTH: Login Page */}
      {currentPage === 'admin-login' && (
        <AdminLogin 
          onLoginSuccess={handleLoginSuccess}
          onBackToLanding={() => navigateTo('landing')}
        />
      )}

      {/* AUTH: Recruiter Admin Dashboard */}
      {currentPage === 'admin' && (
        <AdminDashboard 
          onBackToDashboard={() => navigateTo('landing')}
          onLogout={handleLogout}
        />
      )}

      {/* AUTH: Platform Superadmin Dashboard */}
      {currentPage === 'superadmin' && (
        <SuperAdminDashboard 
          onLogout={handleLogout}
        />
      )}
    </div>
  )
}

export default App
