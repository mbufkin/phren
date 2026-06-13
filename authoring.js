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
    "GROUNDING \u2014 THIS IS THE MOST IMPORTANT RULE:\n" +
    "- The SOURCE MATERIAL provided in the user message is your SINGLE SOURCE OF TRUTH.\n" +
    "- Teach ONLY concepts, facts, and ideas that are stated in, or follow directly from, " +
    "that source. Do NOT add outside knowledge, invent examples, or contradict the source.\n" +
    "- If the source doesn't cover something, leave it out rather than guessing.\n" +
    "- Ground every knowledge check in a fact from the source, and base each wrong option on a " +
    "plausible but incorrect interpretation a learner might make.\n" +
    "- Every distractor for a knowledge check should map to a specific section of the source " +
    "so a wrong answer tells the learner exactly where to restudy.";

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
    setAuthorStatus("loading", `Your AI teacher is writing a lesson on \u201c${escapeHtml(subject)}\u201d\u2026 this can take a moment.`);

    const res = await LLM.generateJSON(buildAuthorPrompt(subject, level), { maxTokens: 1800, temperature: 0.6 });
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
      "- 7 to 9 steps total. Start with a 'teach' that motivates the topic.\n" +
      "- Step 2 (or 3) MUST be a 'teach' that walks through ONE concrete, illustrative worked example BEFORE any abstract rules \u2014 " +
      "like a textbook that opens a chapter with a fully worked example or model scenario, narrating it step by step. " +
      "Only after that example should you generalize into the underlying principles.\n" +
      "- End with a 'teach' that summarizes what the learner now understands.\n" +
      "- Include 3 or 4 'check' steps, spread between teaching cards.\n" +
      "- Each 'check' has 3 or 4 options with EXACTLY ONE correct:true. Every wrong option needs a short 'miss' tag and an 'insight'.\n" +
      "- 'concept' and 'miss' are short kebab-case tags (e.g. 'confuses-cause-effect').\n" +
      "- No markdown, no code fences, no commentary \u2014 JSON only. Do NOT include any 'move' steps or 'board' fields.\n\n" +
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
          // A teach step may carry an interactive board walkthrough. We validate
          // it defensively so a malformed board is dropped (text still shows)
          // rather than crashing the replay widget.
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
        // Enforce exactly one correct answer.
        const correctCount = opts.filter((o) => o.correct).length;
        if (correctCount === 0) continue;              // unusable — drop this check
        if (correctCount > 1) {                         // keep first true, demote rest
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

  // Validate/repair a teach step's `board` directive (a ChessReplay walkthrough).
  // Returns a clean board, or null if it isn't a usable walkthrough. The replay
  // widget applies from->to blindly, so we at least guarantee real board squares
  // and a sane length; we can't fully verify legality client-side.
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
      if (!sq.test(from) || !sq.test(to)) continue; // drop bad coordinates
      line.push({
        from,
        to,
        san: isStr(m.san) ? m.san.trim() : "",
        note: isStr(m.note) ? m.note.trim() : "",
      });
    }
    if (line.length < 2) return null; // too short to "work through"
    return { startFen, line: line.slice(0, 24) };
  }

  function setAuthorBusy(busy) {
    if (!els.authorBtn) return;
    els.authorBtn.disabled = busy;
    els.authorBtn.classList.toggle("opacity-50", busy);
    els.authorBtn.classList.toggle("cursor-not-allowed", busy);
    els.authorBtn.innerHTML = busy
      ? '<svg class="spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg> Writing…'
      : "Generate lesson";
  }

  function setAuthorStatus(kind, html) {
    if (!els.authorStatus) return;
    const color = { error: "text-red-400", loading: "text-slate-300", success: "text-green-400" }[kind] || "text-slate-400";
    els.authorStatus.className = `mt-3 text-sm ${color}`;
    els.authorStatus.innerHTML = html;
  }

  // ---- Author the NEXT lesson in a sequence (model-generated progression) ----
  // `seed` lets the home "Continue" button drive this AFTER a page reload, when
  // the just-finished run is no longer in memory: we reconstruct the context
  // (previous title + weak spots) from the saved progress log instead.
  async function generateNextLesson(seed) {
    S.nextSeed = seed || null;
    LT.show("review");
    els.reviewBody.innerHTML = `
      <div class="rounded-2xl bg-slate-900 border border-white/5 p-8 text-center">
        <svg class="spin w-8 h-8 mx-auto text-brand-400 mb-4" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/>
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        </svg>
        <p class="text-white font-semibold">Building your next lesson…</p>
        <p class="text-slate-400 text-sm mt-1">Written from your source material, advancing from what you just learned with extra focus on your weak spots.</p>
      </div>`;

    const backToReview = () => LT.Review.renderReview(S.lastResult, S.lastSummary);

    const h = await LLM.health();
    if (!h.ok) {
      els.reviewBody.innerHTML = `<div class="rounded-2xl bg-slate-900 border border-white/5 p-6 text-center">
        <p class="text-red-400 font-semibold">The AI model is offline, so the next lesson can't be generated.</p>
        <button id="back-btn" class="mt-4 bg-transparent border border-white/10 text-slate-300 hover:bg-white/5 font-semibold px-5 py-2.5 rounded-xl transition">Back to review</button></div>`;
      document.getElementById("back-btn").addEventListener("click", backToReview);
      return;
    }

    const res = await LLM.generateJSON(buildNextLessonPrompt(), { maxTokens: 2800, temperature: 0.5 });
    if (!res.ok) {
      els.reviewBody.innerHTML = `<div class="rounded-2xl bg-slate-900 border border-white/5 p-6 text-center">
        <p class="text-red-400 font-semibold">Couldn't generate the next lesson: ${escapeHtml(res.error || "unknown error")}.</p>
        <button id="back-btn" class="mt-4 bg-transparent border border-white/10 text-slate-300 hover:bg-white/5 font-semibold px-5 py-2.5 rounded-xl transition">Back to review</button></div>`;
      document.getElementById("back-btn").addEventListener("click", backToReview);
      return;
    }
    const v = validateLesson(res.data, ((S.activeLesson && S.activeLesson.title) || "Next") + " — next lesson");
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
    els.reviewBody.innerHTML = `
      <div class="rounded-2xl bg-slate-900 border border-white/5 p-8 text-center">
        <svg class="spin w-8 h-8 mx-auto text-brand-400 mb-4" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/>
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        </svg>
        <p class="text-white font-semibold">Building your first lesson\u2026</p>
        <p class="text-slate-400 text-sm mt-1">Reading your documents and writing a lesson grounded entirely in your source material. This may take a moment on the local model.</p>
      </div>`;

    const h = await LLM.health();
    if (!h.ok) {
      els.reviewBody.innerHTML = `<div class="rounded-2xl bg-slate-900 border border-white/5 p-6 text-center">
        <p class="text-red-400 font-semibold">The AI model is offline. Please check that the server is running and the Lenovo is reachable.</p></div>`;
      return;
    }

    const res = await LLM.generateJSON(await buildFirstLessonPrompt(), { maxTokens: 2800, temperature: 0.6 });
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
      "- 7-9 steps; open with a motivating 'teach', include 3-4 'check' steps, end with a summarizing 'teach'.\n" +
      "- Every 'check' tests understanding/application (never recall), has exactly one correct option.\n" +
      "- Wrong options map to specific sections of the source so the learner knows where to restudy.\n" +
      "- No markdown, no code fences, JSON only.\n\n" +
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
      "BOARD RULES (follow EXACTLY or the board renders wrong):\n" +
      "- startFen is almost always the standard starting position string shown above (begin lines from move 1).\n" +
      "- Each entry in \"line\" is ONE ply (one side's move), given in legal order from the start position.\n" +
      "- \"from\"/\"to\" are the actual board squares (a1-h8) of the piece that moves, e.g. the knight g1->f3.\n" +
      "- For castling, move ONLY the king: white e1->g1 (O-O) or e1->c1 (O-O-O); black e8->g8 or e8->c8.\n" +
      "- Use 8-16 plies per line. \"san\" is the move label (e.g. \"3. e3\"); \"note\" is one short idea.\n" +
      "- Use only real, legal London System moves in a sensible order — never invent illegal moves.\n\n" +
      "LESSON RULES:\n" +
      "- 7-9 steps; open with a motivating 'teach', put a board walkthrough EARLY (a model line before abstract rules), " +
      "include a second board later, and end with a summarizing 'teach'.\n" +
      "- 3-4 'check' steps spread between teaching; each tests understanding/application (never recall), has exactly one " +
      "correct option, and every wrong option has a short kebab 'miss' tag + an 'insight'.\n" +
      "- No markdown, no code fences, JSON only. Do NOT use any 'move' steps — use 'board' walkthroughs instead.\n\n" +
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
