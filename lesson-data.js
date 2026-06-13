/*
  London System lesson content.

  Pedagogical stance (this is the "good teacher" the brief asks for):
   - We teach the SETUP/ideas, not move memorization. Every move ships with a
     rationale, so the learner builds a mental model, not a sequence.
   - Wrong moves are the richest signal. Each move lists `traps`: specific wrong
     destinations that map to a *named misconception* + a targeted correction.
     When a learner keeps hitting the same trap, that's exactly what the
     end-of-lesson AI review should diagnose.
   - Black's replies are scripted (we only need a fixed teaching line), which
     keeps scope tight: no full legal-move engine required.

  Step types:
   - "teach": a teaching card (title + body), optionally with a board caption.
   - "move":  the learner must find White's move on the board.
              expect {from,to}; reply = Black's scripted answer; traps map a
              wrong `to`-square to { msg, miss } (miss = misconception tag).
   - "check": a multiple-choice knowledge check; each option carries an insight.
*/

const LONDON_LESSON = {
  id: "london-system",
  title: "The London System",
  subtitle: "A solid, reusable opening setup for White",
  startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",

  steps: [
    {
      type: "teach",
      title: "What you'll learn",
      body:
        "The London System is a <strong>setup-based opening</strong>: instead of memorizing long forcing lines, you aim your pieces at the same good squares almost every game. You'll learn the order that matters and, more importantly, <em>why</em> each move is played.",
    },

    {
      type: "move",
      concept: "center",
      title: "Move 1 — take the center",
      prompt: "Play the move that claims the center and opens a path for your dark-squared bishop.",
      expect: { from: "d2", to: "d4" },
      san: "1. d4",
      why: "d4 grabs central space and, crucially, opens the c1–h6 diagonal so your dark-squared bishop can get out.",
      reply: { from: "d7", to: "d5", san: "1… d5" },
      traps: {
        e4: { miss: "plays-e4-not-d4", msg: "e4 is the King's-Pawn world — a different kind of game. The London is a d4 system: quieter, structured, the same plan every time." },
      },
      hint: "It's a central pawn, and it should move two squares.",
    },

    {
      type: "move",
      concept: "bishop-development",
      title: "Move 2 — the defining move",
      prompt: "Develop your dark-squared bishop to its London square — before you block it in.",
      expect: { from: "c1", to: "f4" },
      san: "2. Bf4",
      why: "Bf4 is the signature of the London. The bishop gets <strong>outside</strong> the pawn chain to an active square, instead of being buried behind its own pawns.",
      reply: { from: "g8", to: "f6", san: "2… Nf6" },
      traps: {
        e3: { miss: "bishop-behind-chain", msg: "Careful — if you play e3 first, the c1-bishop is trapped behind its own pawns. The London rule: get this bishop to f4 BEFORE e3." },
        g5: { miss: "wrong-bishop-square", msg: "Bg5 is the Trompowsky idea, not the London. The London bishop belongs on f4." },
      },
      hint: "The bishop currently on c1 wants an active diagonal outside the pawns.",
    },

    {
      type: "check",
      concept: "move-order",
      question: "What is the single most important idea behind the London's move order?",
      options: [
        { text: "Develop the dark-squared bishop to f4 before locking it in with e3", correct: true,
          insight: "Exactly. The London solves the classic 'bad bishop' problem by activating it first." },
        { text: "Attack immediately on the h-file with the h-pawn", correct: false,
          insight: "Premature flank attacks ignore development — you'll fall behind." },
        { text: "Trade queens as early as possible", correct: false,
          insight: "There's no reason to trade queens here; you'd just give up your attacking chances." },
        { text: "Push every pawn two squares to grab space", correct: false,
          insight: "Over-extending pawns creates weaknesses. The London is about harmonious piece setup." },
      ],
    },

    {
      type: "move",
      concept: "pawn-structure",
      title: "Move 3 — solid support",
      prompt: "Now that the bishop is out, play the modest pawn move that supports d4 and frees your light-squared bishop.",
      expect: { from: "e2", to: "e3" },
      san: "3. e3",
      why: "With the bishop safely on f4, e3 is perfect: it reinforces d4 and opens the door for the f1-bishop. This is the 'London pyramid' taking shape.",
      reply: { from: "e7", to: "e6", san: "3… e6" },
      traps: {
        e4: { miss: "overpush-e4", msg: "e4 here over-extends and abandons the calm London structure. A modest one-square push is the London way." },
      },
      hint: "A one-square pawn move in front of the king that props up d4.",
    },

    {
      type: "move",
      concept: "knight-placement",
      title: "Move 4 — develop a knight",
      prompt: "Develop your kingside knight to its natural square.",
      expect: { from: "g1", to: "f3" },
      san: "4. Nf3",
      why: "Nf3 controls the key e5 square and gets you one step closer to castling. Natural, flexible development.",
      reply: { from: "c7", to: "c5", san: "4… c5" },
      traps: {
        h3: { miss: "premature-h3", msg: "h3 can come later as a luft move, but you have pieces to develop first — knight before flank pawn." },
      },
      hint: "Knight from g1 to its best central post.",
    },

    {
      type: "move",
      concept: "pawn-structure",
      title: "Move 5 — answer the …c5 break",
      prompt: "Black just hit your center with …c5. Play the pawn move that braces d4 and completes the pyramid.",
      expect: { from: "c2", to: "c3" },
      san: "5. c3",
      why: "c3 is the backbone of the London. It supports d4 so Black's …c5 can't blow up your center, completing the d4–e3–c3 pyramid.",
      reply: { from: "b8", to: "c6", san: "5… Nc6" },
      traps: {
        c4: { miss: "c4-not-c3", msg: "c4 turns this into a Queen's-Gambit-style game and gives up the solid London structure. The London keeps the c3 pyramid." },
        d5: { miss: "captures-center", msg: "Capturing with dxc5 hands Black the center and easy development. Support d4 instead — don't release the tension." },
      },
      hint: "A one-square c-pawn move that sits under d4.",
    },

    {
      type: "check",
      concept: "pawn-structure",
      question: "Why does the London answer Black's …c5 with c3 instead of capturing?",
      options: [
        { text: "c3 supports d4, keeping a solid central pawn chain", correct: true,
          insight: "Right — the c3 pyramid is what makes the London so hard to crack." },
        { text: "Capturing dxc5 wins a pawn for free", correct: false,
          insight: "It doesn't win material — Black recaptures easily and gets active piece play." },
        { text: "c3 prepares an immediate checkmate", correct: false,
          insight: "No mate here; the London is about long-term structure, not cheap tricks." },
        { text: "It opens a file for the rook", correct: false,
          insight: "c3 keeps things closed and solid — that's the point." },
      ],
    },

    {
      type: "move",
      concept: "bishop-development",
      title: "Move 6 — aim at the kingside",
      prompt: "Develop your light-squared bishop to the square that eyes Black's kingside.",
      expect: { from: "f1", to: "d3" },
      san: "6. Bd3",
      why: "Bd3 points the bishop down the b1–h7 diagonal toward Black's king and supports a future e4 break. An active, purposeful square.",
      reply: { from: "f8", to: "d6", san: "6… Bd6" },
      traps: {
        e2: { miss: "passive-bishop", msg: "Be2 is passive. d3 is more active — it targets h7 and backs up the e4 break." },
      },
      hint: "Light-squared bishop to a square pointing at the enemy king (think h7).",
    },

    {
      type: "move",
      concept: "preserve-bishop",
      title: "Move 7 — keep your good bishop",
      prompt: "Black offered a trade with …Bd6. Move your strong dark-squared bishop out of harm's way while keeping it active.",
      expect: { from: "f4", to: "g3" },
      san: "7. Bg3",
      why: "Your f4-bishop is one of your best pieces — don't trade it off. Bg3 sidesteps the trade and keeps the bishop on a strong diagonal.",
      reply: { from: "e8", to: "g8", san: "7… O-O" },
      traps: {
        d6: { miss: "trades-good-bishop", msg: "You can capture on d6, but you'd be trading away your best London piece. Keep it with Bg3." },
        e5: { miss: "loose-bishop", msg: "On e5 the bishop can be kicked or traded. g3 is the safe, strong retreat." },
      },
      hint: "Retreat the f4-bishop one diagonal step to safety (still eyeing the long diagonal).",
    },

    {
      type: "move",
      concept: "knight-placement",
      title: "Move 8 — the last minor piece",
      prompt: "Develop your queenside knight. Remember: the c-pawn is on c3, so this knight needs a different square than usual.",
      expect: { from: "b1", to: "d2" },
      san: "8. Nbd2",
      why: "Because c3 occupies the knight's normal square, the b1-knight routes to d2. From there it supports a central e4 break and keeps options open.",
      reply: { from: "b7", to: "b6", san: "8… b6" },
      traps: {
        c3: { miss: "knight-blocks-cpawn", msg: "Nc3 collides with your own c3-pawn and blocks the pyramid. The London knight belongs on d2." },
        a3: { miss: "rim-knight", msg: "A knight on a3 sits on the rim doing nothing ('a knight on the rim is dim'). Route it to d2 instead." },
      },
      hint: "Queenside knight goes to d2 (not c3 — that pawn is taken).",
    },

    {
      type: "move",
      concept: "king-safety",
      title: "Move 9 — get the king safe",
      prompt: "Complete the London setup with the move every opening wants: get your king to safety.",
      expect: { from: "e1", to: "g1" },
      san: "9. O-O",
      why: "Castling tucks the king away and connects the rooks. Your London setup is complete: a rock-solid structure with active pieces and a clear plan.",
      reply: null,
      traps: {},
      hint: "Castle kingside (move the king two squares toward the h-rook).",
    },

    {
      type: "teach",
      title: "Setup complete",
      body:
        "That's the full London System: <strong>d4, Bf4, e3, Nf3, c3, Bd3, Bg3, Nbd2, O-O</strong>. Notice you reached a great position without memorizing tactics — just by understanding where each piece belongs and why. Now let's see how you did.",
    },
  ],
};
