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
export default function TestSeries({courseId,onStart,standalone=false}){
 const{team}=useTeam(),{user}=useAuth(),{cost}=useCredits(),admin=['owner','admin'].includes(team?.role);
 const[tests,setTests]=useState([]),[mode,setMode]=useState(false),[leaderboard,setLeaderboard]=useState(null),[leaderboardTest,setLeaderboardTest]=useState(null),[history,setHistory]=useState([]),[historyTest,setHistoryTest]=useState(null),[title,setTitle]=useState(''),[desc,setDesc]=useState(''),[prompt,setPrompt]=useState(''),[topics,setTopics]=useState(''),[minutes,setMinutes]=useState('30'),[points,setPoints]=useState(10),[defaultLanguage,setDefaultLanguage]=useState('en'),[maxReattempts,setMaxReattempts]=useState(0),[questionCount,setQuestionCount]=useState(10),[difficulty,setDifficulty]=useState('medium'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 async function load(){const{data}=await supabase.from('test_series').select('*').eq(standalone?'team_id':'playlist_id',standalone?team.id:courseId).order('created_at',{ascending:true});setTests(data||[])}
 useEffect(()=>{if(team?.id)load()},[courseId,team?.id,standalone]);

 async function createAiTest(){
  setMessage('');
  if(!title.trim())return setMessage('Add a test title.');
  if(!prompt.trim())return setMessage('Tell AI what the test should cover and how it should assess learners.');
  if(!topics.trim())return setMessage('Add the topics to cover.');
  const count=Math.max(1,Math.min(50,Number(questionCount)||10));
  if(count>30)return setMessage('For reliable generation, keep one AI test to 30 questions or fewer.');
  setBusy(true);setMessage('AI is creating your assessment…');
  const{data,error}=await supabase.functions.invoke('generate-ai-test',{body:{
   team_id:team?.id,playlist_id:standalone?null:courseId,title:title.trim(),description:desc.trim(),prompt:prompt.trim(),
   topics:topics.split(',').map(x=>x.trim()).filter(Boolean),question_count:count,time_limit_minutes:minutes?Number(minutes):null,
   points_per_question:Number(points)||10,default_language,max_reattempts:Number(maxReattempts)||0,difficulty
  }});
  if(error||data?.error){const msg=error?.message||data?.error||'AI test generation failed.';setMessage(msg);toast(msg,'error','AI test failed');setBusy(false);return}
  setTitle('');setDesc('');setPrompt('');setTopics('');setMinutes('30');setPoints(10);setDefaultLanguage('en');setMaxReattempts(0);setQuestionCount(10);setDifficulty('medium');setMode(false);
  setMessage('AI created '+data.question_count+' questions. English/Hindi versions are ready for learners.');
  toast('AI test created with '+data.question_count+' questions.','success','AI Test created');await load();setBusy(false);
 }

 async function showHistory(t){const{data,error}=await supabase.rpc('get_test_attempt_history',{p_test_id:t.id});if(error)setMessage(error.message);else{setHistory(data||[]);setHistoryTest(t)}}
 async function remove(id){if(!confirm('Delete this test and all questions and attempts?'))return;const{error}=await supabase.from('test_series').delete().eq('id',id);if(error){setMessage(error.message);toast(error.message,'error','Could not delete quiz')}else{toast('The quiz and its questions were removed.','success','Quiz deleted');load()}} 
 return <section className="test-series-panel section">
  <div className="test-series-head"><div><p className="eyebrow">ASSESSMENTS</p><h2>{standalone?'Quizzes':'Test Series'}</h2><p className="muted">Create AI-powered assessments from your learning objectives, topics and exam requirements.</p></div>{admin&&<div className="test-builder-actions"><button onClick={()=>setMode(true)}>✨ Create AI Test · {cost('quiz_creation')} Credits</button></div>}</div>
  {message&&<div className="notice">{message}</div>}
  {mode&&<div className="test-builder ai-test-builder"><div className="test-builder-top"><div><p className="eyebrow">AI ASSESSMENT BUILDER</p><h3>Tell AI what to test</h3><p className="muted">Write the learning objective and topics. AI will generate the complete MCQ test.</p></div><button className="ghost" onClick={()=>setMode(false)}>Close</button></div>
   <div className="test-builder-grid">
    <label>Test title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="ML Fundamentals — Test 1"/></label>
    <label>Questions<input type="number" min="1" max="30" value={questionCount} onChange={e=>setQuestionCount(e.target.value)}/></label>
    <label className="wide">Topics to cover<textarea value={topics} onChange={e=>setTopics(e.target.value)} placeholder="Supervised learning, regression, classification, overfitting, train/test split"/></label>
    <label className="wide">AI instructions / exam prompt<textarea className="ai-prompt-input" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Create an exam-focused assessment for beginners. Test conceptual understanding, practical application and common misconceptions. Avoid trivia. Cover all listed topics with balanced difficulty."/></label>
    <label>Difficulty<select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
    <label>Time limit (minutes)<input type="number" min="1" max="180" value={minutes} onChange={e=>setMinutes(e.target.value)} placeholder="30"/></label>
    <label>Points / question<input type="number" min="1" max="100" value={points} onChange={e=>setPoints(e.target.value)}/></label>
    <label>Reattempts allowed<input type="number" min="0" max="20" value={maxReattempts} onChange={e=>setMaxReattempts(e.target.value)}/><span className="muted">0 = one attempt total</span></label>
    <label>Question language<select value={defaultLanguage} onChange={e=>setDefaultLanguage(e.target.value)}><option value="en">English</option><option value="hi">Hindi + English source</option><option value="bilingual">English + Hindi</option></select></label>
    <label className="wide">Description<input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="What will this test assess?"/></label>
    <div className="ai-test-features wide"><div><b>✦ AI generated</b><span>Exactly the requested number of MCQs</span></div><div><b>🌐 Translation ready</b><span>Hindi questions and options are generated together</span></div><div><b>⏱ Exam controls</b><span>Timer, reattempts, points and auto-submit</span></div><div><b>📊 Analytics</b><span>Leaderboard and admin attempt history</span></div></div>
   </div>
   <div className="form-actions"><button onClick={createAiTest} disabled={busy}>{busy?'Creating with AI…':'✨ Generate complete test'}</button></div>
  </div>}
  <div className="test-list">{tests.map((t,i)=><article className="test-card" key={t.id}><div className="test-index">{String(i+1).padStart(2,'0')}</div><div className="grow"><h3>{t.title}</h3><p>{t.description||'AI-generated assessment'}</p><div className="test-meta"><span>⏱ {t.time_limit_minutes?t.time_limit_minutes+' min':'No limit'}</span><span>✦ {t.points_per_question} pts/question</span><span>◈ {t.question_count||'—'} questions</span><span>↻ {t.max_reattempts} reattempt{t.max_reattempts===1?'':'s'}</span>{t.ai_generated&&<span>✨ AI</span>}</div></div><div className="test-card-actions"><button onClick={()=>onStart(t.id)}>Start test →</button><button className="ghost" onClick={async()=>{const{data}=await supabase.rpc('get_test_leaderboard',{p_test_id:t.id});setLeaderboard(data||[]);setLeaderboardTest(t)}}>Leaderboard</button>{admin&&<button className="ghost" onClick={()=>showHistory(t)}>History</button>}{admin&&<button className="danger ghost" onClick={()=>remove(t.id)}>Delete</button>}</div></article>)}{!tests.length&&<div className="test-empty"><b>No AI tests yet</b><span>Admins can create a complete assessment by describing the topics and learning objectives.</span></div>}</div>
  {historyTest&&<div className="test-modal-backdrop" onClick={()=>setHistoryTest(null)}><div className="test-leaderboard-modal test-history-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">ADMIN ANALYTICS</p><h3>{historyTest.title}</h3><span>{history.length} submitted attempts</span></div><button className="modal-close" onClick={()=>setHistoryTest(null)}>×</button></div><div className="modal-leaderboard">{history.map((x,i)=><div className="history-row" key={x.attempt_id}><span className="modal-rank">{i+1}</span><div className="grow"><b>{x.display_name}</b><small>{x.correct_count}/{x.total_questions} correct · {x.percentage}% accuracy</small></div><div><strong>{x.duration_seconds?Math.floor(x.duration_seconds/60)+'m '+x.duration_seconds%60+'s':'—'}</strong><small>{x.average_time_per_question||0}s/question</small></div><span className="history-score">{x.score} pts</span></div>)}{!history.length&&<div className="modal-empty"><span>📊</span><b>No completed attempts</b><small>Attempt history will appear here after learners submit.</small></div>}</div></div></div>}
  {leaderboardTest&&<div className="test-modal-backdrop" onClick={()=>setLeaderboardTest(null)}><div className="test-leaderboard-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">TEAM RESULTS</p><h3>{leaderboardTest.title}</h3><span>{(leaderboard||[]).length} submitted attempts</span></div><button className="modal-close" onClick={()=>setLeaderboardTest(null)}>×</button></div><div className="modal-leaderboard">{(leaderboard||[]).map((x,i)=><div className="modal-leader-row" key={x.user_id}><span className="modal-rank">{i+1}</span><span className="modal-avatar">{(x.display_name||'?')[0].toUpperCase()}</span><div className="grow"><b>{x.display_name}</b><small>{x.correct_count}/{x.total_questions} correct · {x.score} pts</small></div><strong>{x.percentage}%</strong></div>)}{!leaderboard?.length&&<div className="modal-empty"><span>🏆</span><b>No attempts yet</b><small>Once learners complete this test, their results will appear here.</small></div>}</div></div></div>}
 </section>
}
