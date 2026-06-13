/*
  state.js — the shared core for the lesson runtime.

  The engine is split across several classic <script> files (state / authoring /
  review / engine) that all share one namespace: window.LT. We use a plain
  global namespace (not ES modules) to stay consistent with the rest of the app,
  where ChessBoard / Telemetry / LLM are already globals, and to keep the
  "no build step" promise.

  THE ONE RULE that makes this work: all mutable, cross-module state lives on the
  single object `LT.S`. Modules read/write its FIELDS (e.g. `S.lesson = ...`),
  never reassign `S` itself — so every file sees the same live values. DOM
  refs (`LT.els`) and pure helpers are also hung here so each module can grab
  them with one line at the top.
*/
window.LT = window.LT || {};

(function (LT) {
  "use strict";

  // ---- Cached DOM refs (scripts run at end of <body>, so the DOM exists) ----
  LT.els = {
    start: document.getElementById("start-btn"),
    modelName: document.getElementById("model-name"),
    modelDot: document.querySelector("#model-badge span"),
    stepCard: document.getElementById("step-card"),
    feedback: document.getElementById("feedback"),
    controls: document.getElementById("controls"),
    stepCounter: document.getElementById("step-counter"),
    progressFill: document.getElementById("progress-fill"),
    moveLog: document.getElementById("move-log"),
    reviewBody: document.getElementById("review-body"),
    lessonTitleMini: document.getElementById("lesson-title-mini"),
    grid: document.getElementById("lesson-grid"),
    boardCol: document.getElementById("board-col"),
    progressPanel: document.getElementById("progress-panel"),
    // Header / navigation
    homeLink: document.getElementById("home-link"),
    profileBtn: document.getElementById("profile-btn"),
    heroEyebrow: document.getElementById("hero-eyebrow"),
    profileBody: document.getElementById("profile-body"),
    // Lesson library (revisit previously made lessons)
    libraryBtn: document.getElementById("library-btn"),
    libraryBody: document.getElementById("library-body"),
    // Authoring controls (may be absent now that the home cards were removed —
    // every consumer guards for null, so this stays safe).
    authorSubject: document.getElementById("author-subject"),
    authorLevel: document.getElementById("author-level"),
    authorBtn: document.getElementById("author-btn"),
    authorStatus: document.getElementById("author-status"),
  };

  LT.screens = {
    welcome: document.getElementById("screen-welcome"),
    lesson: document.getElementById("screen-lesson"),
    review: document.getElementById("screen-review"),
    profile: document.getElementById("screen-profile"),
    library: document.getElementById("screen-library"),
  };

  // The two-column (board + content) grid class, toggled on for move lessons.
  LT.TWO_COL = "lg:grid-cols-[1fr_minmax(300px,420px)]";

  // ---- Shared mutable state (mutate fields, never reassign LT.S) ----
  LT.S = {
    lesson: null,                  // the lesson currently running
    activeLesson: LONDON_LESSON,   // what "Replay" should re-run
    legend: {},                    // misconception tag -> human meaning (per lesson)

    board: null,                   // ChessBoard instance, or null for concept lessons
    telemetry: null,               // Telemetry instance for the current run
    stepIndex: 0,
    awaitingMove: false,           // board clicks only count during a move step
    currentStep: null,
    playedSan: [],                 // move log (mutate in place)

    // Drilling: practice ONLY the missed items.
    mode: "lesson",                // "lesson" | "drill"
    missedSteps: [],               // step objects answered/played wrong (deduped)
    drillQueue: [],
    drillTotal: 0,
    drillAwaitingMove: false,
    currentDrillStep: null,

    // Review caches, so we can return to the review without re-calling the model.
    lastResult: null,
    lastSummary: null,
    lastReviewData: null,          // the coach's parsed review (drives next-lesson)
  };

  // ---- Screen router ----
  LT.show = function (name) {
    Object.entries(LT.screens).forEach(([k, el]) => {
      el.hidden = k !== name;
      // Re-trigger the fade-in animation on the screen we're showing.
      if (k === name) { el.classList.remove("screen"); void el.offsetWidth; el.classList.add("screen"); }
    });
  };

  // ---- Pure helpers shared by every module ----
  LT.clamp = function (n, lo, hi) { return Math.max(lo, Math.min(hi, n)); };
  LT.isStr = function (x) { return typeof x === "string" && x.trim().length > 0; };
  LT.slug = function (s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "lesson";
  };
  LT.escapeHtml = function (s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  };
})(window.LT);
