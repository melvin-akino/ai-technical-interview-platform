import React, { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Building2, KeyRound, Users, Activity,
  Plus, Trash2, Edit, X, Shield, LogOut, ChevronDown,
  ChevronUp, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle,
  UserPlus, Copy, Search, TrendingUp, Zap
} from 'lucide-react'

const API_BASE = `${import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')}/api/v1`

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token')
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${res.status})`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ─── Toast Notification Component ──────────────────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  const colors = {
    success: 'var(--success)',
    error: 'var(--danger)',
    warning: 'var(--warning)',
  }

  return (
    <div className="sa-toast animate-fade-in" style={{ borderColor: colors[type] || colors.success }}>
      {type === 'success' && <CheckCircle2 size={16} style={{ color: colors.success, flexShrink: 0 }} />}
      {type === 'error' && <AlertCircle size={16} style={{ color: colors.error, flexShrink: 0 }} />}
      <span>{message}</span>
      <button onClick={onClose} className="sa-toast-close"><X size={14} /></button>
    </div>
  )
}

// ─── Stat Card Component ───────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, delay }) {
  return (
    <div className="sa-stat-card glass-panel animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="sa-stat-icon" style={{ background: `${color}22`, color }}>
        <Icon size={22} />
      </div>
      <div className="sa-stat-info">
        <span className="sa-stat-value">{value ?? '—'}</span>
        <span className="sa-stat-label">{label}</span>
      </div>
    </div>
  )
}

// ─── Confirm Dialog ────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="sa-overlay">
      <div className="sa-confirm-dialog glass-panel animate-fade-in">
        <AlertCircle size={28} style={{ color: 'var(--warning)', marginBottom: '0.5rem' }} />
        <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.25rem' }}>Confirm Action</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>{message}</p>
        <div className="sa-confirm-actions">
          <button className="sa-btn sa-btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="sa-btn sa-btn-danger" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function SuperAdminDashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, key: Date.now() })
  }, [])

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'companies', label: 'Companies', icon: Building2 },
    { id: 'apikeys', label: 'API Keys', icon: KeyRound },
    { id: 'logs', label: 'System Logs', icon: Activity },
  ]

  return (
    <div className="sa-root">
      {/* ── SIDEBAR ─────────────────────────────────── */}
      <aside className="sa-sidebar">
        <div className="sa-sidebar-brand">
          <Shield size={24} style={{ color: 'var(--primary)' }} />
          <span className="sa-brand-text">SuperAdmin</span>
        </div>

        <nav className="sa-sidebar-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`sa-nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={18} />
              <span>{tab.label}</span>
              {activeTab === tab.id && <div className="sa-nav-indicator" />}
            </button>
          ))}
        </nav>

        <div className="sa-sidebar-footer">
          <button className="sa-nav-item sa-logout-btn" onClick={onLogout}>
            <LogOut size={18} />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ────────────────────────────── */}
      <main className="sa-main">
        <header className="sa-header">
          <div>
            <h1 className="sa-page-title">
              {tabs.find(t => t.id === activeTab)?.label}
            </h1>
            <p className="sa-page-subtitle">
              {activeTab === 'dashboard' && 'Platform-wide overview and analytics'}
              {activeTab === 'companies' && 'Manage tenants, users, and subscriptions'}
              {activeTab === 'apikeys' && 'Manage platform API key pool'}
              {activeTab === 'logs' && 'Audit raw errors and system anomalies'}
            </p>
          </div>
        </header>

        <div className="sa-content">
          {activeTab === 'dashboard' && <DashboardTab showToast={showToast} />}
          {activeTab === 'companies' && <CompaniesTab showToast={showToast} />}
          {activeTab === 'apikeys' && <ApiKeysTab showToast={showToast} />}
          {activeTab === 'logs' && <LogsTab showToast={showToast} />}
        </div>
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} key={toast.key} />}

      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1: DASHBOARD (GLOBAL STATS)
// ═══════════════════════════════════════════════════════════════════════════
function DashboardTab({ showToast }) {
  const [stats, setStats] = useState(null)
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statsData, companiesData] = await Promise.all([
        apiFetch('/superadmin/stats'),
        apiFetch('/superadmin/companies'),
      ])
      setStats(statsData)
      setCompanies(companiesData)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const filteredCompanies = companies.filter(c =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) return <LoadingSpinner />

  return (
    <div className="animate-fade-in">
      {/* Stats Grid */}
      <div className="sa-stats-grid">
        <StatCard icon={Building2} label="Total Companies" value={stats?.total_companies} color="var(--primary)" delay={0} />
        <StatCard icon={Users} label="Total Users" value={stats?.total_users} color="var(--secondary)" delay={60} />
        <StatCard icon={Activity} label="Total Sessions" value={stats?.total_sessions} color="var(--accent)" delay={120} />
        <StatCard icon={Zap} label="Active Sessions" value={stats?.active_sessions} color="var(--success)" delay={180} />
      </div>

      {/* Companies Table */}
      <div className="sa-section-header">
        <h2 className="sa-section-title">All Companies</h2>
        <div className="sa-search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search companies…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="sa-table-wrap glass-panel">
        <table className="sa-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tier</th>
              <th>Seat Limit</th>
              <th>Users</th>
              <th>Sessions</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filteredCompanies.length === 0 ? (
              <tr><td colSpan={6} className="sa-empty">No companies found</td></tr>
            ) : (
              filteredCompanies.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td><span className={`sa-tier-badge tier-${c.subscription_tier}`}>{c.subscription_tier}</span></td>
                  <td>{c.license_user_limit ?? '∞'}</td>
                  <td>{c.user_count ?? 0}</td>
                  <td>{c.session_count ?? 0}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2: COMPANY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
function CompaniesTab({ showToast }) {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingCompany, setEditingCompany] = useState(null)
  const [expandedCompanyId, setExpandedCompanyId] = useState(null)
  const [companyUsers, setCompanyUsers] = useState({})
  const [usersLoading, setUsersLoading] = useState({})
  const [confirm, setConfirm] = useState(null)

  // Create form state
  const [formName, setFormName] = useState('')
  const [formSeatLimit, setFormSeatLimit] = useState('')
  const [formTier, setFormTier] = useState('standard')
  const [formApiKey, setFormApiKey] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Edit form state
  const [editSeatLimit, setEditSeatLimit] = useState('')
  const [editTier, setEditTier] = useState('standard')
  const [editApiKey, setEditApiKey] = useState('')

  // Add-user form state
  const [addUserCompanyId, setAddUserCompanyId] = useState(null)
  const [addUserEmail, setAddUserEmail] = useState('')
  const [addUserPassword, setAddUserPassword] = useState('')
  const [addUserRole, setAddUserRole] = useState('recruiter')
  const [addingUser, setAddingUser] = useState(false)

  useEffect(() => {
    loadCompanies()
  }, [])

  const loadCompanies = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/superadmin/companies')
      setCompanies(data)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadCompanyUsers = async (companyId) => {
    setUsersLoading(prev => ({ ...prev, [companyId]: true }))
    try {
      const data = await apiFetch(`/superadmin/companies/${companyId}/users`)
      setCompanyUsers(prev => ({ ...prev, [companyId]: data }))
    } catch (err) {
      showToast(`Failed to load users: ${err.message}`, 'error')
    } finally {
      setUsersLoading(prev => ({ ...prev, [companyId]: false }))
    }
  }

  const toggleExpand = (companyId) => {
    if (expandedCompanyId === companyId) {
      setExpandedCompanyId(null)
    } else {
      setExpandedCompanyId(companyId)
      if (!companyUsers[companyId]) {
        loadCompanyUsers(companyId)
      }
    }
  }

  const handleCreate = async () => {
    if (!formName.trim()) { showToast('Company name is required', 'error'); return }
    setFormSubmitting(true)
    try {
      await apiFetch('/superadmin/companies', {
        method: 'POST',
        body: JSON.stringify({
          name: formName.trim(),
          license_user_limit: formSeatLimit ? parseInt(formSeatLimit, 10) : null,
          subscription_tier: formTier,
          custom_api_key: formApiKey.trim() || null,
        }),
      })
      showToast('Company created successfully')
      resetCreateForm()
      loadCompanies()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setFormSubmitting(false)
    }
  }

  const startEdit = (company) => {
    setEditingCompany(company)
    setEditSeatLimit(company.license_user_limit ?? '')
    setEditTier(company.subscription_tier || 'standard')
    setEditApiKey(company.custom_api_key || '')
  }

  const handleEdit = async () => {
    if (!editingCompany) return
    setFormSubmitting(true)
    try {
      await apiFetch(`/superadmin/companies/${editingCompany.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          license_user_limit: editSeatLimit ? parseInt(editSeatLimit, 10) : null,
          subscription_tier: editTier,
          custom_api_key: editApiKey.trim() || null,
        }),
      })
      showToast('Company updated successfully')
      setEditingCompany(null)
      loadCompanies()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleAddUser = async (companyId) => {
    if (!addUserEmail.trim() || !addUserPassword.trim()) {
      showToast('Email and password are required', 'error')
      return
    }
    setAddingUser(true)
    try {
      await apiFetch(`/superadmin/companies/${companyId}/users`, {
        method: 'POST',
        body: JSON.stringify({
          email: addUserEmail.trim(),
          password: addUserPassword.trim(),
          role: addUserRole,
        }),
      })
      showToast('User added successfully')
      setAddUserCompanyId(null)
      setAddUserEmail('')
      setAddUserPassword('')
      setAddUserRole('recruiter')
      loadCompanyUsers(companyId)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setAddingUser(false)
    }
  }

  const handleAssumeUser = async (user) => {
    if (!window.confirm(`Are you sure you want to log in as ${user.email}? This will switch your active session to this user.`)) return
    try {
      const data = await apiFetch(`/superadmin/users/${user.id}/assume`, {
        method: 'POST'
      })
      localStorage.setItem('auth_token', data.access_token)
      localStorage.setItem('user_role', data.user.role)
      localStorage.setItem('user_email', data.user.email)
      localStorage.setItem('company_name', data.user.company_name || '')
      localStorage.setItem('company_id', data.user.company_id || '')
      showToast(`Assumed user ${user.email} successfully`)
      window.location.href = '/'
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const resetCreateForm = () => {
    setShowCreateForm(false)
    setFormName('')
    setFormSeatLimit('')
    setFormTier('standard')
    setFormApiKey('')
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="animate-fade-in">
      {/* Top Bar */}
      <div className="sa-section-header">
        <h2 className="sa-section-title">Companies ({companies.length})</h2>
        <button className="gradient-btn sa-btn-icon" onClick={() => setShowCreateForm(true)} style={{ borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
          <Plus size={16} /> New Company
        </button>
      </div>

      {/* Create Company Modal */}
      {showCreateForm && (
        <div className="sa-overlay">
          <div className="sa-modal glass-panel animate-fade-in">
            <div className="sa-modal-header">
              <h3>Create New Company</h3>
              <button className="sa-close-btn" onClick={resetCreateForm}><X size={20} /></button>
            </div>
            <div className="sa-modal-body">
              <label className="sa-form-label">Company Name *</label>
              <input className="sa-form-input" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Acme Corp" />

              <label className="sa-form-label">License Seat Limit</label>
              <input className="sa-form-input" type="number" value={formSeatLimit} onChange={e => setFormSeatLimit(e.target.value)} placeholder="e.g. 50" />

              <label className="sa-form-label">Subscription Tier</label>
              <select className="sa-form-select" value={formTier} onChange={e => setFormTier(e.target.value)}>
                <option value="standard">Standard</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>

              <label className="sa-form-label">Custom API Key</label>
              <input className="sa-form-input" value={formApiKey} onChange={e => setFormApiKey(e.target.value)} placeholder="Optional — will use platform key if blank" />
            </div>
            <div className="sa-modal-footer">
              <button className="sa-btn sa-btn-ghost" onClick={resetCreateForm}>Cancel</button>
              <button className="gradient-btn" onClick={handleCreate} disabled={formSubmitting} style={{ borderRadius: 8, padding: '0.55rem 1.5rem' }}>
                {formSubmitting ? <Loader2 size={16} className="sa-spin" /> : 'Create Company'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Modal */}
      {editingCompany && (
        <div className="sa-overlay">
          <div className="sa-modal glass-panel animate-fade-in">
            <div className="sa-modal-header">
              <h3>Edit — {editingCompany.name}</h3>
              <button className="sa-close-btn" onClick={() => setEditingCompany(null)}><X size={20} /></button>
            </div>
            <div className="sa-modal-body">
              <label className="sa-form-label">License Seat Limit</label>
              <input className="sa-form-input" type="number" value={editSeatLimit} onChange={e => setEditSeatLimit(e.target.value)} placeholder="e.g. 50" />

              <label className="sa-form-label">Subscription Tier</label>
              <select className="sa-form-select" value={editTier} onChange={e => setEditTier(e.target.value)}>
                <option value="standard">Standard</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>

              <label className="sa-form-label">Custom API Key</label>
              <input className="sa-form-input" value={editApiKey} onChange={e => setEditApiKey(e.target.value)} placeholder="Optional" />
            </div>
            <div className="sa-modal-footer">
              <button className="sa-btn sa-btn-ghost" onClick={() => setEditingCompany(null)}>Cancel</button>
              <button className="gradient-btn" onClick={handleEdit} disabled={formSubmitting} style={{ borderRadius: 8, padding: '0.55rem 1.5rem' }}>
                {formSubmitting ? <Loader2 size={16} className="sa-spin" /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {addUserCompanyId && (
        <div className="sa-overlay">
          <div className="sa-modal glass-panel animate-fade-in">
            <div className="sa-modal-header">
              <h3>Add User to Company</h3>
              <button className="sa-close-btn" onClick={() => setAddUserCompanyId(null)}><X size={20} /></button>
            </div>
            <div className="sa-modal-body">
              <label className="sa-form-label">Email *</label>
              <input className="sa-form-input" type="email" value={addUserEmail} onChange={e => setAddUserEmail(e.target.value)} placeholder="user@company.com" />

              <label className="sa-form-label">Password *</label>
              <input className="sa-form-input" type="password" value={addUserPassword} onChange={e => setAddUserPassword(e.target.value)} placeholder="Minimum 8 characters" />

              <label className="sa-form-label">Role</label>
              <select className="sa-form-select" value={addUserRole} onChange={e => setAddUserRole(e.target.value)}>
                <option value="recruiter">Recruiter</option>
                <option value="company_admin">Company Admin</option>
              </select>
            </div>
            <div className="sa-modal-footer">
              <button className="sa-btn sa-btn-ghost" onClick={() => setAddUserCompanyId(null)}>Cancel</button>
              <button className="gradient-btn" onClick={() => handleAddUser(addUserCompanyId)} disabled={addingUser} style={{ borderRadius: 8, padding: '0.55rem 1.5rem' }}>
                {addingUser ? <Loader2 size={16} className="sa-spin" /> : 'Add User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={() => { confirm.onConfirm(); setConfirm(null) }} onCancel={() => setConfirm(null)} />}

      {/* Company Cards */}
      <div className="sa-company-list">
        {companies.length === 0 ? (
          <div className="sa-empty-state glass-panel">
            <Building2 size={40} style={{ color: 'var(--text-muted)' }} />
            <p>No companies yet. Create your first company to get started.</p>
          </div>
        ) : companies.map((c, idx) => (
          <div key={c.id} className="sa-company-card glass-panel animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
            <div className="sa-company-header">
              <div className="sa-company-info">
                <div className="sa-company-name-row">
                  <Building2 size={18} style={{ color: 'var(--primary)' }} />
                  <h3 className="sa-company-name">{c.name}</h3>
                  <span className={`sa-tier-badge tier-${c.subscription_tier}`}>{c.subscription_tier}</span>
                </div>
                <div className="sa-company-meta">
                  <span><Users size={13} /> {c.user_count ?? 0} users</span>
                  <span>Seats: {c.license_user_limit ?? '∞'}</span>
                  <span>Sessions: {c.session_count ?? 0}</span>
                </div>
              </div>
              <div className="sa-company-actions">
                <button className="sa-icon-btn" title="Edit Company" onClick={() => startEdit(c)}>
                  <Edit size={16} />
                </button>
                <button className="sa-icon-btn" title="Add User" onClick={() => { setAddUserCompanyId(c.id); setAddUserEmail(''); setAddUserPassword(''); setAddUserRole('recruiter') }}>
                  <UserPlus size={16} />
                </button>
                <button className="sa-icon-btn sa-expand-btn" onClick={() => toggleExpand(c.id)}>
                  {expandedCompanyId === c.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>

            {/* Expanded Users Panel */}
            {expandedCompanyId === c.id && (
              <div className="sa-company-users-panel animate-fade-in">
                <div className="sa-users-panel-header">
                  <span className="sa-users-panel-title">Company Users</span>
                </div>
                {usersLoading[c.id] ? (
                  <div className="sa-mini-loader"><Loader2 size={18} className="sa-spin" /></div>
                ) : (companyUsers[c.id] && companyUsers[c.id].length > 0) ? (
                  <table className="sa-table sa-table-compact">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Created</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companyUsers[c.id].map(u => (
                        <tr key={u.id}>
                          <td>{u.email}</td>
                          <td><span className={`sa-role-badge role-${u.role}`}>{u.role?.replace('_', ' ')}</span></td>
                          <td style={{ color: 'var(--text-secondary)' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="sa-btn sa-btn-compact"
                              onClick={() => handleAssumeUser(u)}
                              title="Assume recruiter login"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '0.2rem 0.5rem',
                                fontSize: '0.75rem',
                                borderRadius: '4px',
                                background: 'var(--primary-glow)',
                                color: 'var(--primary)',
                                border: '1px solid hsla(260, 85%, 65%, 0.3)',
                                cursor: 'pointer',
                              }}
                            >
                              <Zap size={11} /> Assume
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="sa-empty-users">No users in this company yet.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3: PLATFORM API KEYS
// ═══════════════════════════════════════════════════════════════════════════
function ApiKeysTab({ showToast }) {
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirm, setConfirm] = useState(null)

  useEffect(() => {
    loadKeys()
    // Cooldowns expire on their own timers — refresh periodically so status/countdown
    // reflect reality without requiring a manual reload.
    const interval = setInterval(loadKeys, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadKeys = async () => {
    try {
      const data = await apiFetch('/superadmin/api-keys')
      setKeys(data)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!newKey.trim()) { showToast('API key cannot be empty', 'error'); return }
    setSubmitting(true)
    try {
      await apiFetch('/superadmin/api-keys', {
        method: 'POST',
        body: JSON.stringify({ api_key: newKey.trim(), label: newLabel.trim() || null }),
      })
      showToast('API key added — it will rotate into use automatically')
      setNewKey('')
      setNewLabel('')
      setShowAddForm(false)
      loadKeys()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/superadmin/api-keys/${id}`, { method: 'DELETE' })
      showToast('API key deleted')
      loadKeys()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => showToast('Masked reference copied'))
  }

  // The API never returns the full key value (encrypted at rest, and the listing endpoint
  // only exposes it pre-masked as "AIzaSy...abcd") — so there is nothing to "reveal". This
  // deliberately does not offer a reveal action rather than pretend one exists.
  const statusMeta = {
    available: { label: 'Available', dot: 'active' },
    cooling_down: { label: 'Cooling down', dot: 'warning' },
    disabled: { label: 'Disabled', dot: 'inactive' },
  }

  const formatWhen = (iso) => iso ? new Date(iso).toLocaleString() : 'Never used'

  if (loading) return <LoadingSpinner />

  return (
    <div className="animate-fade-in">
      <div className="sa-section-header">
        <h2 className="sa-section-title">Platform API Keys ({keys.length})</h2>
        <button className="gradient-btn sa-btn-icon" onClick={() => setShowAddForm(true)} style={{ borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
          <Plus size={16} /> Add Key
        </button>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '-0.5rem', marginBottom: '1rem' }}>
        Add as many keys as you like — requests rotate across all available keys (least-recently-used) and
        automatically fail over to the next one if a key is rate limited or rejected.
      </p>

      {/* Add Key Modal */}
      {showAddForm && (
        <div className="sa-overlay">
          <div className="sa-modal glass-panel animate-fade-in">
            <div className="sa-modal-header">
              <h3>Add Platform API Key</h3>
              <button className="sa-close-btn" onClick={() => { setShowAddForm(false); setNewKey(''); setNewLabel('') }}><X size={20} /></button>
            </div>
            <div className="sa-modal-body">
              <label className="sa-form-label">API Key *</label>
              <input className="sa-form-input" value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Enter API key value" style={{ fontFamily: 'var(--font-mono)' }} />
              <label className="sa-form-label" style={{ marginTop: '0.85rem' }}>Label (optional)</label>
              <input className="sa-form-input" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. prod-key-2" />
            </div>
            <div className="sa-modal-footer">
              <button className="sa-btn sa-btn-ghost" onClick={() => { setShowAddForm(false); setNewKey(''); setNewLabel('') }}>Cancel</button>
              <button className="gradient-btn" onClick={handleAdd} disabled={submitting} style={{ borderRadius: 8, padding: '0.55rem 1.5rem' }}>
                {submitting ? <Loader2 size={16} className="sa-spin" /> : 'Add Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirm && <ConfirmDialog message={confirm.message} onConfirm={() => { confirm.onConfirm(); setConfirm(null) }} onCancel={() => setConfirm(null)} />}

      {/* Keys List */}
      {keys.length === 0 ? (
        <div className="sa-empty-state glass-panel">
          <KeyRound size={40} style={{ color: 'var(--text-muted)' }} />
          <p>No API keys configured. Add your first key to enable AI features.</p>
        </div>
      ) : (
        <div className="sa-keys-list">
          {keys.map((k, idx) => {
            const meta = statusMeta[k.status] || statusMeta.available
            return (
              <div key={k.id} className="sa-key-card glass-panel animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
                <div className="sa-key-main">
                  <div className="sa-key-icon-wrap">
                    <KeyRound size={18} />
                  </div>
                  <div className="sa-key-info">
                    <span className="sa-key-value" style={{ fontFamily: 'var(--font-mono)' }}>
                      {k.label || `Key #${k.id}`}
                      <span style={{ marginLeft: '0.6rem', color: 'var(--text-muted)', fontWeight: 400 }}>{k.api_key}</span>
                    </span>
                    <div className="sa-key-meta">
                      <span className={`sa-status-dot ${meta.dot}`} />
                      <span>{meta.label}{k.status === 'cooling_down' && k.cooldown_seconds_remaining > 0 ? ` (${k.cooldown_seconds_remaining}s)` : ''}</span>
                      <span style={{ color: 'var(--text-muted)' }}>• {k.total_calls || 0} call{k.total_calls === 1 ? '' : 's'}</span>
                      <span style={{ color: 'var(--text-muted)' }} title={formatWhen(k.last_used_at)}>• Last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'never'}</span>
                      {k.failure_count > 0 && (
                        <span style={{ color: 'var(--danger)' }} title={k.last_error || ''}>
                          • {k.failure_count} failure{k.failure_count === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="sa-key-actions">
                  <button className="sa-icon-btn" title="Copy masked reference" onClick={() => copyToClipboard(k.api_key)}>
                    <Copy size={16} />
                  </button>
                  <button className="sa-icon-btn sa-icon-btn-danger" title="Delete Key" onClick={() => setConfirm({ message: `Remove "${k.label || `Key #${k.id}`}" from the rotation pool? This cannot be undone.`, onConfirm: () => handleDelete(k.id) })}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Loading Spinner ───────────────────────────────────────────────────────
function LoadingSpinner() {
  return (
    <div className="sa-loading">
      <Loader2 size={32} className="sa-spin" style={{ color: 'var(--primary)' }} />
      <span>Loading…</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const STYLES = `
  /* ── LAYOUT ─────────────────────────────────── */
  .sa-root {
    display: flex;
    min-height: 100vh;
    background: var(--bg-base);
    position: relative;
  }

  /* ── SIDEBAR ────────────────────────────────── */
  .sa-sidebar {
    width: var(--sidebar-width);
    min-height: 100vh;
    background: var(--bg-surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 100;
  }

  .sa-sidebar-brand {
    height: var(--header-height);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .sa-brand-text {
    font-size: 1.15rem;
    font-weight: 700;
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .sa-sidebar-nav {
    flex: 1;
    padding: 1rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .sa-nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 1rem;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: var(--transition-smooth);
    position: relative;
    text-align: left;
    width: 100%;
  }

  .sa-nav-item:hover {
    color: var(--text-primary);
    background: var(--bg-surface-elevated);
  }

  .sa-nav-item.active {
    color: var(--text-primary);
    background: var(--primary-glow);
  }

  .sa-nav-indicator {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 60%;
    border-radius: 0 3px 3px 0;
    background: var(--primary);
  }

  .sa-sidebar-footer {
    padding: 0.75rem;
    border-top: 1px solid var(--border);
  }

  .sa-logout-btn {
    color: var(--danger) !important;
  }
  .sa-logout-btn:hover {
    background: var(--danger-glow) !important;
  }

  /* ── MAIN CONTENT ───────────────────────────── */
  .sa-main {
    flex: 1;
    margin-left: var(--sidebar-width);
    display: flex;
    flex-direction: column;
  }

  .sa-header {
    height: var(--header-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2rem;
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface);
  }

  .sa-page-title {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .sa-page-subtitle {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.15rem;
  }

  .sa-content {
    flex: 1;
    padding: 2rem;
    max-width: 1400px;
    width: 100%;
    margin: 0 auto;
  }

  /* ── STATS GRID ─────────────────────────────── */
  .sa-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1.25rem;
    margin-bottom: 2rem;
  }

  .sa-stat-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    transition: var(--transition-smooth);
  }

  .sa-stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 40px var(--glass-shadow);
  }

  .sa-stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sa-stat-info {
    display: flex;
    flex-direction: column;
  }

  .sa-stat-value {
    font-size: 1.75rem;
    font-weight: 800;
    line-height: 1.1;
    color: var(--text-primary);
  }

  .sa-stat-label {
    font-size: 0.78rem;
    color: var(--text-secondary);
    font-weight: 500;
    margin-top: 0.15rem;
  }

  /* ── SECTION HEADER ─────────────────────────── */
  .sa-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .sa-section-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .sa-btn-icon {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  /* ── SEARCH ─────────────────────────────────── */
  .sa-search-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.45rem 0.85rem;
    transition: var(--transition-smooth);
    color: var(--text-muted);
  }

  .sa-search-box:focus-within {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-glow);
  }

  .sa-search-box input {
    background: none;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 0.85rem;
    width: 180px;
  }

  .sa-search-box input::placeholder {
    color: var(--text-muted);
  }

  /* ── TABLE ──────────────────────────────────── */
  .sa-table-wrap {
    overflow-x: auto;
    padding: 0;
  }

  .sa-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .sa-table th {
    text-align: left;
    padding: 0.85rem 1.25rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface);
  }

  .sa-table td {
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
  }

  .sa-table tbody tr {
    transition: var(--transition-smooth);
  }

  .sa-table tbody tr:hover {
    background: var(--bg-surface-elevated);
  }

  .sa-table tbody tr:last-child td {
    border-bottom: none;
  }

  .sa-table-compact {
    font-size: 0.8rem;
  }

  .sa-table-compact th {
    padding: 0.6rem 1rem;
  }

  .sa-table-compact td {
    padding: 0.55rem 1rem;
  }

  .sa-empty {
    text-align: center;
    padding: 2rem !important;
    color: var(--text-muted) !important;
    font-style: italic;
  }

  /* ── TIER BADGES ────────────────────────────── */
  .sa-tier-badge {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
  }

  .tier-standard {
    background: var(--primary-glow);
    color: var(--primary);
  }

  .tier-professional {
    background: var(--secondary-glow);
    color: var(--secondary);
  }

  .tier-enterprise {
    background: linear-gradient(135deg, hsla(260, 85%, 65%, 0.15), hsla(320, 85%, 60%, 0.15));
    color: var(--accent);
  }

  /* ── ROLE BADGES ────────────────────────────── */
  .sa-role-badge {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: capitalize;
    padding: 0.2rem 0.55rem;
    border-radius: 4px;
  }

  .role-company_admin {
    background: var(--secondary-glow);
    color: var(--secondary);
  }

  .role-recruiter {
    background: var(--primary-glow);
    color: var(--primary);
  }

  /* ── COMPANY CARDS ──────────────────────────── */
  .sa-company-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .sa-company-card {
    padding: 1.25rem 1.5rem;
    transition: var(--transition-smooth);
  }

  .sa-company-card:hover {
    border-color: rgba(255, 255, 255, 0.1);
  }

  .sa-company-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .sa-company-info {
    flex: 1;
    min-width: 0;
  }

  .sa-company-name-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .sa-company-name {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .sa-company-meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.35rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .sa-company-meta span {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .sa-company-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .sa-icon-btn {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: var(--transition-smooth);
  }

  .sa-icon-btn:hover {
    color: var(--text-primary);
    border-color: var(--text-muted);
    background: var(--bg-surface-elevated);
  }

  .sa-icon-btn-danger:hover {
    color: var(--danger);
    border-color: var(--danger);
    background: var(--danger-glow);
  }

  /* ── EXPANDED USERS PANEL ───────────────────── */
  .sa-company-users-panel {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .sa-users-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .sa-users-panel-title {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .sa-empty-users {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-style: italic;
    padding: 0.75rem 0;
  }

  .sa-mini-loader {
    display: flex;
    justify-content: center;
    padding: 1rem;
    color: var(--text-muted);
  }

  /* ── API KEY CARDS ──────────────────────────── */
  .sa-keys-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .sa-key-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    transition: var(--transition-smooth);
  }

  .sa-key-card:hover {
    border-color: rgba(255, 255, 255, 0.1);
  }

  .sa-key-main {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
    min-width: 0;
  }

  .sa-key-icon-wrap {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--primary-glow);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sa-key-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .sa-key-value {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.03em;
  }

  .sa-key-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .sa-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .sa-status-dot.active {
    background: var(--success);
    box-shadow: 0 0 6px var(--success-glow);
  }

  .sa-status-dot.inactive {
    background: var(--text-muted);
  }

  .sa-status-dot.warning {
    background: var(--warning);
    box-shadow: 0 0 6px var(--warning);
  }

  .sa-key-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-shrink: 0;
    margin-left: 1rem;
  }

  /* ── MODALS & OVERLAYS ──────────────────────── */
  .sa-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .sa-modal {
    width: 100%;
    max-width: 480px;
    max-height: 85vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .sa-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .sa-modal-header h3 {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .sa-close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    transition: var(--transition-smooth);
    padding: 0.25rem;
    border-radius: 6px;
  }

  .sa-close-btn:hover {
    color: var(--text-primary);
    background: var(--bg-surface-elevated);
  }

  .sa-modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .sa-modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border);
  }

  /* ── FORMS ──────────────────────────────────── */
  .sa-form-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-top: 0.25rem;
  }

  .sa-form-input,
  .sa-form-select {
    width: 100%;
    padding: 0.6rem 0.85rem;
    background: var(--bg-base);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 0.85rem;
    outline: none;
    transition: var(--transition-smooth);
  }

  .sa-form-input:focus,
  .sa-form-select:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-glow);
  }

  .sa-form-input::placeholder {
    color: var(--text-muted);
  }

  .sa-form-select {
    cursor: pointer;
  }

  /* ── BUTTONS ────────────────────────────────── */
  .sa-btn {
    padding: 0.55rem 1.25rem;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition-smooth);
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .sa-btn-ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-primary);
  }

  .sa-btn-ghost:hover {
    background: var(--bg-surface-elevated);
    border-color: var(--text-muted);
  }

  .sa-btn-danger {
    background: var(--danger);
    border: none;
    color: white;
  }

  .sa-btn-danger:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  /* ── CONFIRM DIALOG ─────────────────────────── */
  .sa-confirm-dialog {
    width: 100%;
    max-width: 380px;
    padding: 2rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .sa-confirm-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 1.25rem;
    width: 100%;
    justify-content: center;
  }

  /* ── EMPTY STATE ────────────────────────────── */
  .sa-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  /* ── LOADING ────────────────────────────────── */
  .sa-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 4rem;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  @keyframes sa-spin {
    to { transform: rotate(360deg); }
  }

  .sa-spin {
    animation: sa-spin 1s linear infinite;
  }

  /* ── TOAST ──────────────────────────────────── */
  .sa-toast {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    z-index: 2000;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.85rem 1.25rem;
    background: var(--bg-surface-elevated);
    border: 1px solid var(--border);
    border-left: 3px solid;
    border-radius: 10px;
    font-size: 0.85rem;
    color: var(--text-primary);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    max-width: 380px;
  }

  .sa-toast-close {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.15rem;
    margin-left: 0.5rem;
    flex-shrink: 0;
    transition: var(--transition-smooth);
  }

  .sa-toast-close:hover {
    color: var(--text-primary);
  }

  /* ── RESPONSIVE ─────────────────────────────── */
  @media (max-width: 768px) {
    .sa-sidebar {
      width: 60px;
      overflow: hidden;
    }
    .sa-sidebar-brand span,
    .sa-nav-item span {
      display: none;
    }
    .sa-main {
      margin-left: 60px;
    }
    .sa-content {
      padding: 1rem;
    }
    .sa-stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`

function LogsTab({ showToast }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState(null)

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/superadmin/logs')
      setLogs(data)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all system logs from the database?')) return
    try {
      await apiFetch('/superadmin/logs', { method: 'DELETE' })
      showToast('All system logs cleared successfully')
      setLogs([])
      setSelectedLog(null)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="animate-fade-in">
      <div className="sa-section-header">
        <h2 className="sa-section-title">System Logs ({logs.length})</h2>
        {logs.length > 0 && (
          <button className="sa-btn sa-btn-danger" onClick={handleClearLogs} style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Trash2 size={16} /> Clear Logs
          </button>
        )}
      </div>

      <div className="sa-logs-layout" style={{ display: 'grid', gridTemplateColumns: selectedLog ? '1fr 1.2fr' : '1fr', gap: '1.5rem', transition: 'all 0.3s ease' }}>
        <div className="sa-table-wrap glass-panel" style={{ maxHeight: '600px', overflowY: 'auto' }}>
          <table className="sa-table sa-table-compact">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Summary</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={3} className="sa-empty">No system errors logged yet. Good job!</td></tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id} onClick={() => setSelectedLog(log)} style={{ cursor: 'pointer', background: selectedLog?.id === log.id ? 'rgba(255, 255, 255, 0.03)' : '' }}>
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{log.message}</td>
                    <td>
                      <button className="sa-btn sa-btn-ghost sa-btn-compact" onClick={(e) => { e.stopPropagation(); setSelectedLog(log) }}>
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedLog && (
          <div className="glass-panel sa-log-detail-pane animate-fade-in" style={{ padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface-elevated)', display: 'flex', flexDirection: 'column', maxHeight: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              <h4 style={{ margin: 0, color: 'var(--danger)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={18} /> Error Detail (Log #{selectedLog.id})
              </h4>
              <button onClick={() => setSelectedLog(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <p style={{ fontWeight: 700, margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Summary:</p>
              <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem', border: '1px solid var(--border)' }}>
                {selectedLog.message}
              </div>

              {selectedLog.detail && (
                <>
                  <p style={{ fontWeight: 700, margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Stacktrace / Details:</p>
                  <pre style={{ padding: '0.75rem', background: '#121212', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', overflowX: 'auto', border: '1px solid var(--border)', whiteSpace: 'pre-wrap', color: '#ff7b72', margin: 0 }}>
                    {selectedLog.detail}
                  </pre>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


export default SuperAdminDashboard
