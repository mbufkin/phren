// source-material.js — Matt Pocock's "Teach" skill methodology
// Extracted from: https://youtu.be/s5T5oQJcJ6U

const SOURCE_MATERIAL = {
  text: `# Building an AI Teaching System — Matt Pocock's Teach Skill

Matt Pocock spent 10 years teaching (6 as a voice coach, 4 teaching developers). He condensed everything he knows about effective teaching into a stateful AI skill called "Teach." This document captures the methodology.

## Stateful vs Stateless Skills

A stateless skill doesn't retain any state from previous runs — no memory of what you've done before. A stateful skill saves things to the local file system or MCP servers, keeps notes, and tracks progress. Matt initially thought Teach should be stateless (just find resources and output a lesson), but realized all good teaching is stateful. The teacher remembers where you've gotten to, what you've learned, and what comes next.

Neither is better — they're useful in different situations. Grill Me (stateless) just drills you. Grill With Docs (stateful) saves ADRs and glossaries to the repo and gets better over time.

## The Teaching Workspace

Teach creates a structured workspace on the file system:
- **mission.md** — Why the student wants to learn. "Matt wants to solve a scrambled 3×3 Rubik's Cube unaided at least once. The goal is achievement, not speed or theory."
- **resources.md** — High-trust primary source materials, web-searched on first pass and updated continuously
- **lessons/** — Numbered HTML files. HTML is richer than markdown — more expressive, more interactive
- **learning-records/** — Simple records of what the student reports after each lesson
- **glossary.md** — All jargon and terminology, so future lessons can be more concise
- **cheat-sheets/** — Single-page reference cards (e.g., the entire solve on one card)
- **notes.md** — Internal notes for the agent: student preferences, watch-outs

## The Three Pillars: Knowledge, Skills, Wisdom

1. **Knowledge** — High-quality, high-trust resources. The agent finds primary sources and teaches from them. Citations included.
2. **Skills** — Highly relevant interactive lessons. The agent creates exercises that develop actual capability, not just understanding. HTML enables interactive elements (tap-through sequences, guided mode).
3. **Wisdom** — Community interaction. The agent's default posture: attempt to answer, but ultimately delegate to a community. The goal is to send the learner out into the world confident, not keep them hooked on the agent.

## Zone of Proximal Development (ZPD)

The single most important teaching concept Matt uses. Always teach in the area where the student is perfectly challenged but not intimidated. Every lesson must be concise, compact, and exactly framed at that zone. The student should be neither bored nor freaked out. This requires the teacher to know exactly where the student is — which is why stateful matters.

## Lesson Design Principles

- Lessons are short and focused — give exactly what to practice now
- HTML, not markdown — full browser power for interactivity
- Diagrams, simple explainers, call-outs, quizzes
- Quizzes are "okay at developing a feedback loop" but only if you can't find a richer one
- Every lesson builds on the glossary so subsequent lessons stay concise
- Wrong answers should trigger reteaching, not just scoring

## The Mission-Driven Approach

Before teaching anything, understand WHY. The mission shapes everything that follows. A student who wants "achievement" gets different lessons than one who wants "speed" or "theory."

## The Community Handoff

When the learner is ready (knowledge + skills acquired), the agent delegates to community. Not "I'll keep teaching you forever" — "you're ready to test your ideas with real practitioners." The dream is to send people out into the world, not hook them on the tool.

## Onboarding Use Case

Matt sees Teach as ideal for onboarding developers to a codebase. Documentation is usually outside the new hire's ZPD. Teach starts them in their own workspace, points them at the codebase, and they learn independently — productive in record time.`,

  keyLines: [
    { name: "Stateful vs Stateless", moves: "Stateful skills save to filesystem, retain memory between sessions, get better over time. Stateless skills don't — they're fresh each run. Neither is better, they serve different situations.", idea: "Decide early: does this skill need to remember the student?" },
    { name: "The Teaching Workspace", moves: "mission.md → resources.md → lessons/ (HTML) → learning-records/ → glossary.md → cheat-sheets/ → notes.md", idea: "Structure is the product. The file system IS the teacher's memory." },
    { name: "Knowledge → Skills → Wisdom", moves: "Knowledge from high-trust sources. Skills through interactive HTML lessons. Wisdom from community interaction — the agent's job is to eventually delegate.", idea: "The product has an exit. It doesn't trap users — it launches them." },
    { name: "Zone of Proximal Development", moves: "Always teach at the exact edge of the student's capability. Too easy = bored. Too hard = freaked out. This is why stateful matters — you can't hit ZPD without knowing where the student is.", idea: "ZPD is the teacher's compass. Every lesson is framed by it." },
    { name: "HTML Over Markdown", moves: "HTML enables interactive elements — tap-through sequences, guided mode, rich layout. Markdown is a text format. Teaching needs interaction.", idea: "The medium IS part of the pedagogy. Richer format = better learning." },
    { name: "Mission First", moves: "Before any content, establish WHY. Achievement? Speed? Theory? The mission shapes every subsequent decision. Matt's mission: solve unaided, not fast.", idea: "Start with the student's goal, not the curriculum." },
    { name: "Community Handoff", moves: "Knowledge and skills come from the tool. Wisdom comes from community. The agent's default posture: answer if possible, delegate to community when ready.", idea: "The product knows when to let go. That's the dream." },
    { name: "Onboarding as Killer Use Case", moves: "Documentation is outside the new hire's ZPD. Teach creates a personalized workspace pointed at the codebase — independent learning, faster productivity.", idea: "The best onboarding is self-directed. AI makes that scalable." },
  ]
};

if (typeof window !== "undefined") window.SOURCE_MATERIAL = SOURCE_MATERIAL;
