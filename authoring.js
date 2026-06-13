/*
  authoring.js — the FIRST "AI as teacher" boundary: writing lessons.

  The model authors a whole lesson (teaching cards + misconception-tagged
  knowledge checks), or the NEXT lesson in a sequence. We always validate/repair
  the JSON before running it, so a half-broken generation can never crash the
  engine. Authored lessons then run through the exact same engine + telemetry +
  review as the hand-authored ones.
*/
(function (LT) {
  "use strict";

  const S = LT.S;
  const els = LT.els;
  const { escapeHtml, isStr, slug } = LT;

  // ---- Grounding: uploaded documents are the model's SINGLE SOURCE OF TRUTH ----
  // Every lesson the AI writes is built FROM the uploaded corpus, not from the
  // model's own knowledge. We pass the text in and enforce a strict contract:
  // teach only what the source supports, never invent theory.

  // Cached source material fetched from /api/source-material
  let _sourceCache = null;

  async function fetchSourceMaterial() {
    if (_sourceCache) return _sourceCache;
    try {
      const resp = await fetch('/api/source-material');
      const data = await resp.json();
      if (data.ok) {
        _sourceCache = data;
        return data;
      }
    } catch (e) { /* fall through to static fallback */ }
    // Fallback to static SOURCE_MATERIAL if server not available
    const sm = window.SOURCE_MATERIAL;
    return { title: sm.title, sections: sm.sections || [] };
  }

  function sourceText() {
    // Synchronous fallback for initial render — uses static SOURCE_MATERIAL
    const sm = window.SOURCE_MATERIAL;
    if (!sm || !Array.isArray(sm.sections) || !sm.sections.length) return "";
    return sm.sections.map(s => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  }

  async function sourceTextAsync() {
    const data = await fetchSourceMaterial();
    if (!data.sections || !data.sections.length) return "";
    return data.sections.map(s => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  }

  // The grounding contract, appended to every authoring system prompt.
  const GROUNDING_RULES =
    "GROUNDING \u2014 MOST IMPORTANT:\n" +
    "- Teach ONLY from the SOURCE MATERIAL below. No outside knowledge, no invented examples.\n" +
    "- Every knowledge check must be answerable from the source. Wrong options = real misconceptions.\n" +
    "- If the source doesn't cover something, leave it out.";

  // Builds the "SOURCE MATERIAL" block placed at the top of the user message.
  function sourceBlock() {
    const text = sourceText();
    if (!text) return "";
    return (
      "SOURCE MATERIAL (your single source of truth \u2014 teach only from this):\n" +
      '"""\n' + text + '\n"""\n'
    );
  }

  async function sourceBlockAsync() {
    const text = await sourceTextAsync();
    if (!text) return "";
    return (
      "SOURCE MATERIAL (your single source of truth \u2014 teach only from this):\n" +
      '"""\n' + text + '\n"""\n'
    );
  }

  // ---- Author a lesson from a typed subject ----
  async function generateLesson() {
    const subject = (els.authorSubject.value || "").trim();
    const level = els.authorLevel ? els.authorLevel.value : "complete beginner";
    if (subject.length < 2) {
      setAuthorStatus("error", "Type a topic first — anything you'd like to learn.");
      return;
    }

    const h = await LLM.health();
    if (!h.ok) {
      setAuthorStatus("error", "The AI model is offline, so a lesson can't be written right now.");
      return;
    }

    setAuthorBusy(true);
    const stopProgress = startProgress(els.authorStatus,
      `Your AI teacher is writing a lesson on \u201c${escapeHtml(subject)}\u201d\u2026`);

    const res = await LLM.generateJSON(buildAuthorPrompt(subject, level), { maxTokens: 1800, temperature: 0.6 });
    stopProgress();
    setAuthorBusy(false);

    if (!res.ok) {
      setAuthorStatus("error", "Couldn't get a lesson back: " + (res.error || "unknown error") + ". Try again.");
      return;
    }
    const v = validateLesson(res.data, subject);
    if (!v.ok) {
      setAuthorStatus("error", "The lesson came back malformed (" + v.error + "). Try generating again.");
      return;
    }
    setAuthorStatus("success", `Lesson ready in ${(res.ms / 1000).toFixed(1)}s \u2014 starting\u2026`);
    LT.startLesson(v.lesson);
  }

  async function buildAuthorPrompt(subject, level) {
    const system =
      "You are a master teacher who designs short, interactive micro-lessons. " +
      "You write for the LEARNER, in plain, encouraging language. Your lessons go beyond recall: " +
      "every knowledge check must test UNDERSTANDING or APPLICATION, and every wrong option must capture a " +
      "REAL, specific misconception a learner of this level would actually have.\n\n" +
      "Return ONLY a JSON object with this exact shape:\n" +
      "{\n" +
      '  "id": "kebab-case-id",\n' +
      '  "title": "Lesson title",\n' +
      '  "subtitle": "one short line",\n' +
      '  "steps": [\n' +
      '    { "type": "teach", "title": "...", "body": "1-3 sentences; you may use <strong> and <em>" },\n' +
      '    { "type": "check", "concept": "kebab-tag", "question": "...",\n' +
      '      "options": [\n' +
      '        { "text": "...", "correct": true,  "insight": "why this is right (1 sentence)" },\n' +
      '        { "text": "...", "correct": false, "miss": "kebab-misconception-tag", "insight": "the specific misunderstanding this reveals (1 sentence)" }\n' +
      "      ] }\n" +
      "  ]\n" +
      "}\n\n" +
      "RULES:\n" +
      "- 7-9 steps; open with motivation, include 3-4 checks, end with summary.\n" +
      "- Step 2 or 3 MUST be a concrete worked example BEFORE abstract rules.\n" +
      "- Checks test understanding/application, never recall. Exactly one correct option per check.\n" +
      "- Wrong options = kebab miss tag + insight sentence.\n" +
      "- JSON only, no markdown, no code fences.\n\n" +
      GROUNDING_RULES;
    const source = await sourceBlockAsync();
    const user =
      source +
      `Focus the lesson on this aspect of the source material: ${subject}\n` +
      `Learner level: ${level}\n` +
      "Write the lesson now as a single JSON object, grounded entirely in the source material above.";
    return [{ role: "system", content: system }, { role: "user", content: user }];
  }

  // Defensive validation + light repair — models occasionally fumble the schema,
  // and a half-broken lesson should never crash the run.
  function validateLesson(obj, subject) {
    if (!obj || typeof obj !== "object") return { ok: false, error: "not an object" };
    if (!Array.isArray(obj.steps)) return { ok: false, error: "missing steps[]" };

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
        let opts = s.options
          .filter((o) => o && isStr(o.text))
          .map((o) => ({
            text: o.text.trim(),
            correct: o.correct === true,
            miss: isStr(o.miss) ? o.miss.trim() : undefined,
            insight: isStr(o.insight) ? o.insight.trim() : "",
          }));
        if (opts.length < 2) continue;
        const correctCount = opts.filter((o) => o.correct).length;
        if (correctCount === 0) continue;
        if (correctCount > 1) {
          let seen = false;
          opts = opts.map((o) => (o.correct && !seen ? ((seen = true), o) : { ...o, correct: false }));
        }
        steps.push({
          type: "check",
          concept: isStr(s.concept) ? s.concept.trim() : "concept",
          question: s.question.trim(),
          options: opts,
        });
      }
    }

    if (steps.length < 3) return { ok: false, error: "too few valid steps" };
    if (!steps.some((s) => s.type === "check")) return { ok: false, error: "no usable knowledge checks" };

    return {
      ok: true,
      lesson: {
        id: isStr(obj.id) ? obj.id.trim() : slug(subject),
        title: isStr(obj.title) ? obj.title.trim() : subject,
        subtitle: isStr(obj.subtitle) ? obj.subtitle.trim() : "",
        steps,
      },
    };
  }

  function validateBoard(b) {
    if (!b || typeof b !== "object") return null;
    if (!Array.isArray(b.line)) return null;
    const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
    const startFen = isStr(b.startFen) ? b.startFen.trim() : START;
    const sq = /^[a-h][1-8]$/;
    const line = [];
    for (const m of b.line) {
      if (!m || typeof m !== "object") continue;
      const from = isStr(m.from) ? m.from.trim().toLowerCase() : "";
      const to = isStr(m.to) ? m.to.trim().toLowerCase() : "";
      if (!sq.test(from) || !sq.test(to)) continue;
      line.push({
        from, to,
        san: isStr(m.san) ? m.san.trim() : "",
        note: isStr(m.note) ? m.note.trim() : "",
      });
    }
    if (line.length < 2) return null;
    return { startFen, line: line.slice(0, 24) };
  }

  function setAuthorBusy(busy) {
    if (!els.authorBtn) return;
    els.authorBtn.disabled = busy;
    els.authorBtn.classList.toggle("opacity-50", busy);
    els.authorBtn.classList.toggle("cursor-not-allowed", busy);
    els.authorBtn.innerHTML = busy
      ? '<svg class="spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg> Writing\u2026'
      : "Generate lesson";
  }

  function setAuthorStatus(kind, html) {
    if (!els.authorStatus) return;
    const color = { error: "text-red-400", loading: "text-slate-300", success: "text-green-400" }[kind] || "text-slate-400";
    els.authorStatus.className = `mt-3 text-sm ${color}`;
    els.authorStatus.innerHTML = html;
  }

  // ---- Progress timer — gives the user a sense of what's happening ----
  // during multi-minute LLM calls. Call startProgress(containerEl, baseLabel)
  // to begin ticking elapsed seconds; returns a stop function.
  function startProgress(el, baseLabel) {
    const t0 = Date.now();
    const stages = [
      { at: 5, label: "Reading your documents\u2026" },
      { at: 15, label: "The model is thinking \u2014 local models need a moment\u2026" },
      { at: 45, label: "Still working \u2014 larger lessons take longer to write\u2026" },
      { at: 90, label: "Almost there \u2014 validating the response\u2026" },
    ];
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      let stage = baseLabel;
      for (let i = stages.length - 1; i >= 0; i--) {
        if (elapsed >= stages[i].at) { stage = stages[i].label; break; }
      }
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      el.innerHTML = `<span class="text-slate-300">${stage}</span> <span class="text-slate-500 font-mono text-xs ml-1">(${timeStr})</span>`;
    }, 1000);
    return () => { clearInterval(timer); };
  }

  // ---- Author the NEXT lesson in a sequence ----
  async function generateNextLesson(seed) {
    S.nextSeed = seed || null;
    LT.show("review");
    const stopProgress = startProgress(els.reviewBody, "Building your next lesson\u2026");

    const backToReview = () => LT.Review.renderReview(S.lastResult, S.lastSummary);

    const h = await LLM.health();
    if (!h.ok) {
      stopProgress();
      els.reviewBody.innerHTML = `<div class="rounded-2xl bg-slate-900 border border-white/5 p-6 text-center">
        <p class="text-red-400 font-semibold">The AI model is offline, so the next lesson can't be generated.</p>
        <button id="back-btn" class="mt-4 bg-transparent border border-white/10 text-slate-300 hover:bg-white/5 font-semibold px-5 py-2.5 rounded-xl transition">Back to review</button></div>`;
      document.getElementById("back-btn").addEventListener("click", backToReview);
      return;
    }

    const res = await LLM.generateJSON(buildNextLessonPrompt(), { maxTokens: 2800, temperature: 0.5 });
    stopProgress();
    if (!res.ok) {
      els.reviewBody.innerHTML = `<div class="rounded-2xl bg-slate-900 border border-white/5 p-6 text-center">
        <p class="text-red-400 font-semibold">Couldn't generate the next lesson: ${escapeHtml(res.error || "unknown error")}.</p>
        <button id="back-btn" class="mt-4 bg-transparent border border-white/10 text-slate-300 hover:bg-white/5 font-semibold px-5 py-2.5 rounded-xl transition">Back to review</button></div>`;
      document.getElementById("back-btn").addEventListener("click", backToReview);
      return;
    }
    const v = validateLesson(res.data, ((S.activeLesson && S.activeLesson.title) || "Next") + " \u2014 next lesson");
    if (!v.ok) {
      els.reviewBody.innerHTML = `<div class="rounded-2xl bg-slate-900 border border-white/5 p-6 text-center">
        <p class="text-red-400 font-semibold">The next lesson came back malformed (${escapeHtml(v.error)}).</p>
        <button id="retry-btn" class="mt-4 bg-brand-500 hover:bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-xl transition mr-2">Try again</button>
        <button id="back-btn" class="mt-4 bg-transparent border border-white/10 text-slate-300 hover:bg-white/5 font-semibold px-5 py-2.5 rounded-xl transition">Back to review</button></div>`;
      document.getElementById("retry-btn").addEventListener("click", generateNextLesson);
      document.getElementById("back-btn").addEventListener("click", backToReview);
      return;
    }
    LT.startLesson(v.lesson);
  }

  // ---- Author the FIRST lesson from uploaded source material ----
  async function generateFirstLesson() {
    LT.show("review");
    const stopProgress = startProgress(els.reviewBody, "Building your first lesson\u2026");

    const h = await LLM.health();
    if (!h.ok) {
      stopProgress();
      els.reviewBody.innerHTML = `<div class="rounded-2xl bg-slate-900 border border-white/5 p-6 text-center">
        <p class="text-red-400 font-semibold">The AI model is offline. Please check that the server is running and the Lenovo is reachable.</p></div>`;
      return;
    }

    const res = await LLM.generateJSON(await buildFirstLessonPrompt(), { maxTokens: 2800, temperature: 0.6 });
    stopProgress();
    if (!res.ok) {
      els.reviewBody.innerHTML = `<div class="rounded-2xl bg-slate-900 border border-white/5 p-6 text-center">
        <p class="text-red-400 font-semibold">Couldn't generate the lesson: ${escapeHtml(res.error || "unknown error")}.</p></div>`;
      return;
    }
    const v = validateLesson(res.data, "Introduction");
    if (!v.ok) {
      els.reviewBody.innerHTML = `<div class="rounded-2xl bg-slate-900 border border-white/5 p-6 text-center">
        <p class="text-red-400 font-semibold">The lesson came back malformed: ${escapeHtml(v.error)}. Try generating again.</p></div>`;
      return;
    }
    LT.startLesson(v.lesson);
  }

  async function buildFirstLessonPrompt() {
    const system =
      "You are a master teacher designing the FIRST lesson in a course built from the learner's provided documents. " +
      "This is an overview/introduction lesson \u2014 give the learner a broad understanding of what's in their documents " +
      "and the key concepts they'll master. Do NOT try to cover everything; this is lesson 1 of a sequence.\n\n" +
      "Return ONLY a JSON object with this exact shape:\n" +
      "{\n" +
      '  "id": "kebab-case-id", "title": "...", "subtitle": "one short line",\n' +
      '  "steps": [\n' +
      '    { "type": "teach", "title": "...", "body": "1-3 sentences; may use <strong>/<em>" },\n' +
      '    { "type": "check", "concept": "kebab", "question": "...",\n' +
      '      "options": [ {"text":"...","correct":true,"insight":"..."},\n' +
      '                   {"text":"...","correct":false,"miss":"kebab","insight":"..."} ] }\n' +
      "  ]\n" +
      "}\n\n" +
      "RULES:\n" +
      "- 7-9 steps; open with motivation, include 3-4 checks, end with summary.\n" +
      "- Checks test understanding/application, never recall. Exactly one correct option.\n" +
      "- Wrong options map to specific source sections.\n" +
      "- JSON only, no markdown, no code fences.\n\n" +
      GROUNDING_RULES;
    const source = await sourceBlockAsync();
    const user =
      source +
      "This is the FIRST lesson. Give an overview of the documents \u2014 what topics they cover, " +
      "the main ideas, and what the learner will understand by the end. " +
      "Write the lesson now as a single JSON object, grounded entirely in the source material above.";
    return [{ role: "system", content: system }, { role: "user", content: user }];
  }

  function buildNextLessonPrompt() {
    const seed = S.nextSeed || null;
    const prevTitle = (seed && seed.title) || (S.activeLesson && S.activeLesson.title) || "the previous topic";
    const focus = (seed && seed.focus) ||
      ((S.lastReviewData && Array.isArray(S.lastReviewData.focus)) ? S.lastReviewData.focus.join("; ") : "");
    const nextStep = (S.lastReviewData && S.lastReviewData.nextStep) || "";
    const missedConcepts = (seed && seed.missed) || S.missedSteps.map((s) => s.concept).filter(Boolean).join(", ");

    const system =
      "You are a master chess teacher designing the NEXT lesson in a London System course. It must ADVANCE the " +
      "learner to a new, more advanced or adjacent London topic — never repeat the lesson they just finished. Weave " +
      "in extra practice on their weak spots.\n\n" +
      "CRITICAL: this is a CHESS course — the learner must SEE and step through positions. So the lesson MUST include " +
      "at least TWO interactive board walkthroughs: a 'teach' step carrying a \"board\" object with a move-by-move " +
      "line the learner can play through (an example/model game).\n\n" +
      "Return ONLY a JSON object with this exact shape:\n" +
      "{\n" +
      '  "id": "kebab-case-id", "title": "...", "subtitle": "one short line",\n' +
      '  "steps": [\n' +
      '    { "type": "teach", "title": "...", "body": "1-3 sentences; may use <strong>/<em>" },\n' +
      '    { "type": "teach", "title": "...", "body": "...", "board": {\n' +
      '        "startFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",\n' +
      '        "line": [\n' +
      '          { "from": "d2", "to": "d4", "san": "1. d4", "note": "short idea" },\n' +
      '          { "from": "d7", "to": "d5", "san": "1... d5", "note": "Black answers" },\n' +
      '          { "from": "c1", "to": "f4", "san": "2. Bf4", "note": "the London bishop" }\n' +
      '        ] } },\n' +
      '    { "type": "check", "concept": "kebab", "question": "...",\n' +
      '      "options": [ {"text":"...","correct":true,"insight":"..."},\n' +
      '                   {"text":"...","correct":false,"miss":"kebab","insight":"..."} ] }\n' +
      "  ]\n" +
      "}\n\n" +
      "BOARD RULES: startFen = standard start; one ply per entry; from/to = real squares a1-h8; " +
      "castling: king e1→g1 or e1→c1; use 8-16 plies; no illegal moves.\n\n" +
      "LESSON RULES:\n" +
      "- 7-9 steps; open with motivation, board walkthrough early, second board later, end with summary.\n" +
      "- 3-4 checks; test understanding, never recall; one correct answer per check; wrong = miss tag + insight.\n" +
      "- JSON only, no markdown, no code fences.\n\n" +
      GROUNDING_RULES;
    const user =
      sourceBlock() +
      `The learner just completed: "${prevTitle}".\n` +
      (focus ? `Coach said to focus on: ${focus}.\n` : "") +
      (nextStep ? `Suggested next step: ${nextStep}.\n` : "") +
      (missedConcepts ? `They specifically missed: ${missedConcepts}.\n` : "They answered everything correctly, so push them a level deeper.\n") +
      "Choose a focused subtopic FROM THE SOURCE MATERIAL above that advances them, and write the next lesson now as a single JSON object.";
    return [{ role: "system", content: system }, { role: "user", content: user }];
  }

  // Public surface other modules call.
  LT.Authoring = { generateLesson, generateFirstLesson, generateNextLesson, validateLesson };
})(window.LT);
