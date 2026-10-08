import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../App';

describe('separate demo login views', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('allows the recruiter demo account into the recruiter workspace only', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'RecruiterDemo2026!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as recruiter' }));
    expect(screen.getByRole('heading', { name: 'Practical assessments' })).toBeTruthy();
  });

  it('does not allow recruiter credentials in the candidate login', () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Candidate' }));
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'RecruiterDemo2026!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in as candidate' }));
    expect(screen.getByRole('alert').textContent).toContain('did not match');
  });
});
