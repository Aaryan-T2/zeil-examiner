export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ProctorVerdict {
  flagged: boolean;
  device: string;
  note: string;
  uncertainty: string;
}

const VERDICT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    flagged: { type: 'BOOLEAN' },
    device: { type: 'STRING' },
    note: { type: 'STRING' },
    uncertainty: { type: 'STRING' },
  },
  required: ['flagged', 'device', 'note', 'uncertainty'],
  propertyOrdering: ['flagged', 'device', 'note', 'uncertainty'],
};

export async function analyzeProctorFrame(imageData: string, apiKey?: string, fetcher: FetchLike = fetch): Promise<ProctorVerdict> {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
  if (!match || match[2].length > 120_000) return { flagged: false, device: '', note: 'Frame not analyzed.', uncertainty: 'Image format or size was not accepted.' };
  if (!apiKey) return { flagged: false, device: '', note: 'Live frame analysis unavailable.', uncertainty: 'No vision model configured.' };
  try {
    const response = await fetcher('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: 'You are a live proctoring assistant for a take-home skills assessment. Decide ONLY from directly visible evidence whether a clear secondary computing device is being used, specifically a mobile phone held or placed in view, or an additional monitor/tablet screen visible that is not the candidate\'s primary exam screen. Do not infer intent, do not identify people, do not flag reflections or ambiguous shapes, do not consider this a cheating verdict — a human recruiter reviews every flag. Be conservative: flag only when a device is clearly visible.' },
          { inlineData: { mimeType: `image/${match[1]}`, data: match[2] } },
        ] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: VERDICT_SCHEMA, temperature: 0.2 },
      }),
    });
    if (!response.ok) throw new Error(`Proctor request failed (${response.status}).`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
    if (!text) throw new Error('No proctor output.');
    const parsed = JSON.parse(text) as Partial<ProctorVerdict>;
    if (typeof parsed.flagged !== 'boolean' || typeof parsed.device !== 'string' || typeof parsed.note !== 'string' || typeof parsed.uncertainty !== 'string') throw new Error('Proctor output shape invalid.');
    return { flagged: Boolean(parsed.flagged), device: parsed.device.slice(0, 80), note: parsed.note.slice(0, 400), uncertainty: parsed.uncertainty.slice(0, 300) };
  } catch {
    return { flagged: false, device: '', note: 'Frame analysis unavailable.', uncertainty: 'Automated check failed; a human should review available frames.' };
  }
}
