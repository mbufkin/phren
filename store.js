/*
  store.js — the learner's persistent memory.

  WHY this shape: progress is an APPEND-ONLY EVENT LOG in localStorage, not a
  single overwritten "score". An event log is the right primitive for learning
  analytics — it preserves history, so every metric (trend, averages, per-topic
  bests) can be *rebuilt by replay* and can never silently drift out of sync
  with the truth. In production this exact event shape would stream to a
  datastore; here it just lives in the browser so a refresh no longer wipes you.

  One record is written when a lesson is finished (see review.finishLesson).
  Nothing else mutates the log except an explicit reset.
*/
const LearnerStore = (function () {
  "use strict";

  const KEY = "london-tutor:progress:v1";

  // Read the raw log defensively — corrupt/legacy data must never crash boot.
  function readLog() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writeLog(log) {
    try {
      localStorage.setItem(KEY, JSON.stringify(log));
      return true;
    } catch (_) {
      // Storage can be full or blocked (private mode). Fail soft — the app
      // still works for the current session, it just won't remember.
      return false;
    }
  }

  /*
    Append one completion. We store a flattened, self-contained snapshot (not a
    reference to live objects) so the record is a permanent fact about that run.
      meta: { lessonId, title, mastery: {score, got, max} }
      summary: the telemetry summary() for that run
  */
  function record(meta, summary) {
    const checksCorrect = summary.checks.filter((c) => c.correct).length;
    const entry = {
      ts: Date.now(),
      lessonId: meta.lessonId || summary.lessonId || "lesson",
      title: meta.title || "Lesson",
      mastery: meta.mastery && typeof meta.mastery.score === "number" ? meta.mastery.score : 0,
      points: meta.mastery ? { got: meta.mastery.got, max: meta.mastery.max } : null,
      movesTotal: summary.movesTotal || 0,
      firstTryCorrect: summary.firstTryCorrect || 0,
      checksCorrect,
      checksTotal: summary.checks.length,
      durationSec: summary.durationSec || 0,
      // Keep the misconception tags so "what to reteach" survives the session.
      misconceptions: (summary.repeatedMisconceptions || []).map((m) => m.miss),
      // Persist the full action timeline so a past run can be replayed/reviewed
      // later, not just the score. (For a prototype this lives in localStorage;
      // in production it would stream to a datastore.)
      totalActions: summary.totalActions || 0,
      timeline: summary.timeline || [],
    };
    const log = readLog();
    log.push(entry);
    writeLog(log);
    return entry;
  }

  // Newest-first list of completions.
  function history() {
    return readLog().slice().sort((a, b) => b.ts - a.ts);
  }

  /*
    Derived stats — all computed from the log on demand (never stored), so they
    can't disagree with the raw history.
      - lessons: total completions
      - avgMastery: mean mastery across all runs
      - trend: recent-half average minus earlier-half average (evidence of
        improvement over time); null until there are enough runs to compare.
  */
  function stats() {
    const log = readLog().slice().sort((a, b) => a.ts - b.ts); // oldest-first
    const lessons = log.length;
    if (!lessons) return { lessons: 0, avgMastery: 0, trend: null };

    const masteries = log.map((e) => e.mastery);
    const avgMastery = Math.round(masteries.reduce((s, n) => s + n, 0) / lessons);

    let trend = null;
    if (lessons >= 2) {
      const mid = Math.floor(lessons / 2);
      const earlier = masteries.slice(0, mid);
      const recent = masteries.slice(mid);
      const mean = (a) => a.reduce((s, n) => s + n, 0) / a.length;
      trend = Math.round(mean(recent) - mean(earlier));
    }
    return { lessons, avgMastery, trend };
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
  }

  return { record, history, stats, clear };
})();
