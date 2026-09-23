import{useEffect,useState}from'react';import{supabase}from'../lib/supabase';import{useAuth}from'../context/AuthContext';import{useTeam}from'../context/TeamContext';

function parseQuestions(raw){
 const blocks=raw.replace(/\r/g,'').split(/\n\s*\n+/).map(x=>x.trim()).filter(Boolean),out=[];
 for(const block of blocks){
  const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);
  const opts=lines.map(line=>{const m=line.match(/^\(?([A-D])\)?[.)\-:]\s*(.+)$/i);return m?{letter:m[1].toUpperCase(),text:m[2].trim()}:null}).filter(Boolean);
  const answer=(block.match(/(?:answer|correct\s*answer)\s*[:\-]?\s*\(?([A-D])\)?/i)||[])[1]?.toUpperCase();
  const qLine=lines.find(x=>!/^\(?[A-D]\)?[.)\-:]/i.test(x)&&!/^answer\s*:/i.test(x));
  if(qLine&&opts.length>=2&&answer)out.push({question:qLine.replace(/^Q(?:uestion)?\s*\d*[.:)\-]?\s*/i,'').trim(),options:opts.map((o,i)=>({position:i,option_text:o.text,is_correct:o.letter===answer}))});
 }
 return out;
}
export default function TestSeries({courseId,onStart}){
 const{team}=useTeam(),{user}=useAuth(),admin=['owner','admin'].includes(team?.role);
 const[tests,setTests]=useState([]),[mode,setMode]=useState(null),[leaderboard,setLeaderboard]=useState(null),[leaderboardTest,setLeaderboardTest]=useState(null),[title,setTitle]=useState(''),[desc,setDesc]=useState(''),[minutes,setMinutes]=useState(''),[points,setPoints]=useState(10),[raw,setRaw]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(){const{data}=await supabase.from('test_series').select('*').eq('playlist_id',courseId).order('created_at',{ascending:true});setTests(data||[])}
 useEffect(()=>{load()},[courseId]);
 async function create(){
  setMessage('');const parsed=mode==='paste'?parseQuestions(raw):[];if(!title.trim())return setMessage('Add a test title first.');if(mode==='paste'&&!parsed.length)return setMessage('No complete MCQs detected. Use Q1 + A/B/C/D + Answer: B.');
  setBusy(true);const{data,error}=await supabase.from('test_series').insert({playlist_id:courseId,title:title.trim(),description:desc.trim()||null,time_limit_minutes:minutes?Number(minutes):null,points_per_question:Number(points)||10,created_by:user.id}).select().single();
  if(error){setMessage(error.message);setBusy(false);return}
  if(parsed.length){for(let i=0;i<parsed.length;i++){const{data:q,error:qe}=await supabase.from('test_questions').insert({test_id:data.id,position:i,question:parsed[i].question}).select().single();if(qe){setMessage(qe.message);setBusy(false);return}const{error:oe}=await supabase.from('test_options').insert(parsed[i].options.map(o=>({...o,question_id:q.id})));if(oe){setMessage(oe.message);setBusy(false);return}}}
  setTitle('');setDesc('');setRaw('');setMinutes('');setMode(null);setMessage(parsed.length?parsed.length+' questions imported into the test.':'Test created — open Manage to add questions.');await load();setBusy(false);
 }
 async function remove(id){if(!confirm('Delete this test and all questions and attempts?'))return;const{error}=await supabase.from('test_series').delete().eq('id',id);if(error)setMessage(error.message);else load()}
 return <section className="test-series-panel section">
  <div className="test-series-head"><div><p className="eyebrow">ASSESSMENTS</p><h2>Test Series</h2><p className="muted">Challenge your teammates with assessments built directly into this course.</p></div>{admin&&<div className="test-builder-actions"><button onClick={()=>setMode('paste')}>✨ Paste & auto-create</button><button className="ghost" onClick={()=>setMode('manual')}>＋ Manual test</button></div>}</div>
  {message&&<div className="notice">{message}</div>}
  {mode&&<div className="test-builder"><div className="test-builder-top"><div><p className="eyebrow">{mode==='paste'?'AI-FRIENDLY IMPORT':'MANUAL BUILDER'}</p><h3>{mode==='paste'?'Paste your ChatGPT MCQs':'Create a test shell'}</h3></div><button className="ghost" onClick={()=>setMode(null)}>Close</button></div><div className="test-builder-grid">
   <label>Test title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="ML Fundamentals — Test 1"/></label>
   <label>Time limit<input type="number" min="1" max="180" value={minutes} onChange={e=>setMinutes(e.target.value)} placeholder="Optional minutes"/></label>
   <label>Points / question<input type="number" min="1" max="100" value={points} onChange={e=>setPoints(e.target.value)}/></label>
   <label className="wide">Description<input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What will this test cover?"/></label>
   {mode==='paste'&&<label className="wide">Paste MCQs<textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder={'Q1. What is supervised learning?\n\nA. Learning without data\nB. Learning from labelled data\nC. Random learning\nD. No model\n\nAnswer: B\n\nQ2. ...'}/></label>}
   {mode==='manual'&&<div className="notice wide">Manual test creation starts with the test shell. Use the course test manager to add individual questions and options.</div>}
  </div><div className="form-actions"><button onClick={create} disabled={busy}>{busy?'Creating…':mode==='paste'?'Parse & create test':'Create test'}</button></div></div>}
  <div className="test-list">{tests.map((t,i)=><article className="test-card" key={t.id}><div className="test-index">{String(i+1).padStart(2,'0')}</div><div className="grow"><h3>{t.title}</h3><p>{t.description||'Course assessment'}</p><div className="test-meta"><span>⏱ {t.time_limit_minutes?t.time_limit_minutes+' min':'No limit'}</span><span>✦ {t.points_per_question} pts/question</span></div></div><div className="test-card-actions"><button onClick={()=>onStart(t.id)}>Start test →</button><button className="ghost" onClick={async()=>{const{data}=await supabase.rpc('get_test_leaderboard',{p_test_id:t.id});setLeaderboard(data||[]);setLeaderboardTest(t)}}>Leaderboard</button>{admin&&<button className="danger ghost" onClick={()=>remove(t.id)}>Delete</button>}</div></article>)}{!tests.length&&<div className="test-empty"><b>No tests yet</b><span>Admins can paste ChatGPT-formatted MCQs and turn them into a test instantly.</span></div>}</div>
 </section>
}