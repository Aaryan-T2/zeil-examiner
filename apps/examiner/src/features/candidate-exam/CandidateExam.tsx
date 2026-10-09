import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, Clock3, Code2, ShieldCheck } from 'lucide-react';
import type { CandidateSubmission, Challenge, IntegrityEvent } from '../../shared/contracts';
import { fileToJpegDataUrl } from '../../shared/image';

interface CandidateExamProps {
  challenge: Challenge;
  assessing?: boolean;
  submitError?: string;
  onSubmit: (submission: CandidateSubmission, integrityEvents: IntegrityEvent[]) => void | Promise<void>;
  onBack: () => void;
  onFocusEvent?: (event: IntegrityEvent) => void;
  onCameraImage?: (event: IntegrityEvent) => Promise<string>;
  onProctorFrame?: (imageData: string) => Promise<{ flagged: boolean; stop: boolean; note: string; uncertainty: string }>;
  proctorIntervalMs?: number;
}

function CapturedPhotos({ events }: { events: IntegrityEvent[] }) {
  const photos = events.filter((event) => event.imageData);
  if (photos.length === 0) return null;
  return <div className="review-gallery"><h2 className="review-gallery-heading">Your captured workspace photos</h2><div className="review-gallery-grid">{photos.map((event, index) => <figure className="review-gallery-item" key={event.id}><img src={event.imageData} alt={`Workspace photo ${index + 1}`} /><figcaption>{index === 0 ? 'Start setup photo' : `Checkpoint ${index}`} · {new Date(event.occurredAt).toLocaleTimeString()}</figcaption></figure>)}</div><p className="review-gallery-note">These photos were sent to your recruiter as session context. They never affect your task score.</p></div>;
}

export function CandidateExam({ challenge, onSubmit, onBack, onFocusEvent, onCameraImage, onProctorFrame, proctorIntervalMs = 9000, assessing = false, submitError = '' }: CandidateExamProps) {
  const [name, setName] = useState('Jordan Lee');
  const [response, setResponse] = useState('');
  const [startedAt] = useState(() => Date.now());
  const [integrityEvents, setIntegrityEvents] = useState<IntegrityEvent[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [stoppedByProctor, setStoppedByProctor] = useState(false);
  const [consented, setConsented] = useState(false);
  const [examStarted, setExamStarted] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'checking' | 'ready' | 'error'>('idle');
  const [cameraError, setCameraError] = useState('');
  const [checkInCount, setCheckInCount] = useState(0);
  const [pasteBlockedCount, setPasteBlockedCount] = useState(0);
  const [proctorActive, setProctorActive] = useState(false);
  const [proctorUnavailable, setProctorUnavailable] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const proctorVideoRef = useRef<HTMLVideoElement | null>(null);
  const proctorStreamRef = useRef<MediaStream | null>(null);
  const proctorStartedRef = useRef(false);
  const proctorFrameRef = useRef(onProctorFrame);
  proctorFrameRef.current = onProctorFrame;
  const integrityEventsRef = useRef(integrityEvents);
  integrityEventsRef.current = integrityEvents;
  const nameRef = useRef(name);
  nameRef.current = name;
  const responseRef = useRef(response);
  responseRef.current = response;

  const wordCount = useMemo(() => response.trim() ? response.trim().split(/\s+/).length : 0, [response]);
  const submitDisabledReason = assessing ? 'Preparing your assessment…' : response.trim().length < 20 ? `Type at least 20 characters to submit — you have ${wordCount}.` : !name.trim() ? 'Add your name in the sidebar to submit.' : checkInCount === 0 ? 'Capture your start photo before submitting.' : '';

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

  useEffect(() => {
    if (!examStarted || !onProctorFrame || proctorStartedRef.current) return;
    proctorStartedRef.current = true;
    let cancelled = false;
    let timer = 0;
    let inFlight = false;
    let stopped = false;
    const stopStream = () => {
      proctorStreamRef.current?.getTracks().forEach((track) => track.stop());
      proctorStreamRef.current = null;
      setProctorActive(false);
    };
    const schedule = () => {
      timer = window.setTimeout(runTick, proctorIntervalMs + Math.floor(Math.random() * 4000));
    };
    const runTick = async () => {
      if (cancelled || stopped) return;
      if (!inFlight) {
        inFlight = true;
        try {
          const video = proctorVideoRef.current;
          const handler = proctorFrameRef.current;
          if (video && handler && video.videoWidth > 0) {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * 320));
            const context = canvas.getContext('2d');
            if (context) {
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = canvas.toDataURL('image/jpeg', 0.4);
              const result = await handler(imageData);
              if (result.stop && !cancelled) {
                stopped = true;
                window.clearTimeout(timer);
                stopStream();
                const flagEvent: IntegrityEvent = { id: `proctor-${Date.now()}`, occurredAt: new Date().toISOString(), kind: 'proctor-flag', description: `Live session stopped: ${result.note} Uncertainty: ${result.uncertainty} A recruiter will review this flag; it is not an automatic decision.`, reviewRequired: true, imageData };
                const updatedEvents = [...integrityEventsRef.current, flagEvent];
                integrityEventsRef.current = updatedEvents;
                setIntegrityEvents(updatedEvents);
                const submission: CandidateSubmission = {
                  id: `submission-${Date.now()}`,
                  challengeId: challenge.id,
                  candidateName: nameRef.current.trim() || 'Candidate',
                  submittedAt: new Date().toISOString(),
                  response: responseRef.current.trim() || '(exam stopped before a response was completed)',
                };
                setStoppedByProctor(true);
                setSubmitted(true);
                void Promise.resolve(onSubmit(submission, updatedEvents)).catch(() => undefined);
              }
            }
          }
        } catch {
        } finally {
          inFlight = false;
        }
      }
      if (!cancelled && !stopped) schedule();
    };
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      setProctorUnavailable(true);
      return;
    }
    media.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        proctorStreamRef.current = stream;
        setProctorActive(true);
        schedule();
      })
      .catch(() => {
        if (!cancelled) setProctorUnavailable(true);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stopStream();
    };
  }, [examStarted, onProctorFrame, proctorIntervalMs]);

  function registerSetupImage(imageData: string): boolean {
    const readyImageEvent: IntegrityEvent = {
      id: `camera-${Date.now()}`,
      occurredAt: new Date().toISOString(),
      kind: 'camera-check',
      description: 'Start-of-exam workspace photo. The candidate captured their surroundings before the task unlocked; the recruiter reviews this as session context, not a misconduct finding.',
      reviewRequired: true,
      imageData,
    };
    setIntegrityEvents((events) => [...events, readyImageEvent]);
    if (onCameraImage) {
      void onCameraImage(readyImageEvent).then((reviewNote) => {
        setIntegrityEvents((events) => events.map((item) => item.id === readyImageEvent.id ? { ...item, description: reviewNote } : item));
      }).catch(() => undefined);
    }
    setCheckInCount((count) => count + 1);
    setCameraStatus('ready');
    setExamStarted(true);
    return true;
  }

  async function handleFallbackFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !consented || cameraStatus === 'checking') return;
    setCameraStatus('checking');
    setCameraError('');
    try {
      registerSetupImage(await fileToJpegDataUrl(file, 640, 0.45));
    } catch {
      setCameraStatus('error');
      setCameraError('Could not process that photo. Try again to start your exam.');
    }
  }

  async function captureSetupCheck(): Promise<boolean> {
    if (!consented || cameraStatus === 'checking') return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('idle');
      setCameraError('Live camera is unavailable on this connection — choose a photo file to start your exam.');
      fileInputRef.current?.click();
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
      return registerSetupImage(imageData);
    } catch {
      setCameraStatus('error');
      setCameraError('Camera permission is required to start your exam. Allow camera access in your browser, then take the start photo again.');
      return false;
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }

  function submit() {
    if (submitted || assessing || response.trim().length < 20 || response.length > 20_000 || !name.trim() || name.length > 120 || checkInCount === 0) return;
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
    return <main className="candidate-shell"><section className="candidate-complete" aria-live="polite"><span className="complete-mark"><Clock3 size={24} /></span><span className="eyebrow">PREPARING REVIEW</span><h1>Submission received.</h1><p>Your response is being prepared for recruiter review. This summary supports a person’s judgement; it does not make a hiring decision.</p><CapturedPhotos events={integrityEvents} /></section></main>;
  }

  if (submitted && stoppedByProctor) {
    return <main className="candidate-shell"><section className="candidate-complete"><span className="complete-mark"><ShieldCheck size={24} /></span><span className="eyebrow">SESSION FLAGGED FOR REVIEW</span><h1>Session stopped for review</h1><p>Your work was submitted automatically and a live-session flag was sent to your recruiter for human review. This is not a pass or rejection.</p><CapturedPhotos events={integrityEvents} /><button className="button-secondary" onClick={onBack}>Sign out</button></section></main>;
  }

  if (submitted) {
    return <main className="candidate-shell"><section className="candidate-complete"><span className="complete-mark"><Check size={24} /></span><span className="eyebrow">SUBMISSION RECEIVED</span><h1>Thanks, {name.trim().split(' ')[0]}.</h1><p>Your work has been saved for recruiter review. An assessment summary may assist the recruiter, but a person reviews the evidence and makes any hiring decision.</p><CapturedPhotos events={integrityEvents} /><button className="button-secondary" onClick={onBack}>Sign out</button></section></main>;
  }

  const topbar = <header className="candidate-topbar"><button className="candidate-back" onClick={onBack}><ArrowLeft size={16} /> Exit demo</button><div className="candidate-brand"><span className="brand-mark">e</span><span>examiner</span></div><span className="candidate-secure"><ShieldCheck size={14} /> Candidate assessment</span></header>;

  const filePicker = <input ref={fileInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { void handleFallbackFile(event); }} />;

  const proctorVideo = proctorActive ? <video ref={(el) => {
    proctorVideoRef.current = el;
    if (el && proctorStreamRef.current && el.srcObject !== proctorStreamRef.current) {
      try {
        el.srcObject = proctorStreamRef.current;
        const playResult = el.play();
        if (playResult && typeof playResult.catch === 'function') playResult.catch(() => undefined);
      } catch {
      }
    }
  }} className="proctor-preview" muted autoPlay playsInline aria-hidden="true" /> : null;

  if (!examStarted) {
    return <main className="candidate-shell">
      {topbar}
      {filePicker}
      <div className="setup-gate">
        <section className="setup-gate-card">
          <span className="eyebrow">BEFORE YOU BEGIN</span>
          <h1>Set up your workspace check</h1>
          <p className="gate-intro">Your exam unlocks after your first setup photo. The photo shows your recruiter the workspace context for your session — it is captured with your consent, is kept separate from your score, and is never a misconduct finding on its own.</p>
          <ol className="gate-steps">
            <li><strong>Allow camera access</strong>When your browser asks, choose “Allow”.</li>
            <li><strong>Photograph your workspace</strong>Frame your desk and the edge of your screen from where you are sitting. Make sure no other people are visible in the photo.</li>
            <li><strong>Start your exam</strong>As soon as the photo captures, the task unlocks and your timer begins.</li>
          </ol>
          {!consented ? (
            <label className="camera-consent"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /><span>I consent to a setup photo being captured and retained for this demo’s recruiter review.</span></label>
          ) : (
            <div className="camera-check-actions">
              <button className="button-primary" disabled={cameraStatus === 'checking'} onClick={() => { void captureSetupCheck(); }}><Camera size={15} /> {cameraStatus === 'checking' ? 'Capturing…' : 'Take start photo & begin exam'}</button>
              <span>{cameraStatus === 'ready' ? 'Photo captured — starting your exam…' : 'Your exam is locked until the photo is captured.'}</span>
            </div>
          )}
          {cameraError && <p className="camera-error" role="status">{cameraError}</p>}
          <p className="gate-note"><ShieldCheck size={14} /><span>The photo never affects your score. Your work is always reviewed by a person.</span></p>
        </section>
      </div>
    </main>;
  }

  return <main className="candidate-shell">
    {topbar}
    {filePicker}
    <div className="candidate-layout"><section className="candidate-main">{proctorActive && <div className="proctor-live"><span className="proctor-live-badge"><i /> Live session monitored</span><p className="proctor-live-copy">Random frames are checked for workspace rule violations; a recruiter reviews any flag.</p></div>}<div className="candidate-role"><span>SOFTWARE ENGINEERING</span><span>·</span><span>{challenge.difficulty.toUpperCase()}</span></div><h1>{challenge.title}</h1><p className="candidate-intro">{challenge.summary}</p><div className="candidate-meta"><span><Clock3 size={14} /> Suggested time: {challenge.durationMinutes} minutes</span><span><Code2 size={14} /> {challenge.mode === 'debugging' ? 'Debugging work sample' : challenge.mode === 'code-review' ? 'Code review work sample' : 'Technical scenario'}</span></div><section className="candidate-prompt"><div className="candidate-section-title"><span>YOUR TASK</span><span>Read carefully before starting</span></div><div className="candidate-prompt-text">{challenge.prompt}</div></section><label className="candidate-answer-label" htmlFor="candidate-answer"><span>Your response</span><span>Explain your reasoning. Pasting is disabled; type your own response.</span></label><textarea id="candidate-answer" className="candidate-answer" value={response} onPaste={blockPaste} onChange={(event) => setResponse(event.target.value)} placeholder="Write your approach, findings, and how you would verify the solution…" /><div className="answer-footer"><span>{wordCount} words <span>·</span> {pasteBlockedCount} paste attempts blocked.</span><span>Plain text and code supported</span></div>{submitError && <p className="form-error" role="alert">{submitError} Your response is still here; try submit again.</p>}<div className="submit-row"><button className="button-primary candidate-submit" disabled={response.trim().length < 20 || !name.trim() || checkInCount === 0 || assessing} onClick={submit}>{assessing ? 'Preparing assessment…' : 'Submit work'} <ArrowLeft className="submit-arrow" size={15} /></button>{submitDisabledReason && <p className="submit-hint" role="status">{submitDisabledReason}</p>}</div><p className="candidate-submit-note">Submitting creates a structured review for the recruiter. No automatic pass or rejection.</p></section><aside className="candidate-aside"><div className="candidate-aside-card"><span className="aside-eyebrow">WHAT WE’RE LOOKING FOR</span><h2>Show us how you think.</h2><p>There may be more than one good answer. Explain what you notice, what you would do, and why.</p><div className="aside-skills">{challenge.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></div><div className="candidate-aside-card candidate-privacy"><ShieldCheck size={17} /><strong>Your work is reviewed by a person.</strong><p>Assessment scores are evidence to consider—not a hiring decision. Any session events are shown separately and do not affect your score.</p></div>{proctorUnavailable && <p className="proctor-unavailable" role="status">Live monitoring is unavailable on this connection — your exam continues normally.</p>}<label className="candidate-name-label" htmlFor="candidate-name">Demo candidate name<input id="candidate-name" value={name} onChange={(event) => setName(event.target.value)} /></label><div className="candidate-time-note">Started {Math.max(0, Math.round((Date.now() - startedAt) / 60000))} minutes ago · <span data-testid="check-count">{checkInCount} captured</span></div></aside></div>
    {proctorVideo}
  </main>;
}
