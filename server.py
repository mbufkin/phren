#!/usr/bin/env python3
"""
Epictetus — local dev server + LLM proxy + document upload.

Serves the app, proxies LLM calls to any OpenAI-compatible backend, and
accepts document uploads (PDF, text, markdown, HTML) that become the
course's source material — the single source of truth for AI authoring.

Stdlib only — zero pip installs, zero-build prototype.

Run:
    python3 server.py                       # defaults to local Ollama
    # Point at Lenovo over Tailscale:
    LLM_BASE_URL=http://100.85.15.59:11434/v1 \\
    LLM_MODEL=qwen3.6:35b-a3b \\
    python3 server.py
"""

import json
import os
import re
import time
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def _load_dotenv(path=".env"):
    """Minimal .env loader (stdlib only — no python-dotenv dependency)."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip("'\"")
            os.environ.setdefault(key, value)


_load_dotenv()

# --- Backend configuration -------------------------------------------------
BACKEND = {
    "base_url": os.environ.get("LLM_BASE_URL", "http://127.0.0.1:11434/v1"),
    "model": os.environ.get("LLM_MODEL", "qwen2.5-coder:32b"),
    "api_key": os.environ.get("LLM_API_KEY", ""),
}

PORT = int(os.environ.get("PORT", "8753"))
LLM_TIMEOUT_S = int(os.environ.get("LLM_TIMEOUT_S", "600"))
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", ".uploads"))
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "50"))


def extract_text_from_pdf(data: bytes) -> str:
    """Crude PDF text extraction — pulls readable strings from raw bytes.
    For production, use pymupdf or pdfplumber. This works for most text-based PDFs."""
    text = data.decode("latin-1", errors="replace")
    # Try to find text between stream/endstream or BT/ET blocks
    chunks = []
    # Simple approach: extract anything that looks like readable text
    # Strip binary garbage, keep printable ASCII + common unicode
    cleaned = []
    for ch in text:
        if ch.isprintable() or ch in '\n\r\t':
            cleaned.append(ch)
        else:
            cleaned.append(' ')
    text = ''.join(cleaned)
    # Collapse whitespace
    text = re.sub(r'\n\s*\n', '\n\n', text)
    text = re.sub(r'[ \t]{3,}', '  ', text)
    # Remove very short lines (likely noise)
    lines = [l.strip() for l in text.split('\n') if len(l.strip()) > 3]
    return '\n'.join(lines)


def extract_text_from_html(data: bytes) -> str:
    """Strip HTML tags, return plain text."""
    text = data.decode("utf-8", errors="replace")
    # Remove scripts and styles
    text = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Remove tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Decode entities
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&quot;', '"').replace('&#39;', "'").replace('&nbsp;', ' ')
    # Collapse whitespace
    text = re.sub(r'\n\s*\n', '\n\n', text)
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    return '\n'.join(lines)


def extract_text(path: str, data: bytes) -> str:
    """Extract text from a document based on its extension."""
    ext = Path(path).suffix.lower()
    if ext == '.pdf':
        return extract_text_from_pdf(data)
    elif ext in ('.html', '.htm'):
        return extract_text_from_html(data)
    elif ext in ('.md', '.txt', '.text'):
        return data.decode("utf-8", errors="replace")
    else:
        return data.decode("utf-8", errors="replace")


# --- In-memory store for uploaded documents (reset on server restart) ---
_uploaded_docs = []


class Handler(SimpleHTTPRequestHandler):
    """Serves static files, proxies LLM calls, and accepts document uploads."""

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/health":
            self._send_json(200, {
                "ok": True,
                "model": BACKEND["model"],
                "base_url": BACKEND["base_url"],
                "api_key_set": bool(BACKEND["api_key"]),
                "docs_loaded": len(_uploaded_docs),
                "doc_names": [d["name"] for d in _uploaded_docs],
            })
            return
        if self.path == "/api/source-material":
            # Return the current source material built from uploaded docs
            sections = []
            for doc in _uploaded_docs:
                # Truncate each doc to ~8000 chars for the source material
                text = doc["text"]
                if len(text) > 8000:
                    text = text[:8000] + "\n\n[... content truncated for length ...]"
                sections.append({
                    "heading": doc["name"],
                    "body": text,
                })
            self._send_json(200, {
                "ok": True,
                "title": "Uploaded Documents",
                "sections": sections,
            })
            return
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/generate":
            self._handle_generate()
            return
        if self.path == "/api/upload":
            self._handle_upload()
            return
        self._send_json(404, {"ok": False, "error": "Unknown endpoint"})

    def _handle_generate(self):
        """Forward a chat request to the configured OpenAI-compatible backend."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, TypeError):
            self._send_json(400, {"ok": False, "error": "Invalid JSON body"})
            return

        messages = req.get("messages")
        if not isinstance(messages, list) or not messages:
            self._send_json(400, {"ok": False, "error": "messages[] required"})
            return

        payload = {
            "model": BACKEND["model"],
            "messages": messages,
            "temperature": req.get("temperature", 0.4),
            "stream": False,
        }
        if req.get("json"):
            payload["response_format"] = {"type": "json_object"}
        if req.get("max_tokens"):
            payload["max_tokens"] = req["max_tokens"]

        url = BACKEND["base_url"].rstrip("/") + "/chat/completions"
        headers = {"Content-Type": "application/json"}
        if BACKEND["api_key"]:
            headers["Authorization"] = "Bearer " + BACKEND["api_key"]

        started = time.time()
        try:
            http_req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(http_req, timeout=LLM_TIMEOUT_S) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:500]
            self._send_json(502, {"ok": False, "error": f"Backend {e.code}", "detail": detail})
            return
        except urllib.error.URLError as e:
            self._send_json(502, {"ok": False, "error": f"Cannot reach model backend: {e.reason}"})
            return
        except Exception as e:
            self._send_json(500, {"ok": False, "error": str(e)})
            return

        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            self._send_json(502, {"ok": False, "error": "Unexpected backend response", "detail": str(data)[:500]})
            return

        self._send_json(200, {
            "ok": True,
            "content": content,
            "model": BACKEND["model"],
            "ms": int((time.time() - started) * 1000),
        })

    def _handle_upload(self):
        """Accept uploaded documents, extract text, store as source material."""
        global _uploaded_docs

        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            self._send_json(400, {"ok": False, "error": "Expected multipart/form-data"})
            return

        # Parse multipart form data
        boundary = content_type.split("boundary=")[1].strip()
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))

        # Simple multipart parser
        files = []
        boundary_bytes = boundary.encode()
        parts = body.split(b"--" + boundary_bytes)
        for part in parts:
            if b"Content-Disposition" not in part:
                continue
            headers_end = part.find(b"\r\n\r\n")
            if headers_end == -1:
                continue
            headers_raw = part[:headers_end].decode("utf-8", errors="replace")
            file_data = part[headers_end + 4:]
            # Remove trailing \r\n-- if present
            if file_data.endswith(b"\r\n"):
                file_data = file_data[:-2]

            # Extract filename
            match = re.search(r'filename="([^"]*)"', headers_raw)
            if not match:
                continue
            filename = match.group(1)
            if not filename:
                continue

            # Check size
            if len(file_data) > MAX_UPLOAD_MB * 1024 * 1024:
                self._send_json(413, {"ok": False, "error": f"{filename} exceeds {MAX_UPLOAD_MB}MB limit"})
                return

            text = extract_text(filename, file_data)
            files.append({"name": filename, "text": text, "size": len(file_data)})

        if not files:
            self._send_json(400, {"ok": False, "error": "No valid files found in upload"})
            return

        _uploaded_docs = files
        self._send_json(200, {
            "ok": True,
            "files": [{"name": f["name"], "size": f["size"], "chars": len(f["text"])} for f in files],
            "total_chars": sum(len(f["text"]) for f in files),
        })

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or "") or (args and str(args[1]).startswith(("4", "5"))):
            super().log_message(fmt, *args)


def main():
    UPLOAD_DIR.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Epictetus on http://localhost:{PORT}")
    print(f"  model backend : {BACKEND['model']}  @ {BACKEND['base_url']}")
    print(f"  api key set   : {bool(BACKEND['api_key'])}")
    print(f"  upload dir    : {UPLOAD_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
