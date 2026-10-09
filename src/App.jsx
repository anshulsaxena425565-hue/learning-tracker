import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, BookOpen, ChartLineUp, EnvelopeSimple, Eye, EyeSlash, LockKey, Sparkle, UserCirclePlus, UsersThree, CheckCircle, GoogleLogo } from '@phosphor-icons/react'
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
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const { resetPassword, signUp, signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    setSignup(mode === 'signup')
    setForgot(mode === 'forgot')
    setError('')
    setMessage('')
    setShowPassword(false)
  }, [mode])

  async function googleLogin() {
    setBusy(true); setError(''); setMessage('')
    try {
      await signInWithGoogle()
    } catch (e) {
      setBusy(false)
      setError(e.message)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      if (forgot) {
        await resetPassword(email)
        setMessage('Reset link sent — check your inbox.')
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

  return (
    <main className="auth2-shell">
      <section className="auth2-hero">
        <div className="auth2-glow auth2-glow-a" />
        <div className="auth2-glow auth2-glow-b" />
        <div className="auth2-grid" />

        <button className="auth2-brand" onClick={() => navigate('/')} type="button">
          <span className="auth2-brand-mark">L</span>
          <span>Learning<b>Beyond</b></span>
        </button>

        <div className="auth2-hero-copy">
          <div className="auth2-eyebrow"><Sparkle weight="fill" /> LEARN · PLAN · GROW</div>
          <h2>Turn learning<br />into <span>progress.</span></h2>
          <p>One space for courses, teams and momentum.</p>

          <div className="auth2-feature-row">
            <div className="auth2-feature-card">
              <span><BookOpen weight="duotone" /></span>
              <b>Learn</b><small>your way</small>
            </div>
            <div className="auth2-feature-card">
              <span><UsersThree weight="duotone" /></span>
              <b>Learn</b><small>together</small>
            </div>
            <div className="auth2-feature-card">
              <span><ChartLineUp weight="duotone" /></span>
              <b>Track</b><small>progress</small>
            </div>
          </div>
        </div>

        <div className="auth2-visual" aria-hidden="true">
          <div className="auth2-float-card auth2-course-card">
            <span className="auth2-mini-icon"><BookOpen weight="duotone" /></span>
            <div><b>My Courses</b><small>3 / 5 complete</small></div>
            <i><span /></i>
          </div>
          <div className="auth2-float-card auth2-team-card">
            <span className="auth2-mini-icon"><UsersThree weight="duotone" /></span>
            <div><b>Team Study</b><small>+ 4 learners</small></div>
            <div className="auth2-avatars"><i>J</i><i>A</i><i>R</i><em>+2</em></div>
          </div>
          <div className="auth2-device">
            <div className="auth2-device-top"><span /><span /><span /></div>
            <div className="auth2-device-screen">
              <div className="auth2-screen-title">Today's goal <b>72%</b></div>
              <div className="auth2-progress"><i /></div>
              <div className="auth2-screen-grid"><span /><span /><span /></div>
            </div>
          </div>
          <div className="auth2-float-card auth2-goal-card">
            <span className="auth2-ring">✓</span>
            <div><b>Level up</b><small>+120 XP</small></div>
          </div>
        </div>

        <div className="auth2-hero-footer"><span><i /> Built for curious minds</span><span>LearningBeyond · 2026</span></div>
      </section>

      <section className="auth2-panel">
        <div className="auth2-panel-orb auth2-panel-orb-a" />
        <div className="auth2-panel-orb auth2-panel-orb-b" />

        <div className="auth2-form-wrap">
          <button className="auth2-back" onClick={() => navigate('/')} type="button"><ArrowRight weight="bold" /> Back to LearningBeyond</button>

          <div className="auth2-heading">
            <div className="auth2-welcome">{forgot ? 'PASSWORD RESET' : signup ? 'WELCOME, BUILDER' : 'WELCOME BACK'} <i /></div>
            <h1>{forgot ? 'Reset your password' : <>Welcome back <span>👋</span></>}</h1>
            <p>{forgot ? 'Enter your email and we’ll send a secure reset link.' : 'Continue your learning journey.'}</p>
          </div>

          {!forgot && (
            <div className="auth2-tabs">
              <button className={!signup ? 'active' : ''} type="button" onClick={() => { if (signup) navigate('/login') }}><ArrowRight weight="bold" /> Sign in</button>
              <button className={signup ? 'active' : ''} type="button" onClick={() => { if (!signup) navigate('/signup') }}><UserCirclePlus weight="bold" /> Create account</button>
            </div>
          )}

          <div className="auth2-oauth">
            <div className="auth2-divider"><span>or continue with</span></div>
            <button className="auth2-google" type="button" onClick={googleLogin} disabled={busy}>
              <span className="auth2-google-mark" aria-hidden="true"><GoogleLogo weight="bold" /></span>
              <span className="auth2-google-label">{busy ? 'Connecting to Google…' : 'Continue with Google'}</span>
              <ArrowRight className="auth2-google-arrow" weight="bold" aria-hidden="true" />
            </button>
          </div>

          <form className="auth2-form" onSubmit={submit}>
            {signup && !forgot && (
              <label>
                <span>Name</span>
                <div className="auth2-input">
                  <UserCirclePlus weight="duotone" />
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoComplete="name" required />
                </div>
              </label>
            )}

            <label>
              <span>Email address</span>
              <div className="auth2-input">
                <EnvelopeSimple weight="duotone" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </div>
            </label>

            {!forgot && (
              <label>
                <div className="auth2-label-row">
                  <span>Password</span>
                  {!signup && <button type="button" onClick={() => navigate('/forgot-password')}>Forgot password?</button>}
                </div>
                <div className="auth2-input">
                  <LockKey weight="duotone" />
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" minLength="6" autoComplete={signup ? 'new-password' : 'current-password'} required />
                  <button className="auth2-eye" type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeSlash weight="duotone" /> : <Eye weight="duotone" />}
                  </button>
                </div>
              </label>
            )}

            <button className="auth2-submit" disabled={busy} type="submit">
              <span>{busy ? 'Please wait…' : forgot ? 'Send reset link' : signup ? 'Create account' : 'Sign in'}</span>
              {!busy && <ArrowRight weight="bold" />}
            </button>
          </form>

          {message && <div className="auth2-feedback success"><CheckCircle weight="fill" /><span>{message}</span></div>}
          {error && <div className="auth2-feedback error"><span>!</span><span>{error}</span></div>}

          {!forgot ? (
            <div className="auth2-switch">
              <span>{signup ? 'Already have an account?' : 'New to LearningBeyond?'}</span>
              <button onClick={switchMode}>{signup ? 'Sign in' : 'Create account'} <ArrowUpRight weight="bold" /></button>
            </div>
          ) : (
            <div className="auth2-switch"><button onClick={() => navigate('/login')}><ArrowRight weight="bold" /> Back to sign in</button></div>
          )}

          <p className="auth2-privacy">Secure sign-in · Your learning stays yours.</p>
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
