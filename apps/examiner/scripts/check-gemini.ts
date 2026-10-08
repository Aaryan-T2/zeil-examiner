import { config } from 'dotenv';

config({ path: '.env' });
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  process.stderr.write('GEMINI_API_KEY is not set in apps/examiner/.env.\n');
  process.exit(1);
}

try {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Say hello to the ZEIL Hackathon' }] }] }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    process.stderr.write(`Gemini check failed (HTTP ${response.status})${payload?.error?.message ? `: ${payload.error.message}` : '.'}\n`);
    process.exit(1);
  }
  process.stdout.write('Gemini API check succeeded (HTTP 200). Key value hidden.\n');
} catch (error) {
  process.stderr.write(`Gemini request could not connect: ${error instanceof Error ? error.message : 'unknown network error'}\n`);
  process.exit(1);
}
