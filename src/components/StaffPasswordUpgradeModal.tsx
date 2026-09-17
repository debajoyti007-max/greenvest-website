import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/useAuth'
import { useStore } from '../context/useStore'
import { getActiveUserPin } from '../lib/storage'

export default function StaffPasswordUpgradeModal() {
  const { user, upgradeStaffPassword } = useAuth()
  const { lang } = useStore()

  const activePin = user ? getActiveUserPin(user) : ''
  // Pre-fill with the cached credential so the user doesn't need to type it again
  const [currentPin, setCurrentPin] = useState(activePin || '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  if (!user) return null

  const isStaff = user.role === 'admin' || user.role === 'seller' || user.role === 'rider' || user.isSuperAdmin
  if (!isStaff) return null

  // Only show upgrade modal if explicitly flagged by the DB AND the cached credential is still
  // a legacy short PIN (< 8 chars). If the active credential is already 8+ chars, the upgrade
  // is complete — never show the modal again to avoid the "incorrect PIN" confusion loop.
  const needsUpgrade = Boolean(user.needsPasswordUpgrade) && !(activePin && activePin.length >= 8)
  if (!needsUpgrade) return null

  const roleLabel =
    user.isSuperAdmin
      ? (lang === 'bn' ? 'সুপার অ্যাডমিন' : 'Super Admin')
      : user.role === 'admin'
      ? (lang === 'bn' ? 'অ্যাডমিনিস্ট্রেটর' : 'Administrator')
      : user.role === 'seller'
      ? (lang === 'bn' ? 'সেলার / শপ ম্যানেজার' : 'Seller / Shop Manager')
      : (lang === 'bn' ? 'ডেলিভারি রাইডার' : 'Delivery Rider')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    const cleanPass = newPassword.trim()
    const cleanConfirm = confirmPassword.trim()
    const cleanOld = currentPin.trim()

    if (cleanPass.length < 8) {
      setError(lang === 'bn' ? 'পাসওয়ার্ড অবশ্যই কমপক্ষে ৮ অক্ষরের হতে হবে' : 'Password must be at least 8 characters long')
      return
    }

    if (cleanPass !== cleanConfirm) {
      setError(lang === 'bn' ? 'দুটি পাসওয়ার্ড মিলছে না' : 'Passwords do not match')
      return
    }

    setBusy(true)
    try {
      const res = await upgradeStaffPassword(cleanPass, cleanOld)
      if (!res.ok) {
        setError(res.error || (lang === 'bn' ? 'পাসওয়ার্ড আপডেট ব্যর্থ হয়েছে' : 'Failed to update password'))
        return
      }
      setSuccessMsg(
        lang === 'bn'
          ? '✅ স্টাফ পাসওয়ার্ড সফলভাবে সংরক্ষিত হয়েছে! পুরনো ৪-সংখ্যার পিনটি নিষ্ক্রিয় করা হয়েছে।'
          : '✅ Staff password updated! Your old 4-digit PIN has been deactivated.'
      )
    } catch (err: any) {
      setError(err?.message || (lang === 'bn' ? 'ত্রুটি ঘটেছে' : 'An error occurred'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="modal-content glass-card"
        style={{
          maxWidth: '460px',
          width: '100%',
          background: '#ffffff',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#ecfdf5',
              border: '2px solid #10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
              margin: '0 auto 0.75rem',
            }}
          >
            🛡️
          </div>
          <h2 style={{ fontSize: '1.35rem', margin: '0 0 0.5rem 0', color: '#0f172a', fontWeight: 700 }}>
            {lang === 'bn' ? 'স্টাফ সিকিউরিটি আপগ্রেড' : 'Staff Security Upgrade'}
          </h2>
          <span
            style={{
              display: 'inline-block',
              background: '#f1f5f9',
              color: '#334155',
              fontSize: '0.8rem',
              fontWeight: 600,
              padding: '2px 10px',
              borderRadius: '999px',
              marginBottom: '0.75rem',
            }}
          >
            {roleLabel}
          </span>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
            {lang === 'bn'
              ? 'স্টাফ প্যানেলের সুরক্ষার জন্য আপনার অ্যাকাউন্টটিকে ৪-সংখ্যার পিন থেকে ৮+ অক্ষরের শক্তিশালী পাসওয়ার্ডে আপগ্রেড করতে হবে।'
              : 'To secure customer data and orders, staff accounts must upgrade from a 4-digit PIN to a strong 8+ character password.'}
          </p>
        </div>

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#166534',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Current PIN or Password */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            <span>{lang === 'bn' ? 'বর্তমান পিন বা পাসওয়ার্ড' : 'Current PIN or Password'}</span>
            <input
              type="password"
              autoComplete="current-password"
              maxLength={30}
              required
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder={lang === 'bn' ? 'আপনার বর্তমান পিন বা পাসওয়ার্ড' : 'Enter your current PIN or password'}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '1rem',
                fontWeight: 700,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </label>

          {/* New 8+ char password */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, color: '#334155', position: 'relative' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{lang === 'bn' ? 'নতুন স্টাফ পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)' : 'New Staff Password (min. 8 chars)'}</span>
              <span style={{ fontSize: '0.75rem', color: newPassword.length >= 8 ? '#16a34a' : '#64748b' }}>
                {newPassword.length}/8+
              </span>
            </span>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={lang === 'bn' ? 'কমপক্ষে ৮ অক্ষরের শক্তিশালী পাসওয়ার্ড' : 'Enter 8+ characters'}
                style={{
                  width: '100%',
                  padding: '0.65rem 2.5rem 0.65rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  padding: '4px',
                }}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          {/* Confirm new password */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            <span>{lang === 'bn' ? 'পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm New Password'}</span>
            <input
              type={showPass ? 'text' : 'password'}
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={lang === 'bn' ? 'পাসওয়ার্ড পুনরায় লিখুন' : 'Re-enter new password'}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </label>

          <button
            type="submit"
            disabled={busy || newPassword.length < 8 || newPassword !== confirmPassword}
            style={{
              marginTop: '0.5rem',
              padding: '0.75rem',
              background: '#047857',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy || newPassword.length < 8 || newPassword !== confirmPassword ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            {busy
              ? (lang === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...')
              : (lang === 'bn' ? '🔒 পাসওয়ার্ড সংরক্ষণ ও প্যানেল আনলক করুন' : '🔒 Save Password & Unlock Dashboard')}
          </button>
        </form>
      </div>
    </div>
  )
}
