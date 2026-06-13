/*
  Bloom Assessment Engine — content / data layer
  ----------------------------------------------
  The assessment bank: ONE concept (the CAP theorem) authored at four Bloom's
  levels. Each level carries everything the UI needs PLUS the pedagogical
  metadata the brief cares about: difficulty, the sub-skill practiced, and —
  for each distractor — the exact misconception that wrong answer captures.

  Keeping content as DATA (separate from logic in app.js) means the UI is a pure
  render of state, and the question design is easy to review or extend without
  touching application code.

  `difficulty` is 1–5, where the number reflects the COGNITIVE OPERATION
  required (Bloom's level), not how obscure the facts are.

  Loaded as a classic script BEFORE app.js, so `ASSESSMENTS` is available to it.
*/
const ASSESSMENTS = {
  // ---------------- REMEMBER / UNDERSTAND (the easy path, shown for contrast) ----------------
  remember: {
    bloom: "Remember / Understand",
    difficulty: 1,
    difficultyLabel: "Low",
    skill: "Recalling the CAP vocabulary",
    demand: "Pure retrieval: the answer appears almost verbatim in the source text. No transfer required — this is the baseline we deliberately climb above.",
    estTime: "≈ 30 sec",
    // No scenario: recall questions don't need a novel context (that's the point).
    scenario: null,
    question: "According to the CAP theorem, what does the \"P\" stand for, and what does it guarantee?",
    options: [
      { letter: "A", correct: false, text: "Performance — the system responds within a fixed latency budget under load.",
        insightTitle: "Misconception: CAP is about speed.",
        insight: "Learners new to the acronym map the letters to performance metrics. CAP says nothing about latency; it's about correctness guarantees during failures." },
      { letter: "B", correct: true, text: "Partition Tolerance — the system keeps operating despite dropped or delayed messages between nodes.",
        insightTitle: "Correct — this is the definition.",
        insight: "This is straight recall from the source. Notice how little judgment it requires: that's exactly why recall-only quizzes under-prepare learners for real decisions." },
      { letter: "C", correct: false, text: "Persistence — data is durably written to disk before acknowledging a write.",
        insightTitle: "Misconception: confusing CAP with ACID durability.",
        insight: "Durability (the 'D' in ACID) is a single-node storage property. Partition tolerance is about the network between nodes — a common cross-wiring of two different frameworks." },
      { letter: "D", correct: false, text: "Partitioning — splitting (sharding) data across nodes to scale horizontally.",
        insightTitle: "Misconception: network partition = data partitioning.",
        insight: "This is the most dangerous mix-up: a network 'partition' (a split in connectivity) is unrelated to 'partitioning' data for scale. Catching this early prevents deep confusion later." },
    ],
    feedbackCorrect: "But note: you just recited a definition. The questions below ask you to <em>use</em> it.",
    feedbackIncorrect: "Open the Instructor Insight to see which concept you've cross-wired — these are the classic CAP vocabulary mix-ups.",
    rubric: "Full credit (1 pt): Correctly identifies Partition Tolerance and its definition.\nNo credit (0 pts): Selects any distractor.\nNote: This recall item is low-value on its own; use it only as a warm-up or prerequisite check before the application item.",
    contrast: null, // this IS the recall baseline
  },

  // ---------------- APPLY / ANALYZE (the headline question) ----------------
  apply: {
    bloom: "Apply / Analyze",
    difficulty: 4,
    difficultyLabel: "High",
    skill: "Applying the Consistency-vs-Availability trade-off to a live incident",
    demand: "The learner must recognize that a partition is occurring, recall that Partition Tolerance is non-negotiable, and DECIDE the C-vs-A trade-off against a business goal. Transfer to a context never seen in the source.",
    estTime: "≈ 3 min",
    scenario: {
      tag: "Novel context",
      title: "FlashFeast and the Super Bowl Flash Sale",
      body: "<strong class='text-slate-100'>FlashFeast</strong>, a fast-growing food-delivery startup, runs a geo-distributed checkout service split across two data centers: <span class='font-mono text-brand-300'>us-east</span> and <span class='font-mono text-brand-300'>us-west</span>. During a Super Bowl ad they launch a \"$1 wings\" flash sale and traffic explodes 40×. Mid-surge, a fiber cut <strong class='text-slate-100'>severs the link between the two data centers</strong> — a textbook <em>network partition</em>. Each region still sees its own customers, but the regions can no longer sync order state. Customers everywhere are hammering \"Place Order,\" and every second of downtime is lost revenue and broken trust.",
    },
    question: "Given the CAP theorem constraints during this network partition, which architectural decision best keeps FlashFeast taking orders during the flash sale while honoring the unavoidable trade-off?",
    options: [
      { letter: "A", correct: false, text: "Enforce strict consistency (CP): block all checkouts in both regions until the partition heals and order state is fully synced.",
        insightTitle: "Misconception: \"Consistency is always the safe choice.\"",
        insight: "Learners treat consistency as a synonym for correctness and assume halting writes is cautious. But a CP choice here rejects every order during the single highest-revenue minute of the year. The trade-off is real: protecting consistency directly destroys availability and trust." },
      { letter: "B", correct: true, text: "Adopt an AP posture: let each region accept orders locally and reconcile state with conflict resolution (eventual consistency) once the link is restored.",
        insightTitle: "Why this is the strongest answer.",
        insight: "Partition Tolerance is non-negotiable across two data centers, so the real choice is Consistency vs. Availability. For a revenue-critical flash sale, staying Available and reconciling later keeps customers ordering. The learner names the unavoidable trade-off instead of pretending it can be avoided." },
      { letter: "C", correct: false, text: "Scale out: spin up more servers and replicas in each region to eliminate the partition and keep everything consistent and available.",
        insightTitle: "Misconception: \"Partitions are a capacity problem.\"",
        insight: "This conflates load with network topology. Adding hardware addresses throughput, not a severed link between data centers. You cannot 'add servers' to make a cut fiber disappear — which is exactly why Partition Tolerance is assumed and the C/A trade-off is forced." },
      { letter: "D", correct: false, text: "Sidestep CAP entirely: route everything through a single centralized database so the theorem no longer applies.",
        insightTitle: "Misconception: \"You can opt out of CAP.\"",
        insight: "CAP isn't a feature you disable; it describes any system with data on more than one machine. Centralizing reintroduces a single point of failure and still can't serve both regions when the link is down. Reveals a learner who hasn't internalized that partitions are inevitable." },
    ],
    feedbackCorrect: "Option B names the unavoidable trade-off: with partitions assumed, the choice is Consistency vs. Availability — and a flash sale prioritizes Availability.",
    feedbackIncorrect: "Open the Instructor Insight on your choice to see the exact misconception it targets, then compare with option B.",
    rubric: "Full credit (4 pts): Selects the AP / eventual-consistency approach AND explicitly states that Partition Tolerance is non-negotiable, so the real choice is Consistency vs. Availability.\nPartial credit (2 pts): Selects the correct option but justifies it only by \"uptime\" without naming the C-vs-A trade-off.\nMinimal credit (1 pt): Identifies that a trade-off exists but chooses an option that sacrifices availability during a revenue-critical sale.\nNo credit (0 pts): Claims the partition can be \"engineered away\" (more servers / centralization) — a CAP misconception.",
    contrast: "A recall-only version would ask: <em>\"Which two guarantees does an AP system provide?\"</em> — answerable by memorizing the acronym. This version hides the words \"CAP,\" \"AP,\" and \"partition tolerance\" inside a story, forcing the learner to <strong>recognize</strong> the situation and <strong>apply</strong> the trade-off under a real constraint. That's the jump from memory to judgment.",
  },

  // ---------------- EVALUATE (critique & justify) ----------------
  evaluate: {
    bloom: "Evaluate",
    difficulty: 5,
    difficultyLabel: "Very High",
    skill: "Critiquing a proposed solution against constraints and a business goal",
    demand: "The learner must judge someone else's recommendation — holding the proposal, the CAP constraints, and the business objective in mind at once, then identify the flaw. Evaluation sits above application: you're grading a solution, not producing one.",
    estTime: "≈ 4 min",
    scenario: {
      tag: "Critique task",
      title: "The Post-Incident Review",
      body: "After the outage, a senior engineer writes in the retro: <em class='text-slate-100'>\"This never should have happened. If we'd just used a single globally strongly-consistent database, the system would always agree and we'd avoid these partition headaches entirely.\"</em> The team looks to you to evaluate the recommendation before it becomes a roadmap item.",
    },
    question: "Which critique of the \"just use a globally strongly-consistent database\" proposal is the most valid?",
    options: [
      { letter: "A", correct: false, text: "It's sound — strong global consistency means there are no partitions to worry about.",
        insightTitle: "Misconception: strong consistency removes partitions.",
        insight: "Consistency is a guarantee about reads/writes, not a force field around the network. A strongly-consistent store still experiences partitions — it just responds to them by refusing service. Endorsing the proposal shows the opt-out-of-CAP misconception persists even at the evaluation level." },
      { letter: "B", correct: true, text: "It's flawed: under a partition a strongly-consistent store must reject writes (CP), so during the sale it would have <em>worsened</em> the exact availability problem they're trying to prevent.",
        insightTitle: "Why this critique is strongest.",
        insight: "A correct evaluation ties the proposal back to the business goal. Strong consistency is a CP choice; during a partition it sheds availability — catastrophic for a flash sale. The learner judges the solution against the constraint AND the objective, which is the essence of Bloom's 'Evaluate.'" },
      { letter: "C", correct: false, text: "It's flawed only because globally consistent databases are too expensive and slow for a startup's budget.",
        insightTitle: "Misconception: critiquing on the wrong axis.",
        insight: "Cost and latency are real concerns, but they dodge the architectural point. A learner who critiques here understands trade-offs exist but can't locate the decisive one — partial mastery worth coaching toward the CAP-level critique." },
      { letter: "D", correct: false, text: "It's fine for reads but would only cause problems for occasional background writes.",
        insightTitle: "Misconception: underestimating the write path.",
        insight: "A checkout during a flash sale is overwhelmingly write-heavy (orders, payments). Treating writes as 'occasional' reveals a learner who hasn't connected the workload to the consistency cost. The critique is directionally right but mis-scopes the impact." },
    ],
    feedbackCorrect: "A strong evaluation judges the proposal against BOTH the CAP constraint (it's CP) and the business goal (a sale needs availability) — option B does exactly that.",
    feedbackIncorrect: "Open the Instructor Insight: each wrong critique fails on a different axis. Compare yours with option B, which ties the flaw to the business objective.",
    rubric: "Full credit (4 pts): Identifies that the proposal is a CP choice that sheds availability during a partition, AND connects that to the flash-sale objective.\nPartial credit (2 pts): Recognizes the proposal harms availability but doesn't link it to the business goal.\nMinimal credit (1 pt): Critiques on a secondary axis (cost/latency) without the CAP argument.\nNo credit (0 pts): Endorses the proposal — the opt-out-of-CAP misconception.",
    contrast: "A recall version would ask: <em>\"True or false: a CP system sacrifices availability during a partition?\"</em> This version makes the learner <strong>judge a colleague's real recommendation</strong> and articulate <em>why</em> it fails against a goal — the difference between knowing a fact and being able to defend a design decision in a review.",
  },

  // ---------------- CREATE (design & synthesize) ----------------
  create: {
    bloom: "Create",
    difficulty: 5,
    difficultyLabel: "Very High",
    skill: "Synthesizing a per-operation failover policy that balances correctness and availability",
    demand: "The learner must DESIGN — composing a policy that applies different CAP trade-offs to different operations (browsing vs. payment). This is synthesis: there's no single line in the source to retrieve; the learner builds a solution from the principles.",
    estTime: "≈ 6 min",
    scenario: {
      tag: "Design task",
      title: "Designing FlashFeast's Partition Playbook",
      body: "Leadership wants a written <strong class='text-slate-100'>failover policy</strong> for the next partition. The catch: not all operations are equal. Browsing the menu and adding to cart can tolerate stale data; <em>capturing a payment</em> must never double-charge a customer. Design the policy that best balances the trade-off across these operations.",
    },
    question: "Which failover design best synthesizes the CAP trade-off across FlashFeast's different operations during a partition?",
    options: [
      { letter: "A", correct: true, text: "Per-operation policy: serve browse/cart with AP (stay available, reconcile later), but route final payment capture through CP with idempotency keys so a charge either commits once or fails cleanly.",
        insightTitle: "Why this design is strongest.",
        insight: "Mastery looks like applying CAP at the granularity of the operation, not the whole system. Availability where staleness is harmless; consistency where money is at stake; idempotency to make the CP path safe to retry. This is genuine synthesis — composing principles into a tailored policy." },
      { letter: "B", correct: false, text: "AP everywhere: accept all operations locally in both regions and reconcile everything — including payments — after the partition heals.",
        insightTitle: "Misconception: availability is free.",
        insight: "Over-applying one principle. Reconciling payments after the fact invites double-charges and refunds — a correctness failure with real money. The learner has internalized 'stay available' but not where consistency is non-negotiable." },
      { letter: "C", correct: false, text: "CP everywhere: block every operation — browsing included — until the regions can talk again.",
        insightTitle: "Misconception: consistency is always worth the cost.",
        insight: "The mirror-image over-application. Blocking harmless reads (menu browsing) throws away availability for no correctness benefit. Reveals a learner who can't yet differentiate which operations actually need strong consistency." },
      { letter: "D", correct: false, text: "Pick whichever region has more capacity at the moment and send all traffic there until the partition resolves.",
        insightTitle: "Misconception: load balancing solves CAP.",
        insight: "This answers a capacity question, not a consistency one — and a single overloaded region during a 40× surge is its own outage. Reveals a learner reaching for a familiar tool (load balancing) instead of reasoning about the trade-off." },
    ],
    feedbackCorrect: "The strongest design applies CAP per-operation: AP for harmless reads, CP + idempotency for payments. That's synthesis, not a single global switch.",
    feedbackIncorrect: "Open the Instructor Insight: B and C over-apply one principle; D solves the wrong problem. Option A composes the trade-off per operation.",
    rubric: "Full credit (4 pts): Proposes a per-operation policy — AP for browse/cart, CP for payment — and mentions a safety mechanism (e.g. idempotency) for the consistent path.\nPartial credit (2–3 pts): Differentiates operations but applies the trade-off imperfectly, or omits the payment-safety mechanism.\nMinimal credit (1 pt): Recognizes operations differ but can't assign the right trade-off.\nNo credit (0 pts): Applies one global policy (AP-everywhere / CP-everywhere) or solves a capacity problem instead.\nNote: ideally paired with a free-text design submission — see Design Rationale.",
    contrast: "There's no recall version of this — you cannot memorize a design. A recall quiz tops out at \"list the three CAP guarantees.\" This task asks the learner to <strong>build a policy that doesn't exist in the source</strong>, applying different trade-offs to different operations. That gap is the whole point of climbing Bloom's Taxonomy.",
  },
};
