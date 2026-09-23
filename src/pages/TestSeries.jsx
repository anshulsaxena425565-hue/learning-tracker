import{useEffect,useState}from'react';import{supabase}from'../lib/supabase';import{useAuth}from'../context/AuthContext';import{useTeam}from'../context/TeamContext';

function parseQuestions(raw){
 const text=String(raw||'').replace(/\\r/g,'').trim();if(!text)return[];
 const lines=text.split('\\n').map(x=>x.trim()).filter(Boolean),blocks=[];let current=[];
 const isQuestion=x=>/^(?:Q(?:uestion|uestion)?\\s*\\d*|प्रश्न\\s*\\d*)[.):-]?\\s+/i.test(x);
 for(const line of lines){
  if(isQuestion(line)&&current.length){blocks.push(current);current=[line]}else current.push(line);
 }
 if(current.length)blocks.push(current);
 const out=[];
 for(const block of blocks){
  const options=[],answers=[];
  let question='';
  for(const line of block){
   const om=line.match(/^\\(?([A-D])\\)?[.)\\-:]\\s*(.+)$/i)||line.match(/^\\(?([1-4])\\)?[.)\\-:]\\s*(.+)$/);
   const am=line.match(/^(?:answer|correct\\s*answer|उत्तर|सही\\s*उत्तर)\\s*[:\\-]?\\s*\\(?([A-D1-4])\\)?/i);
   if(am){answers.push(am[1].toUpperCase());continue}
   if(om){const letter=om[1].toUpperCase();const normalized=letter>='1'&&letter<='4'?String.fromCharCode(64+Number(letter)):letter;options.push({letter:normalized,text:om[2].trim()});continue}
   if(!question&&!/^(?:answer|correct\\s*answer|उत्तर|सही\\s*उत्तर)\\b/i.test(line))question=line.replace(/^Q(?:uestion)?\\s*\\d*[.):-]?\\s*/i,'').replace(/^प्रश्न\\s*\\d*[.):-]?\\s*/i,'').trim();
  }
  const answer=answers[0];const validAnswer=answer>='1'&&answer<='4'?String.fromCharCode(64+Number(answer)):answer;
  if(question&&options.length>=2&&validAnswer&&options.some(o=>o.letter===validAnswer)){
   out.push({question,options:options.map((o,i)=>({position:i,option_text:o.text,is_correct:o.letter===validAnswer}))});
  }
 }
 return out;
}
export default function TestSeries({courseId,onStart}){
 const{team}=useTeam(),{user}=useAuth(),admin=['owner','admin'].includes(team?.role);
 const[tests,setTests]=useState([]),[mode,setMode]=useState(null),[leaderboard,setLeaderboard]=useState(null),[leaderboardTest,setLeaderboardTest]=useState(null),[history,setHistory]=useState([]),[historyTest,setHistoryTest]=useState(null),[title,setTitle]=useState(''),[desc,setDesc]=useState(''),[minutes,setMinutes]=useState(''),[points,setPoints]=useState(10),[defaultLanguage,setDefaultLanguage]=useState('en'),[raw,setRaw]=useState(''),[rawHi,setRawHi]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(){const{data}=await supabase.from('test_series').select('*').eq('playlist_id',courseId).order('created_at',{ascending:true});setTests(data||[])}
 useEffect(()=>{load()},[courseId]);
 async function create(){
  setMessage('');const parsed=mode==='paste'?parseQuestions(raw):[],parsedHi=mode==='paste'?parseQuestions(rawHi):[];if(mode==='paste'&&!rawHi.trim()&&parsed.length){try{setMessage('Generating Hindi version…');const tr=await supabase.functions.invoke('translate-test-mcq',{body:{items:parsed.map(x=>({question:x.question,options:x.options.map(o=>o.option_text)}))}});if(tr.error)throw new Error(tr.error.message||'Translation service failed');if(!tr.data?.items?.length)throw new Error('No translated questions returned');parsedHi=parsed.map((x,i)=>({question:tr.data.items[i]?.question||x.question,options:x.options.map((o,j)=>({...o,option_text:tr.data.items[i]?.options?.[j]||o.option_text}))}));setMessage('Hindi translation generated successfully.');}catch(e){setMessage('Hindi auto-translation failed: '+(e?.message||'Unknown error'));setBusy(false);return}}if(!title.trim())return setMessage('Add a test title first.');if(mode==='paste'&&!parsed.length)return setMessage('No complete MCQs detected. Use Q1 + A/B/C/D + Answer: B.');
  setBusy(true);const{data,error}=await supabase.from('test_series').insert({playlist_id:courseId,title:title.trim(),description:desc.trim()||null,time_limit_minutes:minutes?Number(minutes):null,points_per_question:Number(points)||10,default_language:defaultLanguage,created_by:user.id}).select().single();
  if(error){setMessage(error.message);setBusy(false);return}
  if(parsed.length){for(let i=0;i<parsed.length;i++){const{data:q,error:qe}=await supabase.from('test_questions').insert({test_id:data.id,position:i,question:parsed[i].question,question_hi:parsedHi[i]?.question||null}).select().single();if(qe){setMessage(qe.message);setBusy(false);return}const{error:oe}=await supabase.from('test_options').insert(parsed[i].options.map((o,idx)=>({...o,question_id:q.id,option_text_hi:parsedHi[i]?.options?.[idx]?.option_text||null})));if(oe){setMessage(oe.message);setBusy(false);return}}}
  setTitle('');setDesc('');setRaw('');setRawHi('');setMinutes('');setDefaultLanguage('en');setMode(null);setMessage(parsed.length?parsed.length+' questions imported into the test.':'Test created — open Manage to add questions.');await load();setBusy(false);
 }
 async function showHistory(t){const{data,error}=await supabase.rpc('get_test_attempt_history',{p_test_id:t.id});if(error)setMessage(error.message);else{setHistory(data||[]);setHistoryTest(t)}} async function remove(id){if(!confirm('Delete this test and all questions and attempts?'))return;const{error}=await supabase.from('test_series').delete().eq('id',id);if(error)setMessage(error.message);else load()}
 return <section className="test-series-panel section">
  <div className="test-series-head"><div><p className="eyebrow">ASSESSMENTS</p><h2>Test Series</h2><p className="muted">Challenge your teammates with assessments built directly into this course.</p></div>{admin&&<div className="test-builder-actions"><button onClick={()=>setMode('paste')}>✨ Paste & auto-create</button><button className="ghost" onClick={()=>setMode('manual')}>＋ Manual test</button></div>}</div>
  {message&&<div className="notice">{message}</div>}
  {mode&&<div className="test-builder"><div className="test-builder-top"><div><p className="eyebrow">{mode==='paste'?'AI-FRIENDLY IMPORT':'MANUAL BUILDER'}</p><h3>{mode==='paste'?'Paste your ChatGPT MCQs':'Create a test shell'}</h3></div><button className="ghost" onClick={()=>setMode(null)}>Close</button></div><div className="test-builder-grid">
   <label>Test title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="ML Fundamentals — Test 1"/></label>
   <label>Time limit<input type="number" min="1" max="180" value={minutes} onChange={e=>setMinutes(e.target.value)} placeholder="Optional minutes"/></label>
   <label>Default language<select value={defaultLanguage} onChange={e=>setDefaultLanguage(e.target.value)}><option value="en">English</option><option value="hi">Hindi</option></select></label><label>Points / question<input type="number" min="1" max="100" value={points} onChange={e=>setPoints(e.target.value)}/></label>
   <label className="wide">Description<input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What will this test cover?"/></label>
   {mode==='paste'&&<><label className="wide">English MCQs<textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder={'Q1. What is supervised learning?\n\nA. Learning without data\nB. Learning from labelled data\nC. Random learning\nD. No model\n\nAnswer: B\n\nQ2. ...'}/></label><label className="wide">Hindi version <span className="muted">(optional — auto-translated if left empty)</span><textarea value={rawHi} onChange={e=>setRawHi(e.target.value)} placeholder="Paste the Hindi MCQs here if you want to control the exact wording…"/></label></>}
   {mode==='manual'&&<div className="notice wide">Manual test creation starts with the test shell. Use the course test manager to add individual questions and options.</div>}
  </div><div className="form-actions"><button onClick={create} disabled={busy}>{busy?'Creating…':mode==='paste'?'Parse & create test':'Create test'}</button></div></div>}
  <div className="test-list">{tests.map((t,i)=><article className="test-card" key={t.id}><div className="test-index">{String(i+1).padStart(2,'0')}</div><div className="grow"><h3>{t.title}</h3><p>{t.description||'Course assessment'}</p><div className="test-meta"><span>⏱ {t.time_limit_minutes?t.time_limit_minutes+' min':'No limit'}</span><span>✦ {t.points_per_question} pts/question</span></div></div><div className="test-card-actions"><button onClick={()=>onStart(t.id)}>Start test →</button><button className="ghost" onClick={async()=>{const{data}=await supabase.rpc('get_test_leaderboard',{p_test_id:t.id});setLeaderboard(data||[]);setLeaderboardTest(t)}}>Leaderboard</button>{admin&&<button className="ghost" onClick={()=>showHistory(t)}>History</button>}{admin&&<button className="danger ghost" onClick={()=>remove(t.id)}>Delete</button>}</div></article>)}{!tests.length&&<div className="test-empty"><b>No tests yet</b><span>Admins can paste ChatGPT-formatted MCQs and turn them into a test instantly.</span></div>}</div>
 {historyTest&&<div className="test-modal-backdrop" onClick={()=>setHistoryTest(null)}><div className="test-leaderboard-modal test-history-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">ADMIN ANALYTICS</p><h3>{historyTest.title}</h3><span>{history.length} submitted attempts</span></div><button className="modal-close" onClick={()=>setHistoryTest(null)}>×</button></div><div className="modal-leaderboard">{history.map((x,i)=><div className="history-row" key={x.attempt_id}><span className="modal-rank">{i+1}</span><div className="grow"><b>{x.display_name}</b><small>{x.correct_count}/{x.total_questions} correct · {x.percentage}% accuracy</small></div><div><strong>{x.duration_seconds?Math.floor(x.duration_seconds/60)+'m '+x.duration_seconds%60+'s':'—'}</strong><small>{x.average_time_per_question||0}s/question</small></div><span className="history-score">{x.score} pts</span></div>)}{!history.length&&<div className="modal-empty"><span>📊</span><b>No completed attempts</b><small>Attempt history will appear here after learners submit.</small></div>}</div></div></div>}
 {leaderboardTest&&<div className="test-modal-backdrop" onClick={()=>setLeaderboardTest(null)}><div className="test-leaderboard-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">TEAM RESULTS</p><h3>{leaderboardTest.title}</h3><span>{(leaderboard||[]).length} submitted attempts</span></div><button className="modal-close" onClick={()=>setLeaderboardTest(null)}>×</button></div><div className="modal-leaderboard">{(leaderboard||[]).map((x,i)=><div className="modal-leader-row" key={x.user_id}><span className="modal-rank">{i+1}</span><span className="modal-avatar">{(x.display_name||'?')[0].toUpperCase()}</span><div className="grow"><b>{x.display_name}</b><small>{x.correct_count}/{x.total_questions} correct · {x.score} pts</small></div><strong>{x.percentage}%</strong></div>)}{!leaderboard?.length&&<div className="modal-empty"><span>🏆</span><b>No attempts yet</b><small>Once learners complete this test, their results will appear here.</small></div>}</div></div></div>}
 </section>
}