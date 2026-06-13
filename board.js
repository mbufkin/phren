/*
  ChessBoard — a tiny, dependency-free chessboard widget.

  Scope choice (deliberately NOT a full chess engine): for teaching a fixed
  opening line we only need to (a) render a position, (b) let the learner move a
  piece by click-to-click, and (c) hand the attempted move to the lesson, which
  decides if it matches the expected London move. Keeping it scripted (no legal-
  move generator) is the right scope — smaller, fully offline, and tailored to
  the teaching goal rather than reinventing chess rules.

  Public API:
    const board = new ChessBoard(mountEl, { onMove });
    board.setPosition(fen);              // place pieces
    board.applyMove(from, to);           // animate an accepted move (+ castling)
    board.reject(from);                  // shake the piece (wrong move feedback)
    board.flash(square, 'correct'|'incorrect');
    board.lock(true|false);              // enable/disable interaction
    onMove({ from, to, piece }) -> the lesson validates and responds.
*/

// Solid glyphs for BOTH colors (consistent silhouettes); color comes from CSS.
const GLYPHS = { k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F" };
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

let _cbUid = 0;

class ChessBoard {
  constructor(mountEl, { onMove } = {}) {
    this.mount = mountEl;
    this.onMove = onMove || (() => {});
    this.board = emptyGrid();      // board[row][col]; row 0 = rank 8 (top)
    this.pieces = new Map();       // square -> { el, code }
    this.selected = null;
    this.locked = false;
    this.uid = ++_cbUid;           // unique id for this board's SVG marker
    this._build();
  }

  _build() {
    this.mount.classList.add("cb");
    this.mount.innerHTML = "";

    // Layer 1: the checker squares + coordinates.
    this.squaresEl = el("div", "cb-squares");
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sq = el("div", `cb-sq ${(row + col) % 2 === 0 ? "light" : "dark"}`);
        // Coordinates only on the edges (less clutter, still oriented).
        if (col === 0) sq.appendChild(coord("rank", 8 - row));
        if (row === 7) sq.appendChild(coord("file", FILES[col]));
        this.squaresEl.appendChild(sq);
      }
    }

    // Layer 2: highlights (last move, selection, correct/incorrect).
    this.hlEl = el("div", "cb-layer cb-highlights");
    // Layer 3: target dots.
    this.targetEl = el("div", "cb-layer cb-targets");
    // Layer 4: pieces.
    this.piecesEl = el("div", "cb-layer cb-pieces");
    this.piecesEl.style.pointerEvents = "auto";

    // Layer 5: move arrows (replay mode). SVG in 0..8 board coordinates.
    this.arrowEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.arrowEl.setAttribute("class", "cb-layer cb-arrows");
    this.arrowEl.setAttribute("viewBox", "0 0 8 8");
    this.arrowEl.setAttribute("preserveAspectRatio", "none");
    this.arrowEl.innerHTML =
      `<defs><marker id="cb-ah-${this.uid}" markerWidth="3.2" markerHeight="3.2" refX="1.7" refY="1.5" orient="auto">` +
      `<path d="M0,0 L3,1.5 L0,3 z"/></marker></defs>`;

    this.mount.append(this.squaresEl, this.hlEl, this.targetEl, this.piecesEl, this.arrowEl);

    // One click handler for the whole board (coordinates → square).
    this.mount.addEventListener("click", (e) => this._onClick(e));
  }

  /* ---------- Position setup ---------- */
  setPosition(fen) {
    this.board = emptyGrid();
    this.pieces.forEach((p) => p.el.remove());
    this.pieces.clear();
    this.selected = null;
    this._clearHighlights();
    this._clearTargets();

    const placement = fen.split(" ")[0];
    placement.split("/").forEach((rowStr, row) => {
      let col = 0;
      for (const ch of rowStr) {
        if (/\d/.test(ch)) { col += Number(ch); continue; }
        this._placePiece(squareName(col, row), ch);
        col++;
      }
    });
  }

  _placePiece(square, code) {
    const { row, col } = squareIndex(square);
    this.board[row][col] = code;
    const isWhite = code === code.toUpperCase();
    const p = el("div", `cb-piece ${isWhite ? "white" : "black"}`);
    p.textContent = GLYPHS[code.toLowerCase()];
    this._position(p, col, row);
    this.piecesEl.appendChild(p);
    this.pieces.set(square, { el: p, code });
  }

  _position(pieceEl, col, row) {
    pieceEl.style.left = `${col * 12.5}%`;
    pieceEl.style.top = `${row * 12.5}%`;
  }

  /* ---------- Interaction ---------- */
  _onClick(e) {
    if (this.locked) return;
    const square = this._squareFromEvent(e);
    if (!square) return;
    const occupant = this.pieces.get(square);

    if (!this.selected) {
      // Select only if there's a (white) piece to move.
      if (occupant && occupant.code === occupant.code.toUpperCase()) {
        this._select(square);
      }
      return;
    }

    if (square === this.selected) { this._deselect(); return; }

    // Re-select if clicking another own piece.
    if (occupant && occupant.code === occupant.code.toUpperCase()) {
      this._select(square);
      return;
    }

    // Otherwise: attempt a move from selected -> square. Lesson validates.
    const from = this.selected;
    const piece = this.pieces.get(from).code;
    this._deselect();
    this.onMove({ from, to: square, piece });
  }

  _select(square) {
    this._deselect();
    this.selected = square;
    this._addHighlight(square, "selected");
  }
  _deselect() {
    if (this.selected) this._removeHighlight(this.selected, "selected");
    this.selected = null;
  }

  _squareFromEvent(e) {
    const rect = this.mount.getBoundingClientRect();
    const cell = rect.width / 8;
    const col = Math.floor((e.clientX - rect.left) / cell);
    const row = Math.floor((e.clientY - rect.top) / cell);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return squareName(col, row);
  }

  /* ---------- Applying / rejecting moves ---------- */
  applyMove(from, to) {
    const moving = this.pieces.get(from);
    if (!moving) return;

    // Capture: fade out any piece already on the target.
    const target = this.pieces.get(to);
    if (target) {
      target.el.classList.add("captured");
      setTimeout(() => target.el.remove(), 200);
      this.pieces.delete(to);
    }

    // Update model + animate the piece to its new square.
    const fromIdx = squareIndex(from);
    const toIdx = squareIndex(to);
    this.board[fromIdx.row][fromIdx.col] = null;
    this.board[toIdx.row][toIdx.col] = moving.code;
    this._position(moving.el, toIdx.col, toIdx.row);
    this.pieces.delete(from);
    this.pieces.set(to, moving);

    // Castling: when the king jumps two files, slide the matching rook too.
    if (moving.code.toLowerCase() === "k" && Math.abs(toIdx.col - fromIdx.col) === 2) {
      const rank = from[1];
      if (toIdx.col === 6) this.applyMove("h" + rank, "f" + rank);   // O-O
      else if (toIdx.col === 2) this.applyMove("a" + rank, "d" + rank); // O-O-O
    }

    // Last-move signifier.
    this._clearHighlights("last");
    this._addHighlight(from, "last");
    this._addHighlight(to, "last");
  }

  reject(from) {
    const p = this.pieces.get(from);
    if (!p) return;
    p.el.classList.remove("shake");
    void p.el.offsetWidth; // restart the animation
    p.el.classList.add("shake");
  }

  flash(square, kind) {
    this._addHighlight(square, kind);
    setTimeout(() => this._removeHighlight(square, kind), 650);
  }

  /* Draw a single move arrow (from-square center -> to-square center). */
  drawArrow(from, to) {
    const a = squareIndex(from), b = squareIndex(to);
    const x1 = a.col + 0.5, y1 = a.row + 0.5;
    let x2 = b.col + 0.5, y2 = b.row + 0.5;
    // Pull the tip back a touch so the arrowhead doesn't overshoot the square.
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    x2 -= (dx / len) * 0.22; y2 -= (dy / len) * 0.22;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1); line.setAttribute("y1", y1);
    line.setAttribute("x2", x2); line.setAttribute("y2", y2);
    line.setAttribute("marker-end", `url(#cb-ah-${this.uid})`);
    this.arrowEl.appendChild(line);
  }
  clearArrows() {
    this.arrowEl.querySelectorAll("line").forEach((n) => n.remove());
  }

  lock(on) {
    this.locked = !!on;
    this.mount.classList.toggle("locked", this.locked);
    if (this.locked) this._deselect();
  }

  /* ---------- Highlight helpers ---------- */
  _addHighlight(square, kind) {
    const { row, col } = squareIndex(square);
    const hl = el("div", `cb-hl ${kind}`);
    hl.dataset.square = square;
    hl.dataset.kind = kind;
    hl.style.left = `${col * 12.5}%`;
    hl.style.top = `${row * 12.5}%`;
    this.hlEl.appendChild(hl);
  }
  _removeHighlight(square, kind) {
    this.hlEl.querySelectorAll(`.cb-hl.${kind}[data-square="${square}"]`).forEach((n) => n.remove());
  }
  _clearHighlights(kind) {
    const sel = kind ? `.cb-hl.${kind}` : ".cb-hl";
    this.hlEl.querySelectorAll(sel).forEach((n) => n.remove());
  }
  _clearTargets() { this.targetEl.innerHTML = ""; }
}

/* ---------- pure helpers ---------- */
function emptyGrid() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}
// col 0..7 = files a..h; row 0..7 = ranks 8..1 (top to bottom, white orientation)
function squareName(col, row) { return FILES[col] + (8 - row); }
function squareIndex(square) {
  return { col: FILES.indexOf(square[0]), row: 8 - Number(square[1]) };
}
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
function coord(kind, label) {
  const c = el("span", `cb-coord ${kind}`);
  c.textContent = label;
  return c;
}
