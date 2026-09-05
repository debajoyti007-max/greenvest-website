import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useStore } from '../context/useStore'
import { isValidIndianPhone, cleanDigits } from '../lib/phone'
import { formatAuthIdentifier } from '../lib/authUtils'
import { t } from '../lib/i18n'
import type { Role } from '../types'

function redirectFor(role: Role) {
  if (role === 'admin') return '/admin'
  if (role === 'seller') return '/seller'
  if (role === 'rider') return '/rider'
  return '/'
}

type Mode = 'login' | 'signup' | 'forgot' | 'mfa'

export default function Auth() {
  const { user, login, verifyAdminOtp, signup, resetPassword, loading } = useAuth()
  const { lang } = useStore()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [botTrap, setBotTrap] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPass, setShowPass] = useState(false)

  if (loading) {
    return (
      <div className="page narrow auth-page">
        <p className="lede center">{t(lang, 'loading')}</p>
      </div>
    )
  }

  if (user) return <Navigate to={redirectFor(user.role)} replace />

  const handleIdentifierChange = (val: string) => {
    setEmailOrPhone(val)
    if (mode === 'signup' && !val.includes('@')) {
      const d = cleanDigits(val)
      if (isValidIndianPhone(val)) setPhone(d.slice(-10))
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    // 🛡️ 1. Anti-Bot Honeypot Trap (Instantly catches automated spam scripts)
    if (botTrap) {
      console.warn('Bot detected via honeypot trap')
      setBusy(true)
      await new Promise((r) => setTimeout(r, 1200))
      setBusy(false)
      setError(lang === 'bn' ? 'অনুরোধ প্রত্যাখ্যান করা হয়েছে' : 'Request blocked.')
      return
    }

    // 🛡️ 2. Rapid Submission Rate Limiter
    const now = Date.now()
    const attemptsKey = 'gv_auth_attempt_log'
    let history: number[] = []
    try {
      history = JSON.parse(sessionStorage.getItem(attemptsKey) || '[]').filter((t: number) => now - t < 15000)
    } catch {}
    if (history.length >= 5) {
      setError(lang === 'bn' ? 'অতিরিক্ত চেষ্টার কারণে ১৫ সেকেন্ড অপেক্ষা করুন' : 'Too many attempts. Please wait 15 seconds.')
      return
    }
    history.push(now)
    try {
      sessionStorage.setItem(attemptsKey, JSON.stringify(history))
    } catch {}

    const cleanName = name.trim().replace(/\s+/g, ' ')
    const cleanId = emailOrPhone.trim()

    // ───── SUPER ADMIN MFA 2-STEP VERIFICATION ─────
    if (mode === 'mfa') {
      if (mfaCode.length !== 6) {
        setError(lang === 'bn' ? '৬-সংখ্যার কোড দিন' : 'Please enter the 6-digit code')
        return
      }
      setBusy(true)
      try {
        const res = await verifyAdminOtp(mfaCode.trim())
        if (!res.ok) {
          setError(res.error || (lang === 'bn' ? 'কোড ভুল হয়েছে বা মেয়াদ শেষ হয়েছে' : 'Invalid or expired code'))
          return
        }
        navigate(redirectFor(res.user!.role))
      } finally {
        setBusy(false)
      }
      return
    }

    // ───── LOGIN MODE ─────
    if (mode === 'login') {
      if (password.length !== 4) {
        setError(lang === 'bn' ? '৪-সংখ্যার পিন দিন' : 'Please enter a 4-digit PIN')
        return
      }
      setBusy(true)
      try {
        const targetMail = formatAuthIdentifier(cleanId)
        const res = await login(targetMail, password.trim())

        if (!res.ok) {
          setError(
            res.error ||
              (lang === 'bn'
                ? 'মোবাইল নম্বর/জিমেইল বা পিন ভুল হয়েছে। অ্যাকাউন্ট না থাকলে "সাইন আপ" করুন।'
                : 'Incorrect Mobile/Email or PIN. If you do not have an account, please click Sign Up.')
          )
          return
        }

        // 🔐 Super Admin 2FA challenge
        if (res.mfaPending) {
          setMode('mfa')
          setInfo(
            lang === 'bn'
              ? `📧 আপনার জিমেইলে (${targetMail}) একটি ৬-সংখ্যার সিকিউরিটি কোড পাঠানো হয়েছে।`
              : `📧 A 6-digit security code was sent to your Gmail (${targetMail}). Please enter it below.`,
          )
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
      const targetMail = formatAuthIdentifier(cleanId)
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

    if (password.length !== 4) {
      setError(lang === 'bn' ? '৪-সংখ্যার পিন দিন' : 'Please enter a 4-digit PIN')
      return
    }

    if (!emailOrPhone.includes('@') && !isValidIndianPhone(emailOrPhone)) {
      setError(lang === 'bn' ? 'সঠিক ১০-সংখ্যার মোবাইল নম্বর দিন' : 'Enter a valid 10-digit mobile number')
      return
    }

    setBusy(true)
    try {
      const targetMail = formatAuthIdentifier(emailOrPhone)
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
        {mode === 'mfa' && (lang === 'bn' ? 'সুপার অ্যাডমিন ওটিপি ভেরিফিকেশন' : 'Super Admin 2-Step Verification')}
        {mode === 'login' && (lang === 'bn' ? 'লগইন করুন (মোবাইল/জিমেইল ও ৪-সংখ্যার পিন)' : 'Login with Mobile / Gmail & 4-Digit PIN')}
        {mode === 'signup' && (lang === 'bn' ? 'নতুন অ্যাকাউন্ট খুলুন' : 'Create an Account')}
        {mode === 'forgot' && (lang === 'bn' ? 'পিন রিসেট ভেরিফিকেশন' : 'Security Verification to Reset PIN')}
      </p>

      {info && <p className="form-info">{info}</p>}
      {error && <p className="form-error">{error}</p>}

      {mode !== 'mfa' && (
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
      )}

      <form className="form" onSubmit={onSubmit}>
        {mode === 'mfa' ? (
          <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>👑</div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted, #64748b)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              {lang === 'bn'
                ? 'আপনার জিমেইলে পাঠানো ৬-সংখ্যার সিকিউরিটি কোড দিন:'
                : 'Enter the 6-digit security code sent to your Gmail:'}
            </p>

            <label style={{ textAlign: 'left', display: 'block' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                {lang === 'bn' ? '৬-সংখ্যার ওটিপি কোড (OTP)' : '6-Digit OTP Code'}
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                autoFocus
                required
                style={{
                  fontSize: '1.75rem',
                  letterSpacing: '0.5rem',
                  textAlign: 'center',
                  fontWeight: 700,
                  marginTop: '0.5rem',
                }}
              />
            </label>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1.25rem', padding: '0.85rem', fontSize: '1.05rem', fontWeight: 700 }}
              disabled={busy || mfaCode.length !== 6}
            >
              {busy
                ? (lang === 'bn' ? 'যাচাই হচ্ছে...' : 'Verifying...')
                : (lang === 'bn' ? 'যাচাই করে প্রবেশ করুন 👑' : 'Verify & Enter 👑')}
            </button>

            <button
              type="button"
              className="btn-link"
              style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: '1rem', fontSize: '0.85rem' }}
              onClick={() => {
                setMode('login')
                setMfaCode('')
                setError('')
                setInfo('')
              }}
            >
              {lang === 'bn' ? '← লগইন ফর্মে ফিরে যান' : '← Back to Login'}
            </button>
          </div>
        ) : (
          <>
            {/* Invisible Honeypot anti-bot shield (Zero impact on real humans) */}
            <input
              type="text"
              name="website_profile_url_verification"
              value={botTrap}
              onChange={(e) => setBotTrap(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ display: 'none', position: 'absolute', opacity: 0, height: 0, width: 0, zIndex: -1 }}
            />

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
                placeholder={lang === 'bn' ? 'আপনার ১০-সংখ্যার মোবাইল বা name@gmail.com' : 'Your 10-digit mobile or name@gmail.com'}
                required
                autoComplete="username"
              />
              {emailOrPhone.trim().length > 0 && (
                <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  {isEmailFormat ? (
                    <span style={{ color: 'green' }}>✅ Valid Gmail / Email format</span>
                  ) : (
                    <span style={{ color: digits.length === 10 && /^[6-9]/.test(digits) ? 'green' : 'red' }}>
                      {digits.length < 10 && '❌ Enter 10-digit mobile or valid Gmail'}
                      {digits.length === 10 && /^[6-9]/.test(digits) && '✅ Valid mobile number'}
                      {digits.length === 10 && !/^[6-9]/.test(digits) && '❌ Must start with 6-9'}
                    </span>
                  )}
                </div>
              )}
            </label>

            {mode === 'signup' && (
              <label>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{lang === 'bn' ? 'মোবাইল নম্বর (ডেলিভারির জন্য)' : 'Mobile Phone for delivery'}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--green-600)', fontWeight: 600 }}>
                    {lang === 'bn' ? 'ডেলিভারি অ্যালার্ট পাবেন' : '✅ Used for delivery alerts'}
                  </span>
                </span>
                <input
                  name="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(cleanDigits(e.target.value).slice(0, 10))}
                  placeholder={lang === 'bn' ? 'আপনার ১০-সংখ্যার মোবাইল নম্বর' : 'Enter 10-digit mobile number'}
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
                ? t(lang, 'login')
                : mode === 'signup'
                ? t(lang, 'signup')
                : (lang === 'bn' ? 'ইউজারনেম যাচাই ও পিন রিসেট করুন' : 'Verify Username & Reset PIN')}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
