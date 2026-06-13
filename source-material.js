/*
  source-material.js — THE SINGLE SOURCE OF TRUTH for every generated lesson.

  This is the "source material" from the brief: a curated reference on the London
  System, distilled faithfully from the cited sources (see `sources`). Every time
  the model authors a lesson, we hand it THIS text and tell it to teach ONLY what
  is here — so lessons stay grounded in the material instead of drifting into the
  model's own (often unreliable) chess memory or invented theory.

  How it's used:
    - authoring.js injects `SOURCE_MATERIAL.text` into the lesson-authoring prompt
      and enforces a grounding contract (teach only what the source supports).
    - The `keyLines` give the model REAL move sequences to ground its interactive
      board walkthroughs in, instead of inventing illegal/inaccurate lines.

  To teach a different subject, replace this file's content with new source
  material — the engine, prompts, and grounding contract stay the same.
*/

const SOURCE_MATERIAL = {
  subject: "The London System",
  learnerLevel: "complete beginner to club player",

  // Provenance — kept with the material so attribution is auditable.
  sources: [
    { title: "London System", publisher: "Wikipedia", url: "https://en.wikipedia.org/wiki/London_System" },
    { title: "The Agile London System (sample)", publisher: "New in Chess \u2014 Romero & De Prado", url: "https://www.newinchess.com/media/wysiwyg/product_pdf/9035.pdf" },
    { title: "Opening Repertoire: London System (sample)", publisher: "New in Chess \u2014 Cyrus Lakdawala", url: "https://www.newinchess.com/media/wysiwyg/product_pdf/8992.pdf" },
    { title: "London System \u2014 Openings", publisher: "Chess.com", url: "https://www.chess.com/openings/London-System" },
    { title: "The London System Opening", publisher: "Old School Chess", url: "https://oldschoolchess.com/learn/concepts/london-system" },
  ],

  // Canonical lines the model may reuse VERBATIM to ground board walkthroughs.
  // Standard algebraic notation; the model converts these to from/to squares.
  keyLines: [
    {
      name: "Main setup with ...c5 (model game)",
      moves: "1.d4 d5 2.Bf4 Nf6 3.e3 e6 4.Nf3 c5 5.c3 Nc6 6.Nbd2 Bd6 7.Bg3 O-O 8.Bd3 b6 9.Ne5 Bb7 10.Qf3",
      idea: "White builds the d4-e3-c3 triangle, sidesteps the bishop trade with Bg3, lands a knight on e5 and swings the queen toward the kingside.",
    },
    {
      name: "The critical ...Qb6 counter",
      moves: "1.d4 Nf6 2.Bf4 c5 3.e3 Qb6",
      idea: "Because the c1-bishop has left home, the b2-pawn is unguarded; ...Qb6 immediately pressures it. This is Black's most testing reply.",
    },
    {
      name: "Greek-gift attacking pattern",
      moves: "Ne5 + Bd3 vs a castled king, then Bxh7+ Kxh7 Ng5+ and Qh5",
      idea: "The standard kingside sacrifice the London's setup can produce when Black castles and nothing guards h7.",
    },
    {
      name: "Jobava London",
      moves: "1.d4 Nf6 2.Nc3 d5 3.Bf4",
      idea: "An aggressive cousin: the knight goes to c3 (not d2) for fast attacking play, named after Baadur Jobava.",
    },
  ],

  // The reference text itself. Section headers help the model pick a focused
  // subtopic for each new lesson in the course.
  text: `THE LONDON SYSTEM — REFERENCE MATERIAL

1. WHAT IT IS
The London System is an opening "system" for White, built around 1.d4 followed by an early 2.Bf4. Instead of memorizing long forcing lines, White aims for the same solid, flexible setup against almost anything Black plays. The defining feature is developing the queen's bishop OUTSIDE the pawn chain to f4 before locking it in with e3. A "system" means the plans and piece placements matter more than a single move order.

2. THE STANDARD SETUP
White's typical shell is: pawns on d4, e3, and c3 (a small pawn "triangle" or "pyramid"), bishop on f4, bishop on d3 (sometimes e2), knights on f3 and d2 (Nbd2, not Nc3, so the c-pawn stays free for c3), short castling, and often h3 to give the f4-bishop a retreat square on h2 and stop ...Bg4/...Ng4 ideas. A natural move order is 1.d4, 2.Bf4, 3.e3, 4.Nf3, 5.Bd3 (or Be2), 6.Nbd2, 7.c3, then castle.

3. THE PAWN TRIANGLE
The d4-e3-c3 structure is the London's backbone. It gives White a sturdy center with no weaknesses and supports the key e5 square. Because it's so solid, White rarely gets quickly punished in the opening, which is why the London is recommended to beginners and to busy players who want one reliable setup.

4. THE GOOD BISHOP (f4)
Putting the bishop on f4 before e3 is essential: if White plays e3 first, the pawn blocks the c1-bishop's diagonal and the bishop becomes passive (this is the difference from the Colle System, which leaves that bishop at home). On f4 the bishop is active, eyeing the e5 and c7 squares and the b8-h2 diagonal. When Black tries to trade it with ...Bd6, White usually sidesteps with Bg3 to keep this strong bishop. If Black plays ...Nh5 to attack the bishop, White can retreat Bg3 or, after h3, Bh2.

5. THE CORE PLAN: A KNIGHT ON e5
White's main strategic goal is to plant a knight on e5, supported by the d4-pawn. From e5 the knight is powerful and hard to challenge, and it supports a kingside buildup. Common follow-ups are Qf3 or Qe2 and rook lifts, aiming at the black king. The London is positional but NOT harmless.

6. THE ATTACKING DREAM (GREEK GIFT)
When Black castles kingside and the h7-square is weak, the combination of a knight on e5 and a bishop on d3 (aimed at h7) can produce the classic Greek-gift sacrifice Bxh7+! Kxh7, Ng5+ and Qh5, generating a dangerous attack. Strong practitioners such as Gata Kamsky have won many games with London-system attacks; Magnus Carlsen has also used the London at the top level. "Solid" does not mean "drawish."

7. THE LIGHT-SQUARED BISHOP: Bd3 vs Be2
Bd3 is the main square because it aims at h7 and supports the attacking plan. However, when Black fianchettoes with ...g6 and ...Bg7, the ...g6 pawn shields h7, so Bd3 loses its bite; in that case Be2 (sometimes heading for f3 or supporting a later e4 break) is more useful. Choosing between Bd3 and Be2 is a matter of positional judgment based on Black's setup, not a fixed rule.

8. MOVE ORDER STILL MATTERS
Even in a system the order isn't free. Modern theory prefers playing 2.Bf4 immediately rather than 2.Nf3 first, because after 2.Nf3 c5 3.Bf4 cxd4 4.Nxd4 Nd7 Black gets easy, comfortable play. Playing Bf4 early keeps White flexible and avoids that simplification.

9. THE PRICE OF THE ACTIVE BISHOP: ...c5 AND ...Qb6
Once the bishop leaves c1, the b2-pawn is no longer defended. Black's most critical plan is an early ...c5 followed by ...Qb6, attacking b2 (for example 1.d4 Nf6 2.Bf4 c5 3.e3 Qb6). White must be ready for this: typical answers are defending or counter-attacking with Nc3, Qc1/Qb3, or sometimes allowing ...Qxb2 in return for fast development and an attack. The ...c5/...Qb6 trade-off is the heart of London theory.

10. BLACK'S MAIN SETUPS
- Classical ...d5 with ...e6 and ...Nf6: a solid, Queen's-Gambit-like structure; White proceeds with the standard plan and looks for e5/kingside play.
- ...c5 early (with or without ...Qb6): the most testing, hitting d4 and the loose b2.
- Kingside fianchetto ...g6 and ...Bg7 (King's-Indian / Grünfeld style): here Bd3 is less useful, so prefer Be2, and watch for ...d6/...e5 or ...d5 central breaks.
- ...Bf5 or ...Bg4: Black develops the light bishop actively before ...e6; White often answers with c4 or Qb3 ideas to question it.

11. TYPICAL PLANS AND PAWN BREAKS
White's main breaks are the e4 push (after preparing with Nbd2 and sometimes Qe2/Re1) to open the center when ahead in development, and occasionally c4 to challenge d5. On the kingside White uses Ne5, Qf3/Qh5, and pawn or piece pressure toward h7/g7. Against a fianchetto, White may expand more slowly and aim for a sound central break.

12. THE JOBAVA LONDON (AGGRESSIVE COUSIN)
A sharper version plays 1.d4 Nf6 2.Nc3 (instead of Nbd2) and 3.Bf4, named after Baadur Jobava. The knight on c3 supports a quick e4 and fast attacking play, at the cost of the harmonious "pure" London structure (the c-pawn can no longer go to c3). It is a distinct, more aggressive interpretation of the Bf4 idea.

13. HOW IT COMPARES TO RELATED OPENINGS
- Colle System: similar d4/e3/c3 pawns but the queen's bishop stays passive behind the pawn chain; the London's active Bf4 is the key difference.
- Trompowsky: also an early bishop move (1.d4 Nf6 2.Bg5), but pins the knight on g5 rather than developing to f4.
- Both are "1.d4 without a heavy theory burden," but the London commits to the active f4-bishop.

14. WHY LEARNERS CHOOSE IT
The London is praised for being easy to learn, hard to refute, and usable against nearly any Black reply, which makes it ideal for beginners and busy players. The risk is becoming too automatic: strong play still requires understanding WHEN to deviate (Bd3 vs Be2, when to allow or prevent ...Qb6, when to push e4).

15. COMMON LEARNER MISCONCEPTIONS (good material for diagnostic questions)
- Thinking the move order never matters in a "system" (it does — Bf4 before e3, and Bf4 before committing the knight).
- Believing e3 first is fine (it traps the c1-bishop — the whole point is to develop the bishop first).
- Overrating an early attack from Bf4 (its value is long-term, not an immediate threat).
- Forgetting that b2 becomes loose after Bf4, so missing the ...Qb6 idea.
- Playing Bd3 on autopilot even when Black has played ...g6 (when Be2 is better).
- Trading the good f4-bishop instead of preserving it with Bg3.
- Assuming the London is purely drawish and ignoring the real kingside attacking chances.`,
};

if (typeof window !== "undefined") window.SOURCE_MATERIAL = SOURCE_MATERIAL;
