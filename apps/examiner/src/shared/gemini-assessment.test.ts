import { describe, expect, it, vi } from 'vitest';
import { challengeLibrary } from './challenge-library';
import { assessSubmissionWithGemini, describeSetupImage } from './gemini-assessment';

describe('Gemini assessment adapter', () => {
  it('uses the deterministic fallback when no key is configured', async () => {
    const submission = { id: 'g-no-key', challengeId: challengeLibrary[0].id, candidateName: 'Synthetic', submittedAt: 'now', response: 'I would investigate and add a regression test.' };
    const result = await assessSubmissionWithGemini(challengeLibrary[0], submission, undefined, vi.fn());
    expect(result.generatedBy).toBe('demo-fallback');
  });

  it('validates Gemini rubric ids, score bounds, and summary shape before using output', async () => {
    const challenge = challengeLibrary[0];
    const submission = { id: 'g-test', challengeId: challenge.id, candidateName: 'Synthetic', submittedAt: 'now', response: 'I would investigate and add a regression test.' };
    const valid = { summary: 'Human review needed', criteria: challenge.rubric.map((criterion) => ({ criterionId: criterion.id, score: 1, rationale: 'Observed response signal', evidence: ['I would investigate'], uncertainty: 'Limited demo signal' })) };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(valid) }] } }] }) });
    const result = await assessSubmissionWithGemini(challenge, submission, 'synthetic-key', fetcher);
    expect(result.generatedBy).toBe('gemini');
    expect(result.recommendation).toBe('review');

    const invalidFetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...valid, criteria: [] }) }] } }] }) });
    const fallback = await assessSubmissionWithGemini(challenge, submission, 'synthetic-key', invalidFetcher);
    expect(fallback.generatedBy).toBe('demo-fallback');
  });

  it('sends an opted-in setup image to Gemini for neutral descriptive notes only', async () => {
    const output = { note: 'Desk and laptop are visible.', observations: ['desk visible', 'laptop visible'], uncertainty: 'Image angle limits visibility.' };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }) });
    const result = await describeSetupImage('data:image/jpeg;base64,ZmFrZQ==', 'synthetic-key', fetcher);
    expect(result).toEqual(output);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.contents[0].parts[1].inlineData.data).toBe('ZmFrZQ==');
  });

  it('does not call Gemini without a configured key', async () => {
    const fetcher = vi.fn();
    const result = await describeSetupImage('data:image/jpeg;base64,ZmFrZQ==', undefined, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.observations).toEqual([]);
  });
});
