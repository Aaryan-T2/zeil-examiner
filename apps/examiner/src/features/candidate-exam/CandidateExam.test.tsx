import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CandidateExam } from './CandidateExam';
import { challengeLibrary } from '../../shared/challenge-library';

function mockCameraSuccess() {
  const drawImage = vi.fn();
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['test'], { type: 'image/jpeg' })));
  const originalCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = originalCreate(tag);
    if (tag === 'video') {
      Object.defineProperty(el, 'play', { value: vi.fn().mockResolvedValue(undefined) });
      Object.defineProperty(el, 'videoWidth', { value: 640, writable: true });
      Object.defineProperty(el, 'videoHeight', { value: 480, writable: true });
      setTimeout(() => (el as HTMLVideoElement).onloadedmetadata?.(new Event('loadedmetadata')), 0);
    }
    if (tag === 'canvas') { Object.defineProperty(el, 'width', { value: 2, writable: true }); Object.defineProperty(el, 'height', { value: 2, writable: true }); }
    return el;
  }) as typeof document.createElement);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) } });
  return { drawImage, getContext, toBlob };
}

function restoreCamera(original: MediaDevices | undefined) {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: original });
}

async function passStartGate() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /take start photo/i }));
  await waitFor(() => expect(screen.getByLabelText(/your response/i)).toBeTruthy());
}

describe('CandidateExam', () => {
  it('locks the exam until a start photo is captured, then submits work', async () => {
    const original = navigator.mediaDevices;
    mockCameraSuccess();
    const onSubmit = vi.fn();
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={onSubmit} onBack={vi.fn()} />);

    expect(screen.queryByLabelText(/your response/i)).toBeNull();
    expect(screen.getByText(/before you begin/i)).toBeTruthy();
    expect(screen.getByText(/photograph your workspace/i)).toBeTruthy();

    await passStartGate();

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
    restoreCamera(original);
  });

  it('requires explicit consent and a successful camera photo before the exam starts', async () => {
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={vi.fn()} onBack={vi.fn()} />);

    expect(screen.queryByLabelText(/your response/i)).toBeNull();
    expect(screen.getByText(/setup photo being captured/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /take start photo/i })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /take start photo/i }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Camera permission is required to start your exam');
    expect(screen.queryByLabelText(/your response/i)).toBeNull();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: original });
  });

  it('blocks pasted text and reports a separate paste integrity event on submit', async () => {
    const original = navigator.mediaDevices;
    mockCameraSuccess();
    const onSubmit = vi.fn();
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={onSubmit} onBack={vi.fn()} />);
    await passStartGate();

    const answer = screen.getByLabelText(/your response/i);
    fireEvent.paste(answer, { clipboardData: { getData: () => 'pasted answer text' } });
    expect(screen.getByText(/1 paste attempts blocked/i)).toBeTruthy();
    fireEvent.change(answer, { target: { value: 'A typed response with enough detail to be submitted.' } });
    fireEvent.click(screen.getAllByRole('button', { name: /submit work/i }).find((btn) => !btn.hasAttribute('disabled'))!);
    expect(onSubmit.mock.calls[0][1].some((event: { kind: string }) => event.kind === 'paste-blocked')).toBe(true);
    restoreCamera(original);
  });

  it('retains the start photo and shares it with the recruiter review flow', async () => {
    const originalMedia = navigator.mediaDevices;
    const { drawImage, getContext, toBlob } = mockCameraSuccess();
    const onCameraImage = vi.fn().mockResolvedValue('AI note: laptop visible. Uncertainty: angle limited.');
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={vi.fn()} onBack={vi.fn()} onCameraImage={onCameraImage} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /take start photo/i }));
    await waitFor(() => expect(onCameraImage).toHaveBeenCalled());
    expect(drawImage).toHaveBeenCalled();
    expect(toBlob).toHaveBeenCalled();
    expect(onCameraImage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'camera-check', imageData: expect.stringMatching(/^data:image\/jpeg;base64,/) }));
    expect(getContext).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText(/your response/i)).toBeTruthy());
    expect(screen.getByTestId('check-count').textContent).toContain('1 captured');
    restoreCamera(originalMedia);
  });

  it('shows an automatic phone-pairing QR when a setup URL is provided', async () => {
    const original = navigator.mediaDevices;
    mockCameraSuccess();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '<svg data-qr="1"></svg>' }) as unknown as typeof fetch;
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={vi.fn()} onBack={vi.fn()} setupUrl="http://localhost:5173/setup?session=abc" />);
    expect(await screen.findByText(/pair your phone/i)).toBeTruthy();
    await waitFor(() => expect(document.querySelector('.qr-svg svg')).toBeTruthy());
    expect(screen.getByText(/exam unlocks on its own/i)).toBeTruthy();
    restoreCamera(original);
  });

  it('unlocks automatically when a phone setup photo is detected', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '<svg data-qr="1"></svg>' }) as unknown as typeof fetch;
    const onSetupPhotoCount = vi.fn().mockResolvedValue(1);
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={vi.fn()} onBack={vi.fn()} setupUrl="http://localhost:5173/setup?session=abc" onSetupPhotoCount={onSetupPhotoCount} />);

    expect(screen.queryByLabelText(/your response/i)).toBeNull();
    await waitFor(() => expect(screen.getByLabelText(/your response/i)).toBeTruthy());
    expect(onSetupPhotoCount).toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /take start photo/i })).toBeNull();
  });

  it('shows the captured workspace photos on the review screen after submit', async () => {
    const original = navigator.mediaDevices;
    mockCameraSuccess();
    const onSubmit = vi.fn();
    render(<CandidateExam challenge={challengeLibrary[0]} onSubmit={onSubmit} onBack={vi.fn()} />);
    await passStartGate();

    fireEvent.change(screen.getByLabelText(/your response/i), { target: { value: 'This response is long enough to submit and review.' } });
    fireEvent.click(screen.getByRole('button', { name: /submit work/i }));
    expect(onSubmit).toHaveBeenCalled();

    expect(await screen.findByText(/your captured workspace photos/i)).toBeTruthy();
    expect(document.querySelector('.review-gallery-item img')).toBeTruthy();
    restoreCamera(original);
  });
});
