export type UserRole = 'recruiter' | 'candidate';

export interface DemoAccount {
  email: string;
  password: string;
  displayName: string;
}

/** Public test-only identities for the hackathon demo. Never use for production access control. */
export const demoAccounts: Record<UserRole, DemoAccount> = {
  recruiter: { email: 'recruiter@examiner.demo', password: 'RecruiterDemo2026!', displayName: 'Demo Recruiter' },
  candidate: { email: 'candidate@examiner.demo', password: 'CandidateDemo2026!', displayName: 'Jordan Lee' },
};

export function authenticateDemoUser(role: UserRole, email: string, password: string): Omit<DemoAccount, 'password'> | null {
  const account = demoAccounts[role];
  if (email.trim().toLowerCase() !== account.email || password !== account.password) return null;
  return { email: account.email, displayName: account.displayName };
}
