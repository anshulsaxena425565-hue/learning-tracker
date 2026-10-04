
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url=Deno.env.get("SUPABASE_URL")!;
const publishableKey=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const geminiKey=Deno.env.get("GEMINI_API_KEY")!;
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});

function schemaFor(needHindi:boolean,count:number){
  const option:any={
    type:"OBJECT",
    properties:needHindi
      ? {text:{type:"STRING"},text_hi:{type:"STRING"},correct:{type:"BOOLEAN"}}
      : {text:{type:"STRING"},correct:{type:"BOOLEAN"}},
    required:needHindi?["text","text_hi","correct"]:["text","correct"],
    additionalProperties:false
  };
  const question:any={
    type:"OBJECT",
    properties:needHindi
      ? {
          question:{type:"STRING"},
          question_hi:{type:"STRING"},
          explanation:{type:"STRING"},
          explanation_hi:{type:"STRING"},
          options:{type:"ARRAY",minItems:4,maxItems:4,items:option}
        }
      : {
          question:{type:"STRING"},
          explanation:{type:"STRING"},
          options:{type:"ARRAY",minItems:4,maxItems:4,items:option}
        },
    required:needHindi
      ? ["question","question_hi","explanation","explanation_hi","options"]
      : ["question","explanation","options"],
    additionalProperties:false
  };
  return {
    type:"OBJECT",
    properties:{questions:{type:"ARRAY",minItems:count,maxItems:count,items:question}},
    required:["questions"],
    additionalProperties:false
  };
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
    const models=["gemini-3.8-flash","gemini-3.7-flash"];

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

      for(const model of models){
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),40000);
        try{
          const response=await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent",
            {
              method:"POST",
              signal:controller.signal,
              headers:{"Content-Type":"application/json","x-goog-api-key":geminiKey},
              body:JSON.stringify({
                contents:[{role:"user",parts:[{text:promptText}]}],
                generationConfig:{
                  responseMimeType:"application/json",
                  responseSchema:schemaFor(needHindi,chunkCount),
                  thinkingConfig:{thinkingLevel:"low"},
                  maxOutputTokens:needHindi?7000:4500
                }
              })
            }
          );
          const payload=await response.json();
          if(!response.ok){
            console.error("Gemini batch failed",JSON.stringify({model,status:response.status,payload}));
            if(![408,429,500,502,503,504].includes(response.status))break;
            continue;
          }
          const text=payload?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"";
          if(!text)throw new Error("Gemini returned an empty response.");
          const parsed=parseModelJson(text);
          const qs=Array.isArray(parsed?.questions)?parsed.questions:[];
          if(qs.length!==chunkCount)throw new Error("Gemini returned "+qs.length+" questions for batch "+(chunkIndex+1)+"; expected "+chunkCount+".");
          return qs;
        }catch(e){
          console.error("Gemini batch exception",model,e instanceof Error?e.message:String(e));
          if(model===models[models.length-1])throw e;
        }finally{
          clearTimeout(timer);
        }
      }
      throw new Error("Unable to generate batch "+(chunkIndex+1)+".");
    }

    const allQuestions:any[]=[];
    const jobs=Array.from({length:chunks},(_,i)=>({index:i,size:Math.min(chunkSize,count-i*chunkSize)}));
    for(let i=0;i<jobs.length;i+=2){
      const results=await Promise.all(jobs.slice(i,i+2).map(x=>generateChunk(x.index,x.size)));
      results.forEach(qs=>allQuestions.push(...qs));
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
