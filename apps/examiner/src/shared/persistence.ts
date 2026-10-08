import type { Challenge, IntegrityEvent } from './contracts';
import type { AssessmentBundle } from './assessment';
import { createAssessmentStore } from './assessment';
import { challengeLibrary } from './challenge-library';

const CHALLENGE_KEY = 'examiner.challenges.v1';
const INVITE_KEY = 'examiner.demo-invites.v1';

export interface DemoInvite {
  sessionId: string;
  challenge: Challenge;
  inviteUrl: string;
  createdAt: string;
  phoneUrl?: string;
  integrityEvents?: IntegrityEvent[];
  token?: string;
}

export function loadInvites(): DemoInvite[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(INVITE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed as DemoInvite[] : [];
  } catch { return []; }
}

export function removeInvite(sessionId: string): void {
  try { window.localStorage.setItem(INVITE_KEY, JSON.stringify(loadInvites().filter((invite) => invite.sessionId !== sessionId))); } catch { /* best effort cleanup */ }
}

export function saveInvite(invite: DemoInvite): void {
  try {
    const next = [invite, ...loadInvites().filter((item) => item.sessionId !== invite.sessionId)].slice(0, 25);
    window.localStorage.setItem(INVITE_KEY, JSON.stringify(next));
  } catch {
    throw new Error('Could not store this demo invite in the current browser.');
  }
}

export function loadChallenges(): Challenge[] {
  try {
    const raw = window.localStorage.getItem(CHALLENGE_KEY);
    if (!raw) return challengeLibrary;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as Challenge[] : challengeLibrary;
  } catch {
    return challengeLibrary;
  }
}

export function persistChallenge(challenge: Challenge): void {
  const current = loadChallenges().filter((item) => item.id !== challenge.id);
  try {
    window.localStorage.setItem(CHALLENGE_KEY, JSON.stringify([challenge, ...current]));
  } catch {
    throw new Error('Unable to save this challenge in this browser. Check local storage settings, then try again.');
  }
}

export function saveSubmission(bundle: AssessmentBundle): void {
  try {
    createAssessmentStore().save(bundle);
  } catch {
    throw new Error('Unable to save this assessment in this browser. Check local storage settings, then try again.');
  }
}

export function updateSubmission(bundle: AssessmentBundle): void {
  saveSubmission(bundle);
}
