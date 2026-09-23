import{useState}from'react';import{useTeam}from'../context/TeamContext';import{supabase}from'../lib/supabase';

export default function AddCourse(){
 const{team,reload}=useTeam();
 const[url,setUrl]=useState(''),[title,setTitle]=useState(''),[channel,setChannel]=useState(''),[items,setItems]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[error,setError]=useState('');
 if(!['owner','admin'].includes(team?.role))return <section className="section"><b>Admin access required.</b></section>;
 async function importList(){
  if(!url.trim())return setError('Paste a YouTube playlist URL first.');
  setBusy(true);setError('');setMsg('Importing videos and available chapters…');
  const{data,error}=await supabase.functions.invoke('import-youtube-playlist',{body:{team_id:team.id,playlist_url:url.trim()}});
  if(error){setError(error.message);setMsg('')}else if(data?.error){setError(data.error);setMsg('')}else{setMsg((data?.videos_imported||0)+' videos imported successfully.');await reload()}
  setBusy(false);
 }
 async function create(){
  if(!title.trim())return setError('Course title is required.');
  setBusy(true);setError('');setMsg('');
  const{data,error}=await supabase.from('playlists').insert({team_id:team.id,title:title.trim(),channel:channel.trim(),url:url.trim(),created_by:(await supabase.auth.getUser()).data.user.id}).select().single();
  if(error){setError(error.message);setBusy(false);return}
  const rows=items.split(/\n/).map(x=>x.trim()).filter(Boolean).map((x,i)=>({playlist_id:data.id,position:i,title:x}));
  if(rows.length){const{error:videoError}=await supabase.from('playlist_videos').insert(rows);if(videoError){setError(videoError.message);setBusy(false);return}}
  setMsg('Course created successfully.');setTitle('');setChannel('');setItems('');setUrl('');await reload();setBusy(false);
 }
 return <div className="page">
  <div className="admin-hero">
   <div><p className="eyebrow">ADMIN · COURSE LIBRARY</p><h1>Add a course</h1><p className="muted">Bring a YouTube playlist into your team or build a course manually.</p></div>
   <div className="import-icon">＋</div>
  </div>
  {(msg||error)&&<div className={'notice '+(error?'bad':'')}>{error||msg}</div>}
  <div className="form-grid">
   <section className="form-card">
    <div className="section-head"><div><p className="eyebrow">AUTOMATIC</p><h2>YouTube playlist import</h2><p className="muted">Import the exact videos from a playlist and pick up available chapters automatically.</p></div><div className="import-icon">▶</div></div>
    <div className="form-stack">
     <label>Playlist URL<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.youtube.com/playlist?list=…"/></label>
     <div className="notice">The importer runs securely through the existing Supabase Edge Function. Your API key stays off the browser.</div>
     <div className="form-actions"><button onClick={importList} disabled={busy}>{busy?'Importing…':'Import playlist'}</button></div>
    </div>
   </section>
   <section className="form-card">
    <div className="section-head"><div><p className="eyebrow">MANUAL</p><h2>Create a course</h2><p className="muted">Useful when you already know the lessons you want to add.</p></div><div className="import-icon">✦</div></div>
    <div className="form-stack">
     <label>Course title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Spring Boot Masterclass"/></label>
     <label>Channel / instructor<input value={channel} onChange={e=>setChannel(e.target.value)} placeholder="Channel name"/></label>
     <label>Playlist URL<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Optional YouTube URL"/></label>
     <label>Lessons <span className="muted">· one title per line</span><textarea value={items} onChange={e=>setItems(e.target.value)} placeholder={'Introduction\nVariables & data types\nFunctions\n…'}/></label>
     <div className="form-actions"><button className="ghost" onClick={()=>{setTitle('');setChannel('');setUrl('');setItems('');setMsg('');setError('')}}>Clear</button><button onClick={create} disabled={busy}>{busy?'Creating…':'Create course'}</button></div>
    </div>
   </section>
  </div>
 </div>
}