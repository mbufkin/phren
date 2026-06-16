# Phren — Design

## Visual Identity

### Project Logo

Symbol mark: Greek letter **φ (phi)** — golden, stylized with oval ring + vertical stem + serifs, small diamond accent below.

Source: `../project-logos/phren-symbol.html`
Production PNG: `../project-logos/phren-symbol-1280x640.png`

### Design DNA

Dark, academic, minimal. The interface should feel like a well-printed textbook page — high contrast, generous whitespace, nothing competing for attention.

### Color Tokens

```
Background:    #0f172a (slate-900) → main surface
Background alt: #1e293b (slate-800) → cards, panels
Surface:        #334155 (slate-700) → input fields, elevated surfaces
Border:         rgba(255,255,255,0.05) → subtle dividers

Brand primary:  #6366f1 (indigo-500) → buttons, links, active states
Brand hover:    #818cf8 (indigo-400) → hover
Brand muted:    #4338ca (indigo-700) → pressed, inactive

Text primary:   #e2e8f0 (slate-200) → body
Text secondary: #94a3b8 (slate-400) → labels, captions
Text muted:     #64748b (slate-500) → disabled, placeholder

Success:        #22c55e (green-500) → correct answers, passing scores
Warning:        #f59e0b (amber-500) → partial, needs review
Error:          #ef4444 (red-500) → wrong answers, gaps

Accent gold:    #c8a84e → logo, special highlights (matches symbol mark)
```

### Typography

```
Family: Inter (Google Fonts, loaded via CDN)
Weights: 400 (body), 500 (labels), 600 (headings), 700 (display), 800-900 (hero)

Body:       text-base (16px) leading-relaxed
Captions:   text-sm (14px)
Headings:   text-xl → text-3xl font-bold tracking-tight
Hero:       text-4xl → text-6xl font-extrabold tracking-tight
Mono:       font-mono for code, scores, data
```

### Spacing Scale

```
xs: 4px (0.25rem)   — icon padding
sm: 8px (0.5rem)    — inline gaps
md: 16px (1rem)     — card padding, section gaps
lg: 24px (1.5rem)   — screen padding, major sections
xl: 32px (2rem)     — page margins
2xl: 48px (3rem)    — hero sections
```

## Interaction Model

### Student Interactions: Consume → Respond → Submit

The learner follows a linear flow through each lesson:
1. **Learn** — read instruction, worked examples
2. **Practice** — answer questions with multiple-choice distractors or make moves on the board
3. **Submit** — see deterministic scores immediately, LLM feedback on wrong answers

### Navigation

```
Student:
  / → Welcome → Upload docs → Lesson library → Active lesson → Review → Profile
```

### Screens (Single-User Mode — Existing)

```
welcome → upload docs → lesson library → active lesson → review → profile
```

### Animation

- Screen transitions: fade-in (400ms, translateY 8px)
- Progress fill: cubic-bezier ease transition (400ms)
- Loading: CSS spin animation on brand spinner SVG
- No page reloads — all navigation via `LT.show()` screen router

### Responsive

- Max width: `max-w-6xl` (72rem / 1152px) centered
- Mobile: single-column, reduced padding
- Desktop: two-column grids where appropriate (lesson content + sidebar)
- Dark mode only — no light mode toggle (academic focus, eye comfort)

## Anti-Patterns (Do Not)

- ❌ Light mode or theme toggle — dark only
- ❌ Chat bubbles or conversational UI for teacher interactions
- ❌ "AI wrote this" disclaimers — trust is built through correctness, not warnings
- ❌ Skeleton loaders or excessive animation — keep it fast and direct
- ❌ Modal dialogs — use inline panels and screen transitions
- ❌ npm, bundlers, frameworks — zero-build classic scripts only
