import{useEffect,useState}from'react';
import{useAuth}from'../../context/AuthContext';
import{useTeam}from'../../context/TeamContext';
import{supabase}from'../../lib/supabase';

const items=[
 ['dashboard','Dashboard','grid'],['courses','Courses','book'],['teams','Teams','users'],['leaderboard','Leaderboard','trend'],['profile','Profile','user']
];

function Icon({name,size=18}){
 const p={
  grid:<><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
  book:<><rect x="6" y="4" width="13" height="16" rx="2"/><path d="M6 7H4v13h11"/><path d="M10 8h5"/></>,
  users:<><circle cx="9" cy="9" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 6"/><path d="M17 14.5a5 5 0 0 1 4 5.5"/></>,
  trend:<><path d="M4 17l6-6 4 4 6-8"/><path d="M15 7h5v5"/></>,
  user:<><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></>,
  plus:<><path d="M12 5v14M5 12h14"/></>
 }[name];
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>
}

export default function AppShell({children,view,setView}){
 const{user}=useAuth(),{team,teams,switchTeam}=useTeam();const[profileName,setProfileName]=useState('');
 const[collapsed,setCollapsed]=useState(()=>localStorage.getItem('lb-sidebar-collapsed')==='1');
 const[open,setOpen]=useState(false);useEffect(()=>{if(!user){setProfileName('');return}supabase.from('profiles').select('display_name').eq('id',user.id).maybeSingle().then(({data})=>setProfileName(data?.display_name||''))},[user]);
 const isAdmin=['owner','admin'].includes(team?.role);
 function toggle(){setCollapsed(v=>{localStorage.setItem('lb-sidebar-collapsed',String(!v));return!v})}
 function nav(id){setView(id);setOpen(false)}
 return <div className={'app '+(collapsed?'sidebar-collapsed':'')}>
  <aside className="sidebar">
   <div className="sidebar-brand">
    <div className="brand"><span className="brand-full">Learning<span>Beyond</span></span><span className="brand-mark">LB</span></div>
   </div>
   <button className="collapse-btn" onClick={toggle} title={collapsed?'Expand sidebar':'Collapse sidebar'} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'}>{collapsed?'›':'‹'}</button>
   <div className="workspace-picker">
    <div className="workspace-avatar">{(team?.name||'T').slice(0,1).toUpperCase()}</div>
    {!collapsed&&<select aria-label="Switch team" value={team?.id||''} onChange={e=>switchTeam(e.target.value)}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>}
   </div>
   <nav className="nav">
    {items.map(([id,label,icon])=><button title={collapsed?label:undefined} className={view===id?'active':''} onClick={()=>nav(id)} key={id}><span className="nav-icon"><Icon name={icon}/></span><span className="nav-label">{label}</span></button>)}
    {isAdmin&&<button title={collapsed?'Add course':undefined} className={view==='add'?'active':''} onClick={()=>nav('add')}><span className="nav-icon"><Icon name="plus"/></span><span className="nav-label">Add course</span></button>}
   </nav>
   <div className="sidebar-bottom">
    <button className="profile-mini" onClick={()=>nav('profile')} title={collapsed?(profileName||user?.user_metadata?.full_name||'Learner'):undefined}><span className="avatar-dot">{(user?.email||'L')[0].toUpperCase()}</span><span className="profile-email">{profileName||user?.user_metadata?.full_name||'Learner'}</span></button>
    <button className="signout" onClick={()=>supabase.auth.signOut()}><span className="signout-icon">↗</span><span>Sign out</span></button>
   </div>
  </aside>
  <header className="mobile-head"><div className="brand">Learning<span>Beyond</span></div><button onClick={()=>setOpen(!open)} aria-label="Open navigation">☰</button></header>
  {open&&<div className="mobile-nav">{items.map(([id,label,icon])=><button onClick={()=>nav(id)} key={id}><Icon name={icon}/>{label}</button>)}{isAdmin&&<button onClick={()=>nav('add')}><Icon name="plus"/>Add course</button>}</div>}
  <main className="content">{children}</main>
 </div>
}