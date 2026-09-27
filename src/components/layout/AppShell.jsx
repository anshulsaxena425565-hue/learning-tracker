import{useEffect,useState}from'react';
import{useAuth}from'../../context/AuthContext';
import{useTeam}from'../../context/TeamContext';
import{supabase}from'../../lib/supabase';import{useCredits}from'../../context/CreditsContext';
import{Coins, MagnifyingGlass, SquaresFour,BookOpenText,UsersThree,ChatsCircle,TrendUp,UserCircle,ShieldCheck,CaretLeft,CaretRight,Plus,SignOut,List, X}from'@phosphor-icons/react';

const items=[
 ['dashboard','Dashboard','grid'],['courses','Courses','book'],['teams','Teams','users'],['chat','Team Chat','chat'],['leaderboard','Leaderboard','trend'],['profile','Profile','user']
];

function Icon({name,size=18,weight="regular"}){const icons={grid:SquaresFour,book:BookOpenText,users:UsersThree,chat:ChatsCircle,trend:TrendUp,user:UserCircle,shield:ShieldCheck,plus:Plus,left:CaretLeft,right:CaretRight,signout:SignOut,list:List,close:X};const C=icons[name]||SquaresFour;return <C size={size} weight={weight} aria-hidden/>}

export default function AppShell({children,view,setView,locked=false}){
 const{user}=useAuth(),{team,teams,switchTeam}=useTeam(),{credits}=useCredits();const[profileName,setProfileName]=useState('');
 const[collapsed,setCollapsed]=useState(()=>localStorage.getItem('lb-sidebar-collapsed')==='1');
 const[open,setOpen]=useState(false);useEffect(()=>{if(!user){setProfileName('');return}supabase.from('profiles').select('display_name').eq('id',user.id).maybeSingle().then(({data})=>setProfileName(data?.display_name||''))},[user]);
 const isAdmin=['owner','admin'].includes(team?.role);const[platformAdmin,setPlatformAdmin]=useState(false);useEffect(()=>{let alive=true;async function check(){if(!user){setPlatformAdmin(false);return}const rpc=await supabase.rpc('is_platform_admin');if(alive&&rpc.data===true){setPlatformAdmin(true);return}const direct=await supabase.from('platform_admins').select('user_id').eq('user_id',user.id).maybeSingle();if(alive)setPlatformAdmin(!direct.error&&!!direct.data)}check();return()=>{alive=false}},[user?.id]);
 function toggle(){setCollapsed(v=>{localStorage.setItem('lb-sidebar-collapsed',String(!v));return!v})}
 function nav(id){if(locked)return;setView(id);setOpen(false)}
 return <div className={'app '+(collapsed?'sidebar-collapsed':'')}>
  <aside className={'sidebar '+(locked?'test-nav-locked':'')}>
   <div className="sidebar-brand">
    <div className="brand"><span className="brand-full">Learning<span>Beyond</span></span><span className="brand-mark">LB</span></div>
    <div className="brand-subtitle">LEARNING WORKSPACE</div>
   </div>
   <button className="collapse-btn" disabled={locked} onClick={toggle} title={collapsed?'Expand sidebar':'Collapse sidebar'} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'}>{collapsed?<Icon name="right" size={17}/>:<Icon name="left" size={17}/>}</button>
   <div className={'workspace-picker '+(locked?'disabled':'')}>
    <div className="workspace-avatar">{(team?.name||'T').slice(0,1).toUpperCase()}</div>
    {!collapsed&&<select aria-label="Switch team" value={team?.id||''} disabled={locked} onChange={e=>switchTeam(e.target.value)}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>}
   </div>
   <nav className="nav">
    {!collapsed&&<div className="nav-section-label">MAIN</div>}
    <div className="nav-group">
      {items.slice(0,4).map(([id,label,icon])=><button title={collapsed?label:undefined} className={view===id?'active':''} onClick={()=>nav(id)} key={id}><span className="nav-icon"><Icon name={icon}/></span><span className="nav-label">{label}</span>{view===id&&<span className="nav-active-dot"/>}</button>)}
    </div>
    {!collapsed&&<div className="nav-section-label secondary">YOUR PROGRESS</div>}
    <div className="nav-group">
      {items.slice(4).map(([id,label,icon])=><button title={collapsed?label:undefined} className={view===id?'active':''} onClick={()=>nav(id)} key={id}><span className="nav-icon"><Icon name={icon}/></span><span className="nav-label">{label}</span>{view===id&&<span className="nav-active-dot"/>}</button>)}
    </div>
    {platformAdmin&&<><div className="nav-section-label admin-label">{!collapsed&&'MANAGE'}</div><div className="nav-group"><button title={collapsed?'Admin':undefined} className={view==='admin'?'active':''} onClick={()=>nav('admin')}><span className="nav-icon"><Icon name="shield"/></span><span className="nav-label">Admin</span>{view==='admin'&&<span className="nav-active-dot"/>}</button></div></>}
   </nav>
   <div className="sidebar-bottom">
    <button className="profile-mini" onClick={()=>nav('profile')} title={collapsed?(profileName||user?.user_metadata?.full_name||'Learner'):undefined}><span className="avatar-dot">{(user?.email||'L')[0].toUpperCase()}</span><span className="profile-email">{profileName||user?.user_metadata?.full_name||'Learner'}</span></button>
    <button className="signout" disabled={locked} onClick={()=>supabase.auth.signOut()}><span className="signout-icon"><Icon name="signout" size={17}/></span><span>Sign out</span></button>
   </div>
  </aside>
  <header className="mobile-head"><div className="brand">Learning<span>Beyond</span></div><button onClick={()=>setOpen(!open)} aria-label={open?"Close navigation":"Open navigation"}><Icon name={open?"close":"list"} size={22}/></button></header>
  {open&&<div className="mobile-nav">{items.map(([id,label,icon])=><button onClick={()=>nav(id)} key={id}><Icon name={icon}/>{label}</button>)}{platformAdmin&&<button onClick={()=>nav('admin')}><Icon name="shield"/>Admin</button>}</div>}
  <main className="content"><div className="global-topbar"><div className="global-search"><MagnifyingGlass size={18}/><input placeholder="Search LearningBeyond…"/></div><div className="global-topbar-actions"><button className="credit-wallet" onClick={()=>nav("credits")}><Coins size={18} weight="fill"/><span><small>CREDITS</small><b>{credits.toLocaleString()}</b></span></button><button className="add-credit-btn" onClick={()=>nav("credits")}><Plus size={16} weight="bold"/> Add Credits</button></div></div>{children}</main>
 </div>
}