import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useStore } from '../context/useStore'
import { showToast } from '../lib/toast'
import { t } from '../lib/i18n'

/** Landed here from reset link — set a new 4-digit PIN. */
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
            ? 'রিসেট নির্দেশ চেক করা হচ্ছে। নতুন পিন লিখুন।'
            : 'Enter your new preferred 4-digit PIN below.'}
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
    if (password.length !== 4) {
      setError(lang === 'bn' ? 'পিন ঠিক ৪ সংখ্যার হতে হবে' : 'PIN must be exactly 4 digits')
      return
    }
    if (password !== confirm) {
      setError(lang === 'bn' ? 'পিন মিলছে না' : 'PINs do not match')
      return
    }
    setBusy(true)
    try {
      const res = await updatePassword(password)
      if (!res.ok) {
        setError(res.error || 'Update failed')
        return
      }
      showToast(lang === 'bn' ? '🔑 নতুন পিন সেভ হয়েছে!' : '🔑 New PIN saved successfully!', '🎉')
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
        {lang === 'bn' ? '🔑 আপনার নতুন ৪-সংখ্যার পিন সেভ করুন' : '🔑 Set Your New 4-Digit Security PIN'}
      </p>
      <form className="form" onSubmit={onSubmit}>
        <label>
          {lang === 'bn' ? 'নতুন ৪-সংখ্যার পিন (PIN)' : 'New 4-Digit PIN'}
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={lang === 'bn' ? 'যেমন ১২৩৪' : 'e.g. 1234'}
            required
            autoComplete="new-password"
            style={{ fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '0.2rem' }}
          />
        </label>
        <label>
          {lang === 'bn' ? 'পিন আবার লিখুন' : 'Confirm New PIN'}
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={lang === 'bn' ? 'যেমন ১২৩৪' : 'e.g. 1234'}
            required
            autoComplete="new-password"
            style={{ fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '0.2rem' }}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? t(lang, 'pleaseWait') : lang === 'bn' ? 'নতুন পিন সেভ করুন' : 'Save New PIN'}
        </button>
      </form>
    </div>
  )
}
