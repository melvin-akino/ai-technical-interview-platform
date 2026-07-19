import React from 'react'
import { CheckCircle2, ArrowRight, Sparkles, Terminal, Shield, Award, Users, Cpu, Layers } from 'lucide-react'

function ThankYou({ onReturnHome }) {
  const features = [
    {
      icon: <Cpu className="feat-icon" size={22} />,
      title: "Interactive Pair Programming",
      desc: "Our AI acts as a collaborative colleague, prompting candidates for Big-O efficiency and testing edge cases dynamically."
    },
    {
      icon: <Terminal className="feat-icon" size={22} />,
      title: "Isolated Code Sandbox",
      desc: "A fully integrated compile-and-run environment allowing candidates to execute, debug, and optimize code in real-time."
    },
    {
      icon: <Shield className="feat-icon" size={22} />,
      title: "Integrity & Proctoring Logs",
      desc: "Smart monitoring of focus shifts and code pastes keeps the technical assessment transparent and highly reliable."
    },
    {
      icon: <Award className="feat-icon" size={22} />,
      title: "Gemini-Powered Scorecards",
      desc: "Delivers deep assessments on modularity, communication, coachability, and algorithmic skills to the hiring team."
    }
  ]

  const steps = [
    {
      num: "01",
      title: "Define Roles & Exams",
      desc: "Recruiters create positions and link pre-built coding challenges or let Gemini generate new custom assessments."
    },
    {
      num: "02",
      title: "AI Conducts Interview",
      desc: "Candidates enter a voice-and-text enabled coding terminal to solve problems while talking to the AI recruiter."
    },
    {
      num: "03",
      title: "Inspect Scorecard",
      desc: "Hiring managers receive a granular technical summary, optimal solutions, communication score, and complete transcript."
    }
  ]

  return (
    <div className="thank-you-container animate-fade-in">
      
      {/* 1. SUCCESS CARD SECTION */}
      <section className="success-section">
        <div className="glass-panel success-card">
          <div className="success-icon-wrapper">
            <CheckCircle2 size={40} className="success-icon" />
          </div>
          <h1 className="success-title">Exam Submitted!</h1>
          <p className="success-message">
            Thank you for completing the technical interview. Your live code state, tests execution history, and transcript have been securely locked and submitted. Our hiring team will review your grading scorecard shortly.
          </p>
          <button onClick={onReturnHome} className="gradient-btn return-btn">
            Return to Homepage
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* 2. MARKETING APPS PROMOTION */}
      <section className="marketing-section">
        <div className="marketing-header">
          <div className="app-badge">
            <Sparkles size={14} /> Powered by AuraInterview
          </div>
          <h2 className="marketing-title">
            The Next Generation of <span className="gradient-text">Technical Talent Sourcing</span>
          </h2>
          <p className="marketing-subtitle">
            AuraInterview automates candidate screening using advanced generative AI agents, ensuring you find the best engineers without exhausting developer hours.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="marketing-grid">
          {features.map((f, idx) => (
            <div key={idx} className="glass-panel feature-card">
              <div className="icon-wrapper">{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Process Steps */}
        <div className="process-container">
          <h3 className="process-header-title">Streamlining the Hiring Pipeline</h3>
          <div className="process-row">
            {steps.map((s, idx) => (
              <div key={idx} className="process-step">
                <span className="step-num">{s.num}</span>
                <h4 className="step-title">{s.title}</h4>
                <p className="step-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA Banner */}
        <div className="cta-banner glass-panel">
          <div className="cta-content">
            <h3>Ready to revolutionize your technical hiring?</h3>
            <p>Deploy custom AI recruiters, match resumes instantly, and receive diagnostic scorecards today.</p>
          </div>
          <button onClick={onReturnHome} className="gradient-btn cta-btn">
            Create Free Recruiter Account
            <Sparkles size={16} />
          </button>
        </div>
      </section>

      {/* Footnote */}
      <footer className="thank-you-footer">
        <span>© 2026 AuraInterview. All rights reserved.</span>
      </footer>

      <style dangerouslySetInnerHTML={{__html: `
        .thank-you-container {
          min-height: 100vh;
          background: var(--bg-base);
          color: var(--text-primary);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 4rem 2rem;
          overflow-y: auto;
        }

        /* Success Card Styling */
        .success-section {
          width: 100%;
          max-width: 600px;
          margin-bottom: 5rem;
        }
        .success-card {
          text-align: center;
          padding: 3rem 2.5rem;
          border-radius: 16px;
          border: 1px solid var(--border);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
        }
        .success-icon-wrapper {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: var(--success-glow);
          border: 1px solid hsla(145, 80%, 45%, 0.25);
          margin-bottom: 1.5rem;
        }
        .success-icon {
          color: hsl(145, 80%, 75%);
          animation: scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .success-title {
          font-size: 1.85rem;
          font-weight: 800;
          margin-bottom: 0.75rem;
          letter-spacing: -0.5px;
        }
        .success-message {
          font-size: 0.95rem;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 2rem;
        }
        .return-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.8rem 2rem;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 700;
        }

        /* Marketing Section Styling */
        .marketing-section {
          width: 100%;
          max-width: 1100px;
          display: flex;
          flex-direction: column;
          align-items: center;
          border-top: 1px solid var(--border);
          padding-top: 5rem;
        }
        .marketing-header {
          text-align: center;
          max-width: 750px;
          margin-bottom: 3.5rem;
        }
        .app-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--primary);
          background: var(--primary-glow);
          border: 1px solid hsla(270, 90%, 65%, 0.2);
          padding: 0.35rem 0.85rem;
          border-radius: 20px;
          margin-bottom: 1.25rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .marketing-title {
          font-size: 2.5rem;
          font-weight: 800;
          line-height: 1.25;
          margin-bottom: 1rem;
          letter-spacing: -0.75px;
        }
        .marketing-subtitle {
          font-size: 1.05rem;
          color: var(--text-secondary);
          line-height: 1.6;
        }
        
        .marketing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          width: 100%;
          margin-bottom: 5rem;
        }
        .feature-card {
          padding: 2.25rem 1.75rem;
          border-radius: 12px;
          border: 1px solid var(--border);
          transition: var(--transition-smooth);
        }
        .feature-card:hover {
          transform: translateY(-4px);
          border-color: var(--text-muted);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        .icon-wrapper {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border);
          color: var(--primary);
          margin-bottom: 1.25rem;
        }
        .feature-title {
          font-size: 1.05rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .feature-desc {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        /* Process Flow Styling */
        .process-container {
          width: 100%;
          text-align: center;
          margin-bottom: 5rem;
          border-top: 1px solid var(--border);
          padding-top: 4rem;
        }
        .process-header-title {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 3rem;
        }
        .process-row {
          display: flex;
          justify-content: space-between;
          gap: 2rem;
          flex-wrap: wrap;
        }
        .process-step {
          flex: 1;
          min-width: 250px;
          text-align: left;
          position: relative;
        }
        .step-num {
          font-size: 3rem;
          font-weight: 900;
          color: var(--border);
          opacity: 0.4;
          line-height: 1;
          display: block;
          margin-bottom: 0.5rem;
        }
        .process-step .step-title {
          font-size: 1.1rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .process-step .step-desc {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        /* CTA Banner */
        .cta-banner {
          width: 100%;
          padding: 3rem;
          border-radius: 16px;
          border: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 2rem;
          margin-bottom: 2rem;
          background: linear-gradient(135deg, rgba(20, 15, 35, 0.6) 0%, rgba(5, 5, 10, 0.6) 100%);
        }
        .cta-content {
          max-width: 600px;
          text-align: left;
        }
        .cta-content h3 {
          font-size: 1.35rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .cta-content p {
          font-size: 0.9rem;
          color: var(--text-secondary);
        }
        .cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.85rem 1.75rem;
          border-radius: 10px;
          font-size: 0.9rem;
        }

        .thank-you-footer {
          margin-top: 4rem;
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        @keyframes scaleIn {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}} />
    </div>
  )
}

export default ThankYou
