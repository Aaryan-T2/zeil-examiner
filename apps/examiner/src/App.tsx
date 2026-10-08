import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, Bell, BookOpen, BriefcaseBusiness, Check, ChevronDown, CircleHelp, Clock3, Code2, FilePlus2, Filter, Layers3, MoreHorizontal, Plus, QrCode, Search, Settings2, ShieldCheck, Sparkles, UsersRound, X } from 'lucide-react';
import type { Challenge, IntegrityEvent, RubricCriterion } from './shared/contracts';
import { validateAssessment, validateChallenge, validateSubmission } from './shared/contracts';
import { challengeLibrary } from './shared/challenge-library';
import type { AssessmentBundle } from './shared/assessment';
import { createAssessmentStore } from './shared/assessment';
import type { Assessment } from './shared/contracts';
import { loadChallenges, loadInvites, persistChallenge, removeInvite, saveInvite, saveSubmission } from './shared/persistence';
import { assessSubmissionWithGemini } from './shared/gemini-assessment';
import { CandidateExam } from './features/candidate-exam/CandidateExam';
import { ReviewReport } from './features/review-report/ReviewReport';
import { authenticateDemoUser } from './shared/auth';
import type { UserRole } from './shared/auth';

async function createQrSvg(text: string): Promise<string> {
  try {
    const response = await fetch(`https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=220&format=svg`);
    return response.ok ? await response.text() : '';
  } catch { return ''; }
}

type SourceFilter = 'all' | 'library' | 'ai-draft' | 'custom';
type Route = 'recruiter' | 'candidate' | 'review';
const blankChallenge: Challenge = {
  id: 'custom-' + Math.random().toString(36).slice(2, 8),
  title: '',
  role: 'Software Engineer',
  department: 'Engineering',
  mode: 'technical-scenario',
  difficulty: 'Intermediate',
  durationMinutes: 25,
  summary: '',
  prompt: '',
  skills: [],
  rubric: [{ id: 'criterion-1', name: '', description: '', maxPoints: 4 }],
  source: 'custom',
};

function modeLabel(mode: Challenge['mode']) {
  if (mode === 'debugging') return 'Debugging';
  if (mode === 'code-review') return 'Code review';
  return 'Technical scenario';
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const candidatePath = window.location.pathname.replace(/\/+$/, '') === '/candidate';
  const setupPath = window.location.pathname.replace(/\/+$/, '') === '/setup';
  const requestedRole: UserRole = candidatePath || params.get('role') === 'candidate' ? 'candidate' : 'recruiter';
  const [activeUser, setActiveUser] = useState<{ role: UserRole; displayName: string } | null>(() => {
    try {
      const saved = sessionStorage.getItem('examiner.demo-session');
      if (!saved) return null;
      const parsed = JSON.parse(saved) as { role: UserRole; displayName: string };
      return parsed && (parsed.role === 'recruiter' || parsed.role === 'candidate') ? parsed : null;
    } catch { return null; }
  });
  const [loginRole, setLoginRole] = useState<UserRole>(requestedRole);
  const [loginEmail, setLoginEmail] = useState(requestedRole === 'recruiter' ? 'recruiter@examiner.demo' : 'candidate@examiner.demo');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [challenges, setChallenges] = useState(loadChallenges);
  const [selectedId, setSelectedId] = useState(challengeLibrary[0].id);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [editing, setEditing] = useState<Challenge | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [route, setRoute] = useState<Route>('recruiter');
  const [assessmentRows, setAssessmentRows] = useState<AssessmentBundle[]>(() => createAssessmentStore().list());
  const [showPhoneLinks, setShowPhoneLinks] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [candidateChallengeId, setCandidateChallengeId] = useState<string | null>(null);
  const [candidateSessionId, setCandidateSessionId] = useState<string | null>(null);
  const [candidateSessionToken, setCandidateSessionToken] = useState<string | null>(null);
  const [candidateReady, setCandidateReady] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [serverSubmissions, setServerSubmissions] = useState<AssessmentBundle[]>([]);
  const [setupImage, setSetupImage] = useState('');
  const [setupConsent, setSetupConsent] = useState(false);
  const [setupStatus, setSetupStatus] = useState('');
  const [phoneUrl, setPhoneUrl] = useState('');
  const [phoneQrSvg, setPhoneQrSvg] = useState('');

  useEffect(() => {
    if (activeUser?.role !== 'recruiter') return;
    let active = true;
    void fetch('/api/recruiter/submissions').then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { submissions?: Array<AssessmentBundle & { reviewStatus?: 'needs-review' | 'reviewed' }> };
      if (active && Array.isArray(result.submissions)) setServerSubmissions(result.submissions);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [activeUser, route]);

  const selected = challenges.find((challenge) => challenge.id === selectedId) ?? challenges[0];
  const filteredChallenges = useMemo(() => challenges.filter((challenge) => {
    const matchesQuery = `${challenge.title} ${challenge.summary} ${challenge.skills.join(' ')}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (filter === 'all' || challenge.source === filter);
  }), [challenges, filter, query]);

  const selectedAssessment = [...assessmentRows, ...serverSubmissions].find((row) => row.submission.id === selectedSubmissionId) ?? assessmentRows[0] ?? serverSubmissions[0];
  const allAssessmentRows = [...assessmentRows];
  for (const row of serverSubmissions) {
    if (!allAssessmentRows.some((existing) => existing.submission.id === row.submission.id)) allAssessmentRows.unshift(row);
  }

  function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const authenticated = authenticateDemoUser(loginRole, loginEmail, loginPassword);
    if (!authenticated) {
      setLoginError('Email or password did not match this demo account.');
      return;
    }
    const user = { role: loginRole, displayName: authenticated.displayName };
    sessionStorage.setItem('examiner.demo-session', JSON.stringify(user));
    setActiveUser(user);
    setLoginError('');
    if (loginRole === 'candidate' && candidatePath) {
      void loadCandidateInvite().then((ok) => {
        if (!ok) {
          setLoginError('This invitation is unavailable in this browser. Ask the recruiter to create a new one here.');
          setActiveUser(null);
          sessionStorage.removeItem('examiner.demo-session');
        } else setRoute('candidate');
      });
    } else if (loginRole === 'candidate' && params.get('session')) {
      const sessionId = params.get('session') ?? '';
      const token = params.get('token') ?? '';
      void fetch(`/api/assessment-sessions/${encodeURIComponent(sessionId)}`, { headers: { 'x-candidate-token': token } }).then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { challenge?: Challenge };
        const challenge = data.challenge;
        if (challenge && validateChallenge(challenge).length === 0) {
          setCandidateSessionId(sessionId);
          setCandidateSessionToken(token);
          setCandidateChallengeId(challenge.id);
          setRoute('candidate');
        }
      }).catch(() => undefined);
    } else if (loginRole === 'candidate' && params.get('challenge')) {
      const challenge = [...loadChallenges(), ...challengeLibrary].find((item) => item.id === params.get('challenge'));
      if (challenge) {
        setCandidateChallengeId(challenge.id);
        setRoute('candidate');
      }
    }
  }

  function signOut() {
    if (candidateSessionId && loadInvites().some((invite) => invite.sessionId === candidateSessionId)) removeInvite(candidateSessionId);
    sessionStorage.removeItem('examiner.demo-session');
    setActiveUser(null);
    setRoute('recruiter');
    setLoginRole('recruiter');
    setLoginEmail('recruiter@examiner.demo');
    setLoginPassword('');
    setCandidateChallengeId(null);
    setCandidateSessionId(null);
    setCandidateSessionToken(null);
  }

  if (!activeUser) {
    return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-mark">e</span><span>examiner</span><span className="brand-beta">DEMO</span></div><span className="eyebrow">ASSESSMENT WORKSPACE</span><h1>{candidatePath ? 'Candidate invitation' : 'Sign in to continue'}</h1><p className="auth-intro">{candidatePath ? 'Sign in with your candidate test account to open the assigned work sample.' : 'Recruiter and candidate sign-ins open separate demo views.'}</p><div className="auth-roles" role="tablist" aria-label="Sign-in role"><button className={loginRole === 'recruiter' ? 'auth-role active' : 'auth-role'} role="tab" aria-selected={loginRole === 'recruiter'} onClick={() => { setLoginRole('recruiter'); setLoginEmail('recruiter@examiner.demo'); setLoginPassword(''); setLoginError(''); }}>Recruiter</button><button className={loginRole === 'candidate' ? 'auth-role active' : 'auth-role'} role="tab" aria-selected={loginRole === 'candidate'} onClick={() => { setLoginRole('candidate'); setLoginEmail('candidate@examiner.demo'); setLoginPassword(''); setLoginError(''); }}>Candidate</button></div><form className="auth-form" onSubmit={signIn}><label>Email<input type="email" autoComplete="username" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required /></label>{loginError && <p className="form-error" role="alert">{loginError}</p>}<button className="button-primary auth-submit" type="submit">Sign in as {loginRole}</button></form><div className="demo-credentials"><strong>Demo-only test login</strong><span>{loginRole === 'recruiter' ? 'recruiter@examiner.demo' : 'candidate@examiner.demo'}</span><code>{loginRole === 'recruiter' ? 'RecruiterDemo2026!' : 'CandidateDemo2026!'}</code></div><p className="auth-disclaimer">These are public prototype credentials, not real user accounts. Do not use them for real candidate data.</p></section></main>;
  }

  if (setupPath) {
    const sessionId = params.get('session') ?? '';
    async function capturePhoneSetup() {
      if (!setupConsent || !navigator.mediaDevices?.getUserMedia) { setSetupStatus('Consent and a camera-capable browser are required.'); return; }
      let stream: MediaStream | undefined;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const video = document.createElement('video'); video.srcObject = stream; video.muted = true; video.playsInline = true;
        await new Promise<void>((resolve, reject) => { const timeout = window.setTimeout(() => reject(new Error('Camera preview timed out.')), 5000); video.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(); }; video.onerror = () => { window.clearTimeout(timeout); reject(new Error('Camera unavailable.')); }; });
        await video.play();
        const canvas = document.createElement('canvas'); canvas.width = Math.min(640, video.videoWidth || 640); canvas.height = Math.min(480, video.videoHeight || 480);
        const context = canvas.getContext('2d'); if (!context) throw new Error('Could not capture image.');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = await new Promise<string>((resolve, reject) => canvas.toBlob((blob) => { if (!blob) { reject(new Error('Could not encode image.')); return; } const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read image.')); reader.onerror = () => reject(new Error('Could not read image.')); reader.readAsDataURL(blob); }, 'image/jpeg', .45));
        const response = await fetch('/api/setup-check', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(candidateSessionToken ? { 'x-candidate-token': candidateSessionToken } : {}) }, body: JSON.stringify({ sessionId, imageData: image, consented: true }) });
        if (!response.ok) throw new Error('Could not save this setup check. Return to the invite and ask the recruiter to create a fresh QR.');
        const result = await response.json() as { note?: { note?: string; observations?: string[]; uncertainty?: string }; event?: IntegrityEvent };
        setSetupImage(image);
        setSetupStatus(`${result.note?.note ?? 'Setup captured.'} ${result.note?.observations?.join('; ') ?? ''} ${result.note?.uncertainty ?? 'Recruiter review recommended.'}`);
        const invite = loadInvites().find((item) => item.sessionId === sessionId);
        if (invite && result.event) saveInvite({ ...invite, integrityEvents: [...(invite.integrityEvents ?? []), result.event] });
      } catch (error) { setSetupStatus(error instanceof Error ? error.message : 'Camera capture failed.'); }
      finally { stream?.getTracks().forEach((track) => track.stop()); }
    }
    return <main className="auth-shell"><section className="auth-card setup-phone-card"><div className="auth-brand"><span className="brand-mark">e</span><span>examiner</span></div><span className="eyebrow">PHONE SETUP CHECKPOINT</span><h1>Show your workspace</h1><p className="auth-intro">With your consent, this photo is sent to Gemini for a neutral visible-object note and shown to the recruiter as context. It cannot prove cheating and does not change your assessment score.</p><label className="camera-consent"><input type="checkbox" checked={setupConsent} onChange={(event) => setSetupConsent(event.target.checked)} /><span>I consent to capture, Gemini description, and recruiter review of this setup image.</span></label><button className="button-primary auth-submit" disabled={!setupConsent} onClick={capturePhoneSetup}>Capture setup photo</button>{setupImage && <img className="setup-preview" src={setupImage} alt="Candidate setup submitted for recruiter review" />}<p role="status" className="setup-status">{setupStatus}</p></section></main>;
  }

  if (setupPath) {
    const sessionId = params.get('session') ?? '';
    async function capturePhoneSetup() {
      if (!setupConsent || !navigator.mediaDevices?.getUserMedia) { setSetupStatus('Consent and a camera-capable browser are required.'); return; }
      let stream: MediaStream | undefined;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const video = document.createElement('video');
        video.srcObject = stream; video.muted = true; video.playsInline = true;
        await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('Camera unavailable')); });
        await video.play();
        const canvas = document.createElement('canvas'); canvas.width = Math.min(640, video.videoWidth || 640); canvas.height = Math.min(480, video.videoHeight || 480);
        const context = canvas.getContext('2d'); if (!context) throw new Error('Could not capture image');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = await new Promise<string>((resolve, reject) => canvas.toBlob((blob) => { if (!blob) { reject(new Error('Could not encode image')); return; } const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read image')); reader.onerror = () => reject(new Error('Could not read image')); reader.readAsDataURL(blob); }, 'image/jpeg', 0.45));
      const response = await fetch('/api/setup-check', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(candidateSessionToken ? { 'x-candidate-token': candidateSessionToken } : {}) }, body: JSON.stringify({ sessionId, imageData: image, consented: true }) });
      if (!response.ok) throw new Error('Setup note could not be saved; check the active invite and try again.');
        setSetupImage(image);
        const checked = await response.json() as { note?: { note?: string; observations?: string[]; uncertainty?: string }; event?: IntegrityEvent };
        const description = `${checked.note?.note ?? 'Setup image captured.'} ${checked.note?.observations?.join('; ') ?? ''} ${checked.note?.uncertainty ?? 'Human review required.'}`;
        setSetupStatus(description);
        const invited = loadInvites().find((item) => item.sessionId === sessionId);
        if (invited && checked.event) saveInvite({ ...invited, integrityEvents: [...(invited.integrityEvents ?? []), { ...checked.event, imageData: image, description }] });
      } catch (error) { setSetupStatus(error instanceof Error ? error.message : 'Camera capture failed.'); }
      finally { stream?.getTracks().forEach((track) => track.stop()); }
    }
    return <main className="auth-shell"><section className="auth-card setup-phone-card"><div className="auth-brand"><span className="brand-mark">e</span><span>examiner</span></div><span className="eyebrow">PHONE SETUP CHECKPOINT</span><h1>Show your workspace</h1><p className="auth-intro">This image is sent to Gemini for a neutral description and shown to the recruiter as review context. It does not affect your task score and cannot prove cheating.</p><label className="camera-consent"><input type="checkbox" checked={setupConsent} onChange={(event) => setSetupConsent(event.target.checked)} /><span>I consent to capture, Gemini description, and recruiter review for this assessment.</span></label><button className="button-primary auth-submit" disabled={!setupConsent} onClick={capturePhoneSetup}>Capture setup photo</button>{setupImage && <img className="setup-preview" src={setupImage} alt="Your captured setup preview" />}<p role="status" className="setup-status">{setupStatus}</p></section></main>;
  }


  function beginCandidateFlow(_challenge: Challenge) {
    void startAssessmentSession().then((created) => {
      if (!created) {
        window.alert('Could not create an invite right now. Start the API with `npm run api`, then try again.');
      } else {
        setCandidateReady(true);
      }
    });
  }

  function createPhoneLink() {
    if (!phoneUrl) { setShowPhoneLinks(false); return; }
    setShowPhoneLinks(true);
  }

  async function startAssessmentSession(): Promise<boolean> {
    const selectedChallengeId = selected.id;
    try {
      const response = await fetch('/api/assessment-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(candidateSessionToken ? { 'x-candidate-token': candidateSessionToken } : {}) },
        body: JSON.stringify({ challengeId: selectedChallengeId }),
      });
      if (!response.ok) return false;
      const result = await response.json() as { sessionId?: string; candidateToken?: string; challenge?: Challenge };
      if (!result.sessionId || !result.candidateToken || !result.challenge) return false;
      const inviteUrlValue = `${window.location.origin}/candidate?session=${encodeURIComponent(result.sessionId)}`;
      const phoneUrlValue = `${window.location.origin}/setup?session=${encodeURIComponent(result.sessionId)}`;
      setPhoneUrl(phoneUrlValue);
      setPhoneQrSvg(await createQrSvg(phoneUrlValue));
      try {
        saveInvite({ sessionId: result.sessionId, challenge: result.challenge, inviteUrl: inviteUrlValue, createdAt: new Date().toISOString(), phoneUrl: phoneUrlValue, token: result.candidateToken });
      } catch { return false; }
      setInviteUrl(inviteUrlValue);
      setCandidateSessionId(result.sessionId);
      setCandidateSessionToken(result.candidateToken);
      setCandidateChallengeId(result.challenge.id);
      return true;
    } catch { return false; }
  }

  async function loadCandidateInvite(): Promise<boolean> {
    const sessionId = params.get('session') ?? '';
    if (!sessionId) return false;
    try {
      const token = findInviteToken(sessionId);
      if (!token) return false;
      const response = await fetch(`/api/assessment-sessions/${encodeURIComponent(sessionId)}`, { headers: { 'x-candidate-token': token } });
      if (!response.ok) return false;
      const data = await response.json() as { challenge?: Challenge };
      const challenge = data.challenge;
      if (!challenge || validateChallenge(challenge).length > 0) return false;
      setCandidateSessionId(sessionId);
      setCandidateSessionToken(token);
      setCandidateChallengeId(challenge.id);
      setLoginRole('candidate');
      setLoginEmail('candidate@examiner.demo');
      return true;
    } catch { return false; }
  }

  function findInviteToken(sessionId: string): string | null {
    try {
      const invites = JSON.parse(localStorage.getItem('examiner.demo-invites.v1') ?? '[]') as Array<{ sessionId: string; token?: string }>;
      return invites.find((invite) => invite.sessionId === sessionId)?.token ?? null;
    } catch { return null; }
  }

  async function receiveCandidateSubmission(submission: import('./shared/contracts').CandidateSubmission, integrityEvents: import('./shared/contracts').IntegrityEvent[]) {
    const challenge = challenges.find((item) => item.id === submission.challengeId) ?? challengeLibrary.find((item) => item.id === submission.challengeId) ?? challenges[0];
    if (validateSubmission(submission, challenge).length > 0) {
      window.alert(validateSubmission(submission, challenge)[0]);
      return;
    }
    setIsAssessing(true);
    let bundle: AssessmentBundle;
    let assessment: Assessment;
    assessment = await assessSubmissionWithGemini(challenge, submission);
    const inviteRecord = candidateSessionId ? loadInvites().find((invite) => invite.sessionId === candidateSessionId) : undefined;
    const allIntegrityEvents = [...integrityEvents, ...(inviteRecord?.integrityEvents ?? [])];
    try {
      if (candidateSessionId) {
        const activeSession = await fetch(`/api/assessment-sessions/${encodeURIComponent(candidateSessionId)}`);
        if (!activeSession.ok) throw new Error('Candidate invitation expired. Ask the recruiter for a new invite.');
      }
      const result = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge, submission, integrityEvents: allIntegrityEvents, ...(candidateSessionId ? { sessionId: candidateSessionId } : {}) }),
      });
      if (result.ok) {
        const payload = await result.json() as { assessment?: Assessment };
        if (payload.assessment && validateAssessment(payload.assessment, submission, challenge).length === 0) assessment = payload.assessment;
      }
    } catch { /* local deterministic fallback remains available when the API is offline */ }
    bundle = { challenge, submission, assessment, integrityEvents: allIntegrityEvents };
    try {
      saveSubmission(bundle);
    } catch (saveError) {
      window.alert(saveError instanceof Error ? saveError.message : 'Unable to save this assessment.');
      setIsAssessing(false);
      return;
    }
    setIsAssessing(false);
    setAssessmentRows(createAssessmentStore().list());
    setSelectedSubmissionId(submission.id);
    setRoute('review');
  }

  function changeReviewStatus(status: 'needs-review' | 'reviewed') {
    if (!selectedAssessment) return;
    const store = createAssessmentStore();
    store.save({ ...selectedAssessment, reviewStatus: status });
    setAssessmentRows(store.list());
    if (selectedSubmissionId) {
      void fetch(`/api/recruiter/submissions/${encodeURIComponent(selectedSubmissionId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewStatus: status }) });
      setServerSubmissions((rows) => rows.map((row) => row.submission.id === selectedSubmissionId ? { ...row, reviewStatus: status } : row));
    }
  }

  if (route === 'candidate' && candidateChallengeId) {
    const examChallenge = challenges.find((challenge) => challenge.id === candidateChallengeId) ?? challengeLibrary.find((challenge) => challenge.id === candidateChallengeId) ?? challenges[0];
    return <CandidateExam challenge={examChallenge} assessing={isAssessing} onBack={signOut} onCameraImage={async (event) => {
      const response = await fetch('/api/setup-check', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(candidateSessionToken ? { 'x-candidate-token': candidateSessionToken } : {}) }, body: JSON.stringify({ imageData: event.imageData, consented: true, sessionId: candidateSessionId }) });
      if (!response.ok) return `${event.description} Gemini image notes unavailable; recruiter should inspect the image directly.`;
      const result = await response.json() as { note?: { note?: string; observations?: string[]; uncertainty?: string }; event?: IntegrityEvent };
      const note = result.note;
      const description = `${event.description} AI notes: ${note?.note ?? 'No note returned.'} ${note?.observations?.length ? `Visible: ${note.observations.join('; ')}.` : ''} Uncertainty: ${note?.uncertainty ?? 'Requires human review.'}`;
      return description;
    }} onSubmit={receiveCandidateSubmission} />;
  }

  if (activeUser.role === 'candidate' && candidateChallengeId === null) {
    return <main className="candidate-shell"><section className="candidate-complete"><span className="eyebrow">CANDIDATE INVITATION</span><h1>Invitation required.</h1><p>Sign in from the invitation URL provided by your recruiter to open the assigned work sample.</p><button className="button-secondary" onClick={signOut}>Sign out</button></section></main>;
  }

  if (activeUser.role !== 'recruiter') return null;

  if (route === 'review' && selectedAssessment) {
    return <ReviewReport bundle={selectedAssessment} onBack={() => setRoute('recruiter')} reviewStatus={selectedAssessment.reviewStatus ?? 'needs-review'} onReviewChange={changeReviewStatus} />;
  }

  function saveChallenge() {
    if (!editing) return;
    const issues = validateChallenge(editing);
    if (issues.length > 0) {
      setError(issues[0]);
      return;
    }
    try {
      persistChallenge(editing);
      setChallenges(loadChallenges());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the challenge.');
      return;
    }
    setSelectedId(editing.id);
    setEditing(null);
    setError('');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2600);
  }

  function addCriterion() {
    if (!editing) return;
    const next: RubricCriterion = { id: `criterion-${Date.now()}`, name: '', description: '', maxPoints: 3 };
    setEditing({ ...editing, rubric: [...editing.rubric, next] });
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-lockup"><span className="brand-mark">e</span><span>examiner</span><span className="brand-beta">BETA</span></div>
        <button className="workspace-switch"><span className="workspace-avatar">N</span><span className="workspace-copy"><strong>Northstar Labs</strong><small>Recruiting team</small></span><ChevronDown size={15} /></button>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className="nav-item"><Layers3 size={17} /> Overview</button>
          <button className="nav-item"><UsersRound size={17} /> Candidates <span className="nav-count">12</span></button>
          <button className="nav-item nav-active"><BookOpen size={17} /> Assessments</button>
          <button className="nav-item"><BriefcaseBusiness size={17} /> Roles</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-callout"><div className="callout-icon"><ShieldCheck size={17} /></div><strong>People stay in control.</strong><p>Every assessment is evidence for a recruiter to review—not a hiring decision.</p><a href="#principles">Our principles <ArrowUpRight size={13} /></a></div>
        <button className="nav-item bottom-nav"><Settings2 size={17} /> Settings</button>
        <div className="account-row"><div className="user-avatar">AT</div><div className="account-copy"><strong>Aarya T.</strong><small>Workspace admin</small></div><MoreHorizontal size={18} /></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>Assessments</strong></div><div className="topbar-actions"><span className="environment-badge"><span /> Demo workspace</span><button className="icon-button" aria-label="Help"><CircleHelp size={18} /></button><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button><div className="top-avatar">AT</div><button className="sign-out-button" onClick={signOut}>Sign out</button></div></header>

        <section className="page-content">
          <div className="page-heading"><div><div className="eyebrow">ASSESSMENT STUDIO <span>·</span> SOFTWARE ENGINEERING</div><h1>Practical assessments</h1><p>Thoughtful work samples. Clear criteria. Human review, always.</p></div><button className="button-primary" onClick={() => { setEditing({ ...blankChallenge, id: `custom-${Date.now()}` }); setError(''); }}><Plus size={16} /> Create a challenge</button></div>

          <div className="metrics-row"><div className="metric"><span className="metric-icon green"><BookOpen size={16} /></span><div><small>Challenge library</small><strong>{String(challenges.length).padStart(2, '0')} <em>ready to use</em></strong></div></div><div className="metric"><span className="metric-icon sand"><UsersRound size={16} /></span><div><small>Submissions to review</small><strong>{String(assessmentRows.length).padStart(2, '0')} <em>{assessmentRows.length ? 'demo candidates' : 'none yet'}</em></strong></div></div><div className="metric"><span className="metric-icon blue"><Clock3 size={16} /></span><div><small>Avg. completion</small><strong>24 min <em>candidate time</em></strong></div></div><div className="metric-note"><Sparkles size={15} /><span>Each score links back to a candidate’s work.</span></div></div>

          <div className="studio-grid">
            <section className="library-panel" aria-label="Challenge library">
              <div className="panel-topline"><div><h2>Challenge library</h2><p>Pick a reviewed prompt or make one your own.</p></div><button className="button-secondary compact-button" onClick={() => { setEditing({ ...blankChallenge, id: `custom-${Date.now()}` }); setError(''); }}><FilePlus2 size={15} /> Custom</button></div>
              <div className="search-filter-row"><label className="search-box"><Search size={16} /><input aria-label="Search challenges" placeholder="Search challenges or skills" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label><button className="filter-button" onClick={() => setFilter((current) => current === 'all' ? 'library' : current === 'library' ? 'ai-draft' : current === 'ai-draft' ? 'custom' : 'all')}><Filter size={15} /> {filter === 'all' ? 'All types' : filter === 'ai-draft' ? 'AI drafted' : filter === 'custom' ? 'Custom' : 'Reviewed'} <ChevronDown size={14} /></button></div>
              <div className="challenge-list" role="list">
                {filteredChallenges.map((challenge, index) => <button key={challenge.id} role="listitem" className={`challenge-card ${selectedId === challenge.id ? 'challenge-selected' : ''}`} onClick={() => setSelectedId(challenge.id)}>
                  <span className={`challenge-icon icon-${index % 3}`}><Code2 size={17} /></span><span className="challenge-info"><span className="challenge-title-row"><strong>{challenge.title}</strong>{challenge.source === 'ai-draft' && <span className="ai-tag"><Sparkles size={11} /> AI draft</span>}{challenge.source === 'custom' && <span className="custom-tag">CUSTOM</span>}</span><span className="challenge-summary">{challenge.summary}</span><span className="challenge-meta"><span>{modeLabel(challenge.mode)}</span><i>·</i><span>{challenge.durationMinutes} min</span><i>·</i><span>{challenge.difficulty}</span></span></span><span className={`selection-indicator ${selectedId === challenge.id ? 'selection-on' : ''}`}>{selectedId === challenge.id && <Check size={12} />}</span>
                </button>)}
                {filteredChallenges.length === 0 && <div className="empty-state"><Search size={18} /><strong>No challenges found</strong><span>Try a different search or filter.</span></div>}
              </div>
              <button className="ai-create-link" onClick={() => { setEditing({ ...blankChallenge, id: `ai-draft-${Date.now()}`, source: 'ai-draft', title: 'AI-tailored engineering challenge' }); setError(''); }}><span className="sparkle-box"><Sparkles size={15} /></span><span><strong>Tailor a challenge with AI</strong><small>Start with role requirements; review before assigning.</small></span><ArrowRight size={16} /></button>
            </section>

            <section className="preview-panel" aria-label="Challenge preview">
              <div className="preview-header"><span className="preview-label">CHALLENGE PREVIEW</span><button className="icon-button small-icon" aria-label="More challenge options"><MoreHorizontal size={18} /></button></div>
              <div className="preview-title-line"><h2>{selected.title}</h2><button className="edit-button" onClick={() => { setEditing({ ...selected }); setError(''); }}>Edit <ArrowUpRight size={13} /></button></div>
              <p className="preview-description">{selected.summary}</p>
              <div className="detail-chips"><span><BriefcaseBusiness size={13} /> {selected.role}</span><span><Clock3 size={13} /> {selected.durationMinutes} minutes</span><span className="difficulty-chip">{selected.difficulty}</span></div>
              <div className="divider" />
              <div className="section-kicker"><span>01</span> CANDIDATE PROMPT</div><div className="prompt-box"><p>{selected.prompt}</p><span className="prompt-type">{modeLabel(selected.mode)}</span></div>
              <div className="rubric-heading"><div className="section-kicker"><span>02</span> REVIEW RUBRIC</div><span className="points-total">{selected.rubric.reduce((total, criterion) => total + criterion.maxPoints, 0)} pts total</span></div>
              <div className="rubric-list">{selected.rubric.map((criterion, index) => <div className="rubric-row" key={criterion.id}><span className="rubric-index">0{index + 1}</span><span className="rubric-copy"><strong>{criterion.name}</strong><small>{criterion.description}</small></span><span className="rubric-points">{criterion.maxPoints} <small>pts</small></span></div>)}</div>
              <div className="skills-row"><span>SKILLS</span>{selected.skills.map((skill) => <span className="skill-pill" key={skill}>{skill}</span>)}</div>
              <div className="human-note"><ShieldCheck size={16} /><span><strong>Recruiter stays in control.</strong> Scores support review; they never make the hiring decision.</span></div>
          <div className="preview-actions"><button className="button-primary assign-button" onClick={() => beginCandidateFlow(selected)}><ArrowUpRight size={16} /> Create candidate invite</button><button className="button-secondary preview-action-secondary" onClick={() => { setSaved(true); setChallenges(loadChallenges()); }}>{saved ? <Check size={15} /> : <BookOpen size={15} />}{saved ? ' Saved to library' : ' Save to library'}</button></div>
            </section>
          </div>
          {allAssessmentRows.length > 0 && <section className="recent-submissions"><div className="recent-submissions-heading"><div><span className="eyebrow">CANDIDATE WORK</span><h2>Recent submissions</h2></div><span>{allAssessmentRows.length} ready for human review</span></div><div className="submission-list">{allAssessmentRows.map((row) => <button key={row.submission.id} className="submission-row" onClick={() => { setSelectedSubmissionId(row.submission.id); setRoute('review'); }}><span className="submission-avatar">{row.submission.candidateName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="submission-candidate"><strong>{row.submission.candidateName}</strong><small>{row.challenge.title}</small></span><span className="submission-score">{row.assessment.overallScore}<small> / {row.assessment.maximumScore}</small></span><span className="submission-review-state">{row.reviewStatus === 'reviewed' ? <><Check size={13} /> Reviewed</> : <><Clock3 size={13} /> Needs review</>}</span><ArrowRight size={15} /></button>)}</div></section>}
          <footer className="page-footer"><span>Examiner <i>·</i> A ZEIL hackathon concept</span><span id="principles">Built for transparent, human-led assessment</span></footer>
        </section>
      </main>

      {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><div className="modal-heading"><div><span className="eyebrow">{editing.source === 'ai-draft' ? 'AI-TAILORED DRAFT' : 'CHALLENGE BUILDER'}</span><h2 id="editor-title">{editing.title || 'Create a challenge'}</h2></div><button className="icon-button" aria-label="Close editor" onClick={() => setEditing(null)}><X size={18} /></button></div><div className="editor-fields"><label>Challenge title<input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} placeholder="e.g. Investigate a slow endpoint" /></label><div className="field-pair"><label>Role<input value={editing.role} onChange={(event) => setEditing({ ...editing, role: event.target.value })} /></label><label>Duration (minutes)<input type="number" min="5" max="180" value={editing.durationMinutes} onChange={(event) => setEditing({ ...editing, durationMinutes: Number(event.target.value) })} /></label></div><label>Candidate prompt<textarea rows={5} value={editing.prompt} onChange={(event) => setEditing({ ...editing, prompt: event.target.value })} placeholder="Describe a realistic task the candidate should complete…" /></label><div className="modal-section-head"><strong>Review rubric</strong><button className="text-action" onClick={addCriterion}><Plus size={14} /> Add criterion</button></div>{editing.rubric.map((criterion, index) => <div className="criterion-editor" key={criterion.id}><input aria-label={`Criterion ${index + 1} name`} value={criterion.name} placeholder="Criterion name" onChange={(event) => setEditing({ ...editing, rubric: editing.rubric.map((item) => item.id === criterion.id ? { ...item, name: event.target.value } : item) })} /><input aria-label={`Criterion ${index + 1} description`} value={criterion.description} placeholder="What good evidence looks like" onChange={(event) => setEditing({ ...editing, rubric: editing.rubric.map((item) => item.id === criterion.id ? { ...item, description: event.target.value } : item) })} /><input aria-label={`Criterion ${index + 1} points`} type="number" min="1" max="100" value={criterion.maxPoints} onChange={(event) => setEditing({ ...editing, rubric: editing.rubric.map((item) => item.id === criterion.id ? { ...item, maxPoints: Number(event.target.value) } : item) })} /></div>)}{error && <p className="form-error" role="alert">{error}</p>}</div><div className="modal-footer"><span>Recruiter reviews and approves before assignment.</span><button className="button-primary" onClick={saveChallenge}><Check size={15} /> Save challenge</button></div></section></div>}

          {showPhoneLinks && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPhoneLinks(false); }}><section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="phone-title"><div className="modal-heading"><div><span className="eyebrow">PHONE SETUP CHECKPOINT</span><h2 id="phone-title">Scan with the candidate’s phone</h2></div><button className="icon-button" aria-label="Close phone setup" onClick={() => setShowPhoneLinks(false)}><X size={18} /></button></div><div className="launch-summary phone-pair-summary">{phoneQrSvg ? <div className="qr-wrap" dangerouslySetInnerHTML={{ __html: phoneQrSvg }} /> : <div className="qr-fallback"><QrCode size={38} /><span>QR unavailable</span></div>}<strong>Open the phone camera and scan</strong><p>Candidate sees consent first. The captured image is sent to Gemini for neutral visible-object notes; the image and note are separate from the task score.</p><label className="invite-link-label">Phone checkpoint URL<input readOnly value={phoneUrl} onFocus={(event) => event.currentTarget.select()} /></label></div><div className="modal-footer"><span>Recruiter inspects image and uncertainty; no cheating verdict.</span><button className="button-secondary" onClick={() => setShowPhoneLinks(false)}>Close</button></div></section></div>}

      {candidateReady && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCandidateReady(false); }}><section className="editor-modal launch-modal" role="dialog" aria-modal="true" aria-labelledby="launch-title"><div className="modal-heading"><div><span className="eyebrow">CANDIDATE INVITATION</span><h2 id="launch-title">Candidate test link created</h2></div><button className="icon-button" aria-label="Close candidate invitation" onClick={() => setCandidateReady(false)}><X size={18} /></button></div><div className="launch-summary"><strong>{selected.title}</strong><p>{selected.durationMinutes} minutes · {modeLabel(selected.mode)} · {selected.difficulty}</p><p>Share this link with a candidate. They sign in with the separate candidate test account; candidate submissions will appear in your recruiter inbox after submit.</p>{inviteUrl && <label className="invite-link-label">Candidate demo invite URL<input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /></label>}<button className="text-action" onClick={createPhoneLink}>Set up optional phone checkpoint</button></div><div className="modal-footer"><span>Recruiter review remains a separate sign-in.</span><button className="button-secondary" onClick={() => setCandidateReady(false)}>Done</button></div></section></div>}

      {saved && <div className="toast" role="status"><Check size={16} /> Challenge saved.</div>}
    </div>
  );
}

export default App;
