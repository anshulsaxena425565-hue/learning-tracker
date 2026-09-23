import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY")!;
const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function playlistIdFromUrl(input: string) {
  try {
    const u = new URL(input);
    const id = u.searchParams.get("list");
    if (id) return id;
  } catch {}
  const m = input.match(/[?&]list=([A-Za-z0-9_-]+)/);
  return m?.[1] || null;
}

function parseTimestamp(s: string) {
  const parts = s.trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function parseChapters(description: string) {
  const found: { title: string; start_seconds: number }[] = [];
  const lines = description.split(/\r?\n/);
  const re = /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(?:[-–—|]\s*)?(.+?)\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const sec = parseTimestamp(m[1]);
    const title = m[2].trim();
    if (sec === null || !title || title.length > 180) continue;
    if (found.some(x => x.start_seconds === sec)) continue;
    found.push({ title, start_seconds: sec });
  }
  found.sort((a, b) => a.start_seconds - b.start_seconds);
  return found.map((x, i) => ({
    ...x,
    position: i,
    end_seconds: found[i + 1]?.start_seconds ?? null,
    source: "youtube",
  }));
}

async function yt(path: string, params: Record<string, string>) {
  if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is not configured in Supabase Edge Function secrets.");
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  for (const [k, v] of Object.entries({ ...params, key: YOUTUBE_API_KEY })) u.searchParams.set(k, v);
  const r = await fetch(u);
  const data = await r.json();
  if (!r.ok) {
    const message = data?.error?.message || "YouTube API request failed";
    throw new Error(message);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);
    const token = auth.slice(7);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session." }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const teamId = String(body.team_id || "");
    const playlistUrl = String(body.playlist_url || "").trim();
    if (!teamId || !playlistUrl) return json({ error: "team_id and playlist_url are required." }, 400);

    const playlistId = playlistIdFromUrl(playlistUrl);
    if (!playlistId) return json({ error: "Please paste a valid YouTube playlist URL containing a list=... parameter." }, 400);

    const { data: membership, error: membershipError } = await admin
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return json({ error: "Only team owners and admins can import playlists." }, 403);
    }

    const existing = await admin.from("playlists").select("id,title").eq("team_id", teamId).eq("youtube_playlist_id", playlistId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return json({ error: "This YouTube playlist is already imported into this team.", playlist_id: existing.data.id }, 409);

    const pData = await yt("playlists", { part: "snippet,contentDetails", id: playlistId });
    const p = pData.items?.[0];
    if (!p) return json({ error: "YouTube playlist not found or is not publicly accessible." }, 404);

    const items: any[] = [];
    let pageToken = "";
    do {
      const params: Record<string, string> = { part: "snippet,contentDetails", playlistId, maxResults: "50" };
      if (pageToken) params.pageToken = pageToken;
      const page = await yt("playlistItems", params);
      items.push(...(page.items || []));
      pageToken = page.nextPageToken || "";
    } while (pageToken);

    const valid = items
      .filter(x => x?.snippet?.resourceId?.videoId)
      .map((x, i) => ({
        position: Number.isInteger(x.snippet.position) ? x.snippet.position : i,
        youtube_video_id: x.snippet.resourceId.videoId,
        title: x.snippet.title || "Untitled video",
      }))
      .sort((a, b) => a.position - b.position);

    const details = new Map<string, any>();
    for (let i = 0; i < valid.length; i += 50) {
      const ids = valid.slice(i, i + 50).map(x => x.youtube_video_id).join(",");
      const page = await yt("videos", { part: "snippet,contentDetails", id: ids, maxResults: "50" });
      for (const v of page.items || []) details.set(v.id, v);
    }

    const playlistRow = {
      team_id: teamId,
      title: p.snippet?.title || "YouTube Playlist",
      channel: p.snippet?.channelTitle || "",
      url: playlistUrl,
      youtube_playlist_id: playlistId,
      created_by: userId,
    };
    const inserted = await admin.from("playlists").insert(playlistRow).select().single();
    if (inserted.error) throw inserted.error;
    const newPlaylist = inserted.data;

    const videoRows = valid.map((v, i) => ({
      playlist_id: newPlaylist.id,
      position: i,
      title: details.get(v.youtube_video_id)?.snippet?.title || v.title,
      youtube_video_id: v.youtube_video_id,
      video_url: "https://www.youtube.com/watch?v=" + v.youtube_video_id,
    }));
    const vr = videoRows.length ? await admin.from("playlist_videos").insert(videoRows).select("id,position,youtube_video_id") : { data: [], error: null };
    if (vr.error) throw vr.error;

    const idByVideo = new Map((vr.data || []).map((v: any) => [v.youtube_video_id, v.id]));
    const chapterRows: any[] = [];
    for (const v of videoRows) {
      const d = details.get(v.youtube_video_id)?.snippet?.description || "";
      const chapters = parseChapters(d);
      const pvId = idByVideo.get(v.youtube_video_id);
      if (!pvId) continue;
      for (const ch of chapters) chapterRows.push({ playlist_video_id: pvId, position: ch.position, title: ch.title, start_seconds: ch.start_seconds, end_seconds: ch.end_seconds, source: ch.source });
    }
    if (chapterRows.length) {
      const cr = await admin.from("video_chapters").insert(chapterRows);
      if (cr.error) throw cr.error;
    }

    return json({
      ok: true,
      playlist: newPlaylist,
      videos_imported: videoRows.length,
      chapters_imported: chapterRows.length,
      chapter_videos: new Set(chapterRows.map(x => x.playlist_video_id)).size,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Import failed." }, 500);
  }
});