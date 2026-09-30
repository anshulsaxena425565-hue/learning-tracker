import { Innertube } from "npm:youtubei.js@18.1.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SECRET_KEY")!;
const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
const DEEPGRAM_API_BASE_URL =
  Deno.env.get("DEEPGRAM_API_BASE_URL") || "https://api.in.deepgram.com";

const YOUTUBE_TRANSCRIPT_API_URL = Deno.env.get("YOUTUBE_TRANSCRIPT_API_URL") || "https://youtube-transcript-api-tau-one.vercel.app/transcript";

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

function extractJsonAfter(source: string, needle: string) {
  const start = source.indexOf(needle);
  if (start < 0) return null;

  const brace = source.indexOf("{", start + needle.length);
  if (brace < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth += 1;
    else if (ch === "}" && --depth === 0) {
      return source.slice(brace, i + 1);
    }
  }

  return null;
}

async function getPlayer(videoIdValue: string) {
  const response = await fetch(
    "https://www.youtube.com/watch?v=" + encodeURIComponent(videoIdValue),
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
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
  const raw = extractJsonAfter(html, "ytInitialPlayerResponse");

  if (!raw) {
    throw new Error(
      "Could not read YouTube player metadata. The video may be unavailable or YouTube changed its page format.",
    );
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Could not parse YouTube player metadata.");
  }
}

function pickAudioUrl(playerResponse: any) {
  const formats = [
    ...(playerResponse?.streamingData?.adaptiveFormats || []),
    ...(playerResponse?.streamingData?.formats || []),
  ];

  const audio = formats
    .filter((format: any) => String(format?.mimeType || "").startsWith("audio/"))
    .filter((format: any) => typeof format?.url === "string" && format.url)
    .sort((a: any, b: any) => Number(b?.bitrate || 0) - Number(a?.bitrate || 0))[0];

  return audio?.url || null;
}

let youtubeClientPromise: Promise<Innertube> | null = null;

async function getYoutubeClient() {
  if (!youtubeClientPromise) {
    youtubeClientPromise = Innertube.create({
      lang: "en",
      location: "IN",
      client_type: "WEB",
      retrieve_player: true,
      enable_session_cache: false,
    });
  }

  return youtubeClientPromise;
}

async function getDecipheredYouTubeAudioUrl(videoIdValue: string) {
  const youtube = await getYoutubeClient();
  const info = await youtube.getBasicInfo(videoIdValue);
  const format = info.chooseFormat({
    type: "audio",
    quality: "best",
  });

  if (!format) return null;

  const url = await format.decipher(youtube.session.player);
  return url || null;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function captionTracks(playerResponse: any) {
  return playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
}

function pickCaptionTrack(playerResponse: any) {
  const tracks = captionTracks(playerResponse);
  if (!tracks.length) return null;

  const preferred = tracks.find((track: any) =>
    String(track?.languageCode || "").toLowerCase().startsWith("en"),
  ) || tracks.find((track: any) =>
    String(track?.languageCode || "").toLowerCase().startsWith("hi"),
  ) || tracks.find((track: any) =>
    String(track?.kind || "").toLowerCase() === "asr",
  ) || tracks[0];

  return preferred?.baseUrl || null;
}

function parseCaptionJson(payload: any) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events
    .map((event: any) => {
      const text = (event?.segs || [])
        .map((seg: any) => String(seg?.utf8 || ""))
        .join("")
        .replace(/\\n/g, " ")
        .trim();

      return {
        start: Math.max(0, Number(event?.tStartMs || 0) / 1000),
        duration: Math.max(0, Number(event?.dDurationMs || 0) / 1000),
        text,
      };
    })
    .filter((item: any) => item.text);
}

function parseCaptionXml(xml: string) {
  const out: any[] = [];
  const regex = /<text([^>]*)>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml))) {
    const attrs = match[1] || "";
    const text = decodeHtml(
      match[2]
        .replace(/<br\s*\/?\s*>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    );

    if (!text) continue;

    const startMatch = attrs.match(/\bstart="([^"]+)"/i);
    const durationMatch = attrs.match(/\bdur="([^"]+)"/i);
    const start = Number(startMatch?.[1] || 0);
    const duration = Number(durationMatch?.[1] || 0);

    out.push({ start, duration, text });
  }

  return out;
}

async function getYouTubeCaptions(playerResponse: any) {
  const baseUrl = pickCaptionTrack(playerResponse);
  if (!baseUrl) return null;

  const url = new URL(baseUrl);
  url.searchParams.set("fmt", "json3");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(
      "YouTube captions could not be loaded (HTTP " + response.status + ").",
    );
  }

  const raw = await response.text();

  try {
    const parsed = JSON.parse(raw);
    const segments = parseCaptionJson(parsed);
    if (segments.length) {
      return {
        transcript: segments.map((item: any) => item.text).join(" "),
        segments,
        source: "youtube-captions",
      };
    }
  } catch {
    // Some caption endpoints still return XML despite fmt=json3.
  }

  const segments = parseCaptionXml(raw);
  if (!segments.length) return null;

  return {
    transcript: segments.map((item: any) => item.text).join(" "),
    segments,
    source: "youtube-captions",
  };
}

function toSegments(result: any) {
  const utterances = result?.results?.utterances;
  if (Array.isArray(utterances) && utterances.length) {
    return utterances
      .map((item: any) => ({
        start: Number(item?.start || 0),
        duration: Math.max(
          0,
          Number(item?.end || 0) - Number(item?.start || 0),
        ),
        text: String(item?.transcript || "").trim(),
      }))
      .filter((item: any) => item.text);
  }

  const words = result?.results?.channels?.[0]?.alternatives?.[0]?.words;
  if (!Array.isArray(words) || !words.length) return [];

  return [
    {
      start: Number(words[0]?.start || 0),
      duration: Math.max(
        0,
        Number(words[words.length - 1]?.end || 0) -
          Number(words[0]?.start || 0),
      ),
      text: String(
        result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "",
      ).trim(),
    },
  ].filter((item: any) => item.text);
}

async function fetchExternalTranscript(videoUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(YOUTUBE_TRANSCRIPT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ video_url: videoUrl }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: any = null;
    try { payload = JSON.parse(raw); } catch {}
    if (!response.ok) {
      throw new Error(String(payload?.detail || payload?.message || payload?.error || raw.slice(0, 300) || `HTTP ${response.status}`));
    }
    const data = payload?.data || payload;
    const transcript = String(data?.transcript || data?.text || data?.content || "").trim();
    if (!transcript) throw new Error("External transcript API returned no transcript.");
    const rawSegments = data?.segments || data?.transcript_segments || data?.items || [];
    const segments = Array.isArray(rawSegments)
      ? rawSegments.map((item: any) => ({
          start: Number(item?.start ?? item?.start_seconds ?? item?.offset ?? 0),
          duration: Number(item?.duration ?? item?.duration_seconds ?? 0),
          text: String(item?.text ?? item?.transcript ?? item?.content ?? "").trim(),
        })).filter((item: any) => item.text)
      : [];
    return {
      transcript,
      segments: segments.length ? segments : [{ start: 0, duration: 0, text: transcript }],
      source: "youtube-transcript-api",
      language: String(data?.language || data?.lang || "auto"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function transcribeWithDeepgram(audioUrl: string) {
  if (!DEEPGRAM_API_KEY) {
    throw new Error(
      "Deepgram is not configured yet. Add the DEEPGRAM_API_KEY secret in Supabase.",
    );
  }

  const endpoint =
    DEEPGRAM_API_BASE_URL.replace(/\/$/, "") +
    "/v1/listen?model=nova-3&smart_format=true&punctuate=true&utterances=true&mip_opt_out=true";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Token " + DEEPGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: audioUrl }),
  });

  const raw = await response.text();

  if (!response.ok) {
    let message = "Deepgram transcription failed.";
    try {
      const parsed = JSON.parse(raw);
      message =
        parsed?.err_msg ||
        parsed?.message ||
        parsed?.error ||
        message;
    } catch {
      if (raw) message = raw.slice(0, 500);
    }
    throw new Error(message);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Deepgram returned an invalid transcription response.");
  }
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

      if (!id) {
        throw new Error("This lesson has no YouTube video ID.");
      }

      const sourceUrl = `https://www.youtube.com/watch?v=${id}`;

      let transcript = "";
      let segments: any[] = [];
      let source = "";
      let language = "auto";
      let externalProviderError = "";

      try {
        const external = await fetchExternalTranscript(sourceUrl);
        transcript = external.transcript;
        segments = external.segments;
        source = external.source;
        language = external.language;
      } catch (externalError) {
        externalProviderError = externalError instanceof Error ? externalError.message : String(externalError);
        console.error("External transcript provider failed:", externalProviderError);

        const playerResponse = await getPlayer(id);
        const captionResult = await getYouTubeCaptions(playerResponse);
        transcript = captionResult?.transcript || "";
        segments = captionResult?.segments || [];
        source = captionResult?.source || "";

        const selectedCaptionUrl = pickCaptionTrack(playerResponse);
        const selectedCaption = captionTracks(playerResponse).find(
          (track: any) => String(track?.baseUrl || "") === String(selectedCaptionUrl || ""),
        );
        language = selectedCaption?.languageCode || "auto";

        if (!transcript.trim()) {
          let audioUrl = pickAudioUrl(playerResponse);
          if (!audioUrl) {
            try { audioUrl = await getDecipheredYouTubeAudioUrl(id); }
            catch (youtubeError) { console.error("YouTube.js stream resolution failed:", youtubeError); }
          }
          if (audioUrl) {
            const deepgram = await transcribeWithDeepgram(audioUrl);
            segments = toSegments(deepgram);
            transcript =
              deepgram?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
              segments.map((item: any) => item.text).join(" ");
            source = "deepgram";
            language =
              deepgram?.results?.channels?.[0]?.alternatives?.[0]?.languages?.[0] || "auto";
          }
        }
      }

      if (!transcript.trim()) {
        throw new Error(
          "No transcript is available. External provider: " + (externalProviderError || "no response") + ". YouTube captions/audio and Deepgram also returned no usable transcript.",
        );
      }

      const result = {
        playlist_video_id: playlistVideoId,
        language,
        status: "ready",
        transcript: transcript.trim(),
        segments,
        source,
        error: null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await admin
        .from("video_transcripts")
        .upsert(result, { onConflict: "playlist_video_id" });

      if (error) throw error;

      return json(result);
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

      return json({ error: message, status: "error" }, 200);
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
