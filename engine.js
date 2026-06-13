/*
  engine.js — the lesson runtime and app entry point (loaded last).

  Responsibilities:
    • play a lesson: step through teach / move / check cards
    • validate board moves and give fast, pre-authored feedback
    • DRILL mode: re-practice only the items the learner missed
    • the welcome-screen progress panel (reads LearnerStore)
    • boot wiring (model status, progress, button handlers)

  Authoring lives in authoring.js; the end-of-lesson review lives in review.js.
  All three share state via LT.S (see state.js).
*/
(function (LT) {
  "use strict";

  const S = LT.S;
  const els = LT.els;
  const TWO_COL = LT.TWO_COL;
  const { escapeHtml } = LT;

  // ================= Course flow =================
  // Courses are generated LIVE from uploaded source material via authoring.js.
  // The pre-generated COURSE_LESSONS array is no longer used; every lesson is
  // authored on-demand from the user's documents.

  // Which lessons has the learner already completed? Tracked by lessonId
  // from the persistent log, so it survives reloads.
  function completedLessonIds() {
    return new Set(LearnerStore.history().map((e) => e.lessonId));
  }

  // The single home CTA: generate the first (or next) lesson from uploaded docs.
  function startCourse() {
    const history = LearnerStore.history();
    if (!history.length) {
      // First run — generate a lesson covering the source material overview
      return LT.Authoring.generateFirstLesson();
    }
    // Continuing — generate next lesson based on what they've studied
    const last = history[0] || {};
    LT.Authoring.generateNextLesson({
      title: last.title || "your documents",
      focus: (last.misconceptions || []).join("; "),
      missed: (last.misconceptions || []).join(", "),
    });
  }

  // Keep the home button honest about where the learner is.
  function updateHeroCta() {
    if (!els.start) return;
    const done = LearnerStore.stats().lessons;
    const label = done ? `Continue \u2014 lesson ${done + 1}` : "Generate my course";
    els.start.innerHTML = `${label} <span aria-hidden="true">&rarr;</span>`;
    if (els.heroEyebrow) els.heroEyebrow.textContent = done ? "Welcome back" : "AI-Powered Learning";
    if (els.libraryBtn) els.libraryBtn.hidden = !done;
  }

  // ================= Lesson library (revisit any made lesson) =================
  // Lists completed lessons from the learner's progress log.
  function libraryList() {
    const history = LearnerStore.history();
    if (!Array.isArray(history)) return [];
    // Reverse so newest first, return lesson summaries for replay
    return history.map((entry, i) => ({
      lesson: { id: entry.lessonId, title: entry.title, subtitle: "" },
      num: history.length - i,
      tag: "Completed"
    }));
  }

  function openLibrary() {
    const body = els.libraryBody;
    if (!body) return;
    const done = new Set(LearnerStore.history().map((e) => e.lessonId));
    const items = libraryList();

    const cards = items.map(({ lesson, num, tag }) => {
      const isDone = done.has(lesson.id);
      const badge = isDone
        ? `<span class="inline-flex items-center gap-1 text-xs font-semibold text-green-400">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
             Completed</span>`
        : `<span class="text-xs text-slate-500">Not started</span>`;
      return `
        <div class="rounded-2xl bg-slate-900 border border-white/5 p-5 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-semibold uppercase tracking-widest text-brand-400">${num ? "Lesson " + num : tag}</span>
              ${num ? `<span class="text-[10px] uppercase tracking-wider text-slate-500 border border-white/10 rounded px-1.5 py-0.5">${tag}</span>` : ""}
            </div>
            <h3 class="font-semibold text-white truncate">${escapeHtml(lesson.title || "Lesson")}</h3>
            <p class="text-sm text-slate-400 truncate">${escapeHtml(lesson.subtitle || "")}</p>
          </div>
          <div class="flex flex-col items-end gap-2 shrink-0">
            ${badge}
            <button data-id="${escapeHtml(lesson.id)}" class="lib-play inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              ${isDone ? "Replay" : "Play"} <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>`;
    }).join("");

    body.innerHTML = `
      <div class="flex items-center justify-between mb-5">
        <div>
          <h1 class="display text-2xl font-bold text-white">Your lessons</h1>
          <p class="text-slate-400 text-sm mt-1">Jump back into any lesson that's been made.</p>
        </div>
        <button id="library-back" class="bg-transparent border border-white/10 text-slate-300 hover:bg-white/5 font-semibold px-4 py-2 rounded-xl transition">Back</button>
      </div>
      <div class="space-y-3">${cards || '<p class="text-slate-400">No lessons yet.</p>'}</div>`;

    body.querySelectorAll(".lib-play").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const found = items.find((it) => it.lesson.id === id);
        if (found) startLesson(found.lesson);
      });
    });
    const back = document.getElementById("library-back");
    if (back) back.addEventListener("click", () => { LT.show("welcome"); renderProgress(); });

    LT.show("library");
  }

  // ================= Lesson playback =================
  function startLesson(lessonObj) {
    // Default to whatever was last active (used by Replay).
    S.activeLesson = lessonObj || S.activeLesson;
    S.lesson = S.activeLesson;

    // Randomize answer order. Authoring models (and our hand-authored data) tend
    // to list the correct option FIRST, which makes "always pick A" win. We never
    // trust the source to vary it — we shuffle each check's options in place, once
    // per play. `correct` travels with the option, so scoring is unaffected.
    S.lesson.steps.forEach((step) => {
      if (step.type === "check" && Array.isArray(step.options)) shuffle(step.options);
    });

    S.legend = buildLegend(S.lesson);

    S.telemetry = new Telemetry(S.lesson.id);
    S.stepIndex = 0;
    S.playedSan.length = 0;
    S.mode = "lesson";
    S.missedSteps = [];
    els.moveLog.textContent = "\u2014";
    if (els.lessonTitleMini) els.lessonTitleMini.textContent = S.lesson.title || "Lesson";

    // Board is only built for lessons that actually have move steps. Authored
    // concept lessons (teach + check) collapse to a clean single column.
    const hasBoard = S.lesson.steps.some((s) => s.type === "move");
    if (hasBoard) {
      els.boardCol.hidden = false;
      els.grid.classList.add(TWO_COL);
      S.board = new ChessBoard(document.getElementById("board"), { onMove: handleBoardMove });
      S.board.setPosition(S.lesson.startFen);
      S.board.lock(true);
    } else {
      els.boardCol.hidden = true;
      els.grid.classList.remove(TWO_COL);
      S.board = null;
    }

    S.telemetry.log("lesson_start", { lessonId: S.lesson.id, title: S.lesson.title, steps: S.lesson.steps.length, hasBoard });
    LT.show("lesson");
    renderStep();
  }

  function renderStep() {
    S.currentStep = S.lesson.steps[S.stepIndex];
    els.feedback.innerHTML = "";
    els.controls.innerHTML = "";
    S.awaitingMove = false;

    els.stepCounter.textContent = `Step ${S.stepIndex + 1} of ${S.lesson.steps.length}`;
    els.progressFill.style.width = `${Math.round((S.stepIndex / S.lesson.steps.length) * 100)}%`;

    S.telemetry.log("step_view", {
      index: S.stepIndex,
      stepType: S.currentStep.type,
      label: S.currentStep.title || S.currentStep.question || S.currentStep.san || "",
    });

    if (S.currentStep.type === "teach") renderTeach(S.currentStep);
    else if (S.currentStep.type === "move") renderMove(S.currentStep);
    else if (S.currentStep.type === "check") renderCheck(S.currentStep);
  }

  function renderTeach(step) {
    S.board && S.board.lock(true);
    // A teach step may carry a `board` directive -> render an inline, trusted
    // replay widget (the model never writes HTML; it just supplies the data).
    const boardSlot = step.board ? '<div id="inline-board" class="mt-5 rounded-xl bg-slate-950/40 border border-white/5 p-4"></div>' : "";
    els.stepCard.innerHTML = `
      <div class="text-brand-400 text-xs font-semibold uppercase tracking-widest mb-2">${step.board ? "Walkthrough" : "Learn"}</div>
      <h2 class="display text-2xl font-bold text-white mb-3">${step.title}</h2>
      <div class="text-slate-300 leading-relaxed">${step.body}</div>
      ${boardSlot}`;
    if (step.board && typeof ChessReplay !== "undefined") {
      new ChessReplay(document.getElementById("inline-board"), Object.assign({}, step.board, {
        // Capture how the learner explored the walkthrough board.
        onStep: (ply, san) => S.telemetry.log("replay_step", { stepIndex: S.stepIndex, ply, san }),
      }));
    }
    addButton(isLastStep() ? "See my review \u2192" : "Continue", "primary", advance);
  }

  function renderMove(step) {
    S.board.lock(false);
    S.awaitingMove = true;
    els.stepCard.innerHTML = `
      <div class="text-brand-400 text-xs font-semibold uppercase tracking-widest mb-2">Your move &middot; ${step.san}</div>
      <h2 class="display text-2xl font-bold text-white mb-3">${step.title}</h2>
      <p class="text-slate-300 leading-relaxed">${step.prompt}</p>`;
    S.telemetry.beginMove({ san: step.san, concept: step.concept });
    addButton("Show a hint", "ghost", showHint);
  }

  function renderCheck(step) {
    S.board && S.board.lock(true);
    const opts = step.options
      .map((o, i) => `
        <button data-i="${i}" class="check-opt w-full text-left px-4 py-3 rounded-xl bg-slate-800/70 border border-white/5
                 hover:border-brand-500/60 hover:bg-slate-800 transition text-slate-200">
          ${o.text}
        </button>`)
      .join("");
    els.stepCard.innerHTML = `
      <div class="text-brand-400 text-xs font-semibold uppercase tracking-widest mb-2">Knowledge check</div>
      <h2 class="display text-xl font-bold text-white mb-4">${step.question}</h2>
      <div class="space-y-2.5">${opts}</div>`;

    let answered = false;
    els.stepCard.querySelectorAll(".check-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const i = Number(btn.dataset.i);
        const opt = step.options[i];
        S.telemetry.recordCheck({ question: step.question, concept: step.concept, chosen: opt.text, correct: opt.correct, miss: opt.miss });
        if (!opt.correct) markMissed(step);

        // Lock every option; color the chosen + the correct one (signifiers).
        els.stepCard.querySelectorAll(".check-opt").forEach((b, j) => {
          b.disabled = true;
          b.classList.add("cursor-default");
          if (step.options[j].correct) b.className += " !border-green-500/70 !bg-green-500/10";
          else if (j === i) b.className += " !border-red-500/70 !bg-red-500/10";
        });
        showFeedback(opt.correct ? "success" : "error",
          `${opt.correct ? "Correct." : "Not quite."} ${opt.insight}`);
        addButton(isLastStep() ? "See my review \u2192" : "Continue", "primary", advance);
      });
    });
  }

  // ---- Board move validation ----
  function handleBoardMove({ from, to }) {
    if (S.mode === "drill") return handleDrillMove(from, to);
    if (!S.awaitingMove || !S.currentStep || S.currentStep.type !== "move") return;
    const step = S.currentStep;

    if (from === step.expect.from && to === step.expect.to) {
      S.awaitingMove = false;
      S.telemetry.recordAttempt({ from, to, correct: true, miss: null });
      S.board.applyMove(from, to);
      S.board.flash(to, "correct");
      S.board.lock(true);
      logMove(step.san);
      showFeedback("success", step.why);

      // Play Black's scripted reply, then let the learner continue.
      if (step.reply) {
        setTimeout(() => {
          S.board.applyMove(step.reply.from, step.reply.to);
          logMove(step.reply.san);
        }, 550);
      }
      addButton(isLastStep() ? "See my review \u2192" : "Continue", "primary", advance);
    } else {
      const trap = step.traps && step.traps[to];
      S.telemetry.recordAttempt({ from, to, correct: false, miss: trap ? trap.miss : null });
      markMissed(step);
      S.board.reject(from);
      S.board.flash(to, "incorrect");
      showFeedback("error", trap ? trap.msg
        : "That's not the London move here. Re-read the goal above, then try another square.");
    }
  }

  function markMissed(step) {
    if (!S.missedSteps.includes(step)) S.missedSteps.push(step);
  }

  // Fisher-Yates in-place shuffle (unbiased; each permutation equally likely).
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function showHint() {
    if (S.currentStep.type !== "move") return;
    S.telemetry.markHintUsed();
    showFeedback("hint", S.currentStep.hint);
  }

  // ---- Advance / finish ----
  function advance() {
    if (isLastStep()) return LT.Review.finishLesson();
    S.telemetry.log("advance", { fromIndex: S.stepIndex });
    S.stepIndex++;
    renderStep();
  }
  function isLastStep() { return S.stepIndex >= S.lesson.steps.length - 1; }

  // ---- UI helpers (lesson + drill screens) ----
  function addButton(label, variant, onClick) {
    const b = document.createElement("button");
    const styles = {
      primary: "bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20",
      ghost: "bg-transparent border border-white/10 text-slate-300 hover:bg-white/5",
    };
    b.className = `inline-flex items-center gap-2 font-semibold px-5 py-2.5 rounded-xl transition active:translate-y-px ${styles[variant] || styles.primary}`;
    b.innerHTML = label;
    b.addEventListener("click", onClick);
    els.controls.appendChild(b);
    return b;
  }

  function showFeedback(kind, text) {
    const map = {
      success: "border-green-500/30 bg-green-500/10 text-green-200",
      error: "border-red-500/30 bg-red-500/10 text-red-200",
      hint: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    };
    els.feedback.innerHTML =
      `<div class="rounded-xl border ${map[kind]} px-4 py-3 text-sm leading-relaxed">${text}</div>`;
  }

  function logMove(san) {
    S.playedSan.push(san.replace(/^\d+\.+\s*/, ""));
    // Group into "1. d4 d5  2. Bf4 Nf6 …" for readability.
    const pairs = [];
    for (let i = 0; i < S.playedSan.length; i += 2) {
      const n = i / 2 + 1;
      pairs.push(`${n}. ${S.playedSan[i]}${S.playedSan[i + 1] ? " " + S.playedSan[i + 1] : ""}`);
    }
    els.moveLog.textContent = pairs.join("   ");
  }

  // ================= Drill mode =================
  // Practice ONLY the missed steps. A missed multiple-choice question is sent to
  // the back of the queue if missed again, so it keeps returning until correct.
  // Missed chess moves rebuild the board to the right position to retry in place.
  function startDrill() {
    if (!S.missedSteps.length) return;
    S.mode = "drill";
    S.drillQueue = S.missedSteps.slice();
    S.drillTotal = S.drillQueue.length;
    S.telemetry.log("drill_start", { count: S.drillTotal });
    LT.show("lesson");
    renderDrillNext();
  }

  function renderDrillNext() {
    els.feedback.innerHTML = "";
    els.controls.innerHTML = "";
    S.drillAwaitingMove = false;
    S.currentDrillStep = null;

    const cleared = S.drillTotal - S.drillQueue.length;
    els.stepCounter.textContent = `Drilling \u00b7 ${S.drillQueue.length} to go`;
    els.lessonTitleMini && (els.lessonTitleMini.textContent = "Practicing your misses");
    els.progressFill.style.width = `${Math.round((cleared / S.drillTotal) * 100)}%`;

    if (!S.drillQueue.length) return renderDrillComplete();
    const step = S.drillQueue[0];
    if (step.type === "check") renderDrillCheck(step);
    else if (step.type === "move") renderDrillMove(step);
  }

  function renderDrillCheck(step) {
    // No board needed for a question — collapse to single column.
    if (els.boardCol) els.boardCol.hidden = true;
    els.grid.classList.remove(TWO_COL);

    const opts = step.options
      .map((o, i) => `
        <button data-i="${i}" class="check-opt w-full text-left px-4 py-3 rounded-xl bg-slate-800/70 border border-white/5
                 hover:border-brand-500/60 hover:bg-slate-800 transition text-slate-200">${o.text}</button>`)
      .join("");
    els.stepCard.innerHTML = `
      <div class="text-amber-400 text-xs font-semibold uppercase tracking-widest mb-2">Drill</div>
      <h2 class="display text-xl font-bold text-white mb-4">${step.question}</h2>
      <div class="space-y-2.5">${opts}</div>`;

    let answered = false;
    els.stepCard.querySelectorAll(".check-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const opt = step.options[Number(btn.dataset.i)];
        els.stepCard.querySelectorAll(".check-opt").forEach((b, j) => {
          b.disabled = true;
          if (step.options[j].correct) b.className += " !border-green-500/70 !bg-green-500/10";
          else if (Number(btn.dataset.i) === j) b.className += " !border-red-500/70 !bg-red-500/10";
        });
        S.telemetry.log("drill_check", { concept: step.concept, correct: opt.correct, chosen: opt.text });
        if (opt.correct) {
          S.drillQueue.shift(); // cleared!
          showFeedback("success", `${opt.insight} \u2713 Cleared.`);
        } else {
          S.drillQueue.push(S.drillQueue.shift()); // send to the back, try again later
          showFeedback("error", `${opt.insight} You'll see this one again.`);
        }
        addButton(S.drillQueue.length ? "Next" : "Finish drill", "primary", renderDrillNext);
      });
    });
  }

  function renderDrillMove(step) {
    // Rebuild the board to the position right before this move.
    if (els.boardCol) els.boardCol.hidden = false;
    els.grid.classList.add(TWO_COL);
    if (!S.board) S.board = new ChessBoard(document.getElementById("board"), { onMove: handleBoardMove });

    const { startFen, setup } = getMoveSetup(S.activeLesson, step);
    document.getElementById("board").classList.add("no-anim");
    S.board.setPosition(startFen);
    setup.forEach(([f, t]) => S.board.applyMove(f, t));
    requestAnimationFrame(() => document.getElementById("board").classList.remove("no-anim"));
    S.board.lock(false);

    S.currentDrillStep = step;
    S.drillAwaitingMove = true;
    els.stepCard.innerHTML = `
      <div class="text-amber-400 text-xs font-semibold uppercase tracking-widest mb-2">Drill \u00b7 ${step.san}</div>
      <h2 class="display text-2xl font-bold text-white mb-3">${step.title}</h2>
      <p class="text-slate-300 leading-relaxed">${step.prompt}</p>`;
  }

  function handleDrillMove(from, to) {
    if (!S.drillAwaitingMove || !S.currentDrillStep) return;
    const step = S.currentDrillStep;
    const correct = from === step.expect.from && to === step.expect.to;
    S.telemetry.log("drill_move", { san: step.san, from, to, correct });
    if (correct) {
      S.drillAwaitingMove = false;
      S.board.applyMove(from, to);
      S.board.flash(to, "correct");
      S.board.lock(true);
      S.drillQueue.shift();
      showFeedback("success", `${step.why} \u2713 Cleared.`);
      addButton(S.drillQueue.length ? "Next" : "Finish drill", "primary", renderDrillNext);
    } else {
      const trap = step.traps && step.traps[to];
      S.board.reject(from);
      S.board.flash(to, "incorrect");
      showFeedback("error", trap ? trap.msg : "Not the move here \u2014 try again.");
    }
  }

  function renderDrillComplete() {
    if (els.boardCol) els.boardCol.hidden = true;
    els.grid.classList.remove(TWO_COL);
    els.stepCard.innerHTML = `
      <div class="text-center py-4">
        <div class="mb-3 flex justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="w-12 h-12 text-green-400" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
        </div>
        <h2 class="display text-2xl font-bold text-white mb-2">Drilled!</h2>
        <p class="text-slate-300">You cleared all ${S.drillTotal} question${S.drillTotal === 1 ? "" : "s"} you'd missed. That's the stuff that actually needed practice.</p>
      </div>`;
    S.telemetry.log("drill_complete", { total: S.drillTotal });
    S.mode = "lesson";
    S.missedSteps = []; // they've been cleared
    addButton("Back to review", "primary", () => { LT.show("review"); LT.Review.renderReview(S.lastResult, S.lastSummary); });
    addButton("Replay full lesson", "ghost", () => startLesson(S.activeLesson));
  }

  // Reconstruct the moves leading up to a given move-step, so we can set the
  // board to the exact position the learner faced when they first saw it.
  function getMoveSetup(lsn, target) {
    const setup = [];
    for (const s of lsn.steps) {
      if (s === target) break;
      if (s.type === "move") {
        setup.push([s.expect.from, s.expect.to]);
        if (s.reply) setup.push([s.reply.from, s.reply.to]);
      }
    }
    return { startFen: lsn.startFen, setup };
  }

  // ---- Build the misconception legend for the active lesson ----
  function buildLegend(lsn) {
    const legend = {};
    for (const step of lsn.steps) {
      // Board lessons: misconceptions live on move "traps".
      if (step.type === "move" && step.traps) {
        for (const sq of Object.keys(step.traps)) {
          const t = step.traps[sq];
          if (t.miss && !legend[t.miss]) legend[t.miss] = t.msg;
        }
      }
      // Concept lessons: misconceptions live on wrong check options.
      if (step.type === "check" && Array.isArray(step.options)) {
        for (const o of step.options) {
          if (o.miss && !legend[o.miss]) legend[o.miss] = o.insight || o.miss;
        }
      }
    }
    return legend;
  }

  // ================= Boot + welcome-screen chrome =================
  async function showModelStatus() {
    const h = await LLM.health();
    if (h.ok) {
      els.modelName.textContent = h.model + (h.api_key_set ? "" : " (local)");
      els.modelDot.className = "w-1.5 h-1.5 rounded-full bg-green-500";
    } else {
      els.modelName.textContent = "AI review offline";
      els.modelDot.className = "w-1.5 h-1.5 rounded-full bg-red-500";
    }
  }

  // Render the persistent progress panel on the welcome screen from the log.
  // This is the visible payoff of being stateful: "gain of ability over time".
  function renderProgress() {
    const stats = LearnerStore.stats();
    // The hero CTA + library button reflect where they are in the course.
    updateHeroCta();

    const panel = els.progressPanel;
    if (!panel) return;
    if (!stats.lessons) { panel.hidden = true; panel.innerHTML = ""; return; }

    const masteryColor = (p) => (p >= 80 ? "text-green-400" : p >= 50 ? "text-amber-400" : "text-red-400");
    const trend = stats.trend == null
      ? `<span class="text-slate-500 text-xs">building a trend…</span>`
      : stats.trend >= 0
        ? `<span class="text-green-400 text-xs font-semibold">&#9650; +${stats.trend} pts vs. your earlier runs</span>`
        : `<span class="text-amber-400 text-xs font-semibold">&#9660; ${stats.trend} pts vs. your earlier runs</span>`;

    const rows = LearnerStore.history().slice(0, 5).map((e) => `
      <li class="flex items-center justify-between gap-3 py-2 border-t border-white/5">
        <span class="text-slate-300 text-sm truncate">${escapeHtml(e.title)}</span>
        <span class="flex items-center gap-3 shrink-0">
          <span class="text-xs text-slate-500">${timeAgo(e.ts)}</span>
          <span class="text-sm font-bold ${masteryColor(e.mastery)} tabular-nums">${e.mastery}%</span>
        </span>
      </li>`).join("");

    panel.hidden = false;
    panel.innerHTML = `
      <div class="rounded-2xl bg-slate-900 border border-white/5 p-5 text-left">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-white flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 text-brand-400" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M20 20H3" /></svg>
            Your progress</h2>
          <button id="progress-reset" class="text-xs text-slate-500 hover:text-red-400 transition">Reset</button>
        </div>
        <div class="grid grid-cols-3 gap-3 mb-1">
          <div class="rounded-xl bg-slate-800/60 p-3 text-center">
            <div class="text-2xl font-extrabold text-white tabular-nums">${stats.lessons}</div>
            <div class="text-xs text-slate-400 mt-0.5">lessons done</div>
          </div>
          <div class="rounded-xl bg-slate-800/60 p-3 text-center">
            <div class="text-2xl font-extrabold ${masteryColor(stats.avgMastery)} tabular-nums">${stats.avgMastery}%</div>
            <div class="text-xs text-slate-400 mt-0.5">avg mastery</div>
          </div>
          <div class="rounded-xl bg-slate-800/60 p-3 flex flex-col items-center justify-center text-center">
            ${trend}
          </div>
        </div>
        <ul class="mt-2">${rows}</ul>
      </div>`;

    const resetBtn = document.getElementById("progress-reset");
    if (resetBtn) resetBtn.addEventListener("click", () => {
      LearnerStore.clear();
      renderProgress();
    });
  }

  // Compact relative time for the history list ("just now", "3h ago", "2d ago").
  function timeAgo(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return `${d}d ago`;
  }

  // Expose the surface other modules call.
  LT.startLesson = startLesson;
  LT.startCourse = startCourse;
  LT.startDrill = startDrill;
  LT.renderProgress = renderProgress;
  LT.openLibrary = openLibrary;

  // ---- Boot ----
  showModelStatus();
  renderProgress(); // restore the learner's history from localStorage

  // Home CTA starts (or continues) the ordered course.
  if (els.start) els.start.addEventListener("click", startCourse);
  // "Previous lessons" opens the library of made lessons.
  if (els.libraryBtn) els.libraryBtn.addEventListener("click", openLibrary);
  // Header: logo returns home, "Profile" opens the data tab.
  if (els.homeLink) els.homeLink.addEventListener("click", () => { LT.show("welcome"); renderProgress(); });
  if (els.profileBtn) els.profileBtn.addEventListener("click", () => LT.Profile.open());
})(window.LT);
