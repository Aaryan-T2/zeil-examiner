import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { challengeLibrary } from './challenge-library';
import { loadChallenges, persistChallenge, saveSubmission } from './persistence';

describe('browser persistence', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps seeded challenges and saves custom ones for the current browser', () => {
    expect(loadChallenges()).toEqual(challengeLibrary);
    const custom = { ...challengeLibrary[0], id: 'custom-persisted', source: 'custom' as const };
    persistChallenge(custom);
    expect(loadChallenges()[0]).toEqual(custom);
    expect(loadChallenges()).toHaveLength(challengeLibrary.length + 1);
  });

  it('reports unavailable persistence rather than losing a submitted assessment silently', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const bundle = {
      challenge: challengeLibrary[0],
      submission: { id: 's1', challengeId: challengeLibrary[0].id, candidateName: 'Synthetic', submittedAt: 'now', response: 'answer' },
      assessment: { id: 'a1', submissionId: 's1', overallScore: 0, maximumScore: 1, summary: '', criteria: [], recommendation: 'review' as const, generatedBy: 'demo-fallback' as const, evaluatedAt: 'now' },
      integrityEvents: [],
    };
    expect(() => saveSubmission(bundle)).toThrow('Unable to save this assessment in this browser. Check local storage settings, then try again.');
  });
});
