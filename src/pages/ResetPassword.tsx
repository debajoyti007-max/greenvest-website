import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { t } from '../lib/i18n'

/** Landed here from Supabase recovery email link — set a new password. */
export default function ResetPassword() {
  const { user, loading, updatePassword } = useAuth()
  const { lang } = useStore()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  if (loading) {
    return (
      <div className="page narrow auth-page">
        <p className="lede center">{t(lang, 'loading')}</p>
      </div>
    )
  }

  if (!user && !done) {
    return (
      <div className="page narrow auth-page">
        <h1 className="brand-hero compact">GreenVest</h1>
        <p className="form-error">
          {lang === 'bn'
            ? 'রিসেট লিংক অবৈধ বা মেয়াদ শেষ। আবার Forgot password চেষ্টা করুন।'
            : 'Reset link is invalid or expired. Try Forgot password again.'}
        </p>
        <Link to="/auth" className="btn btn-primary">
          {t(lang, 'login')}
        </Link>
      </div>
    )
  }

  if (done) {
    return <Navigate to="/" replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError(lang === 'bn' ? 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর' : 'Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError(lang === 'bn' ? 'পাসওয়ার্ড মিলছে না' : 'Passwords do not match')
      return
    }
    setBusy(true)
    try {
      const res = await updatePassword(password)
      if (!res.ok) {
        setError(res.error || 'Update failed')
        return
      }
      setDone(true)
      navigate('/')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page narrow auth-page">
      <h1 className="brand-hero compact">GreenVest</h1>
      <p className="lede center">
        {lang === 'bn' ? 'নতুন পাসওয়ার্ড সেট করুন' : 'Set a new password'}
      </p>
      <form className="form" onSubmit={onSubmit}>
        <label>
          {t(lang, 'password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        <label>
          {lang === 'bn' ? 'পাসওয়ার্ড আবার' : 'Confirm password'}
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? t(lang, 'pleaseWait') : lang === 'bn' ? 'পাসওয়ার্ড সেভ' : 'Save password'}
        </button>
      </form>
    </div>
  )
}
