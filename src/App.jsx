import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { TeamProvider } from './context/TeamContext'
import { CreditsProvider } from './context/CreditsContext'
import ToastHost from './components/ui/ToastHost'
import Landing from './pages/Landing'
import { WorkspaceLayout, CourseOverviewRoute, CoursePlayerRoute, TestRoute, DashboardRoute, CoursesRoute, Teams, Chat, Leaderboard, Profile, Credits, AddCourse, Admin } from './router'
import { useAuth as useAuthContext } from './context/AuthContext'
import { supabase } from './lib/supabase'

function AuthPage({ mode }) {
  const [signup, setSignup] = useState(mode === 'signup')
  const [forgot, setForgot] = useState(mode === 'forgot')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const { resetPassword, signUp, signIn } = useAuthContext()
  const navigate = useNavigate()

  useEffect(() => { setSignup(mode === 'signup'); setForgot(mode === 'forgot'); setError(''); setMessage('') }, [mode])

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (forgot) { await resetPassword(email); setMessage('Password reset link sent. Check your inbox.') }
      else { await (signup ? signUp(email, password, name) : signIn(email, password)); if (signup) setMessage('Check your email to confirm your account.') }
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const switchMode = () => navigate(signup ? '/login' : '/signup')
  return <main className="auth"><div className="auth-card">
    <button className="auth-back" onClick={() => navigate('/')}>← Back to LearningBeyond</button>
    <div className="brand">Learning<span>Beyond</span></div><p className="eyebrow">YOUR LEARNING OS</p>
    <h1>{forgot ? 'Reset your password' : signup ? 'Create your account' : 'Welcome back'}</h1>
    <p className="auth-subtitle">{forgot ? 'Enter your email and we’ll send you a secure password reset link.' : signup ? 'Build your learning space and start turning progress into momentum.' : 'Pick up where you left off and keep your learning momentum going.'}</p>
    <form onSubmit={submit}>{signup && !forgot && <input value={name} onChange={e => setName(e.target.value)} placeholder="Display name" required />}
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" required />
      {!forgot && <><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" minLength="6" required /><button type="button" className="forgot-link" onClick={() => navigate('/forgot-password')}>Forgot password?</button></>}
      <button disabled={busy}>{busy ? 'Please wait…' : forgot ? 'Send reset link' : signup ? 'Create account' : 'Sign in'} {!busy && !forgot && <span>→</span>}</button>
    </form>
    {message && <div className="success">{message}</div>}{error && <div className="error">{error}</div>}
    {!forgot ? <button className="link" onClick={switchMode}>{signup ? 'Already have an account? Sign in' : 'New to LearningBeyond? Create account'}</button> : <button className="link" onClick={() => navigate('/login')}>← Back to sign in</button>}
  </div></main>
}

function PasswordRecovery() {
  const { updateRecoveredPassword, resetEmail } = useAuth(); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false); const navigate = useNavigate()
  async function submit(e) { e.preventDefault(); setError(''); if (password.length < 6) return setError('Password must be at least 6 characters.'); if (password !== confirm) return setError('Passwords do not match.'); setBusy(true); try { await updateRecoveredPassword(password); setDone(true) } catch (e) { setError(e.message) } finally { setBusy(false) } }
  if (done) return <main className="auth"><div className="auth-card"><div className="brand">Learning<span>Beyond</span></div><p className="eyebrow">PASSWORD UPDATED</p><h1>You’re all set</h1><p className="auth-subtitle">Your password has been updated. You can sign in with your new password.</p><button className="link" onClick={() => navigate('/login')}>Continue to sign in</button></div></main>
  return <main className="auth"><div className="auth-card"><div className="brand">Learning<span>Beyond</span></div><p className="eyebrow">PASSWORD RECOVERY</p><h1>Set a new password</h1><p className="auth-subtitle">Choose a new password for your LearningBeyond account.</p><form onSubmit={submit}><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" minLength="6" required /><input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm new password" minLength="6" required /><button disabled={busy}>{busy ? 'Updating…' : 'Update password'} <span>→</span></button></form>{resetEmail && <small>{resetEmail}</small>}{error && <div className="error">{error}</div>}</div></main>
}

function PublicRoutes() {
  const { user, loading, passwordRecovery } = useAuth(); const location = useLocation()
  if (loading) return <div className="splash">Learning<span>Beyond</span></div>
  if (passwordRecovery) return <PasswordRecovery />
  if (user) return <Navigate to="/app" replace />
  if (location.pathname === '/login') return <AuthPage mode="login" />
  if (location.pathname === '/signup') return <AuthPage mode="signup" />
  if (location.pathname === '/forgot-password') return <AuthPage mode="forgot" />
  return <Landing onAuth={mode => window.history.pushState({}, '', mode === 'signup' ? '/signup' : '/login')} />
}

function App() {
  return <BrowserRouter><AuthProvider><CreditsProvider><TeamProvider><ToastHost /><Routes>
    <Route path="/" element={<PublicRoutes />} /><Route path="/login" element={<PublicRoutes />} /><Route path="/signup" element={<PublicRoutes />} /><Route path="/forgot-password" element={<PublicRoutes />} />
    <Route path="/app" element={<WorkspaceLayout />}><Route index element={<DashboardRoute />} /><Route path="dashboard" element={<DashboardRoute />} /><Route path="courses" element={<CoursesRoute />} /><Route path="courses/add" element={<AddCourse />} /><Route path="courses/:courseId" element={<CourseOverviewRoute />} /><Route path="courses/:courseId/lesson/:videoId" element={<CoursePlayerRoute />} /><Route path="teams" element={<Teams />} /><Route path="chat" element={<Chat />} /><Route path="leaderboard" element={<Leaderboard />} /><Route path="profile" element={<Profile />} /><Route path="credits" element={<Credits />} /><Route path="tests/:testId" element={<TestRoute />} /><Route path="admin" element={<Admin />} /></Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></TeamProvider></CreditsProvider></AuthProvider></BrowserRouter>
}

export default App
