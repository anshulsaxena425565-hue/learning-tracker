import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function getPlayer(videoIdValue: string) {
  const endpoint = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
  const clients = [
    {
      name: "ANDROID",
      version: "20.10.38",
      userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
      numericName: "3",
      client: {
        clientName: "ANDROID",
        clientVersion: "20.10.38",
        androidSdkVersion: 30,
        hl: "en",
        gl: "IN",
      },
    },
    {
      name: "IOS",
      version: "19.45.4",
      userAgent: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_0 like Mac OS X)",
      numericName: "5",
      client: {
        clientName: "IOS",
        clientVersion: "19.45.4",
        deviceModel: "iPhone16,2",
        hl: "en",
        gl: "IN",
      },
    },
  ];

  let lastError = "YouTube InnerTube request failed.";

  for (const client of clients) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": client.userAgent,
          "Accept-Language": "en-US,en;q=0.9",
          "X-YouTube-Client-Name": client.numericName,
          "X-YouTube-Client-Version": client.version,
        },
        body: JSON.stringify({
          context: { client: client.client },
          videoId: videoIdValue,
        }),
      });

      const raw = await response.text();

      if (!response.ok) {
        lastError =
          "YouTube " + client.name + " returned HTTP " + response.status + ".";
        continue;
      }

      let player: any;
      try {
        player = JSON.parse(raw);
      } catch {
        lastError =
          "YouTube " + client.name + " returned invalid player JSON.";
        continue;
      }

      const tracks =
        player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (Array.isArray(tracks) && tracks.length) return player;

      const playability = player?.playabilityStatus;
      if (playability?.status === "ERROR") {
        lastError = String(
          playability?.reason || "YouTube rejected the video request.",
        );
      } else {
        lastError =
          "YouTube " + client.name + " returned no caption tracks.";
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError);
}

function base64Encode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encodeTranscriptParams(videoIdValue: string, languageCode: string) {
  const languagePayload = base64Encode(
    "\n\x03asr\x12\x02" + languageCode + "\x1a\x00",
  );
  const payload =
    "\n\x0b" +
    videoIdValue +
    "\x12\x12" +
    languagePayload +
    "\x18\x01";

  return base64Encode(payload);
}

function parseInnerTubeTranscript(payload: any) {
  const actions = Array.isArray(payload?.actions) ? payload.actions : [];

  for (const action of actions) {
    const listArgs =
      action?.elementsCommand?.transformEntityCommand?.arguments
        ?.transformTranscriptSegmentListArguments;

    const rawSegments = listArgs?.overwrite?.initialSegments;
    if (!Array.isArray(rawSegments)) continue;

    const segments = rawSegments
      .map((item: any) => {
        const renderer = item?.transcriptSegmentRenderer;
        const text =
          renderer?.snippet?.elementsAttributedString
            ?.elementsAttributedString?.content ||
          renderer?.snippet?.simpleText ||
          "";

        const startMs = Number(renderer?.startMs || 0);
        const endMs = Number(renderer?.endMs || startMs);

        return {
          start: Math.max(0, startMs / 1000),
          duration: Math.max(0, (endMs - startMs) / 1000),
          text: String(text).trim(),
        };
      })
      .filter((item: any) => item.text);

    if (segments.length) {
      return {
        transcript: segments.map((item: any) => item.text).join(" ").trim(),
        segments,
      };
    }
  }

  // Also support the searchable-transcript web response shape.
  for (const action of actions) {
    const web = action?.updateEngagementPanelAction;
    const cueGroups =
      web?.content?.transcriptRenderer?.content
        ?.transcriptSearchPanelRenderer?.body
        ?.transcriptSegmentListRenderer?.initialSegments ||
      web?.content?.transcriptRenderer?.content
        ?.transcriptSearchPanelRenderer?.body
        ?.transcriptCueGroups ||
      [];

    if (!Array.isArray(cueGroups)) continue;

    const segments = cueGroups
      .map((item: any) => {
        const renderer =
          item?.transcriptSegmentRenderer ||
          item?.transcriptCueGroupRenderer?.cues?.[0]
            ?.transcriptCueRenderer;

        const text =
          renderer?.snippet?.simpleText ||
          renderer?.snippet?.runs?.map((run: any) => run.text).join("") ||
          renderer?.cue?.simpleText ||
          "";

        const startMs = Number(renderer?.startMs || renderer?.startOffsetMs || 0);
        const durationMs = Number(
          renderer?.endMs ||
            (startMs + Number(renderer?.durationMs || 0)) ||
            startMs,
        );

        return {
          start: Math.max(0, startMs / 1000),
          duration: Math.max(0, (durationMs - startMs) / 1000),
          text: String(text).trim(),
        };
      })
      .filter((item: any) => item.text);

    if (segments.length) {
      return {
        transcript: segments.map((item: any) => item.text).join(" ").trim(),
        segments,
      };
    }
  }

  return null;
}

async function getTranscriptDirect(videoIdValue: string) {
  const endpoint = "https://www.youtube.com/youtubei/v1/get_transcript";
  const clients = [
    {
      name: "ANDROID",
      key: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
      version: "20.10.38",
      userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
      numericName: "3",
      device: undefined,
    },
    {
      name: "IOS",
      key: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
      version: "19.45.4",
      userAgent: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)",
      numericName: "5",
      device: "iPhone16,2",
    },
  ];

  let lastError = "YouTube transcript endpoint returned no transcript.";

  for (const client of clients) {
    for (const languageCode of ["en", "hi"]) {
      try {
        const params = encodeTranscriptParams(videoIdValue, languageCode);
        const response = await fetch(
          endpoint + "?key=" + encodeURIComponent(client.key),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": client.userAgent,
              "Accept-Language": "en-US,en;q=0.9",
              "X-YouTube-Client-Name": client.numericName,
              "X-YouTube-Client-Version": client.version,
            },
            body: JSON.stringify({
              context: {
                client: {
                  clientName: client.name,
                  clientVersion: client.version,
                  deviceModel: client.device,
                  hl: "en",
                  gl: "IN",
                  userAgent: client.userAgent,
                },
              },
              params,
            }),
          },
        );

        const raw = await response.text();
        if (!response.ok) {
          lastError =
            "YouTube " + client.name + " transcript returned HTTP " + response.status + ".";
          continue;
        }

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          lastError = "YouTube " + client.name + " transcript returned invalid JSON.";
          continue;
        }

        const parsed = parseInnerTubeTranscript(payload);
        if (parsed?.transcript) {
          return {
            ...parsed,
            source: "youtube-transcript",
            language: languageCode,
          };
        }

        lastError =
          "YouTube " + client.name + " transcript returned no segments for " + languageCode + ".";
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  throw new Error(lastError);
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
  const tracks = captionTracks(playerResponse);
  if (!Array.isArray(tracks) || !tracks.length) return null;

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
  if (!baseUrl) return null;

  const urls = [baseUrl];
  try {
    const jsonUrl = new URL(baseUrl);
    jsonUrl.searchParams.set("fmt", "json3");
    urls.push(jsonUrl.toString());
  } catch {}

  for (const captionUrl of urls) {
    try {
      const response = await fetch(captionUrl, {
        headers: {
          "User-Agent":
            "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!response.ok) continue;

      const raw = await response.text();
      if (!raw.trim()) continue;

      try {
        const parsed = JSON.parse(raw);
        const jsonSegments = parseCaptionJson(parsed);
        if (jsonSegments.length) {
          return {
            transcript: jsonSegments.map((item: any) => item.text).join(" ").trim(),
            segments: jsonSegments,
            source: "youtube-captions",
            language: preferred?.languageCode || "auto",
          };
        }
      } catch {}

      const xmlSegments = parseCaptionXml(raw);
      if (xmlSegments.length) {
        return {
          transcript: xmlSegments.map((item: any) => item.text).join(" ").trim(),
          segments: xmlSegments,
          source: "youtube-captions",
          language: preferred?.languageCode || "auto",
        };
      }
    } catch {}
  }

  return null;
}Deno.serve(async (req) => {
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

      try {
        const direct = await getTranscriptDirect(id);
        transcript = direct.transcript;
        segments = direct.segments;
        source = direct.source;
        language = direct.language;
      } catch (error) {
        console.error("YouTube direct transcript lookup failed:", error);
      }

      if (!transcript) {
        try {
          const playerResponse = await getPlayer(id);
          const captionResult = await getYouTubeCaptions(playerResponse);

          if (captionResult?.transcript) {
            transcript = captionResult.transcript;
            segments = captionResult.segments || [];
            source = captionResult.source || "youtube-captions";
            language = captionResult.language || "auto";
          }
        } catch (error) {
          console.error("YouTube caption lookup failed:", error);
        }
      }

      if (!transcript) {
        throw new Error(
          "This YouTube video does not have an accessible transcript, captions, or subtitles.",
        );
      }

      const selectedCaptionUrl = playerResponse ? pickCaptionTrack(playerResponse) : null;
      const selectedCaption = playerResponse ? captionTracks(playerResponse).find(
        (track: any) => String(track?.baseUrl || "") === String(selectedCaptionUrl || ""),
      ) : null;

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
