import React, { useState, useEffect, useRef } from 'react'
import {
  Brain, Code, Shield, FileText, Users, Sparkles,
  ChevronRight, Upload, Cpu, Award, Layers,
  Zap, BarChart3, ArrowRight, Check, Star,
  MonitorSmartphone, Lock, Globe
} from 'lucide-react'

function LandingPage({ onRecruiterLogin, onCandidateExam }) {
  const [visibleSections, setVisibleSections] = useState(new Set())
  const sectionRefs = useRef({})

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set([...prev, entry.target.dataset.section]))
          }
        })
      },
      { threshold: 0.15 }
    )

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => observer.disconnect()
  }, [])

  const registerRef = (name) => (el) => {
    sectionRefs.current[name] = el
  }

  const features = [
    {
      icon: <FileText size={22} />,
      title: 'AI Resume Parsing & Matching',
      desc: 'Upload candidate CVs as PDF. Our AI extracts skills, experience, and qualifications — then scores each candidate against the role.',
      color: 'var(--primary)'
    },
    {
      icon: <Code size={22} />,
      title: 'Live Coding Interviews',
      desc: 'Real-time code editor supporting Python, JavaScript, TypeScript, Go, C, C++, PHP, and SQL. Candidates write, compile, and run code in an isolated sandbox.',
      color: 'var(--secondary)'
    },
    {
      icon: <Shield size={22} />,
      title: 'Anti-Cheat Proctoring',
      desc: 'Smart tab-focus tracking, paste detection, and behavioral analytics ensure exam integrity without invasive surveillance.',
      color: 'var(--warning)'
    },
    {
      icon: <Brain size={22} />,
      title: 'AI-Powered Grading',
      desc: 'Gemini-powered evaluation scores code quality, algorithmic efficiency, communication skills, and problem-solving approach automatically.',
      color: 'var(--accent)'
    },
    {
      icon: <Users size={22} />,
      title: 'Multi-Tenant SaaS Architecture',
      desc: 'Each company gets fully isolated data, its own job postings, candidate pool, and exam templates — with per-company AI settings.',
      color: 'var(--success)'
    },
    {
      icon: <Layers size={22} />,
      title: 'Customizable Exam Templates',
      desc: 'Build exams from a starter library of coding challenges, or let AI generate custom problems based on your job descriptions and skill requirements.',
      color: 'var(--danger)'
    }
  ]

  const steps = [
    {
      num: '01',
      icon: <Upload size={28} />,
      title: 'Upload CV',
      desc: 'Candidates submit their resume. AI parses skills, certifications, and experience into structured profiles instantly.'
    },
    {
      num: '02',
      icon: <Cpu size={28} />,
      title: 'AI Match',
      desc: 'Our matching engine scores candidates against job requirements, ranking the best fits for your technical roles.'
    },
    {
      num: '03',
      icon: <Code size={28} />,
      title: 'Live Coding Exam',
      desc: 'Matched candidates enter an AI-proctored coding session with real-time compilation, pair programming, and voice interaction.'
    },
    {
      num: '04',
      icon: <Award size={28} />,
      title: 'AI Grade',
      desc: 'Comprehensive scorecards with code quality metrics, optimal solution comparisons, and hiring recommendations delivered instantly.'
    }
  ]

  const pricingTiers = [
    {
      name: 'Starter',
      price: '₱15,000',
      period: '/mo',
      desc: 'Perfect for small teams getting started with AI-powered hiring.',
      features: [
        'Up to 50 interviews/month',
        '3 recruiter seats',
        'AI resume parsing',
        'Basic coding challenges',
        'Standard proctoring',
        'Email support'
      ],
      highlight: false,
      cta: 'Get Started'
    },
    {
      name: 'Professional',
      price: '₱35,000',
      period: '/mo',
      desc: 'For growing companies that need advanced AI evaluation at scale.',
      features: [
        'Up to 300 interviews/month',
        '10 recruiter seats',
        'Advanced AI matching',
        'Custom exam templates',
        'Full anti-cheat suite',
        'Priority support + SLA',
        'API access',
        'Custom branding'
      ],
      highlight: true,
      cta: 'Start Free Trial',
      badge: 'Most Popular'
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      desc: 'Tailored solutions for large organizations with complex hiring workflows.',
      features: [
        'Unlimited interviews',
        'Unlimited seats',
        'SSO & SAML integration',
        'Dedicated account manager',
        'On-premise deployment option',
        'Custom AI model tuning',
        'Advanced analytics & BI',
        'White-label solution'
      ],
      highlight: false,
      cta: 'Contact Sales'
    }
  ]

  // Verifiable product capabilities, not performance/traction claims. These previously read
  // "85% Faster Screening / 3.5x More Hires / 92% Bias Reduction / 10K+ Interviews Conducted",
  // which were template placeholders with no data behind them — a real misrepresentation to
  // prospective buyers, and a credibility risk in a category already under scrutiny for
  // unverified bias claims. Anything added here must be checkable against the product.
  const stats = [
    { value: '7', label: 'Coding Languages' },
    { value: '3', label: 'Progressive Challenges' },
    { value: '24/7', label: 'Async Interviews' },
    { value: '100%', label: 'Sessions Proctored' }
  ]

  return (
    <div className="lp-root">
      {/* ─── NAVIGATION BAR ─── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <div className="lp-logo">
            <div className="lp-logo-icon">
              <Sparkles size={20} />
            </div>
            <span className="lp-logo-text">AuraInterview</span>
          </div>
          <div className="lp-nav-links">
            <a href="#features" className="lp-nav-link">Features</a>
            <a href="#how-it-works" className="lp-nav-link">How It Works</a>
          </div>
          <div className="lp-nav-actions">
            <button onClick={onRecruiterLogin} className="lp-nav-login">
              Recruiter Login
            </button>
            <button onClick={onCandidateExam} className="gradient-btn lp-nav-cta">
              Take Your Exam
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* ─── HERO SECTION ─── */}
      <section className="lp-hero">
        {/* Ambient glow effects */}
        <div className="lp-hero-glow lp-hero-glow--1" />
        <div className="lp-hero-glow lp-hero-glow--2" />
        <div className="lp-hero-glow lp-hero-glow--3" />

        <div className="lp-hero-content animate-fade-in">
          <div className="lp-hero-badge">
            <Zap size={14} />
            <span>AI-First Technical Hiring Platform</span>
          </div>
          <h1 className="lp-hero-title">
            AI-Powered<br />
            <span className="gradient-text">Technical Interviews</span>
          </h1>
          <p className="lp-hero-subtitle">
            Give every candidate the same structured technical interview — Gemini-powered live coding
            assessments, AI resume matching, and a detailed scorecard for every submission.
          </p>
          <div className="lp-hero-ctas">
            <button onClick={onRecruiterLogin} className="gradient-btn lp-hero-btn lp-hero-btn--primary">
              <Lock size={18} />
              Recruiter Login
            </button>
            <button onClick={onCandidateExam} className="lp-hero-btn lp-hero-btn--secondary">
              Take Your Exam
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        {/* Floating stats bar */}
        <div className="lp-stats-bar glass-panel animate-fade-in" style={{ animationDelay: '0.3s' }}>
          {stats.map((stat, i) => (
            <div key={i} className="lp-stat">
              <span className="lp-stat-value">{stat.value}</span>
              <span className="lp-stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES SECTION ─── */}
      <section
        id="features"
        className={`lp-section lp-features ${visibleSections.has('features') ? 'lp-visible' : ''}`}
        data-section="features"
        ref={registerRef('features')}
      >
        <div className="lp-section-header">
          <div className="lp-section-badge">
            <Star size={14} />
            <span>Capabilities</span>
          </div>
          <h2 className="lp-section-title">
            Everything You Need to<br />
            <span className="gradient-text">Hire Smarter</span>
          </h2>
          <p className="lp-section-subtitle">
            A complete platform for intelligent technical recruitment — from resume ingestion to final scorecard.
          </p>
        </div>

        <div className="lp-features-grid">
          {features.map((feat, idx) => (
            <div key={idx} className="glass-panel lp-feature-card" style={{ animationDelay: `${idx * 0.1}s` }}>
              <div className="lp-feature-icon" style={{ color: feat.color, borderColor: feat.color, background: `${feat.color}15` }}>
                {feat.icon}
              </div>
              <h3 className="lp-feature-title">{feat.title}</h3>
              <p className="lp-feature-desc">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section
        id="how-it-works"
        className={`lp-section lp-how-it-works ${visibleSections.has('how') ? 'lp-visible' : ''}`}
        data-section="how"
        ref={registerRef('how')}
      >
        <div className="lp-section-header">
          <div className="lp-section-badge">
            <BarChart3 size={14} />
            <span>Process</span>
          </div>
          <h2 className="lp-section-title">
            How <span className="gradient-text">AuraInterview</span> Works
          </h2>
          <p className="lp-section-subtitle">
            Four simple steps from application to hiring decision — fully automated, astonishingly fast.
          </p>
        </div>

        <div className="lp-steps-track">
          <div className="lp-steps-line" />
          {steps.map((step, idx) => (
            <div key={idx} className="lp-step" style={{ animationDelay: `${idx * 0.15}s` }}>
              <div className="lp-step-marker">
                <span className="lp-step-num">{step.num}</span>
                <div className="lp-step-icon-ring">
                  {step.icon}
                </div>
              </div>
              <div className="lp-step-body">
                <h3 className="lp-step-title">{step.title}</h3>
                <p className="lp-step-desc">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="lp-final-cta">
        <div className="lp-final-cta-glow" />
        <div className="glass-panel lp-final-cta-card">
          <h2 className="lp-final-cta-title">
            Ready to Transform Your <span className="gradient-text">Technical Hiring?</span>
          </h2>
          <p className="lp-final-cta-desc">
            We're onboarding our first teams now. Run your technical screening on AuraInterview and help
            shape where the platform goes next.
          </p>
          <div className="lp-final-cta-btns">
            <button onClick={onRecruiterLogin} className="gradient-btn lp-hero-btn lp-hero-btn--primary">
              <Sparkles size={18} />
              Start Hiring Smarter
            </button>
            <button onClick={onCandidateExam} className="lp-hero-btn lp-hero-btn--secondary">
              I'm a Candidate
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <div className="lp-logo">
              <div className="lp-logo-icon lp-logo-icon--sm">
                <Sparkles size={14} />
              </div>
              <span className="lp-logo-text">AuraInterview</span>
            </div>
            <p className="lp-footer-tagline">AI-Powered Technical Interviews for Modern Teams</p>
          </div>
          <div className="lp-footer-copy">
            © {new Date().getFullYear()} AuraInterview. All rights reserved.
          </div>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{__html: `
        /* ═══════════════════════════════════════════════
           LANDING PAGE — SCOPED STYLES
           ═══════════════════════════════════════════════ */

        .lp-root {
          min-height: 100vh;
          background: var(--bg-base);
          color: var(--text-primary);
          overflow-x: hidden;
          position: relative;
        }

        /* ─── NAVBAR ─── */
        .lp-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 0 2rem;
          background: hsla(220, 20%, 8%, 0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--glass-border);
        }
        .lp-nav-inner {
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 72px;
        }
        .lp-logo {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .lp-logo-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: var(--primary-glow);
          border: 1px solid hsla(260, 85%, 65%, 0.25);
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .lp-logo-icon--sm {
          width: 28px;
          height: 28px;
          border-radius: 8px;
        }
        .lp-logo-text {
          font-size: 1.15rem;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .lp-nav-links {
          display: flex;
          align-items: center;
          gap: 2rem;
        }
        .lp-nav-link {
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 0.85rem;
          font-weight: 600;
          transition: var(--transition-smooth);
          position: relative;
        }
        .lp-nav-link::after {
          content: '';
          position: absolute;
          bottom: -4px;
          left: 0;
          width: 0;
          height: 2px;
          background: var(--primary);
          transition: var(--transition-smooth);
          border-radius: 1px;
        }
        .lp-nav-link:hover {
          color: var(--text-primary);
        }
        .lp-nav-link:hover::after {
          width: 100%;
        }
        .lp-nav-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .lp-nav-login {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-secondary);
          padding: 0.5rem 1.1rem;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .lp-nav-login:hover {
          border-color: var(--primary);
          color: var(--primary);
          background: var(--primary-glow);
        }
        .lp-nav-cta {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 1.1rem;
          border-radius: 8px;
          font-size: 0.8rem;
        }

        /* ─── HERO ─── */
        .lp-hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 8rem 2rem 4rem;
          text-align: center;
          overflow: hidden;
        }
        .lp-hero-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.35;
          pointer-events: none;
          animation: glowFloat 8s ease-in-out infinite alternate;
        }
        .lp-hero-glow--1 {
          width: 500px;
          height: 500px;
          background: var(--primary);
          top: -100px;
          left: -150px;
        }
        .lp-hero-glow--2 {
          width: 400px;
          height: 400px;
          background: var(--secondary);
          bottom: -50px;
          right: -100px;
          animation-delay: -3s;
        }
        .lp-hero-glow--3 {
          width: 300px;
          height: 300px;
          background: var(--accent);
          top: 40%;
          right: 15%;
          opacity: 0.2;
          animation-delay: -5s;
        }
        @keyframes glowFloat {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(30px, -20px) scale(1.1); }
        }

        .lp-hero-content {
          position: relative;
          z-index: 2;
          max-width: 800px;
        }
        .lp-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--primary);
          background: var(--primary-glow);
          border: 1px solid hsla(260, 85%, 65%, 0.25);
          padding: 0.4rem 1rem;
          border-radius: 24px;
          margin-bottom: 2rem;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }
        .lp-hero-title {
          font-size: clamp(2.8rem, 6vw, 4.5rem);
          font-weight: 900;
          line-height: 1.1;
          letter-spacing: -1.5px;
          margin-bottom: 1.5rem;
        }
        .lp-hero-subtitle {
          font-size: clamp(1rem, 1.5vw, 1.15rem);
          color: var(--text-secondary);
          line-height: 1.7;
          max-width: 620px;
          margin: 0 auto 2.5rem;
        }
        .lp-hero-ctas {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .lp-hero-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.9rem 2rem;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: var(--transition-smooth);
          border: none;
        }
        .lp-hero-btn--primary {
          /* inherits gradient-btn styles */
        }
        .lp-hero-btn--secondary {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-primary);
        }
        .lp-hero-btn--secondary:hover {
          border-color: var(--primary);
          background: var(--primary-glow);
          transform: translateY(-2px);
        }

        /* ─── STATS BAR ─── */
        .lp-stats-bar {
          position: relative;
          z-index: 2;
          margin-top: 4rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3rem;
          padding: 1.5rem 3rem;
          border-radius: 16px;
        }
        .lp-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
        }
        .lp-stat-value {
          font-size: 1.75rem;
          font-weight: 800;
          background: linear-gradient(135deg, var(--primary), var(--secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .lp-stat-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* ─── SHARED SECTION STYLES ─── */
        .lp-section {
          padding: 7rem 2rem;
          max-width: 1280px;
          margin: 0 auto;
          opacity: 0;
          transform: translateY(40px);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .lp-section.lp-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .lp-section-header {
          text-align: center;
          max-width: 700px;
          margin: 0 auto 4rem;
        }
        .lp-section-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--primary);
          background: var(--primary-glow);
          border: 1px solid hsla(260, 85%, 65%, 0.2);
          padding: 0.3rem 0.8rem;
          border-radius: 20px;
          margin-bottom: 1.25rem;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .lp-section-title {
          font-size: clamp(1.8rem, 3.5vw, 2.75rem);
          font-weight: 800;
          line-height: 1.2;
          letter-spacing: -0.75px;
          margin-bottom: 1rem;
        }
        .lp-section-subtitle {
          font-size: 1.05rem;
          color: var(--text-secondary);
          line-height: 1.65;
        }

        /* ─── FEATURES GRID ─── */
        .lp-features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
        }
        .lp-feature-card {
          padding: 2.25rem 1.75rem;
          border-radius: 16px;
          border: 1px solid var(--border);
          transition: var(--transition-smooth);
          position: relative;
          overflow: hidden;
        }
        .lp-feature-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--primary), transparent);
          opacity: 0;
          transition: var(--transition-smooth);
        }
        .lp-feature-card:hover {
          transform: translateY(-6px);
          border-color: hsla(260, 85%, 65%, 0.2);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
        }
        .lp-feature-card:hover::before {
          opacity: 1;
        }
        .lp-feature-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid;
          margin-bottom: 1.25rem;
          transition: var(--transition-smooth);
        }
        .lp-feature-card:hover .lp-feature-icon {
          transform: scale(1.08);
        }
        .lp-feature-title {
          font-size: 1.05rem;
          font-weight: 700;
          margin-bottom: 0.6rem;
        }
        .lp-feature-desc {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.55;
        }

        /* ─── HOW IT WORKS ─── */
        .lp-how-it-works {
          background: linear-gradient(180deg, transparent 0%, hsla(220, 20%, 6%, 0.5) 50%, transparent 100%);
        }
        .lp-steps-track {
          position: relative;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 2rem;
        }
        .lp-steps-line {
          position: absolute;
          top: 40px;
          left: 12%;
          right: 12%;
          height: 2px;
          background: linear-gradient(90deg, var(--primary), var(--secondary), var(--accent), var(--success));
          opacity: 0.25;
          border-radius: 1px;
        }
        .lp-step {
          text-align: center;
          position: relative;
          z-index: 2;
        }
        .lp-step-marker {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .lp-step-num {
          font-size: 0.7rem;
          font-weight: 800;
          color: var(--primary);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 0.75rem;
        }
        .lp-step-icon-ring {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: var(--bg-surface);
          border: 2px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
          transition: var(--transition-smooth);
        }
        .lp-step:hover .lp-step-icon-ring {
          border-color: var(--primary);
          background: var(--primary-glow);
          box-shadow: 0 0 30px var(--primary-glow);
          transform: scale(1.1);
        }
        .lp-step-body {}
        .lp-step-title {
          font-size: 1.1rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .lp-step-desc {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.55;
          max-width: 240px;
          margin: 0 auto;
        }

        /* ─── PRICING ─── */
        .lp-pricing-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          align-items: start;
        }
        .lp-pricing-card {
          padding: 2.5rem 2rem;
          border-radius: 20px;
          border: 1px solid var(--border);
          transition: var(--transition-smooth);
          position: relative;
        }
        .lp-pricing-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
        }
        .lp-pricing-card--featured {
          border-color: hsla(260, 85%, 65%, 0.3);
          background: linear-gradient(170deg, hsla(260, 85%, 65%, 0.08) 0%, var(--glass-bg) 100%);
          transform: scale(1.04);
          box-shadow: 0 8px 40px var(--primary-glow);
        }
        .lp-pricing-card--featured:hover {
          transform: scale(1.04) translateY(-4px);
        }
        .lp-pricing-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, var(--primary), var(--accent));
          color: white;
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.3rem 1rem;
          border-radius: 20px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .lp-pricing-name {
          font-size: 1.15rem;
          font-weight: 700;
          margin-bottom: 1rem;
        }
        .lp-pricing-price {
          margin-bottom: 0.75rem;
          display: flex;
          align-items: baseline;
          gap: 0.25rem;
        }
        .lp-pricing-amount {
          font-size: 2.5rem;
          font-weight: 900;
          letter-spacing: -1px;
        }
        .lp-pricing-period {
          font-size: 0.9rem;
          color: var(--text-muted);
          font-weight: 600;
        }
        .lp-pricing-desc {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 1.75rem;
        }
        .lp-pricing-features {
          list-style: none;
          padding: 0;
          margin: 0 0 2rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .lp-pricing-feature {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .lp-pricing-check {
          color: var(--success);
          flex-shrink: 0;
        }
        .lp-pricing-btn {
          width: 100%;
          padding: 0.8rem;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .lp-pricing-btn--outline {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-primary);
        }
        .lp-pricing-btn--outline:hover {
          border-color: var(--primary);
          background: var(--primary-glow);
          transform: translateY(-2px);
        }

        /* ─── FINAL CTA ─── */
        .lp-final-cta {
          padding: 5rem 2rem 3rem;
          position: relative;
          overflow: hidden;
        }
        .lp-final-cta-glow {
          position: absolute;
          width: 600px;
          height: 300px;
          background: var(--primary);
          filter: blur(150px);
          opacity: 0.12;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        .lp-final-cta-card {
          max-width: 900px;
          margin: 0 auto;
          text-align: center;
          padding: 4rem 3rem;
          border-radius: 24px;
          border: 1px solid var(--border);
          position: relative;
          z-index: 2;
          background: linear-gradient(135deg, hsla(260, 30%, 12%, 0.6) 0%, hsla(220, 20%, 8%, 0.8) 100%);
        }
        .lp-final-cta-title {
          font-size: clamp(1.6rem, 3vw, 2.25rem);
          font-weight: 800;
          margin-bottom: 1rem;
          letter-spacing: -0.5px;
        }
        .lp-final-cta-desc {
          font-size: 1rem;
          color: var(--text-secondary);
          line-height: 1.6;
          max-width: 580px;
          margin: 0 auto 2rem;
        }
        .lp-final-cta-btns {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        /* ─── FOOTER ─── */
        .lp-footer {
          border-top: 1px solid var(--border);
          padding: 2.5rem 2rem;
          margin-top: 2rem;
        }
        .lp-footer-inner {
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .lp-footer-brand {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .lp-footer-tagline {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-left: 0.1rem;
        }
        .lp-footer-copy {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        /* ═══════════════════════════════════════════════
           RESPONSIVE BREAKPOINTS
           ═══════════════════════════════════════════════ */

        @media (max-width: 1024px) {
          .lp-features-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .lp-steps-track {
            grid-template-columns: repeat(2, 1fr);
            gap: 3rem;
          }
          .lp-steps-line {
            display: none;
          }
          .lp-pricing-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .lp-pricing-card--featured {
            grid-column: 1 / -1;
            max-width: 420px;
            justify-self: center;
          }
        }

        @media (max-width: 768px) {
          .lp-nav-links {
            display: none;
          }
          .lp-hero {
            padding: 7rem 1.5rem 3rem;
          }
          .lp-stats-bar {
            flex-wrap: wrap;
            gap: 1.5rem;
            padding: 1.25rem 1.5rem;
          }
          .lp-features-grid {
            grid-template-columns: 1fr;
          }
          .lp-steps-track {
            grid-template-columns: 1fr;
            gap: 2.5rem;
          }
          .lp-pricing-grid {
            grid-template-columns: 1fr;
            max-width: 420px;
            margin: 0 auto;
          }
          .lp-pricing-card--featured {
            transform: scale(1);
            max-width: 100%;
          }
          .lp-pricing-card--featured:hover {
            transform: translateY(-4px);
          }
          .lp-final-cta-card {
            padding: 2.5rem 1.5rem;
          }
          .lp-footer-inner {
            flex-direction: column;
            text-align: center;
          }
          .lp-footer-brand {
            align-items: center;
          }
          .lp-section {
            padding: 5rem 1.5rem;
          }
        }

        @media (max-width: 480px) {
          .lp-hero-ctas,
          .lp-final-cta-btns {
            flex-direction: column;
            width: 100%;
          }
          .lp-hero-btn {
            width: 100%;
            justify-content: center;
          }
          .lp-nav-login {
            display: none;
          }
        }
      `}} />
    </div>
  )
}

export default LandingPage
