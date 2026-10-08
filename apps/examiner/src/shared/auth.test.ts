import { describe, expect, it } from 'vitest';
import { authenticateDemoUser, demoAccounts } from './auth';

describe('separate demo role accounts', () => {
  it('defines distinct recruiter and candidate credentials', () => {
    expect(demoAccounts.recruiter.email).not.toBe(demoAccounts.candidate.email);
    expect(demoAccounts.recruiter.password).not.toBe(demoAccounts.candidate.password);
  });

  it('authenticates only the selected demo role and exact demo credentials', () => {
    expect(authenticateDemoUser('recruiter', demoAccounts.recruiter.email, demoAccounts.recruiter.password)?.displayName).toBe('Demo Recruiter');
    expect(authenticateDemoUser('candidate', demoAccounts.candidate.email, demoAccounts.candidate.password)?.displayName).toBe('Jordan Lee');
    expect(authenticateDemoUser('candidate', demoAccounts.recruiter.email, demoAccounts.recruiter.password)).toBeNull();
    expect(authenticateDemoUser('recruiter', demoAccounts.recruiter.email, 'wrong')).toBeNull();
  });
});
