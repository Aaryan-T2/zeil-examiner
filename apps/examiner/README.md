# ZEIL Examiner

A focused assessment prototype: choose a reviewed role-based work sample or create a custom task and rubric, invite a candidate through a focused demo exam, then review rubric evidence. AI supports human judgement and never makes the hiring decision.

## Run locally

Requirements: Node.js 20+ and npm.

```powershell
npm install
npm run api
```

In a second terminal:

```powershell
npm run dev
```

Open the local Vite URL printed by the dev server. The app uses synthetic sample challenges and runs without API credentials. For Gemini scoring, copy `.env.example` to `.env` and add `GEMINI_API_KEY=...`. The API reads it server-side; it is never bundled into browser code. Without a key, the deterministic fallback is used. Restart `npm run api` after changing `.env`.

### Demo test logins

| Role | Email | Password |
|---|---|---|
| Recruiter | `recruiter@examiner.demo` | `RecruiterDemo2026!` |
| Candidate | `candidate@examiner.demo` | `CandidateDemo2026!` |

Create an invite in the recruiter view. It opens `/candidate?session=...`; the candidate signs in separately with the candidate test login. The invite/session is currently stored in the recruiter browser for this local demo, and the server keeps submissions in memory until it restarts. These public demo identities are not production authentication and must not be used with real candidate data.

## Checks

```powershell
npm test
npm run build
npm run eval
npm run check:gemini
```

## Project layout

- `src/features/challenge-setup/` — recruiter challenge library and authoring. The current screen remains in `src/App.tsx` until the next UI refactor.
- `src/features/candidate-exam/` — candidate task-taking page and submission UI.
- `src/features/review-report/` — evidence-led recruiter report UI.
- `src/shared/contracts.ts` — challenge, submission, assessment, and integrity event contracts.
- `src/shared/assessment.ts` — local persistence and transparent deterministic demo assessment fallback.
- `src/shared/gemini-assessment.ts` — structured Gemini scoring adapter and output validation.
- `src/shared/evaluation.ts` — 11 deterministic synthetic evaluation examples.
- `server/index.ts` — small API boundary that keeps the Gemini key server-side.
- `tasks/plan.md` and `tasks/todo.md` at workspace root — implementation status.

All candidate examples must be synthetic. Keep camera/focus signals out of performance scores and label them as uncertain review context. The demo accepts written explanations, pseudocode, and code text; it does not execute arbitrary candidate code. Gemini scoring validates rubric IDs, point bounds, and evidence quotes; a deterministic heuristic fallback supports offline demos. Neither score is an employment decision.

## Demo flow

1. Start `npm run api` and `npm run dev`; sign in to the recruiter view and select or create a challenge.
2. Create a candidate invite and share the displayed URL with the candidate test login.
3. The candidate signs in separately, completes the task, optionally shares setup checkpoints, and submits.
4. Return to or refresh the recruiter view to review the server-held submission, criterion-level score, evidence, uncertainty, and separate integrity events.
