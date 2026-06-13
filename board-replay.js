/*
  ChessReplay — an interactive "chess book diagram".

  This is the trusted component the model can summon (via a JSON `board`
  directive) WITHOUT writing any HTML itself. Give it a start position and a
  line of moves; it renders the board plus Prev/Next controls so the learner can
  step forward and back through the moves — with an on-board arrow showing how
  the current position was reached.

  Usage (the engine does this when a teach step carries a `board`):
    new ChessReplay(containerEl, {
      startFen: "rnbqkbnr/...",
      line: [{ from, to, san, note }, ...]
    });

  Reliability note: we deliberately animate ONLY the forward "Next" move; going
  back or jumping rebuilds the position instantly (no half-finished slides).
*/

class ChessReplay {
  constructor(container, { startFen, line = [], onStep = null } = {}) {
    this.startFen = startFen;
    this.line = line;
    this.onStep = onStep; // optional: notify the engine so it can log navigation
    this.ply = 0; // 0 = start position; k = after k moves

    container.innerHTML = "";

    // Board (capped width so it reads like an inline figure, not a full app).
    const boardMount = document.createElement("div");
    boardMount.style.maxWidth = "340px";
    boardMount.style.margin = "0 auto";
    container.appendChild(boardMount);
    this.boardMount = boardMount;
    this.board = new ChessBoard(boardMount, {});
    this.board.lock(true); // replay = look, don't touch
    this.board.setPosition(startFen);

    // Caption: which move we're on + the author's note for it.
    this.noteEl = document.createElement("div");
    this.noteEl.className = "mt-3 text-sm text-slate-300 min-h-[2.5rem] text-center";
    container.appendChild(this.noteEl);

    // Controls: |<  <   indicator   >  >|
    const bar = document.createElement("div");
    bar.className = "mt-2 flex items-center justify-center gap-2";
    this.btnFirst = mkBtn("\u23EE", "Jump to start");
    this.btnPrev = mkBtn("\u2190", "Previous move");
    this.indicator = document.createElement("span");
    this.indicator.className = "text-xs text-slate-400 font-medium min-w-[5.5rem] text-center tabular-nums";
    this.btnNext = mkBtn("\u2192", "Next move");
    this.btnLast = mkBtn("\u23ED", "Jump to end");
    bar.append(this.btnFirst, this.btnPrev, this.indicator, this.btnNext, this.btnLast);
    container.appendChild(bar);

    this.btnFirst.addEventListener("click", () => this.goTo(0));
    this.btnPrev.addEventListener("click", () => this.goTo(this.ply - 1));
    this.btnNext.addEventListener("click", () => this.goTo(this.ply + 1));
    this.btnLast.addEventListener("click", () => this.goTo(this.line.length));

    this._update();
  }

  goTo(target) {
    target = Math.max(0, Math.min(this.line.length, target));
    if (target === this.ply) return;

    if (target === this.ply + 1) {
      // Forward one move: animate the slide (the satisfying part).
      const m = this.line[this.ply];
      this.board.applyMove(m.from, m.to);
      this.ply = target;
    } else {
      // Any jump / step-back: rebuild instantly to avoid messy partial slides.
      this._rebuild(target);
      this.ply = target;
    }
    this._drawArrow();
    this._update();
    // Tell whoever's listening which move we landed on (for telemetry).
    if (this.onStep) {
      const m = this.ply > 0 ? this.line[this.ply - 1] : null;
      this.onStep(this.ply, m ? (m.san || "") : "start");
    }
  }

  _rebuild(k) {
    this.boardMount.classList.add("no-anim");
    this.board.setPosition(this.startFen);
    for (let i = 0; i < k; i++) this.board.applyMove(this.line[i].from, this.line[i].to);
    // Re-enable animation after this frame so the next forward move slides.
    requestAnimationFrame(() => this.boardMount.classList.remove("no-anim"));
  }

  _drawArrow() {
    this.board.clearArrows();
    if (this.ply > 0) {
      const m = this.line[this.ply - 1];
      this.board.drawArrow(m.from, m.to);
    }
  }

  _update() {
    const atStart = this.ply === 0;
    const atEnd = this.ply === this.line.length;
    [this.btnFirst, this.btnPrev].forEach((b) => disable(b, atStart));
    [this.btnNext, this.btnLast].forEach((b) => disable(b, atEnd));

    if (atStart) {
      this.indicator.textContent = "Start";
      this.noteEl.innerHTML = `<span class="text-slate-400">Starting position \u2014 press \u2192 to play through.</span>`;
    } else {
      const m = this.line[this.ply - 1];
      this.indicator.textContent = `${this.ply} / ${this.line.length}`;
      this.noteEl.innerHTML =
        `<span class="font-semibold text-white">${m.san || ""}</span>` +
        (m.note ? ` &mdash; ${m.note}` : "");
    }
  }
}

function mkBtn(label, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.title = title;
  b.setAttribute("aria-label", title);
  b.textContent = label;
  b.className =
    "w-9 h-9 grid place-items-center rounded-lg bg-slate-800 border border-white/10 " +
    "text-slate-200 hover:bg-slate-700 active:translate-y-px transition disabled:opacity-30 disabled:cursor-not-allowed";
  return b;
}
function disable(btn, on) { btn.disabled = !!on; }
