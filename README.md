# Phren

Upload any document — PDF, markdown, text, HTML — and get an AI-generated interactive course. Built from the London Tutor architecture but generalized for any content.

**Powered by the Lenovo ThinkStation** — all AI runs on a local model (qwen3-coder-next:q4_K_M) over Tailscale. No API keys, no cloud, no data leaving your network.

## The Name

φρήν (*phrēn*) — Ancient Greek for the seat of thoughtful reflection. Not intellect alone (*nous*), but the process of careful, embodied reasoning. Hippocrates and Aristotle used it to describe the mind at work — the midriff, where Greeks believed deep thought lived. The tool doesn't tell you what to think. It helps you think through.

## What it does

1. **Upload** your study notes, textbook chapters, training docs
2. **Learn** through AI-generated interactive lessons with knowledge checks
3. **Get coached** — AI reviews your performance, deterministic mastery scoring

## The Trust Boundary

- **AI authors lessons** from YOUR documents — never from its own knowledge
- **AI coaches your review** — qualitative feedback on strengths and gaps
- **AI never scores mastery** — that's deterministic math, auditable and transparent

## Run it

```bash
# Point at the Lenovo
cp .env.example .env
# Edit .env if needed (defaults to Lenovo over Tailscale)

# Start
python3 server.py
# Open http://localhost:8753
```

## Architecture

Forked from [London Tutor](https://github.com/mbufkin/london-tutor). Same zero-build architecture (HTML + vanilla JS + Python proxy) with the chess-specific content stripped. The chessboard components are retained (hidden) for future reuse.

## Extension points

- Swap `source-material.js` to teach from static content
- Point at any OpenAI-compatible backend via `.env`
- The grounding contract is in `authoring.js` — model only teaches from provided docs
