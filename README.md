# ZEIL Hackathon Workspace

This is a clean workspace for preparing for the ZEIL AI Hackathon and starting a project once the official challenge is known.

## Current contents

- `AGENTS.md` — persistent instructions for coding assistants working in this folder.
- `ZEIL-Hackathon-Preparation-Pack.md` — research, setup checklist, sprint plan, pitch guidance, and sources.
- `.gitignore` — excludes common secrets and generated files.
- `scripts/jev-systemone.ps1` — optional PowerShell helper for the 9Router System One endpoint.

## Getting started

No language/framework has been selected yet. Once you have the official challenge, we can choose the smallest stack that fits it and add a runnable project with setup and test instructions. Until then, this folder intentionally avoids speculative scaffolding.

## Optional: call Jev through 9Router System One

The local PowerShell helper in `scripts/jev-systemone.ps1` sends a state and one `noul` question to `${NINEROUTER_URL}/v1/systemone` using model `oc/jev-1.13-free` by default. It prints the endpoint response as JSON.

1. Create a **fresh** API key in the 9Router dashboard. The key pasted in chat must be considered compromised; revoke it and do not reuse it.
2. Copy `.env.local.example` to `.env.local` and fill in the new key. `.env.local` is ignored by Git.
3. Load settings into the current PowerShell session without putting the secret in command history:

   ```powershell
   $settings = Get-Content .env.local | Where-Object { $_ -match '^\s*[^#\s]+=.*$' }
   foreach ($setting in $settings) {
     $name, $value = $setting -split '=', 2
     [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), 'Process')
   }
   ```

4. Call it with a **synthetic/non-sensitive** example:

   ```powershell
   .\scripts\jev-systemone.ps1 -State 'A demo customer reports a payment issue.' -Question 'Does this need urgent attention?'
   ```

This helper has not been run against your local service. It assumes the endpoint and request shape from the example you supplied; the configured endpoint must be reachable from this machine. Do not send real candidate or customer personal information unless you have the right authorization and data-handling basis.

## Safety

- Keep API keys in local environment variables or an ignored `.env` file; never commit credentials.
- Use synthetic/public-safe data for prototypes. Do not upload real candidate information to AI services without explicit authorization and an appropriate data-handling basis.
- Follow the event rules for prebuilt code, AI assistance, libraries, and data.

## Event details

The preparation pack records that the hackathon format, eligibility, dates, and internship terms have not been independently verified from an official public event announcement. Confirm these details with the organiser.
