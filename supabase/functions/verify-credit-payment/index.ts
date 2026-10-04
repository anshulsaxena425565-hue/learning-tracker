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

    const { cashfree_order_id } = await req.json();
    if (!cashfree_order_id) throw new Error("Payment order ID is missing.");

    const clientId = Deno.env.get("CASHFREE_CLIENT_ID");
    const clientSecret = Deno.env.get("CASHFREE_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("Cashfree payment gateway is not configured.");

    const apiBase = Deno.env.get("CASHFREE_ENV") === "production"
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";

    const headers = {
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
      "x-api-version": "2025-01-01",
      "Accept": "application/json",
    };

    const orderResponse = await fetch(apiBase + "/orders/" + encodeURIComponent(cashfree_order_id), { headers });
    const order = await orderResponse.json();
    if (!orderResponse.ok) throw new Error(order?.message || "Unable to fetch Cashfree order.");

    const paymentsResponse = await fetch(
      apiBase + "/orders/" + encodeURIComponent(cashfree_order_id) + "/payments",
      { headers }
    );
    const payments = await paymentsResponse.json();
    if (!paymentsResponse.ok) throw new Error(payments?.message || "Unable to fetch Cashfree payment status.");

    const successful = Array.isArray(payments)
      ? payments.find((p) => p.payment_status === "SUCCESS")
      : null;

    if (!successful) {
      const pending = Array.isArray(payments) && payments.some((p) => p.payment_status === "PENDING");
      return new Response(JSON.stringify({
        ok: false,
        status: pending ? "PENDING" : (order.order_status || "FAILED"),
        error: pending ? "Payment is still being confirmed." : "Payment was not successful.",
      }), { status: 400, headers: cors });
    }

    const { data, error } = await sb.rpc("complete_credit_purchase", {
      p_cashfree_order_id: cashfree_order_id,
      p_cashfree_payment_id: successful.cf_payment_id || successful.payment_id || successful.cf_payment_id,
    });

    if (error || !data?.ok) {
      throw new Error(error?.message || data?.error || "Unable to complete purchase.");
    }

    return new Response(JSON.stringify({
      ...data,
      payment_status: "SUCCESS",
      order_status: order.order_status,
    }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: e?.message || "Payment verification failed.",
    }), { status: 400, headers: cors });
  }
});