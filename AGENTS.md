# Workspace instructions

This folder is a general-purpose workspace for preparing for and building at the ZEIL AI Hackathon. There may not be a software project here until the user starts one.

## Working with the user

- Act as a practical coding partner: clarify the goal when needed, inspect the existing project before changing it, make the smallest useful change, and verify it.
- Prefer working, understandable solutions over speculative infrastructure or unnecessary frameworks.
- Explain assumptions and important trade-offs briefly. Never claim a build, test, deployment, or external action succeeded unless verified.
- Do not overwrite user work without inspecting it first. Keep changes scoped to the request.
- For multi-step work, use a short task checklist and update it as work progresses.

## Safety and secrets

- Never put passwords, API keys, access tokens, private candidate information, or other secrets in tracked files, prompts, logs, screenshots, or commits.
- Use environment variables for credentials. `.env` files must stay ignored; commit only redacted variable names in `.env.example`.
- Use synthetic or public-safe sample data for demos and tests. Do not send real CVs or personal data to an external model without explicit authorization and an appropriate basis.
- Treat model-generated output as untrusted input: validate structure, handle failures, and do not let AI make consequential hiring decisions autonomously.

## Hackathon build defaults

- Follow the event's rules on prebuilt code, AI tools, data, and libraries; ask the user to confirm rules if a proposed approach depends on them.
- Start by reading the actual prompt and defining the user, success criterion, constraints, and smallest end-to-end demo.
- Build a thin vertical slice first, keep the app runnable, and prefer familiar tools over introducing a new stack under time pressure.
- Add a deterministic/mock fallback if a network or model API is optional; compare AI output against a simple baseline when useful.
- Test a happy path and at least one important edge/error case. Freeze features before pitch time.
- If a project is created, include concise setup/run/test instructions and a `.env.example` only if configuration is needed.

## Workspace reference

- `ZEIL-Hackathon-Preparation-Pack.md` contains research, preparation notes, and the current caveat that the event details have not been independently verified.
- Do not assume the secret challenge or create a speculative product before the official prompt is provided.
