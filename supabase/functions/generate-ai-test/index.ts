import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!;
const key=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY")!;
const geminiKey=Deno.env.get("GEMINI_API_KEY")!;
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const out=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization"); if(!auth?.startsWith("Bearer "))return out({error:"Authentication required."},401);
  const db=createClient(url,key,{auth:{persistSession:false},global:{headers:{Authorization:auth}}});
  const {data:{user}}=await db.auth.getUser(); if(!user)return out({error:"Invalid session."},401);
  const b=await req.json();
  const {team_id,playlist_id,title,description,prompt,topics,question_count,time_limit_minutes,points_per_question,default_language,max_reattempts,difficulty}=b;
  if(!team_id||!title?.trim()||!prompt?.trim())return out({error:"Title, team and AI instructions are required."},400);
  const count=Math.max(1,Math.min(30,Number(question_count)||10));
  const lang=["en","hi","bilingual"].includes(default_language)?default_language:"en";
  const diff=["easy","medium","hard"].includes(difficulty)?difficulty:"medium";
  const {data:m,error:me}=await db.from("team_members").select("role").eq("team_id",team_id).eq("user_id",user.id).maybeSingle();
  if(me)return out({error:me.message},500);
  if(!m||!["owner","admin"].includes(m.role))return out({error:"Admin access required."},403);
  if(playlist_id){const {data:p}=await db.from("playlists").select("team_id").eq("id",playlist_id).maybeSingle();if(!p||p.team_id!==team_id)return out({error:"Course does not belong to this team."},400);}
  const topicText=Array.isArray(topics)?topics.filter(Boolean).join(", "):String(topics||"");
  const promptText=`Create an academic MCQ assessment for LearningBeyond.
Title: ${title.trim()}
Topics: ${topicText}
Difficulty: ${diff}
Questions: exactly ${count}
Language: ${lang}
Instructions: ${prompt.trim()}
Return ONLY valid JSON with questions. Each question must have question, question_hi, explanation, explanation_hi and exactly four options. Each option must have text, text_hi and correct. Exactly one option is correct.`;
  const ai=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":geminiKey},body:JSON.stringify({contents:[{role:"user",parts:[{text:promptText}]}],generationConfig:{responseMimeType:"application/json",thinkingConfig:{thinkingLevel:"low"}}})});
  const p=await ai.json();
  if(!ai.ok)return out({error:p?.error?.message||`Gemini request failed (${ai.status}).`},502);
  const text=p?.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("")||"";
  if(!text)return out({error:p?.promptFeedback?.blockReason||"Gemini returned no quiz."},502);
  let result:any;try{result=JSON.parse(text)}catch{return out({error:"Gemini returned invalid quiz JSON. Please try again."},502)}
  const qs=Array.isArray(result?.questions)?result.questions:[];
  if(qs.length!==count)return out({error:`AI generated ${qs.length} questions instead of ${count}.`},502);
  const {data:test,error:te}=await db.from("test_series").insert({playlist_id:playlist_id||null,team_id,title:title.trim(),description:description?.trim()||null,time_limit_minutes:time_limit_minutes?Number(time_limit_minutes):null,points_per_question:Number(points_per_question)||10,default_language:lang==="bilingual"?"en":lang,max_reattempts:Number(max_reattempts)||0,created_by:user.id,ai_prompt:prompt.trim(),difficulty:diff,question_count:count,ai_generated:true,published:true}).select().single();
  if(te)throw te;
  for(let i=0;i<qs.length;i++){
   const q=qs[i],opts=Array.isArray(q.options)?q.options.slice(0,4):[];
   if(opts.length!==4||opts.filter((o:any)=>o?.correct===true).length!==1)throw new Error("Invalid AI option set for question "+(i+1));
   const {data:qq,error:qe}=await db.from("test_questions").insert({test_id:test.id,position:i,question:String(q.question||""),question_hi:lang==="en"?null:String(q.question_hi||q.question||""),explanation:String(q.explanation||""),explanation_hi:lang==="en"?null:String(q.explanation_hi||q.explanation||"")}).select().single();
   if(qe)throw qe;
   const {error:oe}=await db.from("test_options").insert(opts.map((o:any,j:number)=>({question_id:qq.id,position:j,option_text:String(o.text||""),is_correct:!!o.correct,option_text_hi:lang==="en"?null:String(o.text_hi||o.text||"")})));
   if(oe)throw oe;
  }
  return out({ok:true,test_id:test.id,question_count:qs.length});
 }catch(e){console.error(e);return out({error:e instanceof Error?e.message:"AI test generation failed."},500)}
});