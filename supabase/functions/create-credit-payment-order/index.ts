import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("Not authenticated.");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );

    const { data: { user }, error: ue } = await sb.auth.getUser();
    if (ue || !user) throw new Error("Not authenticated.");

    const { plan_id, customer_phone } = await req.json();
    const phone = String(customer_phone || "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(phone)) throw new Error("Please enter a valid 10-digit mobile number.");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: plan, error: pe } = await admin
      .from("credit_plans")
      .select("id,name,credits,price_inr,bonus_credits,active")
      .eq("id", plan_id)
      .eq("active", true)
      .single();

    if (pe || !plan) throw new Error("Credit plan is unavailable.");

    const amount = Number(plan.price_inr);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid plan price.");

    const clientId = Deno.env.get("CASHFREE_CLIENT_ID");
    const clientSecret = Deno.env.get("CASHFREE_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("Cashfree payment gateway is not configured.");

    const orderId = "LB_" + crypto.randomUUID().replaceAll("-", "");
    const baseUrl = Deno.env.get("APP_BASE_URL") || "https://learningbeyond.online";
    const apiBase = Deno.env.get("CASHFREE_ENV") === "production"
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";

    const response = await fetch(apiBase + "/orders", {
      method: "POST",
      headers: {
        "x-client-id": clientId,
        "x-client-secret": clientSecret,
        "x-api-version": "2025-01-01",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: amount,
        order_currency: "INR",
        customer_details: {
          customer_id: user.id,
          customer_email: user.email || undefined,
          customer_phone: phone,
        },
        order_meta: {
          return_url: baseUrl + "/?cashfree_order_id={order_id}",
        },
        order_note: "LearningBeyond Credit Pack",
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.message || result?.error?.message || "Unable to create Cashfree payment order.");
    }

    const { error: ie } = await admin.from("credit_payment_orders").insert({
      user_id: user.id,
      credit_plan_id: plan.id,
      cashfree_order_id: orderId,
      cashfree_payment_session_id: result.payment_session_id,
      amount_paise: Math.round(amount * 100),
      currency: "INR",
      credits: plan.credits,
      bonus_credits: plan.bonus_credits,
      status: "created",
      metadata: { customer_phone: phone },
    });

    if (ie) throw new Error("Unable to save payment order.");

    return new Response(JSON.stringify({
      ok: true,
      order_id: orderId,
      payment_session_id: result.payment_session_id,
      amount: Math.round(amount * 100),
      currency: "INR",
      plan_name: plan.name,
      credits: plan.credits,
      bonus_credits: plan.bonus_credits,
      environment: Deno.env.get("CASHFREE_ENV") === "production" ? "production" : "sandbox",
    }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: e?.message || "Unable to create payment order.",
    }), { status: 400, headers: cors });
  }
});