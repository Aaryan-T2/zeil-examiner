import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';

let apiProcess: ReturnType<typeof spawn>;
let baseUrl = '';

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port available.');
  server.close();
  await once(server, 'close');
  return address.port;
}

beforeAll(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const tsxCli = ['node_modules/tsx/dist/cli.mjs', '../../node_modules/tsx/dist/cli.mjs'].find((candidate) => existsSync(resolve(candidate)));
  if (!tsxCli) throw new Error('tsx CLI not found.');
  apiProcess = spawn(process.execPath, [tsxCli, 'server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '' },
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch { /* wait for local test API to boot */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('API test process did not become ready.');
}, 10_000);

afterAll(() => apiProcess?.kill());

describe('assessment API', () => {
  it('reports health without revealing any configured secret', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, geminiConfigured: false });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects a phone setup image without explicit consent and a valid session', async () => {
    const response = await fetch(`${baseUrl}/api/setup-check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageData: 'data:image/jpeg;base64,ZmFrZQ==', consented: false, sessionId: 'missing' }) });
    expect(response.status).toBe(400);
  });

  it('creates an assessment session and returns its library challenge', async () => {
    const response = await fetch(`${baseUrl}/api/assessment-sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: 'engineer-api-debug' }) });
    expect(response.status).toBe(201);
    const result = await response.json() as { sessionId: string; candidateToken: string; challenge: { id: string } };
    expect(result.sessionId).toBeTruthy();
    expect(result.candidateToken).toBeTruthy();
    expect(result.challenge.id).toBe('engineer-api-debug');
    const fetched = await fetch(`${baseUrl}/api/assessment-sessions/${result.sessionId}`);
    expect(fetched.status).toBe(403);
    const authorized = await fetch(`${baseUrl}/api/assessment-sessions/${result.sessionId}`, { headers: { 'x-candidate-token': result.candidateToken } });
    expect(authorized.status).toBe(200);
  });

  it('rejects setup images without consent and accepts them only with candidate token', async () => {
    const sessionResponse = await fetch(`${baseUrl}/api/assessment-sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: 'engineer-api-debug' }) });
    const session = await sessionResponse.json() as { sessionId: string; candidateToken: string };
    const payload = { sessionId: session.sessionId, imageData: 'data:image/jpeg;base64,ZmFrZQ==', consented: true };
    const unauthorized = await fetch(`${baseUrl}/api/setup-check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    expect(unauthorized.status).toBe(403);
    const authorized = await fetch(`${baseUrl}/api/setup-check`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-candidate-token': session.candidateToken }, body: JSON.stringify(payload) });
    expect(authorized.status).toBe(200);
  });

  it('rejects malformed and oversized submissions before model calls', async () => {
    const malformed = await fetch(`${baseUrl}/api/assess`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nope: true }) });
    expect(malformed.status).toBe(400);
    const huge = await fetch(`${baseUrl}/api/assess`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(60_000) }) });
    expect(huge.status).toBe(400);
  });

  it('rejects arbitrary challenges and payloads that do not match the selected challenge', async () => {
    const arbitrary = await fetch(`${baseUrl}/api/assessment-sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: 'unknown' }) });
    expect(arbitrary.status).toBe(404);
    const invalidSubmission = await fetch(`${baseUrl}/api/assess`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challenge: { id: 'fake' }, submission: {}, integrityEvents: [] }) });
    expect(invalidSubmission.status).toBe(400);
  });

  it('rejects generated challenges for invalid role titles and difficulties', async () => {
    const shortRole = await fetch(`${baseUrl}/api/generate-challenge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roleTitle: 'AB' }) });
    expect(shortRole.status).toBe(400);
    const badDifficulty = await fetch(`${baseUrl}/api/generate-challenge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roleTitle: 'Data Analyst', difficulty: 'Nonsense' }) });
    expect(badDifficulty.status).toBe(400);
  });

  it('reports a setup count only to the session candidate token', async () => {
    const sessionResponse = await fetch(`${baseUrl}/api/assessment-sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: 'engineer-api-debug' }) });
    const session = await sessionResponse.json() as { sessionId: string; candidateToken: string };
    const unauthorized = await fetch(`${baseUrl}/api/assessment-sessions/${session.sessionId}/setup-count`);
    expect(unauthorized.status).toBe(403);
    const authorized = await fetch(`${baseUrl}/api/assessment-sessions/${session.sessionId}/setup-count`, { headers: { 'x-candidate-token': session.candidateToken } });
    expect(authorized.status).toBe(200);
    expect((await authorized.json() as { count: number }).count).toBe(0);
  });

  it('returns a validated deterministic assessment with no API key and lists it for recruiters', async () => {
    const { challengeLibrary } = await import('../src/shared/challenge-library');
    const challenge = challengeLibrary[0];
    const submission = { id: 'api-submission-1', challengeId: challenge.id, candidateName: 'Synthetic Candidate', submittedAt: '2026-10-09T01:00:00.000Z', response: 'First I would investigate the page boundaries because filtering after pagination can skip records. I would move the filter into the query and add a regression test that reproduces archived rows between pages.' };
    const response = await fetch(`${baseUrl}/api/assess`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challenge, submission, integrityEvents: [] }) });
    expect(response.status).toBe(200);
    const result = await response.json() as { assessment: { generatedBy: string; recommendation: string; criteria: unknown[] } };
    expect(result.assessment.generatedBy).toBe('demo-fallback');
    expect(result.assessment.recommendation).toBe('review');
    expect(result.assessment.criteria).toHaveLength(challenge.rubric.length);
    const inbox = await fetch(`${baseUrl}/api/recruiter/submissions`);
    expect((await inbox.json() as { submissions: unknown[] }).submissions.length).toBeGreaterThanOrEqual(1);
  });
});
