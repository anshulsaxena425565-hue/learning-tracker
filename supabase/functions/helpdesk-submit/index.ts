import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
 const auth=req.headers.get("Authorization");
 if(!auth?.startsWith("Bearer "))return json({ok:false,error:"Please sign in to contact support."},401);
 const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!service)return json({ok:false,error:"Support service is not configured."},503);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
 const {data:userResult,error:userError}=await userClient.auth.getUser();
 if(userError||!userResult.user)return json({ok:false,error:"Please sign in again."},401);
 let body:any;try{body=await req.json()}catch{return json({ok:false,error:"Invalid request."},400)}
 const sender_email=String(body.sender_email||"").trim().slice(0,254),sender_name=String(body.sender_name||"").trim().slice(0,120),subject=String(body.subject||"LearningBeyond Help Desk").trim().slice(0,160),message=String(body.message||"").trim().slice(0,6000),team_name=String(body.team_name||"").trim().slice(0,120);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender_email)||message.length<5)return json({ok:false,error:"Enter a valid email and a message of at least 5 characters."},400);
 if(/https?:\/\/|<script|javascript:/i.test(message)) { /* keep content as text; no HTML rendering */ }
 const admin=createClient(url,service,{auth:{persistSession:false}});
 const {data:row,error:insertError}=await admin.from("helpdesk_messages").insert({user_id:userResult.user.id,sender_email,sender_name,subject,message,email_status:"pending"}).select("id").single();
 if(insertError)return json({ok:false,error:"We could not save your message. Please try again."},500);
 const apiKey=Deno.env.get("RESEND_API_KEY");
 if(!apiKey)return json({ok:false,error:"Message saved, but email delivery is not configured yet. Please email anshulsaxena425565@gmail.com directly.",ticket_id:row.id},503);
 const safe=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 const html="<h2>LearningBeyond Help Desk message</h2><p><b>From:</b> "+safe(sender_name||"Not provided")+" &lt;"+safe(sender_email)+"&gt;</p><p><b>User ID:</b> "+safe(userResult.user.id)+"</p><p><b>Team:</b> "+safe(team_name||"Not selected")+"</p><p><b>Subject:</b> "+safe(subject)+"</p><hr/><div style=\"white-space:pre-wrap\">"+safe(message)+"</div><p>Ticket: "+safe(row.id)+"</p>";
 const sent=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json"},body:JSON.stringify({from:Deno.env.get("HELPDESK_FROM_EMAIL")||"LearningBeyond Support <onboarding@resend.dev>",to:["anshulsaxena425565@gmail.com"],reply_to:sender_email,subject:"[LearningBeyond Help Desk] "+subject,html})});
 if(!sent.ok){await admin.from("helpdesk_messages").update({email_status:"failed"}).eq("id",row.id);return json({ok:false,error:"Message was saved, but email delivery failed. Please email support directly.",ticket_id:row.id},502)}
 await admin.from("helpdesk_messages").update({email_status:"sent"}).eq("id",row.id);
 return json({ok:true,ticket_id:row.id});
});
