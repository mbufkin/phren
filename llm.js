/*
  llm.js — thin browser client for the same-origin LLM proxy (server.py).

  The browser NEVER talks to NVIDIA/Ollama directly: it always calls our own
  /api/* routes. That keeps the API key server-side and dodges CORS entirely.
*/

const LLM = {
  /* Is a model reachable, and which one? Lets the UI show provenance. */
  async health() {
    try {
      const r = await fetch("/api/health");
      return await r.json();
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  /*
    Send a chat request through the proxy.
      messages : OpenAI-style [{role, content}, ...]
      opts.json: ask the model for a strict JSON object
      opts.maxTokens / opts.temperature: passthrough knobs
    Returns { ok, content, ms } or { ok:false, error }.
  */
  async generate(messages, opts = {}) {
    const body = {
      messages,
      json: !!opts.json,
      temperature: opts.temperature ?? 0.4,
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;

    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        return { ok: false, error: data.error || `HTTP ${r.status}`, detail: data.detail };
      }
      return data;
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  /*
    Convenience: generate and parse a JSON object back. Models sometimes wrap
    JSON in prose or ```json fences, so we defensively extract the object.
  */
  async generateJSON(messages, opts = {}) {
    const res = await this.generate(messages, { ...opts, json: true });
    if (!res.ok) return res;
    const parsed = safeParseJSON(res.content);
    if (!parsed) return { ok: false, error: "Model did not return valid JSON", detail: res.content };
    return { ok: true, data: parsed, ms: res.ms };
  },
};

function safeParseJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { /* fall through */ }
  // Strip code fences / surrounding prose: grab the first {...} block.
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) { return null; }
  }
  return null;
}
