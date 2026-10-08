import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Clock3, Code2, ShieldCheck } from 'lucide-react';
import type { CandidateSubmission, Challenge, IntegrityEvent } from '../../shared/contracts';

interface CandidateExamProps {
  challenge: Challenge;
  assessing?: boolean;
  submitError?: string;
  onSubmit: (submission: CandidateSubmission, integrityEvents: IntegrityEvent[]) => void | Promise<void>;
  onBack: () => void;
  onFocusEvent?: (event: IntegrityEvent) => void;
  onCameraImage?: (event: IntegrityEvent) => Promise<string>;
}

export function CandidateExam({ challenge, onSubmit, onBack, onFocusEvent, onCameraImage, assessing = false, submitError = '' }: CandidateExamProps) {
  const [name, setName] = useState('Jordan Lee');
  const [response, setResponse] = useState('');
  const [startedAt] = useState(() => Date.now());
  const [integrityEvents, setIntegrityEvents] = useState<IntegrityEvent[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [consented, setConsented] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'checking' | 'ready' | 'error'>('idle');
  const [cameraError, setCameraError] = useState('');
  const [checkInCount, setCheckInCount] = useState(0);
  const [pasteBlockedCount, setPasteBlockedCount] = useState(0);
  const [checkout, setCheckout] = useState(false);
  const [nextCheckpointAt, setNextCheckpointAt] = useState(0);

  const wordCount = useMemo(() => response.trim() ? response.trim().split(/\s+/).length : 0, [response]);

  useEffect(() => {
    const handleBlur = () => {
      const event: IntegrityEvent = {
        id: `event-${Date.now()}`,
        occurredAt: new Date().toISOString(),
        kind: 'focus-lost',
        description: 'The assessment page moved out of focus. This signal is uncertain, is separate from the task score, and requires human review.',
        reviewRequired: true,
      };
      setIntegrityEvents((events) => [...events, event]);
      onFocusEvent?.(event);
    };
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', handleBlur);
    };
  }, [onFocusEvent]);

  async function captureSetupCheck(): Promise<boolean> {
    if (!consented || cameraStatus === 'checking') return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('error');
      setCameraError('Camera capture is not available in this browser context. You can continue without camera checks.');
      return false;
    }
    setCameraStatus('checking');
    setCameraError('');
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Camera preview timed out.')), 5000);
        video.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(); };
        video.onerror = () => { window.clearTimeout(timeout); reject(new Error('Camera preview unavailable.')); };
      });
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(640, video.videoWidth || 640);
      canvas.height = Math.min(480, video.videoHeight || 480);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to capture setup image.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = await new Promise<string>((resolve, reject) => canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Unable to encode setup image.')); return; }
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read setup image.'));
        reader.onerror = () => reject(new Error('Unable to read setup image.'));
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.48));
      let description = checkInCount === 0
        ? 'Candidate captured their surrounding setup at assessment start. The image is retained in this browser for recruiter review; it is not a finding of misconduct.'
        : 'Candidate captured their setup at a task checkpoint. Compare context only; a visual difference is not proof of outside assistance.';
      const imageEvent: IntegrityEvent = {
        id: `camera-${Date.now()}`,
        occurredAt: new Date().toISOString(),
        kind: 'camera-check',
        description,
        reviewRequired: true,
        imageData,
      };
      const readyImageEvent = { ...imageEvent, description };
      setIntegrityEvents((events) => [...events, readyImageEvent]);
      if (onCameraImage) {
        void onCameraImage(readyImageEvent).then((reviewNote) => {
          setIntegrityEvents((events) => events.map((item) => item.id === readyImageEvent.id ? { ...item, description: reviewNote } : item));
        }).catch(() => undefined);
      }
      setCheckInCount((count) => count + 1);
      setNextCheckpointAt(Date.now() + Math.max(5, Math.round(challenge.durationMinutes / 2)) * 60_000);
      setCameraStatus('ready');
      setCheckout(false);
      return true;
    } catch {
      setCameraStatus('error');
      setCameraError('Camera permission was unavailable or capture failed. Continue without a camera check; your score will not be affected.');
      return false;
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }

  useEffect(() => {
    if (!consented || checkInCount === 0 || submitted || checkout) return;
    const remaining = Math.max(0, nextCheckpointAt - Date.now());
    const timeout = window.setTimeout(() => setCheckout(true), remaining);
    return () => window.clearTimeout(timeout);
  }, [consented, checkInCount, nextCheckpointAt, submitted, checkout]);

  function submit() {
    if (submitted || assessing || response.trim().length < 20 || response.length > 20_000 || !name.trim() || name.length > 120 || (consented && checkInCount === 0)) return;
    const submission: CandidateSubmission = {
      id: `submission-${Date.now()}`,
      challengeId: challenge.id,
      candidateName: name.trim(),
      submittedAt: new Date().toISOString(),
      response: response.trim(),
    };
    setSubmitted(true);
    const pasteEvents = pasteBlockedCount > 0 ? [{ id: `paste-summary-${Date.now()}`, occurredAt: new Date().toISOString(), kind: 'paste-blocked' as const, description: `${pasteBlockedCount} paste attempt${pasteBlockedCount === 1 ? '' : 's'} blocked. This is a session signal, not proof of misconduct.`, reviewRequired: true }] : [];
    void Promise.resolve(onSubmit(submission, [...integrityEvents, ...pasteEvents])).catch(() => {
      setSubmitted(false);
    });
  }

  function blockPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    const nextCount = pasteBlockedCount + 1;
    setPasteBlockedCount(nextCount);
    const signal: IntegrityEvent = {
      id: `paste-${Date.now()}`,
      occurredAt: new Date().toISOString(),
      kind: 'paste-blocked',
      description: 'A paste action was blocked in the response field. This signal is not proof of outside assistance.',
      reviewRequired: true,
    };
    setIntegrityEvents((events) => [...events, signal]);
    onFocusEvent?.(signal);
  }

  if (submitted && assessing) {
    return <main className="candidate-shell"><section className="candidate-complete" aria-live="polite"><span className="complete-mark"><Clock3 size={24} /></span><span className="eyebrow">PREPARING REVIEW</span><h1>Submission received.</h1><p>Your response is being prepared for recruiter review. This summary supports a person’s judgement; it does not make a hiring decision.</p></section></main>;
  }

  if (submitted) {
    return <main className="candidate-shell"><section className="candidate-complete"><span className="complete-mark"><Check size={24} /></span><span className="eyebrow">SUBMISSION RECEIVED</span><h1>Thanks, {name.trim().split(' ')[0]}.</h1><p>Your work has been saved for recruiter review. An assessment summary may assist the recruiter, but a person reviews the evidence and makes any hiring decision.</p><button className="button-secondary" onClick={onBack}>Sign out</button></section></main>;
  }

  return <main className="candidate-shell">
    <header className="candidate-topbar"><button className="candidate-back" onClick={onBack}><ArrowLeft size={16} /> Exit demo</button><div className="candidate-brand"><span className="brand-mark">e</span><span>examiner</span></div><span className="candidate-secure"><ShieldCheck size={14} /> Candidate assessment</span></header>
    <div className="candidate-layout"><section className="candidate-main"><div className="candidate-role"><span>SOFTWARE ENGINEERING</span><span>·</span><span>{challenge.difficulty.toUpperCase()}</span></div><h1>{challenge.title}</h1><p className="candidate-intro">{challenge.summary}</p><div className="candidate-meta"><span><Clock3 size={14} /> Suggested time: {challenge.durationMinutes} minutes</span><span><Code2 size={14} /> {challenge.mode === 'debugging' ? 'Debugging work sample' : challenge.mode === 'code-review' ? 'Code review work sample' : 'Technical scenario'}</span></div><section className="candidate-prompt"><div className="candidate-section-title"><span>YOUR TASK</span><span>Read carefully before starting</span></div><div className="candidate-prompt-text">{challenge.prompt}</div></section><label className="candidate-answer-label" htmlFor="candidate-answer"><span>Your response</span><span>Explain your reasoning. Pasting is disabled; type your own response.</span></label><textarea id="candidate-answer" className="candidate-answer" value={response} onPaste={blockPaste} onChange={(event) => setResponse(event.target.value)} placeholder="Write your approach, findings, and how you would verify the solution…" /><div className="answer-footer"><span>{wordCount} words <span>·</span> {pasteBlockedCount} paste attempts blocked.</span><span>Plain text and code supported</span></div>{submitError && <p className="form-error" role="alert">{submitError} Your response is still here; try submit again.</p>}<div className="camera-check-card"><div className="camera-check-copy"><span className="aside-eyebrow">OPTIONAL PHONE SETUP CHECK</span><strong>Pair your phone and show the workspace</strong><p>Scan a QR code with your phone to capture setup images at the start and task checkpoints. With consent, Gemini writes neutral notes about visible objects. The recruiter sees these separately from your task score; notes are not proof of cheating.</p></div>{!consented ? <label className="camera-consent"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /><span>I consent to setup images being captured and retained for this demo’s recruiter review.</span></label> : <div className="camera-check-actions"><button className="button-secondary" onClick={captureSetupCheck}>{cameraStatus === 'checking' ? 'Capturing…' : checkInCount === 0 ? 'Capture start setup' : 'Capture checkpoint'}</button><span>{cameraStatus === 'ready' ? `Captured ${checkInCount} check${checkInCount === 1 ? '' : 's'}` : cameraError || 'Camera is off until you choose to capture.'}</span></div>}{cameraError && <p className="camera-error" role="status">{cameraError}</p>}</div>{checkout && <div className="checkpoint-paused" role="dialog" aria-modal="true" aria-label="Assessment checkpoint"><div><span className="aside-eyebrow">TASK CHECKPOINT</span><strong>Pause and confirm your setup</strong><p>Your task is paused until you take a setup image or choose to continue without it. This is a review signal, not a misconduct finding.</p><button className="button-secondary" onClick={captureSetupCheck}>Capture checkpoint now</button><button className="checkpoint-continue" onClick={() => setCheckout(false)}>Continue without camera</button></div></div>}<button className="button-primary candidate-submit" disabled={response.trim().length < 20 || !name.trim() || (consented && checkInCount === 0) || assessing} onClick={submit}>{assessing ? 'Preparing assessment…' : 'Submit work'} <ArrowLeft className="submit-arrow" size={15} /></button><p className="candidate-submit-note">Submitting creates a structured review for the recruiter. No automatic pass or rejection.</p></section><aside className="candidate-aside"><div className="candidate-aside-card"><span className="aside-eyebrow">WHAT WE’RE LOOKING FOR</span><h2>Show us how you think.</h2><p>There may be more than one good answer. Explain what you notice, what you would do, and why.</p><div className="aside-skills">{challenge.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div><div className="candidate-aside-card candidate-privacy"><ShieldCheck size={17} /><strong>Your work is reviewed by a person.</strong><p>Assessment scores are evidence to consider—not a hiring decision. Any session events are shown separately and do not affect your score.</p></div><label className="candidate-name-label" htmlFor="candidate-name">Demo candidate name<input id="candidate-name" value={name} onChange={(event) => setName(event.target.value)} /></label><div className="candidate-time-note">Started {Math.max(0, Math.round((Date.now() - startedAt) / 60000))} minutes ago</div></aside></div>
  </main>;
}
