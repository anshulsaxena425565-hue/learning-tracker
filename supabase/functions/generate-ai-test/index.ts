
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url=Deno.env.get("SUPABASE_URL")!;
const publishableKey=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const geminiKey=Deno.env.get("GEMINI_API_KEY")!;
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});

function schemaFor(needHindi:boolean){
  const option=needHindi
    ? {type:"object",properties:{text:{type:"string"},text_hi:{type:"string"},correct:{type:"boolean"}},required:["text","text_hi","correct"]}
    : {type:"object",properties:{text:{type:"string"},correct:{type:"boolean"}},required:["text","correct"]};
  const question=needHindi
    ? {type:"object",properties:{question:{type:"string"},question_hi:{type:"string"},explanation:{type:"string"},explanation_hi:{type:"string"},options:{type:"array",items:option}},required:["question","question_hi","explanation","explanation_hi","options"]}
    : {type:"object",properties:{question:{type:"string"},explanation:{type:"string"},options:{type:"array",items:option}},required:["question","explanation","options"]};
  return {type:"object",properties:{questions:{type:"array",items:question}},required:["questions"]};
}

const parseModelJson=(raw:string)=>JSON.parse(String(raw||"").trim());

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  let createdTestId:string|null=null;
  try{
    const auth=req.headers.get("Authorization");
    if(!auth?.startsWith("Bearer "))return out({error:"Authentication required."},401);

    const db=createClient(url,publishableKey,{auth:{persistSession:false},global:{headers:{Authorization:auth}}});
    const admin=createClient(url,serviceKey,{auth:{persistSession:false}});

    const {data:{user},error:authError}=await db.auth.getUser();
    if(authError||!user)return out({error:"Invalid session."},401);

    const b=await req.json();
    const {team_id,playlist_id,title,description,prompt,topics,question_count,time_limit_minutes,points_per_question,default_language,max_reattempts,difficulty}=b;

    if(!team_id||!String(title||"").trim()||!String(prompt||"").trim())
      return out({error:"Title, team and AI instructions are required."},400);

    const count=Math.max(1,Math.min(30,Number(question_count)||10));
    const lang=["en","hi","bilingual"].includes(default_language)?default_language:"en";
    const diff=["easy","medium","hard"].includes(difficulty)?difficulty:"medium";
    const needHindi=lang!=="en";
    const topicText=Array.isArray(topics)?topics.filter(Boolean).join(", "):String(topics||"");
    if(!topicText.trim())return out({error:"At least one topic is required."},400);

    const {data:m,error:me}=await db.from("team_members").select("role").eq("team_id",team_id).eq("user_id",user.id).maybeSingle();
    if(me)return out({error:me.message},500);
    if(!m||!["owner","admin"].includes(m.role))return out({error:"Admin access required."},403);

    if(playlist_id){
      const {data:p}=await db.from("playlists").select("team_id").eq("id",playlist_id).maybeSingle();
      if(!p||p.team_id!==team_id)return out({error:"Course does not belong to this team."},400);
    }

    const chunkSize=5;
    const chunks=Math.ceil(count/chunkSize);
    const models=["gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash-lite","gemini-2.5-flash"];

    async function generateChunk(chunkIndex:number,chunkCount:number){
      const start=chunkIndex*chunkSize+1;
      const end=start+chunkCount-1;
      const promptText=
        "Create exactly "+chunkCount+" high-quality academic MCQs for a LearningBeyond assessment.\n"+
        "Overall assessment title: "+String(title).trim()+"\n"+
        "Topics: "+topicText+"\n"+
        "Difficulty: "+diff+"\n"+
        "Requested total questions: "+count+"\n"+
        "This is generation batch "+(chunkIndex+1)+" of "+chunks+". Generate questions "+start+"-"+end+".\n"+
        "Instructions: "+String(prompt).trim()+"\n"+
        (needHindi
          ? "Write every question and explanation in clear English AND accurate natural Hindi. Each option needs both English and Hindi text.\n"
          : "Generate English only. Do not add Hindi fields.\n")+
        "Rules:\n- Output exactly "+chunkCount+" questions.\n- Every question must have exactly 4 options.\n- Exactly ONE option per question is correct.\n- Avoid duplicates, trivia, trick wording, and ambiguous answers.\n- Make questions exam-focused and materially different from one another.\n"+
        "Return ONLY JSON matching the provided schema.";

      let lastError="Unable to generate batch "+(chunkIndex+1)+".";
      let capacityFailure=false;
      for(const model of models){
        for(let attempt=0;attempt<3;attempt++){
          const controller=new AbortController();
          const timer=setTimeout(()=>controller.abort(),25000);
          try{
            const response=await fetch(
              "https://generativelanguage.googleapis.com/v1beta/interactions",
              {
                method:"POST",
                signal:controller.signal,
                headers:{"Content-Type":"application/json","x-goog-api-key":geminiKey},
                body:JSON.stringify({
                  model,
                  input:promptText,
                  response_format:{
                    type:"text",
                    mime_type:"application/json",
                    schema:schemaFor(needHindi)
                  }
                })
              }
            );
            const payload=await response.json().catch(()=>({}));
            if(!response.ok){
              lastError=payload?.error?.message||("Gemini HTTP "+response.status);
              
              if([408,429,500,502,503,504].includes(response.status)){
                capacityFailure=true;
                const retryAfter=Number(response.headers.get("retry-after")||0);
                const wait=Math.min(12000,retryAfter>0?retryAfter*1000:1500*Math.pow(2,attempt));
                await new Promise(r=>setTimeout(r,wait));
                continue;
              }
              break;
            }

            const raw=payload?.output_text
              ||payload?.steps?.filter((s:any)=>s.type==="model_output")
                .flatMap((s:any)=>s.content||[])
                .filter((x:any)=>x.type==="text")
                .map((x:any)=>x.text||"").join("")
              ||payload?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")
              ||"";

            if(!raw){
              lastError="Gemini returned no quiz output for batch "+(chunkIndex+1)+".";
              continue;
            }

            let parsed:any;
            try{parsed=parseModelJson(raw)}catch(parseError){
              lastError="Gemini returned invalid JSON for batch "+(chunkIndex+1)+".";
              
              continue;
            }

            const qs=Array.isArray(parsed?.questions)?parsed.questions:[];
            if(qs.length!==chunkCount){
              lastError="Gemini returned "+qs.length+" questions for batch "+(chunkIndex+1)+"; expected "+chunkCount+".";
              
              continue;
            }
            return qs;
          }catch(e){
            lastError=e instanceof Error?e.message:String(e);
            
          }finally{
            clearTimeout(timer);
          }
        }
        if(capacityFailure)await new Promise(r=>setTimeout(r,1000));
      }
      throw new Error(lastError || ("Unable to generate batch "+(chunkIndex+1)+"."));
    }

    const allQuestions:any[]=[];
    const jobs=Array.from({length:chunks},(_,i)=>({index:i,size:Math.min(chunkSize,count-i*chunkSize)}));
    for(const job of jobs){
      const qs=await generateChunk(job.index,job.size);
      allQuestions.push(...qs);
    }

    if(allQuestions.length!==count)
      return out({error:"AI generated "+allQuestions.length+" questions instead of "+count+". Please try again."},502);

    const seen=new Set<string>();
    for(let i=0;i<allQuestions.length;i++){
      const q=allQuestions[i];
      const qText=String(q?.question||"").trim();
      const key=qText.toLowerCase().replace(/\s+/g," ");
      const opts=Array.isArray(q?.options)?q.options:[];
      if(!qText||seen.has(key))throw new Error("Invalid or duplicate question "+(i+1)+".");
      seen.add(key);
      if(opts.length!==4)throw new Error("Question "+(i+1)+" does not have exactly 4 options.");
      if(opts.filter((o:any)=>o?.correct===true).length!==1)throw new Error("Question "+(i+1)+" must have exactly one correct option.");
      if(needHindi){
        if(!String(q?.question_hi||"").trim()||!String(q?.explanation_hi||"").trim())throw new Error("Hindi content is incomplete for question "+(i+1)+".");
        if(opts.some((o:any)=>!String(o?.text||"").trim()||!String(o?.text_hi||"").trim()))throw new Error("Hindi option content is incomplete for question "+(i+1)+".");
      }else if(!String(q?.explanation||"").trim()||opts.some((o:any)=>!String(o?.text||"").trim())){
        throw new Error("Question "+(i+1)+" is incomplete.");
      }
    }

    const {data:test,error:te}=await admin.from("test_series").insert({
      playlist_id:playlist_id||null,
      team_id,
      title:String(title).trim(),
      description:String(description||"").trim()||null,
      time_limit_minutes:time_limit_minutes?Number(time_limit_minutes):null,
      points_per_question:Number(points_per_question)||10,
      default_language:lang==="bilingual"?"en":lang,
      max_reattempts:Number(max_reattempts)||0,
      created_by:user.id,
      ai_prompt:String(prompt).trim(),
      difficulty:diff,
      question_count:count,
      ai_generated:true,
      published:true
    }).select().single();
    if(te)throw te;
    createdTestId=test.id;

    for(let i=0;i<allQuestions.length;i++){
      const q=allQuestions[i];
      const {data:qq,error:qe}=await admin.from("test_questions").insert({
        test_id:test.id,
        position:i,
        question:String(q.question).trim(),
        question_hi:needHindi?String(q.question_hi).trim():null,
        explanation:String(q.explanation).trim(),
        explanation_hi:needHindi?String(q.explanation_hi).trim():null
      }).select().single();
      if(qe)throw qe;

      const {error:oe}=await admin.from("test_options").insert(
        q.options.map((o:any,j:number)=>({
          question_id:qq.id,
          position:j,
          option_text:String(o.text).trim(),
          is_correct:o.correct===true,
          option_text_hi:needHindi?String(o.text_hi).trim():null
        }))
      );
      if(oe)throw oe;
    }

    return out({ok:true,test_id:test.id,question_count:allQuestions.length,requested_count:count});
  }catch(e){
    if(createdTestId){
      try{
        await admin.from("test_series").delete().eq("id",createdTestId);
      }catch(cleanupError){
        console.error("AI quiz cleanup failed",cleanupError);
      }
    }
    console.error("AI test generation failed",e);
    return out({error:e instanceof Error?e.message:"AI test generation failed."},500);
  }
});
