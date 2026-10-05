import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const PROFILE_TIMEOUT_MS = 8000

export default function Profile() {
  const { user, dataUser, updateAccount: updateAuthAccount } = useAuth()
  const [p, setP] = useState(null)
  const [form, setForm] = useState({})
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [account, setAccount] = useState({ email: '', password: '', confirm: '' })
  const [accountMsg, setAccountMsg] = useState('')

  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(() => {
      if (!alive) return
      setProfileLoading(false)
      setProfileError('We could not load your profile. Please refresh and try again.')
    }, PROFILE_TIMEOUT_MS)

    async function loadProfile() {
      if (!dataUser?.id) {
        window.clearTimeout(timer)
        if (alive) {
          setProfileLoading(false)
          setProfileError('Your account session is still being prepared. Please refresh once.')
        }
        return
      }

      setProfileLoading(true)
      setProfileError('')

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', dataUser.id)
          .maybeSingle()

        if (error) throw error

        if (!alive) return

        const fallbackName = user?.displayName || user?.email?.split('@')[0] || 'Learner'
        const profile = data || {
          id: dataUser.id,
          display_name: fallbackName,
          learning_goal: '',
          bio: '',
          avatar_url: null,
          theme: 'system',
        }

        setP(profile)
        setForm(profile)
        setAccount(a => ({ ...a, email: user?.email || '' }))
      } catch (error) {
        if (!alive) return
        console.error('Profile load failed:', error)
        const fallbackName = user?.displayName || user?.email?.split('@')[0] || 'Learner'
        const fallback = {
          id: dataUser.id,
          display_name: fallbackName,
          learning_goal: '',
          bio: '',
          avatar_url: null,
          theme: 'system',
        }
        setP(fallback)
        setForm(fallback)
        setAccount(a => ({ ...a, email: user?.email || '' }))
        setProfileError('Your profile could not be synced from the database. You can still view and edit the profile.')
      } finally {
        window.clearTimeout(timer)
        if (alive) setProfileLoading(false)
      }
    }

    loadProfile()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [user, dataUser?.id])

  async function save() {
    const theme = form.theme || 'system'
    document.documentElement.dataset.theme = theme === 'system'
      ? (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light')
      : theme
    localStorage.setItem('lb-theme', theme)

    if (!dataUser?.id) {
      setProfileError('Your account session is unavailable. Please sign in again.')
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: form.display_name,
        learning_goal: form.learning_goal,
        bio: form.bio,
        avatar_url: form.avatar_url || null,
        theme,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dataUser.id)
      .select()
      .single()

    if (error) {
      setProfileError(error.message)
      return
    }

    setP(data)
    setForm(data)
    setProfileError('')
  }

  async function updateAccount() {
    setAccountMsg('')
    if (account.password && account.password !== account.confirm) {
      setAccountMsg('Passwords do not match.')
      return
    }

    const changes = {}
    if (account.email && account.email !== user?.email) changes.email = account.email
    if (account.password) changes.password = account.password

    if (!Object.keys(changes).length) {
      setAccountMsg('No account changes to save.')
      return
    }

    try {
      await updateAuthAccount(changes)
      setAccountMsg(
        changes.email
          ? 'Check your inbox to confirm the new email address. Account password updated.'
          : 'Account password updated.'
      )
      setAccount(a => ({ ...a, password: '', confirm: '' }))
    } catch (error) {
      setAccountMsg(error.message)
    }
  }

  if (profileLoading) {
    return <div className="section">Loading profile…</div>
  }

  const name = form.display_name || user?.displayName || 'Learner'
  const initials = name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase()

  return <div className="page">
    <header>
      <div>
        <p className="eyebrow">PROFILE</p>
        <h1>Your learning identity</h1>
        <p className="muted">Shape how your learning identity appears to teammates.</p>
      </div>
    </header>

    {profileError && <div className="account-message">{profileError}</div>}

    <section className="profile-shell">
      <div className="profile-hero">
        <div className="profile-avatar">{form.avatar_url ? <img src={form.avatar_url} alt="" /> : initials}</div>
        <div className="grow"><h2>{name}</h2><p className="muted">{form.learning_goal || 'Set a learning goal to personalize your profile.'}</p></div>
        <span className="pill">Learner</span>
      </div>

      <div className="profile-body">
        <section>
          <p className="eyebrow">PERSONAL DETAILS</p>
          <div className="profile-field"><label>Display name</label><input value={form.display_name || ''} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Your name" /></div>
          <div className="profile-field"><label>Learning goal</label><input value={form.learning_goal || ''} onChange={e => setForm({ ...form, learning_goal: e.target.value })} placeholder="e.g. Become a Spring Boot developer" /></div>
          <div className="profile-field"><label>About</label><textarea value={form.bio || ''} onChange={e => setForm({ ...form, bio: e.target.value })} placeholder="A short intro for your teammates…" /></div>
        </section>

        <aside className="profile-side">
          <p className="eyebrow">PROFILE APPEARANCE</p>
          <div className="profile-preview">
            <div className="profile-avatar small">{form.avatar_url ? <img src={form.avatar_url} alt="" /> : initials}</div>
            <div className="grow"><b>{name}</b><small>{form.learning_goal || 'Your learning goal'}</small></div>
          </div>
          <label>Profile picture URL<input value={form.avatar_url || ''} onChange={e => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://…" /></label>
          <label>Theme<select value={form.theme || 'system'} onChange={e => setForm({ ...form, theme: e.target.value })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        </aside>
      </div>

      <div className="profile-actions"><button className="ghost" onClick={() => setForm(p || {})}>Cancel</button><button onClick={save}>Save changes</button></div>
    </section>

    <section className="section account-settings">
      <div className="section-head"><div><p className="eyebrow">ACCOUNT & SECURITY</p><h2>Login details</h2><p className="muted">Manage the email address and password used to sign in.</p></div></div>
      <div className="account-grid">
        <label>Email address<input type="email" value={account.email} onChange={e => setAccount({ ...account, email: e.target.value })} /><small>Changing your email may require confirmation from your inbox.</small></label>
        <label>New password<input type="password" value={account.password} onChange={e => setAccount({ ...account, password: e.target.value })} placeholder="Leave blank to keep current password" /></label>
        <label>Confirm new password<input type="password" value={account.confirm} onChange={e => setAccount({ ...account, confirm: e.target.value })} placeholder="Repeat new password" /></label>
      </div>
      {accountMsg && <p className="account-message">{accountMsg}</p>}
      <div className="account-actions"><button onClick={updateAccount}>Update account</button></div>
    </section>
  </div>
}
