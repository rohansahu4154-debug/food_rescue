import { useEffect } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Footer, Navbar } from '../components/Navbar'
import { useAppContext } from '../context/AppContext'
import type { AuthMode } from '../types'

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen">
      <Navbar />
      {children}
      <Footer />
    </div>
  )
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const {
    authMode,
    setAuthMode,
    currentUser,
    fullName,
    setFullName,
    email,
    setEmail,
    password,
    setPassword,
    authError,
    authMessage,
    busy,
    handleAuth,
  } = useAppContext()
  const navigate = useNavigate()

  useEffect(() => {
    setAuthMode(mode)
  }, [mode, setAuthMode])

  if (currentUser) {
    return <Navigate to={`/${currentUser.role}/dashboard`} replace />
  }

  return (
    <PublicShell>
      <main className="auth-page-container">
        <section id="account" className="account-card auth-page-card">
          <div className="account-intro">
            <span className="eyebrow">FoodRescue account</span>
            <h1>{mode === 'login' ? 'Welcome back' : 'Join the community'}</h1>
            <p>Sign in or create an account to take part in local food rescue.</p>
          </div>
          <div className="auth-form-column">
            <div className="auth-tabs" role="tablist" aria-label="Account action">
              <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setAuthMode('login'); navigate('/login') }}>Log in</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setAuthMode('register'); navigate('/register') }}>Register</button>
            </div>
            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && (
                <>
                  <label className="block text-sm font-medium">Full name
                    <input required minLength={2} maxLength={120} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" />
                  </label>
                </>
              )}
              <label className="block text-sm font-medium">Email address
                <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
              </label>
              <label className="block text-sm font-medium">Password
                <input required type="password" minLength={authMode === 'register' ? 8 : 1} maxLength={128} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={authMode === 'register' ? 'At least 8 characters' : 'Enter your password'} />
              </label>
              {authError ? <p role="alert" className="route-error">{authError}</p> : null}
              {authMessage ? <p role="status" className="route-success">{authMessage}</p> : null}
              <button type="submit" disabled={busy} className="button button-primary auth-submit">
                {busy ? 'Please wait...' : authMode === 'login' ? 'Log in' : 'Create account'}
              </button>
            </form>
          </div>
        </section>
      </main>
    </PublicShell>
  )
}

export function NotFoundPage() {
  return (
    <PublicShell>
      <main className="page-container not-found-page">
        <span className="eyebrow">Page not found</span>
        <h1>This page isn’t available.</h1>
        <Link className="button button-primary" to="/">Return home</Link>
      </main>
    </PublicShell>
  )
}
