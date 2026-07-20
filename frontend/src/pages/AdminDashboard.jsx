import React, { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import ResumeUploader from '../components/ResumeUploader.jsx'
import { 
  Users, Briefcase, Calendar, Award, Code2, 
  Trash2, Edit, Plus, X, Search, Sparkles, 
  ArrowLeft, MessageSquare, BookOpen, Volume2, 
  Mail, Play, CheckCircle2, ChevronDown, ChevronUp, Loader2,
  Sliders, LogOut, Info, Copy, Shield, HelpCircle, RefreshCw, Database, Pause
} from 'lucide-react'

// `seconds_elapsed` is stored relative to session.started_at, which is stamped when the
// candidate first opens the exam page. If they then idle (or abandon and return hours later)
// every timeline is dominated by dead time — e.g. a 55-minute exam rendering across a 12.8-hour
// span, crushing the replay scrubber and proctoring markers against the right edge.
// Rebasing against the earliest recorded activity gives a meaningful "time spent working" axis.
// Kept display-side on purpose so stored values remain an accurate audit trail.
const getActivityBaseline = (detail) => {
  if (!detail) return 0
  const times = [
    ...(detail.code_keystroke_logs || []).map(l => l.seconds_elapsed || 0),
    ...(detail.proctoring_events || []).map(e => e.seconds_elapsed || 0)
  ]
  return times.length ? Math.min(...times) : 0
}

const formatElapsed = (secs) => {
  const total = Math.max(0, Math.round(secs || 0))
  const m = Math.floor(total / 60)
  return `${m}m ${String(total % 60).padStart(2, '0')}s`
}

function AdminDashboard({ onBackToDashboard, onLogout }) {
  const [activeTab, setActiveTab] = useState('submissions') // 'submissions' | 'jobs' | 'settings'
  const [sessions, setSessions] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Modals / Selection states
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [sessionDetail, setSessionDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [inspectorActiveIndex, setInspectorActiveIndex] = useState(0)
  const [showUploaderModal, setShowUploaderModal] = useState(false)
  
  // Playback Control States
  const [playbackActive, setPlaybackActive] = useState(false)
  const [playbackIndex, setPlaybackIndex] = useState(-1) // -1 means final code display
  const [playbackSpeed, setPlaybackSpeed] = useState(1) // 1x, 2x, 5x
  const playbackIntervalRef = useRef(null)
  
  // Job Form state
  const [editingJobId, setEditingJobId] = useState(null)
  const [jobTitle, setJobTitle] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [jobSkills, setJobSkills] = useState('')
  const [interviewerPersona, setInterviewerPersona] = useState('standard')
  const [showJobForm, setShowJobForm] = useState(false)
  const [analytics, setAnalytics] = useState(null)
  
  // Search
  const [searchTerm, setSearchTerm] = useState('')
  
  // Email sending loading states
  const [sendingEmailId, setSendingEmailId] = useState(null)

  // Exam Management States
  const [expandedExamsJobId, setExpandedExamsJobId] = useState(null)
  const [jobExams, setJobExams] = useState({}) // job_id -> exams list
  const [examsLoading, setExamsLoading] = useState(false)
  
  // AI Exam suggestion states
  const [suggestingAI, setSuggestingAI] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState(null) // Suggestion details
  
  // Custom manual exam creation form state
  const [showExamForm, setShowExamForm] = useState(false)
  const [examTitle, setExamTitle] = useState('')
  const [examStatement, setExamStatement] = useState('')
  const [examCode, setExamCode] = useState('')
  const [examDifficulty, setExamDifficulty] = useState('medium')
  const [examQuestionsJson, setExamQuestionsJson] = useState('')
  const [examTestCasesCode, setExamTestCasesCode] = useState('')
  const [showTestBank, setShowTestBank] = useState(false)
  const [testBankChallenges, setTestBankChallenges] = useState([])
  const [testBankLoading, setTestBankLoading] = useState(false)

  // SYSTEM / AI SETTINGS STATE
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [aiModel, setAiModel] = useState('gemini-3.5-flash')
  const [aiTemp, setAiTemp] = useState(0.7)
  const [aiPersonaModifier, setAiPersonaModifier] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [helpActiveTab, setHelpActiveTab] = useState('getting-started')
  const [settingsSuccess, setSettingsSuccess] = useState(false)

  useEffect(() => {
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current)
      playbackIntervalRef.current = null
    }
    setPlaybackActive(false)
    setPlaybackIndex(-1)
  }, [selectedSessionId])

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

  const formatMessageText = (text) => {
    if (!text) return '';
    // Escape HTML to prevent injection
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 1. Code blocks: ```language ... ```
    html = html.replace(/```(?:[a-zA-Z0-9]+)?([\s\S]*?)```/g, (match, code) => {
      return `<pre class="chat-code-block"><code>${code.trim()}</code></pre>`;
    });

    // 2. Inline code: `code`
    html = html.replace(/`([^`\n]+?)`/g, '<code class="chat-inline-code">$1</code>');

    // 3. Headers: ### text, ## text, # text
    html = html.replace(/^(?:###|##|#)\s+(.+)$/gm, '<strong>$1</strong>');

    // 4. Bold text: **text**
    html = html.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>');

    // 5. Bullet points list items
    html = html.replace(/^\s*[\*\-]\s+(.+)$/gm, '<li class="chat-bullet-item">$1</li>');

    // 6. Ordered list items (e.g. 1. text)
    html = html.replace(/^\s*(\d+)\.\s+(.+)$/gm, '<li class="chat-ordered-item" style="list-style-type: decimal; margin-left: 1rem;">$2</li>');

    // 7. Line breaks
    html = html.replace(/\n/g, '<br />');

    return html;
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (activeTab === 'settings') {
      fetchSystemSettings()
    }
  }, [activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      const sessRes = await authFetch(`${API_URL}/api/v1/admin/sessions`)
      const sessData = await sessRes.json()
      setSessions(sessData)

      const jobsRes = await authFetch(`${API_URL}/api/v1/resumes/jobs`)
      const jobsData = await jobsRes.json()
      setJobs(jobsData)
      
      const analRes = await authFetch(`${API_URL}/api/v1/admin/analytics`)
      if (analRes.ok) {
        const analData = await analRes.json()
        setAnalytics(analData)
      }
    } catch (err) {
      console.error(err)
      alert('Failed to connect to administrative endpoints.')
    } finally {
      setLoading(false)
    }
  }

  // Load candidate full details for inspector
  const handleInspectSession = async (sessId) => {
    setSelectedSessionId(sessId)
    setDetailLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/v1/admin/sessions/${sessId}`)
      const data = await res.json()
      setSessionDetail(data)
      setInspectorActiveIndex(0)
    } catch (err) {
      console.error(err)
      alert('Could not retrieve candidate logs.')
      setSelectedSessionId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleTogglePlayback = () => {
    if (playbackActive) {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
        playbackIntervalRef.current = null
      }
      setPlaybackActive(false)
    } else {
      const logs = (sessionDetail?.code_keystroke_logs || []).filter(log => log.question_index === inspectorActiveIndex);
      if (logs.length === 0) {
        alert('No keystroke recordings found for this challenge.');
        return;
      }
      
      setPlaybackActive(true)
      
      let nextIndex = playbackIndex;
      if (nextIndex >= logs.length - 1 || nextIndex === -1) {
        nextIndex = 0;
        setPlaybackIndex(0);
      }
      
      playbackIntervalRef.current = setInterval(() => {
        setPlaybackIndex((prev) => {
          const next = prev + 1;
          if (next >= logs.length) {
            if (playbackIntervalRef.current) {
              clearInterval(playbackIntervalRef.current)
              playbackIntervalRef.current = null
            }
            setPlaybackActive(false)
            return prev;
          }
          return next;
        });
      }, 1000 / playbackSpeed);
    }
  }

  useEffect(() => {
    if (playbackActive) {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current)
      }
      const logs = (sessionDetail?.code_keystroke_logs || []).filter(log => log.question_index === inspectorActiveIndex);
      
      playbackIntervalRef.current = setInterval(() => {
        setPlaybackIndex((prev) => {
          const next = prev + 1;
          if (next >= logs.length) {
            if (playbackIntervalRef.current) {
              clearInterval(playbackIntervalRef.current)
              playbackIntervalRef.current = null
            }
            setPlaybackActive(false)
            return prev;
          }
          return next;
        });
      }, 1000 / playbackSpeed);
    }
  }, [playbackSpeed])

  useEffect(() => {
    // Reset playback frame on active question switch
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current)
      playbackIntervalRef.current = null
    }
    setPlaybackActive(false)
    setPlaybackIndex(-1)
  }, [inspectorActiveIndex])

  const handleResetSession = async (sessId) => {
    if (!window.confirm('Are you sure you want to reset this session? This will clear the chat history and grading scorecard, and re-enable the candidate to take the exam.')) return
    
    setDetailLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/v1/interviews/session/${sessId}/reset`, {
        method: 'POST'
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Reset failed')
      alert(data.message)
      // Re-fetch inspector details and table data
      await handleInspectSession(sessId)
      fetchData()
    } catch (err) {
      console.error(err)
      alert(err.message || 'Could not reset session.')
    } finally {
      setDetailLoading(false)
    }
  }

  // Delete candidate session
  const handleDeleteSession = async (sessId, e) => {
    e.stopPropagation()
    if (!window.confirm('Are you sure you want to delete this candidate submission log? This action is irreversible.')) return

    try {
      const res = await authFetch(`${API_URL}/api/v1/admin/sessions/${sessId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Deletion failed')
      setSessions(sessions.filter(s => s.session_id !== sessId))
    } catch (err) {
      console.error(err)
      alert('Failed to delete session.')
    }
  }

  // Email invitation link to candidate
  const handleSendEmailInvite = async (sessId, e) => {
    if (e) e.stopPropagation()
    setSendingEmailId(sessId)
    try {
      const res = await authFetch(`${API_URL}/api/v1/interviews/session/${sessId}/email-invite`, {
        method: 'POST'
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Email failed')
      alert(data.message)
    } catch (err) {
      console.error(err)
      alert(`Email Invite Failed: ${err.message}`)
    } finally {
      setSendingEmailId(null)
    }
  }

  // Create or Update Job
  const handleJobSubmit = async (e) => {
    e.preventDefault()
    if (!jobTitle || !jobDescription || !jobSkills) {
      alert('Please fill out all fields')
      return
    }

    const payload = {
      title: jobTitle,
      description: jobDescription,
      required_skills: jobSkills,
      interviewer_persona: interviewerPersona
    }

    try {
      if (editingJobId) {
        const res = await authFetch(`${API_URL}/api/v1/resumes/jobs/${editingJobId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error('Failed to update job')
      } else {
        const res = await authFetch(`${API_URL}/api/v1/resumes/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error('Failed to create job')
      }

      setJobTitle('')
      setJobDescription('')
      setJobSkills('')
      setInterviewerPersona('standard')
      setEditingJobId(null)
      setShowJobForm(false)
      fetchData()
    } catch (err) {
      console.error(err)
      alert(err.message)
    }
  }

  const startEditJob = (job) => {
    setEditingJobId(job.id)
    setJobTitle(job.title)
    setJobDescription(job.description)
    setJobSkills(job.required_skills)
    setInterviewerPersona(job.interviewer_persona || 'standard')
    setShowJobForm(true)
  }

  const handleDeleteJob = async (jobId) => {
    if (!window.confirm('Are you sure you want to delete this job posting?')) return

    try {
      const res = await authFetch(`${API_URL}/api/v1/resumes/jobs/${jobId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to delete job')
      
      setJobs(jobs.filter(j => j.id !== jobId))
    } catch (err) {
      console.error(err)
      alert(err.message)
    }
  }

  // EXAMS MANAGEMENT CALLS
  const toggleExamsDropdown = async (jobId) => {
    if (expandedExamsJobId === jobId) {
      setExpandedExamsJobId(null)
      return
    }
    setExpandedExamsJobId(jobId)
    fetchJobExams(jobId)
  }

  const fetchJobExams = async (jobId) => {
    setExamsLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/v1/resumes/jobs/${jobId}/exams`)
      const data = await res.json()
      setJobExams(prev => ({ ...prev, [jobId]: data }))
    } catch (err) {
      console.error(err)
    } finally {
      setExamsLoading(false)
    }
  }

  // Request AI suggested exam from Gemini
  const handleRequestAISuggestion = async (jobId) => {
    setSuggestingAI(true)
    setAiSuggestion(null)
    setShowExamForm(false)
    try {
      const res = await authFetch(`${API_URL}/api/v1/resumes/jobs/${jobId}/exams/ai-suggest`, {
        method: 'POST'
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to fetch suggestions')
      
      setAiSuggestion(data)
      // Autofill suggestion fields for review (note: mapping challenge_title from schema)
      setExamTitle(data.challenge_title)
      setExamStatement(data.problem_statement)
      setExamCode(data.starter_code)
      setExamDifficulty(data.difficulty)
      setShowExamForm(true)
    } catch (err) {
      console.error(err)
      alert(`AI Suggestion Error: ${err.message}`)
    } finally {
      setSuggestingAI(false)
    }
  }

  // Save manual/AI exam to Database
  const handleSaveExam = async (jobId) => {
    if (!examTitle || !examStatement || !examCode) {
      alert('Please fill out all exam fields')
      return
    }

    const payload = {
      title: examTitle,
      problem_statement: examStatement,
      starter_code: examCode,
      difficulty: examDifficulty,
      questions_json: examQuestionsJson || null,
      test_cases_code: examTestCasesCode || null
    }

    try {
      const res = await authFetch(`${API_URL}/api/v1/resumes/jobs/${jobId}/exams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to save exam template')
      
      // Reset & refresh
      setExamTitle('')
      setExamStatement('')
      setExamCode('')
      setExamDifficulty('medium')
      setExamQuestionsJson('')
      setExamTestCasesCode('')
      setShowExamForm(false)
      setAiSuggestion(null)
      fetchJobExams(jobId)
    } catch (err) {
      console.error(err)
      alert(err.message)
    }
  }

  const handleFetchTestBank = async () => {
    setTestBankLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/v1/resumes/test-bank`)
      if (!res.ok) throw new Error('Failed to load test bank')
      const data = await res.json()
      setTestBankChallenges(data)
      setShowTestBank(true)
    } catch (err) {
      console.error(err)
      alert(err.message || 'Could not fetch test bank')
    } finally {
      setTestBankLoading(false)
    }
  }

  // Toggle Exam Active Status
  const handleActivateExam = async (jobId, examId) => {
    try {
      const res = await authFetch(`${API_URL}/api/v1/resumes/jobs/${jobId}/exams/${examId}/activate`, {
        method: 'PUT'
      })
      if (!res.ok) throw new Error('Failed to activate exam')
      fetchJobExams(jobId)
    } catch (err) {
      console.error(err)
      alert(err.message)
    }
  }

  // Delete Exam template
  const handleDeleteExam = async (jobId, examId) => {
    if (!window.confirm('Are you sure you want to delete this exam template?')) return
    try {
      const res = await authFetch(`${API_URL}/api/v1/resumes/jobs/${jobId}/exams/${examId}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to delete exam')
      fetchJobExams(jobId)
    } catch (err) {
      console.error(err)
      alert(err.message)
    }
  }

  // SYSTEM SETTINGS CALLS
  const fetchSystemSettings = async () => {
    setSettingsLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/v1/admin/settings`)
      const data = await res.json()
      setAiTemp(data.temperature)
      setAiPersonaModifier(data.system_prompt_modifier || '')
      setApiKeyConfigured(data.api_key_configured)
      setApiKey(data.api_key_configured ? '••••••••' : '')
      setWebhookUrl(data.webhook_url || '')
    } catch (err) {
      console.error('Failed to load system settings:', err)
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleSettingsSave = async (e) => {
    e.preventDefault()
    setSettingsSuccess(false)

    let keyToSend = apiKey
    if (apiKey === '' && apiKeyConfigured) {
      keyToSend = 'CLEAR'
    }

    try {
      const res = await authFetch(`${API_URL}/api/v1/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          temperature: aiTemp,
          system_prompt_modifier: aiPersonaModifier,
          api_key: keyToSend,
          webhook_url: webhookUrl
        })
      })
      if (!res.ok) throw new Error('Failed to save settings')
      const data = await res.json()
      setApiKeyConfigured(data.api_key_configured)
      setApiKey(data.api_key_configured ? '••••••••' : '')
      setWebhookUrl(data.webhook_url || '')
      setSettingsSuccess(true)
      setTimeout(() => setSettingsSuccess(false), 3000)
    } catch (err) {
      console.error(err)
      alert('Error saving system settings.')
    }
  }

  const [copiedSessionId, setCopiedSessionId] = useState(null)

  const handleCopyInviteLink = (token, e) => {
    e.stopPropagation() // Prevent row click inspection trigger
    const link = `${window.location.origin}/?session_id=${token}`

    // navigator.clipboard only exists in a secure context (https:// or localhost) — fall
    // back to a manual copy prompt instead of failing silently on plain http:// or an
    // insecure/self-signed origin the browser hasn't fully trusted.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link)
        .then(() => {
          setCopiedSessionId(token)
          setTimeout(() => setCopiedSessionId(null), 2000)
        })
        .catch((err) => {
          console.error(err)
          window.prompt('Could not access the clipboard automatically. Copy the link manually:', link)
        })
    } else {
      window.prompt('Clipboard access is unavailable on this connection. Copy the link manually:', link)
    }
  }

  // Search filter
  const filteredSessions = sessions.filter(s => 
    s.candidate_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.job_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.candidate_email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Markdown rendering helper
  const renderMarkdown = (text) => {
    if (!text) return ''
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('# ')) return <h1 key={idx} className="admin-md-h1">{line.substring(2)}</h1>
      if (line.startsWith('## ')) return <h2 key={idx} className="admin-md-h2">{line.substring(3)}</h2>
      if (line.startsWith('### ')) return <h3 key={idx} className="admin-md-h3">{line.substring(4)}</h3>
      if (line.startsWith('- ') || line.startsWith('* ')) return <li key={idx} className="admin-md-li">{line.substring(2)}</li>
      return <p key={idx} className="admin-md-p">{line}</p>
    })
  }

  return (
    <div className="admin-dashboard-page animate-fade-in">
      <header className="admin-header">
        <div className="header-left">
          <button onClick={onBackToDashboard} className="back-btn" title="Back to Dashboard">
            <ArrowLeft size={16} />
          </button>
          <div className="header-info">
            <h2>Administrative Workspace</h2>
            <span>Recruiter Console</span>
          </div>
        </div>
        <div className="header-actions">
          <span className="admin-badge mr-2">
            <Sparkles size={14} /> Admin Mode
          </span>
          <button onClick={() => setShowHelpModal(true)} className="help-btn" title="Recruiter Help Guide">
            <HelpCircle size={16} />
            <span>Help Guide</span>
          </button>
          <button onClick={onLogout} className="logout-btn" title="Log Out">
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      <main className="admin-content">
        <div className="tab-bar">
          <button 
            onClick={() => setActiveTab('submissions')} 
            className={`tab-btn ${activeTab === 'submissions' ? 'active' : ''}`}
          >
            <Users size={18} />
            Candidate Submissions ({sessions.length})
          </button>
          <button 
            onClick={() => setActiveTab('jobs')} 
            className={`tab-btn ${activeTab === 'jobs' ? 'active' : ''}`}
          >
            <Briefcase size={18} />
            Job Postings ({jobs.length})
          </button>
          <button 
            onClick={() => setActiveTab('settings')} 
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          >
            <Sliders size={18} />
            AI Provider Settings
          </button>
        </div>

        {loading && activeTab !== 'settings' ? (
          <div className="admin-loading">
            <div className="spinner"></div>
            <span>Fetching recruiter dashboard records...</span>
          </div>
        ) : (
          <div className="tab-pane-container">
            {/* SESSIONS / SUBMISSIONS TAB */}
            {activeTab === 'submissions' && (
              <div className="submissions-pane" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
                
                {/* Visual Analytics Dashboard */}
                {analytics && (
                  <div className="glass-panel analytics-card animate-fade-in" style={{ padding: '2rem', borderRadius: '16px' }}>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Sliders size={20} style={{ color: 'var(--primary)' }} /> Recruiting Insights & Talent Pool Analytics
                    </h3>
                    
                    {/* Stat Cards */}
                    <div className="analytics-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.75rem' }}>
                      <div className="glass-panel stat-card" style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Active Interviews</span>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--primary)', marginTop: '0.25rem' }}>{analytics.active_count}</div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total invitees: {analytics.total_sessions} candidates</span>
                      </div>
                      
                      <div className="glass-panel stat-card" style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Avg Candidate Score</span>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.25rem' }}>{analytics.avg_score}%</div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Across {analytics.graded_count} graded exams</span>
                      </div>

                      <div className="glass-panel stat-card" style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Candidate Integrity</span>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', marginTop: '0.25rem' }}>{analytics.avg_integrity}%</div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Compliance average rating</span>
                      </div>

                      <div className="glass-panel stat-card" style={{ padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Job Postings</span>
                        <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--warning)', marginTop: '0.25rem' }}>{analytics.jobs_count}</div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active hiring templates</span>
                      </div>
                    </div>

                    {/* Chart and Skills Grid */}
                    <div className="analytics-details-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                      
                      {/* Score Distribution Chart */}
                      <div className="glass-panel chart-section" style={{ padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                        <h4 style={{ fontSize: '0.95rem', margin: '0 0 1.25rem 0', color: 'var(--text-primary)' }}>Fit Score Distribution</h4>
                        {analytics.graded_count === 0 ? (
                          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            No candidate evaluations have been graded yet.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* High Fit */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
                                <span style={{ color: '#10b981', fontWeight: 600 }}>High Fit (80 - 100)</span>
                                <span>{analytics.score_distribution.high_fit} candidates ({Math.round((analytics.score_distribution.high_fit / analytics.graded_count) * 100)}%)</span>
                              </div>
                              <div style={{ height: '8px', background: 'var(--bg-surface-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: 'var(--success)', width: `${(analytics.score_distribution.high_fit / analytics.graded_count) * 100}%`, borderRadius: '999px' }}></div>
                              </div>
                            </div>

                            {/* Passing */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
                                <span style={{ color: '#f59e0b', fontWeight: 600 }}>Medium Fit (60 - 79)</span>
                                <span>{analytics.score_distribution.passing} candidates ({Math.round((analytics.score_distribution.passing / analytics.graded_count) * 100)}%)</span>
                              </div>
                              <div style={{ height: '8px', background: 'var(--bg-surface-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: 'var(--warning)', width: `${(analytics.score_distribution.passing / analytics.graded_count) * 100}%`, borderRadius: '999px' }}></div>
                              </div>
                            </div>

                            {/* Needs Review */}
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.4rem' }}>
                                <span style={{ color: '#ef4444', fontWeight: 600 }}>Needs Review (&lt; 60)</span>
                                <span>{analytics.score_distribution.needs_review} candidates ({Math.round((analytics.score_distribution.needs_review / analytics.graded_count) * 100)}%)</span>
                              </div>
                              <div style={{ height: '8px', background: 'var(--bg-surface-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: 'var(--danger)', width: `${(analytics.score_distribution.needs_review / analytics.graded_count) * 100}%`, borderRadius: '999px' }}></div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Top Skills Cloud */}
                      <div className="glass-panel skills-section" style={{ padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                        <h4 style={{ fontSize: '0.95rem', margin: '0 0 1.25rem 0', color: 'var(--text-primary)' }}>Top In-Demand Skills in Talent Pool</h4>
                        {analytics.top_skills.length === 0 ? (
                          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            Upload resumes to view candidate skills analytics.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignContent: 'flex-start', minHeight: '120px' }}>
                            {analytics.top_skills.map((item, idx) => {
                              const colors = ['var(--primary)', 'var(--success)', 'var(--accent)', 'var(--warning)', 'var(--info)', '#a855f7'];
                              const color = colors[idx % colors.length];
                              return (
                                <div 
                                  key={idx} 
                                  className="skill-cloud-tag"
                                  style={{
                                    padding: '0.4rem 0.85rem',
                                    borderRadius: '8px',
                                    background: 'var(--bg-surface)',
                                    border: `1px solid var(--border)`,
                                    color: 'var(--text-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: idx === 0 ? '0.95rem' : idx < 3 ? '0.85rem' : '0.75rem',
                                    fontWeight: idx === 0 ? '700' : '500',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                  }}
                                >
                                  <span style={{ color: color }}>●</span>
                                  <span>{item.skill}</span>
                                  <span style={{ fontSize: '0.7rem', background: 'var(--bg-surface-elevated)', color: 'var(--text-secondary)', padding: '1px 5px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                                    {item.count}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}

                {/* Submissions List Panel */}
                <div className="submissions-list-card glass-panel" style={{ padding: '2rem', borderRadius: '16px' }}>
                  <div className="pane-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                    <div className="search-box" style={{ flex: 1, minWidth: '280px' }}>
                      <Search className="search-icon" size={18} />
                      <input 
                        type="text" 
                        placeholder="Search by candidate name, job title, email..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                      />
                    </div>
                    <button 
                      onClick={() => setShowUploaderModal(true)} 
                      className="gradient-btn match-cand-btn"
                      style={{
                        borderRadius: '8px',
                        padding: '0.65rem 1.25rem',
                        fontSize: '0.85rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        height: 'fit-content',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <Plus size={16} /> Match Candidate & Create Session
                    </button>
                  </div>

                  {showUploaderModal && (
                    <div className="uploader-modal-overlay" style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(0,0,0,0.7)',
                      backdropFilter: 'blur(8px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 9999,
                      padding: '2rem'
                    }}>
                      <div className="uploader-modal-card glass-panel" style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: '800px',
                        borderRadius: '24px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-base)',
                        overflow: 'hidden',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        <div className="uploader-modal-header" style={{
                          padding: '1.5rem 2.5rem 0.5rem 2.5rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderBottom: '1px solid var(--border)'
                        }}>
                          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Create Candidate Exam Session</h3>
                          <button 
                            onClick={() => {
                              setShowUploaderModal(false);
                              fetchData(); // Refresh submissions list
                            }} 
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: '0.25rem',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <X size={20} />
                          </button>
                        </div>
                        <div className="uploader-modal-body" style={{
                          overflowY: 'auto',
                          flex: 1
                        }}>
                          <ResumeUploader onStartInterview={(sessId) => {
                            setShowUploaderModal(false);
                            fetchData();
                          }} />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="table-scroller">
                    <table className="sessions-table">
                      <thead>
                        <tr>
                          <th>Candidate</th>
                          <th>Target Job</th>
                          <th>Status</th>
                          <th>Session Score</th>
                          <th>Started At</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSessions.map((s) => (
                          <tr key={s.session_id} onClick={() => handleInspectSession(s.session_id)} className="clickable-row">
                            <td>
                              <div className="cand-meta">
                                <span className="cand-name">{s.candidate_name}</span>
                                <span className="cand-email">{s.candidate_email}</span>
                              </div>
                            </td>
                            <td><span className="job-tag">{s.job_title}</span></td>
                            <td>
                              <span className={`status-badge ${s.status}`}>
                                {s.status.toUpperCase()}
                              </span>
                            </td>
                            <td>
                              <span className="score-badge" style={{
                                fontWeight: '700',
                                color: s.overall_score >= 80 ? 'var(--success)' : s.overall_score >= 60 ? 'var(--warning)' : s.overall_score ? 'var(--danger)' : 'var(--text-secondary)'
                              }}>
                                {s.overall_score !== null ? `${s.overall_score}%` : 'Pending'}
                              </span>
                            </td>
                            <td><span className="date-display">{new Date(s.started_at).toLocaleDateString()}</span></td>
                            <td>
                              <div className="actions-cell" onClick={(e) => e.stopPropagation()}>
                                <button 
                                  onClick={() => handleInspectSession(s.session_id)}
                                  className="inspect-action-btn"
                                  title="Inspect Scorecard & Logs"
                                >
                                  <Info size={16} />
                                </button>
                                <button 
                                  onClick={(e) => handleCopyInviteLink(s.session_token || s.session_id, e)}
                                  className="copy-action-btn"
                                  title={copiedSessionId === (s.session_token || s.session_id) ? "Copied!" : "Copy Invitation Link"}
                                >
                                  {copiedSessionId === (s.session_token || s.session_id) ? (
                                    <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
                                  ) : (
                                    <Copy size={16} />
                                  )}
                                </button>
                                <button 
                                  onClick={(e) => handleDeleteSession(s.session_id, e)} 
                                  className="delete-action-btn"
                                  title="Delete Session Log"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredSessions.length === 0 && (
                          <tr>
                            <td colSpan="6" className="no-records">No candidate logs found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* JOBS TAB */}
            {activeTab === 'jobs' && (
              <div className="jobs-pane">
                <div className="jobs-header-actions">
                  <h3>Manage Open Positions</h3>
                  {!showJobForm && (
                    <button onClick={() => setShowJobForm(true)} className="gradient-btn add-job-btn">
                      <Plus size={18} />
                      Post New Position
                    </button>
                  )}
                </div>

                {showJobForm && (
                  <div className="glass-panel job-form-card animate-fade-in">
                    <h4>{editingJobId ? 'Edit Job Posting' : 'Add New Job Posting'}</h4>
                    <form onSubmit={handleJobSubmit} className="job-form">
                      <div className="form-group">
                        <label className="form-label">Job Title</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Lead React Developer"
                          value={jobTitle} 
                          onChange={(e) => setJobTitle(e.target.value)}
                          className="form-input"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Job Description</label>
                        <textarea 
                          placeholder="Provide target parameters, daily expectations, and role scopes..."
                          value={jobDescription}
                          onChange={(e) => setJobDescription(e.target.value)}
                          className="form-textarea"
                          rows="4"
                          required
                        ></textarea>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Required Skills (Comma-separated)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. React, TypeScript, CSS, System Design"
                          value={jobSkills}
                          onChange={(e) => setJobSkills(e.target.value)}
                          className="form-input"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">AI Interviewer Persona</label>
                        <select 
                          value={interviewerPersona}
                          onChange={(e) => setInterviewerPersona(e.target.value)}
                          className="form-input"
                          style={{ backgroundColor: 'var(--bg-surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                        >
                          <option value="mentor">🟢 Encouraging Mentor (generous hints, friendly support)</option>
                          <option value="standard">🟡 Standard AI Interviewer (balanced technical assessment)</option>
                          <option value="tech_lead">🔴 Rigorous Tech Lead (asks Big O, boundary tests, strict)</option>
                        </select>
                      </div>
                      <div className="form-actions">
                        <button 
                          type="button" 
                          onClick={() => {
                            setShowJobForm(false)
                            setEditingJobId(null)
                            setJobTitle('')
                            setJobDescription('')
                            setJobSkills('')
                            setInterviewerPersona('standard')
                          }} 
                          className="btn-cancel"
                        >
                          Cancel
                        </button>
                        <button type="submit" className="gradient-btn submit-job-btn">
                          {editingJobId ? 'Save Changes' : 'Publish Job'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="jobs-list">
                  {jobs.map((job) => (
                    <div key={job.id} className="glass-panel job-card">
                      <div className="job-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <h4 style={{ margin: 0 }}>{job.title}</h4>
                          {job.interviewer_persona === 'mentor' && (
                            <span className="persona-badge persona-mentor">🟢 Mentor</span>
                          )}
                          {job.interviewer_persona === 'tech_lead' && (
                            <span className="persona-badge persona-tech-lead">🔴 Tech Lead</span>
                          )}
                          {(!job.interviewer_persona || job.interviewer_persona === 'standard') && (
                            <span className="persona-badge persona-standard">🟡 Standard</span>
                          )}
                        </div>
                        <div className="job-card-actions">
                          <button onClick={() => startEditJob(job)} className="edit-btn" title="Edit Job">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => handleDeleteJob(job.id)} className="delete-btn" title="Delete Job">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      
                      <p className="job-card-desc">{job.description}</p>
                      
                      <div className="job-card-skills">
                        {job.required_skills.split(',').map((skill, i) => (
                          <span key={i} className="job-skill-pill">{skill.trim()}</span>
                        ))}
                      </div>

                      {/* JOB EXAMS MANAGER FOOTER */}
                      <div className="job-exams-section">
                        <button 
                          type="button" 
                          onClick={() => toggleExamsDropdown(job.id)}
                          className="exams-toggle-btn"
                        >
                          <span>Manage Exam Options</span>
                          {expandedExamsJobId === job.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>

                        {expandedExamsJobId === job.id && (
                          <div className="exams-dropdown-panel animate-fade-in">
                            <div className="exams-panel-actions">
                              <button 
                                type="button" 
                                onClick={() => handleRequestAISuggestion(job.id)} 
                                disabled={suggestingAI}
                                className="ai-suggest-btn"
                              >
                                {suggestingAI ? (
                                  <>
                                    <Loader2 className="animate-spin" size={14} />
                                    <span>Generating Suggestion...</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles size={14} />
                                    <span>AI Suggest Exam</span>
                                  </>
                                )}
                              </button>
                              <button 
                                type="button" 
                                onClick={() => {
                                  setAiSuggestion(null)
                                  setExamTitle('')
                                  setExamStatement('')
                                  setExamCode('')
                                  setShowExamForm(!showExamForm)
                                }} 
                                className="manual-exam-btn"
                              >
                                <Plus size={14} />
                                <span>Create Custom Exam</span>
                              </button>
                              <button 
                                type="button" 
                                onClick={handleFetchTestBank} 
                                disabled={testBankLoading}
                                className="manual-exam-btn"
                                style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border)' }}
                              >
                                {testBankLoading ? (
                                  <>
                                    <Loader2 className="animate-spin" size={14} />
                                    <span>Loading...</span>
                                  </>
                                ) : (
                                  <>
                                    <Database size={14} />
                                    <span>Browse Test Bank</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Exam Creation / Review suggestion form */}
                            {showExamForm && (
                              <div className="exam-create-form glass-panel">
                                <h5>{aiSuggestion ? 'Review AI Generated Exam Suggestion' : 'Create Custom Exam Template'}</h5>
                                <div className="form-group mt-2">
                                  <label className="form-label-small">Exam Title</label>
                                  <input 
                                    type="text" 
                                    value={examTitle}
                                    onChange={(e) => setExamTitle(e.target.value)}
                                    className="form-input-small"
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label-small">Difficulty</label>
                                  <select 
                                    value={examDifficulty}
                                    onChange={(e) => setExamDifficulty(e.target.value)}
                                    className="form-select-small"
                                  >
                                    <option value="easy">Easy</option>
                                    <option value="medium">Medium</option>
                                    <option value="hard">Hard</option>
                                  </select>
                                </div>
                                <div className="form-group">
                                  <label className="form-label-small">Problem Statement (Markdown)</label>
                                  <textarea 
                                    value={examStatement}
                                    onChange={(e) => setExamStatement(e.target.value)}
                                    className="form-textarea-small"
                                    rows="4"
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label-small">Starter Code Template</label>
                                  <textarea 
                                    value={examCode}
                                    onChange={(e) => setExamCode(e.target.value)}
                                    className="form-textarea-small font-mono"
                                    rows="3"
                                  />
                                </div>
                                <div className="exam-form-buttons">
                                  <button type="button" onClick={() => setShowExamForm(false)} className="btn-cancel-small">Cancel</button>
                                  <button type="button" onClick={() => handleSaveExam(job.id)} className="btn-save-small">Save Exam Template</button>
                                </div>
                              </div>
                            )}

                            {/* Exams Template List */}
                            {examsLoading ? (
                              <div className="exams-panel-loading">Loading templates...</div>
                            ) : (
                              <div className="exams-templates-list">
                                {(jobExams[job.id] || []).map((exam) => (
                                  <div key={exam.id} className={`exam-template-row ${exam.is_active ? 'active' : ''}`}>
                                    <div className="exam-row-left">
                                      <div className="exam-row-meta">
                                        <span className="exam-row-title">{exam.title}</span>
                                        <span className={`difficulty-tag ${exam.difficulty}`}>{exam.difficulty.toUpperCase()}</span>
                                      </div>
                                    </div>
                                    <div className="exam-row-right">
                                      <button 
                                        type="button" 
                                        onClick={() => handleActivateExam(job.id, exam.id)}
                                        className={`activate-exam-btn ${exam.is_active ? 'active' : ''}`}
                                        disabled={exam.is_active}
                                      >
                                        {exam.is_active ? 'Selected Active' : 'Set Active'}
                                      </button>
                                      <button 
                                        type="button" 
                                        onClick={() => handleDeleteExam(job.id, exam.id)}
                                        className="delete-exam-row-btn"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                {(!jobExams[job.id] || jobExams[job.id].length === 0) && (
                                  <div className="no-exams-configured">
                                    No custom exams configured. Dynamic prompt generation will run on fallback.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI PROVIDER SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div className="settings-pane glass-panel">
                {settingsLoading ? (
                  <div className="settings-loading">
                    <div className="spinner"></div>
                    <span>Loading settings configuration...</span>
                  </div>
                ) : (
                  <form onSubmit={handleSettingsSave} className="settings-form">
                    <div className="settings-section-header">
                      <h3>Gemini Model Configurations</h3>
                      <p>Adjust the engine, temperature, and recruiter prompt rules applied during interview sessions.</p>
                    </div>

                    {settingsSuccess && (
                      <div className="settings-success-banner">
                        <CheckCircle2 size={18} />
                        <span>System configuration saved successfully!</span>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label flex-center">
                        Active Model Type
                        <span className="info-tooltip" title="Flash models are recommended for fast, cost-effective chat streams. Pro models provide deeper code reviews.">
                          <Info size={14} />
                        </span>
                      </label>
                      <select 
                        value={aiModel} 
                        onChange={(e) => setAiModel(e.target.value)}
                        className="form-select"
                      >
                        <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended - Standard)</option>
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash (Stable)</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (Analytical - Pro)</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro (Legacy Pro)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label flex-center">
                        Gemini API Key Override
                        <span className="info-tooltip" title="Add a custom Gemini API Key. If empty, the system falls back to your backend environmental variable. Delete the dots and save to clear custom key.">
                          <Info size={14} />
                        </span>
                      </label>
                      <input 
                        type="password" 
                        placeholder={apiKeyConfigured ? "••••••••" : "Paste your custom Gemini API Key..."}
                        value={apiKey} 
                        onChange={(e) => setApiKey(e.target.value)}
                        className="form-input"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label flex-center">
                        Temperature: {aiTemp}
                        <span className="info-tooltip" title="Lower values (e.g. 0.2) ensure deterministic, strict answers. Higher values (e.g. 0.8) lead to more diverse conversational replies.">
                          <Info size={14} />
                        </span>
                      </label>
                      <div className="slider-wrapper">
                        <input 
                          type="range" 
                          min="0.0" 
                          max="1.0" 
                          step="0.05"
                          value={aiTemp} 
                          onChange={(e) => setAiTemp(parseFloat(e.target.value))}
                          className="settings-slider"
                        />
                        <div className="slider-labels">
                          <span>0.0 (Strict / Logic)</span>
                          <span>1.0 (Creative / Adaptive)</span>
                        </div>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label flex-center">
                        AI Recruiter Persona / Prompt Modifier
                        <span className="info-tooltip" title="Prepend instructions or behavior modifiers to the AI Interviewer (e.g., 'Act very strict', 'Only prompt in puzzles').">
                          <Info size={14} />
                        </span>
                      </label>
                      <textarea 
                        placeholder="e.g. Keep all live coding challenges focused strictly on algorithmic problem-solving and finding logic bugs. The challenge must be entirely self-contained, requiring only standard library functions. Never require external API integrations, database drivers (other than standard Python libraries), or heavy frameworks. The starter code must be executable immediately in the sandbox, with placeholders or syntax/logical bugs that the applicant is expected to find and correct. Always format the problem statement with clear inputs, outputs, and edge cases."
                        value={aiPersonaModifier}
                        onChange={(e) => setAiPersonaModifier(e.target.value)}
                        className="form-textarea"
                        rows="5"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label flex-center">
                        Recruiting Event Webhook URL
                        <span className="info-tooltip" title="Send HTTP POST requests with exam results, scorecard grades, and proctoring logs to this URL immediately after grading completes.">
                          <Info size={14} />
                        </span>
                      </label>
                      <input 
                        type="url" 
                        placeholder="https://your-ats-platform.com/api/v1/webhooks"
                        value={webhookUrl} 
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="form-input"
                        style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
                      />
                    </div>

                    <button type="submit" className="gradient-btn save-settings-btn">
                      Apply Configurations
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* SESSION INSPECTOR MODAL */}
      {selectedSessionId && (
        <div className="inspector-modal-backdrop">
          <div className="glass-panel inspector-modal animate-fade-in">
            {detailLoading ? (
              <div className="modal-loading">
                <div className="spinner"></div>
                <span>Retrieving complete code transcripts & scorecards...</span>
              </div>
            ) : sessionDetail ? (
              <div className="modal-container-split">
                <header className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                  <div className="modal-header-info" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{sessionDetail.candidate.name} — {sessionDetail.job.title}</h3>
                      <span className={`status-badge ${sessionDetail.status}`} style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
                        {sessionDetail.status}
                      </span>
                    </div>
                    <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span>Email: {sessionDetail.candidate.email}</span>
                      <span>|</span>
                      <span>Language: {sessionDetail.selected_language.toUpperCase()}</span>
                      {sessionDetail.expires_at && (
                        <>
                          <span>|</span>
                          <span style={{ color: new Date(sessionDetail.expires_at) < new Date() ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: new Date(sessionDetail.expires_at) < new Date() ? 600 : 400 }}>
                            Expires: {new Date(sessionDetail.expires_at).toLocaleString()}
                            {new Date(sessionDetail.expires_at) < new Date() ? ' (Expired)' : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button 
                      onClick={() => handleResetSession(sessionDetail.session_id)}
                      className="gradient-btn reset-session-btn"
                      style={{
                        padding: '0.5rem 1rem',
                        fontSize: '0.8rem',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        background: 'linear-gradient(135deg, var(--warning), #d35400)',
                        boxShadow: 'none',
                        border: 'none',
                        color: 'white',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                      title="Reset Exam: clear history, reset proctoring, and re-enable exam entrance"
                    >
                      <RefreshCw size={14} />
                      Reset & Re-Enable Exam
                    </button>
                    <button onClick={() => setSelectedSessionId(null)} className="close-modal-btn">
                      <X size={20} />
                    </button>
                  </div>
                </header>

                <div className="modal-body-split">
                  {/* Left Column: Chat log + Monaco Editor */}
                  <div className="body-column code-transcript-pane">
                    <div className="pane-section editor-sandbox">
                      <div className="section-label">
                        <Code2 size={16} /> Final Code Submission
                      </div>
                      <div className="inspector-editor-wrapper">
                        {(() => {
                          const inspectorQuestions = sessionDetail.questions_json ? JSON.parse(sessionDetail.questions_json) : [];
                          const baseCode = inspectorQuestions.length > 0 
                            ? (inspectorQuestions[inspectorActiveIndex]?.submitted_code || inspectorQuestions[inspectorActiveIndex]?.starter_code || '') 
                            : sessionDetail.final_code;
                            
                          const questionLogs = (sessionDetail.code_keystroke_logs || []).filter(
                            log => log.question_index === inspectorActiveIndex
                          );
                          
                          const activeCode = (playbackIndex >= 0 && playbackIndex < questionLogs.length)
                            ? questionLogs[playbackIndex].code_state
                            : baseCode;
                            
                          return (
                            <>
                              {inspectorQuestions.length > 1 && (
                                <div className="inspector-q-tabs" style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                  {inspectorQuestions.map((q, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => setInspectorActiveIndex(idx)}
                                      className={`inspector-q-tab-btn ${idx === inspectorActiveIndex ? 'active' : ''}`}
                                      style={{
                                        fontSize: '0.75rem',
                                        padding: '0.3rem 0.65rem',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border)',
                                        background: idx === inspectorActiveIndex ? 'var(--primary-glow)' : 'var(--bg-surface-elevated)',
                                        color: idx === inspectorActiveIndex ? 'var(--primary)' : 'var(--text-secondary)',
                                        borderColor: idx === inspectorActiveIndex ? 'var(--primary)' : 'var(--border)',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'var(--transition-smooth)'
                                      }}
                                    >
                                      {q.title || `Question ${idx + 1}`}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div style={{ flex: 1, minHeight: 0 }}>
                                <Editor
                                  height="100%"
                                  language={sessionDetail.selected_language}
                                  theme="vs-dark"
                                  value={activeCode}
                                  options={{
                                    readOnly: true,
                                    fontSize: 13,
                                    fontFamily: "'Fira Code', monospace",
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true
                                  }}
                                />
                              </div>

                              {questionLogs.length > 0 && (
                                <div className="playback-control-bar" style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                  padding: '0.65rem 1rem',
                                  background: 'var(--bg-surface)',
                                  borderTop: '1px solid var(--border)',
                                  borderBottomLeftRadius: '8px',
                                  borderBottomRightRadius: '8px',
                                  fontSize: '0.8rem',
                                  color: 'var(--text-secondary)'
                                }}>
                                  <button 
                                    type="button" 
                                    onClick={handleTogglePlayback}
                                    className="gradient-btn"
                                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                                  >
                                    {playbackActive ? <Pause size={12} /> : <Play size={12} />}
                                    <span>{playbackActive ? 'Pause' : 'Play Replay'}</span>
                                  </button>

                                  <span style={{ minWidth: '52px', textAlign: 'right' }}>
                                    {playbackIndex !== -1
                                      ? formatElapsed((questionLogs[playbackIndex]?.seconds_elapsed || 0) - getActivityBaseline(sessionDetail))
                                      : 'Final'}
                                  </span>

                                  <input 
                                    type="range"
                                    min="-1"
                                    max={questionLogs.length - 1}
                                    value={playbackIndex}
                                    onChange={(e) => {
                                      if (playbackIntervalRef.current) {
                                        clearInterval(playbackIntervalRef.current)
                                        playbackIntervalRef.current = null
                                      }
                                      setPlaybackActive(false)
                                      setPlaybackIndex(parseInt(e.target.value))
                                    }}
                                    style={{ flex: 1, cursor: 'pointer', accentColor: 'var(--primary)' }}
                                  />

                                  <span style={{ minWidth: '52px' }}>
                                    {formatElapsed((questionLogs[questionLogs.length - 1]?.seconds_elapsed || 0) - getActivityBaseline(sessionDetail))}
                                  </span>

                                  <select 
                                    value={playbackSpeed}
                                    onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                                    style={{
                                      background: 'var(--bg-surface-elevated)',
                                      border: '1px solid var(--border)',
                                      color: 'var(--text-primary)',
                                      borderRadius: '4px',
                                      padding: '0.2rem 0.4rem',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <option value="1">1x Speed</option>
                                    <option value="2">2x Speed</option>
                                    <option value="5">5x Speed</option>
                                    <option value="10">10x Speed</option>
                                  </select>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="pane-section chat-transcript">
                      <div className="section-label">
                        <MessageSquare size={16} /> Session Conversation Transcript
                      </div>
                      <div className="transcript-list">
                        {sessionDetail.transcript.map((msg, i) => (
                          <div key={i} className={`transcript-bubble ${msg.sender}`}>
                            <div className="bubble-header">
                              <span className="bubble-role">{msg.sender === 'ai' ? '🤖 AI Recruiter' : '👤 Candidate'}</span>
                              {msg.timestamp && (
                                <span className="bubble-time">
                                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                            <div 
                              className="bubble-text"
                              dangerouslySetInnerHTML={{ __html: formatMessageText(msg.message_text) }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Scorecard details */}
                  <div className="body-column evaluation-pane">
                    <div className="section-label">
                      <Award size={16} /> Performance Evaluation & Scores
                    </div>

                    <div className="scorecard-scroller" style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                      {/* Proctoring Log Section — ALWAYS VISIBLE */}
                      <div className="proctoring-log-card" style={{ marginBottom: '1.5rem' }}>
                        <h5 className="proctoring-title flex-center" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                          <Shield size={14} className="proctoring-shield-icon" style={{ color: 'var(--primary)' }} />
                          Anti-Cheat Proctoring Log
                        </h5>
                        <div className="proctoring-stats-row" style={{ display: 'flex', gap: '0.75rem' }}>
                          <div className="proctor-stat-box" style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface-elevated)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span className="stat-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Focus Losses</span>
                            <span className={`stat-val ${sessionDetail.focus_losses > 2 ? 'warning-flag' : ''}`} style={{ fontSize: '1.1rem', fontWeight: 800, color: sessionDetail.focus_losses > 2 ? 'var(--danger)' : 'var(--success)' }}>
                              {sessionDetail.focus_losses} {sessionDetail.focus_losses > 2 ? '⚠️' : ''}
                            </span>
                          </div>
                          <div className="proctor-stat-box" style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface-elevated)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span className="stat-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Time Away</span>
                            <span className={`stat-val ${sessionDetail.time_away_seconds > 15 ? 'warning-flag' : ''}`} style={{ fontSize: '1.1rem', fontWeight: 800, color: sessionDetail.time_away_seconds > 15 ? 'var(--danger)' : 'var(--success)' }}>
                              {sessionDetail.time_away_seconds}s {sessionDetail.time_away_seconds > 15 ? '⚠️' : ''}
                            </span>
                          </div>
                          <div className="proctor-stat-box" style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface-elevated)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span className="stat-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Clipboard Pastes</span>
                            <span className={`stat-val ${sessionDetail.copy_pastes > 1 ? 'warning-flag' : ''}`} style={{ fontSize: '1.1rem', fontWeight: 800, color: sessionDetail.copy_pastes > 1 ? 'var(--danger)' : 'var(--success)' }}>
                              {sessionDetail.copy_pastes} {sessionDetail.copy_pastes > 1 ? '⚠️' : ''}
                            </span>
                          </div>
                        </div>
                        {(sessionDetail.focus_losses > 5 || sessionDetail.time_away_seconds > 120) ? (
                          <div className="proctoring-alert-banner" style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            <span>🔴 Critical Integrity Warning: High time away ({sessionDetail.time_away_seconds}s) or excessive focus losses ({sessionDetail.focus_losses}) detected.</span>
                          </div>
                        ) : (sessionDetail.focus_losses > 2 || sessionDetail.time_away_seconds > 15 || sessionDetail.copy_pastes > 1) && (
                          <div className="proctoring-alert-banner" style={{ marginTop: '0.75rem', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', fontSize: '0.75rem' }}>
                            <span>⚠️ Minor Integrity Warning: Candidate switched tabs or pasted external code.</span>
                          </div>
                        )}
                      {sessionDetail.proctoring_events && sessionDetail.proctoring_events.length > 0 && (
                        <div className="proctoring-timeline-container" style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>Proctoring Activity Timeline</span>
                          <div style={{ position: 'relative', width: '100%', height: '40px', display: 'flex', alignItems: 'center' }}>
                            {/* Horizontal Axis Line */}
                            <div style={{ position: 'absolute', left: '2%', right: '2%', height: '2px', background: 'var(--border)' }}></div>
                            
                            {/* Render markers along the line */}
                            {(() => {
                              const baseline = getActivityBaseline(sessionDetail);
                              const rel = (e) => Math.max(0, (e.seconds_elapsed || 0) - baseline);
                              const maxSeconds = Math.max(600, ...sessionDetail.proctoring_events.map(rel));
                              return sessionDetail.proctoring_events.map((evt, idx) => {
                                const percentage = 2 + (rel(evt) / maxSeconds) * 96;

                                const isFocus = evt.event_type === 'focus_loss';
                                return (
                                  <div
                                    key={idx}
                                    title={`${isFocus ? 'Focus Loss' : 'Clipboard Paste'} at ${formatElapsed(rel(evt))}`}
                                    style={{
                                      position: 'absolute',
                                      left: `${percentage}%`,
                                      transform: 'translateX(-50%)',
                                      width: '10px',
                                      height: '10px',
                                      borderRadius: '50%',
                                      background: isFocus ? 'var(--danger)' : 'var(--warning)',
                                      border: '2px solid var(--bg-surface)',
                                      cursor: 'pointer',
                                      boxShadow: isFocus ? '0 0 8px var(--danger)' : '0 0 8px var(--warning)',
                                      zIndex: 2
                                    }}
                                  />
                                );
                              });
                            })()}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                            <span>Start (0m 00s)</span>
                            <span>{(() => {
                              const baseline = getActivityBaseline(sessionDetail);
                              const maxSecs = Math.max(600, ...sessionDetail.proctoring_events.map(e => Math.max(0, (e.seconds_elapsed || 0) - baseline)));
                              return `End (${formatElapsed(maxSecs)})`;
                            })()}</span>
                          </div>
                          {/* Legend */}
                          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.5rem', justifyContent: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--danger)' }}></div>
                              <span>Focus Loss</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--warning)' }}></div>
                              <span>Clipboard Paste</span>
                            </div>
                          </div>
                        </div>
                      )}
                      </div>

                      {/* Scorecard Details */}
                      {sessionDetail.feedback ? (
                        <>
                          <div className="overall-score-indicator">
                            <span className="ind-num">{sessionDetail.feedback.overall_score}</span>
                            <span className="ind-max">/100 Overall Score</span>
                          </div>

                          <div className="metric-review">
                            <h5>Code Quality</h5>
                            <p>{sessionDetail.feedback.code_quality_feedback}</p>
                          </div>

                          <div className="metric-review">
                            <h5>Communication Skills</h5>
                            <p>{sessionDetail.feedback.communication_feedback}</p>
                          </div>

                          <div className="metric-review">
                            <h5>Technical Accuracy</h5>
                            <p>{sessionDetail.feedback.technical_accuracy_feedback}</p>
                          </div>

                          <div className="detailed-md-section">
                            <h5>Detailed Grader Summary</h5>
                            <div className="rendered-md">
                              {renderMarkdown(sessionDetail.feedback.detailed_report)}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="no-scorecard-notice" style={{ padding: '2rem 1.5rem', background: 'var(--bg-surface-elevated)', borderRadius: '12px', border: '1px dashed var(--border)', textAlign: 'center', marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                          <Award size={36} style={{ color: 'var(--text-muted)' }} />
                          <h5 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>No Scorecard Available</h5>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            This session is either currently active or has been left before submission. Once the candidate clicks 'Submit Exam' or the session status is completed, the Gemini grading engine will generate the assessment scorecard.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* RECRUITER HELP SYSTEM MODAL */}
      {showHelpModal && (
        <div className="inspector-modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel help-modal animate-fade-in" style={{
            width: '100%',
            maxWidth: '850px',
            height: '600px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '24px',
            border: '1px solid var(--border)',
            background: 'var(--bg-surface-elevated)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div className="modal-header" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.5rem 2rem',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <HelpCircle size={24} style={{ color: 'var(--primary)' }} />
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Recruiter Help Center</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Learn how to navigate AuraInterview features, workflows, and integrations.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowHelpModal(false)} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content Split Panel */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Sidebar Navigation */}
              <div style={{
                width: '240px',
                background: 'var(--bg-base)',
                borderRight: '1px solid var(--border)',
                padding: '1.25rem 0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                overflowY: 'auto'
              }}>
                <button 
                  onClick={() => setHelpActiveTab('getting-started')}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: helpActiveTab === 'getting-started' ? 'var(--primary-glow)' : 'transparent',
                    color: helpActiveTab === 'getting-started' ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  🚀 Getting Started
                </button>
                <button 
                  onClick={() => setHelpActiveTab('personas')}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: helpActiveTab === 'personas' ? 'var(--primary-glow)' : 'transparent',
                    color: helpActiveTab === 'personas' ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  🎭 AI Recruiter Personas
                </button>
                <button 
                  onClick={() => setHelpActiveTab('proctoring')}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: helpActiveTab === 'proctoring' ? 'var(--primary-glow)' : 'transparent',
                    color: helpActiveTab === 'proctoring' ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  🛡️ Anti-Cheat Proctoring
                </button>
                <button 
                  onClick={() => setHelpActiveTab('webhooks')}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: helpActiveTab === 'webhooks' ? 'var(--primary-glow)' : 'transparent',
                    color: helpActiveTab === 'webhooks' ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  🔌 Webhook Integrations
                </button>
                <button 
                  onClick={() => setHelpActiveTab('session-management')}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: helpActiveTab === 'session-management' ? 'var(--primary-glow)' : 'transparent',
                    color: helpActiveTab === 'session-management' ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  🔒 Session Expiration & Resets
                </button>
              </div>

              {/* Help Body */}
              <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', background: 'var(--bg-surface)' }}>
                {helpActiveTab === 'getting-started' && (
                  <div className="animate-fade-in" style={{ lineHeight: 1.6, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 0, marginBottom: '1rem' }}>
                      🚀 Getting Started Guide
                    </h4>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                      AuraInterview simplifies tech hiring by conducting fully automated AI-driven coding assessments. Follow this standard workflow to hire top-tier talent:
                    </p>
                    <ol style={{ paddingLeft: '1.2rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <li>
                        <strong style={{ color: 'var(--text-primary)' }}>Create a Job Posting</strong>: Open the <em>Job Postings</em> tab and create a role. Assign an AI interviewer persona (Mentor, Standard, or Tech Lead) depending on how strict you want the interview to be.
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text-primary)' }}>Upload Candidate Resumes</strong>: Under your Job Posting, click the <em>Upload CVs</em> button to parse the candidates' resumes and calculate their match fit score against the job description.
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text-primary)' }}>Send Exam Invitations</strong>: Click <em>Invite Candidate</em> to generate a secure link with a unique session ID. The candidate will use this link to enter the exam room.
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text-primary)' }}>Review Graded Scorecards</strong>: Once a candidate finishes, our Gemini engine generates a detailed report grading code quality, communication, and correctness.
                      </li>
                    </ol>
                  </div>
                )}

                {helpActiveTab === 'personas' && (
                  <div className="animate-fade-in" style={{ lineHeight: 1.6, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 0, marginBottom: '1rem' }}>
                      🎭 AI Recruiter Personas
                    </h4>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                      The AI Recruiter Persona modifies how the AI conducts the interview in the live coding sandbox:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ border: '1px solid var(--border)', padding: '1rem', borderRadius: '12px', background: 'var(--bg-base)' }}>
                        <span className="persona-badge persona-mentor" style={{ marginBottom: '0.5rem' }}>🟢 Encouraging Mentor</span>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                          Friendly, patient, and highly generous. If a candidate gets stuck on a syntax error or a logical block, the AI will provide hints and step-by-step guidance. Ideal for junior roles or interns.
                        </p>
                      </div>
                      <div style={{ border: '1px solid var(--border)', padding: '1rem', borderRadius: '12px', background: 'var(--bg-base)' }}>
                        <span className="persona-badge persona-standard" style={{ marginBottom: '0.5rem' }}>🟡 Standard Interviewer</span>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                          Objective, professional, and balanced. Asks typical engineering follow-up questions, prompts candidates to handle missing edge cases, and guides them if they are completely stuck. Default for mid-level engineers.
                        </p>
                      </div>
                      <div style={{ border: '1px solid var(--border)', padding: '1rem', borderRadius: '12px', background: 'var(--bg-base)' }}>
                        <span className="persona-badge persona-tech-lead" style={{ marginBottom: '0.5rem' }}>🔴 Rigorous Tech Lead</span>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                          Demanding, brief, and strict. Focuses heavily on optimization, Big-O complexity, boundary checks (null inputs, empty arrays), and challenges design choices. Will NOT give direct hints. Recommended for senior roles.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {helpActiveTab === 'proctoring' && (
                  <div className="animate-fade-in" style={{ lineHeight: 1.6, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 0, marginBottom: '1rem' }}>
                      🛡️ Anti-Cheat Proctoring Engine
                    </h4>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                      Our anti-cheat system tracks multiple dimensions of candidate behavior during the live exam and calculates a compliance score:
                    </p>
                    <ul style={{ paddingLeft: '1.2rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                      <li><strong style={{ color: 'var(--text-primary)' }}>Focus Losses</strong>: Triggered whenever the candidate switches browser tabs, opens developer tools, or minimizes the window.</li>
                      <li><strong style={{ color: 'var(--text-primary)' }}>Time Away</strong>: Accumulates the total number of seconds the exam window remains blurred or out of focus.</li>
                      <li><strong style={{ color: 'var(--text-primary)' }}>Clipboard Pastes</strong>: Monitored whenever code or large blocks of text are pasted into the editor.</li>
                    </ul>
                    <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--danger)', display: 'block', marginBottom: '0.25rem' }}>Proctoring Alerts Classification:</strong>
                      * 🔴 <strong style={{ color: 'var(--text-primary)' }}>Critical warnings</strong> trigger if focus loss is &gt; 5 times OR time away is &gt; 2 minutes (120s).
                      <br />
                      * ⚠️ <strong style={{ color: 'var(--text-primary)' }}>Minor warnings</strong> trigger if focus loss &gt; 2, time away &gt; 15s, or paste actions &gt; 1.
                    </div>
                  </div>
                )}

                {helpActiveTab === 'webhooks' && (
                  <div className="animate-fade-in" style={{ lineHeight: 1.6, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 0, marginBottom: '1rem' }}>
                      🔌 Recruiting Event Webhooks
                    </h4>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                      A webhook is an automated HTTP POST callback sent by our servers immediately when a candidate's grading is finalized. Use this to sync candidate scorecards with your Applicant Tracking System (ATS), HR tools, or Discord/Slack.
                    </p>
                    <h5 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '1rem 0 0.5rem 0' }}>Configuration:</h5>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                      1. Open your **Settings** tab.
                      <br />
                      2. Paste your target API endpoint in **Recruiting Event Webhook URL**.
                      <br />
                      3. Save configurations. Our server will now push candidate payloads to that URL.
                    </p>
                    <h5 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '1rem 0 0.5rem 0' }}>Sample JSON Webhook Payload:</h5>
                    <pre style={{
                      background: 'rgba(0,0,0,0.3)',
                      padding: '1rem',
                      borderRadius: '8px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      overflowX: 'auto',
                      border: '1px solid var(--border)'
                    }}>
{`{
  "event": "session.graded",
  "timestamp": "2026-07-16T15:45:00Z",
  "company_name": "Aura Corp",
  "session": {
    "id": 12,
    "token": "7a3b4e9f...",
    "status": "graded",
    "focus_losses": 1,
    "copy_pastes": 0
  },
  "candidate": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "skills": ["React", "Python"]
  },
  "feedback": {
    "overall_score": 85,
    "code_quality_feedback": "Clean, well-structured..."
  }
}`}
                    </pre>
                  </div>
                )}

                {helpActiveTab === 'session-management' && (
                  <div className="animate-fade-in" style={{ lineHeight: 1.6, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 0, marginBottom: '1rem' }}>
                      🔒 Session Expiration & Exam Resets
                    </h4>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                      AuraInterview enforces strict security mechanisms surrounding exam access links:
                    </p>
                    <ul style={{ paddingLeft: '1.2rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <li>
                        <strong style={{ color: 'var(--text-primary)' }}>Link Expiration</strong>: When creating an invitation, recruiters specify a deadline range. Candidates cannot enter the exam room after this timestamp.
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text-primary)' }}>Single-Entry Control</strong>: Once a candidate clicks "Submit Exam" or is graded, they are locked out of the exam room permanently.
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text-primary)' }}>Exam Resets & Extensions</strong>: If a candidate got disconnected or you want to give them another attempt, find the session in your dashboard and click **Reset & Re-Enable Exam**. This will erase proctoring counters, reset the exam status to active, allow link access, and prompt you to extend the deadline range if needed.
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TEST BANK TEMPLATE EXPLORER MODAL */}
      {showTestBank && (
        <div className="inspector-modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div className="glass-panel animate-fade-in" style={{
            width: '95%',
            maxWidth: '900px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '20px',
            border: '1px solid var(--border)',
            background: 'var(--bg-surface-elevated)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div className="modal-header" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.75rem',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database className="accent-glow" style={{ color: 'var(--primary)' }} size={20} />
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Standardized Coding Test Bank</h4>
              </div>
              <button 
                type="button" 
                onClick={() => setShowTestBank(false)} 
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              {testBankChallenges.map((challenge) => (
                <div key={challenge.id} className="glass-panel" style={{
                  padding: '1.25rem',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  background: 'var(--bg-surface)',
                  transition: 'transform 0.2s'
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h5 style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>{challenge.title}</h5>
                      <span className={`difficulty-tag ${challenge.difficulty}`} style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>
                        {challenge.difficulty.toUpperCase()}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4', minHeight: '60px', margin: '0 0 1rem 0' }}>
                      {challenge.problem_statement}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExamTitle(challenge.title);
                      setExamStatement(challenge.problem_statement);
                      setExamCode(challenge.starter_code);
                      setExamDifficulty(challenge.difficulty);
                      setExamQuestionsJson(challenge.questions_json);
                      setExamTestCasesCode(challenge.test_cases_code);
                      setShowExamForm(true);
                      setShowTestBank(false);
                    }}
                    className="gradient-btn"
                    style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', width: '100%', textAlign: 'center', cursor: 'pointer' }}
                  >
                    Use Challenge Template
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .admin-dashboard-page {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: var(--bg-base);
        }
        
        .persona-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.15rem 0.6rem;
          border-radius: 9999px;
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .persona-mentor {
          background: rgba(16, 185, 129, 0.12);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .persona-standard {
          background: rgba(245, 158, 11, 0.12);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.25);
        }
        .persona-tech-lead {
          background: rgba(239, 68, 68, 0.12);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }
        .skill-cloud-tag {
          transition: all 0.2s ease-in-out;
        }
        .skill-cloud-tag:hover {
          transform: translateY(-2px);
          background: var(--bg-surface-elevated) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        }

        .admin-header {
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
          gap: 1rem;
        }
        .admin-badge {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--accent);
          background: rgba(320, 85%, 60%, 0.1);
          border: 1px solid hsla(320, 85%, 60%, 0.2);
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .help-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-secondary);
          padding: 0.45rem 1rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .help-btn:hover {
          color: var(--primary);
          border-color: var(--primary);
          background: var(--primary-glow);
        }
        .logout-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-secondary);
          padding: 0.45rem 1rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .logout-btn:hover {
          color: var(--danger);
          border-color: var(--danger);
          background: var(--danger-glow);
        }
        
        .admin-content {
          max-width: 1400px;
          width: 100%;
          margin: 0 auto;
          padding: 2.5rem 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          flex: 1;
        }
        
        .tab-bar {
          display: flex;
          gap: 1rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0.5rem;
        }
        .tab-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          padding: 0.75rem 1.25rem;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          position: relative;
          transition: var(--transition-smooth);
        }
        .tab-btn:hover {
          color: var(--text-primary);
        }
        .tab-btn.active {
          color: var(--primary);
        }
        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -0.5rem;
          left: 0;
          width: 100%;
          height: 2px;
          background: var(--primary);
          box-shadow: 0 0 10px var(--primary);
        }
        
        .admin-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 5rem 0;
          color: var(--text-secondary);
        }
        
        .pane-header-actions {
          padding: 1.25rem;
          border-bottom: 1px solid var(--border);
        }
        .search-box {
          position: relative;
          display: flex;
          align-items: center;
          max-width: 450px;
        }
        .search-icon {
          position: absolute;
          left: 1rem;
          color: var(--text-muted);
        }
        .search-input {
          width: 100%;
          padding: 0.65rem 1rem 0.65rem 2.5rem;
          background: var(--bg-base);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-primary);
          outline: none;
          font-size: 0.85rem;
          transition: var(--transition-smooth);
        }
        .search-input:focus {
          border-color: var(--primary);
        }
        
        .table-scroller {
          overflow-x: auto;
        }
        .sessions-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.9rem;
        }
        .sessions-table th, .sessions-table td {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--border);
        }
        .sessions-table th {
          background: var(--bg-surface-elevated);
          font-weight: 700;
          color: var(--text-secondary);
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .clickable-row {
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .clickable-row:hover {
          background: rgba(255, 255, 255, 0.02);
        }
        .cand-meta {
          display: flex;
          flex-direction: column;
        }
        .cand-name {
          font-weight: 700;
          color: var(--text-primary);
        }
        .cand-email {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .job-tag {
          font-weight: 600;
          color: var(--secondary);
        }
        .status-badge {
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          display: inline-block;
          text-align: center;
        }
        .status-badge.active {
          background: var(--primary-glow);
          color: hsl(260, 85%, 85%);
        }
        .status-badge.completed {
          background: var(--success-glow);
          color: hsl(145, 80%, 75%);
        }
        .status-badge.graded {
          background: rgba(320, 85%, 60%, 0.1);
          color: hsl(320, 85%, 85%);
        }
        .score-badge-inline {
          font-family: var(--font-mono);
          font-weight: 700;
          color: var(--primary);
          background: var(--primary-glow);
          padding: 0.25rem 0.5rem;
          border-radius: 6px;
        }
        .score-badge-inline.ungraded {
          color: var(--text-muted);
          background: var(--bg-surface-elevated);
        }
        .date-display {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .action-row-buttons {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .delete-action-btn, .email-action-btn, .copy-action-btn, .inspect-action-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .delete-action-btn:hover {
          color: var(--danger);
        }
        .email-action-btn:hover, .copy-action-btn:hover, .inspect-action-btn:hover {
          color: var(--primary);
        }
        .no-records {
          text-align: center;
          color: var(--text-muted);
          padding: 3rem 0;
          font-style: italic;
        }
        
        /* JOBS TAB STYLES */
        .jobs-pane {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .jobs-header-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .add-job-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.6rem 1.25rem;
          border-radius: 8px;
          font-size: 0.85rem;
        }
        .job-form-card {
          padding: 2rem;
          border-radius: 12px;
        }
        .job-form-card h4 {
          margin-bottom: 1.25rem;
          font-size: 1.1rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0.5rem;
        }
        .job-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .form-input, .form-textarea, .form-select {
          width: 100%;
          padding: 0.75rem;
          background: var(--bg-base);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-primary);
          outline: none;
        }
        .form-select option, .form-select-small option {
          background-color: #121621;
          color: var(--text-primary);
        }
        .form-input:focus, .form-textarea:focus, .form-select:focus {
          border-color: var(--primary);
        }
        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
        }
        .btn-cancel {
          background: transparent;
          border: 1px solid var(--border);
          padding: 0.6rem 1.25rem;
          border-radius: 8px;
          cursor: pointer;
        }
        .btn-cancel:hover {
          background: var(--bg-surface-elevated);
        }
        
        .jobs-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.5rem;
        }
        .job-card {
          padding: 1.75rem;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          background: var(--bg-surface);
        }
        .job-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0.5rem;
        }
        .job-card-header h4 {
          font-size: 1.15rem;
        }
        .job-card-actions {
          display: flex;
          gap: 0.5rem;
        }
        .job-card-actions button {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .job-card-actions button:hover {
          color: var(--text-primary);
        }
        .job-card-desc {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .job-card-skills {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .job-skill-pill {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--primary);
          background: var(--primary-glow);
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }
        
        /* EXAM OPTIONS STYLES */
        .job-exams-section {
          margin-top: 1rem;
          border-top: 1px solid var(--border);
          padding-top: 1rem;
        }
        .exams-toggle-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: transparent;
          border: none;
          color: var(--primary);
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .exams-toggle-btn:hover {
          color: var(--primary-hover);
        }
        .exams-dropdown-panel {
          margin-top: 1rem;
          background: var(--bg-surface-elevated);
          padding: 1.25rem;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .exams-panel-actions {
          display: flex;
          gap: 1rem;
        }
        .ai-suggest-btn, .manual-exam-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .ai-suggest-btn {
          background: linear-gradient(135deg, var(--primary), var(--secondary));
          color: white;
          border: none;
        }
        .manual-exam-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-primary);
        }
        .manual-exam-btn:hover {
          background: var(--bg-surface);
        }
        
        .exam-create-form {
          padding: 1.25rem;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          background: rgba(0, 0, 0, 0.2);
        }
        .form-label-small {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .form-input-small, .form-select-small, .form-textarea-small {
          width: 100%;
          padding: 0.5rem;
          background: var(--bg-base);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text-primary);
          outline: none;
          font-size: 0.8rem;
        }
        .form-textarea-small.font-mono {
          font-family: var(--font-mono);
        }
        .exam-form-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }
        .btn-cancel-small, .btn-save-small {
          padding: 0.45rem 1rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-cancel-small {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-primary);
        }
        .btn-save-small {
          background: var(--primary);
          border: none;
          color: white;
        }
        
        .exams-templates-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .exam-template-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          padding: 0.75rem 1rem;
          border-radius: 6px;
          transition: var(--transition-smooth);
        }
        .exam-template-row.active {
          border-color: var(--success);
          background: var(--success-glow);
        }
        .exam-row-meta {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .exam-row-title {
          font-size: 0.85rem;
          font-weight: 700;
        }
        .difficulty-tag {
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.1rem 0.35rem;
          border-radius: 3px;
        }
        .difficulty-tag.easy { background: var(--success-glow); color: hsl(145, 80%, 75%); }
        .difficulty-tag.medium { background: var(--primary-glow); color: hsl(260, 85%, 85%); }
        .difficulty-tag.hard { background: var(--danger-glow); color: hsl(355, 85%, 75%); }
        
        .activate-exam-btn {
          padding: 0.35rem 0.75rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 700;
          cursor: pointer;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-secondary);
          transition: var(--transition-smooth);
        }
        .activate-exam-btn:hover {
          color: var(--text-primary);
          border-color: var(--text-muted);
        }
        .activate-exam-btn.active {
          background: var(--success);
          border-color: var(--success);
          color: white;
          cursor: default;
        }
        .delete-exam-row-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          transition: var(--transition-smooth);
          margin-left: 0.5rem;
        }
        .delete-exam-row-btn:hover {
          color: var(--danger);
        }
        
        .no-exams-configured {
          font-size: 0.8rem;
          color: var(--text-muted);
          font-style: italic;
          text-align: center;
          padding: 0.5rem 0;
        }
        .exams-panel-loading {
          text-align: center;
          color: var(--text-secondary);
          font-size: 0.8rem;
        }
        
        /* SYSTEM SETTINGS PANEL STYLES */
        .settings-pane {
          padding: 2.5rem;
          border-radius: 16px;
        }
        .settings-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 3rem 0;
          color: var(--text-secondary);
        }
        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 1.75rem;
          max-width: 700px;
        }
        .settings-section-header h3 {
          font-size: 1.25rem;
          margin-bottom: 0.25rem;
        }
        .settings-section-header p {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .settings-success-banner {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--success-glow);
          border: 1px solid var(--success);
          padding: 0.85rem 1rem;
          border-radius: 8px;
          color: hsl(145, 80%, 75%);
          font-size: 0.85rem;
          font-weight: 600;
        }
        .info-tooltip {
          display: inline-flex;
          align-items: center;
          color: var(--text-muted);
          cursor: help;
          margin-left: 0.5rem;
        }
        .info-tooltip:hover {
          color: var(--primary);
        }
        .slider-wrapper {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          background: var(--bg-base);
          padding: 1rem;
          border-radius: 8px;
          border: 1px solid var(--border);
        }
        .settings-slider {
          width: 100%;
          accent-color: var(--primary);
          background: var(--border);
          height: 6px;
          border-radius: 3px;
          outline: none;
          cursor: pointer;
        }
        .slider-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
        }
        .save-settings-btn {
          align-self: flex-start;
          padding: 0.75rem 1.75rem;
          border-radius: 8px;
          font-size: 0.85rem;
        }
        
        /* INSPECTOR MODAL STYLES */
        .inspector-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        .inspector-modal {
          width: 100%;
          max-width: 1400px;
          height: 90vh;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .modal-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 1rem;
        }
        .modal-container-split {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 2rem;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border);
        }
        .modal-header-info h3 {
          font-size: 1.25rem;
        }
        .modal-header-info span {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .close-modal-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
        }
        
        .modal-body-split {
          flex: 1;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          overflow: hidden;
        }
        .body-column {
          height: 100%;
          overflow-y: auto;
          padding: 1.5rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .code-transcript-pane {
          border-right: 1px solid var(--border);
          background: var(--bg-base);
        }
        .evaluation-pane {
          background: var(--bg-surface);
        }
        
        .section-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 0.5rem;
        }
        .editor-sandbox {
          height: 460px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
        }
        /* Must be a flex column: it stacks the question tabs, the Monaco replay viewer,
           and the playback control bar. Without display:flex the viewer's "flex: 1" is
           inert, its height resolves to auto, and Monaco's 100% height collapses to 0 —
           leaving only the tabs and control bar visible over empty background. */
        .inspector-editor-wrapper {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          background: #1e1e1e;
        }
        
        .chat-transcript {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .transcript-list {
          flex: 1;
          background: var(--bg-surface-elevated);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          overflow-y: auto;
          max-height: 520px;
          scrollbar-width: thin;
        }
        .transcript-bubble {
          padding: 1rem 1.25rem;
          border-radius: 14px;
          max-width: 85%;
          box-shadow: var(--shadow-sm);
          position: relative;
          transition: var(--transition-smooth);
        }
        .transcript-bubble.ai {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          align-self: flex-start;
          border-top-left-radius: 2px;
        }
        .transcript-bubble.candidate {
          background: var(--primary-glow);
          border: 1px solid hsla(260, 85%, 65%, 0.25);
          align-self: flex-end;
          border-top-right-radius: 2px;
        }
        .bubble-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.5rem;
          border-bottom: 1px solid hsla(0, 0%, 100%, 0.05);
          padding-bottom: 0.25rem;
        }
        .bubble-role {
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-secondary);
        }
        .transcript-bubble.ai .bubble-role {
          color: var(--primary);
        }
        .bubble-time {
          font-size: 0.65rem;
          color: var(--text-muted);
        }
        .bubble-text {
          font-size: 0.9rem;
          line-height: 1.6;
          color: var(--text-primary);
        }
        .chat-inline-code {
          background: rgba(0, 0, 0, 0.3);
          color: #f43f5e;
          padding: 0.15rem 0.35rem;
          border-radius: 4px;
          font-family: 'Fira Code', monospace;
          font-size: 0.8rem;
        }
        .chat-code-block {
          background: #121212;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.75rem 1rem;
          margin: 0.75rem 0;
          overflow-x: auto;
          font-family: 'Fira Code', monospace;
          font-size: 0.8rem;
          line-height: 1.4;
          color: #e2e8f0;
        }
        .chat-bullet-item {
          margin-left: 1.25rem;
          list-style-type: disc;
          margin-top: 0.25rem;
          margin-bottom: 0.25rem;
        }
        
        /* Evaluation Pane Details */
        .overall-score-indicator {
          background: var(--bg-surface-elevated);
          padding: 1.5rem;
          border-radius: 12px;
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          border: 1px solid var(--border);
        }
        .ind-num {
          font-size: 3rem;
          font-weight: 900;
          color: var(--primary);
        }
        .ind-max {
          font-weight: 700;
          color: var(--text-secondary);
        }
        .metric-review {
          margin-bottom: 1.25rem;
        }
        .metric-review h5 {
          font-size: 0.9rem;
          font-weight: 700;
          margin-bottom: 0.35rem;
          color: var(--text-primary);
        }
        .metric-review p {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        
        .detailed-md-section h5 {
          font-size: 0.9rem;
          font-weight: 700;
          margin-bottom: 0.75rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0.25rem;
        }
        .rendered-md {
          font-size: 0.85rem;
          line-height: 1.6;
          color: var(--text-secondary);
        }
        .admin-md-h2 {
          font-size: 1rem;
          font-weight: 700;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }
        .admin-md-p {
          margin-bottom: 0.75rem;
        }
        .admin-md-li {
          margin-left: 1rem;
          margin-bottom: 0.25rem;
        }
        .no-scorecard {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex: 1;
          color: var(--text-muted);
          gap: 1rem;
          text-align: center;
        }

        @media (max-width: 1024px) {
          .modal-body-split {
            grid-template-columns: 1fr;
            overflow-y: auto;
          }
        }

        /* Proctoring Log Box Styling */
        .proctoring-log-card {
          background: rgba(220, 50, 50, 0.05);
          border: 1px solid rgba(220, 50, 50, 0.25);
          border-radius: 10px;
          padding: 1.25rem;
          margin-bottom: 1.5rem;
        }
        .proctoring-title {
          font-size: 0.85rem;
          font-weight: 700;
          color: hsl(355, 85%, 75%);
          margin-bottom: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .proctoring-shield-icon {
          color: hsl(355, 85%, 70%);
        }
        .proctoring-stats-row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
        }
        .proctor-stat-box {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: rgba(0, 0, 0, 0.25);
          padding: 0.5rem;
          border-radius: 6px;
          border: 1px solid var(--border);
        }
        .stat-label {
          font-size: 0.65rem;
          color: var(--text-muted);
          text-align: center;
          margin-bottom: 0.25rem;
        }
        .stat-val {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .stat-val.warning-flag {
          color: hsl(35, 100%, 65%);
        }
        .proctoring-alert-banner {
          margin-top: 0.75rem;
          background: rgba(220, 50, 50, 0.15);
          border: 1px solid rgba(220, 50, 50, 0.3);
          border-radius: 6px;
          padding: 0.5rem;
          text-align: center;
          font-size: 0.75rem;
          font-weight: 600;
          color: hsl(355, 85%, 80%);
        }
      `}} />
    </div>
  )
}

export default AdminDashboard
