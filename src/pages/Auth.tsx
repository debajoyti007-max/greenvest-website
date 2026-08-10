import { useState, useRef, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { isValidIndianPhone, cleanDigits } from '../lib/phone'
import { t } from '../lib/i18n'
import type { Role } from '../types'

function redirectFor(role: Role) {
  if (role === 'admin') return '/admin'
  if (role === 'seller') return '/seller'
  if (role === 'rider') return '/rider'
  return '/'
}

type Mode = 'login' | 'signup' | 'forgot'

export default function Auth() {
  const { user, login, signup, resetPassword, checkAccountExists, loading } = useAuth()
  const { lang } = useStore()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPass, setShowPass] = useState(false)

  // Real-time account existence indicator
  const [accountStatus, setAccountStatus] = useState<'idle' | 'checking' | 'exists' | 'not_found'>('idle')
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (loading) {
    return (
      <div className="page narrow auth-page">
        <p className="lede center">{t(lang, 'loading')}</p>
      </div>
    )
  }

  if (user) return <Navigate to={redirectFor(user.role)} replace />

  const getTargetEmail = (raw: string) => {
    const trimmed = raw.trim().toLowerCase().replace(/\s+/g, '')
    if (trimmed.includes('@')) return trimmed
    const digits = cleanDigits(trimmed)
    return digits ? `${digits}@greenvest.shop` : trimmed
  }

  // Real-time account check (debounced 600ms)
  const handleIdentifierChange = (val: string) => {
    setEmailOrPhone(val)
    setAccountStatus('idle')
    if (mode === 'signup' && !val.includes('@')) {
      const d = cleanDigits(val)
      if (isValidIndianPhone(val)) setPhone(d.slice(-10))
    }

    // Debounce account check
    if (checkTimer.current) clearTimeout(checkTimer.current)
    const trimmed = val.trim()
    if (trimmed.length < 3) { setAccountStatus('idle'); return }
    const isEmail = trimmed.includes('@')
    const digits = cleanDigits(trimmed)
    const isValidPhone = digits.length === 10 && /^[6-9]/.test(digits)
    if (!isEmail && !isValidPhone) { setAccountStatus('idle'); return }

    setAccountStatus('checking')
    checkTimer.current = setTimeout(async () => {
      try {
        const exists = await checkAccountExists(trimmed)
        setAccountStatus(exists ? 'exists' : 'not_found')
      } catch {
        setAccountStatus('idle')
      }
    }, 600)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    const cleanName = name.trim().replace(/\s+/g, ' ')
    const cleanId = emailOrPhone.trim()

    // ───── LOGIN MODE ─────
    if (mode === 'login') {
      setBusy(true)
      try {
        const targetMail = getTargetEmail(cleanId)
        const res = await login(targetMail, password.trim())

        if (!res.ok) {
          // Smart error: check if account exists to give specific message
          let accountExists = accountStatus === 'exists'
          if (accountStatus !== 'exists' && accountStatus !== 'not_found') {
            try { accountExists = await checkAccountExists(cleanId) } catch { /* ignore */ }
          }

          if (!accountExists) {
            // SUGGESTION #4: Auto-create account and login
            const autoName = cleanId.includes('@')
              ? cleanId.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ').trim() || 'Customer'
              : `User ${cleanDigits(cleanId).slice(-4)}`
            const signupRes = await signup(autoName, targetMail, password.trim(), cleanDigits(cleanId).slice(-10) || undefined)
            if (signupRes.ok && signupRes.user) {
              setInfo(lang === 'bn'
                ? '✅ নতুন অ্যাকাউন্ট তৈরি হয়েছে ও অটো লগইন হয়েছে!'
                : '✅ New account created & logged in automatically!')
              navigate(redirectFor(signupRes.user.role))
              return
            }
            // If auto-signup also fails, show helpful error
            setError(lang === 'bn'
              ? '❌ এই নম্বর/ইমেইলে কোনো অ্যাকাউন্ট নেই। সাইন আপ করুন!'
              : '❌ No account found with this number/email. Please Sign Up first!')
            setMode('signup')
            setName(autoName)
          } else {
            // Account exists but wrong PIN
            setError(lang === 'bn'
              ? '🔑 পিন ভুল হয়েছে! সঠিক ৪-সংখ্যার পিন দিন অথবা "পিন রিসেট" করুন।'
              : '🔑 Wrong PIN! Enter the correct 4-digit PIN or use "Forgot PIN?" to reset.')
          }
          return
        }
        navigate(redirectFor(res.user!.role))
      } finally {
        setBusy(false)
      }
      return
    }

    // ───── FORGOT PIN MODE ─────
    if (mode === 'forgot') {
      if (!cleanName) {
        setError(lang === 'bn' ? 'অ্যাকাউন্টের নাম (ইউজারনেম) লিখুন' : 'Enter your registered Username / Full Name')
        return
      }
      const targetMail = getTargetEmail(cleanId)
      if (!targetMail) {
        setError(lang === 'bn' ? 'মোবাইল নম্বর বা জিমেইল দিন' : 'Enter mobile number or Gmail address')
        return
      }
      if (password.length !== 4) {
        setError(lang === 'bn' ? 'নতুন ৪-সংখ্যার পিন দিন' : 'Enter a new 4-digit PIN')
        return
      }
      setBusy(true)
      try {
        const res = await resetPassword(cleanName, targetMail, password)
        if (!res.ok) {
          setError(res.error || (lang === 'bn' ? 'রিসেট ব্যর্থ হয়েছে' : 'Reset failed'))
          return
        }
        setInfo(
          lang === 'bn'
            ? `✅ পিন রিসেট সফল হয়েছে! আপনার নতুন ৪-সংখ্যার পিন দিয়ে লগইন করুন।`
            : `✅ PIN reset successful! Login now with your new 4-digit PIN.`
        )
        setMode('login')
      } catch {
        setError(lang === 'bn' ? 'রিসেট ব্যর্থ হয়েছে' : 'Reset failed')
      } finally {
        setBusy(false)
      }
      return
    }

    // ───── SIGNUP MODE ─────
    if (!name.trim()) {
      setError(lang === 'bn' ? 'নাম দিন' : 'Name required')
      return
    }

    // SUGGESTION #5: Warn about duplicate/similar emails
    if (accountStatus === 'exists') {
      setError(lang === 'bn'
        ? '⚠️ এই নম্বর/ইমেইলে ইতিমধ্যেই অ্যাকাউন্ট আছে! লগইন করুন।'
        : '⚠️ An account already exists with this number/email! Switch to Login tab.')
      return
    }

    setBusy(true)
    try {
      const targetMail = getTargetEmail(emailOrPhone)
      const res = await signup(name, targetMail, password, phone || cleanDigits(emailOrPhone))
      if (!res.ok) {
        setError(res.error || (lang === 'bn' ? 'সাইন আপ ব্যর্থ' : 'Signup failed'))
        return
      }
      if (res.user) {
        navigate(redirectFor(res.user.role))
      }
    } finally {
      setBusy(false)
    }
  }

  const isEmailFormat = emailOrPhone.includes('@')
  const digits = cleanDigits(emailOrPhone)

  return (
    <div className="page narrow auth-page">
      <h1 className="brand-hero compact">GreenVest</h1>
      <p className="lede center">
        {mode === 'login' && (lang === 'bn' ? 'লগইন করুন (মোবাইল/জিমেইল ও ৪-সংখ্যার পিন)' : 'Login with Mobile / Gmail & 4-Digit PIN')}
        {mode === 'signup' && (lang === 'bn' ? 'নতুন অ্যাকাউন্ট খুলুন' : 'Create an Account')}
        {mode === 'forgot' && (lang === 'bn' ? 'পিন রিসেট ভেরিফিকেশন' : 'Security Verification to Reset PIN')}
      </p>

      {info && <p className="form-info">{info}</p>}
      {error && <p className="form-error">{error}</p>}

      <div className="tab-buttons" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
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
          role="tab"
          aria-selected={mode === 'signup'}
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
        {(mode === 'signup' || mode === 'forgot') && (
          <label>
            {lang === 'bn' ? 'আপনার নাম (ইউজারনেম)' : 'Registered Name / Username'}
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={lang === 'bn' ? 'আপনার নাম (যেমন: দেবজ্যোতি দাস)' : 'Your full name / username'}
              required
              autoComplete="name"
            />
          </label>
        )}

        <label>
          {lang === 'bn' ? 'মোবাইল নম্বর বা জিমেইল (Gmail / Phone)' : 'Mobile Number or Gmail Address'}
          <input
            name="username"
            type="text"
            value={emailOrPhone}
            onChange={(e) => handleIdentifierChange(e.target.value)}
            placeholder={lang === 'bn' ? 'যেমন 8170859653 বা name@gmail.com' : 'e.g. 8170859653 or name@gmail.com'}
            required
            autoComplete="username"
          />
          {emailOrPhone.trim().length > 0 && (
            <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              {/* Format validation */}
              {isEmailFormat ? (
                <span style={{ color: 'green' }}>✅ Valid Gmail / Email format</span>
              ) : (
                <span style={{ color: digits.length === 10 && /^[6-9]/.test(digits) ? 'green' : 'red' }}>
                  {digits.length < 10 && '❌ Enter 10-digit mobile or valid Gmail'}
                  {digits.length === 10 && /^[6-9]/.test(digits) && '✅ Valid mobile number'}
                  {digits.length === 10 && !/^[6-9]/.test(digits) && '❌ Must start with 6-9'}
                </span>
              )}
              {/* SUGGESTION #3: Real-time account existence indicator */}
              {accountStatus === 'checking' && (
                <span style={{ color: '#6b7280', fontStyle: 'italic' }}>🔍 {lang === 'bn' ? 'অ্যাকাউন্ট চেক হচ্ছে...' : 'Checking account...'}</span>
              )}
              {accountStatus === 'exists' && (
                <span style={{ color: '#166534', fontWeight: 600 }}>✅ {lang === 'bn' ? 'অ্যাকাউন্ট পাওয়া গেছে — লগইন করুন!' : 'Account found — ready to Login!'}</span>
              )}
              {accountStatus === 'not_found' && mode === 'login' && (
                <span style={{ color: '#b45309', fontWeight: 600 }}>⚠️ {lang === 'bn' ? 'কোনো অ্যাকাউন্ট নেই — অটো সাইন আপ হবে' : 'No account yet — will auto-create on Login'}</span>
              )}
              {accountStatus === 'not_found' && mode === 'signup' && (
                <span style={{ color: '#166534', fontWeight: 600 }}>🆕 {lang === 'bn' ? 'নতুন অ্যাকাউন্ট তৈরি হবে' : 'New account — ready to Sign Up!'}</span>
              )}
            </div>
          )}
        </label>

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

        <label style={{ position: 'relative' }}>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{mode === 'forgot' ? (lang === 'bn' ? 'নতুন ৪-সংখ্যার সিকিউরিটি পিন (PIN)' : 'New 4-Digit Security PIN') : (lang === 'bn' ? '🔑 ৪-সংখ্যার সিকিউরিটি পিন (PIN)' : '🔑 4-Digit Quick PIN')}</span>
            <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
              {lang === 'bn' ? 'সহজ ৪ সংখ্যা' : 'Easy 4 digits'}
            </span>
          </span>
          <input
            name="password"
            type={showPass ? 'text' : 'password'}
            inputMode="numeric"
            maxLength={4}
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={lang === 'bn' ? 'যেমন ১২৩৪' : 'e.g. 1234'}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            style={{ paddingRight: '40px', letterSpacing: '0.2rem', fontWeight: 'bold' }}
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

        {mode === 'login' && (
          <div style={{ textAlign: 'right', marginTop: '-0.25rem' }}>
            <button
              type="button"
              className="btn-link"
              style={{ fontSize: '0.85rem' }}
              onClick={() => {
                setMode('forgot')
                setError('')
                setInfo('')
              }}
            >
              {lang === 'bn' ? 'পিন ভুলে গেছেন? (রিসেট ভেরিফিকেশন)' : 'Forgot PIN? Verify Username & Reset'}
            </button>
          </div>
        )}

        {mode === 'forgot' && (
          <div style={{ textAlign: 'right', marginTop: '-0.25rem' }}>
            <button
              type="button"
              className="btn-link"
              style={{ fontSize: '0.85rem' }}
              onClick={() => {
                setMode('login')
                setError('')
                setInfo('')
              }}
            >
              {lang === 'bn' ? '← লগইনে ফিরে যান' : '← Back to Login'}
            </button>
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy
            ? lang === 'bn' ? 'অপেক্ষা করুন...' : 'Please wait...'
            : mode === 'login'
            ? (accountStatus === 'not_found'
              ? (lang === 'bn' ? '🚀 অটো সাইন আপ ও লগইন' : '🚀 Auto Sign Up & Login')
              : t(lang, 'login'))
            : mode === 'signup'
            ? t(lang, 'signup')
            : (lang === 'bn' ? 'ইউজারনেম যাচাই ও পিন রিসেট করুন' : 'Verify Username & Reset PIN')}
        </button>
      </form>
    </div>
  )
}
