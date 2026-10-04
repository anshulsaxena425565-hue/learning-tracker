import { Innertube } from "npm:youtubei.js@18.1.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SECRET_KEY")!;

const YOUTUBE_TRANSCRIPT_API_URL =
  Deno.env.get("YOUTUBE_TRANSCRIPT_API_URL") ||
  "https://youtube-transcript-api-tau-one.vercel.app/transcript";
const SUPADATA_API_KEY = Deno.env.get("SUPADATA_API_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function videoId(input: string) {
  const value = String(input || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1).split("/")[0] || null;
    }
    return (
      url.searchParams.get("v") ||
      url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/i)?.[1] ||
      null
    );
  } catch {
    return value;
  }
}

function normalizeSegments(raw: any) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any) => ({
      start: Number(
        item?.start ??
          item?.start_seconds ??
          item?.offset ??
          item?.offset_seconds ??
          item?.startTime ??
          0,
      ),
      duration: Number(
        item?.duration ??
          item?.duration_seconds ??
          item?.dur ??
          0,
      ),
      text: String(
        item?.text ??
          item?.transcript ??
          item?.content ??
          item?.snippet ??
          "",
      ).trim(),
    }))
    .filter((item: any) => item.text);
}

async function fetchExternalTranscript(videoUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(YOUTUBE_TRANSCRIPT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ video_url: videoUrl }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload: any = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(
        String(
          payload?.detail ||
            payload?.message ||
            payload?.error ||
            raw.slice(0, 300) ||
            `HTTP ${response.status}`,
        ),
      );
    }

    const data = payload?.data || payload;
    const transcript = String(
      data?.transcript || data?.text || data?.content || "",
    ).trim();

    if (!transcript) {
      throw new Error("External transcript API returned an empty transcript.");
    }

    const segments = normalizeSegments(
      data?.segments ||
        data?.transcript_segments ||
        data?.items ||
        data?.snippets ||
        [],
    );

    return {
      transcript,
      segments:
        segments.length > 0
          ? segments
          : [{ start: 0, duration: 0, text: transcript }],
      source: "youtube-transcript-api",
      language: String(data?.language || data?.lang || "auto"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSupadataTranscript(videoUrl: string) {
  if (!SUPADATA_API_KEY) {
    throw new Error("AI transcript fallback is not configured.");
  }

  const url = new URL("https://api.supadata.ai/v1/transcript");
  url.searchParams.set("url", videoUrl);
  url.searchParams.set("lang", "en");
  url.searchParams.set("text", "false");
  url.searchParams.set("mode", "auto");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": SUPADATA_API_KEY,
      },
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload: any = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }

    if (!response.ok && response.status !== 206) {
      throw new Error(
        String(
          payload?.message ||
            payload?.details ||
            payload?.error ||
            raw.slice(0, 300) ||
            `HTTP ${response.status}`,
        ),
      );
    }

    if (payload?.jobId) {
      const jobUrl = `https://api.supadata.ai/v1/transcript/${encodeURIComponent(payload.jobId)}`;
      const deadline = Date.now() + 85000;

      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const jobResponse = await fetch(jobUrl, {
          headers: {
            Accept: "application/json",
            "x-api-key": SUPADATA_API_KEY,
          },
          signal: controller.signal,
        });

        const jobRaw = await jobResponse.text();
        let jobPayload: any = null;
        try {
          jobPayload = JSON.parse(jobRaw);
        } catch {
          jobPayload = null;
        }

        if (!jobResponse.ok) {
          throw new Error(
            String(
              jobPayload?.message ||
                jobPayload?.details ||
                jobPayload?.error ||
                jobRaw.slice(0, 300) ||
                `HTTP ${jobResponse.status}`,
            ),
          );
        }

        if (jobPayload?.status === "failed") {
          throw new Error(
            String(
              jobPayload?.error?.message ||
                jobPayload?.error?.details ||
                jobPayload?.error ||
                "Supadata transcript generation failed.",
            ),
          );
        }

        if (jobPayload?.status === "completed") {
          payload = jobPayload;
          break;
        }
      }

      if (!payload?.content && !payload?.data?.content && !payload?.result?.content && !payload?.result?.data?.content) {
        throw new Error("Supadata transcript generation timed out.");
      }

      payload = payload?.result || payload?.data || payload;
      payload = payload?.data || payload;
    }

    const content = Array.isArray(payload?.content)
      ? payload.content
      : typeof payload?.content === "string"
        ? [{ text: payload.content, offset: 0, duration: 0 }]
        : [];

    const segments = content
      .map((item: any) => ({
        start: Math.max(
          0,
          Number(item?.offset ?? item?.start ?? 0) / 1000,
        ),
        duration: Math.max(
          0,
          Number(item?.duration ?? item?.duration_ms ?? 0) / 1000,
        ),
        text: String(item?.text ?? item?.content ?? "").trim(),
      }))
      .filter((item: any) => item.text);

    const transcript = segments.map((item: any) => item.text).join(" ").trim();

    if (!transcript) {
      throw new Error(
        String(
          payload?.details ||
            payload?.message ||
            payload?.error ||
            "Supadata returned no transcript text.",
        ),
      );
    }

    return {
      transcript,
      segments,
      source: "supadata-ai",
      language: String(payload?.lang || segments[0]?.lang || "auto"),
    };
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchYouTubeCaptionsViaPlayer(videoIdValue: string) {
  const response = await fetch(
    "https://www.youtube.com/watch?v=" +
      encodeURIComponent(videoIdValue),
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      "YouTube returned HTTP " + response.status + " while loading the video.",
    );
  }

  const html = await response.text();
  const marker = "ytInitialPlayerResponse";
  const markerStart = html.indexOf(marker);
  if (markerStart < 0) {
    throw new Error("YouTube player metadata was not found.");
  }

  const braceStart = html.indexOf("{", markerStart);
  if (braceStart < 0) {
    throw new Error("YouTube player JSON was not found.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let raw = "";

  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];

    if (inString) {
      raw += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    raw += ch;

    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  let player: any;
  try {
    player = JSON.parse(raw);
  } catch {
    throw new Error("YouTube player metadata could not be parsed.");
  }

  const tracks =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new Error("This video has no accessible YouTube captions.");
  }

  const preferred =
    tracks.find((track: any) =>
      String(track?.languageCode || "").toLowerCase().startsWith("en"),
    ) ||
    tracks.find((track: any) =>
      String(track?.languageCode || "").toLowerCase().startsWith("hi"),
    ) ||
    tracks.find((track: any) =>
      String(track?.kind || "").toLowerCase() === "asr",
    ) ||
    tracks[0];

  const baseUrl = preferred?.baseUrl;
  if (!baseUrl) throw new Error("YouTube caption track URL is missing.");

  const captionUrl = new URL(baseUrl);
  captionUrl.searchParams.set("fmt", "json3");

  const captionResponse = await fetch(captionUrl.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!captionResponse.ok) {
    throw new Error(
      "YouTube caption endpoint returned HTTP " +
        captionResponse.status +
        ".",
    );
  }

  const payload = await captionResponse.text();

  try {
    const jsonPayload = JSON.parse(payload);
    const events = Array.isArray(jsonPayload?.events)
      ? jsonPayload.events
      : [];

    const segments = events
      .map((event: any) => {
        const text = (event?.segs || [])
          .map((seg: any) => String(seg?.utf8 || ""))
          .join("")
          .replace(/\n/g, " ")
          .trim();

        return {
          start: Math.max(0, Number(event?.tStartMs || 0) / 1000),
          duration: Math.max(0, Number(event?.dDurationMs || 0) / 1000),
          text,
        };
      })
      .filter((item: any) => item.text);

    if (segments.length) {
      return {
        transcript: segments.map((item: any) => item.text).join(" "),
        segments,
        source: "youtube-captions",
        language: String(preferred?.languageCode || "auto"),
      };
    }
  } catch {
    // Fall through to XML parsing.
  }

  const xmlSegments: any[] = [];
  const regex = /<text([^>]*)>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(payload))) {
    const attrs = match[1] || "";
    const text = match[2]
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/gi, "'")
      .trim();

    if (!text) continue;

    xmlSegments.push({
      start: Number(attrs.match(/\bstart="([^"]+)"/i)?.[1] || 0),
      duration: Number(attrs.match(/\bdur="([^"]+)"/i)?.[1] || 0),
      text,
    });
  }

  if (!xmlSegments.length) {
    throw new Error("YouTube caption track contained no readable text.");
  }

  return {
    transcript: xmlSegments.map((item: any) => item.text).join(" "),
    segments: xmlSegments,
    source: "youtube-captions",
    language: String(preferred?.languageCode || "auto"),
  };
}

async function fetchYouTubeiTranscript(videoIdValue: string) {
  const youtube = await Innertube.create({
    lang: "en",
    location: "IN",
    client_type: "WEB",
    retrieve_player: true,
    enable_session_cache: false,
  });

  const info = await youtube.getBasicInfo(videoIdValue);
  const transcriptInfo = await info.getTranscript();
  const body = transcriptInfo?.transcript?.content?.body;

  const initialSegments = Array.isArray(body?.initial_segments)
    ? body.initial_segments
    : [];

  const segments = initialSegments
    .map((segment: any) => ({
      start: Number(segment?.start_ms || 0) / 1000,
      duration:
        Math.max(0, Number(segment?.end_ms || 0) - Number(segment?.start_ms || 0)) /
        1000,
      text: String(segment?.snippet?.text || "").trim(),
    }))
    .filter((segment: any) => segment.text);

  const transcript = segments.map((segment: any) => segment.text).join(" ").trim();

  if (!transcript) {
    throw new Error("youtubei.js returned no transcript text.");
  }

  return {
    transcript,
    segments,
    source: "youtubei-js",
    language: String(
      transcriptInfo?.transcript?.language_code ||
        body?.language_code ||
        "auto",
    ),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "Authentication required." }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(
      auth.slice(7),
    );

    if (authError || !authData.user) {
      return json({ error: "Invalid session." }, 401);
    }

    const body = await req.json();
    const playlistVideoId = String(body.playlist_video_id || "");

    if (!playlistVideoId) {
      return json({ error: "playlist_video_id is required." }, 400);
    }

    const { data: playlistVideo, error: playlistVideoError } = await admin
      .from("playlist_videos")
      .select("id,youtube_video_id,video_url,playlists!inner(team_id)")
      .eq("id", playlistVideoId)
      .single();

    if (playlistVideoError) throw playlistVideoError;

    const teamId = (playlistVideo as any).playlists?.team_id;

    const { data: membership } = await admin
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (!membership) {
      return json({ error: "You are not a member of this team." }, 403);
    }

    await admin.from("video_transcripts").upsert(
      {
        playlist_video_id: playlistVideoId,
        status: "processing",
        error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "playlist_video_id" },
    );

    try {
      const id =
        playlistVideo.youtube_video_id ||
        videoId(playlistVideo.video_url || "");

      if (!id) throw new Error("This lesson has no YouTube video ID.");

      const sourceUrl = "https://www.youtube.com/watch?v=" + id;
      const errors: string[] = [];
      let result: any = null;

      try {
        result = await fetchExternalTranscript(sourceUrl);
      } catch (e) {
        errors.push(
          "jaypaun007-api: " + (e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e)),
        );
      }

      if (!result) {
        try {
          result = await fetchYouTubeCaptionsViaPlayer(id);
        } catch (e) {
          errors.push(
            "youtube-captions: " + (e instanceof Error ? e.message : String(e)),
          );
        }
      }

      if (!result) {
        try {
          result = await fetchYouTubeiTranscript(id);
        } catch (e) {
          errors.push(
            "youtubei-js: " + (e instanceof Error ? e.message : String(e)),
          );
        }
      }

      if (!result && SUPADATA_API_KEY) {
        try {
          result = await fetchSupadataTranscript(sourceUrl);
        } catch (e) {
          errors.push(
            "supadata-ai: " + (e instanceof Error ? e.message : JSON.stringify(e)),
          );
        }
      }

      if (!result?.transcript?.trim()) {
        console.error("Transcript providers exhausted:", errors);
        throw new Error(
          "We couldn't access a transcript for this video. " +
            (SUPADATA_API_KEY
              ? "The AI transcript provider could not generate one for this video."
              : "This video does not expose accessible captions. Enable the AI transcript fallback to process videos without captions."),
        );
      }

      const saved = {
        playlist_video_id: playlistVideoId,
        language: result.language || "auto",
        status: "ready",
        transcript: result.transcript.trim(),
        segments: result.segments || [],
        source: result.source || "youtube",
        error: null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await admin
        .from("video_transcripts")
        .upsert(saved, { onConflict: "playlist_video_id" });

      if (error) throw error;

      return json(saved);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Transcript generation failed.";

      await admin.from("video_transcripts").upsert(
        {
          playlist_video_id: playlistVideoId,
          status: "error",
          error: message,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "playlist_video_id" },
      );

      return json(
        {
          error: message,
          status: "error",
          user_message:
            "We couldn't access a transcript for this video. " +
            (SUPADATA_API_KEY
              ? "The available transcript methods could not process it."
              : "This video has no accessible captions yet. The AI audio fallback is not configured."),
        },
        200,
      );
    }
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Transcript request failed.",
      },
      500,
    );
  }
});