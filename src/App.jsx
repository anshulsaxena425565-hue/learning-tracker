import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { TeamProvider } from './context/TeamContext'
import { CreditsProvider } from './context/CreditsContext'
import ToastHost from './components/ui/ToastHost'
import Landing from './pages/Landing'
import { WorkspaceLayout, CourseOverviewRoute, CoursePlayerRoute, TestRoute, DashboardRoute, CoursesRoute, Teams, Chat, Leaderboard, Profile, Credits, AddCourse, Admin } from './router'
import { useAuth as useAuthContext } from './context/AuthContext'

function AuthPage({ mode }) {
  const [signup, setSignup] = useState(mode === 'signup')
  const [forgot, setForgot] = useState(mode === 'forgot')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const { resetPassword, signUp, signIn } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    setSignup(mode === 'signup')
    setForgot(mode === 'forgot')
    setError('')
    setMessage('')
  }, [mode])

  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      if (forgot) {
        await resetPassword(email)
        setMessage('Password reset link sent. Check your inbox.')
      } else {
        await (signup ? signUp(email, password, name) : signIn(email, password))
        if (signup) setMessage('Check your email to confirm your account.')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const switchMode = () => navigate(signup ? '/login' : '/signup')

  const highlights = signup
    ? [
        ['✦', 'One beautiful learning space', 'Courses, notes, quizzes and progress in one place.'],
        ['↗', 'Turn effort into momentum', 'See your streaks, milestones and learning growth.'],
        ['∞', 'Learn together', 'Teams, shared notes and friendly competition built in.'],
      ]
    : [
        ['✦', 'Welcome back, learner', 'Your courses, progress and team activity are waiting.'],
        ['↗', 'Keep your momentum', 'Jump straight back into the things you were learning.'],
        ['∞', 'Everything stays connected', 'Your workspace brings learning and progress together.'],
      ]

  return (
    <main className="auth-shell">
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />
      <div className="auth-orb auth-orb-three" />

      <section className="auth-showcase" aria-hidden="true">
        <button className="auth-brand" onClick={() => navigate('/')} type="button">
          <span className="auth-brand-mark">L</span>
          <span>Learning<b>Beyond</b></span>
        </button>

        <div className="auth-showcase-content">
          <span className="auth-kicker">{forgot ? 'A fresh start' : signup ? 'Your learning era starts here' : 'Good to see you again'}</span>
          <h2>{forgot ? <>Reset.<br /><em>Refocus.</em><br />Keep going.</> : signup ? <>Make learning<br /><em>feel like progress.</em></> : <>Ready to pick up<br /><em>where you left off?</em></>}</h2>
          <p>{forgot ? 'Set a new password and get back to your learning space.' : 'A calmer, smarter place to learn, build momentum and actually see how far you have come.'}</p>

          {!forgot && (
            <div className="auth-highlights">
              {highlights.map(([icon, title, copy]) => (
                <div className="auth-highlight" key={title}>
                  <span>{icon}</span>
                  <div><b>{title}</b><small>{copy}</small></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="auth-showcase-footer">
          <span><i /> Built for curious minds</span>
          <span>LearningBeyond · 2026</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-mobile-brand">
          <button className="auth-brand" onClick={() => navigate('/')} type="button">
            <span className="auth-brand-mark">L</span>
            <span>Learning<b>Beyond</b></span>
          </button>
          <button className="auth-mobile-back" onClick={() => navigate('/')} type="button">Back home</button>
        </div>

        <div className="auth-form-wrap">
          <button className="auth-back" onClick={() => navigate('/')}>← Back to LearningBeyond</button>

          <div className="auth-form-heading">
            <div className="auth-status">
              <span>{forgot ? 'PASSWORD RECOVERY' : signup ? 'CREATE YOUR SPACE' : 'WELCOME BACK'}</span>
              <i />
            </div>
            <h1>{forgot ? 'Reset your password' : signup ? <>Create your<br /><strong>learning space.</strong></> : <>Welcome <strong>back.</strong></>}</h1>
            <p>{forgot ? 'Enter your email and we’ll send you a secure password reset link.' : signup ? 'Your courses, progress and learning momentum — all in one beautiful place.' : 'Pick up where you left off and keep your learning momentum moving.'}</p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {signup && !forgot && (
              <label>
                <span>Your name</span>
                <div className="auth-input-wrap"><span>✦</span><input value={name} onChange={e => setName(e.target.value)} placeholder="What should we call you?" autoComplete="name" required /></div>
              </label>
            )}
            <label>
              <span>Email address</span>
              <div className="auth-input-wrap"><span>@</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></div>
            </label>
            {!forgot && (
              <label>
                <div className="auth-label-row"><span>Password</span>{!signup && <button type="button" className="auth-forgot" onClick={() => navigate('/forgot-password')}>Forgot password?</button>}</div>
                <div className="auth-input-wrap"><span>••</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" minLength="6" autoComplete={signup ? 'new-password' : 'current-password'} required /></div>
              </label>
            )}

            <button className="auth-submit" disabled={busy} type="submit">
              <span>{busy ? 'Working on it…' : forgot ? 'Send reset link' : signup ? 'Create my account' : 'Enter LearningBeyond'}</span>
              {!busy && <b>↗</b>}
            </button>
          </form>

          {message && <div className="auth-feedback auth-success"><span>✓</span><div>{message}</div></div>}
          {error && <div className="auth-feedback auth-error"><span>!</span><div>{error}</div></div>}

          {!forgot ? (
            <div className="auth-switch">
              <span>{signup ? 'Already learning with us?' : 'New to LearningBeyond?'}</span>
              <button onClick={switchMode}>{signup ? 'Sign in' : 'Create an account'} <b>→</b></button>
            </div>
          ) : (
            <div className="auth-switch"><button onClick={() => navigate('/login')}>← Back to sign in</button></div>
          )}

          <p className="auth-privacy">By continuing, you agree to use LearningBeyond responsibly and respectfully.</p>
        </div>
      </section>
    </main>
  )
}

function PasswordRecovery() {
  const { updateRecoveredPassword, resetEmail } = useAuth(); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false); const navigate = useNavigate()
  async function submit(e) { e.preventDefault(); setError(''); if (password.length < 6) return setError('Password must be at least 6 characters.'); if (password !== confirm) return setError('Passwords do not match.'); setBusy(true); try { await updateRecoveredPassword(password); setDone(true) } catch (e) { setError(e.message) } finally { setBusy(false) } }
  if (done) return <main className="auth"><div className="auth-card"><div className="brand">Learning<span>Beyond</span></div><p className="eyebrow">PASSWORD UPDATED</p><h1>You’re all set</h1><p className="auth-subtitle">Your password has been updated. You can sign in with your new password.</p><button className="link" onClick={() => navigate('/login')}>Continue to sign in</button></div></main>
  return <main className="auth"><div className="auth-card"><div className="brand">Learning<span>Beyond</span></div><p className="eyebrow">PASSWORD RECOVERY</p><h1>Set a new password</h1><p className="auth-subtitle">Choose a new password for your LearningBeyond account.</p><form onSubmit={submit}><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" minLength="6" required /><input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm new password" minLength="6" required /><button disabled={busy}>{busy ? 'Updating…' : 'Update password'} <span>→</span></button></form>{resetEmail && <small>{resetEmail}</small>}{error && <div className="error">{error}</div>}</div></main>
}

function PublicRoutes() {
  const { user, loading, passwordRecovery } = useAuth(); const location = useLocation(); const navigate = useNavigate()
  if (loading) return <div className="splash">Learning<span>Beyond</span></div>
  if (passwordRecovery) return <PasswordRecovery />
  if (user) return <Navigate to="/app" replace />
  if (location.pathname === '/login') return <AuthPage mode="login" />
  if (location.pathname === '/signup') return <AuthPage mode="signup" />
  if (location.pathname === '/forgot-password') return <AuthPage mode="forgot" />
  return <Landing onAuth={mode => navigate(mode === 'signup' ? '/signup' : '/login')} />
}

function App() {
  return <BrowserRouter><AuthProvider><CreditsProvider><TeamProvider><ToastHost /><Routes>
    <Route path="/" element={<PublicRoutes />} /><Route path="/login" element={<PublicRoutes />} /><Route path="/signup" element={<PublicRoutes />} /><Route path="/forgot-password" element={<PublicRoutes />} />
    <Route path="/app" element={<WorkspaceLayout />}><Route index element={<DashboardRoute />} /><Route path="dashboard" element={<DashboardRoute />} /><Route path="courses" element={<CoursesRoute />} /><Route path="courses/add" element={<AddCourse />} /><Route path="courses/:courseId" element={<CourseOverviewRoute />} /><Route path="courses/:courseId/lesson/:videoId" element={<CoursePlayerRoute />} /><Route path="teams" element={<Teams />} /><Route path="chat" element={<Chat />} /><Route path="leaderboard" element={<Leaderboard />} /><Route path="profile" element={<Profile />} /><Route path="credits" element={<Credits />} /><Route path="tests/:testId" element={<TestRoute />} /><Route path="admin" element={<Admin />} /></Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></TeamProvider></CreditsProvider></AuthProvider></BrowserRouter>
}

export default App
