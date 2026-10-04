import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BotGuardClient } from "npm:bgutils-js@4.0.3/botguard";
import { WebPoMinter } from "npm:bgutils-js@4.0.3/webpo";
import {
  buildURL,
  getHeaders,
  parseLooseJSON,
  USER_AGENT,
} from "npm:bgutils-js@4.0.3/utils";
import { JSDOM } from "npm:jsdom@24.1.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SECRET_KEY")!;
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

const REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";

function setupBotGuardDom() {
  const dom = new JSDOM(
    '<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>',
    {
      url: "https://www.youtube.com",
      referrer: "https://www.youtube.com/",
      userAgent: USER_AGENT,
    },
  );

  const globalObj = globalThis as any;
  Object.assign(globalObj, {
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    origin: dom.window.origin,
  });

  if (!("navigator" in globalObj)) {
    Object.defineProperty(globalObj, "navigator", {
      value: dom.window.navigator,
    });
  }

  return dom;
}

function extractYtcfg(html: string) {
  const raw = html.match(/ytcfg\\.set\\(\\s*({[\\s\\S]*?})\\s*\\);/)?.[1];
  if (!raw) throw new Error("YouTube configuration was not found.");

  return JSON.parse(raw);
}

async function getWebPoToken(videoIdValue: string) {
  const dom = setupBotGuardDom();
  const pageResponse = await fetch("https://www.youtube.com", {
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.7",
      "user-agent": USER_AGENT,
    },
  });

  if (!pageResponse.ok) {
    throw new Error(
      "YouTube homepage returned HTTP " + pageResponse.status + ".",
    );
  }

  const pageHtml = await pageResponse.text();
  const ytcfg = extractYtcfg(pageHtml);
  const visitorData =
    String(
      ytcfg?.VISITOR_DATA ||
        ytcfg?.INNERTUBE_CONTEXT_CLIENT_NAME ||
        "",
    );

  const attestationMatch = pageHtml.match(
    /window\\.ytAtN\\(\\s*({[\\s\\S]*?})\\s*\\)/,
  );

  if (!attestationMatch) {
    throw new Error("YouTube BotGuard challenge was not found.");
  }

  const initialAttestation = parseLooseJSON(attestationMatch[1]);
  const challengeResponse = initialAttestation?.R;

  if (!challengeResponse?.bgChallenge) {
    throw new Error("YouTube BotGuard challenge data was not returned.");
  }

  const interpreterUrl =
    challengeResponse.bgChallenge?.interpreterUrl
      ?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;

  let interpreterJavascript =
    challengeResponse.bgChallenge?.interpreterJavascript
      ?.privateDoNotAccessOrElseSafeScriptWrappedValue;

  if (!interpreterJavascript && interpreterUrl) {
    const scriptResponse = await fetch("https:" + interpreterUrl);
    interpreterJavascript = await scriptResponse.text();
  }

  if (!interpreterJavascript) {
    throw new Error("YouTube BotGuard interpreter was not returned.");
  }

  const globalObj = globalThis as any;
  if (!globalObj.yt) {
    globalObj.yt = dom.window.yt || { config_: ytcfg };
  }
  (dom.window as any).yt = globalObj.yt;

  new Function(interpreterJavascript)();

  const botGuardClient = await BotGuardClient.create({
    program: challengeResponse.bgChallenge.program,
    globalName: challengeResponse.bgChallenge.globalName,
    globalObject: globalObj,
  });

  const webPoSignalOutput: any[] = [];
  const botguardResponse = await botGuardClient.snapshot({
    webPoSignalOutput,
  });

  const integrityResponse = await fetch(buildURL("GenerateIT", true), {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY, botguardResponse]),
  });

  if (!integrityResponse.ok) {
    throw new Error(
      "YouTube integrity token returned HTTP " + integrityResponse.status + ".",
    );
  }

  const integrityJson = await integrityResponse.json();
  const [
    integrityToken,
    estimatedTtlSecs,
    mintRefreshThreshold,
    websafeFallbackToken,
  ] = integrityJson;

  if (!integrityToken) {
    throw new Error("YouTube did not return an integrity token.");
  }

  const minter = await WebPoMinter.create(
    {
      integrityToken,
      estimatedTtlSecs,
      mintRefreshThreshold,
      websafeFallbackToken,
    },
    webPoSignalOutput,
  );

  const poToken = await minter.mintAsWebsafeString(videoIdValue);

  return {
    poToken,
    visitorData,
    clientVersion:
      String(ytcfg?.INNERTUBE_CLIENT_VERSION || "2.20250101.00.00"),
    apiKey: String(
      ytcfg?.INNERTUBE_API_KEY ||
        "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
    ),
  };
}

async function getPlayerWithPoToken(videoIdValue: string, poTokenData: any) {
  const endpoint =
    "https://www.youtube.com/youtubei/v1/player?key=" +
    encodeURIComponent(poTokenData.apiKey);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.7",
      "Origin": "https://www.youtube.com",
      "X-YouTube-Client-Name": "1",
      "X-YouTube-Client-Version": poTokenData.clientVersion,
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "WEB",
          clientVersion: poTokenData.clientVersion,
          hl: "en",
          gl: "US",
          visitorData: poTokenData.visitorData,
          userAgent: USER_AGENT,
        },
      },
      videoId: videoIdValue,
      contentCheckOk: true,
      racyCheckOk: true,
      serviceIntegrityDimensions: {
        poToken: poTokenData.poToken,
      },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error("YouTube WEB player returned HTTP " + response.status + ".");
  }

  const player = JSON.parse(raw);
  const tracks =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

  if (!Array.isArray(tracks) || !tracks.length) {
    throw new Error("YouTube WEB player returned no caption tracks.");
  }

  return player;
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

async function getYouTubeCaptions(
  playerResponse: any,
  poTokenData: any,
) {
  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  const preferred =
    tracks.find((track: any) =>
      String(track?.languageCode || "").toLowerCase().startsWith("en"),
    ) ||
    tracks.find((track: any) =>
      String(track?.languageCode || "").toLowerCase().startsWith("hi"),
    ) ||
    tracks.find(
      (track: any) => String(track?.kind || "").toLowerCase() === "asr",
    ) ||
    tracks[0];

  if (!preferred?.baseUrl) return null;

  const url = new URL(preferred.baseUrl);
  url.searchParams.set("fmt", "json3");
  url.searchParams.set("pot", poTokenData.poToken);
  url.searchParams.set("c", "WEB");

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      "Origin": "https://www.youtube.com",
      "Referer": "https://www.youtube.com/",
    },
  });

  if (!response.ok) {
    throw new Error("YouTube captions returned HTTP " + response.status + ".");
  }

  const raw = await response.text();
  if (!raw.trim()) throw new Error("YouTube returned an empty caption body.");

  try {
    const parsed = JSON.parse(raw);
    const segments = parseCaptionJson(parsed);
    if (segments.length) {
      return {
        transcript: segments.map((item: any) => item.text).join(" ").trim(),
        segments,
        source: "youtube-captions",
        language: preferred.languageCode || "auto",
      };
    }
  } catch {}

  const xmlSegments = parseCaptionXml(raw);
  if (!xmlSegments.length) return null;

  return {
    transcript: xmlSegments.map((item: any) => item.text).join(" ").trim(),
    segments: xmlSegments,
    source: "youtube-captions",
    language: preferred.languageCode || "auto",
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

      if (!id) {
        throw new Error("This lesson has no YouTube video ID.");
      }

      let transcript = "";
      let segments: any[] = [];
      let source = "";
      let language = "auto";

      const poTokenData = await getWebPoToken(id);
      const playerResponse = await getPlayerWithPoToken(id, poTokenData);
      const captionResult = await getYouTubeCaptions(
        playerResponse,
        poTokenData,
      );

      if (captionResult?.transcript) {
        transcript = captionResult.transcript;
        segments = captionResult.segments || [];
        source = captionResult.source || "youtube-captions";
        language = captionResult.language || "auto";
      }

      if (!transcript) {
        throw new Error(
          "This YouTube video does not have an accessible transcript, captions, or subtitles.",
        );
      }

      const result = {
        playlist_video_id: playlistVideoId,
        language: selectedCaption?.languageCode || "auto",
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
