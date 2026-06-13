# Architecture

This is a **zero-build, classic-script** web app with a thin Python proxy. No
bundler, no framework — every `.js` file is loaded by a `<script>` tag in
`index.html` and shares one global scope. The proxy exists for exactly two
reasons: keep the LLM key off the client, and dodge CORS.

The engine is split across four files that share one namespace, **`window.LT`**.
We use a plain global namespace (not ES modules) to stay consistent with the
rest of the app — `ChessBoard`, `Telemetry`, `LLM`, `LearnerStore` are all
globals — and to keep the "no build step" promise.

## The big picture

```
┌────────────────────────────── browser ──────────────────────────────┐
│  index.html  (markup + Tailwind CDN + inline animation/glow)         │
│                                                                      │
│  window.LT  — one namespace shared by the engine files:              │
│    state.js     core: DOM refs (LT.els), shared state (LT.S), helpers│
│    authoring.js LT.Authoring — write a lesson / the next lesson      │
│    review.js    LT.Review — finish, AI coaching, deterministic score │
│    engine.js    lesson runner + drill + progress panel + boot (last) │
│         │            │             │            │            │       │
│         ▼            ▼             ▼            ▼            ▼       │
│  lesson-data.js   board.js    telemetry.js  store.js      llm.js     │
│  london-source-   board-                    (localStorage)  │        │
│  lesson.js        replay.js                                 │        │
└─────────────────────────────────────────────────────────────┼───────┘
                                                               │ /api/*
                                                               ▼
                                       ┌──────────── server.py ─────────┐
                                       │  GET  /api/health  → model info │
                                       │  POST /api/generate → forward   │
                                       │  serves static files; .env key  │
                                       └────────► OpenAI-compatible LLM  ┘
```

## Modules and their jobs

| Module                    | Exposes               | Responsibility |
| ------------------------- | --------------------- | -------------- |
| `state.js`                | `window.LT` (core)    | DOM refs (`LT.els`), the single shared-state object (`LT.S`), screen router (`LT.show`), pure helpers. |
| `authoring.js`            | `LT.Authoring`        | AI writes a lesson from a topic, or the next lesson in a sequence; validates/repairs the JSON. |
| `review.js`               | `LT.Review`           | `finishLesson` bridge, AI coaching review, **deterministic mastery** + transparency panels. |
| `engine.js`               | `LT.startLesson` etc. | Lesson playback (teach/move/check), drill mode, the welcome progress panel, and app boot. Loaded last. |
| `lesson-data.js`          | `LONDON_LESSON`       | Hand-authored interactive lesson (has `move` steps → uses the board). |
| `london-source-lesson.js` | `LONDON_SOURCE_LESSON`| Concept lesson built from a source (checks + replay boards, no live moves). |
| `board.js`                | `ChessBoard`          | Interactive board: render position, validate/apply a move, lock, arrows. |
| `board-replay.js`         | `ChessReplay`         | Read-only "book diagram": step through a move list with notes + arrows. |
| `telemetry.js`            | `Telemetry`           | Record every move/check; derive repeated misconceptions; emit a `summary()`. |
| `store.js`                | `LearnerStore`        | Persistent progress: an append-only completion log in `localStorage`. |
| `llm.js`                  | `LLM`                 | Browser client for `/api/*`: `health()`, `generate()`, `generateJSON()`. |
| `server.py`               | —                     | Static server + LLM proxy; loads `.env`; never leaks the key. |

### How the split works (the one rule)

All mutable, cross-module state lives on a single object, **`LT.S`**. Modules
mutate its *fields* (`S.lesson = …`) and never reassign `S` itself, so every
file sees the same live values. Cross-module calls go through the namespace
(`LT.startLesson(…)`, `LT.Review.finishLesson()`, `LT.Authoring.generateNextLesson`),
which resolves at call-time — so the circular relationships between
engine ⇄ review ⇄ authoring are fine.

**Load order** (classic scripts): content + widgets + `telemetry` + `store` +
`llm` first; then `state.js` (defines `LT`), `authoring.js`, `review.js`, and
`engine.js` last (its boot code runs immediately and references the others).

## Key data contracts

### Lesson object (hand-authored *and* AI-authored share this shape)

```js
{
  id: "kebab-id",
  title: "…", subtitle: "…",
  startFen: "…",            // only when the lesson has `move` steps
  steps: [
    { type: "teach", title, body, board? },          // board? → inline ChessReplay
    { type: "move",  san, why, reply, traps, concept },
    { type: "check", concept, question, options: [
        { text, correct: true,  insight },
        { text, correct: false, miss: "tag", insight },
    ] },
  ],
}
```

`LT.Authoring.validateLesson()` is the gatekeeper for **AI-authored** lessons:
it repairs/strips bad steps and guarantees exactly one correct option per check.

### Telemetry `summary()` (the only thing the review model sees)

```js
{
  lessonId, durationSec, movesTotal, firstTryCorrect,
  totalWrongAttempts, hintsUsed, repeatedMisconceptions: [...],
  moves:  [{ san, concept, attempts, wrongSquares, misconceptions, timeSec, hintUsed }],
  checks: [{ question, concept, correct, misconception }],
  // Full action-by-action timeline: EVERY interaction with a relative
  // timestamp, so the coach can reason about *how* the learner worked.
  totalActions,
  timeline: [{ t, type, ... }],  // lesson_start, step_view, move_attempt,
                                 // move_solved, hint_used, check_answered,
                                 // replay_step, advance, drill_*, lesson_finish
}
```

The structured `moves`/`checks` arrays drive scoring; the `timeline` is the raw
session replay. Both are persisted in the completion record (see store.js).

### Progress log record (one per finished lesson, in `localStorage`)

```js
{ ts, lessonId, title, mastery, points: {got, max},
  movesTotal, firstTryCorrect, checksCorrect, checksTotal,
  durationSec, misconceptions: ["tag", …] }
```

Written once, in `LT.Review.finishLesson`. `LearnerStore.stats()` derives
lessons-done / average mastery / improvement trend *by replaying the log*, so
the numbers can never drift from the raw history.

### Proxy API

- `GET  /api/health` → `{ ok, model, base_url, api_key_set }` (key value never sent).
- `POST /api/generate` body `{ messages, temperature?, json?, max_tokens? }`
  → `{ ok, content, model, ms }` or `{ ok:false, error, detail }`.

## Where AI is — and isn't — trusted

| Moment            | Who decides                  | Why |
| ----------------- | ---------------------------- | --- |
| During a lesson   | Pre-authored content         | Fast, deterministic, no hallucinated feedback mid-move. |
| Authoring         | LLM → `validateLesson`       | Creative work, but schema-validated before it ever runs. |
| Review/coaching   | LLM                          | Qualitative judgment is what LLMs are good at. |
| **Mastery score** | **`LT.Review.computeMastery`** | A grade must be truthful and auditable — never guessed. |

## Extension points (the clean seams)

- **New hand-authored lesson:** add a `*-lesson.js` exposing a lesson object, a
  `<script>` tag, and a welcome-screen button wired to `LT.startLesson(THE_LESSON)`.
- **Swap the LLM backend:** edit `.env` only (`LLM_BASE_URL` / `LLM_MODEL` /
  `LLM_API_KEY`). No code changes.
- **Change the scoring policy:** `computeMastery()` in `review.js` is the single
  source of truth; the breakdown panel renders whatever it returns.
- **Tune prompts:** authoring prompts live in `authoring.js`
  (`buildAuthorPrompt`, `buildNextLessonPrompt`); the review prompt lives in
  `review.js` (`requestReview`).
- **Persist more / elsewhere:** `store.js` is the only place that touches
  `localStorage`; point `writeLog`/`readLog` at a backend to go multi-device.

## Known debt (read before building taller)

1. **No automated tests.** `board-test.html` is a manual harness. The
   deterministic pieces — `computeMastery` and `validateLesson` — are the
   cheapest, highest-value things to unit-test first.
2. **The full timeline is persisted in `localStorage`.** Fine for a prototype,
   but it grows with every run; a production build would stream the event log to
   a datastore and keep only summaries on the client.
