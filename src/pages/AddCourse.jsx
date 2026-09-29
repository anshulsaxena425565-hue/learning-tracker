import { useState } from 'react'
import { toast } from '../lib/toast'
import { useAuth } from '../context/AuthContext'
import { useCredits } from '../context/CreditsContext'
import { useTeam } from '../context/TeamContext'
import { supabase } from '../lib/supabase'

function youtubeId(value){
  const s=String(value||'').trim()
  if(!s)return ''
  const m=s.match(/(?:youtu\\.be\\/|youtube\\.com\\/(?:watch\\?v=|embed\\/|shorts\\/|live\\/))([^?&/]+)/i)
  return m?.[1]||''
}

const blankVideo=()=>({title:'',url:''})

export default function AddCourse(){
 const{team,reload}=useTeam()
 const{dataUser}=useAuth()
 const{cost,charge}=useCredits()
 const[url,setUrl]=useState('')
 const[title,setTitle]=useState('')
 const[channel,setChannel]=useState('')
 const[videoRows,setVideoRows]=useState([blankVideo()])
 const[busy,setBusy]=useState(false)
 const[msg,setMsg]=useState('')
 const[error,setError]=useState('')

 if(!['owner','admin'].includes(team?.role))return <section className="section"><b>Admin access required.</b></section>

 function updateVideo(index,key,value){
  setVideoRows(rows=>rows.map((row,i)=>i===index?{...row,[key]:value}:row))
 }
 function addVideo(){setVideoRows(rows=>[...rows,blankVideo()])}
 function removeVideo(index){
  setVideoRows(rows=>rows.length===1?[blankVideo()]:rows.filter((_,i)=>i!==index))
 }

 async function importList(){
  if(!url.trim())return setError('Paste a YouTube playlist URL first.')
  const credit=await charge('playlist_creation','Imported playlist: '+url.trim(),{playlist_url:url.trim()})
  if(credit.error||!credit.data?.ok)return setError(credit.error?.message||credit.data?.error||'Not enough credits.')
  setBusy(true);setError('');setMsg('Importing videos and available chapters…')
  const{data,error}=await supabase.functions.invoke('import-youtube-playlist',{body:{team_id:team.id,playlist_url:url.trim()}})
  if(error){setError(error.message);setMsg('')}
  else if(data?.error){setError(data.error);setMsg('')}
  else{setMsg((data?.videos_imported||0)+' videos imported successfully.');toast((data?.videos_imported||0)+' videos are now available in your course.','success','Course imported');await reload()}
  setBusy(false)
 }

 async function create(){
  if(!title.trim())return setError('Course title is required.')
  const validRows=videoRows.map(row=>({...row,url:row.url.trim(),title:row.title.trim()})).filter(row=>row.url)
  if(!validRows.length)return setError('Add at least one YouTube video to the course.')
  const invalid=validRows.find(row=>!youtubeId(row.url))
  if(invalid)return setError('Please enter a valid YouTube video URL for every video.')
  const credit=await charge('playlist_creation','Created course: '+title.trim(),{title:title.trim(),video_count:validRows.length})
  if(credit.error||!credit.data?.ok)return setError(credit.error?.message||credit.data?.error||'Not enough Credits.')
  setBusy(true);setError('');setMsg('')

  const{data,error}=await supabase.from('playlists').insert({
   team_id:team.id,
   title:title.trim(),
   channel:channel.trim(),
   url:null,
   created_by:dataUser?.id
  }).select().single()

  if(error){setError(error.message);setBusy(false);return}

  const rows=validRows.map((row,i)=>({
   playlist_id:data.id,
   position:i,
   title:row.title||'Video '+(i+1),
   youtube_video_id:youtubeId(row.url),
   video_url:row.url
  }))

  const{error:videoError}=await supabase.from('playlist_videos').insert(rows)
  if(videoError){setError(videoError.message);setBusy(false);return}

  setMsg(validRows.length+' videos added to your course.')
  toast('Your custom course is ready in the team library.','success','Course created')
  setTitle('');setChannel('');setUrl('');setVideoRows([blankVideo()])
  await reload();setBusy(false)
 }

 return <div className="page add-course-page">
  <div className="admin-hero">
   <div>
    <p className="eyebrow">ADMIN · COURSE LIBRARY</p>
    <h1>Add a course</h1>
    <p className="muted">Build a learning path from any YouTube videos — even videos from different channels and playlists.</p>
   </div>
   <div className="import-icon">✦</div>
  </div>

  {(msg||error)&&<div className={'notice '+(error?'bad':'')}>{error||msg}</div>}

  <div className="form-grid">
   <section className="form-card">
    <div className="section-head">
     <div>
      <p className="eyebrow">AUTOMATIC</p>
      <h2>YouTube playlist import</h2>
      <p className="muted">Already have a YouTube playlist? Import its videos and available chapters automatically.</p>
     </div>
     <div className="import-icon">▶</div>
    </div>
    <div className="form-stack">
     <label>Playlist URL<input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.youtube.com/playlist?list=…"/></label>
     <div className="notice">The importer runs securely through the existing Supabase Edge Function. Your API key stays off the browser.</div>
     <div className="form-actions"><button onClick={importList} disabled={busy}>{busy?'Importing…':<>Import playlist · {cost('playlist_creation')} Credits</>}</button></div>
    </div>
   </section>

   <section className="form-card manual-course-card">
    <div className="section-head">
     <div>
      <p className="eyebrow">MANUAL · CUSTOM COURSE</p>
      <h2>Build your own course</h2>
      <p className="muted">No playlist required. Pick any YouTube videos you want and arrange them into your own learning path.</p>
     </div>
     <div className="import-icon">✦</div>
    </div>

    <div className="form-stack">
     <div className="manual-course-intro">
      <span>1</span><div><b>Course details</b><small>Give your learning path a name and instructor.</small></div>
     </div>
     <label>Course title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. My Java Interview Roadmap"/></label>
     <label>Instructor / channel<input value={channel} onChange={e=>setChannel(e.target.value)} placeholder="e.g. Telusko, CodeWithHarry, Personal notes"/></label>

     <div className="manual-course-intro video-intro">
      <span>2</span><div><b>Add videos</b><small>Mix videos from different channels. They don't need to belong to the same YouTube playlist.</small></div>
     </div>

     <div className="manual-video-list">
      {videoRows.map((row,index)=><div className="manual-video-row" key={index}>
       <div className="manual-video-number">{String(index+1).padStart(2,'0')}</div>
       <div className="manual-video-fields">
        <label>Video title <span className="muted">· optional</span>
         <input value={row.title} onChange={e=>updateVideo(index,'title',e.target.value)} placeholder={'e.g. Introduction to Spring Boot'}/>
        </label>
        <label>YouTube video URL
         <input value={row.url} onChange={e=>updateVideo(index,'url',e.target.value)} placeholder="https://www.youtube.com/watch?v=…"/>
        </label>
       </div>
       <button type="button" className="manual-video-remove" onClick={()=>removeVideo(index)} disabled={videoRows.length===1} title="Remove video">×</button>
      </div>)}
     </div>

     <button type="button" className="manual-add-video" onClick={addVideo}>＋ Add another video</button>

     <div className="manual-course-tip">
      <span>✦</span>
      <div><b>Make it your way</b><small>Video order becomes your course order. Learners will see each video as a lesson with progress, notes, transcript, bookmarks and AI learning tools.</small></div>
     </div>

     <div className="form-actions">
      <button className="ghost" onClick={()=>{setTitle('');setChannel('');setVideoRows([blankVideo()]);setMsg('');setError('')}}>Clear</button>
      <button onClick={create} disabled={busy}>{busy?'Creating…':<>Create course · {cost('playlist_creation')} Credits</>}</button>
     </div>
    </div>
   </section>
  </div>
 </div>
}
