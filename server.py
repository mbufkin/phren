#!/usr/bin/env python3
"""
Local dev server + LLM proxy for the London System tutor.

Why a proxy (and not call the model straight from the browser)?
  1. CORS: browsers block cross-origin calls to the model host. Serving the app
     and proxying the model from the SAME origin sidesteps that entirely.
  2. Secrets: the API key (e.g. OpenCode Zen for "big-pickle") stays server-side
     and is never shipped to the browser.
  3. Backend-agnostic: the frontend always calls same-origin /api/generate. To
     switch models we only change this proxy's config (env vars) — one line — so
     local Ollama today and Big Pickle (OpenCode Zen) later are interchangeable.

Stdlib only — no pip installs, stays a zero-build prototype.

Run:
    python3 server.py                       # defaults to local Ollama
    # Switch to Big Pickle once you've run `opencode auth login`:
    LLM_BASE_URL=https://opencode.ai/zen/v1 \
    LLM_MODEL=big-pickle \
    LLM_API_KEY=$(your_opencode_zen_key) \
    python3 server.py
"""

import json
import os
import time
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


def _load_dotenv(path=".env"):
    """Minimal .env loader (stdlib only — no python-dotenv dependency).

    Why: the API key must stay out of source and out of git. Keeping it in a
    gitignored .env that we load here means `python3 server.py` "just works"
    locally, while the secret never ships in the repo. Real env vars still win
    (we don't overwrite anything already set in the shell).
    """
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


# Load .env BEFORE reading config below, so the values are available.
_load_dotenv()

# --- Backend configuration -------------------------------------------------
# Everything the model call needs lives here. Defaults point at local Ollama's
# OpenAI-compatible endpoint (the same one OpenCode itself uses). Override with
# env vars to target Big Pickle / OpenCode Zen without touching any other code.
BACKEND = {
    "base_url": os.environ.get("LLM_BASE_URL", "http://127.0.0.1:11434/v1"),
    "model": os.environ.get("LLM_MODEL", "gemma4-31b-mlx-48k:latest"),
    "api_key": os.environ.get("LLM_API_KEY", ""),
}

PORT = int(os.environ.get("PORT", "8753"))
# Generous because authoring a full lesson can be a large generation, and the
# review call may run on a big local model that is slow on first (cold) load.
LLM_TIMEOUT_S = int(os.environ.get("LLM_TIMEOUT_S", "300"))


class Handler(SimpleHTTPRequestHandler):
    """Serves static files normally, but intercepts the /api/* routes."""

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Lightweight health/config probe so the UI can show which model is live.
        if self.path == "/api/health":
            self._send_json(200, {
                "ok": True,
                "model": BACKEND["model"],
                "base_url": BACKEND["base_url"],
                # Never leak the key itself — only whether one is configured.
                "api_key_set": bool(BACKEND["api_key"]),
            })
            return
        # Everything else is a static file (index.html, app.js, css, ...).
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/generate":
            self._handle_generate()
            return
        self._send_json(404, {"ok": False, "error": "Unknown endpoint"})

    def _handle_generate(self):
        """Forward a chat request to the configured OpenAI-compatible backend.

        Request body (from the browser):
            { "messages": [...], "temperature"?, "json"?: bool, "max_tokens"? }
        Response:
            { "ok": true, "content": "<model text>", "model": ..., "ms": <int> }
        """
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
        # Ask for strict JSON when the caller needs a parseable object back.
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
            # Most common cause: the model host isn't running / wrong base_url.
            self._send_json(502, {"ok": False, "error": f"Cannot reach model backend: {e.reason}"})
            return
        except Exception as e:  # noqa: BLE001 - surface anything else cleanly to the UI
            self._send_json(500, {"ok": False, "error": str(e)})
            return

        # Pull the assistant text out of the OpenAI-compatible response shape.
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

    def log_message(self, fmt, *args):
        # Quieter logs: skip the noisy static-asset lines, keep API + errors.
        if "/api/" in (self.path or "") or (args and str(args[1]).startswith(("4", "5"))):
            super().log_message(fmt, *args)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"London System tutor on http://localhost:{PORT}")
    print(f"  model backend : {BACKEND['model']}  @ {BACKEND['base_url']}")
    print(f"  api key set   : {bool(BACKEND['api_key'])}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
