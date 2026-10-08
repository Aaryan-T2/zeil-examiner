import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CandidateExam } from './CandidateExam';
import { challengeLibrary } from '../../shared/challenge-library';

describe('debug', () => {
  it('counts submit buttons', () => {
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={vi.fn()} onBack={vi.fn()} />);
    const btns = screen.getAllByRole('button', { name: /^Submit work$/ });
    console.log('COUNT', btns.length);
    btns.forEach((b, i) => console.log(i, JSON.stringify(b.textContent), 'disabled=', b.hasAttribute('disabled')));
    expect(true).toBe(true);
  });
});
