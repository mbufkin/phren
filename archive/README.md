# Archive — superseded code (kept for reference, not loaded)

These files are from the project's **first iteration**, the "Bloom Assessment
Engine," a CAP-theorem multiple-choice prototype. The project later pivoted to
the **London Tutor** (interactive chess lessons + LLM authoring/review), which
lives entirely in the repo root.

Nothing here is referenced by `index.html` or any live module, so it does not
run. It's preserved (not deleted) so the earlier design — and its writeup on
"meaningful questions" / Bloom's Taxonomy — isn't lost.

| File         | What it was                                                        |
| ------------ | ------------------------------------------------------------------ |
| `app.js`     | The old engine: adaptive practice, progress panel, modal wiring.   |
| `data.js`    | The `ASSESSMENTS` content bank (CAP theorem, 4 Bloom's levels).    |
| `styles.css` | Scrollbar / accordion / glow styles (now inlined in `index.html`). |

**To restore any file**, move it back to the root and re-add the matching
`<script>`/`<link>` tag in `index.html`. Safe to delete this whole folder if you
no longer want the history.
