/*
  gen-course.js — one-off tool: pre-generate the first four course lessons.

  Why pre-generate? Generating a grounded lesson takes a couple of minutes, which
  is a poor live experience. This script asks the model to author four progressive
  lessons NOW (each grounded in source-material.js), validates/repairs them exactly
  like authoring.js does in the browser, and writes a static `course-lessons.js`.
  The app then plays those four instantly, in order, before falling back to live
  generation for lesson five onward.

  Run with the proxy already up:   node gen-course.js
*/
"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = __dirname;

// Load the source corpus WITHOUT importing the browser global. We evaluate the
// file in an isolated function scope and return the object it declares.
const SOURCE_MATERIAL = new Function(
  fs.readFileSync(path.join(ROOT, "source-material.js"), "utf8") + "\nreturn SOURCE_MATERIAL;"
)();

// The four progressive subtopics — fixed ids/titles so the course numbering and
// completion tracking stay stable regardless of what the model titles them.
const SUBTOPICS = [
  {
    id: "london-foundations",
    title: "Foundations: the London setup",
    focus:
      "what the London System is, the d4-e3-c3 pawn triangle, and WHY the queen's bishop goes to f4 BEFORE e3 (the active bishop). Cover the standard setup and a natural move order.",
  },
  {
    id: "london-e5-plan",
    title: "The core plan: a knight on e5",
    focus:
      "White's main strategic goal of planting a knight on e5 supported by d4, the kingside buildup (Qf3/Qh5), and the Greek-gift Bxh7+ attacking idea when Black castles.",
  },
  {
    id: "london-qb6",
    title: "Move order & the ...Qb6 counter",
    focus:
      "why modern play prefers 2.Bf4 before committing the knight, and Black's most critical reply: an early ...c5 and ...Qb6 hitting the loose b2-pawn, and how White meets it.",
  },
  {
    id: "london-bishop-choice",
    title: "Bd3 vs Be2 & the fianchetto",
    focus:
      "choosing between Bd3 (aiming at h7) and Be2 — especially when Black fianchettoes with ...g6/...Bg7 which blunts h7 — plus Black's other main setups.",
  },
];

// ---------- the grounded prompt (mirrors authoring.js) ----------
function sourceBlock() {
  const text = (SOURCE_MATERIAL.text || "").trim();
  const lines = (SOURCE_MATERIAL.keyLines || [])
    .map((l) => `- ${l.name}: ${l.moves}  (${l.idea})`)
    .join("\n");
  return (
    "SOURCE MATERIAL (your single source of truth — teach only from this):\n" +
    '"""\n' + text + '\n"""\n\n' +
    (lines ? "KEY LINES (reuse these for board walkthroughs):\n" + lines + "\n\n" : "")
  );
}

function buildPrompt(sub, n) {
  const system =
    "You are a master chess teacher writing lesson " + n + " of a London System course for a near-beginner. " +
    "Beyond recall: every knowledge check must test UNDERSTANDING or APPLICATION, and every wrong option must capture a " +
    "REAL, specific misconception.\n\n" +
    "CRITICAL: this is a CHESS course — the learner must SEE positions. The lesson MUST include at least TWO interactive " +
    "board walkthroughs: a 'teach' step carrying a \"board\" object with a move-by-move line to play through.\n\n" +
    "Return ONLY a JSON object with this exact shape:\n" +
    "{\n" +
    '  "id": "kebab", "title": "...", "subtitle": "one short line",\n' +
    '  "steps": [\n' +
    '    { "type": "teach", "title": "...", "body": "1-3 sentences; may use <strong>/<em>" },\n' +
    '    { "type": "teach", "title": "...", "body": "...", "board": {\n' +
    '        "startFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",\n' +
    '        "line": [ { "from": "d2", "to": "d4", "san": "1. d4", "note": "idea" },\n' +
    '                  { "from": "d7", "to": "d5", "san": "1... d5", "note": "reply" } ] } },\n' +
    '    { "type": "check", "concept": "kebab", "question": "...",\n' +
    '      "options": [ {"text":"...","correct":true,"insight":"..."},\n' +
    '                   {"text":"...","correct":false,"miss":"kebab","insight":"..."} ] }\n' +
    "  ]\n}\n\n" +
    "BOARD RULES (follow EXACTLY or the board renders wrong):\n" +
    "- startFen is the standard starting position string above (begin lines from move 1).\n" +
    "- Each \"line\" entry is ONE ply, in legal order from the start position.\n" +
    "- \"from\"/\"to\" are the real board squares (a1-h8) of the piece that moves.\n" +
    "- For castling, move ONLY the king: e1->g1 (O-O) or e1->c1 (O-O-O); black e8->g8 / e8->c8.\n" +
    "- Use 8-12 plies per line; reuse the KEY LINES above. Keep \"note\" under 8 words. Never invent illegal moves.\n\n" +
    "LESSON RULES:\n" +
    "- 7-8 steps; open with a motivating 'teach', put a board walkthrough EARLY, include a second board later, end with a summarizing 'teach'.\n" +
    "- Keep every 'body' to 1-2 short sentences so the whole JSON stays compact.\n" +
    "- 3 'check' steps; each tests understanding (never recall), exactly one correct option, every wrong option has a kebab 'miss' + an 'insight'.\n" +
    "- No markdown, no code fences, JSON only. Do NOT use any 'move' steps — use 'board' walkthroughs.\n\n" +
    "GROUNDING — MOST IMPORTANT: the SOURCE MATERIAL below is your SINGLE SOURCE OF TRUTH. Teach ONLY what it states or " +
    "directly implies; never invent theory, games, players, or lines, and never contradict it. Base each wrong option on a " +
    "misconception the source warns about.";
  const user =
    sourceBlock() +
    `Write lesson ${n}, focused on: ${sub.focus}\n` +
    "Ground everything in the source material above. Return a single JSON object now.";
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

// ---------- proxy call ----------
function generate(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ messages, max_tokens: 4096, temperature: 0.45 });
    const req = http.request(
      {
        host: "127.0.0.1", port: 8753, path: "/api/generate", method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try { resolve(JSON.parse(d)); }
          catch (e) { reject(new Error("proxy returned non-JSON: " + d.slice(0, 200))); }
        });
      }
    );
    req.setTimeout(310000, () => req.destroy(new Error("proxy timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---------- validation/repair (mirrors authoring.js) ----------
const isStr = (x) => typeof x === "string" && x.trim().length > 0;
function parseLoose(content) {
  let t = String(content).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{");
  if (a > 0) t = t.slice(a);
  try {
    const b = t.lastIndexOf("}");
    return JSON.parse(b >= 0 ? t.slice(0, b + 1) : t);
  } catch (_) {
    // Likely truncated mid-array. Salvage the longest valid prefix by cutting at
    // the last closing bracket and closing any still-open brackets in reverse.
    const repaired = balanceClose(t);
    if (repaired) return JSON.parse(repaired);
    throw _;
  }
}

// Best-effort repair of truncated JSON: trim to the last '}'/']', drop a dangling
// comma, then append the closers for whatever brackets are still open.
function balanceClose(t) {
  const lastClose = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (lastClose < 0) return null;
  let s = t.slice(0, lastClose + 1).replace(/,\s*$/, "");
  const stack = [];
  let inStr = false, esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let closers = "";
  for (let i = stack.length - 1; i >= 0; i--) closers += stack[i] === "{" ? "}" : "]";
  return s + closers;
}
function validateBoard(b) {
  if (!b || typeof b !== "object" || !Array.isArray(b.line)) return null;
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  const startFen = isStr(b.startFen) ? b.startFen.trim() : START;
  const sq = /^[a-h][1-8]$/;
  const line = [];
  for (const m of b.line) {
    if (!m || typeof m !== "object") continue;
    const from = isStr(m.from) ? m.from.trim().toLowerCase() : "";
    const to = isStr(m.to) ? m.to.trim().toLowerCase() : "";
    if (!sq.test(from) || !sq.test(to)) continue;
    line.push({ from, to, san: isStr(m.san) ? m.san.trim() : "", note: isStr(m.note) ? m.note.trim() : "" });
  }
  if (line.length < 2) return null;
  return { startFen, line: line.slice(0, 24) };
}
function validateLesson(obj, sub) {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.steps)) return { ok: false, error: "missing steps[]" };
  const steps = [];
  for (const s of obj.steps) {
    if (!s || typeof s !== "object") continue;
    if (s.type === "teach") {
      if (isStr(s.title) && isStr(s.body)) {
        const step = { type: "teach", title: s.title.trim(), body: s.body.trim() };
        const board = validateBoard(s.board);
        if (board) step.board = board;
        steps.push(step);
      }
    } else if (s.type === "check") {
      if (!isStr(s.question) || !Array.isArray(s.options)) continue;
      let opts = s.options.filter((o) => o && isStr(o.text)).map((o) => ({
        text: o.text.trim(), correct: o.correct === true,
        miss: isStr(o.miss) ? o.miss.trim() : undefined,
        insight: isStr(o.insight) ? o.insight.trim() : "",
      }));
      if (opts.length < 2) continue;
      const correctCount = opts.filter((o) => o.correct).length;
      if (correctCount === 0) continue;
      if (correctCount > 1) { let seen = false; opts = opts.map((o) => (o.correct && !seen ? ((seen = true), o) : { ...o, correct: false })); }
      steps.push({ type: "check", concept: isStr(s.concept) ? s.concept.trim() : "concept", question: s.question.trim(), options: opts });
    }
  }
  if (steps.length < 3) return { ok: false, error: "too few valid steps" };
  if (!steps.some((s) => s.type === "check")) return { ok: false, error: "no checks" };
  const boards = steps.filter((s) => s.board).length;
  return {
    ok: true,
    boards,
    lesson: {
      id: sub.id,
      title: isStr(obj.title) ? obj.title.trim() : sub.title,
      subtitle: isStr(obj.subtitle) ? obj.subtitle.trim() : "",
      steps,
    },
  };
}

// ---------- run ----------
(async function main() {
  const lessons = [];
  for (let i = 0; i < SUBTOPICS.length; i++) {
    const sub = SUBTOPICS[i];
    const n = i + 1;
    let done = null;
    for (let attempt = 1; attempt <= 3 && !done; attempt++) {
      const t0 = Date.now();
      process.stdout.write(`\n[lesson ${n}/${SUBTOPICS.length}] "${sub.title}" — attempt ${attempt}… `);
      try {
        const res = await generate(buildPrompt(sub, n));
        if (!res.ok) { process.stdout.write(`proxy error: ${res.error || "?"}`); continue; }
        const data = parseLoose(res.content);
        const v = validateLesson(data, sub);
        const secs = ((Date.now() - t0) / 1000).toFixed(0);
        if (!v.ok) { process.stdout.write(`malformed (${v.error}) in ${secs}s`); continue; }
        process.stdout.write(`OK in ${secs}s — ${v.lesson.steps.length} steps, ${v.boards} board(s)`);
        done = v.lesson;
      } catch (e) {
        process.stdout.write(`failed: ${e.message}`);
      }
    }
    if (!done) {
      console.error(`\n\nABORT: could not generate lesson ${n} ("${sub.title}") after 3 attempts.`);
      process.exit(1);
    }
    lessons.push(done);
  }

  const header =
    "/*\n" +
    "  course-lessons.js — the first four lessons, PRE-GENERATED by the model\n" +
    "  (NVIDIA NIM) from source-material.js and validated. Generated by gen-course.js.\n" +
    "  The course plays these in order, then falls back to live generation.\n" +
    "  Regenerate any time with:  node gen-course.js\n" +
    "*/\n";
  const out =
    header +
    "const COURSE_LESSONS = " + JSON.stringify(lessons, null, 2) + ";\n\n" +
    'if (typeof window !== "undefined") window.COURSE_LESSONS = COURSE_LESSONS;\n';
  fs.writeFileSync(path.join(ROOT, "course-lessons.js"), out);
  console.log(`\n\nWrote course-lessons.js with ${lessons.length} lessons.`);
})();
