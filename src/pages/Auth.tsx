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

const DEMOS: { role: Role; email: string; label: string; labelBn: string; desc: string; descBn: string }[] = [
  {
    role: 'customer',
    email: 'customer@demo.com',
    label: 'Customer',
    labelBn: 'কাস্টমার',
    desc: 'Shop, cart, UPI pay + UTR, track orders',
    descBn: 'কেনাকাটা, কার্ট, UPI + UTR, অর্ডার ট্র্যাক',
  },
  {
    role: 'seller',
    email: 'seller@demo.com',
    label: 'Seller',
    labelBn: 'সেলার',
    desc: 'Stock, prices, verify UTR, revenue',
    descBn: 'স্টক, দাম, UTR যাচাই, আয়',
  },
  {
    role: 'admin',
    email: 'admin@demo.com',
    label: 'Admin',
    labelBn: 'অ্যাডমিন',
    desc: 'Make / revoke sellers only (no revenue)',
    descBn: 'সেলার বানানো/বাতিল (আয় নেই)',
  },
]

export default function Auth() {
  const { user, login, signup, loading, mode: dataMode } = useAuth()
  const { lang } = useStore()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
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
        navigate('/')
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

      {dataMode === 'cloud' ? (
        <div className="alert warn" style={{ background: '#ecfdf5', borderColor: '#86efac', color: '#14532d' }}>
          <strong>{lang === 'bn' ? 'ক্লাউড রেডি' : 'Cloud ready'}</strong>
          <span>
            {lang === 'bn'
              ? 'অর্ডার সব ডিভাইসে শেয়ার হবে। নিচে এক ক্লিকে লগইন করুন।'
              : 'Orders sync across devices. Use one-click login below.'}
          </span>
        </div>
      ) : (
        <div className="alert warn" style={{ background: '#ecfdf5', borderColor: '#86efac', color: '#14532d' }}>
          <strong>{lang === 'bn' ? 'লোকাল ডেমো' : 'Local demo'}</strong>
          <span>
            {lang === 'bn'
              ? 'এক ক্লিকে লগইন করুন — এখনই কাজ করবে।'
              : 'Use one-click login below — works on this PC.'}
          </span>
        </div>
      )}

      <div className="auth-tabs">
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => setMode('login')}
        >
          {t(lang, 'login')}
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'active' : ''}
          onClick={() => setMode('signup')}
        >
          {t(lang, 'signup')}
        </button>
      </div>

      <form className="form" onSubmit={onSubmit}>
        {mode === 'signup' && (
          <label>
            {t(lang, 'name')}
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          {t(lang, 'email')}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
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
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy
            ? t(lang, 'pleaseWait')
            : mode === 'login'
              ? t(lang, 'login')
              : t(lang, 'createAccount')}
        </button>
      </form>

      <div className="demo-box">
        <h3>{lang === 'bn' ? 'এক ক্লিকে ডেমো লগইন' : 'One-click demo login'}</h3>
        <p>
          {t(lang, 'password')}: <code>demo123</code>
        </p>
        <div className="demo-roles">
          {DEMOS.map((d) => (
            <button
              key={d.email}
              type="button"
              className="demo-role-card"
              disabled={busy}
              onClick={() => {
                setEmail(d.email)
                setPassword('demo123')
                setMode('login')
                void doLogin(d.email, 'demo123')
              }}
            >
              <strong>{lang === 'bn' ? d.labelBn : d.label}</strong>
              <span className="muted">{d.email}</span>
              <em>{lang === 'bn' ? d.descBn : d.desc}</em>
            </button>
          ))}
        </div>
        <p className="hint">
          {lang === 'bn'
            ? 'সাইন আপ শুধু কাস্টমার বানায়। সেলার হতে অ্যাডমিন “Make seller” করবে।'
            : 'Sign up creates a customer only. Admin can promote someone to seller.'}
        </p>
      </div>
    </div>
  )
}
