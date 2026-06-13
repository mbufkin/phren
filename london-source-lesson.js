/*
  EXEMPLAR LESSON — "what a good job looks like".

  Hand-authored from MULTIPLE real sources (see `sources` below) so it can serve
  two roles:
    1. A gold-standard lesson the learner can actually take.
    2. Once approved, a FEW-SHOT example we feed the model so AI-authored
       lessons match this bar instead of drifting into recall quizzes.

  Design rules this lesson follows on purpose:
    - Like a chess book, it OPENS with a short illustrative model game (an
      interactive replay board) before any abstract rules — concrete first.
    - Every "check" tests UNDERSTANDING / JUDGMENT / APPLICATION, never bare
      recall; each wrong option encodes a SPECIFIC misconception (the `miss`
      tag) so a wrong answer diagnoses *why* the learner is confused.
    - Checks rise in difficulty (understand -> move-order judgment ->
      counterplay application -> positional judgment).
    - All content is faithful to the cited sources (no invented theory).
*/

const LONDON_SOURCE_LESSON = {
  id: "london-system-from-source",
  title: "The London System (from source)",
  subtitle: "Understanding the ideas behind the setup",

  // Provenance kept WITH the lesson (multiple sources now, not just one).
  // The closing "Sources" card renders these so attribution lives in the lesson.
  sources: [
    { title: "London System", publisher: "Wikipedia", url: "https://en.wikipedia.org/wiki/London_System" },
    { title: "The Agile London System (sample)", publisher: "New in Chess", url: "https://www.newinchess.com/media/wysiwyg/product_pdf/9035.pdf" },
    { title: "Opening Repertoire: London System (sample)", publisher: "New in Chess \u2014 Cyrus Lakdawala", url: "https://www.newinchess.com/media/wysiwyg/product_pdf/8992.pdf" },
    { title: "London System \u2014 Openings", publisher: "Chess.com", url: "https://www.chess.com/openings/London-System" },
    { title: "The London System Opening", publisher: "Old School Chess", url: "https://oldschoolchess.com/learn/concepts/london-system" },
  ],

  steps: [
    {
      type: "teach",
      title: "What the London System is",
      body:
        "The London System is a <em>setup</em> opening for White: <strong>1.d4</strong> and <strong>2.Bf4</strong>, " +
        "then the same solid shell against almost anything Black plays \u2014 <strong>e3, c3, Bd3, Nf3, Nbd2</strong> " +
        "(often <strong>h3</strong> too). The d4\u2013e3\u2013c3 pawn triangle gives White a base with no weaknesses, " +
        "and the core plan is landing a knight on <strong>e5</strong> \u2014 backed by the d4-pawn \u2014 followed by chances on the kingside.",
    },
    {
      type: "teach",
      title: "The big idea: an active queen's bishop",
      body:
        "The move that <em>defines</em> the London is developing the c1-bishop <strong>outside</strong> the pawn chain to f4, early. " +
        "Contrast this with the <em>Colle System</em>, which leaves that bishop passive, or the <em>Trompowsky</em>, which puts it on g5. " +
        "The London commits to an active bishop on f4 that eyes the e5 and c7 squares.",
    },
    {
      type: "teach",
      title: "A model game: see the plan in action",
      body:
        "Like the illustrative game that opens a chess chapter, step through a clean London game first \u2014 use the arrows to go forward and back. " +
        "Watch White calmly build the setup, then plant a knight on <strong>e5</strong> and swing the queen toward the king. " +
        "Notice the goal isn't a memorized trap; it's reaching a position where White <em>knows what to do</em>.",
      board: {
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
        line: [
          { from: "d2", to: "d4", san: "1. d4", note: "Claim the center and open the c1\u2013h6 diagonal." },
          { from: "d7", to: "d5", san: "1\u2026 d5", note: "Black answers in the center." },
          { from: "c1", to: "f4", san: "2. Bf4", note: "The defining move \u2014 bishop OUTSIDE the chain, eyeing e5." },
          { from: "g8", to: "f6", san: "2\u2026 Nf6", note: "Black develops a knight." },
          { from: "e2", to: "e3", san: "3. e3", note: "Now safe to support d4 and free the f1-bishop." },
          { from: "e7", to: "e6", san: "3\u2026 e6", note: "Black builds a solid wall." },
          { from: "g1", to: "f3", san: "4. Nf3", note: "Controls e5; prepares castling." },
          { from: "c7", to: "c5", san: "4\u2026 c5", note: "Black strikes at the d4-center \u2014 the main try." },
          { from: "c2", to: "c3", san: "5. c3", note: "The pyramid: d4\u2013e3\u2013c3 is rock-solid." },
          { from: "b8", to: "c6", san: "5\u2026 Nc6", note: "Black develops, pressing d4." },
          { from: "b1", to: "d2", san: "6. Nbd2", note: "Knight to d2 \u2014 it keeps the c-pawn free and supports e4/e5." },
          { from: "f8", to: "d6", san: "6\u2026 Bd6", note: "Black offers to trade the strong f4-bishop." },
          { from: "f4", to: "g3", san: "7. Bg3", note: "Sidestep the trade \u2014 keep the good bishop on the b8\u2013h2 diagonal." },
          { from: "e8", to: "g8", san: "7\u2026 O-O", note: "Black castles into the line of fire." },
          { from: "f1", to: "d3", san: "8. Bd3", note: "Aim the light bishop straight at h7." },
          { from: "b7", to: "b6", san: "8\u2026 b6", note: "Black prepares to develop the c8-bishop to b7." },
          { from: "f3", to: "e5", san: "9. Ne5", note: "The dream square \u2014 a knight on e5, supported by the d4-pawn." },
          { from: "c8", to: "b7", san: "9\u2026 Bb7", note: "Black completes development." },
          { from: "d1", to: "f3", san: "10. Qf3", note: "The queen swings over: Qf3\u2013h3 and Bd3 point at the black king." },
        ],
      },
    },

    {
      type: "check",
      concept: "bishop-before-pawn",
      question: "Why does the London develop the bishop to f4 <em>before</em> playing e3?",
      options: [
        { text: "Because e3 would block the c1-bishop's diagonal, so the bishop must get out first.", correct: true,
          insight: "Right \u2014 the London's whole identity is an active queen's bishop, so it leaves home before e3 shuts the door." },
        { text: "Because playing e3 first would lose the d4-pawn.", correct: false, miss: "thinks-e3-hangs-pawn",
          insight: "e3 is perfectly safe; the issue is purely that it would trap the bishop, not lose material." },
        { text: "Because Bf4 already threatens Black's king on move 2.", correct: false, miss: "overrates-early-attack",
          insight: "On f4 the bishop works long-term (eyeing e5 and c7); there's no real threat this early." },
        { text: "Because in a 'system' opening the move order never matters.", correct: false, miss: "ignores-move-order",
          insight: "Systems still have move-order traps \u2014 here Bf4-before-e3 is essential, as you just saw." },
      ],
    },
    {
      type: "teach",
      title: "Move order still matters",
      body:
        "Even in a system, the order isn't free. Modern theory prefers <strong>2.Bf4 immediately</strong> over developing the knight first, " +
        "because after <strong>2.Nf3 c5 3.Bf4 cxd4 4.Nxd4 Nd7</strong> Black is already comfortable. " +
        "Playing 2.Bf4 keeps White flexible and sidesteps that easy equalizer (Chess.com; Old School Chess).",
    },
    {
      type: "check",
      concept: "move-order-nuance",
      question: "Modern players usually choose 2.Bf4 instead of 2.Nf3 first. What's the reasoning?",
      options: [
        { text: "After 2.Nf3 c5 3.Bf4 cxd4 4.Nxd4 Nd7, Black gets easy, comfortable play.", correct: true,
          insight: "Exactly \u2014 committing the knight early lets Black hit the center with ...c5 on good terms, so Bf4 goes first." },
        { text: "Because the knight is simply a poor piece on f3.", correct: false, miss: "misjudges-piece",
          insight: "f3 is an excellent square for the knight \u2014 the problem is the ORDER, not the placement." },
        { text: "Because 2.Nf3 permanently blocks the f-pawn.", correct: false, miss: "confuses-pawn-block",
          insight: "Nothing relevant is blocked permanently; the real issue is the timing of Black's ...c5." },
        { text: "Because 2.Bf4 sets up an immediate mating attack.", correct: false, miss: "overrates-early-attack",
          insight: "There's no early threat \u2014 2.Bf4 is about flexibility and sidestepping the ...c5 line." },
      ],
    },
    {
      type: "teach",
      title: "Black's main counterpunch",
      body:
        "There's a price for that active bishop: once it leaves c1, the <strong>b2-pawn is no longer defended</strong>. " +
        "Black's most critical plan is an early <strong>...c5</strong> followed by <strong>...Qb6</strong>, putting pressure on b2 — " +
        "for example <strong>1.d4 Nf6 2.Bf4 c5 3.e3 Qb6</strong>. White has to be ready for it (Forward Chess; Wikipedia).",
    },
    {
      type: "teach",
      title: "See the ...Qb6 idea",
      body:
        "Step through the critical line <strong>1.d4 Nf6 2.Bf4 c5 3.e3 Qb6</strong>. Watch the arrow on the last move: " +
        "the black queen lands on b6, staring straight down at the undefended b2-pawn.",
      board: {
        startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
        line: [
          { from: "d2", to: "d4", san: "1. d4", note: "White takes the center." },
          { from: "g8", to: "f6", san: "1\u2026 Nf6", note: "Black develops." },
          { from: "c1", to: "f4", san: "2. Bf4", note: "Active bishop \u2014 but now b2 is unguarded." },
          { from: "c7", to: "c5", san: "2\u2026 c5", note: "Black hits d4 and opens the d8\u2013b6 diagonal." },
          { from: "e2", to: "e3", san: "3. e3", note: "White continues the setup." },
          { from: "d8", to: "b6", san: "3\u2026 Qb6", note: "The critical move: the queen attacks the loose b2-pawn." },
        ],
      },
    },

    {
      type: "check",
      concept: "qb6-counterplay",
      question: "Why is an early ...c5 and ...Qb6 considered the most testing reply to the London?",
      options: [
        { text: "The b2-pawn is no longer guarded by the c1-bishop, so ...Qb6 pressures it.", correct: true,
          insight: "Yes \u2014 the active bishop on f4 is exactly why b2 is now loose. That trade-off is the heart of the London." },
        { text: "Because ...Qb6 threatens to win the bishop on f4.", correct: false, miss: "misreads-target",
          insight: "The queen is aiming at b2, not the f4-bishop." },
        { text: "Because ...Qb6 prepares a fast kingside attack.", correct: false, miss: "wrong-flank",
          insight: "...Qb6 is queenside pressure on b2 \u2014 the opposite side of the board from a kingside plan." },
        { text: "Because ...Qb6 pins one of White's knights.", correct: false, miss: "imagines-pin",
          insight: "There's no pin involved; the whole point is the undefended b2-pawn." },
      ],
    },
    {
      type: "teach",
      title: "The attacking dream",
      body:
        "When Black castles kingside, the setup you saw in the model game can bare its teeth: a knight on <strong>e5</strong> plus a bishop on <strong>d3</strong> " +
        "aimed at <strong>h7</strong> sets up the classic <strong>Greek-gift sacrifice Bxh7+!</strong> \u2014 exactly the kind of attack Gata Kamsky has scored with from the London. " +
        "'Solid' doesn't mean 'harmless.'",
    },
    {
      type: "check",
      concept: "bishop-square-judgment",
      question: "White normally plays Bd3 (aiming at h7). When is Be2 the better square instead?",
      options: [
        { text: "When Black fianchettoes with ...g6 and ...Bg7, since that blunts the bishop's aim at h7.", correct: true,
          insight: "Spot on \u2014 ...g6 shields h7, so Bd3 loses its purpose and Be2 becomes more useful. That's positional judgment, not a rule." },
        { text: "Whenever Black castles kingside.", correct: false, miss: "overgeneralizes",
          insight: "Castling alone doesn't change it \u2014 Bd3 is great against a normal kingside. It's the ...g6 fianchetto specifically." },
        { text: "Always \u2014 Be2 is just safer than Bd3 in the London.", correct: false, miss: "absolute-thinking",
          insight: "Bd3 is the main move; Be2 is a targeted response to the fianchetto, not a blanket rule." },
        { text: "When White intends to attack on the queenside.", correct: false, miss: "misattributes-plan",
          insight: "The bishop choice is about the h7 diagonal, not a queenside plan." },
      ],
    },
    {
      type: "teach",
      title: "What you now understand",
      body:
        "You can explain the London's <strong>plan</strong> (knight to e5, kingside chances), its <strong>defining active bishop</strong>, " +
        "the <strong>move-order nuance</strong> (2.Bf4 first), Black's <strong>critical ...Qb6</strong> response, and <strong>when Bd3 becomes Be2</strong>. " +
        "That's understanding the <em>why</em> \u2014 exactly what separates meaningful practice from a recall quiz.",
    },
    {
      type: "teach",
      title: "Sources",
      body:
        "This lesson was built from several real sources so the ideas are faithful, not invented: " +
        "<strong>Wikipedia</strong> (London System), the <strong>New in Chess</strong> books <em>The Agile London System</em> and " +
        "Cyrus Lakdawala's <em>Opening Repertoire: London System</em>, plus <strong>Chess.com</strong>, <strong>Old School Chess</strong>, and <strong>Forward Chess</strong>. " +
        "Cross-checking multiple sources is how a good lesson avoids repeating one author's quirks.",
    },
  ],
};
