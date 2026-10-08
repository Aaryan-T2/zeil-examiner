import { describe, expect, it } from 'vitest';
import { validateAssessment, validateChallenge, validateSubmission } from './contracts';
import { challengeLibrary } from './challenge-library';
import { assessSubmission } from './assessment';

function validCustomChallenge() {
  return {
    id: 'custom-test',
    title: 'Test challenge',
    role: 'Software Engineer',
    department: 'Engineering',
    mode: 'technical-scenario' as const,
    difficulty: 'Intermediate' as const,
    durationMinutes: 30,
    summary: 'Review an API change.',
    prompt: 'Explain what you would investigate.',
    skills: ['Debugging'],
    rubric: [{ id: 'reasoning', name: 'Reasoning', description: 'Explain your thinking.', maxPoints: 5 }],
    source: 'custom' as const,
  };
}

describe('validateChallenge', () => {
  it('accepts each prepared software-engineering challenge', () => {
    for (const challenge of challengeLibrary) {
      expect(validateChallenge(challenge)).toEqual([]);
    }
  });

  it('reports missing task details and invalid duration/criteria', () => {
    const issues = validateChallenge({
      ...challengeLibrary[0],
      title: ' ',
      role: '',
      prompt: '',
      durationMinutes: 0,
      rubric: [{ id: 'empty', name: '', description: '', maxPoints: 0 }],
    });

    expect(issues).toContain('Add a challenge title.');
    expect(issues).toContain('Add a role.');
    expect(issues).toContain('Add the candidate task prompt.');
    expect(issues).toContain('Duration must be between 5 and 180 minutes.');
    expect(issues).toContain('Rubric criterion 1 needs a name.');
    expect(issues).toContain('Rubric criterion 1 must have between 1 and 100 points.');
  });

  it('accepts a complete custom challenge with a bounded rubric', () => {
    expect(validateChallenge(validCustomChallenge())).toEqual([]);
  });
});

describe('validateSubmission', () => {
  it('checks challenge match, required candidate details, response length and submission time', () => {
    const challenge = challengeLibrary[0];
    expect(validateSubmission({ id: 's1', challengeId: challenge.id, candidateName: 'A synthetic candidate', submittedAt: '2026-10-09T00:00:00.000Z', response: 'This is a submitted response.' }, challenge)).toEqual([]);
    const issues = validateSubmission({ id: 's2', challengeId: 'other', candidateName: ' ', submittedAt: 'invalid', response: 'x'.repeat(20_001) }, challenge);
    expect(issues).toContain('Submission challenge does not match the selected challenge.');
    expect(issues).toContain('Candidate name must be between 1 and 120 characters.');
    expect(issues).toContain('Response is longer than the 20,000 character limit.');
    expect(issues).toContain('Submission time is invalid.');
  });
});

describe('validateAssessment', () => {
  it('rejects a fabricated quote and score beyond criterion maximum', () => {
    const challenge = challengeLibrary[0];
    const submission = { id: 'submission-check', challengeId: challenge.id, candidateName: 'Synthetic', submittedAt: '2026-10-09T00:00:00.000Z', response: 'I would add a regression test.' };
    const assessment = assessSubmission(challenge, submission);
    assessment.criteria[0].score = challenge.rubric[0].maxPoints + 1;
    assessment.criteria[0].evidence = ['fabricated quote'];
    expect(validateAssessment(assessment, submission, challenge)).toContain(`Score for ${challenge.rubric[0].name} is outside its rubric bounds.`);
    expect(validateAssessment(assessment, submission, challenge)).toContain(`Evidence for ${challenge.rubric[0].name} is not quoted from the submission.`);
  });
});
