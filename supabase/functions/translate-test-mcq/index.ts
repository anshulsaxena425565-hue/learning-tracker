import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
const openAiKey = Deno.env.get("OPENAI_API_KEY") || "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function validItems(items: any[]) {
  return items.every((item) =>
    item && typeof item.question === "string" && item.question.trim() &&
    Array.isArray(item.options) && item.options.length >= 2 &&
    item.options.every((option: any) => typeof option === "string")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ error: "Use POST for translation." }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return out({ error: "Authentication required." }, 401);
    const db = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) return out({ error: "Invalid session." }, 401);

    const body = await req.json();
    const targetLanguage = body?.target_language === "hi" ? "hi" : null;
    const items = body?.items;
    if (!targetLanguage) return out({ error: "Unsupported target language." }, 400);
    if (!Array.isArray(items) || items.length < 1 || items.length > 30 || !validItems(items)) {
      return out({ error: "Provide 1–30 valid MCQs with a question and options." }, 400);
    }

    const input = items.map((item: any, index: number) => ({
      index,
      question: item.question,
      options: item.options,
      explanation: typeof item.explanation === "string" ? item.explanation : ""
    }));
    const schema = {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              explanation: { type: "string" }
            },
            required: ["question", "options", "explanation"]
          }
        }
      },
      required: ["items"]
    };
    const prompt = "Translate these academic multiple-choice questions into natural, accurate Hindi. Preserve meaning, technical terms where appropriate, the number and order of options, and the explanation. Do not answer the questions or change correctness. Return JSON matching this schema: " + JSON.stringify(schema) + "\nInput: " + JSON.stringify(input);

    let lastError = "Translation providers are unavailable.";
    if (geminiKey) {
      for (const model of ["gemini-2.5-flash", "gemini-2.0-flash"]) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25000);
        try {
          const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
            body: JSON.stringify({
              model,
              input: prompt,
              response_format: { type: "text", mime_type: "application/json", schema }
            })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            lastError = payload?.error?.message || ("Gemini HTTP " + response.status);
            if ([408, 429, 500, 502, 503, 504].includes(response.status)) continue;
            break;
          }
          const raw = payload?.output_text ||
            payload?.steps?.filter((step: any) => step.type === "model_output")
              .flatMap((step: any) => step.content || [])
              .filter((part: any) => part.type === "text")
              .map((part: any) => part.text || "").join("") ||
            payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("") || "";
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.items) && parsed.items.length === items.length &&
              parsed.items.every((entry: any, i: number) => entry?.question?.trim() && Array.isArray(entry.options) &&
                entry.options.length === items[i].options.length && entry.options.every((value: any) => typeof value === "string" && value.trim()))) {
            return out({ items: parsed.items });
          }
          lastError = "Gemini returned incomplete translated content.";
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        } finally {
          clearTimeout(timer);
        }
      }
    }

    if (openAiKey) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + openAiKey },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              temperature: 0.2,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: "Translate academic MCQs into accurate natural Hindi. Preserve option count/order and meaning. Return JSON only." },
                { role: "user", content: prompt + "\nOutput JSON only with an items array." }
              ]
            })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            lastError = payload?.error?.message || ("OpenAI HTTP " + response.status);
            if ([408, 429, 500, 502, 503, 504].includes(response.status) && attempt === 0) continue;
            break;
          }
          const parsed = JSON.parse(payload?.choices?.[0]?.message?.content || "{}");
          if (Array.isArray(parsed?.items) && parsed.items.length === items.length &&
              parsed.items.every((entry: any, i: number) => entry?.question?.trim() && Array.isArray(entry.options) &&
                entry.options.length === items[i].options.length && entry.options.every((value: any) => typeof value === "string" && value.trim()))) {
            return out({ items: parsed.items });
          }
          lastError = "OpenAI returned incomplete translated content.";
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        } finally {
          clearTimeout(timer);
        }
      }
    }
    return out({ error: "Hindi translation is temporarily unavailable. Please retry or provide the Hindi text manually.", code: "TRANSLATION_UNAVAILABLE", details: lastError }, 502);
  } catch (error) {
    console.error("MCQ translation failed", error);
    return out({ error: "Hindi translation failed. Please try again.", code: "TRANSLATION_FAILED" }, 500);
  }
});
