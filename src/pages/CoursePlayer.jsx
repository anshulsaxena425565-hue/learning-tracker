import{useEffect,useRef,useState}from'react';import{useTeam}from'../context/TeamContext';import{useAuth}from'../context/AuthContext';import{supabase}from'../lib/supabase';

function time(s){s=Math.max(0,Math.floor(s||0));return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s%3600/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}

export default function CoursePlayer({courseId,videoId,back}){
 const{user}=useAuth(),{courses,videos,progress,chapters,team}=useTeam();
 const[tab,setTab]=useState('outline'),[notes,setNotes]=useState([]),[transcript,setTranscript]=useState(null),[bookmarks,setBookmarks]=useState([]),[note,setNote]=useState(''),[playing,setPlaying]=useState(false);
 const p=courses.find(x=>x.id===courseId),vs=videos[courseId]||[],v=vs.find(x=>x.id===videoId)||vs[0],ch=chapters[v?.id]||[];
 const[watched,setWatched]=useState(progress[videoId]?.watched_seconds||0),[quizXp,setQuizXp]=useState(0),player=useRef(null),timer=useRef(null),last=useRef(null),watchedRef=useRef(progress[videoId]?.watched_seconds||0);
 useEffect(()=>{const next=progress[videoId]?.watched_seconds||0;watchedRef.current=next;setWatched(next);setTab('outline');setNotes([]);setTranscript(null);setBookmarks([]);setNote('')},[videoId]);
 useEffect(()=>{let alive=true;(async()=>{if(!user)return;const{data:tests}=await supabase.from('test_series').select('id').eq('team_id',team?.id);const chunks=await Promise.all((tests||[]).map(t=>supabase.rpc('get_test_attempt_history',{p_test_id:t.id})));if(alive)setQuizXp(chunks.flatMap(x=>x.data||[]).filter(x=>x.user_id===user.id).reduce((n,x)=>n+Math.round(Number(x.percentage||0)/10),0))})();return()=>{alive=false}},[user?.id,team?.id]);
 useEffect(()=>{if(!v)return;let mounted=true;const load=()=>{if(!mounted)return;player.current=new window.YT.Player('yt-player',{videoId:v.youtube_video_id||undefined,width:'100%',height:'100%',playerVars:{rel:0,modestbranding:1,playsinline:1},events:{onReady:e=>{if(progress[v.id]?.last_position_seconds)e.target.seekTo(progress[v.id].last_position_seconds,true)},onStateChange:e=>{const Y=window.YT;if(e.data===Y.PlayerState.PLAYING){setPlaying(true);last.current=e.target.getCurrentTime();clearInterval(timer.current);timer.current=setInterval(()=>{const now=e.target.getCurrentTime(),delta=now-(last.current??now);if(delta>=0&&delta<=3.5){watchedRef.current+=delta;setWatched(watchedRef.current);save(now,e.target.getDuration())}last.current=now},2000)}else{setPlaying(false);clearInterval(timer.current);if(e.data===Y.PlayerState.ENDED)finish(e.target.getDuration())}}}})};if(window.YT?.Player)load();else{window.onYouTubeIframeAPIReady=load;const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;document.body.appendChild(s)}return()=>{mounted=false;clearInterval(timer.current);try{player.current?.destroy()}catch{}}},[v?.id]);
 useEffect(()=>{if(tab==='notes')loadNotes();if(tab==='transcript')loadTranscript();if(tab==='bookmarks')loadBookmarks()},[tab,v?.id]);
 async function save(pos,dur){if(!user||!v)return;await supabase.from('video_progress').upsert({user_id:user.id,playlist_video_id:v.id,watched_seconds:Math.floor(watchedRef.current),duration_seconds:Math.floor(dur||0),last_position_seconds:Math.floor(pos)},{onConflict:'user_id,playlist_video_id'})}
 async function finish(dur){await supabase.from('video_progress').upsert({user_id:user.id,playlist_video_id:v.id,watched_seconds:Math.floor(Math.max(watchedRef.current,dur)),duration_seconds:Math.floor(dur||0),last_position_seconds:0,completed_at:new Date().toISOString()},{onConflict:'user_id,playlist_video_id'});watchedRef.current=dur;setWatched(dur)}
 async function loadNotes(){const{data}=await supabase.from('video_notes').select('id,content,user_id,created_at,position_seconds').eq('playlist_video_id',v.id).order('created_at',{ascending:false});setNotes(data||[])}
 async function saveNote(){if(!note.trim())return;await supabase.from('video_notes').insert({playlist_video_id:v.id,user_id:user.id,content:note.trim(),position_seconds:Math.floor(player.current?.getCurrentTime?.()||0)});setNote('');loadNotes()}
 async function loadBookmarks(){const{data}=await supabase.from('video_bookmarks').select('*').eq('playlist_video_id',v.id).eq('user_id',user.id).order('position_seconds');setBookmarks(data||[])}
 async function bookmark(){const pos=Math.floor(player.current?.getCurrentTime?.()||0);if(!pos)return;await supabase.from('video_bookmarks').insert({user_id:user.id,playlist_video_id:v.id,position_seconds:pos,label:'Saved moment'});loadBookmarks()}
 async function loadTranscript(){const{data}=await supabase.from('video_transcripts').select('*').eq('playlist_video_id',v.id).maybeSingle();setTranscript(data||null)}
 async function generate(){setTranscript({status:'processing'});const r=await supabase.functions.invoke('get-youtube-transcript',{body:{playlist_video_id:v.id}});if(r.error)setTranscript({status:'error',error:r.error.message});else setTranscript(r.data)}
 if(!p||!v)return null;
 const duration=Math.max(progress[v.id]?.duration_seconds||0,1),percent=Math.min(100,Math.round((watched/duration)*100)),completed=!!progress[v.id]?.completed_at;
 const completedCount=vs.filter(x=>progress[x.id]?.completed_at).length,totalCount=vs.length,coursePercent=totalCount?Math.round(completedCount/totalCount*100):0,xp=Math.max(0,Math.round(watched/60*8)+completedCount*50),level=Math.max(1,Math.floor(xp/250)+1),nextIndex=Math.min(vs.findIndex(x=>x.id===v.id)+1,totalCount-1);
 return <div className="page learning-player-page">
  <div className="learning-player-topbar"><button className="player-back" onClick={back}>← <span>Back to course</span></button><div className="player-top-progress"><span>COURSE PROGRESS</span><b>{coursePercent}%</b><i><em style={{width:coursePercent+'%'}}/></i></div></div>
  <section className="player-layout">
   <main className="player-card">
    <div className="player-frame-wrap"><div className="player-frame"><div id="yt-player"/></div><div className="player-live-pill"><span/> {playing?'NOW PLAYING':'READY TO LEARN'}</div><div className="player-focus-pill">✦ Focus mode</div></div>
    <div className="watch-track"><i style={{width:percent+'%'}}/></div>
    <div className="player-info">
     <div className="lesson-heading"><div><p className="eyebrow">{p.title}</p><h1>{v.title}</h1><p className="lesson-meta"><span className="meta-progress">{percent}% watched</span><span>•</span><span>{time(watched)} learning time</span>{completed&&<span className="complete-chip">✓ Completed</span>}</p></div><div className="xp-orb" title="Learning XP"><span>✦</span><b>{xp}</b><small>XP</small></div></div>
     <div className="lesson-stats">
      <div><span className="stat-icon">⚡</span><div><b>Level {level}</b><small>Keep the streak alive</small></div></div>
      <div><span className="stat-icon">🎯</span><div><b>{completedCount}/{totalCount}</b><small>Lessons completed</small></div></div>
      <div><span className="stat-icon">🔥</span><div><b>{percent<25?'Warm up':percent<75?'In the zone':'Almost there'}</b><small>Your current momentum</small></div></div>
     </div>
     <div className="player-actions">
      <button className="bookmark-btn" onClick={bookmark}>🔖 <span>Save moment</span></button>
      <div className="course-tabs">{['outline','notes','transcript','bookmarks'].map(x=><button className={tab===x?'active':''} onClick={()=>setTab(x)} key={x}>{x==='outline'?'☰ Outline':x==='notes'?'✎ Notes':x==='transcript'?'▤ Transcript':'🔖 Saved'}</button>)}</div>
     </div>
     <div className="player-panel">{tab==='outline'&&<Outline chapters={ch} player={player}/>}
      {tab==='notes'&&<div className="section player-section"><div className="panel-heading"><div><b>Timestamped notes</b><span>Capture what matters while you learn.</span></div></div><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="What do you want to remember from this moment?"/><button onClick={saveNote}>＋ Post note at current time</button>{notes.map(n=><button className="note-card" key={n.id} onClick={()=>player.current?.seekTo(n.position_seconds||0,true)}><b>{time(n.position_seconds)}</b> · {n.content}</button>)}</div>}
      {tab==='transcript'&&<div className="section player-section">{!transcript&&<><div className="panel-heading"><div><b>Video transcript</b><span>Jump directly to any spoken section.</span></div></div><button onClick={generate}>Generate transcript ✦</button></>}{transcript?.status==='processing'&&<p className="muted">Generating transcript…</p>}{transcript?.status==='error'&&<><p className="error">{transcript.error}</p><button onClick={generate}>Retry</button></>}{transcript?.status==='ready'&&<div className="transcript-list">{(transcript.segments||[]).map((s,i)=><button key={i} onClick={()=>player.current?.seekTo(Number(s.start||0),true)}><span>{time(s.start)}</span>{s.text}</button>)}</div>}</div>}
      {tab==='bookmarks'&&<div className="section player-section"><div className="panel-heading"><div><b>Saved moments</b><span>Your personal highlights from this lesson.</span></div></div>{bookmarks.length?bookmarks.map(b=><button className="note-card" key={b.id} onClick={()=>player.current?.seekTo(b.position_seconds,true)}>🔖 {time(b.position_seconds)} · {b.label||'Saved moment'}</button>):<p className="muted">No bookmarks in this video yet.</p>}</div>}
     </div>
    </div>
   </main>
   <aside className="course-sidebar">
    <div className="sidebar-course-head"><div><p className="eyebrow">YOUR LEARNING QUEST</p><h2>{p.title}</h2><span>{completedCount} of {totalCount} lessons complete</span></div><div className="quest-ring" style={{'--quest-progress':coursePercent+'%'}}><b>{coursePercent}</b><small>%</small></div></div>
    <div className="quest-bar"><i style={{width:coursePercent+'%'}}/></div>
    <div className="up-next-label"><span>LESSONS</span><b>{nextIndex+1} / {totalCount}</b></div>
    <div className="lesson-list">{vs.map((x,i)=>{const done=!!progress[x.id]?.completed_at,isActive=x.id===v.id,wp=Math.min(100,Math.round((progress[x.id]?.watched_seconds||0)/Math.max(progress[x.id]?.duration_seconds||1,1)*100));return <button className={'side-video '+(isActive?'active ':'')+(done?'done':'')} key={x.id} onClick={()=>window.dispatchEvent(new CustomEvent('learning:open-video',{detail:x.id}))}><span className="lesson-number">{done?'✓':i+1}</span><div className="side-video-copy"><b>{x.title}</b><small>{done?'Completed':isActive?'Currently learning':wp?wp+'% watched':'Not started'}</small>{!done&&<i><em style={{width:wp+'%'}}/></i>}</div>{isActive&&<span className="playing-dot"><i/></span>}</button>})}</div>
    <div className="next-lesson-card">{nextIndex<totalCount-1?<><span>UP NEXT</span><b>{vs[nextIndex+1]?.title}</b><small>Continue your quest →</small></>:<><span>QUEST COMPLETE</span><b>You've reached the end of this course.</b><small>🎉 Take a victory lap.</small></>}</div>
   </aside>
  </section>
 </div>
}

function Outline({chapters,player}){return <div className="section player-section"><div className="panel-heading"><div><b>Chapter map</b><span>Jump to exactly what you want to learn.</span></div></div>{chapters.length?chapters.map(x=><button className="chapter-row" key={x.id} onClick={()=>player.current?.seekTo(Number(x.start_seconds),true)}><span>{time(x.start_seconds)}</span><b>{x.title}</b><i>→</i></button>):<p className="muted">No chapters available for this video.</p>}</div>}