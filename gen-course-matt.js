/* gen-course-matt.js — generate a course from Matt Pocock's Teach methodology */

"use strict";
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = __dirname;

const SOURCE_MATERIAL = new Function(
  fs.readFileSync(path.join(ROOT, "source-material.js"), "utf8") + "\nreturn SOURCE_MATERIAL;"
)();

const SUBTOPICS = [
  {
    id: "stateful-teaching",
    title: "Why Stateful Teaching Wins",
    focus: "the difference between stateful and stateless skills, why Matt chose stateful for Teach, the teaching workspace structure (mission, resources, lessons, learning records, glossary, cheat sheets, notes), and why the file system IS the teacher's memory."
  },
  {
    id: "zpd-and-lessons",
    title: "Zone of Proximal Development & Lesson Design",
    focus: "ZPD as the teacher's compass — teaching at the exact edge of capability, why this requires state to work, lesson design principles: short and focused, HTML over markdown for interactivity, diagrams and quizzes, and how every lesson builds on the glossary."
  },
  {
    id: "knowledge-skills-wisdom",
    title: "The Three Pillars: Knowledge, Skills, Wisdom",
    focus: "Knowledge from high-trust primary sources, Skills through interactive HTML exercises (tap-through, guided mode), Wisdom through community handoff — the agent's default posture to answer then delegate, and the philosophy that the product should launch users into the world, not trap them."
  },
  {
    id: "mission-and-handoff",
    title: "Mission-Driven Design & The Community Handoff",
    focus: "starting with WHY before any content, how the mission shapes every decision, the onboarding killer use case (personalized workspace, self-directed learning, faster productivity), and Matt's larger vision: developers as first movers bringing AI skills to other domains."
  }
];

function sourceBlock() {
  const text = (SOURCE_MATERIAL.text || "").trim();
  const lines = (SOURCE_MATERIAL.keyLines || [])
    .map((l) => `- ${l.name}: ${l.moves}  (${l.idea})`)
    .join("\n");
  return (
    "SOURCE MATERIAL (your single source of truth — teach only from this):\n" +
    '"""\n' + text + '\n"""\n\n' +
    (lines ? "KEY LINES (reuse these for interactive elements):\n" + lines + "\n\n" : "")
  );
}

function buildPrompt(sub, n) {
  const system =
    "You are a master teacher writing lesson " + n + " of a course on building AI teaching systems, based on Matt Pocock's Teach skill methodology. " +
    "Beyond recall: every knowledge check must test UNDERSTANDING or APPLICATION, and every wrong option must capture a " +
    "REAL, specific misconception about AI teaching design.\n\n" +
    "Return ONLY a JSON object with this exact shape:\n" +
    "{\n" +
    '  "id": "kebab", "title": "...", "subtitle": "one short line",\n' +
    '  "steps": [\n' +
    '    { "type": "teach", "title": "...", "body": "1-3 sentences; may use <strong>/<em>" },\n' +
    '    { "type": "teach", "title": "...", "body": "...", "example": "concrete example from Matt Pocock" },\n' +
    '    { "type": "check", "concept": "kebab", "question": "...",\n' +
    '      "options": [ {"text":"...","correct":true,"insight":"..."},\n' +
    '                   {"text":"...","correct":false,"miss":"kebab","insight":"..."} ] }\n' +
    "  ]\n}\n\n" +
    "LESSON RULES:\n" +
    "- 7-8 steps; open with a motivating 'teach', include concrete examples from Matt's experience, end with a summarizing 'teach'.\n" +
    "- Keep every 'body' to 1-2 short sentences so the whole JSON stays compact.\n" +
    "- 3 'check' steps; each tests understanding (never recall), exactly one correct option, every wrong option has a kebab 'miss' + an 'insight'.\n" +
    "- Use the KEY LINES from the source material as the basis for interactive elements.\n" +
    "- No markdown, no code fences, JSON only.\n\n" +
    "GROUNDING — MOST IMPORTANT: the SOURCE MATERIAL below is your SINGLE SOURCE OF TRUTH. Teach ONLY what it states or " +
    "directly implies; never invent theory, never add concepts Matt didn't discuss. Base each wrong option on a " +
    "misconception the source warns about.";
  const user =
    sourceBlock() +
    `Write lesson ${n}, focused on: ${sub.focus}\n` +
    "Ground everything in the source material above. Return a single JSON object now.";
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

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

// Validation (from authoring.js)
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
    return null;
  }
}
function validateLesson(obj, sub) {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.steps)) return { ok: false, error: "missing steps[]" };
  const steps = [];
  for (const s of obj.steps) {
    if (!s || typeof s !== "object") continue;
    if (s.type === "teach") {
      if (isStr(s.title) && isStr(s.body)) {
        const step = { type: "teach", title: s.title.trim(), body: s.body.trim() };
        if (isStr(s.example)) step.example = s.example.trim();
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
  return {
    ok: true,
    lesson: {
      id: sub.id,
      title: isStr(obj.title) ? obj.title.trim() : sub.title,
      subtitle: isStr(obj.subtitle) ? obj.subtitle.trim() : "",
      steps,
    },
  };
}

// Run
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
        if (!data) { process.stdout.write("parse failed"); continue; }
        const v = validateLesson(data, sub);
        const secs = ((Date.now() - t0) / 1000).toFixed(0);
        if (!v.ok) { process.stdout.write(`malformed (${v.error}) in ${secs}s`); continue; }
        process.stdout.write(`OK in ${secs}s — ${v.lesson.steps.length} steps`);
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
    "  course-matt-teach.js — course generated from Matt Pocock's Teach skill video\n" +
    "  Source: https://youtu.be/s5T5oQJcJ6U\n" +
    "  Generated by Phren (gen-course-matt.js) from source-material.js\n" +
    "*/\n";
  const out =
    header +
    "const MATT_TEACH_COURSE = " + JSON.stringify(lessons, null, 2) + ";\n\n" +
    'if (typeof window !== "undefined") window.MATT_TEACH_COURSE = MATT_TEACH_COURSE;\n';
  fs.writeFileSync(path.join(ROOT, "course-matt-teach.js"), out);
  console.log(`\n\nWrote course-matt-teach.js with ${lessons.length} lessons.`);
})();
