import{useEffect,useRef,useState}from'react';import { useTeam } from '../context/TeamContext'
import { useAuth } from '../context/AuthContext'
import{useCredits}from'../context/CreditsContext';import { supabase } from '../lib/supabase'
import{totalVideoProgressXp,XP_PER_MINUTE,COMPLETION_XP}from'../lib/xp';

let ytApiPromise=null;function ensureYouTubeApi(){if(window.YT?.Player)return Promise.resolve(window.YT);if(ytApiPromise)return ytApiPromise;ytApiPromise=new Promise(resolve=>{const previous=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{previous?.();resolve(window.YT)};if(!document.querySelector('script[data-learning-youtube-api]')){const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;s.dataset.learningYoutubeApi='1';document.body.appendChild(s)}});return ytApiPromise}function youtubeId(value){const s=String(value||'').trim();if(!s)return '';const m=s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([^?&/]+)/i);return m?.[1]||s}function time(s){s=Math.max(0,Math.floor(s||0));return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s%3600/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}

export default function CoursePlayer({courseId,videoId,onOpenVideo,back}){
 const{user,dataUser}=useAuth(),{cost,charge}=useCredits(),{courses,videos,progress,chapters,team}=useTeam();
 const[tab,setTab]=useState('outline'),[notes,setNotes]=useState([]),[transcript,setTranscript]=useState(null),[bookmarks,setBookmarks]=useState([]),[note,setNote]=useState(''),[playing,setPlaying]=useState(false),[globalXp,setGlobalXp]=useState(0),[aiContent,setAiContent]=useState(null),[aiLoading,setAiLoading]=useState(''),[aiError,setAiError]=useState(''),[quizAnswers,setQuizAnswers]=useState({});
 const p=courses.find(x=>x.id===courseId),vs=videos[courseId]||[],v=vs.find(x=>x.id===videoId)||vs[0],ch=chapters[v?.id]||[];
 const playerHost=useRef(null),[watched,setWatched]=useState(progress[videoId]?.watched_seconds||0),[quizXp,setQuizXp]=useState(0),player=useRef(null),timer=useRef(null),last=useRef(null),lastWall=useRef(null),watchedRef=useRef(progress[videoId]?.watched_seconds||0),xpWatchedRef=useRef(progress[videoId]?.watched_seconds||0);
 useEffect(()=>{const next=progress[videoId]?.watched_seconds||0;watchedRef.current=next;xpWatchedRef.current=next;setWatched(next);setTab('outline');setNotes([]);setTranscript(null);setBookmarks([]);setNote('');setAiContent(null);setAiLoading('');setAiError('');setQuizAnswers({})},[videoId]);
 useEffect(()=>{let alive=true;(async()=>{if(!user)return;const[{data:pr},{data:tests}]=await Promise.all([supabase.from('video_progress').select('watched_seconds,completed_at').eq('user_id',dataUser?.id),supabase.from('test_series').select('id').eq('team_id',team?.id)]);const chunks=await Promise.all((tests||[]).map(t=>supabase.rpc('get_test_attempt_history',{p_test_id:t.id})));const qxp=chunks.flatMap(x=>x.data||[]).filter(x=>x.user_id===dataUser?.id).reduce((n,x)=>n+Math.round(Number(x.percentage||0)/10),0);const learning=totalVideoProgressXp(pr||[]);if(alive)setGlobalXp(learning+qxp)})();return()=>{alive=false}},[user?.id,dataUser?.id,team?.id]);
 useEffect(()=>{if(!v)return;let mounted=true;const id=youtubeId(v.youtube_video_id||v.video_url||v.url);if(!id)return;ensureYouTubeApi().then(YT=>{if(!mounted||!playerHost.current)return;const startTimer=()=>{clearInterval(timer.current);timer.current=setInterval(()=>{const p=player.current;if(!p||!window.YT)return;try{const state=p.getPlayerState(),now=Number(p.getCurrentTime())||0,dur=Number(p.getDuration())||0;if(state===window.YT.PlayerState.PLAYING){const delta=Math.max(0,now-(last.current??now));if(delta>0&&delta<15){const before=watchedRef.current;watchedRef.current+=delta;setWatched(watchedRef.current);const beforeXp=Math.round(before/60*XP_PER_MINUTE),afterXp=Math.round(watchedRef.current/60*XP_PER_MINUTE);if(afterXp!==beforeXp)setGlobalXp(x=>x+(afterXp-beforeXp));save(now,dur)}last.current=now}else if(state===window.YT.PlayerState.PAUSED){save(now,dur)}}catch(e){console.error('Progress tracker error:',e)}},2000)};player.current=new YT.Player(playerHost.current,{videoId:id,width:'100%',height:'100%',playerVars:{rel:0,modestbranding:1,playsinline:1},events:{onReady:e=>{if(progress[v.id]?.last_position_seconds)e.target.seekTo(progress[v.id].last_position_seconds,true);last.current=e.target.getCurrentTime();startTimer()},onStateChange:e=>{if(e.data===YT.PlayerState.PLAYING){setPlaying(true);last.current=e.target.getCurrentTime()}else{setPlaying(false);if(e.data===YT.PlayerState.PAUSED)save(e.target.getCurrentTime(),e.target.getDuration());if(e.data===YT.PlayerState.ENDED)finish(e.target.getDuration())}}}})}).catch(e=>console.error('YouTube player failed:',e));return()=>{mounted=false;clearInterval(timer.current);try{player.current?.destroy()}catch{}}},[v?.id]);
 useEffect(()=>{if(tab==='notes')loadNotes();if(tab==='transcript')loadTranscript();if(tab==='bookmarks')loadBookmarks();if(tab==='ai'){loadTranscript();loadAiContent()}},[tab,v?.id]);
 async function save(pos,dur){if(!user||!dataUser||!v)return;const payload={p_playlist_video_id:v.id,p_watched_seconds:Math.floor(watchedRef.current),p_duration_seconds:Math.floor(dur||0),p_last_position_seconds:Math.floor(pos),p_completed_at:null};const{error}=await supabase.rpc('save_video_progress',payload);if(error)console.error('Unable to save learning progress:',error)}
 async function finish(dur){const{error}=await supabase.rpc('save_video_progress',{p_playlist_video_id:v.id,p_watched_seconds:Math.floor(Math.max(watchedRef.current,dur)),p_duration_seconds:Math.floor(dur||0),p_last_position_seconds:0,p_completed_at:new Date().toISOString()});if(error)console.error('Unable to save completed lesson:',error);const before=watchedRef.current;watchedRef.current=dur;setWatched(dur);const timeXp=Math.round(dur/60*XP_PER_MINUTE)-Math.round(before/60*XP_PER_MINUTE);if(timeXp>0)setGlobalXp(x=>x+timeXp);if(!completed)setGlobalXp(x=>x+COMPLETION_XP)}
 async function loadNotes(){const{data}=await supabase.from('video_notes').select('id,content,user_id,created_at,position_seconds').eq('playlist_video_id',v.id).order('created_at',{ascending:false});setNotes(data||[])}
 async function saveNote(){if(!note.trim())return;await supabase.from('video_notes').insert({playlist_video_id:v.id,user_id:dataUser?.id,content:note.trim(),position_seconds:Math.floor(player.current?.getCurrentTime?.()||0)});setNote('');loadNotes()}
 async function loadBookmarks(){const{data}=await supabase.from('video_bookmarks').select('*').eq('playlist_video_id',v.id).eq('user_id',dataUser?.id).order('position_seconds');setBookmarks(data||[])}
 async function bookmark(){const pos=Math.floor(player.current?.getCurrentTime?.()||0);if(!pos)return;await supabase.from('video_bookmarks').insert({user_id:dataUser?.id,playlist_video_id:v.id,position_seconds:pos,label:'Saved moment'});loadBookmarks()}
 async function loadTranscript(){const{data}=await supabase.from('video_transcripts').select('*').eq('playlist_video_id',v.id).maybeSingle();setTranscript(data||null)}
 async function generate(){
  setTranscript({status:'processing'});
  const r=await supabase.functions.invoke('get-youtube-transcript',{body:{playlist_video_id:v.id}});
  if(r.error){
    setTranscript({status:'error',error:'We could not generate a transcript right now. Please try again in a moment.'});
    return;
  }
  if(r.data?.status==='error'){
    setTranscript({
      status:'error',
      error:r.data.user_message||r.data.error||'This video does not currently have an accessible transcript.'
    });
    return;
  }
  setTranscript(r.data);
}
 async function loadAiContent(){if(!user||!v)return;const{data,error}=await supabase.from('video_ai_content').select('notes,summary,quiz').eq('playlist_video_id',v.id).eq('user_id',dataUser?.id).maybeSingle();if(!error)setAiContent(data||null)}
 async function generateAi(action){if(!user||!v)return;const key='ai_'+action;const credit=await charge(key,'AI '+action+' for '+v.title,{video_id:v.id});if(credit.error||!credit.data?.ok){setAiError(credit.error?.message||credit.data?.error||'Not enough credits.');return}setAiLoading(action);setAiError('');const r=await supabase.functions.invoke('generate-video-ai',{body:{action,playlist_video_id:v.id}});if(r.error){setAiError(r.error.message||'AI generation failed.');setAiLoading('');return}setAiContent(r.data?.content||null);setAiLoading('')}
 if(!p)return null;if(!v)return <div className="page learning-player-page"><section className="section"><h2>Preparing your lesson…</h2><p className="muted">Loading the course video. Please wait a moment.</p></section></div>;
 const duration=Math.max(progress[v.id]?.duration_seconds||0,1),percent=Math.min(100,Math.round((watched/duration)*100)),completed=!!progress[v.id]?.completed_at;
 const completedCount=vs.filter(x=>progress[x.id]?.completed_at).length,totalCount=vs.length,coursePercent=totalCount?Math.round(completedCount/totalCount*100):0,xp=globalXp,level=Math.max(1,Math.floor(xp/250)+1),nextIndex=Math.min(vs.findIndex(x=>x.id===v.id)+1,totalCount-1);
 return <div className="page learning-player-page">
  <div className="learning-player-topbar"><button className="player-back" onClick={back}>← <span>Back to course</span></button><div className="player-top-progress"><span>COURSE PROGRESS</span><b>{coursePercent}%</b><i><em style={{width:coursePercent+'%'}}/></i></div></div>
  <section className="player-layout">
   <main className="player-card">
    <div className="player-frame-wrap"><div className="player-frame">{youtubeId(v.youtube_video_id||v.video_url||v.url)?<div ref={playerHost} className="yt-player-host"/>:<div className="section"><b>Video source unavailable</b><p className="muted">This lesson does not have a YouTube video attached yet.</p></div>}</div><div className="player-live-pill"><span/> {playing?'NOW PLAYING':'READY TO LEARN'}</div><div className="player-focus-pill">✦ Focus mode</div></div>
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
      <div className="course-tabs">{['outline','notes','transcript','ai','bookmarks'].map(x=><button className={tab===x?'active':''} onClick={()=>setTab(x)} key={x}>{x==='outline'?'☰ Outline':x==='notes'?'✎ Notes':x==='transcript'?'▤ Transcript':x==='ai'?'✦ AI Learn':'🔖 Saved'}</button>)}</div>
     </div>
     <div className="player-panel">{tab==='outline'&&<Outline chapters={ch} player={player}/>}
      {tab==='notes'&&<div className="section player-section"><div className="panel-heading"><div><b>Timestamped notes</b><span>Capture what matters while you learn.</span></div></div><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="What do you want to remember from this moment?"/><button onClick={saveNote}>＋ Post note at current time</button>{notes.map(n=><button className="note-card" key={n.id} onClick={()=>player.current?.seekTo(n.position_seconds||0,true)}><b>{time(n.position_seconds)}</b> · {n.content}</button>)}</div>}
      {tab==='transcript'&&<div className="section player-section">{!transcript&&<><div className="panel-heading"><div><b>Video transcript</b><span>Jump directly to any spoken section.</span></div></div><button onClick={generate}>Generate transcript ✦</button></>}{transcript?.status==='processing'&&<p className="muted">Generating transcript…</p>}{transcript?.status==='error'&&<><p className="error">{transcript.error}</p><button onClick={generate}>Retry</button></>}{transcript?.status==='ready'&&<div className="transcript-list">{(transcript.segments||[]).map((s,i)=><button key={i} onClick={()=>player.current?.seekTo(Number(s.start||0),true)}><span>{time(s.start)}</span>{s.text}</button>)}</div>}</div>}
      {tab==='ai'&&<div className="section player-section">
 <div className="panel-heading"><div><b>AI Learning</b><span>Notes, summary and quiz for this video only.</span></div></div>
 <div className="ai-source-banner"><span>✦</span><div><b>{transcript?.status==='ready'?'Transcript ready':'No captions? No problem.'}</b><small>{transcript?.status==='ready'?'AI is using the current video transcript.':'AI can analyze this YouTube video directly.'}</small></div></div>
 <div className="ai-actions"><div className="ai-action-copy"><span>LEARN WITH AI</span><b>Pick a study mode</b></div>
  <button onClick={()=>generateAi('notes')} disabled={!!aiLoading}>{aiLoading==='notes'?'Generating…' :'✦ AI Notes · '+cost('ai_notes')+' Credits'}</button>
  <button onClick={()=>generateAi('summary')} disabled={!!aiLoading}>{aiLoading==='summary'?'Generating…' :'▤ AI Summary · '+cost('ai_summary')+' Credits'}</button>
  <button onClick={()=>generateAi('quiz')} disabled={!!aiLoading}>{aiLoading==='quiz'?'Generating…' :'? AI Quiz · '+cost('ai_quiz')+' Credits'}</button>
 </div>
 {aiError&&<p className="error">{aiError}</p>}
 {aiContent?.notes&&<div className="ai-result"><h3>AI Notes</h3><p>{aiContent.notes.overview}</p><h4>Key concepts</h4><ul>{(aiContent.notes.key_concepts||[]).map((x,i)=><li key={i}>{x}</li>)}</ul><h4>Important points</h4><ul>{(aiContent.notes.important_points||[]).map((x,i)=><li key={i}>{x}</li>)}</ul>{aiContent.notes.examples?.length>0&&<><h4>Examples</h4><ul>{aiContent.notes.examples.map((x,i)=><li key={i}>{x}</li>)}</ul></>}<h4>Quick revision</h4><ul>{(aiContent.notes.quick_revision||[]).map((x,i)=><li key={i}>{x}</li>)}</ul><h4>Key terms</h4><p>{(aiContent.notes.key_terms||[]).join(' • ')}</p></div>}
 {aiContent?.summary&&<div className="ai-result"><h3>AI Summary</h3><div className="ai-summary-list">{String(aiContent.summary).split(/\n+/).filter(Boolean).map((x,i)=><div key={i}><span>{String(i+1).padStart(2,'0')}</span><p>{x.replace(/^[-•]\s*/,'')}</p></div>)}</div></div>}
 {aiContent?.quiz?.length>0&&<div className="ai-result ai-quiz-result">
  <div className="ai-quiz-head"><div><h3>AI Quiz</h3><p>Choose an answer — you'll see the result instantly.</p></div><div className="ai-quiz-score"><b>{aiContent.quiz.reduce((n,q,i)=>n+(quizAnswers[i]!==undefined&&Number(quizAnswers[i])===Number(q.answer)?1:0),0)}</b><span>/ {aiContent.quiz.length}</span></div></div>
  {aiContent.quiz.map((q,i)=>{
    const chosen=quizAnswers[i];
    const answered=chosen!==undefined;
    const correct=Number(q.answer);
    return <div className={"ai-quiz-card "+(answered?(Number(chosen)===correct?"quiz-correct":"quiz-wrong"):"")} key={i}>
      <div className="ai-question-top"><span>Q{i+1}</span><b>{q.question}</b></div>
      <div className="ai-options">{(q.options||[]).map((o,j)=>{
        const isCorrect=j===correct,isChosen=Number(chosen)===j;
        return <button className={"ai-option "+(answered?(isCorrect?"answer-correct":isChosen?"answer-wrong":"answer-muted"):"")} key={j} disabled={answered} onClick={()=>setQuizAnswers(prev=>({...prev,[i]:j}))}>
          <span className="ai-option-letter">{String.fromCharCode(65+j)}</span><span>{o}</span>
          {answered&&isCorrect&&<span className="ai-result-icon">✓</span>}
          {answered&&isChosen&&!isCorrect&&<span className="ai-result-icon">×</span>}
        </button>
      })}</div>
      {answered&&<div className={"ai-feedback "+(Number(chosen)===correct?"good":"bad")}><b>{Number(chosen)===correct?"Correct! 🎉":"Not quite."}</b>{Number(chosen)!==correct&&<span> Correct answer: <strong>{q.options?.[correct]}</strong></span>}<p>{q.explanation}</p></div>}
    </div>
  })}
</div>}
 {!aiContent&&!aiLoading&&<div className="ai-empty"><div className="ai-empty-icon">✦</div><b>Your video, turned into study material.</b><p className="muted">Notes are simplified, the summary is bite-sized, and the quiz helps you check what you understood.</p></div>}
 </div>}{tab==='bookmarks'&&<div className="section player-section"><div className="panel-heading"><div><b>Saved moments</b><span>Your personal highlights from this lesson.</span></div></div>{bookmarks.length?bookmarks.map(b=><button className="note-card" key={b.id} onClick={()=>player.current?.seekTo(b.position_seconds,true)}>🔖 {time(b.position_seconds)} · {b.label||'Saved moment'}</button>):<p className="muted">No bookmarks in this video yet.</p>}</div>}
     </div>
    </div>
   </main>
   <aside className="course-sidebar">
    <div className="course-content-head">
      <div className="course-content-title">
        <p className="eyebrow">COURSE CONTENT</p>
        <h2>{p.title}</h2>
        <span>{totalCount} {totalCount===1?'lesson':'lessons'} · {completedCount} completed</span>
      </div>
      <div className="course-percent-badge"><b>{coursePercent}%</b><span>done</span></div>
    </div>
    <div className="course-progress-line"><div><span>Overall progress</span><b>{completedCount}/{totalCount}</b></div><i><em style={{width:coursePercent+'%'}}/></i></div>
    <div className="lesson-list-heading"><span>Lessons</span><b>{completedCount}/{totalCount}</b></div>
    <div className="lesson-list">{vs.map((x,i)=>{const done=!!progress[x.id]?.completed_at,isActive=x.id===v.id,wp=Math.min(100,Math.round((progress[x.id]?.watched_seconds||0)/Math.max(progress[x.id]?.duration_seconds||1,1)*100));return <button className={'side-video '+(isActive?'active ':'')+(done?'done ':'')+(wp>0&&!done?'started':'')} key={x.id} onClick={()=>onOpenVideo?.(x.id)}><span className="lesson-index">{done?'✓':String(i+1).padStart(2,'0')}</span><div className="side-video-copy"><b>{x.title}</b><small>{done?'Completed':isActive?(wp?wp+'% watched · Currently learning':'Currently learning'):wp?wp+'% watched':'Not started'}</small>{!done&&wp>0&&<i><em style={{width:wp+'%'}}/></i>}</div><span className="lesson-state">{done?'✓':isActive?'●':''}</span></button>})}</div>
    {completedCount===totalCount&&totalCount>0?<div className="course-complete-footer"><span>✓</span><div><b>Course completed</b><small>You finished every lesson.</small></div></div>:null}
   </aside>
  </section>
 </div>
}

function Outline({chapters,player}){return <div className="section player-section"><div className="panel-heading"><div><b>Chapter map</b><span>Jump to exactly what you want to learn.</span></div></div>{chapters.length?chapters.map(x=><button className="chapter-row" key={x.id} onClick={()=>player.current?.seekTo(Number(x.start_seconds),true)}><span>{time(x.start_seconds)}</span><b>{x.title}</b><i>→</i></button>):<p className="muted">No chapters available for this video.</p>}</div>}