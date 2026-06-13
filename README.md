# London Tutor

An AI tutor that teaches the **London System** chess opening, then **reviews how
you actually played** and tells you what to practice next.

Built for the brief *"Option A: Content-to-Assessment"* — turn source material
into _meaningful_ practice. The interesting part isn't the chessboard; it's
**where the AI is trusted and where it isn't**:

- **AI authors the lesson** (and the _next_ lesson) **from your source material** —
  `source-material.js` is the model's _single source of truth_. Every generation
  is handed that corpus with a strict contract: teach only what the source
  supports, never invent theory. Lessons are explanations plus knowledge checks
  whose wrong answers each encode a real misconception the source warns about.
- **AI reviews your run** — it reads per-move/per-answer telemetry and coaches
  you on what to fix.
- **AI does _not_ score you.** Mastery is computed deterministically from your
  telemetry (see "Mastery" below), so the number is always truthful and
  auditable — the model never gets to "make up" a grade.

> **Thesis — what "meaningful" means:** a meaningful question forces _transfer_
> (apply a concept to a new situation), and is wrong in _diagnostic_ ways —
> every distractor maps to a specific misconception, so a wrong answer tells you
> exactly what to reteach.

---

## Run it

This needs the local proxy running (it serves the page **and** holds the LLM
key server-side — the browser never sees it).

```bash
# 1. configure the model backend (see .env.example)
cp .env.example .env        # then paste your key / model into .env

# 2. start the server (also serves the static app)
python3 server.py

# 3. open the app
open http://localhost:8753
```

No build step, no npm install — Tailwind is loaded via CDN and all logic is
plain classic-script JavaScript.

> Opening `index.html` directly (file://) shows the UI but the AI features
> (authoring / review / next-lesson) need the proxy, so use the URL above.

---

## How a session works

1. **Welcome** — one button starts (or continues) an ordered course. The first
   four lessons are **pre-generated** from the source material (see
   `gen-course.js` → `course-lessons.js`) so they start instantly; lesson five
   onward is generated live. A **Previous lessons** button opens a library to
   replay any made lesson, and a **Profile** tab shows your full history, each
   run's action timeline, and a standing AI analysis refreshed in the background
   after every finished lesson.
2. **Lesson** — step through `teach` / `move` / `check` cards. On a `move` step
   the board enforces the correct move; feedback during the lesson is
   **fast and pre-authored** (no per-move LLM latency, no hallucinated coaching).
3. **Review** — the AI coach reads your telemetry and gives strengths / focus /
   a concrete next step. A **"How your mastery was scored"** panel shows the math.
4. **From here** you can **Drill what you missed** (only the wrong items, requeued
   until correct), generate the **Next lesson**, or **Replay**.

## Mastery (deterministic, not AI-guessed)

Every item is worth 1 point:

- A knowledge check: correct = 1, wrong = 0.
- A chess move: solved on the first try (no hint) = 1; solved after a wrong try
  or a hint = 0.5.

`mastery = round(100 × points / items)`. All-correct ⇒ 100%, guaranteed. The
review screen renders the full breakdown so the score is never a mystery.

## Project structure

```
london-tutor/
├── index.html              # markup, Tailwind CDN/config, inline animations/glow
├── board.css               # chessboard widget styles
│
│   # ── engine, split by concern; all share the window.LT namespace ──
├── state.js                # LT core: DOM refs, shared state (LT.S), pure helpers
├── authoring.js            # LT.Authoring — AI writes a lesson / the next lesson
├── review.js               # LT.Review — finish, AI coaching, deterministic mastery
├── engine.js               # lesson runner + drill + progress panel + boot (loads last)
│
├── source-material.js      # SOURCE_MATERIAL — the corpus the AI must teach FROM (SSOT)
├── gen-course.js           # one-off tool: pre-generate the first 4 lessons (Node)
├── course-lessons.js       # COURSE_LESSONS — the 4 pre-generated lessons (built by gen-course.js)
├── lesson-data.js          # LONDON_LESSON  — hand-authored interactive board lesson
├── london-source-lesson.js # LONDON_SOURCE_LESSON — concept lesson built from a source
│
├── board.js                # ChessBoard widget (play + validate moves)
├── board-replay.js         # ChessReplay widget (step through a line, arrows)
├── telemetry.js            # Telemetry — records moves/checks, derives misconceptions
├── store.js                # LearnerStore — persistent progress (append-only log)
├── llm.js                  # LLM — thin browser client for the same-origin proxy
│
├── server.py               # static server + LLM proxy (/api/health, /api/generate)
├── .env                    # secrets + backend config (gitignored — never commit)
├── .env.example            # template showing the expected keys
│
├── board-test.html         # standalone manual test page for the board widget
└── archive/                # superseded first-iteration code (not loaded)
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module map, data flow, the
browser↔proxy↔LLM boundary, and where to extend.

## Tech notes

- **Tailwind CSS** via the Play CDN — zero build, portable prototype.
- **Vanilla JavaScript**, classic scripts (no bundler). Content (`*-lesson.js`)
  is data, isolated from behavior (`lesson.js`).
- **Source-grounded authoring.** Every lesson the model writes is generated
  _from_ `source-material.js` (the supplied corpus + canonical lines), under a
  grounding contract that forbids inventing theory. Swap that one file to teach a
  different subject — the engine, prompts, and contract stay the same.
- **LLM is backend-agnostic.** `server.py` talks to any OpenAI-compatible
  endpoint; swap Ollama / NVIDIA NIM / OpenCode Zen by editing `.env` only.
- **Secret hygiene.** The API key lives in a gitignored `.env`, loaded
  server-side; the browser only ever calls our own `/api/*` routes.

### Honest limitations / next steps

- AI-generated lessons now include **interactive board walkthroughs**: the model
  emits a move list that the replay widget renders, so each new lesson has boards
  to step through. Coordinates are validated (bad ones dropped), but the model is
  **not a chess engine** — illegal or inaccurate lines are possible. The
  production fix is a server-side legality check or a real engine. Interactive
  _make-the-move_ steps remain reserved for the hand-authored lesson.
- Every learner action is captured in a full **timeline** (`telemetry.js`),
  fed to the AI coach, shown in the review's "Full action timeline" panel, and
  persisted with each completion in `localStorage`. For a prototype that's fine;
  production would stream the event log to a datastore and keep the client lean.
- For production you'd compile Tailwind (purged/minified) instead of the CDN
  runtime, and add unit tests for the deterministic pieces (`computeMastery`,
  `validateLesson`).
