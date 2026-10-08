import { describe, expect, it } from 'vitest';
import { evaluationCases, scoreEvaluationCases } from './evaluation';

describe('assessment fallback evaluation', () => {
  it('contains at least ten synthetic test inputs', () => {
    expect(evaluationCases.length).toBeGreaterThanOrEqual(10);
  });

  it('scores expected signal cases and rejects irrelevant/empty answers', () => {
    const result = scoreEvaluationCases();
    expect(result.total).toBeGreaterThanOrEqual(10);
    expect(result.percent).toBeGreaterThanOrEqual(70);
    expect(result.results.find((item) => item.id === 'empty')?.score).toBe(0);
    expect(result.results.find((item) => item.id === 'irrelevant')?.score).toBe(0);
  });
});
