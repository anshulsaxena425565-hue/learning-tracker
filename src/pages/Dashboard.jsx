import{useMemo}from'react';import{ArrowRight,CaretRight,CheckCircle,Fire,Lightning,BookOpenText,ChartLineUp,PlayCircle,Sparkle,Trophy,Target,TrendUp}from'@phosphor-icons/react';import{useTeam}from'../context/TeamContext';
export default function Dashboard({openCourse}){
 const{courses,videos,progress,team}=useTeam();
 const stats=useMemo(()=>{const all=Object.values(videos).flat(),done=all.filter(v=>progress[v.id]?.completed_at).length,p=Math.round(done/(all.length||1)*100),activeList=all.filter(v=>progress[v.id]?.watched_seconds>0&&!progress[v.id]?.completed_at).sort((a,b)=>new Date(progress[b.id]?.updated_at||0)-new Date(progress[a.id]?.updated_at||0)),next=activeList[0]||all.find(v=>!progress[v.id]?.completed_at);return{all,done,p,next,active:activeList.length}},[videos,progress]);
 const milestones=[{label:'First step',target:1,copy:'Complete your first lesson',icon:<Sparkle/>},{label:'Quarter way',target:Math.max(1,Math.ceil(stats.all.length*.25)),copy:'Reach 25% overall progress',icon:<Target/>},{label:'Halfway',target:Math.max(1,Math.ceil(stats.all.length*.5)),copy:'Reach 50% overall progress',icon:<Fire/>},{label:'Finish line',target:Math.max(1,stats.all.length),copy:'Complete the whole library',icon:<Trophy/>}];
 function continueCourse(){if(!stats.next)return;const c=courses.find(c=>(videos[c.id]||[]).some(v=>v.id===stats.next.id));if(c)openCourse(c.id)}
 const nextCourse=stats.next?courses.find(c=>(videos[c.id]||[]).some(v=>v.id===stats.next.id)):null;
 return <div className="page dashboard-page">
  <header className="dashboard-header dashboard-header-punch"><div><p className="eyebrow">LEARNING PULSE</p><h1>Good to see you.</h1><p className="muted">{team?.name||'Your workspace'} <span className="dot-sep">·</span> Keep building momentum.</p></div><span className="momentum-chip"><span className="live-dot"/>{stats.active} {stats.active===1?'lesson':'lessons'} in progress</span></header>

  <section className="dashboard-hero dashboard-hero-punch">
   <div className="dashboard-glow glow-one"/><div className="dashboard-glow glow-two"/><div className="hero-grid-pattern"/>
   <div className="dashboard-hero-main">
    <div className="hero-kicker-punch"><span><Lightning weight="fill"/> YOUR MOMENTUM</span><b>{stats.p}%</b></div>
    <h2>{stats.p===0?'Ready to start?':stats.p<50?'You’re building momentum.':'You’re on a roll.'}</h2>
    <p>{stats.done} of {stats.all.length} lessons completed across your team library.</p>
    <div className="hero-actions"><button onClick={continueCourse} disabled={!stats.next}>{stats.next?'Continue learning':'Library complete'} <ArrowRight weight="bold"/></button><span><TrendUp weight="bold"/> Every lesson counts.</span></div>
   </div>
   <div className="hero-visual">
    <div className="hero-orbit-ring" style={{'--hero-pct':stats.p+'%'}}><div className="hero-orbit-core"><strong>{stats.p}%</strong><span>COMPLETE</span></div></div>
    <div className="hero-float-chip chip-a"><CheckCircle weight="fill"/><span>{stats.done} done</span></div>
    <div className="hero-float-chip chip-b"><Fire weight="fill"/><span>Keep going</span></div>
   </div>
  </section>

  <section className="dashboard-focus-grid">
   <article className="focus-card focus-next" onClick={continueCourse}>
    <div className="focus-art"><PlayCircle weight="fill"/></div>
    <div className="focus-copy"><span className="focus-kicker">PICK UP WHERE YOU LEFT OFF</span><h3>{stats.next?.title||'Your learning library is complete'}</h3><p>{nextCourse?.title||'Explore your courses and keep learning.'}</p>{stats.next&&<div className="focus-progress"><i style={{width:Math.min(100,Math.round((progress[stats.next.id]?.watched_seconds||0)/Math.max(progress[stats.next.id]?.duration_seconds||1,1)*100))+'%'}}/></div>}</div>
    <ArrowRight className="focus-arrow" weight="bold"/>
   </article>
   <article className="focus-card focus-stats"><div className="focus-stat-icon"><ChartLineUp weight="fill"/></div><div><span className="focus-kicker">YOUR LIBRARY</span><strong>{courses.length}</strong><p>courses ready to explore</p></div><div className="focus-mini-ring" style={{'--p':stats.p}}><span>{stats.p}%</span></div></article>
  </section>

  <section className="kpi-grid modern-kpis dashboard-punch-kpis">
   <div className="kpi-card modern-kpi"><span className="kpi-icon"><TrendUp weight="bold"/></span><span className="kpi-label">Learning pulse</span><strong>{stats.p}%</strong><small>overall completion</small></div>
   <div className="kpi-card modern-kpi"><span className="kpi-icon green"><CheckCircle weight="fill"/></span><span className="kpi-label">Completed</span><strong>{stats.done}</strong><small>lessons completed</small></div>
   <div className="kpi-card modern-kpi"><span className="kpi-icon orange"><Fire weight="fill"/></span><span className="kpi-label">In progress</span><strong>{stats.active}</strong><small>lessons underway</small></div>
   <div className="kpi-card modern-kpi"><span className="kpi-icon purple"><BookOpenText weight="fill"/></span><span className="kpi-label">Your library</span><strong>{courses.length}</strong><small>courses available</small></div>
  </section>

  <section className="milestones-section dashboard-milestones-v2">
   <div className="milestone-journey-head">
    <div><p className="eyebrow">YOUR LEARNING JOURNEY</p><h2>Milestones that keep you moving.</h2><p className="muted">Every checkpoint unlocks a new reason to keep going.</p></div>
    <div className="milestone-total"><Trophy weight="fill"/><div><b>{stats.done}/{stats.all.length}</b><span>lessons complete</span></div></div>
   </div>
   <div className="milestone-journey">
    {milestones.map((m,i)=>{const value=Math.min(stats.done,m.target),pct=Math.round(value/m.target*100),reached=stats.done>=m.target,next=!reached&&milestones.slice(0,i).every(x=>stats.done>=x.target);return <div className={'milestone-step '+(reached?'reached ':'')+(next?'current ':'')} key={m.label}>
      <div className="milestone-connector">{i<milestones.length-1&&<i className={reached?'filled':''}/>}</div>
      <article className="milestone-v2-card">
       <div className="milestone-v2-icon">{reached?<CheckCircle weight="fill"/>:m.icon}</div>
       <div className="milestone-v2-body"><div className="milestone-v2-top"><span>{reached?'UNLOCKED':next?'NEXT MILESTONE':'UPCOMING'}</span><b>{pct}%</b></div><h3>{m.label}</h3><p>{m.copy}</p><div className="milestone-v2-track"><i style={{width:pct+'%'}}/></div><small>{value} / {m.target} lessons</small></div>
       {next&&<div className="milestone-next-glow"/>}
      </article>
     </div>})}
   </div>
  </section>}