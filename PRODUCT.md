# Phren — Product

## Product Intent

Phren is a **personal AI tutor** for individual learners. Upload any document — PDF, markdown, text, HTML — and get an AI-generated interactive course with knowledge checks, deterministic mastery scoring, and AI coaching feedback. All running on private hardware with no data leaving the network.

Phren is for the solo learner. If you're a teacher managing a classroom, that's Choros.

## Target Users

**Individual learners**
- Self-directed study from any document set
- Students who want to learn from their own notes, textbook chapters, or reference material
- Anyone who wants AI coaching grounded in specific source material, not general knowledge

## Jobs to Be Done

1. **"Turn this document into something I can learn from."** Upload study notes, textbook chapters, training docs. Get an interactive course with instruction, practice, and feedback.

2. **"Tell me what I actually don't understand."** Not just a score — which concepts are breaking down, what misconception patterns are showing up, what to drill next.

3. **"Keep my data private."** Everything runs on local hardware. No cloud, no API keys shared, no data leaving the network.

## MVP Scope

- Upload any document (PDF, markdown, text, HTML)
- AI-generated interactive course with knowledge checks
- Lesson playback: teach → move → check steps
- Deterministic mastery scoring (math, not AI)
- AI coaching review: strengths, focus areas, next steps
- Drill mode for missed concepts
- Progress tracking with learner profile
- All local, no external integrations

## Non-Goals

- Classroom/teacher mode — that's Choros
- Multi-student management — that's Choros
- Curriculum mapping — that's Choros
- LMS integration
- Real-time collaborative learning
- Mobile native app (web-only, responsive)

## Relationship to Choros

| Concern | Phren | Choros |
|---------|-------|--------|
| User | Individual learner | Teacher + cohort |
| Content source | Any document | Curriculum documents |
| Data model | Single timeline | Cross-student aggregation |
| AI role | Personal coach | Force multiplier |
| Output | Interactive course | Lessons + cohort analytics |
| Scale | 1 student | 1 teacher, N students |

## Success Criteria

- Learner uploads a document → receives interactive course within seconds
- Course includes instruction, practice, and knowledge checks with distractor rationale
- Deterministic mastery scoring is transparent and auditable (shown to learner)
- AI coaching provides specific, grounded feedback on strengths and gaps
- Drill mode reinforces missed concepts
- Zero data leaves the local network
