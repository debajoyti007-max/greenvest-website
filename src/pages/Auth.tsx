import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

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
      const res = await signup(name, email, password)
      if (!res.ok) {
        setError(res.error || (lang === 'bn' ? 'সাইন আপ ব্যর্থ' : 'Signup failed'))
        return
      }
      if (res.user) {
        navigate(redirectFor(res.user.role))
        return
      }
      setMode('login')
      setInfo(
        lang === 'bn'
          ? 'অ্যাকাউন্ট তৈরি হয়েছে। ইমেইলে কনফার্ম লিংক খুলে তারপর লগইন করুন (লিংক না এলে অ্যাডমিনকে বলুন)।'
          : 'Account created. Open the confirm link in your email, then log in (if no email arrives, ask admin).',
      )
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
            onChange={(e) => setEmail(e.target.value)}
            placeholder={lang === 'bn' ? 'যেমন 8170859653' : 'e.g. 8170859653'}
            required
            autoComplete="username"
          />
        </label>
        {mode !== 'forgot' && (
          <label>
            {lang === 'bn' ? 'পাসওয়ার্ড বা পিন (কমপক্ষে ৬টি সংকেত)' : 'PIN / Password (min 6 chars)'}
            <input
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
        )}
        {mode !== 'forgot' && (
          <label className="remember-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input type="checkbox" defaultChecked name="remember" />
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
