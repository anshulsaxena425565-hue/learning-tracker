import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

function apiError(body:any,status:number){
  return {
    ok:false,
    error:String(body?.message||body?.error?.message||body?.error_description||body?.error||body?.type||"Cashfree rejected the order."),
    error_code:body?.code||body?.error_code||body?.error?.code||null,
    cashfree_http_status:status,
  };
}

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

    const body=await req.json();
    const planId=String(body?.plan_id||"");
    const phone=String(body?.customer_phone||"").replace(/\D/g,"");
    if(!planId)return json({ok:false,error:"Credit plan is required."},400);
    if(!/^\d{10}$/.test(phone))return json({ok:false,error:"Please enter a valid 10-digit mobile number."},400);

    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {data:plan,error:planError}=await admin.from("credit_plans").select("id,name,credits,price_inr,bonus_credits,active").eq("id",planId).eq("active",true).single();
    if(planError||!plan)return json({ok:false,error:"Credit plan is unavailable."},400);

    const amount=Number(plan.price_inr);
    if(!Number.isFinite(amount)||amount<=0)return json({ok:false,error:"Invalid plan price."},400);

    const clientId=Deno.env.get("CASHFREE_CLIENT_ID");
    const clientSecret=Deno.env.get("CASHFREE_CLIENT_SECRET");
    if(!clientId||!clientSecret){
      console.error("Cashfree credentials missing",{has_client_id:Boolean(clientId),has_client_secret:Boolean(clientSecret)});
      return json({ok:false,error:"Cashfree payment gateway is not configured.",error_code:"CASHFREE_CREDENTIALS_MISSING"},200);
    }

    const baseUrl=Deno.env.get("APP_BASE_URL")||"https://learningbeyond.online";
    const requested=String(Deno.env.get("CASHFREE_ENV")||"").toLowerCase();
    const environments=requested==="sandbox"?["sandbox"]:requested==="production"?["production"]:["production","sandbox"];
    const orderId="LB_"+crypto.randomUUID().replaceAll("-","");
    let lastError:any=null;

    for(const environment of environments){
      const apiBase=environment==="production"?"https://api.cashfree.com/pg":"https://sandbox.cashfree.com/pg";
      const response=await fetch(apiBase+"/orders",{
        method:"POST",
        headers:{
          "x-client-id":clientId,
          "x-client-secret":clientSecret,
          "x-api-version":"2025-01-01",
          "Content-Type":"application/json",
          "Accept":"application/json"
        },
        body:JSON.stringify({
          order_id:orderId,
          order_amount:amount,
          order_currency:"INR",
          customer_details:{
            customer_id:user.id,
            customer_email:user.email||undefined,
            customer_phone:phone
          },
          order_meta:{
            return_url:baseUrl+"/?cashfree_order_id={order_id}"
          },
          order_note:"LearningBeyond Credit Pack"
        })
      });
      const result=await response.json().catch(()=>({}));

      if(response.ok){
        if(!result?.payment_session_id)
          return json({ok:false,error:"Cashfree did not return a payment session.",error_code:"PAYMENT_SESSION_MISSING",environment},200);

        const {error:insertError}=await admin.from("credit_payment_orders").insert({
          user_id:user.id,
          credit_plan_id:plan.id,
          cashfree_order_id:orderId,
          cashfree_payment_session_id:result.payment_session_id,
          amount_paise:Math.round(amount*100),
          currency:"INR",
          credits:plan.credits,
          bonus_credits:plan.bonus_credits,
          status:"created",
          metadata:{customer_phone:phone,environment}
        });

        if(insertError){
          console.error("Payment order persistence failed",{order_id:orderId,message:insertError.message});
          return json({ok:false,error:"Unable to save payment order. Please try again.",error_code:"PAYMENT_ORDER_SAVE_FAILED"},200);
        }

        return json({
          ok:true,
          order_id:orderId,
          payment_session_id:result.payment_session_id,
          amount:Math.round(amount*100),
          currency:"INR",
          plan_name:plan.name,
          credits:plan.credits,
          bonus_credits:plan.bonus_credits,
          environment
        });
      }

      lastError=apiError(result,response.status);
      console.error("Cashfree order creation failed",{order_id:orderId,environment,http_status:response.status,error_code:lastError.error_code,error:lastError.error});

      if(requested||![401,403].includes(response.status))break;
    }

    return json(lastError||{ok:false,error:"Unable to create Cashfree payment order.",error_code:"CASHFREE_ORDER_FAILED"},200);
  }catch(e){
    console.error("create-credit-payment-order failed",e);
    return json({ok:false,error:e instanceof Error?e.message:"Unable to create payment order.",error_code:"CREATE_PAYMENT_ORDER_FAILED"},200);
  }
});