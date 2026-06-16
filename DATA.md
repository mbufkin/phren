# Phren — Data

## Data Philosophy

All data lives on the filesystem as human-readable JSON and Markdown. No database. No ORM. This is intentional:
- Inspectable: `cat .phren-data/students/01/records/lesson-01.json`
- Portable: `rsync .phren-data/` between machines
- Auditable: every state change is a file write, git-trackable if desired

**Privacy:** All data stays on the local machine. No cloud, no telemetry to external services, no analytics. The only outbound network call is the LLM proxy to the configured backend (Lenovo over Tailscale or local Ollama). Student data never leaves the network.

---

## Lesson Object Schema

This is the universal lesson format — used for hand-authored, AI-authored, and generated lessons. Generalized from the chess original to support any domain.

```json
{
  "id": "linear-equations-day-01",
  "domain": "algebra",
  "week": 1,
  "day": 1,
  "title": "Solving One-Step Linear Equations",
  "subtitle": "Using inverse operations to isolate variables",
  "prerequisites": ["addition-subtraction", "multiplication-division"],
  "steps": [
    {
      "type": "precheck",
      "concept": "inverse-operations",
      "questions": [
        {
          "id": "pc-01",
          "text": "What is the inverse operation of addition?",
          "options": [
            {"text": "subtraction", "correct": true, "insight": "Correct — subtraction undoes addition."},
            {"text": "multiplication", "correct": false, "reason": "multiplication-inverse-confusion", "insight": "Multiplication's inverse is division, not addition."},
            {"text": "division", "correct": false, "reason": "multiplication-inverse-confusion", "insight": "Division's inverse is multiplication."},
            {"text": "exponentiation", "correct": false, "reason": "random-guess", "insight": "Exponentiation is a different operation entirely."}
          ]
        }
      ]
    },
    {
      "type": "teach",
      "title": "Solving x + 5 = 12",
      "body": "To isolate x, we apply the inverse operation. Since 5 is added to x, we subtract 5 from both sides..."
    },
    {
      "type": "practice",
      "concept": "one-step-addition",
      "questions": [
        {
          "id": "q-01",
          "text": "Solve: x + 7 = 15",
          "answer": 8,
          "options": [
            {"text": "8", "correct": true, "insight": "Correct. x + 7 = 15 → x = 15 - 7 = 8."},
            {"text": "22", "correct": false, "reason": "added-instead-of-subtracted", "insight": "You added 15 + 7. To isolate x, subtract 7 from 15."},
            {"text": "9", "correct": false, "reason": "arithmetic-error", "insight": "Close — 15 - 7 is 8, not 9. Check your subtraction."},
            {"text": "-8", "correct": false, "reason": "sign-error", "insight": "15 - 7 = 8, not -8. Signs matter."}
          ]
        }
      ]
    }
  ]
}
```

### Step Types

| Type | Purpose | Has Answer Key? | Has Distractors? |
|------|---------|----------------|------------------|
| `precheck` | Assess prerequisite knowledge (first 10 min of class) | Yes | Yes — with `reason` tags |
| `teach` | Instructional content, worked examples | No | No |
| `practice` | Assess current lesson content | Yes | Yes — with `reason` tags |

### Distractor Reason Tags

Each wrong option MUST have a `reason` tag. These tags feed the misconception analysis pipeline:

- `added-instead-of-subtracted` — operation inversion error
- `arithmetic-error` — simple calculation mistake
- `sign-error` — wrong sign (positive/negative)
- `order-of-operations` — PEMDAS error
- `random-guess` — no pattern detected (likely guessing)
- `concept-confusion` — applying wrong concept entirely
- `{custom-tag}` — domain-specific misconception

These tags become the basis for the aggregate gap report and remediation generation.

---

## Telemetry Data

Recorded per lesson run, per student. Used to derive misconceptions and feed the review model.

```json
{
  "studentId": "01",
  "lessonId": "linear-equations-day-01",
  "timestamp": "2026-06-15T14:30:00Z",
  "durationSec": 420,
  "steps": [
    {
      "stepIndex": 0,
      "type": "precheck",
      "questions": [
        {
          "questionId": "pc-01",
          "chosen": "multiplication",
          "correct": false,
          "reasonTag": "multiplication-inverse-confusion",
          "timeSec": 22
        }
      ]
    },
    {
      "stepIndex": 2,
      "type": "practice",
      "questions": [
        {
          "questionId": "q-01",
          "chosen": "22",
          "correct": false,
          "reasonTag": "added-instead-of-subtracted",
          "timeSec": 18
        }
      ]
    }
  ],
  "summary": {
    "totalQuestions": 4,
    "correct": 2,
    "incorrect": 2,
    "misconceptionTags": ["multiplication-inverse-confusion", "added-instead-of-subtracted"]
  }
}
```

### Aggregation Output (for gap report)

```json
{
  "lessonId": "linear-equations-day-01",
  "studentCount": 5,
  "gaps": [
    {
      "tag": "added-instead-of-subtracted",
      "label": "Added instead of subtracted",
      "count": 3,
      "students": ["01", "03", "05"],
      "dominantQuestion": "q-01"
    },
    {
      "tag": "sign-error",
      "label": "Sign error (positive vs negative)",
      "count": 2,
      "students": ["02", "04"],
      "dominantQuestion": "q-03"
    }
  ]
}
```

---

## Workspace Structure (School Mode)

```
.phren-data/
├── teacher/
│   ├── buckets/
│   │   ├── curriculum/       ← uploaded curriculum provider files
│   │   ├── district/         ← uploaded district policies, calendars
│   │   └── teacher/          ← uploaded teacher exemplars (style)
│   ├── crystallization/
│   │   └── report.json       ← curriculum map + gap report
│   ├── lessons/
│   │   ├── week-01/
│   │   │   ├── day-01.json
│   │   │   ├── day-02.json
│   │   │   └── ...
│   │   └── week-02/
│   └── state.json            ← approval states, pacing tracker
├── students/
│   ├── 01/
│   │   ├── records/          ← per-lesson telemetry JSON
│   │   ├── feedback/         ← misconception analysis per quiz
│   │   └── state.json        ← current lesson index, completion status
│   ├── 02/
│   └── ... (through 05)
└── shared/
    └── model-cache/          ← reusable LLM outputs
```

### Crystallization Report Schema

```json
{
  "generated": "2026-06-15T08:00:00Z",
  "sources": {
    "curriculum": ["algebra-textbook-ch3.pdf", "practice-sets.docx"],
    "district": ["scope-and-sequence-2026.pdf", "school-calendar.pdf"],
    "teacher": ["ms-rodriguez-past-worksheets.pdf", "exit-tickets.docx"]
  },
  "syllabus": [
    {
      "unit": 1,
      "title": "Linear Equations",
      "weeks": [1, 2, 3],
      "topics": ["one-step equations", "two-step equations", "variables on both sides"],
      "sourceRefs": ["algebra-textbook-ch3.pdf:pages 42-78"]
    }
  ],
  "gaps": [
    {
      "topic": "inequalities",
      "severity": "high",
      "detail": "District scope includes inequalities in Unit 2 but no source material covers it",
      "recommendation": "Upload additional resources on solving and graphing inequalities"
    }
  ],
  "coverage": {
    "totalTopics": 12,
    "covered": 10,
    "gaps": 2
  },
  "pacing": {
    "totalWeeks": 36,
    "mappedWeeks": 28,
    "flexWeeks": 8
  }
}
```

---

## Single-User Workspace (Existing)

```
.phren-workspace/
├── mission.md              ← why the student is learning
├── learning-records/       ← JSON per completed lesson
├── glossary.md             ← accumulated terminology
├── notes.md                ← agent's internal notes
└── cheat-sheets/           ← generated reference cards
```

Unchanged. School mode uses `.phren-data/` alongside it.

---

## Data Privacy Rules

1. **Student data never leaves the local machine.** The LLM proxy is the only outbound call.
2. **No PII in LLM prompts.** Student IDs are opaque (`01`–`05`), never real names. Misconception analysis uses tags, not identity.
3. **Teacher materials may contain PII.** Teacher uploads stay in `.phren-data/teacher/buckets/` — never sent to external services.
4. **No analytics, no tracking, no telemetry to external services.** The `telemetry.js` module writes to local files only.
5. **No cookies, no sessions, no persistent auth.** URL-based access for POC. Authentication is out of scope.
