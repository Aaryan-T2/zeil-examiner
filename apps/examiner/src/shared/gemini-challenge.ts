import type { AssessmentMode, Challenge, Difficulty } from './contracts';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ModelDraft {
  title: string;
  summary: string;
  prompt: string;
  skills: string[];
  rubric: Array<{ id?: string; name: string; description: string; maxPoints: number }>;
}

const DRAFT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
    prompt: { type: 'STRING' },
    skills: { type: 'ARRAY', items: { type: 'STRING' } },
    rubric: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          description: { type: 'STRING' },
          maxPoints: { type: 'INTEGER' },
        },
        required: ['name', 'description', 'maxPoints'],
        propertyOrdering: ['name', 'description', 'maxPoints'],
      },
    },
  },
  required: ['title', 'summary', 'prompt', 'skills', 'rubric'],
  propertyOrdering: ['title', 'summary', 'prompt', 'skills', 'rubric'],
};

export function buildFallbackDraft(roleTitle: string, difficulty: Difficulty): ModelDraft {
  return {
    title: `${roleTitle}: practical work sample`,
    summary: `A ${difficulty.toLowerCase()} work sample tailored to the ${roleTitle} role, covering real tasks from the job.`,
    prompt: `You have joined the team as a ${roleTitle}. A teammate describes a realistic problem in this area and asks for your help.\n\nDescribe how you would approach the problem: what you would investigate or clarify first, the concrete steps you would take, how you would validate your solution, and what trade-offs or risks you would flag to the team. Use short examples where they make your reasoning clearer.`,
    skills: [roleTitle, 'Problem solving', 'Communication'],
    rubric: [
      { name: 'Role-relevant reasoning', description: `Applies ${roleTitle} knowledge to the scenario with concrete, plausible steps.`, maxPoints: 4 },
      { name: 'Validation', description: 'Explains how the solution would be tested or verified.', maxPoints: 3 },
      { name: 'Communication', description: 'Structures the answer clearly and states assumptions.', maxPoints: 3 },
    ],
  };
}

function sanitizeDraft(raw: unknown): ModelDraft {
  if (!raw || typeof raw !== 'object') throw new Error('Model returned a non-object draft.');
  const draft = raw as Partial<ModelDraft>;
  if (typeof draft.title !== 'string' || typeof draft.summary !== 'string' || typeof draft.prompt !== 'string' || !Array.isArray(draft.skills) || !Array.isArray(draft.rubric)) {
    throw new Error('Model draft did not match the challenge schema.');
  }
  const rubric = draft.rubric
    .filter((item) => item && typeof item.name === 'string' && typeof item.description === 'string' && Number.isInteger(item.maxPoints) && item.maxPoints >= 1 && item.maxPoints <= 10)
    .slice(0, 6)
    .map((item, index) => ({ id: `criterion-${index + 1}`, name: item.name.slice(0, 80), description: item.description.slice(0, 300), maxPoints: item.maxPoints }));
  if (rubric.length === 0) throw new Error('Model draft contained no usable rubric criteria.');
  return {
    title: draft.title.slice(0, 160),
    summary: draft.summary.slice(0, 500),
    prompt: draft.prompt.slice(0, 8000),
    skills: draft.skills.filter((item) => typeof item === 'string').slice(0, 8).map((item) => item.slice(0, 80)),
    rubric,
  };
}

export function draftToChallenge(draft: ModelDraft, roleTitle: string, difficulty: Difficulty, mode: AssessmentMode, department: string): Challenge {
  return {
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: draft.title,
    role: roleTitle,
    department,
    mode,
    difficulty,
    durationMinutes: difficulty === 'Foundational' ? 20 : difficulty === 'Advanced' ? 35 : 25,
    summary: draft.summary,
    prompt: draft.prompt,
    skills: draft.skills,
    rubric: draft.rubric.map((item, index) => ({ id: item.id ?? `criterion-${index + 1}`, name: item.name, description: item.description, maxPoints: item.maxPoints })),
    source: 'ai-draft',
  };
}

export async function generateChallengeFromRole(
  roleTitle: string,
  difficulty: Difficulty,
  mode: AssessmentMode,
  department: string,
  apiKey?: string,
  fetcher: FetchLike = fetch,
): Promise<{ challenge: Challenge; generatedBy: 'gemini' | 'fallback' }> {
  if (!apiKey) return { challenge: draftToChallenge(buildFallbackDraft(roleTitle, difficulty), roleTitle, difficulty, mode, department), generatedBy: 'fallback' };
  try {
    const response = await fetcher('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `You design practical take-home work samples for recruiters. Generate ONE assessment challenge for the job role "${roleTitle}" at ${difficulty} difficulty, mode "${mode}".\n- title: specific task name, not generic.\n- summary: one sentence a recruiter can scan.\n- prompt: a realistic scenario with enough detail to answer in the stated duration; ask for reasoning, steps, and verification; no multiple-choice; no questions about personal life.\n- skills: 3-6 short labels.\n- rubric: 3-5 criteria, each maxPoints 1-10, total roughly 10-15 points.\nReturn JSON only.` }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: DRAFT_SCHEMA, temperature: 0.6 },
      }),
    });
    if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
    if (!text) throw new Error('Gemini returned no draft text.');
    const draft = sanitizeDraft(JSON.parse(text));
    return { challenge: draftToChallenge(draft, roleTitle, difficulty, mode, department), generatedBy: 'gemini' };
  } catch {
    return { challenge: draftToChallenge(buildFallbackDraft(roleTitle, difficulty), roleTitle, difficulty, mode, department), generatedBy: 'fallback' };
  }
}
