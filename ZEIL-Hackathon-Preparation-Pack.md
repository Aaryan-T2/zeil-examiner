# ZEIL AI Hackathon — Preparation Pack

**Prepared:** 8 October 2026  
**Purpose:** Research-based setup and preparation notes for a one-day ZEIL AI/data hackathon.  

> **Important verification note:** I could verify ZEIL’s current public product and candidate-profile materials, but I did **not** find an official public announcement confirming this hackathon, its secret challenge, 8-hour format, eligibility rules, or November 2026–February 2027 internships. Treat those details as supplied by the requester, not independently verified. Check the event organiser’s invitation/official channels for dates, application instructions, venue, and terms.

## 1. What to prepare for

Based on the brief supplied, this is a build-and-pitch event under a tight time limit. Prepare to demonstrate:

- A working, testable prototype rather than a large unfinished system.
- Clear problem framing, assumptions, and a sensible scope.
- Practical engineering: reliable data flow, usable UI, error handling, and a demo that works locally.
- Thoughtful AI use: measurable value over a simple baseline, transparent outputs, and appropriate human review.
- Collaboration, trade-offs, and an honest account of what is and is not implemented.

ZEIL’s public materials describe its recruitment products as matching candidates and jobs, AI-powered candidate profile and CV tools, and TalentSeeker sourcing that ranks and summarises profiles against a hiring brief. ZEIL also publicly emphasises that AI should support, not replace, human hiring judgement. These are useful product-context clues, **not a prediction of the secret challenge**.

## 2. Before the event: setup checklist

### Device and accounts

- [ ] Laptop, charger, and any required adapter; test battery and Wi-Fi beforehand.
- [ ] Install and test your preferred editor, language runtime, Git, and package manager.
- [ ] Verify access to any model/API account you intend to use. Keep API keys in environment variables or a local ignored `.env`; never commit them or paste them into slides/code screenshots.
- [ ] Confirm API rate limits, billing controls, and an offline/mock fallback. Do not assume venue internet or paid credits will be available.
- [ ] Ensure Git identity is configured and you can create a repository and make commits.
- [ ] Have a local sample dataset or synthetic-data generator ready; do not rely on real candidate personal data.
- [ ] Test a clean start command and document it in the project README.

### Reusable starter repo

Prepare a small, generic scaffold in advance (only if event rules permit prebuilt code):

```text
README.md
.gitignore
.env.example          # names only; never actual secrets
src/
tests/
data/sample/          # synthetic/public-safe data only
```

Keep it intentionally minimal. Follow event rules about pre-event code, libraries, and AI assistance. Build a fresh solution to the actual brief rather than trying to force a prebuilt project onto it.

### Pitch and demo tools

- [ ] Pick one screen-recording or screenshot method as a backup.
- [ ] Prepare a blank 5-slide outline (problem, user, solution/demo, evidence, next steps).
- [ ] Rehearse a 60-second and a 3-minute explanation.
- [ ] Have a backup demo path: seed data, fixed example input, and a short screen recording if permitted.

## 3. Suggested technical stack

Choose tools you already know. In an 8-hour sprint, familiarity and a clean end-to-end path usually beat novelty.

### Fast full-stack options

**Option A — TypeScript:** Next.js or Vite + React, a small API route/Express service, SQLite or a JSON fixture, and a hosted LLM API if credentials/network are available.

**Option B — Python:** FastAPI + a simple React/Vite UI, or Streamlit for a data-heavy proof of concept; SQLite/CSV for persistence; scikit-learn for a baseline and a model API only where needed.

### AI/data building blocks

- **Embeddings / semantic retrieval:** use a small, explainable retrieval pipeline for matching text; compare with keyword search.
- **Structured generation:** request JSON-shaped output, validate it, and handle malformed responses; never assume generated content is correct.
- **Evaluation:** make a tiny labelled test set and compare against a straightforward baseline (keyword overlap, filters, or a rules-based score).
- **Local fallback:** deterministic fixtures or a small local model if supported by your machine; keep the core demo usable when the network/API fails.
- **Data handling:** synthetic examples; minimise fields; avoid sensitive attributes and inferred protected characteristics.

Avoid spending hackathon time on complex orchestration frameworks unless the challenge specifically needs them. A direct API call plus validation, logging, and a fallback is often easier to debug.

## 4. A practical 8-hour sprint plan

| Elapsed | Focus | Deliverable |
|---|---|---|
| 0:00–0:30 | Clarify prompt, users, success metric, constraints, and judging criteria | One-sentence problem and explicit assumptions |
| 0:30–1:00 | Sketch UX and architecture; choose a thin vertical slice | Screen sketch, task split, repo and run command |
| 1:00–3:30 | Build the end-to-end happy path with synthetic data | A working input → processing → useful output flow |
| 3:30–4:30 | Add the AI/data element and baseline comparison | Visible improvement, confidence/context, or failure handling |
| 4:30–5:30 | Test edge cases; improve UI and reliability | Seeded demo, validation, loading/error/empty states |
| 5:30–6:30 | Gather evidence and tighten product story | A metric, test results, user rationale, limitations |
| 6:30–7:30 | Freeze features; rehearse and prepare backup | Stable build and concise pitch |
| 7:30–8:00 | Final smoke test, handoff, pitch | Clean demo, clear team roles, no risky last-minute changes |

Set a feature freeze at least 30–45 minutes before presenting. Prefer one complete workflow over several disconnected features.

## 5. If the challenge involves recruitment or candidate matching

This section is contingency preparation, not a claim about the challenge.

- Represent the role brief and candidate evidence explicitly; show which evidence supports each match.
- Treat a score/ranking as decision support, not an automated rejection or hiring decision.
- Do not score on protected/sensitive traits, proxies for them, or unsupported assumptions. Keep criteria job-related and inspectable.
- Show uncertainty and missing information rather than fabricating a confident match.
- Provide a human review/override step and a brief explanation that can be checked against source evidence.
- Use synthetic profiles for demos. Never upload real CVs or personal information to a third-party model without explicit permission and an appropriate data-handling basis.
- Evaluate more than aggregate accuracy: inspect false negatives, consistency, subgroup risks where valid data and expertise exist, and whether a recruiter can understand the result.
- Distinguish candidate sourcing/ranking from screening and final hiring decisions.

ZEIL’s public responsible-AI article says ranking and summarisation can assist recruiters, while final reject/advance calls, subjective judgement, and candidate-facing reasons should remain human-accountable. Source: [Using AI in Hiring Responsibly](https://www.zeil.ai/blog/employer-blogs/responsible-ai-in-hiring).

## 6. Shortlist profile/application preparation

The event eligibility and application process were not independently confirmed. If applying, make the evidence easy to scan:

1. State degree/field, expected graduation or graduation date, and New Zealand work-rights availability accurately.
2. Lead with two or three shipped projects. For each: problem, your contribution, stack, measurable result, and a link to code/demo.
3. Include practical evidence: tests, deployment, users, latency/cost, dataset size, or evaluation results where relevant.
4. Make your individual role in team projects explicit.
5. Include GitHub/portfolio/LinkedIn only if current and presentable; pin the strongest repositories and add concise READMEs.
6. Use a clear one-page CV/profile if requested. Avoid unsupported claims and generic “AI enthusiast” language.

ZEIL’s public candidate guide recommends adding education (including current study), work experience, certifications, skills, awards, languages, extracurriculars, and references to its candidate profile. That guide describes its general job-seeker profile, not this hackathon’s application requirements: [How to Build Your ZEIL Candidate Profile](https://www.zeil.com/resource/candidate/how-to-build-your-zeil-candidate-profile).

## 7. Pitch structure

1. **Problem:** who has the problem and what is painful today?
2. **Insight:** what did you learn from the prompt/data/user perspective?
3. **Solution:** what does the prototype do, in one sentence?
4. **Demo:** show the main workflow with a realistic example.
5. **Evidence:** what works, how you tested it, and what improved over a baseline?
6. **Responsible use:** what can go wrong, what data is used, and where a human stays in control?
7. **Next step:** what would you build or validate with another day/week?

Be precise about prototype status. Say “we tested on 20 synthetic examples” rather than implying production readiness.

## 8. Quick reference: useful links

- ZEIL job-seeker site and AI tools: https://www.zeil.ai/
- ZEIL employer/product overview: https://www.zeil.ai/employer
- TalentSeeker product overview: https://www.zeil.ai/products/talentseeker
- Responsible AI in hiring: https://www.zeil.ai/blog/employer-blogs/responsible-ai-in-hiring
- AI candidate sourcing overview: https://www.zeil.ai/blog/employer-blogs/ai-candidate-sourcing
- AI recruiting agents overview: https://www.zeil.ai/blog/employer-blogs/ai-recruiting-agents
- Candidate profile setup guide: https://www.zeil.com/resource/candidate/how-to-build-your-zeil-candidate-profile
- ZEIL support/resources: https://www.zeil.ai/resources
- Contact published on ZEIL site: support@zeil.com

## 9. Event-day pocket checklist

- [ ] Restate the prompt and acceptance criteria before coding.
- [ ] Commit a working baseline early; keep the app runnable.
- [ ] Use synthetic data and protect keys/personal information.
- [ ] Measure something; compare with a simple baseline.
- [ ] Add loading, empty, and error states.
- [ ] Check an edge case and explain limitations.
- [ ] Freeze scope early; rehearse the demo on the actual machine.
- [ ] End with a clear human decision point for consequential outputs.
