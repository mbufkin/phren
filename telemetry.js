/*
  Telemetry — the learning signal the AI review reasons about.

  Design intent: the *content* of a learner's mistakes matters more than a
  score. So we don't just count right/wrong — we record WHICH wrong square was
  tried (mapped to a named misconception) and HOW LONG each step took. That lets
  the end-of-lesson review say something a teacher would actually say:
  "you keep trapping your bishop behind the pawn chain" rather than "8/10".

  All client-side, no dependencies. summary() returns a small JSON-friendly
  object we hand to the model.
*/

class Telemetry {
  constructor(lessonId) {
    this.lessonId = lessonId;
    this.startedAt = Date.now();
    this.moves = [];   // one record per "move" step (structured, for scoring)
    this.checks = [];  // one record per "check" step (structured, for scoring)
    this._current = null;

    // The full timeline: EVERY action the learner takes, in order, with a
    // relative timestamp (ms since the lesson started). The structured arrays
    // above are great for scoring; this is the raw "show me exactly what they
    // did, and when" record the AI can read like a session replay.
    this.events = [];
  }

  /* Append one timeline event. `type` is a short verb; `data` is any extra
     context. Time is relative so it's small and privacy-neutral. */
  log(type, data) {
    // Build from data first, then stamp t/type LAST so a stray `type` field in
    // `data` can never clobber the event's real kind.
    const e = Object.assign({}, data || {});
    e.t = Date.now() - this.startedAt;
    e.type = type;
    this.events.push(e);
  }

  /* Call when a move step becomes active — starts its timer. */
  beginMove({ san, concept }) {
    this._current = {
      san,
      concept,
      attempts: [],     // { to, correct, miss }
      hintUsed: false,
      shownAt: Date.now(),
      solvedAt: null,
    };
    this.log("move_shown", { san, concept });
  }

  /* Record one board attempt on the active move step. */
  recordAttempt({ from, to, correct, miss }) {
    if (!this._current) return;
    this._current.attempts.push({ to, correct: !!correct, miss: miss || null });
    this.log("move_attempt", { san: this._current.san, from: from || null, to, correct: !!correct, miss: miss || null });
    if (correct) {
      this._current.solvedAt = Date.now();
      this.log("move_solved", {
        san: this._current.san,
        attempts: this._current.attempts.length,
        timeSec: Math.round((this._current.solvedAt - this._current.shownAt) / 1000),
      });
      this.moves.push(this._current);
      this._current = null;
    }
  }

  markHintUsed() {
    if (this._current) {
      this._current.hintUsed = true;
      this.log("hint_used", { san: this._current.san });
    }
  }

  /* `miss` is the misconception tag of a WRONG answer (null if correct or
     untagged) — this is how board-free concept lessons still produce a
     misconception signal for the review. */
  recordCheck({ question, concept, chosen, correct, miss }) {
    this.checks.push({ question, concept, chosen, correct: !!correct, miss: (!correct && miss) ? miss : null });
    this.log("check_answered", { concept, chosen, correct: !!correct, miss: (!correct && miss) ? miss : null });
  }

  /* ---- Derived analytics ---------------------------------------------- */

  /* Misconception tags seen 2+ times = a genuine pattern, not a slip.
     We pool BOTH board mistakes and wrong check answers, so the signal works
     whether a lesson is move-based (chess) or purely conceptual. */
  repeatedMisconceptions() {
    const counts = {};
    for (const m of this.moves) {
      for (const a of m.attempts) {
        if (a.miss) counts[a.miss] = (counts[a.miss] || 0) + 1;
      }
    }
    for (const c of this.checks) {
      if (c.miss) counts[c.miss] = (counts[c.miss] || 0) + 1;
    }
    return Object.entries(counts)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([miss, n]) => ({ miss, count: n }));
  }

  /* A compact, model-friendly snapshot of the whole session. */
  summary() {
    const totalMoves = this.moves.length;
    const firstTry = this.moves.filter((m) => m.attempts.length === 1 && m.attempts[0].correct).length;
    const totalWrong = this.moves.reduce(
      (sum, m) => sum + m.attempts.filter((a) => !a.correct).length, 0
    );

    return {
      lessonId: this.lessonId,
      durationSec: Math.round((Date.now() - this.startedAt) / 1000),
      movesTotal: totalMoves,
      firstTryCorrect: firstTry,
      totalWrongAttempts: totalWrong,
      hintsUsed: this.moves.filter((m) => m.hintUsed).length,
      repeatedMisconceptions: this.repeatedMisconceptions(),
      moves: this.moves.map((m) => ({
        san: m.san,
        concept: m.concept,
        attempts: m.attempts.length,
        wrongSquares: m.attempts.filter((a) => !a.correct).map((a) => a.to),
        misconceptions: [...new Set(m.attempts.filter((a) => a.miss).map((a) => a.miss))],
        timeSec: m.solvedAt ? Math.round((m.solvedAt - m.shownAt) / 1000) : null,
        hintUsed: m.hintUsed,
      })),
      checks: this.checks.map((c) => ({
        question: c.question, concept: c.concept, correct: c.correct,
        misconception: c.miss || null,
      })),
      // The full action-by-action timeline (every click, move, hint, nav) so
      // the AI can reason about *how* the learner worked, not just the outcome.
      totalActions: this.events.length,
      timeline: this.events,
    };
  }
}
