import { beforeEach, describe, expect, it } from 'vitest';
import type { AssessmentBundle } from './assessment';
import { assessSubmission, createAssessmentStore } from './assessment';
import { challengeLibrary } from './challenge-library';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('assessment demo fallback', () => {
  const challenge = challengeLibrary[0];

  it('creates criterion scores bounded by each criterion and cites submitted work', () => {
    const submission = { id: 'sub-1', challengeId: challenge.id, candidateName: 'Demo Candidate', submittedAt: '2026-10-09T00:00:00.000Z', response: 'I would investigate the page ordering because archived records are removed after pagination. I would fix the filter before cursor pagination and add a regression test to reproduce the missing rows.' };
    const result = assessSubmission(challenge, submission, '2026-10-09T00:01:00.000Z');

    expect(result.generatedBy).toBe('demo-fallback');
    expect(result.recommendation).toBe('review');
    expect(result.criteria).toHaveLength(challenge.rubric.length);
    expect(result.criteria.every((criterion) => criterion.score >= 0 && criterion.score <= criterion.maxPoints)).toBe(true);
    expect(result.criteria.every((criterion) => Boolean(criterion.evidence[0]) && submission.response.includes(criterion.evidence[0]!.replace(/…$/, '')))).toBe(true);
    expect(result.maximumScore).toBe(challenge.rubric.reduce((sum, item) => sum + item.maxPoints, 0));
  });

  it('handles a blank answer as missing evidence with zero points', () => {
    const result = assessSubmission(challenge, { id: 'sub-empty', challengeId: challenge.id, candidateName: 'Demo Candidate', submittedAt: '2026-10-09T00:00:00.000Z', response: '   ' });
    expect(result.overallScore).toBe(0);
    expect(result.criteria.every((criterion) => criterion.evidence.length === 0)).toBe(true);
    expect(result.criteria.every((criterion) => criterion.uncertainty === 'No work is available to assess.')).toBe(true);
  });

  it('does not award rubric points when a non-empty answer contains no criterion signals', () => {
    const response = 'The sky is blue and I enjoy long walks outside on a sunny day.';
    const result = assessSubmission(challenge, { id: 'sub-irrelevant', challengeId: challenge.id, candidateName: 'Demo Candidate', submittedAt: '2026-10-09T00:00:00.000Z', response });
    expect(result.overallScore).toBe(0);
    expect(result.criteria.every((criterion) => criterion.evidence[0] === response)).toBe(true);
  });
});

describe('assessment store', () => {
  let storage: MemoryStorage;
  let store: ReturnType<typeof createAssessmentStore>;
  let bundle: AssessmentBundle;

  beforeEach(() => {
    storage = new MemoryStorage();
    store = createAssessmentStore(storage);
    const submission = { id: 'sub-2', challengeId: challengeLibrary[0].id, candidateName: 'Demo Candidate', submittedAt: '2026-10-09T00:00:00.000Z', response: 'Example answer' };
    bundle = { challenge: challengeLibrary[0], submission, assessment: assessSubmission(challengeLibrary[0], submission), integrityEvents: [] };
  });

  it('saves, replaces and removes submissions by id', () => {
    store.save(bundle);
    expect(store.get(bundle.submission.id)?.submission.response).toBe('Example answer');
    store.save({ ...bundle, submission: { ...bundle.submission, response: 'Updated' } });
    expect(store.list()).toHaveLength(1);
    expect(store.get(bundle.submission.id)?.submission.response).toBe('Updated');
    store.remove(bundle.submission.id);
    expect(store.list()).toEqual([]);
  });

  it('recovers from malformed local storage without throwing', () => {
    storage.setItem('examiner.assessments.v2', '{broken');
    expect(store.list()).toEqual([]);
  });

  it('caps retained checkpoint image payloads for browser storage', () => {
    const submission = { id: 'image-sub', challengeId: challengeLibrary[0].id, candidateName: 'Synthetic', submittedAt: '2026-10-09T00:00:00.000Z', response: 'Synthetic response.' };
    const largeImage = `data:image/jpeg;base64,${'x'.repeat(220_000)}`;
    const largeBundle: AssessmentBundle = { ...bundle, submission, integrityEvents: [{ id: 'camera-1', occurredAt: submission.submittedAt, kind: 'camera-check', description: 'Setup image.', reviewRequired: true, imageData: largeImage }] };
    store.save(largeBundle);
    const savedImage = store.get(submission.id)?.integrityEvents[0].imageData ?? '';
    expect(savedImage.length).toBeLessThan(181_000);
    expect(store.get(submission.id)?.integrityEvents[0].description).toContain('size-limited');
  });
});
