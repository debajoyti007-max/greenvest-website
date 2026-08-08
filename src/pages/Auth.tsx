import { FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import type { Role } from '../types'

function redirectFor(role: Role) {
  if (role === 'admin') return '/admin'
  if (role === 'seller') return '/seller'
  return '/'
}

export default function Auth() {
  const { user, login, signup } = useAuth()
  const { lang } = useStore()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  if (user) return <Navigate to={redirectFor(user.role)} replace />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'login') {
      const res = login(email, password)
      if (!res.ok) {
        setError(res.error || 'Login failed')
        return
      }
      navigate(redirectFor(res.user!.role))
    } else {
      if (!name.trim()) {
        setError('Name required')
        return
      }
      const res = signup(name, email, password)
      if (!res.ok) {
        setError(res.error || 'Signup failed')
        return
      }
      navigate('/')
    }
  }

  return (
    <div className="page narrow auth-page">
      <h1 className="brand-hero compact">GreenVest</h1>
      <p className="lede center">
        {mode === 'login'
          ? lang === 'bn'
            ? 'আপনার অ্যাকাউন্টে লগইন করুন'
            : 'Sign in to your account'
          : lang === 'bn'
            ? 'নতুন অ্যাকাউন্ট তৈরি করুন'
            : 'Create a customer account'}
      </p>

      <div className="auth-tabs">
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => setMode('login')}
        >
          Login
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'active' : ''}
          onClick={() => setMode('signup')}
        >
          Sign up
        </button>
      </div>

      <form className="form" onSubmit={onSubmit}>
        {mode === 'signup' && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn-primary">
          {mode === 'login' ? 'Login' : 'Create account'}
        </button>
      </form>

      <div className="demo-box">
        <h3>Demo logins</h3>
        <p>password: <code>demo123</code></p>
        <ul>
          <li>
            <button type="button" onClick={() => { setEmail('customer@demo.com'); setPassword('demo123'); setMode('login') }}>
              customer@demo.com
            </button>
          </li>
          <li>
            <button type="button" onClick={() => { setEmail('seller@demo.com'); setPassword('demo123'); setMode('login') }}>
              seller@demo.com
            </button>
          </li>
          <li>
            <button type="button" onClick={() => { setEmail('admin@demo.com'); setPassword('demo123'); setMode('login') }}>
              admin@demo.com
            </button>
          </li>
        </ul>
      </div>
    </div>
  )
}
