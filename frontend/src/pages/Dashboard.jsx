import React, { useState } from 'react'
import ResumeUploader from '../components/ResumeUploader.jsx'
import { Sparkles, Terminal, Shield, Award, Users } from 'lucide-react'

function Dashboard({ onStartInterview }) {
  const steps = [
    {
      icon: <Users className="step-icon" size={24} />,
      title: "1. Match Resume",
      desc: "Upload your resume to check alignment against open technical job descriptions."
    },
    {
      icon: <Terminal className="step-icon" size={24} />,
      title: "2. Live Coding Session",
      desc: "Solve a dynamic coding challenge generated on the fly by our Gemini AI Interviewer."
    },
    {
      icon: <Shield className="step-icon" size={24} />,
      title: "3. Interactive Guidance",
      desc: "Talk or chat directly to the AI to explain your logic and receive intelligent hints."
    },
    {
      icon: <Award className="step-icon" size={24} />,
      title: "4. Deep Feedback",
      desc: "Receive comprehensive scorecards, complexity analytics, and grading suggestions."
    }
  ]

  return (
    <div className="dashboard-page animate-fade-in">
      <header className="dashboard-header">
        <div className="logo">
          <Sparkles className="logo-icon animate-pulse" size={24} />
          <span className="logo-text">AuraInterview</span>
        </div>
        <div className="header-meta">
          <span className="env-badge">Gemini-2.5-powered</span>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="hero-section">
          <h1 className="hero-title">
            Unlock Your Technical Potential with <span className="gradient-text">AI-Driven Coding Interviews</span>
          </h1>
          <p className="hero-subtitle">
            Get instant compatibility ratings, enter voice-enabled live environments, and receive constructive scorecards from AI Technical Recruiters.
          </p>
        </div>

        <div className="dashboard-layout">
          <div className="uploader-section">
            <ResumeUploader onStartInterview={onStartInterview} />
          </div>

          <div className="info-sidebar">
            <div className="glass-panel sidebar-card">
              <h3 className="sidebar-card-title">How It Works</h3>
              <div className="steps-list">
                {steps.map((step, idx) => (
                  <div key={idx} className="step-item">
                    <div className="icon-wrapper">{step.icon}</div>
                    <div className="step-details">
                      <span className="step-title">{step.title}</span>
                      <span className="step-desc">{step.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .dashboard-page {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }
        .dashboard-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 3rem;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border);
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .logo-text {
          font-size: 1.4rem;
          font-weight: 800;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #fff 40%, var(--text-secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .env-badge {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--primary);
          border: 1px solid hsla(260, 85%, 65%, 0.3);
          background: var(--primary-glow);
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
        }
        
        .dashboard-content {
          max-width: 1400px;
          width: 100%;
          margin: 0 auto;
          padding: 3rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 3rem;
        }
        .hero-section {
          text-align: center;
          max-width: 800px;
          margin: 0 auto;
        }
        .hero-title {
          font-size: 2.75rem;
          font-weight: 800;
          line-height: 1.25;
          margin-bottom: 1rem;
          letter-spacing: -0.8px;
        }
        .hero-subtitle {
          color: var(--text-secondary);
          font-size: 1.1rem;
          line-height: 1.6;
        }
        
        .dashboard-layout {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 2.5rem;
          align-items: start;
        }
        
        /* Sidebar styles */
        .sidebar-card {
          padding: 2rem;
          border-radius: 20px;
        }
        .sidebar-card-title {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0.75rem;
        }
        .steps-list {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .step-item {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }
        .icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: var(--bg-surface-elevated);
          border: 1px solid var(--border);
          color: var(--primary);
        }
        .step-details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .step-title {
          font-size: 0.95rem;
          font-weight: 700;
        }
        .step-desc {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        @media (max-width: 1024px) {
          .dashboard-layout {
            grid-template-columns: 1fr;
          }
          .dashboard-header {
            padding: 1rem 1.5rem;
          }
        }
      `}} />
    </div>
  )
}

export default Dashboard
