/*
  review.js — the SECOND "AI as teacher" boundary: coaching after the run.

  finishLesson() is the bridge from playing to reviewing. It does two things in
  a deliberate order:
    1. Compute mastery DETERMINISTICALLY and persist the run (so progress is
       recorded even if the model is offline or slow — see store.js).
    2. Ask the model for a qualitative, data-grounded coaching review.

  The model judges quality (strengths / focus / next step); it never owns the
  number. The mastery score and its breakdown are computed here from telemetry.
*/
(function (LT) {
  "use strict";

  const S = LT.S;
  const els = LT.els;
  const { escapeHtml } = LT;

  // ---- Bridge: finish playing -> show review ----
  async function finishLesson() {
    els.progressFill.style.width = "100%";
    S.telemetry.log("lesson_finish", {});
    LT.show("review");
    renderReviewLoading();

    const summary = S.telemetry.summary();

    // Persist BEFORE the (async) AI review — mastery is deterministic, so the
    // run is recorded regardless of the model. This is the SINGLE write point
    // for the append-only progress log.
    const mastery = computeMastery(summary);
    LearnerStore.record({ lessonId: S.lesson.id, title: S.lesson.title, mastery }, summary);
    LT.renderProgress();

    // Background: refresh the profile's AI analysis from the full history.
    // Fire-and-forget and silent — the learner never waits on or sees this.
    if (LT.Profile) LT.Profile.refreshAnalysis();

    const result = await requestReview(summary);
    renderReview(result, summary);
  }

  function renderReviewLoading() {
    els.reviewBody.innerHTML = `
      <div class="rounded-2xl bg-slate-900 border border-white/5 p-8 text-center">
        <svg class="spin w-8 h-8 mx-auto text-brand-400 mb-4" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/>
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        </svg>
        <p class="text-white font-semibold">Your coach is reviewing your work…</p>
        <p class="text-slate-400 text-sm mt-1">Analyzing your answers, timing, and any repeated mistakes.</p>
      </div>`;
  }

  async function requestReview(summary) {
    const subject = S.lesson.title || "this topic";
    const system =
      `You are an expert but warm tutor reviewing a beginner's FIRST run through a lesson on "${subject}". ` +
      "You are given structured telemetry, a legend explaining each misconception tag, and a TIMELINE — the full " +
      "action-by-action record of everything the learner did (every step viewed, move attempt, hint, answer, and how " +
      "long each took, in ms since start). Use the timeline to notice HOW they worked: hesitation, rushing, retries, " +
      "skipping the walkthrough, etc. " +
      "Write a short, specific, encouraging review grounded ONLY in the data — never invent facts, moves, or mistakes. " +
      'Reply with ONLY a JSON object: {"verdict": string (<=6 words), "mastery": integer 0-100, ' +
      '"summary": string (2-3 sentences), "strengths": [string, ...] (1-3), "focus": [string, ...] (1-3), ' +
      '"nextStep": string (one concrete suggestion)}.';
    const user =
      "LEGEND (misconception tag -> meaning):\n" + JSON.stringify(S.legend, null, 0) +
      "\n\nTELEMETRY (includes the full `timeline` of actions):\n" + JSON.stringify(summary, null, 0);

    return LLM.generateJSON(
      [{ role: "system", content: system }, { role: "user", content: user }],
      { maxTokens: 500, temperature: 0.5 }
    );
  }

  function renderReview(result, summary) {
    // Cache so "Drill" / "Back to review" can return here without re-calling the model.
    S.lastResult = result;
    S.lastSummary = summary;
    // Resilience: if the model is unreachable, fall back to a rules-based review
    // built from the same telemetry, so the learner is never left empty-handed.
    const data = result.ok ? result.data : localFallbackReview(summary);
    S.lastReviewData = data;
    const aiBadge = result.ok
      ? `<span class="text-xs text-green-400">AI coach</span>`
      : `<span class="text-xs text-amber-400">Offline summary (AI unavailable)</span>`;

    // Mastery is computed DETERMINISTICALLY from telemetry (not the model's
    // guess), so it's truthful and the breakdown below explains every point.
    const m = computeMastery(summary);
    const ring = masteryRing(m.score);

    els.reviewBody.innerHTML = `
      <div class="text-center mb-6">
        <p class="text-brand-400 font-semibold text-sm uppercase tracking-widest mb-1">Lesson review</p>
        <h1 class="display text-3xl font-extrabold text-white">${escapeHtml(data.verdict || "Nice work")}</h1>
      </div>

      <div class="rounded-2xl bg-slate-900 border border-white/5 p-6 sm:p-8">
        <div class="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
          <div class="shrink-0">${ring}</div>
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-2">${aiBadge}</div>
            <p class="text-slate-200 leading-relaxed">${escapeHtml(data.summary || "")}</p>
          </div>
        </div>

        <div class="grid sm:grid-cols-2 gap-5 mt-7">
          <div>
            <h3 class="text-green-400 font-semibold text-sm mb-2 flex items-center gap-1.5">
              <span>&#10003;</span> What you did well</h3>
            <ul class="space-y-1.5 text-sm text-slate-300">
              ${listItems(data.strengths, "text-green-500")}
            </ul>
          </div>
          <div>
            <h3 class="text-amber-400 font-semibold text-sm mb-2 flex items-center gap-1.5">
              <span>&#9650;</span> Focus on next</h3>
            <ul class="space-y-1.5 text-sm text-slate-300">
              ${listItems(data.focus, "text-amber-500")}
            </ul>
          </div>
        </div>

        ${data.nextStep ? `
        <div class="mt-6 rounded-xl bg-brand-500/10 border border-brand-500/30 px-4 py-3">
          <p class="text-sm text-brand-200"><span class="font-semibold">Try this next:</span> ${escapeHtml(data.nextStep)}</p>
        </div>` : ""}
      </div>

      ${renderMasteryBreakdown(m)}

      ${renderExamined(summary, result)}

      <div class="flex flex-wrap items-center justify-center gap-3 mt-6">
        <button id="next-btn" class="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 active:translate-y-px text-white font-semibold px-6 py-3 rounded-xl transition shadow-lg shadow-brand-500/20">
          Next lesson <span aria-hidden="true">&rarr;</span>
        </button>
        ${S.missedSteps.length ? `
        <button id="drill-btn" class="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 active:translate-y-px text-slate-950 font-semibold px-6 py-3 rounded-xl transition shadow-lg shadow-amber-500/20">
          &#9654; Drill what you missed (${S.missedSteps.length})
        </button>` : ""}
        <button id="replay-btn" class="inline-flex items-center gap-2 bg-transparent border border-white/10 text-slate-300 hover:bg-white/5 font-semibold px-6 py-3 rounded-xl transition">
          Replay
        </button>
      </div>`;

    document.getElementById("next-btn").addEventListener("click", LT.Authoring.generateNextLesson);
    const drillBtn = document.getElementById("drill-btn");
    if (drillBtn) drillBtn.addEventListener("click", LT.startDrill);
    document.getElementById("replay-btn").addEventListener("click", () => LT.startLesson(S.activeLesson));
  }

  // Deterministic mastery: every item is worth 1 point. A first-try correct
  // answer earns full credit; a chess move solved only after wrong tries or a
  // hint earns half. The panel shows this math so the score is never a mystery.
  function computeMastery(summary) {
    const items = [];
    for (const mv of summary.moves) {
      let pts = mv.attempts === 1 && !mv.hintUsed ? 1 : 0.5;
      items.push({ kind: "move", label: mv.san, pts,
        detail: mv.attempts === 1 ? (mv.hintUsed ? "first try, used a hint" : "first try") : `${mv.attempts} tries` });
    }
    for (const c of summary.checks) {
      items.push({ kind: "check", label: c.question, pts: c.correct ? 1 : 0,
        detail: c.correct ? "correct" : "missed" });
    }
    const max = items.length;
    const got = items.reduce((s, i) => s + i.pts, 0);
    const score = max ? Math.round((got / max) * 100) : 0;
    return { score, got, max, items };
  }

  function renderMasteryBreakdown(m) {
    const moves = m.items.filter((i) => i.kind === "move");
    const checks = m.items.filter((i) => i.kind === "check");
    const rows = [];
    if (checks.length) {
      const correct = checks.filter((c) => c.pts === 1).length;
      rows.push(`<tr class="border-t border-white/5"><td class="py-1.5 text-slate-300">Knowledge checks</td>
        <td class="py-1.5 text-right ${correct === checks.length ? "text-green-400" : "text-amber-400"}">${correct} / ${checks.length} correct</td>
        <td class="py-1.5 text-right text-slate-400 tabular-nums">${correct.toFixed(0)} / ${checks.length} pts</td></tr>`);
    }
    if (moves.length) {
      const firstTry = moves.filter((mv) => mv.pts === 1).length;
      const mvPts = moves.reduce((s, mv) => s + mv.pts, 0);
      rows.push(`<tr class="border-t border-white/5"><td class="py-1.5 text-slate-300">Moves (first-try = full credit)</td>
        <td class="py-1.5 text-right ${firstTry === moves.length ? "text-green-400" : "text-amber-400"}">${firstTry} / ${moves.length} first try</td>
        <td class="py-1.5 text-right text-slate-400 tabular-nums">${mvPts} / ${moves.length} pts</td></tr>`);
    }
    return `
      <details class="mt-5 rounded-2xl bg-slate-900/60 border border-white/5 overflow-hidden group">
        <summary class="cursor-pointer select-none px-5 py-4 text-sm font-semibold text-slate-300 hover:text-white flex items-center justify-between">
          <span>How your mastery was scored</span>
          <span class="text-slate-500 group-open:rotate-180 transition">&#9662;</span>
        </summary>
        <div class="px-5 pb-5">
          <table class="w-full text-sm mb-3">
            <thead><tr class="text-xs uppercase tracking-wider text-slate-500 text-left">
              <th class="pb-1 font-medium">Component</th><th class="pb-1 font-medium text-right">Result</th><th class="pb-1 font-medium text-right">Points</th>
            </tr></thead>
            <tbody>${rows.join("")}</tbody>
          </table>
          <div class="flex items-center justify-between text-sm border-t border-white/10 pt-3">
            <span class="text-slate-300 font-semibold">Total</span>
            <span class="text-white font-bold tabular-nums">${m.got} / ${m.max} &rarr; ${m.score}%</span>
          </div>
          <p class="text-xs text-slate-500 mt-2">Every item is worth 1 point. A chess move solved only after a wrong try or a hint earns half credit.</p>
        </div>
      </details>`;
  }

  // Transparency panel: show EXACTLY what the AI was given to reason about.
  function renderExamined(summary, result) {
    const ms = result.ok ? ` &middot; generated in ${(result.ms / 1000).toFixed(1)}s` : "";

    // Board lessons get a moves table; concept lessons get a checks table.
    let table;
    if (summary.moves.length) {
      const rows = summary.moves.map((m) => {
        const misses = m.misconceptions.map((t) => S.legend[t] || t).join("; ");
        const ok = m.attempts === 1;
        return `<tr class="border-t border-white/5">
          <td class="py-1.5 pr-3 font-medium text-slate-200">${m.san}</td>
          <td class="py-1.5 pr-3 ${ok ? "text-green-400" : "text-amber-400"}">${m.attempts} ${m.attempts === 1 ? "try" : "tries"}</td>
          <td class="py-1.5 pr-3 text-slate-400">${m.timeSec != null ? m.timeSec + "s" : "\u2014"}</td>
          <td class="py-1.5 text-slate-400">${misses || "\u2014"}</td>
        </tr>`;
      }).join("");
      table = `<table class="w-full text-sm">
          <thead><tr class="text-xs uppercase tracking-wider text-slate-500 text-left">
            <th class="pb-1 font-medium">Move</th><th class="pb-1 font-medium">Attempts</th>
            <th class="pb-1 font-medium">Time</th><th class="pb-1 font-medium">Misconception</th>
          </tr></thead><tbody>${rows}</tbody></table>`;
    } else {
      const rows = summary.checks.map((c, i) => {
        const miss = c.misconception ? (S.legend[c.misconception] || c.misconception) : "\u2014";
        return `<tr class="border-t border-white/5">
          <td class="py-1.5 pr-3 text-slate-300">Q${i + 1}. ${escapeHtml(c.question)}</td>
          <td class="py-1.5 pr-3 ${c.correct ? "text-green-400" : "text-red-400"} whitespace-nowrap">${c.correct ? "Correct" : "Missed"}</td>
          <td class="py-1.5 text-slate-400">${escapeHtml(miss)}</td>
        </tr>`;
      }).join("");
      table = `<table class="w-full text-sm">
          <thead><tr class="text-xs uppercase tracking-wider text-slate-500 text-left">
            <th class="pb-1 font-medium">Question</th><th class="pb-1 font-medium">Result</th>
            <th class="pb-1 font-medium">Misconception</th>
          </tr></thead><tbody>${rows}</tbody></table>`;
    }

    const correctChecks = summary.checks.filter((c) => c.correct).length;
    const stats = summary.moves.length
      ? `${summary.firstTryCorrect}/${summary.movesTotal} moves first try &middot; ${summary.totalWrongAttempts} wrong attempts &middot; ${summary.hintsUsed} hints &middot; `
      : "";

    return `
      <details class="mt-5 rounded-2xl bg-slate-900/60 border border-white/5 overflow-hidden group">
        <summary class="cursor-pointer select-none px-5 py-4 text-sm font-semibold text-slate-300 hover:text-white flex items-center justify-between">
          <span>What the AI examined</span>
          <span class="text-slate-500 group-open:rotate-180 transition">&#9662;</span>
        </summary>
        <div class="px-5 pb-5">
          <p class="text-xs text-slate-400 mb-3">
            ${stats}${correctChecks}/${summary.checks.length} knowledge checks correct &middot;
            ${summary.durationSec}s total${ms}
          </p>
          ${table}
          ${renderTimeline(summary.timeline || [])}
        </div>
      </details>`;
  }

  // The raw, every-action timeline — proof of exactly what was tracked and fed
  // to the coach. Collapsed by default so it doesn't overwhelm the review.
  function renderTimeline(events) {
    if (!events.length) return "";
    const fmt = (e) => {
      const secs = (e.t / 1000).toFixed(1) + "s";
      const { t, type, ...rest } = e;
      const detail = Object.entries(rest)
        .map(([k, v]) => `${k}=${escapeHtml(String(v))}`)
        .join(" ");
      return `<tr class="border-t border-white/5">
        <td class="py-1 pr-3 text-slate-500 tabular-nums whitespace-nowrap">${secs}</td>
        <td class="py-1 pr-3 font-medium text-slate-300 whitespace-nowrap">${escapeHtml(type)}</td>
        <td class="py-1 text-slate-400">${detail}</td>
      </tr>`;
    };
    return `
      <details class="mt-4 rounded-xl bg-slate-950/40 border border-white/5 overflow-hidden group/timeline">
        <summary class="cursor-pointer select-none px-4 py-3 text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center justify-between">
          <span>Full action timeline (${events.length} events tracked)</span>
          <span class="text-slate-600 group-open/timeline:rotate-180 transition">&#9662;</span>
        </summary>
        <div class="px-4 pb-4 max-h-72 overflow-y-auto">
          <table class="w-full text-xs"><tbody>${events.map(fmt).join("")}</tbody></table>
        </div>
      </details>`;
  }

  // ---- Fallback review (no model needed) ----
  function localFallbackReview(s) {
    const correctChecks = s.checks.filter((c) => c.correct).length;
    // Score from moves if it's a board lesson, otherwise from checks.
    const acc = s.movesTotal
      ? Math.round((s.firstTryCorrect / s.movesTotal) * 100)
      : (s.checks.length ? Math.round((correctChecks / s.checks.length) * 100) : 0);

    const strengths = [];
    if (s.movesTotal && s.firstTryCorrect > 0) strengths.push(`Found ${s.firstTryCorrect} of ${s.movesTotal} moves on the first try.`);
    if (correctChecks) strengths.push(`Answered ${correctChecks} of ${s.checks.length} knowledge checks correctly.`);
    if (!strengths.length) strengths.push("Completed the whole lesson.");

    const focus = s.repeatedMisconceptions.length
      ? s.repeatedMisconceptions.map((m) => S.legend[m.miss] || m.miss)
      : ["Replay to reinforce the ideas you were less sure about."];

    const summary = s.movesTotal
      ? `You completed the lesson in ${s.durationSec}s with ${s.firstTryCorrect}/${s.movesTotal} moves correct on the first try.`
      : `You completed the lesson in ${s.durationSec}s and got ${correctChecks}/${s.checks.length} knowledge checks right.`;

    return {
      verdict: acc >= 80 ? "Strong first run" : acc >= 50 ? "Solid start" : "Keep practicing",
      mastery: acc,
      summary, strengths, focus,
      nextStep: "Replay the lesson and aim for a perfect run.",
    };
  }

  // ---- Small presentational helpers (used only by the review screen) ----
  function masteryRing(pct) {
    const r = 34, c = 2 * Math.PI * r;
    const off = c * (1 - pct / 100);
    const color = pct >= 80 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
    return `
      <svg width="92" height="92" viewBox="0 0 92 92" class="block">
        <circle cx="46" cy="46" r="${r}" stroke="rgba(255,255,255,0.08)" stroke-width="8" fill="none"/>
        <circle cx="46" cy="46" r="${r}" stroke="${color}" stroke-width="8" fill="none" stroke-linecap="round"
          stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 46 46)"
          style="transition: stroke-dashoffset 0.8s ease"/>
        <text x="46" y="44" text-anchor="middle" fill="#fff" font-size="22" font-weight="800">${pct}</text>
        <text x="46" y="60" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="600">MASTERY</text>
      </svg>`;
  }

  function listItems(arr, dotClass) {
    const items = Array.isArray(arr) ? arr : (arr ? [arr] : []);
    if (!items.length) return `<li class="text-slate-500">\u2014</li>`;
    return items.map((t) =>
      `<li class="flex gap-2"><span class="${dotClass} mt-0.5">&bull;</span><span>${escapeHtml(String(t))}</span></li>`
    ).join("");
  }

  // Public surface other modules call.
  LT.Review = { finishLesson, renderReview, computeMastery };
})(window.LT);
