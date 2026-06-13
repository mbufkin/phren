// ============================================================
//  Bloom Assessment Engine — application logic (vanilla JS)
//  ----------------------------------------------------------
//  Content lives in data.js (the ASSESSMENTS bank); this file is all behavior:
//  the state layer, the adaptive engine, the renderers, and event wiring.
//  Loaded as a classic script AFTER data.js, so `ASSESSMENTS` is in scope.
//
//  Design principle: the UI is a pure render of state. We never hand-mutate
//  scattered DOM; we compute from data/attempt-log and re-render.
// ============================================================

/* ---------- 1. Element references ---------- */
const els = {
  generate: document.getElementById("generate"),
  genLabel: document.getElementById("gen-label"),
  genIcon: document.getElementById("gen-icon"),
  empty: document.getElementById("empty-state"),
  loading: document.getElementById("loading-state"),
  loadingSub: document.getElementById("loading-sub"),
  result: document.getElementById("result-state"),
  pipeline: document.getElementById("pipeline"),
  difficultyPanel: document.getElementById("difficulty-panel"),
  scenarioCard: document.getElementById("scenario-card"),
  qBloomBadge: document.getElementById("q-bloom-badge"),
  qText: document.getElementById("q-text"),
  options: document.getElementById("options"),
  feedback: document.getElementById("answer-feedback"),
  contrastCard: document.getElementById("contrast-card"),
  rubric: document.getElementById("rubric"),
  export: document.getElementById("export"),
  regenerate: document.getElementById("regenerate"),
  level: document.getElementById("level"),
  ladder: document.getElementById("ladder"),
  toast: document.getElementById("toast"),
  toastTitle: document.getElementById("toast-title"),
  toastSub: document.getElementById("toast-sub"),
  openRationale: document.getElementById("open-rationale"),
  closeRationale: document.getElementById("close-rationale"),
  rationaleModal: document.getElementById("rationale-modal"),
  rationaleBackdrop: document.getElementById("rationale-backdrop"),
  openProgress: document.getElementById("open-progress"),
  closeProgress: document.getElementById("close-progress"),
  progressModal: document.getElementById("progress-modal"),
  progressBackdrop: document.getElementById("progress-backdrop"),
  progressContent: document.getElementById("progress-content"),
  attemptCount: document.getElementById("attempt-count"),
  adaptiveToggle: document.getElementById("adaptive-toggle"),
  adaptiveKnob: document.getElementById("adaptive-knob"),
  recCard: document.getElementById("rec-card"),
  adaptiveBanner: document.getElementById("adaptive-banner"),
};

/* ---------- 2. State layer ----------
   We persist an APPEND-ONLY event log of attempts to localStorage. An event
   log (rather than overwriting a single "score") is the right shape for
   learning analytics: it preserves history, so we can measure change over
   time and rebuild any aggregate (mastery, misconception trends) by replay.
   In production this same shape streams to a datastore. */
const STORAGE_KEY = "bae.attempts.v1";
const CONCEPT = { id: "cap-theorem", label: "CAP Theorem" };

// Fixed order so mastery always renders from lowest to highest Bloom's level.
const LEVEL_ORDER = ["remember", "apply", "evaluate", "create"];

function loadAttempts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    // Corrupt/blocked storage shouldn't break the app — fail soft to empty.
    return [];
  }
}
function persistAttempts(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* ignore quota/privacy errors */ }
}
function recordAttempt(attempt) {
  const list = loadAttempts();
  list.push(attempt);
  persistAttempts(list);
  updateAttemptBadge();
  // The learner's state just changed — refresh what to practice next.
  if (adaptiveMode) renderRecommendation();
}
function clearAttempts() {
  persistAttempts([]);
  updateAttemptBadge();
  // State was wiped — if the engine is driving, recompute back to the baseline
  // so the recommendation card never shows stale (pre-reset) guidance.
  if (adaptiveMode) renderRecommendation();
}

// Reflect the saved attempt count on the header button (proof of persistence).
function updateAttemptBadge() {
  const n = loadAttempts().length;
  els.attemptCount.textContent = n;
  els.attemptCount.classList.toggle("hidden", n === 0);
}

// Track which assessment is on screen + whether it's been answered, so we
// log exactly ONE attempt per presented question (changing your mind after
// doesn't inflate the ability signal).
let currentLevel = null;
let answeredThisRound = false;
let adaptiveMode = false; // when true, the engine selects the next level

// Derive a clean misconception label from the option's insight title.
// Correct options carry no misconception.
function misconceptionFor(opt) {
  if (opt.correct) return null;
  return opt.insightTitle
    .replace(/^Misconception:\s*/i, "")
    .replace(/^["“]+|["”.]+$/g, "")
    .trim();
}

/* ---------- 3. Adaptive engine ----------
   Both the Learner Progress panel and the adaptive selector need the same
   per-level picture, so we compute it once (DRY). `mastered` = the level has
   been attempted, the most recent attempt was correct, and overall accuracy
   at that level is >= 67%. */
function computeLevelStats(attempts) {
  const map = {};
  LEVEL_ORDER.forEach((lvl) => {
    const rows = attempts.filter((a) => a.level === lvl);
    const correct = rows.filter((a) => a.correct).length;
    const acc = pct(correct, rows.length);
    const last = rows[rows.length - 1];
    map[lvl] = {
      n: rows.length,
      correct,
      acc,
      lastCorrect: rows.length ? last.correct : null,
      mastered: rows.length > 0 && last.correct && acc >= 67,
      bloom: rows[0]?.bloom || (ASSESSMENTS[lvl] ? ASSESSMENTS[lvl].bloom : lvl),
    };
  });
  return map;
}

// Most recent misconception triggered at a given level (what to re-target).
function recentMisconceptionAt(attempts, lvl) {
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i];
    if (a.level === lvl && !a.correct && a.misconception) return a.misconception;
  }
  return null;
}

/* The recommendation policy, in plain terms:
   1. No history → start at the bottom (recall) to set a baseline.
   2. Reinforce the LOWEST attempted-but-not-mastered level (fix the
      foundation before climbing — a weak lower rung undermines higher ones).
   3. If everything attempted is mastered → ADVANCE to the next higher level.
   4. If all four are mastered → keep the top level (Create) sharp. */
function recommendNextLevel() {
  const attempts = loadAttempts();
  if (attempts.length === 0) {
    return { level: "remember", reason: "No history yet — starting with a quick recall check to set a baseline before climbing to application.", focus: null };
  }
  const stats = computeLevelStats(attempts);

  for (const lvl of LEVEL_ORDER) {
    if (stats[lvl].n > 0 && !stats[lvl].mastered) {
      return {
        level: lvl,
        reason: `You're at ${stats[lvl].acc}% on ${ASSESSMENTS[lvl].bloom} and haven't mastered it yet — reinforcing this rung before moving up.`,
        focus: recentMisconceptionAt(attempts, lvl),
      };
    }
  }

  // Everything attempted is mastered → advance to the next unattempted level.
  let highestIdx = -1;
  LEVEL_ORDER.forEach((l, i) => { if (stats[l].n > 0) highestIdx = i; });
  const nextIdx = highestIdx + 1;
  if (nextIdx < LEVEL_ORDER.length) {
    const lvl = LEVEL_ORDER[nextIdx];
    return { level: lvl, reason: `You've mastered everything you've attempted — advancing up Bloom's Taxonomy to ${ASSESSMENTS[lvl].bloom}.`, focus: null };
  }
  return { level: "create", reason: "You've mastered all four levels — re-practicing Create (design synthesis) to keep your highest-order skill sharp.", focus: null };
}

// Render the recommendation card and sync the dropdown to the engine's pick.
function renderRecommendation() {
  if (!adaptiveMode) {
    els.recCard.classList.add("hidden");
    return;
  }
  const rec = recommendNextLevel();
  els.level.value = rec.level;       // engine drives the selector
  updateLadder(rec.level);
  els.recCard.classList.remove("hidden");
  els.recCard.innerHTML = `
    <div class="flex items-center gap-2">
      <svg class="h-4 w-4 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"/></svg>
      <h3 class="text-xs font-bold uppercase tracking-wide text-brand-300">Recommended next</h3>
      <span class="ml-auto rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold text-brand-200">${ASSESSMENTS[rec.level].bloom}</span>
    </div>
    <p class="mt-2 text-xs leading-relaxed text-slate-300">${rec.reason}</p>
    ${rec.focus ? `<p class="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] text-amber-200"><span class="font-semibold">Watch for:</span> ${rec.focus}</p>` : ""}`;
}

/* ---------- 4. Pipeline helpers (the simulated AI steps) ---------- */
function completeStep(li) {
  const marker = li.querySelector(".step-marker");
  const text = li.querySelector(".step-text");
  marker.className = "step-marker mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white animate-pop-in";
  marker.innerHTML = '<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>';
  text.className = "step-text text-sm text-slate-200";
}
function activateStep(li) {
  const marker = li.querySelector(".step-marker");
  marker.className = "step-marker mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-brand-500 text-brand-400";
  marker.innerHTML = '<svg class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"></path></svg>';
}
function resetPipeline() {
  els.pipeline.querySelectorAll(".pipeline-step").forEach((li) => {
    const marker = li.querySelector(".step-marker");
    marker.className = "step-marker mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-slate-600 text-slate-600";
    marker.innerHTML = "";
    li.querySelector(".step-text").className = "step-text text-sm text-slate-400";
  });
}

/* ---------- 5. Renderers (UI = pure function of the chosen assessment) ---------- */

// Renders the difficulty dots (filled = current difficulty out of 5).
function difficultyDots(n) {
  let dots = "";
  for (let i = 1; i <= 5; i++) {
    dots += `<span class="h-2 w-2 rounded-full ${i <= n ? "bg-brand-400" : "bg-slate-700"}"></span>`;
  }
  return dots;
}

// Difficulty & Skill panel — the heart of "how we think about difficulty".
function renderDifficulty(a) {
  els.difficultyPanel.innerHTML = `
    <div class="mb-3 flex items-center gap-2">
      <svg class="h-4 w-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/></svg>
      <h3 class="text-sm font-bold uppercase tracking-wide text-brand-300">Difficulty &amp; Skill</h3>
      <span class="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">Bloom: ${a.bloom}</span>
    </div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div class="rounded-lg border border-white/5 bg-slate-900/50 p-3">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Difficulty</p>
        <p class="mt-1 text-sm font-bold text-white">${a.difficultyLabel}</p>
        <div class="mt-2 flex gap-1">${difficultyDots(a.difficulty)}</div>
      </div>
      <div class="rounded-lg border border-white/5 bg-slate-900/50 p-3">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Est. time</p>
        <p class="mt-1 text-sm font-bold text-white">${a.estTime}</p>
      </div>
      <div class="col-span-2 rounded-lg border border-white/5 bg-slate-900/50 p-3 sm:col-span-1">
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Sub-skill practiced</p>
        <p class="mt-1 text-xs font-medium leading-snug text-slate-200">${a.skill}</p>
      </div>
    </div>
    <div class="mt-3 rounded-lg border border-brand-500/15 bg-brand-500/[0.06] p-3">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-brand-300">Why this difficulty</p>
      <p class="mt-1 text-xs leading-relaxed text-slate-300">${a.demand}</p>
    </div>`;
}

// Scenario card (hidden entirely for pure-recall items).
function renderScenario(a) {
  if (!a.scenario) {
    els.scenarioCard.classList.add("hidden");
    return;
  }
  els.scenarioCard.classList.remove("hidden");
  els.scenarioCard.innerHTML = `
    <div class="mb-3 flex items-center gap-2">
      <svg class="h-4 w-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
      <h3 class="text-sm font-bold uppercase tracking-wide text-brand-300">Generated Scenario</h3>
      <span class="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">${a.scenario.tag}</span>
    </div>
    <h4 class="mb-2 text-base font-bold text-white">${a.scenario.title}</h4>
    <p class="text-sm leading-relaxed text-slate-300">${a.scenario.body}</p>`;
}

// Options + their expandable Instructor Insight badges.
function renderOptions(a) {
  els.options.innerHTML = "";
  a.options.forEach((opt, idx) => {
    const card = document.createElement("div");
    card.className = "option-card rounded-xl border border-white/10 bg-slate-900/40 transition hover:border-brand-500/40";
    card.innerHTML = `
      <div class="flex items-start gap-3 p-3.5">
        <button class="choose grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/15 bg-slate-800 text-sm font-bold text-slate-300 transition hover:border-brand-500 hover:text-brand-300">${opt.letter}</button>
        <div class="flex-1">
          <p class="text-sm leading-relaxed text-slate-200">${opt.text}</p>
          <button class="insight-toggle mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-400/20">
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.4 14.4 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/></svg>
            Instructor Insight
            <svg class="chev h-3 w-3 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>
          </button>
          <div class="collapse-body insight-body rounded-lg border ${opt.correct ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-400/20 bg-amber-400/5"} p-3">
            <p class="mb-1 text-xs font-bold ${opt.correct ? "text-emerald-300" : "text-amber-300"}">${opt.insightTitle}</p>
            <p class="text-xs leading-relaxed text-slate-300">${opt.insight}</p>
          </div>
        </div>
      </div>`;

    const toggle = card.querySelector(".insight-toggle");
    const body = card.querySelector(".insight-body");
    const chev = card.querySelector(".chev");
    toggle.addEventListener("click", () => {
      const open = body.classList.toggle("open");
      chev.style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
    });

    card.querySelector(".choose").addEventListener("click", () => selectAnswer(a, opt, idx));
    els.options.appendChild(card);
  });
}

// Recall-vs-application contrast ("the easy path we avoided").
function renderContrast(a) {
  if (!a.contrast) {
    els.contrastCard.classList.add("hidden");
    return;
  }
  els.contrastCard.classList.remove("hidden");
  els.contrastCard.innerHTML = `
    <div class="flex items-center gap-2">
      <svg class="h-4 w-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
      <h3 class="text-xs font-bold uppercase tracking-wide text-amber-300">The recall-only path we avoided</h3>
    </div>
    <p class="mt-2 text-xs leading-relaxed text-slate-300">${a.contrast}</p>`;
}

// Selection + immediate diagnostic feedback.
function selectAnswer(a, opt, idx) {
  // Record the FIRST selection of this question round to the state log.
  if (!answeredThisRound) {
    answeredThisRound = true;
    recordAttempt({
      ts: Date.now(),
      concept: CONCEPT.id,
      level: currentLevel,
      bloom: a.bloom,
      choice: opt.letter,
      correct: !!opt.correct,
      misconception: misconceptionFor(opt),
    });
  }

  const cards = els.options.querySelectorAll(".option-card");
  cards.forEach((c) => {
    c.classList.remove("ring-2", "ring-emerald-500", "ring-rose-500", "border-emerald-500", "border-rose-500");
    const btn = c.querySelector(".choose");
    btn.classList.remove("bg-emerald-500", "bg-rose-500", "text-white", "border-emerald-500", "border-rose-500");
  });

  const selected = cards[idx];
  const btn = selected.querySelector(".choose");
  if (opt.correct) {
    selected.classList.add("ring-2", "ring-emerald-500", "border-emerald-500");
    btn.classList.add("bg-emerald-500", "text-white", "border-emerald-500");
  } else {
    selected.classList.add("ring-2", "ring-rose-500", "border-rose-500");
    btn.classList.add("bg-rose-500", "text-white", "border-rose-500");
  }

  // Auto-expand the chosen option's insight so the rationale is visible.
  const body = selected.querySelector(".insight-body");
  const chev = selected.querySelector(".chev");
  if (!body.classList.contains("open")) {
    body.classList.add("open");
    chev.style.transform = "rotate(180deg)";
  }

  els.feedback.classList.remove("hidden");
  if (opt.correct) {
    els.feedback.className = "mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200";
    els.feedback.innerHTML = "<strong>Correct.</strong> " + a.feedbackCorrect;
  } else {
    els.feedback.className = "mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200";
    els.feedback.innerHTML = "<strong>Not quite.</strong> " + a.feedbackIncorrect;
  }
}

// Renders an entire assessment into the result panel.
function renderAssessment(level) {
  const a = ASSESSMENTS[level];
  currentLevel = level;        // remember which level is on screen (for logging)
  answeredThisRound = false;   // a fresh question = a fresh attempt slot
  renderDifficulty(a);
  renderScenario(a);
  els.qBloomBadge.textContent = a.bloom;
  els.qText.textContent = a.question;
  renderOptions(a);
  renderContrast(a);
  els.rubric.value = a.rubric;
  els.feedback.classList.add("hidden");
}

/* ---------- 6. Bloom ladder highlight ---------- */
function updateLadder(level) {
  els.ladder.querySelectorAll("[data-rung]").forEach((el) => {
    const active = el.dataset.rung === level;
    el.className = active
      ? "rounded bg-brand-500/20 px-2 py-0.5 text-brand-300"
      : "rounded bg-slate-800 px-2 py-0.5";
  });
}

/* ---------- 7. Toast ---------- */
let toastTimer;
function showToast(title, sub) {
  if (title) els.toastTitle.textContent = title;
  if (sub) els.toastSub.textContent = sub;
  els.toast.classList.remove("translate-y-4", "opacity-0");
  els.toast.classList.add("translate-y-0", "opacity-100");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.add("translate-y-4", "opacity-0");
    els.toast.classList.remove("translate-y-0", "opacity-100");
  }, 3200);
}

/* ---------- 8. Learner Progress analytics (rebuilt from the event log) ----------
   Every metric below is DERIVED from the attempt history, never stored
   separately — so the numbers can never drift out of sync with the truth. */
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

function relativeTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function renderProgress() {
  const attempts = loadAttempts();
  updateAttemptBadge(); // keep the header count truthful whenever we view progress

  // --- Empty state: nothing to learn from yet. ---
  if (attempts.length === 0) {
    els.progressContent.innerHTML = `
      <div class="rounded-xl border border-dashed border-white/10 bg-slate-950/30 px-6 py-12 text-center">
        <p class="text-sm font-semibold text-slate-300">No attempts recorded yet</p>
        <p class="mt-1 text-xs text-slate-500">Generate a question and answer it — each answer is logged here so we can track ability gain over time.</p>
      </div>`;
    return;
  }

  const total = attempts.length;
  const correct = attempts.filter((a) => a.correct).length;
  const accuracy = pct(correct, total);

  // --- Ability trend: compare the earlier half vs the recent half. ---
  // A positive delta is concrete evidence the learner is improving.
  const mid = Math.floor(total / 2);
  const early = attempts.slice(0, mid);
  const recent = attempts.slice(mid);
  const earlyAcc = pct(early.filter((a) => a.correct).length, early.length);
  const recentAcc = pct(recent.filter((a) => a.correct).length, recent.length);
  const delta = recentAcc - earlyAcc;
  const deltaColor = delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-slate-300";
  const deltaSign = delta > 0 ? "+" : "";

  // --- Mastery per Bloom's level (only levels actually attempted). ---
  // Reuses the same stats the adaptive engine uses, so the panel and the
  // recommendation can never disagree about what's "mastered".
  const stats = computeLevelStats(attempts);
  const byLevel = LEVEL_ORDER
    .map((lvl) => ({ lvl, label: stats[lvl].bloom, n: stats[lvl].n, acc: stats[lvl].acc, mastered: stats[lvl].mastered }))
    .filter((r) => r.n > 0);

  const levelBars = byLevel.map((r) => {
    const bar = r.acc >= 67 ? "bg-emerald-500" : r.acc >= 34 ? "bg-amber-500" : "bg-rose-500";
    const badge = r.mastered
      ? '<span class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Mastered</span>'
      : '<span class="rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium text-slate-300">Practicing</span>';
    return `
      <div>
        <div class="mb-1 flex items-center justify-between text-xs">
          <span class="font-semibold text-slate-200">${r.label}</span>
          <span class="flex items-center gap-2 text-slate-400">${r.acc}% · ${r.n} ${r.n === 1 ? "try" : "tries"} ${badge}</span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div class="h-full rounded-full ${bar} transition-all" style="width:${r.acc}%"></div>
        </div>
      </div>`;
  }).join("");

  // --- Attempt timeline: chronological dots (green=correct, red=wrong). ---
  const timeline = attempts.slice(-40).map((a) =>
    `<span title="${a.bloom}: ${a.correct ? "correct" : "missed"}" class="h-3 w-3 rounded-sm ${a.correct ? "bg-emerald-500" : "bg-rose-500"}"></span>`
  ).join("");

  // --- Misconception decay: which misunderstandings recur, and are they fading? ---
  const missMap = {};
  attempts.forEach((a) => {
    if (a.misconception) {
      if (!missMap[a.misconception]) missMap[a.misconception] = { count: 0, lastTs: 0 };
      missMap[a.misconception].count++;
      missMap[a.misconception].lastTs = Math.max(missMap[a.misconception].lastTs, a.ts);
    }
  });
  const misconceptions = Object.entries(missMap)
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.count - a.count);

  const missList = misconceptions.length === 0
    ? '<p class="text-xs text-slate-400">No misconceptions triggered yet — every answer so far avoided the engineered traps.</p>'
    : misconceptions.map((m) => `
        <div class="flex items-start justify-between gap-3 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-2.5">
          <div class="flex-1">
            <p class="text-xs font-semibold text-amber-200">${m.label}</p>
            <p class="text-[11px] text-slate-500">Last triggered ${relativeTime(m.lastTs)}</p>
          </div>
          <span class="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">×${m.count}</span>
        </div>`).join("");

  els.progressContent.innerHTML = `
    <!-- Headline stats -->
    <div class="grid grid-cols-3 gap-3">
      <div class="rounded-xl border border-white/5 bg-slate-950/40 p-3 text-center">
        <p class="text-2xl font-extrabold text-white">${total}</p>
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Attempts</p>
      </div>
      <div class="rounded-xl border border-white/5 bg-slate-950/40 p-3 text-center">
        <p class="text-2xl font-extrabold text-white">${accuracy}%</p>
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Accuracy</p>
      </div>
      <div class="rounded-xl border border-white/5 bg-slate-950/40 p-3 text-center">
        <p class="text-2xl font-extrabold ${deltaColor}">${deltaSign}${delta}%</p>
        <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Trend</p>
      </div>
    </div>
    <p class="mt-2 text-center text-[11px] text-slate-500">Trend = recent accuracy (${recentAcc}%) vs. earlier (${earlyAcc}%) — your ability gain over time.</p>

    <!-- Mastery by Bloom's level -->
    <div class="mt-5">
      <h3 class="mb-3 text-xs font-bold uppercase tracking-wide text-emerald-300">Mastery by Bloom's level</h3>
      <div class="space-y-3">${levelBars}</div>
    </div>

    <!-- Attempt timeline -->
    <div class="mt-5">
      <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-slate-300">Attempt timeline <span class="font-normal text-slate-500">(oldest → newest)</span></h3>
      <div class="flex flex-wrap gap-1 rounded-lg border border-white/5 bg-slate-950/40 p-3">${timeline}</div>
    </div>

    <!-- Misconception decay -->
    <div class="mt-5">
      <h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-amber-300">Misconception log <span class="font-normal text-slate-500">(what to reteach)</span></h3>
      <div class="space-y-2">${missList}</div>
    </div>

    <!-- Reset -->
    <div class="mt-6 flex justify-end">
      <button id="reset-progress" class="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20">
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
        Reset progress
      </button>
    </div>`;

  // Wire the reset button (re-created each render, so bind here).
  document.getElementById("reset-progress").addEventListener("click", () => {
    clearAttempts();
    renderProgress();
  });
}

/* ---------- 9. Simulated AI pipeline ---------- */
function runPipeline() {
  return new Promise((resolve) => {
    const steps = [...els.pipeline.querySelectorAll(".pipeline-step")];
    const durations = [800, 1000, 900];
    let i = 0;
    const next = () => {
      if (i > 0) completeStep(steps[i - 1]);
      if (i >= steps.length) return resolve();
      activateStep(steps[i]);
      setTimeout(next, durations[i++]);
    };
    next();
  });
}

/* ---------- 10. Main generate flow ---------- */
async function generate() {
  // In adaptive mode the engine picks the level (and tells us why);
  // otherwise we honor the instructor's dropdown selection.
  const rec = adaptiveMode ? recommendNextLevel() : null;
  const level = rec ? rec.level : els.level.value;

  els.empty.classList.add("hidden");
  els.result.classList.add("hidden");
  els.loading.classList.remove("hidden");
  els.loadingSub.textContent = `Targeting Bloom's level: ${ASSESSMENTS[level].bloom}`;
  resetPipeline();

  els.generate.disabled = true;
  els.genLabel.textContent = "Generating…";
  els.genIcon.classList.add("animate-spin");

  await runPipeline();

  renderAssessment(level);

  // Surface the adaptive rationale at the top of the result.
  if (rec) {
    els.adaptiveBanner.classList.remove("hidden");
    els.adaptiveBanner.innerHTML = `
      <div class="flex items-center gap-2">
        <svg class="h-4 w-4 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/></svg>
        <span class="text-xs font-bold uppercase tracking-wide text-brand-300">Adaptive: why this question</span>
      </div>
      <p class="mt-1.5 text-xs leading-relaxed text-slate-300">${rec.reason}</p>`;
  } else {
    els.adaptiveBanner.classList.add("hidden");
  }

  els.loading.classList.add("hidden");
  els.result.classList.remove("hidden");

  els.generate.disabled = false;
  els.genLabel.textContent = adaptiveMode ? "Practice Next Recommended" : "Regenerate Assessment";
  els.genIcon.classList.remove("animate-spin");
}

/* ---------- 11. Accessible modal helper (focus trap + restore focus) ----------
   Best-practice dialog behavior: move focus into the dialog on open, keep Tab
   cycling inside it, close on Escape, and restore focus to the trigger on close. */
let lastFocusedEl = null;

function focusableIn(container) {
  return [...container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )].filter((el) => !el.disabled && el.offsetParent !== null);
}
function openModal(modal, focusTarget) {
  lastFocusedEl = document.activeElement;
  modal.classList.remove("hidden");
  (focusTarget || focusableIn(modal)[0])?.focus();
}
function closeModal(modal) {
  modal.classList.add("hidden");
  if (lastFocusedEl && typeof lastFocusedEl.focus === "function") lastFocusedEl.focus();
}
function trapTab(e, modal) {
  const f = focusableIn(modal);
  if (!f.length) return;
  const first = f[0];
  const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function openRationaleModal() { openModal(els.rationaleModal, els.closeRationale); }
function closeRationaleModal() { closeModal(els.rationaleModal); }
function openProgressModal() { renderProgress(); openModal(els.progressModal, els.closeProgress); }
function closeProgressModal() { closeModal(els.progressModal); }

/* ---------- 12. Event wiring ---------- */
els.generate.addEventListener("click", generate);
els.regenerate.addEventListener("click", generate);
els.export.addEventListener("click", () => {
  showToast("Exported to Canvas LMS", 'Assessment package queued for "Distributed Systems 401".');
});
els.level.addEventListener("change", (e) => updateLadder(e.target.value));

// Adaptive practice toggle: flips the switch, drives the dropdown, and
// shows/hides the recommendation card.
els.adaptiveToggle.addEventListener("click", () => {
  adaptiveMode = !adaptiveMode;
  els.adaptiveToggle.setAttribute("aria-checked", String(adaptiveMode));
  els.adaptiveToggle.classList.toggle("bg-brand-600", adaptiveMode);
  els.adaptiveToggle.classList.toggle("bg-slate-700", !adaptiveMode);
  els.adaptiveKnob.classList.toggle("translate-x-5", adaptiveMode);
  // Engine drives the selector when adaptive; lock the manual dropdown.
  els.level.disabled = adaptiveMode;
  els.level.classList.toggle("opacity-50", adaptiveMode);
  els.level.classList.toggle("cursor-not-allowed", adaptiveMode);
  els.genLabel.textContent = adaptiveMode ? "Practice Recommended Question" : "Generate Scenario Assessment";
  renderRecommendation();
  if (!adaptiveMode) els.adaptiveBanner.classList.add("hidden");
});

// Modal triggers.
els.openRationale.addEventListener("click", openRationaleModal);
els.closeRationale.addEventListener("click", closeRationaleModal);
els.rationaleBackdrop.addEventListener("click", closeRationaleModal);
els.openProgress.addEventListener("click", openProgressModal);
els.closeProgress.addEventListener("click", closeProgressModal);
els.progressBackdrop.addEventListener("click", closeProgressModal);

// Global key handling: Escape closes the open modal, Tab is trapped inside it.
document.addEventListener("keydown", (e) => {
  const openEl = !els.rationaleModal.classList.contains("hidden")
    ? els.rationaleModal
    : !els.progressModal.classList.contains("hidden")
      ? els.progressModal
      : null;
  if (!openEl) return;
  if (e.key === "Escape") closeModal(openEl);
  else if (e.key === "Tab") trapTab(e, openEl);
});

// Initialize: ladder + the attempt badge (reflects any saved history).
updateLadder(els.level.value);
updateAttemptBadge();
