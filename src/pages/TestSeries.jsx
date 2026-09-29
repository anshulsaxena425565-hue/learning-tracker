import { useEffect,useState } from 'react'
import { toast } from '../lib/toast'
import { supabase } from '../lib/supabase'
import { useCredits } from '../context/CreditsContext'
import { useAuth } from '../context/AuthContext'
import { useTeam } from '../context/TeamContext'

function parseQuestions(raw){
 const text=String(raw||'').replace(/\r/g,'').trim();if(!text)return[];
 const blocks=text.split(/\n\s*\n+/).map(x=>x.trim()).filter(Boolean),out=[];
 for(const block of blocks){
  const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);
  const opts=lines.map(line=>{const m=line.match(/^\s*\(?([A-D])\)?[.)\-:]\s*(.+)$/iu);return m?{letter:m[1].toUpperCase(),text:m[2].trim()}:null}).filter(Boolean);
  const answerMatch=block.match(/(?:answer|correct\s*answer|उत्तर|सही\s*उत्तर)\s*[:\-]?\s*\(?([A-D])\)?/iu);
  const qLine=lines.find(x=>!/^\s*\(?[A-D]\)?[.)\-:]\s*/iu.test(x)&&!/^(?:answer|correct\s*answer|उत्तर|सही\s*उत्तर)\s*[:\-]?/iu.test(x));
  if(qLine&&opts.length>=2)out.push({question:qLine.replace(/^Q(?:uestion)?\s*\d*[.:)\-]?\s*/i,'').trim(),options:opts.map((o,i)=>({position:i,option_text:o.text,is_correct:answerMatch?o.letter===answerMatch[1].toUpperCase():false}))});
 }
 return out;
}
// Test Series: paste import + AI builder; manual builder intentionally removed.
export default function TestSeries({courseId,onStart,standalone=false}){
 const{team}=useTeam(),{user}=useAuth(),{cost,charge}=useCredits(),admin=['owner','admin'].includes(team?.role);
 const[tests,setTests]=useState([]),[mode,setMode]=useState(null),[leaderboard,setLeaderboard]=useState(null),[leaderboardTest,setLeaderboardTest]=useState(null),[history,setHistory]=useState([]),[historyTest,setHistoryTest]=useState(null),[title,setTitle]=useState(''),[desc,setDesc]=useState(''),[prompt,setPrompt]=useState(''),[raw,setRaw]=useState(''),[rawHi,setRawHi]=useState(''),[topics,setTopics]=useState(''),[minutes,setMinutes]=useState('30'),[points,setPoints]=useState(10),[defaultLanguage,setDefaultLanguage]=useState('en'),[maxReattempts,setMaxReattempts]=useState(0),[questionCount,setQuestionCount]=useState(10),[difficulty,setDifficulty]=useState('medium'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 async function load(){const{data}=await supabase.from('test_series').select('*').eq(standalone?'team_id':'playlist_id',standalone?team.id:courseId).order('created_at',{ascending:true});setTests(data||[])}
 useEffect(()=>{if(team?.id)load()},[courseId,team?.id,standalone]);

 async function createPasteTest(){
  setMessage('');
  const parsed=parseQuestions(raw);let parsedHi=parseQuestions(rawHi);
  if(!parsed.length)return setMessage('English MCQs could not be parsed. Use Q1 + A/B/C/D + Answer format.');
  if(rawHi.trim()&&parsedHi.length!==parsed.length)return setMessage('Hindi MCQ count does not match English. English: '+parsed.length+' · Hindi: '+parsedHi.length+'.');
  setBusy(true);
  if(!rawHi.trim()){setMessage('Generating Hindi version…');try{const tr=await supabase.functions.invoke('translate-test-mcq',{body:{items:parsed.map(x=>({question:x.question,options:x.options.map(o=>o.option_text)}))}});if(!tr.error&&tr.data?.items?.length){parsedHi=parsed.map((x,i)=>({question:tr.data.items[i]?.question||x.question,options:x.options.map((o,j)=>({...o,option_text:tr.data.items[i]?.options?.[j]||o.option_text}))}));setMessage('Hindi translation generated. Creating test…')}else setMessage('Hindi translation unavailable — creating the English test.');}catch{setMessage('Hindi translation unavailable — creating the English test.');}}
  if(!title.trim()){setMessage('Add a test title first.');setBusy(false);return}
  const credit=await charge('quiz_creation','Created quiz: '+title.trim(),{title:title.trim()});
  if(credit.error||!credit.data?.ok){setMessage(credit.error?.message||credit.data?.error||'Not enough credits.');setBusy(false);return}
  const{data:test,error}=await supabase.from('test_series').insert({playlist_id:standalone?null:courseId,team_id:team.id,title:title.trim(),description:desc.trim()||null,time_limit_minutes:minutes?Number(minutes):null,points_per_question:Number(points)||10,default_language:defaultLanguage,max_reattempts:Number(maxReattempts)||0,created_by:user?.id,ai_generated:false,question_count:parsed.length}).select().single();
  if(error){setMessage(error.message);setBusy(false);return}
  for(let i=0;i<parsed.length;i++){
   const{data:q,error:qe}=await supabase.from('test_questions').insert({test_id:test.id,position:i,question:parsed[i].question,question_hi:parsedHi[i]?.question||null}).select().single();
   if(qe){setMessage(qe.message);setBusy(false);return}
   const{error:oe}=await supabase.from('test_options').insert(parsed[i].options.map((o,idx)=>({...o,question_id:q.id,option_text_hi:parsedHi[i]?.options?.[idx]?.option_text||null})));
   if(oe){setMessage(oe.message);setBusy(false);return}
  }
  setTitle('');setDesc('');setRaw('');setRawHi('');setMinutes('30');setDefaultLanguage('en');setMaxReattempts(0);setMode(null);
  setMessage(parsed.length+' questions imported successfully.');toast(parsed.length+' questions imported successfully.','success','Quiz created');await load();setBusy(false);
 }
 async function createAiTest(){
  setMessage('');
  if(!title.trim())return setMessage('Add a test title.');
  if(!prompt.trim())return setMessage('Tell AI what the test should cover and how it should assess learners.');
  if(!topics.trim())return setMessage('Add the topics to cover.');
  const count=Math.max(1,Math.min(50,Number(questionCount)||10));
  if(count>30)return setMessage('For reliable generation, keep one AI test to 30 questions or fewer.');
  const credit=await charge('quiz_creation','Created AI quiz: '+title.trim(),{title:title.trim(),ai_generated:true});
  if(credit.error||!credit.data?.ok)return setMessage(credit.error?.message||credit.data?.error||'Not enough credits.');
  setBusy(true);setMessage('AI is creating your assessment…');
  const{data,error}=await supabase.functions.invoke('generate-ai-test',{body:{
   team_id:team?.id,playlist_id:standalone?null:courseId,title:title.trim(),description:desc.trim(),prompt:prompt.trim(),
   topics:topics.split(',').map(x=>x.trim()).filter(Boolean),question_count:count,time_limit_minutes:minutes?Number(minutes):null,
   points_per_question:Number(points)||10,default_language:defaultLanguage,max_reattempts:Number(maxReattempts)||0,difficulty
  }});
  if(error||data?.error){
   let serverMessage=data?.error||'';
   try{if(error?.context){const body=await error.context.clone().json();serverMessage=body?.error||serverMessage}}catch{}
   const msg=serverMessage||error?.message||'AI test generation failed.';
   setMessage(msg);toast(msg,'error','AI test failed');setBusy(false);return
  }
  setTitle('');setDesc('');setPrompt('');setTopics('');setMinutes('30');setPoints(10);setDefaultLanguage('en');setMaxReattempts(0);setQuestionCount(10);setDifficulty('medium');setMode(false);
  setMessage('AI created '+data.question_count+' questions. English/Hindi versions are ready for learners.');
  toast('AI test created with '+data.question_count+' questions.','success','AI Test created');await load();setBusy(false);
 }

 async function showHistory(t){const{data,error}=await supabase.rpc('get_test_attempt_history',{p_test_id:t.id});if(error)setMessage(error.message);else{setHistory(data||[]);setHistoryTest(t)}}
 async function remove(id){if(!confirm('Delete this test and all questions and attempts?'))return;const{error}=await supabase.from('test_series').delete().eq('id',id);if(error){setMessage(error.message);toast(error.message,'error','Could not delete quiz')}else{toast('The quiz and its questions were removed.','success','Quiz deleted');load()}} 
 return <section className="test-series-panel section">
  <div className="test-series-head"><div><p className="eyebrow">ASSESSMENTS</p><h2>{standalone?'Quizzes':'Test Series'}</h2><p className="muted">Create assessments with AI or paste ready-made MCQs.</p></div>{admin&&<div className="test-builder-actions"><button onClick={()=>setMode('paste')}>✨ Paste & auto-create · {cost('quiz_creation')} Credits</button><button className="ghost" onClick={()=>setMode('ai')}>✦ Create AI Test · {cost('quiz_creation')} Credits</button></div>}</div>
  {message&&<div className="notice">{message}</div>}
  {mode&&<div className={'test-builder '+(mode==='ai'?'ai-test-builder':'')}><div className="test-builder-top"><div><p className="eyebrow">{mode==='ai'?'AI ASSESSMENT BUILDER':'AI-FRIENDLY IMPORT'}</p><h3>{mode==='ai'?'Tell AI what to test':'Paste your ChatGPT MCQs'}</h3><p className="muted">{mode==='ai'?'AI will generate the complete MCQ test from your instructions.':'Keep the existing Q1 + A/B/C/D + Answer format. Hindi is generated automatically.'}</p></div><button className="ghost" onClick={()=>setMode(null)}>Close</button></div>
   <div className="test-builder-grid">
    <label>Test title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="ML Fundamentals — Test 1"/></label>
    {mode==='ai'?<label>Questions<input type="number" min="1" max="30" value={questionCount} onChange={e=>setQuestionCount(e.target.value)}/></label>:<label>Time limit<input type="number" min="1" max="180" value={minutes} onChange={e=>setMinutes(e.target.value)} placeholder="Optional minutes"/></label>}
    {mode==='ai'?<label className="wide">Topics to cover<textarea value={topics} onChange={e=>setTopics(e.target.value)} placeholder="Supervised learning, regression, classification, overfitting"/></label>:<label>Default language<select value={defaultLanguage} onChange={e=>setDefaultLanguage(e.target.value)}><option value="en">English</option><option value="hi">Hindi</option></select></label>}
    {mode==='ai'?<label className="wide">AI instructions / exam prompt<textarea className="ai-prompt-input" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Create an exam-focused assessment. Test concepts, applications and common misconceptions. Avoid trivia."/></label>:<label>Points / question<input type="number" min="1" max="100" value={points} onChange={e=>setPoints(e.target.value)}/></label>}
    {mode==='paste'&&<><label>Reattempts allowed<input type="number" min="0" max="20" value={maxReattempts} onChange={e=>setMaxReattempts(e.target.value)}/><span className="muted">0 = one attempt total</span></label><label className="wide">Description<input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What will this test assess?"/></label></>}
    {mode==='ai'?<><label>Difficulty<select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><label>Time limit (minutes)<input type="number" min="1" max="180" value={minutes} onChange={e=>setMinutes(e.target.value)}/></label><label>Points / question<input type="number" min="1" max="100" value={points} onChange={e=>setPoints(e.target.value)}/></label><label>Reattempts allowed<input type="number" min="0" max="20" value={maxReattempts} onChange={e=>setMaxReattempts(e.target.value)}/><span className="muted">0 = one attempt total</span></label><label>Question language<select value={defaultLanguage} onChange={e=>setDefaultLanguage(e.target.value)}><option value="en">English</option><option value="hi">Hindi + English source</option><option value="bilingual">English + Hindi</option></select></label><label className="wide">Description<input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What will this test assess?"/></label></>:<><label className="wide">English MCQs<textarea value={raw} onChange={e=>setRaw(e.target.value)} placeholder={'Q1. What is supervised learning?\n\nA. Learning without data\nB. Learning from labelled data\nC. Random learning\nD. No model\n\nAnswer: B'}/></label><label className="wide">Hindi version <span className="muted">(optional — auto-translated if left empty)</span><textarea value={rawHi} onChange={e=>setRawHi(e.target.value)} placeholder="Paste Hindi MCQs if you want exact wording; otherwise AI translation will be generated."/></label></>}
    {mode==='ai'&&<div className="ai-test-features wide"><div><b>✦ AI generated</b><span>Exactly the requested number of MCQs</span></div><div><b>🌐 Translation ready</b><span>English + Hindi support</span></div><div><b>⏱ Exam controls</b><span>Timer, reattempts and auto-submit</span></div><div><b>📊 Analytics</b><span>Leaderboard and attempt history</span></div></div>}
   </div><div className="form-actions"><button onClick={mode==='ai'?createAiTest:createPasteTest} disabled={busy}>{busy?'Creating…':mode==='ai'?'✨ Generate complete test':'Parse & create test'}</button></div></div>}
  <div className="test-list">{tests.map((t,i)=><article className="test-card" key={t.id}><div className="test-index">{String(i+1).padStart(2,'0')}</div><div className="grow"><h3>{t.title}</h3><p>{t.description||'AI-generated assessment'}</p><div className="test-meta"><span>⏱ {t.time_limit_minutes?t.time_limit_minutes+' min':'No limit'}</span><span>✦ {t.points_per_question} pts/question</span><span>◈ {t.question_count||'—'} questions</span><span>↻ {t.max_reattempts} reattempt{t.max_reattempts===1?'':'s'}</span>{t.ai_generated&&<span>✨ AI</span>}</div></div><div className="test-card-actions"><button onClick={()=>onStart(t.id)}>Start test →</button><button className="ghost" onClick={async()=>{const{data}=await supabase.rpc('get_test_leaderboard',{p_test_id:t.id});setLeaderboard(data||[]);setLeaderboardTest(t)}}>Leaderboard</button>{admin&&<button className="ghost" onClick={()=>showHistory(t)}>History</button>}{admin&&<button className="danger ghost" onClick={()=>remove(t.id)}>Delete</button>}</div></article>)}{!tests.length&&<div className="test-empty"><b>No tests yet</b><span>Admins can paste ready-made MCQs or create a complete assessment with AI.</span></div>}</div>
  {historyTest&&<div className="test-modal-backdrop" onClick={()=>setHistoryTest(null)}><div className="test-leaderboard-modal test-history-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">ADMIN ANALYTICS</p><h3>{historyTest.title}</h3><span>{history.length} submitted attempts</span></div><button className="modal-close" onClick={()=>setHistoryTest(null)}>×</button></div><div className="modal-leaderboard">{history.map((x,i)=><div className="history-row" key={x.attempt_id}><span className="modal-rank">{i+1}</span><div className="grow"><b>{x.display_name}</b><small>{x.correct_count}/{x.total_questions} correct · {x.percentage}% accuracy</small></div><div><strong>{x.duration_seconds?Math.floor(x.duration_seconds/60)+'m '+x.duration_seconds%60+'s':'—'}</strong><small>{x.average_time_per_question||0}s/question</small></div><span className="history-score">{x.score} pts</span></div>)}{!history.length&&<div className="modal-empty"><span>📊</span><b>No completed attempts</b><small>Attempt history will appear here after learners submit.</small></div>}</div></div></div>}
  {leaderboardTest&&<div className="test-modal-backdrop" onClick={()=>setLeaderboardTest(null)}><div className="test-leaderboard-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">TEAM RESULTS</p><h3>{leaderboardTest.title}</h3><span>{(leaderboard||[]).length} submitted attempts</span></div><button className="modal-close" onClick={()=>setLeaderboardTest(null)}>×</button></div><div className="modal-leaderboard">{(leaderboard||[]).map((x,i)=><div className="modal-leader-row" key={x.user_id}><span className="modal-rank">{i+1}</span><span className="modal-avatar">{(x.display_name||'?')[0].toUpperCase()}</span><div className="grow"><b>{x.display_name}</b><small>{x.correct_count}/{x.total_questions} correct · {x.score} pts</small></div><strong>{x.percentage}%</strong></div>)}{!leaderboard?.length&&<div className="modal-empty"><span>🏆</span><b>No attempts yet</b><small>Once learners complete this test, their results will appear here.</small></div>}</div></div></div>}
 </section>
}
