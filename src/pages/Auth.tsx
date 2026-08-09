import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { isValidIndianPhone, cleanDigits } from '../lib/phone'
import { t } from '../lib/i18n'
import type { Role } from '../types'

function redirectFor(role: Role) {
  if (role === 'admin') return '/admin'
  if (role === 'seller') return '/seller'
  return '/'
}

type Mode = 'login' | 'signup' | 'forgot'

export default function Auth() {
  const { user, login, signup, resetPassword, loading } = useAuth()
  const { lang } = useStore()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [remember, setRemember] = useState(true)

  if (loading) {
    return (
      <div className="page narrow auth-page">
        <p className="lede center">{t(lang, 'loading')}</p>
      </div>
    )
  }

  if (user) return <Navigate to={redirectFor(user.role)} replace />

  const doLogin = async (mail: string, pass: string) => {
    setError('')
    setInfo('')
    setBusy(true)
    try {
      const res = await login(mail, pass)
      if (!res.ok) {
        setError(
          res.error ||
            (lang === 'bn' ? 'লগইন ব্যর্থ — ফোন নম্বর/পাসওয়ার্ড চেক করুন' : 'Login failed — check credentials'),
        )
        return
      }
      if (!remember) sessionStorage.setItem('gv_session_only', '1')
      localStorage.setItem('gv_remember', remember ? '1' : '0')
      navigate(redirectFor(res.user!.role))
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (mode === 'login') {
      await doLogin(email, password)
      return
    }
    if (mode === 'forgot') {
      setBusy(true)
      try {
        const res = await resetPassword(email)
        if (!res.ok) {
          setError(res.error || (lang === 'bn' ? 'রিসেট ব্যর্থ' : 'Reset failed'))
          return
        }
        setInfo(
          lang === 'bn'
            ? 'ইমেইলে পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে (Spam চেক করুন)।'
            : 'Password reset link sent to your email (check Spam too).',
        )
      } finally {
        setBusy(false)
      }
      return
    }

    if (!name.trim()) {
      setError(lang === 'bn' ? 'নাম দিন' : 'Name required')
      return
    }
    setBusy(true)
    try {
      const res = await signup(name, email, password, phone)
      if (!res.ok) {
        setError(res.error || (lang === 'bn' ? 'সাইন আপ ব্যর্থ' : 'Signup failed'))
        return
      }
      if (res.user) {
        if (!remember) sessionStorage.setItem('gv_session_only', '1')
        localStorage.setItem('gv_remember', remember ? '1' : '0')
        navigate(redirectFor(res.user.role))
        return
      }
      await doLogin(email, password)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page narrow auth-page">
      <h1 className="brand-hero compact">GreenVest</h1>
      <p className="lede center">
        {mode === 'login'
          ? lang === 'bn'
            ? 'ফোন নম্বর দিয়ে সহজেই লগইন করুন'
            : 'Log in easily with your Phone Number'
          : mode === 'signup'
            ? lang === 'bn'
              ? 'ফোন নম্বর দিয়ে নতুন অ্যাকাউন্ট খুলুন'
              : 'Sign up in seconds with your Phone Number'
            : lang === 'bn'
              ? 'পাসওয়ার্ড ভুলে গেলে নম্বর/ইমেইল দিন'
              : 'Enter your phone/email to reset password'}
      </p>

      {mode !== 'forgot' && (
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login')
              setError('')
              setInfo('')
            }}
          >
            {t(lang, 'login')}
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => {
              setMode('signup')
              setError('')
              setInfo('')
            }}
          >
            {t(lang, 'signup')}
          </button>
        </div>
      )}

      <form className="form" onSubmit={onSubmit}>
        {mode === 'signup' && (
          <label>
            {t(lang, 'name')}
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={lang === 'bn' ? 'আপনার নাম' : 'Your full name'}
              required
              autoComplete="name"
            />
          </label>
        )}
        <label>
          {lang === 'bn' ? 'মোবাইল নম্বর (বা ইমেইল)' : 'Phone Number (or Email)'}
          <input
            name="username"
            type="text"
            value={email}
            onChange={(e) => {
              const val = e.target.value
              setEmail(val)
              // Auto-fill phone field if identifier looks like a phone number
              if (mode === 'signup') {
                const digits = cleanDigits(val)
                if (isValidIndianPhone(val)) setPhone(digits.slice(-10))
              }
            }}
            placeholder={lang === 'bn' ? 'যেমন 8170859653' : 'e.g. 8170859653'}
            required
            autoComplete="username"
          />
          {mode !== 'forgot' && !email.includes('@') && cleanDigits(email).length > 0 && (
            <p style={{ marginTop: '0.2rem', fontSize: '0.85rem', color: cleanDigits(email).length === 10 && /^[6-9]/.test(cleanDigits(email)) ? 'green' : 'red' }}>
              {cleanDigits(email).length < 10 && '❌ Enter 10 digits'}
              {cleanDigits(email).length === 10 && /^[6-9]/.test(cleanDigits(email)) && '✅ Valid number'}
              {cleanDigits(email).length === 10 && !/^[6-9]/.test(cleanDigits(email)) && '❌ Must start with 6-9'}
              {cleanDigits(email).length > 10 && '❌ Too many digits'}
            </p>
          )}
        </label>
        {/* Extra phone field in signup — lets user confirm/correct their number */}
        {mode === 'signup' && (
          <label>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{lang === 'bn' ? 'ফোন নম্বর (WhatsApp)' : 'WhatsApp / Phone for delivery'}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--green-600)', fontWeight: 600 }}>
                {lang === 'bn' ? 'ডেলিভারি অ্যালার্ট পাবেন' : '✅ Used for delivery alerts'}
              </span>
            </span>
            <input
              name="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(cleanDigits(e.target.value).slice(0, 10))}
              placeholder="e.g. 8170859653"
              maxLength={10}
              pattern="[6-9][0-9]{9}"
              title="10-digit Indian mobile number starting with 6-9"
              autoComplete="tel"
            />
          </label>
        )}
        {mode !== 'forgot' && (
          <label style={{ position: 'relative' }}>
            {lang === 'bn' ? 'পাসওয়ার্ড বা পিন (কমপক্ষে ৬টি সংকেত)' : 'PIN / Password (min 6 chars)'}
            <input
              name="password"
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              style={{ paddingRight: '40px' }}
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              style={{
                position: 'absolute',
                right: '8px',
                bottom: '10px',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                fontSize: '1.2rem',
                padding: '4px'
              }}
            >
              {showPass ? '🙈' : '👁️'}
            </button>
          </label>
        )}
        {mode === 'signup' && password.length > 0 && (
          <div style={{ marginTop: '0.2rem', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '4px', height: '4px', marginTop: '4px' }}>
              {[1, 2, 3, 4, 5].map((i) => {
                let score = 0;
                if (password.length >= 6) score++;
                if (password.length >= 8) score++;
                if (/[A-Z]/.test(password)) score++;
                if (/[0-9]/.test(password)) score++;
                if (/[^a-zA-Z0-9]/.test(password)) score++;
                const color = score <= 1 ? 'red' : score <= 3 ? 'orange' : 'green';
                return (
                  <div key={i} style={{ flex: 1, background: i <= score ? color : '#e5e7eb', borderRadius: '2px', transition: 'background 0.3s' }} />
                )
              })}
            </div>
            <div style={{ fontSize: '0.75rem', marginTop: '4px', textAlign: 'right', color: 'var(--text-light)' }}>
              {(() => {
                let score = 0;
                if (password.length >= 6) score++;
                if (password.length >= 8) score++;
                if (/[A-Z]/.test(password)) score++;
                if (/[0-9]/.test(password)) score++;
                if (/[^a-zA-Z0-9]/.test(password)) score++;
                return score <= 1 ? 'Weak' : score <= 3 ? 'Fair' : 'Strong';
              })()}
            </div>
          </div>
        )}
        {mode !== 'forgot' && (
          <label className="remember-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} name="remember" />
            <span>{lang === 'bn' ? 'লগইন তথ্য ব্রাউজারে সেভ রাখুন' : 'Save password & stay logged in'}</span>
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        {info && <p className="hint">{info}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy
            ? t(lang, 'pleaseWait')
            : mode === 'login'
              ? t(lang, 'login')
              : mode === 'forgot'
                ? lang === 'bn'
                  ? 'রিসেট লিংক পাঠান'
                  : 'Send reset link'
                : t(lang, 'createAccount')}
        </button>
      </form>

      {mode === 'login' && (
        <p className="hint" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setMode('forgot')
              setError('')
              setInfo('')
            }}
          >
            {lang === 'bn' ? 'পাসওয়ার্ড ভুলে গেছেন?' : 'Forgot password?'}
          </button>
        </p>
      )}

      {mode === 'forgot' && (
        <p className="hint" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setMode('login')
              setError('')
              setInfo('')
            }}
          >
            {lang === 'bn' ? '← লগইনে ফিরুন' : '← Back to login'}
          </button>
        </p>
      )}

      {mode !== 'forgot' && (
        <p className="hint" style={{ marginTop: '1rem' }}>
          {lang === 'bn'
            ? '১০ ডিজিটের মোবাইল নম্বর দিয়ে সহজে অ্যাকাউন্ট খুলুন ও অর্ডার করুন।'
            : 'Use your 10-digit mobile number for instant login and fast ordering.'}
        </p>
      )}

      <p className="hint" style={{ marginTop: '0.5rem' }}>
        <Link to="/">{lang === 'bn' ? 'দোকানে ফিরুন' : 'Back to shop'}</Link>
      </p>
    </div>
  )
}
