import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from youtube_transcript_api import YouTubeTranscriptApi

try:
    from youtube_transcript_api.proxies import GenericProxyConfig, WebshareProxyConfig
except ImportError:
    GenericProxyConfig = None
    WebshareProxyConfig = None


def extract_video_id(value: str) -> str | None:
    value = str(value or "").strip()
    if not value:
        return None

    try:
        parsed = urlparse(value)
        host = (parsed.hostname or "").lower()

        if host == "youtu.be" or host.endswith(".youtu.be"):
            return parsed.path.strip("/").split("/")[0] or None

        if "youtube.com" in host:
            query = parse_qs(parsed.query)
            if query.get("v"):
                return query["v"][0]

            parts = parsed.path.strip("/").split("/")
            if len(parts) >= 2 and parts[0] in {"embed", "shorts", "live"}:
                return parts[1]

        return value
    except Exception:
        return value


def build_api():
    username = os.getenv("YOUTUBE_PROXY_USERNAME")
    password = os.getenv("YOUTUBE_PROXY_PASSWORD")
    proxy_url = os.getenv("YOUTUBE_PROXY_URL")

    if WebshareProxyConfig and username and password:
        return YouTubeTranscriptApi(
            proxy_config=WebshareProxyConfig(
                proxy_username=username,
                proxy_password=password,
                filter_ip_locations=["in", "us"],
            )
        )

    if GenericProxyConfig and proxy_url:
        return YouTubeTranscriptApi(
            proxy_config=GenericProxyConfig(
                http_url=proxy_url,
                https_url=proxy_url,
            )
        )

    return YouTubeTranscriptApi()


def serialize_transcript(transcript, language_code=None, language=None):
    snippets = []
    for snippet in transcript:
        snippets.append(
            {
                "text": str(snippet.text).strip(),
                "start": float(snippet.start),
                "duration": float(snippet.duration),
            }
        )

    snippets = [item for item in snippets if item["text"]]
    return {
        "transcript": " ".join(item["text"] for item in snippets).strip(),
        "segments": snippets,
        "language": language or getattr(transcript, "language", None) or "auto",
        "language_code": language_code or getattr(transcript, "language_code", None) or "auto",
        "is_generated": bool(getattr(transcript, "is_generated", False)),
    }


def fetch_transcript(video_id: str):
    api = build_api()

    first_error = None
    for languages in (["en", "hi"], ["en"], ["hi"]):
        try:
            transcript = api.fetch(video_id, languages=languages)
            return serialize_transcript(
                transcript,
                language_code=getattr(transcript, "language_code", None),
                language=getattr(transcript, "language", None),
            )
        except Exception as exc:
            first_error = exc

    # Last fallback: use whatever transcript language YouTube exposes.
    try:
        transcript_list = api.list(video_id)
        for transcript_meta in transcript_list:
            try:
                fetched = transcript_meta.fetch()
                return serialize_transcript(
                    fetched,
                    language_code=getattr(transcript_meta, "language_code", None),
                    language=getattr(transcript_meta, "language", None),
                )
            except Exception:
                continue
    except Exception as exc:
        first_error = exc

    message = str(first_error or "No transcript was found.")
    raise RuntimeError(message[:1000])


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(200, {"ok": True})

    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        video_url = (query.get("video_url") or query.get("url") or [None])[0]
        self._handle(video_url)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send(400, {"error": "Request body must be valid JSON."})
            return

        self._handle(
            payload.get("video_url")
            or payload.get("url")
            or payload.get("video_id")
        )

    def _handle(self, value):
        video_id = extract_video_id(value)
        if not video_id:
            self._send(400, {"error": "video_url or video_id is required."})
            return

        try:
            result = fetch_transcript(video_id)
            result.update(
                {
                    "ok": True,
                    "video_id": video_id,
                    "video_url": f"https://www.youtube.com/watch?v={video_id}",
                    "source": "youtube-transcript-api",
                }
            )
            self._send(200, result)
        except Exception as exc:
            self._send(
                502,
                {
                    "ok": False,
                    "video_id": video_id,
                    "error": str(exc)[:1000],
                },
            )
