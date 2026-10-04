import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const auth=req.headers.get("Authorization");
    if(!auth?.startsWith("Bearer "))return json({ok:false,error:"Not authenticated."},401);

    const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{
      auth:{persistSession:false},
      global:{headers:{Authorization:auth}}
    });
    const {data:{user},error:authError}=await sb.auth.getUser();
    if(authError||!user)return json({ok:false,error:"Invalid session."},401);

    const {cashfree_order_id}=await req.json();
    if(!cashfree_order_id)return json({ok:false,error:"Payment order ID is missing."},400);

    const clientId=Deno.env.get("CASHFREE_CLIENT_ID");
    const clientSecret=Deno.env.get("CASHFREE_CLIENT_SECRET");
    if(!clientId||!clientSecret)return json({ok:false,error:"Cashfree payment gateway is not configured.",error_code:"CASHFREE_CREDENTIALS_MISSING"},200);

    const requested=String(Deno.env.get("CASHFREE_ENV")||"").toLowerCase();
    const environment=requested==="sandbox"?"sandbox":"production";
    const apiBase=environment==="production"?"https://api.cashfree.com/pg":"https://sandbox.cashfree.com/pg";
    const headers={"x-client-id":clientId,"x-client-secret":clientSecret,"x-api-version":"2025-01-01","Accept":"application/json"};

    const orderResponse=await fetch(apiBase+"/orders/"+encodeURIComponent(cashfree_order_id),{headers});
    const order=await orderResponse.json().catch(()=>({}));
    if(!orderResponse.ok)return json({ok:false,error:order?.message||order?.error?.message||"Unable to fetch Cashfree order.",error_code:order?.code||order?.error_code||null,cashfree_http_status:orderResponse.status},200);

    const paymentsResponse=await fetch(apiBase+"/orders/"+encodeURIComponent(cashfree_order_id)+"/payments",{headers});
    const payments=await paymentsResponse.json().catch(()=>[]);
    if(!paymentsResponse.ok)return json({ok:false,error:payments?.message||payments?.error?.message||"Unable to fetch Cashfree payment status.",error_code:payments?.code||payments?.error_code||null,cashfree_http_status:paymentsResponse.status},200);

    const successful=Array.isArray(payments)?payments.find((p)=>p.payment_status==="SUCCESS"):null;
    if(!successful){
      const pending=Array.isArray(payments)&&payments.some((p)=>p.payment_status==="PENDING");
      return json({ok:false,status:pending?"PENDING":(order.order_status||"FAILED"),error:pending?"Payment is still being confirmed.":"Payment was not successful."},200);
    }

    const {data,error}=await sb.rpc("complete_credit_purchase",{
      p_cashfree_order_id:cashfree_order_id,
      p_cashfree_payment_id:successful.cf_payment_id||successful.payment_id||null
    });
    if(error||!data?.ok)return json({ok:false,error:error?.message||data?.error||"Unable to complete purchase.",error_code:"CREDIT_COMPLETION_FAILED"},200);

    return json({...data,payment_status:"SUCCESS",order_status:order.order_status,environment});
  }catch(e){
    console.error("verify-credit-payment failed",e);
    return json({ok:false,error:e instanceof Error?e.message:"Payment verification failed.",error_code:"VERIFY_PAYMENT_FAILED"},200);
  }
});