import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTeam } from '../../context/TeamContext'
import { supabase } from '../../lib/supabase'
import { useCredits } from '../../context/CreditsContext'
import { Coins, MagnifyingGlass, SquaresFour, BookOpenText, UsersThree, ChatsCircle, TrendUp, UserCircle, ShieldCheck, CaretLeft, CaretRight, Plus, SignOut, List, X } from '@phosphor-icons/react'

const items = [
  ['/app', 'Dashboard', 'grid'], ['/app/courses', 'Courses', 'book'], ['/app/teams', 'Teams', 'users'], ['/app/chat', 'Team Chat', 'chat'],
  ['/app/leaderboard', 'Leaderboard', 'trend'], ['/app/profile', 'Profile', 'user']
]
function Icon({ name, size = 18, weight = 'regular' }) { const icons = { grid: SquaresFour, book: BookOpenText, users: UsersThree, chat: ChatsCircle, trend: TrendUp, user: UserCircle, shield: ShieldCheck, plus: Plus, left: CaretLeft, right: CaretRight, signout: SignOut, list: List, close: X }; const C = icons[name] || SquaresFour; return <C size={size} weight={weight} aria-hidden /> }
function isActive(pathname, target) { return target === '/app' ? pathname === '/app' || pathname === '/app/dashboard' : pathname === target || pathname.startsWith(target + '/') }

export default function AppShell({ children }) {
  const { user, dataUser, logout } = useAuth(); const { team, teams, switchTeam } = useTeam(); const { credits } = useCredits(); const location = useLocation(); const navigate = useNavigate()
  const [profileName, setProfileName] = useState(''); const [collapsed, setCollapsed] = useState(() => localStorage.getItem('lb-sidebar-collapsed') === '1'); const [open, setOpen] = useState(false); const [platformAdmin, setPlatformAdmin] = useState(false)
  useEffect(() => { if (!user || !dataUser?.id) return setProfileName(''); supabase.from('profiles').select('display_name').eq('id', dataUser.id).maybeSingle().then(({ data }) => setProfileName(data?.display_name || '')) }, [user, dataUser?.id])
  useEffect(() => { let alive = true; async function check() { if (!dataUser?.id) return setPlatformAdmin(false); const rpc = await supabase.rpc('is_platform_admin'); if (alive && rpc.data === true) return setPlatformAdmin(true); const direct = await supabase.from('platform_admins').select('user_id').eq('user_id', dataUser.id).maybeSingle(); if (alive) setPlatformAdmin(!direct.error && !!direct.data) } check(); return () => { alive = false } }, [dataUser?.id])
  const toggle = () => setCollapsed(value => { localStorage.setItem('lb-sidebar-collapsed', String(!value)); return !value })
  const go = path => { setOpen(false); navigate(path) }
  return <div className={'app ' + (collapsed ? 'sidebar-collapsed' : '')}>
    <aside className="sidebar"><div className="sidebar-brand"><div className="brand"><span className="brand-full">Learning<span>Beyond</span></span><span className="brand-mark">LB</span></div><div className="brand-subtitle">LEARNING WORKSPACE</div></div>
      <button className="collapse-btn" onClick={toggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <Icon name="right" size={17} /> : <Icon name="left" size={17} />}</button>
      <div className="workspace-picker"><div className="workspace-avatar">{(team?.name || 'T').slice(0, 1).toUpperCase()}</div>{!collapsed && <select aria-label="Switch team" value={team?.id || ''} onChange={e => switchTeam(e.target.value)}>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</div>
      <nav className="nav"><div className="nav-section-label">MAIN</div><div className="nav-group">{items.slice(0, 4).map(([path, label, icon]) => <NavLink to={path} title={collapsed ? label : undefined} className={() => isActive(location.pathname, path) ? 'active' : ''} key={path} onClick={() => setOpen(false)}><span className="nav-icon"><Icon name={icon} /></span><span className="nav-label">{label}</span>{isActive(location.pathname, path) && <span className="nav-active-dot" />}</NavLink>)}</div>
        <div className="nav-section-label secondary">YOUR PROGRESS</div><div className="nav-group">{items.slice(4).map(([path, label, icon]) => <NavLink to={path} title={collapsed ? label : undefined} className={() => isActive(location.pathname, path) ? 'active' : ''} key={path} onClick={() => setOpen(false)}><span className="nav-icon"><Icon name={icon} /></span><span className="nav-label">{label}</span>{isActive(location.pathname, path) && <span className="nav-active-dot" />}</NavLink>)}</div>
        {platformAdmin && <><div className="nav-section-label admin-label">{!collapsed && 'MANAGE'}</div><div className="nav-group"><NavLink to="/app/admin" title={collapsed ? 'Admin' : undefined} className={isActive(location.pathname, '/app/admin') ? 'active' : ''}><span className="nav-icon"><Icon name="shield" /></span><span className="nav-label">Admin</span></NavLink></div></>}
      </nav>
      <div className="sidebar-bottom"><button className="profile-mini" onClick={() => go('/app/profile')} title={collapsed ? (profileName || user?.user_metadata?.full_name || 'Learner') : undefined}><span className="avatar-dot">{(user?.email || 'L')[0].toUpperCase()}</span><span className="profile-email">{profileName || user?.user_metadata?.full_name || 'Learner'}</span></button><button className="signout" onClick={logout}><span className="signout-icon"><Icon name="signout" size={17} /></span><span>Sign out</span></button></div>
    </aside>
    {open && <div className="mobile-nav">{items.map(([path, label, icon]) => <NavLink to={path} onClick={() => setOpen(false)} key={path}><Icon name={icon} />{label}</NavLink>)}{platformAdmin && <NavLink to="/app/admin" onClick={() => setOpen(false)}><Icon name="shield" />Admin</NavLink>}</div>}
    <header className="global-topbar"><button className="mobile-menu-btn" onClick={() => setOpen(value => !value)} aria-label={open ? 'Close navigation' : 'Open navigation'}><Icon name={open ? 'close' : 'list'} size={21} /></button><div className="global-search"><MagnifyingGlass size={18} /><input placeholder="Search LearningBeyond…" /></div><div className="global-topbar-actions"><button className="credit-wallet" onClick={() => go('/app/credits')}><Coins size={18} weight="fill" /><span><small>CREDITS</small><b>{credits.toLocaleString()}</b></span></button><button className="add-credit-btn" onClick={() => go('/app/credits')}><Plus size={16} weight="bold" /> Add Credits</button></div></header>
    <main className="content">{children}</main>
  </div>
}
