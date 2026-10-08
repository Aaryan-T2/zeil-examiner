import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CandidateExam } from './CandidateExam';
import { challengeLibrary } from '../../shared/challenge-library';

describe('CandidateExam', () => {
  it('requires a minimally useful response and submits candidate work', () => {
    const onSubmit = vi.fn();
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={onSubmit} onBack={vi.fn()} />);

    const submit = screen.getByRole('button', { name: /submit work/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/your response/i), { target: { value: 'This response is long enough to submit.' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      challengeId: challengeLibrary[0].id,
      candidateName: 'Jordan Lee',
      response: 'This response is long enough to submit.',
    });
    expect(screen.getByText(/submission received/i)).toBeTruthy();
  });

  it('requires explicit consent and a successful camera checkpoint before camera capture affects the session', () => {
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/capture setup images/i)).toBeTruthy();
    const captureButton = screen.queryByRole('button', { name: /capture start setup/i });
    expect(captureButton).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /capture start setup/i }));
    return screen.findByRole('status').then((status) => {
      expect(status.textContent).toContain('Camera permission was unavailable');
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: original });
    });
  });

it('blocks pasted text and reports a separate paste integrity event on submit', () => {
    const onSubmit = vi.fn();
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={onSubmit} onBack={vi.fn()} />);
    const answer = screen.getByLabelText(/your response/i);
    fireEvent.paste(answer, { clipboardData: { getData: () => 'pasted answer text' } });
    expect(screen.getByText(/1 paste attempts blocked/i)).toBeTruthy();
    fireEvent.change(answer, { target: { value: 'A typed response with enough detail to be submitted.' } });
    fireEvent.click(screen.getByRole('button', { name: /^Submit work$/, disabled: false }));
    expect(onSubmit.mock.calls[0][1].some((event: { kind: string }) => event.kind === 'paste-blocked')).toBe(true);
  });

  it('retains a setup photo for recruiter review only after explicit consent', async () => {
    const originalMedia = navigator.mediaDevices;
    const drawImage = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['test'], { type: 'image/jpeg' })));
    const originalCreate = document.createElement.bind(document);
    let videoEl: HTMLVideoElement | null = null;
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'video') {
        videoEl = el as unknown as HTMLVideoElement;
        Object.defineProperty(el, 'play', { value: vi.fn().mockResolvedValue(undefined) });
        Object.defineProperty(el, 'videoWidth', { value: 640, writable: true });
        Object.defineProperty(el, 'videoHeight', { value: 480, writable: true });
        setTimeout(() => videoEl?.onloadedmetadata?.(new Event('loadedmetadata')), 0);
      }
      if (tag === 'canvas') { Object.defineProperty(el, 'width', { value: 2, writable: true }); Object.defineProperty(el, 'height', { value: 2, writable: true }); }
      return el;
    }) as typeof document.createElement);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) } });
    const onCameraImage = vi.fn().mockResolvedValue('AI note: laptop visible. Uncertainty: angle limited.');
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={vi.fn()} onBack={vi.fn()} onCameraImage={onCameraImage} />);
    await vi.waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /capture start setup/i })[0]);
    await vi.waitFor(() => expect(onCameraImage).toHaveBeenCalled());
    expect(drawImage).toHaveBeenCalled();
    expect(toBlob).toHaveBeenCalled();
    expect(onCameraImage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'camera-check', imageData: expect.stringMatching(/^data:image\/jpeg;base64,/) }));
    expect(getContext).toHaveBeenCalled();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMedia });
  });
});
