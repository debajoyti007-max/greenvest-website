import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { t } from '../lib/i18n'
import type { Role } from '../types'

function redirectFor(role: Role) {
  if (role === 'admin') return '/admin'
  if (role === 'seller') return '/seller'
  return '/'
}

export default function Auth() {
  const { user, login, signup, loading } = useAuth()
  const { lang } = useStore()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
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
            (lang === 'bn' ? 'লগইন ব্যর্থ — ইমেইল/পাসওয়ার্ড চেক করুন' : 'Login failed'),
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
    } else {
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
            ? 'অ্যাকাউন্ট তৈরি হয়েছে। ইমেইলে কনফার্ম লিংক থাকলে খুলুন, তারপর লগইন করুন।'
            : 'Account created. Confirm your email if required, then log in.',
        )
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <div className="page narrow auth-page">
      <h1 className="brand-hero compact">GreenVest</h1>
      <p className="lede center">
        {mode === 'login' ? t(lang, 'welcomeLogin') : t(lang, 'welcomeSignup')}
      </p>

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

      <form className="form" onSubmit={onSubmit}>
        {mode === 'signup' && (
          <label>
            {t(lang, 'name')}
            <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label>
          {t(lang, 'email')}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          {t(lang, 'password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        {info && <p className="hint">{info}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy
            ? t(lang, 'pleaseWait')
            : mode === 'login'
              ? t(lang, 'login')
              : t(lang, 'createAccount')}
        </button>
      </form>

      <p className="hint" style={{ marginTop: '1rem' }}>
        {lang === 'bn'
          ? 'নতুন অ্যাকাউন্ট কাস্টমার হিসেবে তৈরি হয়। সেলার অ্যাকাউন্ট অ্যাডমিন অনুমোদন করে।'
          : 'New accounts are customers. An admin promotes sellers.'}
      </p>
    </div>
  )
}
