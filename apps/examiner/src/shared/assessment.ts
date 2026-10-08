import type { Assessment, CandidateSubmission, Challenge, CriterionAssessment, IntegrityEvent } from './contracts';

export interface AssessmentBundle {
  challenge: Challenge;
  submission: CandidateSubmission;
  assessment: Assessment;
  integrityEvents: IntegrityEvent[];
  reviewStatus?: 'needs-review' | 'reviewed';
}

export interface AssessmentStore {
  list(): AssessmentBundle[];
  get(submissionId: string): AssessmentBundle | undefined;
  save(bundle: AssessmentBundle): void;
  remove(submissionId: string): void;
}

const STORE_KEY = 'examiner.assessments.v1';

export function createAssessmentStore(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): AssessmentStore {
  const backing = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
  const read = (): AssessmentBundle[] => {
    if (!backing) return [];
    try {
      const value: unknown = JSON.parse(backing.getItem(STORE_KEY) ?? '[]');
      return Array.isArray(value) ? value as AssessmentBundle[] : [];
    } catch {
      return [];
    }
  };
  const write = (rows: AssessmentBundle[]) => {
    if (!backing) return;
    const reduced = reduceImagePayloads(rows);
    if (reduced.length === 0) backing.removeItem(STORE_KEY);
    else backing.setItem(STORE_KEY, JSON.stringify(reduced));
  };

  return {
    list: read,
    get: (submissionId) => read().find((row) => row.submission.id === submissionId),
    save: (bundle) => {
      const current = read().filter((row) => row.submission.id !== bundle.submission.id);
      write([bundle, ...current]);
    },
    remove: (submissionId) => write(read().filter((row) => row.submission.id !== submissionId)),
  };
}

function reduceImagePayloads(rows: AssessmentBundle[]): AssessmentBundle[] {
  return rows.map((bundle) => ({
    ...bundle,
    integrityEvents: bundle.integrityEvents.map((event) => {
      if (!event.imageData) return event;
      const [header, payload] = event.imageData.split(',', 2);
      if (!header || !payload || payload.length <= 180_000) return event;
      return { ...event, imageData: `${header},${payload.slice(0, 180_000)}`, description: `${event.description} (image was size-limited for local browser storage.)` };
    }),
  }));
}

function includesSignal(response: string, words: string[]): boolean {
  const normalized = response.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

/** Deterministic, transparent demo assessment. Not a hiring decision or a substitute for human review. */
export function assessSubmission(challenge: Challenge, submission: CandidateSubmission, evaluatedAt = new Date().toISOString()): Assessment {
  const response = submission.response.trim();
  const hasSubstance = response.length >= 100;
  const hasTestSignal = includesSignal(response, ['test', 'assert', 'regression', 'reproduce', 'case']);
  const hasReasoning = includesSignal(response, ['because', 'therefore', 'first', 'check', 'investigate', 'hypothesis', 'likely']);
  const hasAction = includesSignal(response, ['fix', 'change', 'rollback', 'invalidate', 'filter', 'sort', 'mitigate', 'return']);

  const criteria: CriterionAssessment[] = challenge.rubric.map((criterion) => {
    if (!response) {
      return {
        criterionId: criterion.id,
        score: 0,
        maxPoints: criterion.maxPoints,
        rationale: 'No response was submitted for this criterion.',
        evidence: [],
        uncertainty: 'No work is available to assess.',
      };
    }

    const signal = criterionSignal(criterion, { hasSubstance, hasTestSignal, hasReasoning, hasAction });
    const score = signal ? Math.min(criterion.maxPoints, Math.max(1, Math.ceil(criterion.maxPoints * (hasSubstance ? 0.75 : 0.4)))) : 0;
    const quotedEvidence = findEvidence(response, criterion);

    return {
      criterionId: criterion.id,
      score,
      maxPoints: criterion.maxPoints,
      rationale: signal
        ? 'The response includes a relevant signal for this criterion. A recruiter should verify the reasoning against the complete work.'
        : 'The response provides limited direct evidence for this criterion; review the work and consider a follow-up question.',
      evidence: quotedEvidence ? [quotedEvidence] : [],
      uncertainty: 'This deterministic demo heuristic checks for broad response signals; it does not establish candidate competence.',
    };
  });

  const maximumScore = criteria.reduce((total, criterion) => total + criterion.maxPoints, 0);
  const overallScore = criteria.reduce((total, criterion) => total + criterion.score, 0);

  return {
    id: `assessment-${submission.id}`,
    submissionId: submission.id,
    overallScore,
    maximumScore,
    summary: response
      ? 'A preliminary, rules-based evidence summary is ready for recruiter review. The displayed score is not a hiring recommendation.'
      : 'The candidate submitted an empty response. Recruiter review is required before interpreting this result.',
    criteria,
    recommendation: 'review',
    generatedBy: 'demo-fallback',
    evaluatedAt,
  };
}

function criterionSignal(criterion: Challenge['rubric'][number], signals: { hasSubstance: boolean; hasTestSignal: boolean; hasReasoning: boolean; hasAction: boolean }): boolean {
  const text = `${criterion.name} ${criterion.description}`;
  if (/test|verif|validation/i.test(text)) return signals.hasTestSignal;
  if (/fix|remediat|stabil|user impact/i.test(text)) return signals.hasAction;
  if (/diagnos|investigat|risk|communication|trade.?off|learning/i.test(text)) return signals.hasReasoning;
  return signals.hasSubstance;
}

function findEvidence(response: string, criterion: Challenge['rubric'][number]): string {
  const terms = `${criterion.name} ${criterion.description}`.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 5);
  const sentences = response.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const match = sentences.find((sentence) => terms.some((term) => sentence.toLowerCase().includes(term)));
  const excerpt = match ?? sentences[0] ?? response;
  return excerpt.length > 240 ? `${excerpt.slice(0, 237).trimEnd()}…` : excerpt;
}
