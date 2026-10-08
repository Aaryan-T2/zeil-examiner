export type AssessmentMode = 'debugging' | 'code-review' | 'technical-scenario';
export type Difficulty = 'Foundational' | 'Intermediate' | 'Advanced';

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
}

export interface Challenge {
  id: string;
  title: string;
  role: string;
  department: string;
  mode: AssessmentMode;
  difficulty: Difficulty;
  durationMinutes: number;
  summary: string;
  prompt: string;
  skills: string[];
  rubric: RubricCriterion[];
  source: 'library' | 'custom' | 'ai-draft';
}

export interface CandidateSubmission {
  id: string;
  challengeId: string;
  candidateName: string;
  submittedAt: string;
  response: string;
}

export interface CriterionAssessment {
  criterionId: string;
  score: number;
  maxPoints: number;
  rationale: string;
  evidence: string[];
  uncertainty?: string;
}

export interface Assessment {
  id: string;
  submissionId: string;
  overallScore: number;
  maximumScore: number;
  summary: string;
  criteria: CriterionAssessment[];
  recommendation: 'review' | 'strong-evidence' | 'mixed-evidence';
  generatedBy: 'gemini' | 'demo-fallback';
  evaluatedAt: string;
}

export interface IntegrityEvent {
  id: string;
  occurredAt: string;
  kind: 'focus-lost' | 'fullscreen-exit' | 'camera-check' | 'paste-blocked';
  description: string;
  reviewRequired: boolean;
  imageData?: string;
}

export interface AssessmentEvalCase {
  id: string;
  response: string;
  expectedSignals: string[];
  forbiddenSignals: string[];
}

export function validateAssessment(assessment: Assessment, submission: CandidateSubmission, challenge: Challenge): string[] {
  const issues: string[] = [];
  if (assessment.submissionId !== submission.id) issues.push('Assessment submission id does not match.');
  if (assessment.criteria.length !== challenge.rubric.length) issues.push('Assessment must include every rubric criterion exactly once.');
  const seen = new Set<string>();
  for (const result of assessment.criteria) {
    const rubric = challenge.rubric.find((criterion) => criterion.id === result.criterionId);
    if (!rubric) {
      issues.push(`Unknown rubric criterion: ${result.criterionId}.`);
      continue;
    }
    if (seen.has(result.criterionId)) issues.push(`Duplicate rubric criterion: ${result.criterionId}.`);
    seen.add(result.criterionId);
    if (!Number.isInteger(result.score) || result.score < 0 || result.score > rubric.maxPoints) issues.push(`Score for ${rubric.name} is outside its rubric bounds.`);
    if (result.maxPoints !== rubric.maxPoints) issues.push(`Maximum points for ${rubric.name} do not match the rubric.`);
    if (!result.evidence.every((quote) => quote.length === 0 || submission.response.includes(quote))) issues.push(`Evidence for ${rubric.name} is not quoted from the submission.`);
  }
  const calculatedMaximum = challenge.rubric.reduce((total, criterion) => total + criterion.maxPoints, 0);
  const calculatedScore = assessment.criteria.reduce((total, result) => total + result.score, 0);
  if (assessment.maximumScore !== calculatedMaximum) issues.push('Assessment maximum score does not match rubric total.');
  if (assessment.overallScore !== calculatedScore) issues.push('Assessment total does not match criterion scores.');
  return issues;
}

export function validateChallenge(challenge: Challenge): string[] {
  const issues: string[] = [];
  if (challenge.id.length > 120) issues.push('Challenge id must be 120 characters or fewer.');
  if (challenge.title.length > 160) issues.push('Challenge title must be 160 characters or fewer.');
  if (challenge.role.length > 120) issues.push('Role must be 120 characters or fewer.');
  if (challenge.summary.length > 500) issues.push('Challenge summary must be 500 characters or fewer.');
  if (challenge.prompt.length > 8_000) issues.push('Challenge prompt must be 8,000 characters or fewer.');
  if (challenge.skills.length > 20 || challenge.skills.some((skill) => skill.length > 80)) issues.push('Challenge skills must be limited to 20 short labels.');
  if (challenge.rubric.length > 20) issues.push('Challenge rubric must have 20 criteria or fewer.');
  if (!challenge.title.trim()) issues.push('Add a challenge title.');
  if (!challenge.role.trim()) issues.push('Add a role.');
  if (!challenge.prompt.trim()) issues.push('Add the candidate task prompt.');
  if (!Number.isInteger(challenge.durationMinutes) || challenge.durationMinutes < 5 || challenge.durationMinutes > 180) {
    issues.push('Duration must be between 5 and 180 minutes.');
  }
  if (challenge.rubric.length === 0) issues.push('Add at least one rubric criterion.');
  for (const [index, criterion] of challenge.rubric.entries()) {
    if (!criterion.name.trim()) issues.push(`Rubric criterion ${index + 1} needs a name.`);
    if (!Number.isInteger(criterion.maxPoints) || criterion.maxPoints < 1 || criterion.maxPoints > 100) {
      issues.push(`Rubric criterion ${index + 1} must have between 1 and 100 points.`);
    }
  }
  return issues;
}

export function validateSubmission(submission: CandidateSubmission, challenge: Challenge): string[] {
  const issues: string[] = [];
  if (submission.id.length > 128) issues.push('Submission id must be 128 characters or fewer.');
  if (submission.challengeId !== challenge.id) issues.push('Submission challenge does not match the selected challenge.');
  if (!submission.candidateName.trim() || submission.candidateName.length > 120) issues.push('Candidate name must be between 1 and 120 characters.');
  if (!submission.response.trim()) issues.push('Add a response before submitting.');
  if (submission.response.length > 20_000) issues.push('Response is longer than the 20,000 character limit.');
  if (!Number.isFinite(Date.parse(submission.submittedAt))) issues.push('Submission time is invalid.');
  return issues;
}
