# Phren — Agent Operating Manual

For Hermes, Codex CLI, OpenCode, Claude Code, and any other coding agents working on this repo.

## Read This First

Before touching any file, read:
1. `PRODUCT.md` — what we're building and why. Non-goals are as important as goals.
2. `DESIGN.md` — color tokens, interaction model, do/don'ts. Respect the dark theme.
3. `ARCHITECTURE.md` — system structure, module map, load order, the one rule (`LT.S`).
4. `DATA.md` — lesson schema, workspace structure, telemetry contracts.

## The Prime Directive

**Zero build step. Classic `<script>` tags. No npm, no bundler, no ES modules, no framework.**

Every `.js` file is loaded by a `<script>` tag in the HTML. They share one global namespace: `window.LT`. This is a feature, not a bug. Do not "modernize" it.

If you add a dependency, it must be:
- A CDN `<script>` tag (Tailwind, Inter font — already loaded)
- A Python stdlib module (the server uses zero pip packages)
- That's it. No exceptions.

## File Conventions

### JavaScript: no build, no modules, no bundler
- **Global namespace:** `window.LT` — everything hangs here
- **One rule:** mutate `LT.S` **fields** (`S.lesson = x`), never reassign `S` itself
- **Load order matters:** content → widgets → telemetry → store → llm → state → authoring → review → engine

### Python: stdlib only
- **server.py** — HTTP server + LLM proxy + upload handler
- No pip installs. `urllib`, `json`, `pathlib`, `http.server` only.

### HTML: single page
- **index.html** — the entire app (welcome, upload, lesson, review, profile)

### No `node_modules/`, no `package.json`, no `webpack.config.js`, no `tsconfig.json`
If you're tempted: stop. Re-read the prime directive.

## LLM Integration Rules

1. **Never leak the API key.** The client calls `/api/generate` — the server reads `.env` and proxies. The key never reaches the browser.
2. **Guardrail the model with source material.** Every LLM prompt includes the uploaded documents. The model generates FROM those documents, never from its own knowledge.
3. **Deterministic scoring is separate from LLM feedback.** Right/wrong is math. "Why" is LLM. Never let the LLM assign a score.
4. **No batch jobs.** All generation is real-time. Upload a document, get a course. Finish a lesson, get a review. No async job polling.

## When Adding a Feature

1. Check `PRODUCT.md` — is it in scope?
2. Check `DESIGN.md` — does it follow interaction model (buttons not chat for teachers)?
3. Check `DATA.md` — does the data model support it?
4. If the answer is no to any of these, update the doc first, then build.

## When Fixing a Bug

1. Read the relevant module in `ARCHITECTURE.md` to understand its contract
2. Check `LT.S` state — most bugs are state corruption or load-order issues
3. Check the browser console (no build step means errors are visible in DevTools immediately)
4. For server bugs: `ruff check <file>.py` then `python3 <file>.py` with diagnostic prints

## Commit Style

```
type: what changed

feat: add teacher upload endpoint
fix: state corruption on lesson replay
docs: add DATA.md with lesson schema
refactor: extract Workspace to workspace.py
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Specs Directory

Active implementation plans live in `../.hermes/specs/phren-school-poc/`. Read the plan before starting any school-mode work. The plan is the source of truth for the POC build sequence.
