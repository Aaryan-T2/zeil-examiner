import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { config } from 'dotenv';
import QRCode from 'qrcode';
import { assessSubmissionWithGemini } from '../src/shared/gemini-assessment.ts';
import { describeSetupImage } from '../src/shared/gemini-assessment.ts';
import { analyzeProctorFrame } from '../src/shared/gemini-proctor.ts';
import { challengeLibrary } from '../src/shared/challenge-library.ts';
import { validateAssessment, validateChallenge } from '../src/shared/contracts.ts';
import type { CandidateSubmission, Challenge, IntegrityEvent } from '../src/shared/contracts.ts';
import { validateSubmission } from '../src/shared/contracts.ts';
import { generateChallengeFromRole } from '../src/shared/gemini-challenge.ts';

config({ path: '.env' });
config({ path: '../../.env' });

const sessions = new Map<string, { challenge: Challenge; createdAt: number; candidateToken: string }>();
const sessionEvents = new Map<string, IntegrityEvent[]>();
const setupEvents = new Map<string, IntegrityEvent[]>();
const assessments = new Map<string, { challenge: Challenge; submission: CandidateSubmission; result: Awaited<ReturnType<typeof assessSubmissionWithGemini>>; integrityEvents: IntegrityEvent[]; createdAt: number; reviewStatus: 'needs-review' | 'reviewed' }>();
const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY = 4 * 1024 * 1024;

const styles = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');
:root{font-family:'DM Sans',sans-serif;color:#1e2924;background:#f4f5f1;--ink:#1e2924;--muted:#77817a;--line:#e7eae4;--green:#28654d;--green-dark:#1f503d;--paper:#fff;--canvas:#f4f5f1;--mono:'DM Mono',monospace}*{box-sizing:border-box}body{margin:0;min-width:320px;min-height:100vh;background:var(--canvas)}button,input,textarea{font:inherit}button{cursor:pointer}.app-frame{min-height:100vh}.sidebar{position:fixed;inset:0 auto 0 0;width:238px;background:#fbfcfa;border-right:1px solid #e7eae4;padding:25px 15px 14px;display:flex;flex-direction:column;z-index:2}.brand-lockup{display:flex;align-items:center;gap:9px;padding:0 8px 29px;font-family:Manrope,sans-serif;font-size:18px;font-weight:800;letter-spacing:-.8px}.brand-mark{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;background:#28654d;color:white;font-family:Georgia,serif;font-size:22px;font-weight:700;line-height:1}.brand-beta{font:500 9px var(--mono);letter-spacing:.4px;color:#78857c;background:#edf1ec;border:1px solid #e4e9e3;padding:3px 5px;border-radius:4px;margin-left:1px}.workspace-switch{width:100%;height:56px;border:1px solid var(--line);border-radius:9px;background:white;display:flex;align-items:center;text-align:left;padding:8px;gap:9px;color:var(--ink)}.workspace-avatar{width:31px;height:31px;background:#e9f1e9;color:#285840;border-radius:7px;display:grid;place-items:center;font:700 13px Manrope}.workspace-copy,.account-copy{flex:1;display:flex;flex-direction:column;gap:2px}.workspace-copy strong,.account-copy strong{font-size:12px;font-weight:700}.workspace-copy small,.account-copy small{font-size:10px;color:#869087}.nav-label{font:500 9px var(--mono);letter-spacing:1.1px;color:#a0a79f;padding:29px 9px 10px}.primary-nav{display:flex;flex-direction:column;gap:4px}.nav-item{height:38px;border:0;background:transparent;border-radius:7px;display:flex;align-items:center;gap:11px;padding:0 10px;color:#66716a;font-size:12px;text-align:left}.nav-item svg{color:#849087}.nav-item:hover{background:#f2f5f0}.nav-active{background:#eaf1eb;color:#24583f;font-weight:700}.nav-active svg{color:#28654d}.nav-count{margin-left:auto;border-radius:10px;padding:2px 7px;background:#f0f2ed;color:#77817a;font:10px var(--mono)}.sidebar-spacer{flex:1}.sidebar-callout{border:1px solid #e1e9e0;background:#f4f7f2;padding:13px 12px;border-radius:8px;margin:0 1px 14px}.callout-icon{width:27px;height:27px;border-radius:7px;background:#e3eee3;color:#397055;display:grid;place-items:center;margin-bottom:9px}.sidebar-callout strong{font-size:11px}.sidebar-callout p{font-size:10px;line-height:1.55;color:#727f75;margin:5px 0 10px}.sidebar-callout a{font-size:10px;font-weight:700;color:#34694f;text-decoration:none;display:flex;align-items:center;gap:3px}.bottom-nav{margin-bottom:9px;border-top:1px solid #edf0eb;border-radius:0;height:44px;padding-left:9px}.account-row{border-top:1px solid #ecefe9;padding:13px 5px 0;display:flex;align-items:center;gap:9px;color:#8a938b}.user-avatar,.top-avatar{display:grid;place-items:center;background:#e9eee8;color:#4c6554;font-size:10px;font-weight:700;border-radius:50%;width:29px;height:29px}.main-area{margin-left:238px;min-height:100vh}.topbar{height:59px;border-bottom:1px solid #e6e9e2;background:rgba(250,251,248,.9);display:flex;align-items:center;justify-content:space-between;padding:0 35px}.breadcrumbs{display:flex;align-items:center;gap:10px;font-size:11px;color:#88918a}.breadcrumbs strong{color:#3a473e;font-weight:600}.crumb-slash{color:#c5cbc3}.topbar-actions{display:flex;align-items:center;gap:15px}.environment-badge{font-size:10px;color:#6f7a71;display:flex;gap:6px;align-items:center}.environment-badge span{width:6px;height:6px;border-radius:50%;background:#5ba373}.icon-button{width:31px;height:31px;border:0;background:transparent;color:#7b867e;display:grid;place-items:center;border-radius:7px;position:relative}.icon-button:hover{background:#eef1eb}.notification-button i{position:absolute;width:5px;height:5px;background:#d78053;border:1px solid #fff;border-radius:50%;right:6px;top:6px}.top-avatar{width:26px;height:26px;font-size:9px}.sign-out-button{border:1px solid var(--line);background:#fff;color:#56635a;border-radius:5px;padding:7px 10px;font-size:10px}.page-content{max-width:1320px;padding:36px 42px 22px;margin:0 auto}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:26px}.eyebrow{font:500 9px var(--mono);color:#829087;letter-spacing:1.05px}.page-heading h1{font:700 27px Manrope,sans-serif;letter-spacing:-1.15px;margin:8px 0 4px;color:#1c2821}.page-heading p{margin:0;color:#7b867d;font-size:12px}.button-primary,.button-secondary{height:36px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 13px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap}.button-primary{color:white;border:1px solid var(--green);background:var(--green);box-shadow:0 1px 1px #173a2a12}.button-primary:hover{background:var(--green-dark)}.button-secondary{color:#536058;background:white;border:1px solid #e2e7e0}.button-secondary:hover{background:#f8faf7;border-color:#cfd8cf}.metrics-row{display:grid;grid-template-columns:1fr 1fr 1fr 1.05fr;border:1px solid #e5e9e2;border-radius:8px;background:rgba(255,255,255,.64);min-height:72px;margin-bottom:22px}.metric{display:flex;align-items:center;padding:13px 15px;gap:10px;border-right:1px solid #eaede8}.metric-icon{width:31px;height:31px;border-radius:7px;display:grid;place-items:center}.metric-icon.green{color:#427458;background:#edf4ed}.metric-icon.sand{color:#9a7850;background:#f7f1e8}.metric-icon.blue{color:#55778b;background:#edf3f5}.metric>div{display:flex;flex-direction:column;gap:4px}.metric small{font-size:9px;color:#828b83}.metric strong{font:700 15px Manrope;color:#26342a;letter-spacing:-.3px}.metric em{font:400 9px 'DM Sans',sans-serif;color:#929a92;font-style:normal;margin-left:4px;letter-spacing:0}.metric-note{display:flex;align-items:center;justify-content:center;gap:8px;padding:9px 12px;color:#718074;font-size:10px}.metric-note svg{color:#7a9e80;flex-shrink:0}.studio-grid{display:grid;grid-template-columns:minmax(345px,.93fr) minmax(440px,1.3fr);gap:17px;align-items:start}.library-panel,.preview-panel{border:1px solid #e4e8e1;border-radius:8px;background:#fff}.library-panel{padding:18px 16px 13px}.panel-topline{display:flex;justify-content:space-between;align-items:flex-start}.panel-topline h2{font:700 14px Manrope;letter-spacing:-.25px;margin:0 0 4px}.panel-topline p{font-size:10px;color:#869087;margin:0}.compact-button{height:29px;padding:0 9px;font-size:10px}.search-filter-row{display:flex;gap:7px;margin:17px 0 11px}.search-box{height:34px;border:1px solid #e6eae4;border-radius:5px;display:flex;align-items:center;gap:7px;padding:0 8px;flex:1;color:#9aa39a;min-width:0}.search-box input{border:0;outline:none;background:transparent;width:100%;min-width:0;font-size:10px;color:#354238}.search-box input::placeholder{color:#a1aaa1}.search-box kbd{white-space:nowrap;background:#f5f6f3;border:1px solid #eaede7;border-radius:3px;padding:2px 4px;font:9px var(--mono);color:#98a098}.filter-button{height:34px;display:flex;align-items:center;gap:5px;padding:0 8px;background:white;border:1px solid #e6eae4;border-radius:5px;color:#68746b;font-size:9px;white-space:nowrap}.filter-button:hover{background:#f9faf8}.challenge-list{display:flex;flex-direction:column;gap:7px;min-height:140px}.challenge-card{width:100%;border:1px solid transparent;background:white;border-radius:6px;padding:11px 9px;display:flex;align-items:flex-start;text-align:left;gap:9px;color:inherit;transition:border-color .15s,background .15s}.challenge-card:hover{background:#fafbf9;border-color:#e8ece6}.challenge-selected{background:#f8faf7;border-color:#a9c2ac!important;box-shadow:0 0 0 1px #dce8dc}.challenge-icon{width:29px;height:29px;display:grid;place-items:center;border-radius:6px;flex-shrink:0}.icon-0{color:#46745a;background:#eaf2ea}.icon-1{color:#7a7193;background:#f0eef5}.icon-2{color:#9d754d;background:#f6f0e7}.challenge-info{flex:1;display:flex;flex-direction:column;gap:5px;min-width:0}.challenge-title-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.challenge-title-row strong{font-size:10px;font-weight:700;color:#354238}.ai-tag,.custom-tag{border-radius:3px;padding:2px 4px;display:inline-flex;align-items:center;gap:3px;font-size:8px;font-weight:600}.ai-tag{background:#f3effa;color:#7d6e99}.custom-tag{background:#f5f2e9;color:#937e57;font:8px var(--mono)}.challenge-summary{font-size:9px;color:#818b82;line-height:1.35}.challenge-meta{font-size:8px;color:#9ba39a;display:flex;align-items:center;gap:5px}.challenge-meta i{font-style:normal;color:#c1c7bf}.selection-indicator{width:16px;height:16px;border:1px solid #dce2db;border-radius:50%;display:grid;place-items:center;flex-shrink:0;margin-top:4px;color:white}.selection-on{background:#3e7556;border-color:#3e7556}.empty-state{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;color:#88928a;padding:25px 10px;font-size:10px}.empty-state strong{color:#4d5b51;font-size:11px}.empty-state span{font-size:9px}.ai-create-link{margin-top:12px;padding:11px 8px 2px;border:0;border-top:1px solid #ecefe9;background:white;width:100%;display:flex;align-items:center;text-align:left;gap:9px;color:#78847a}.ai-create-link>span:nth-child(2){display:flex;flex-direction:column;gap:4px;flex:1}.ai-create-link strong{color:#45664d;font-size:10px}.ai-create-link small{color:#939b93;font-size:9px}.ai-create-link>svg{color:#86978a}.sparkle-box{width:28px;height:28px;border-radius:6px;background:#eff4ed;color:#618469;display:grid;place-items:center}.preview-panel{padding:17px 20px 16px}.preview-header{display:flex;align-items:center;justify-content:space-between}.preview-label,.section-kicker{font:500 8px var(--mono);letter-spacing:.85px;color:#7e8b80}.small-icon{width:25px;height:25px}.preview-title-line{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:1px}.preview-title-line h2{font:700 17px Manrope;letter-spacing:-.55px;margin:3px 0 3px;color:#223027}.edit-button{border:0;background:transparent;color:#68806d;display:flex;align-items:center;gap:3px;font-size:9px}.preview-description{font-size:10px;color:#7b867c;margin:1px 0 11px}.detail-chips{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.detail-chips>span{border:1px solid #ebeee9;border-radius:4px;height:23px;padding:0 7px;display:inline-flex;align-items:center;gap:5px;color:#78837a;font-size:9px}.detail-chips svg{color:#8a998d}.detail-chips .difficulty-chip{border-color:#eee7d9;background:#faf7f0;color:#8f7a51}.divider{height:1px;background:#edf0eb;margin:14px 0 13px}.section-kicker{display:flex;align-items:center;gap:7px}.section-kicker span{color:#9bb19d;font-size:8px}.prompt-box{position:relative;border:1px solid #edf0eb;background:#fafbf9;border-radius:5px;margin-top:9px;padding:11px 12px 12px}.prompt-box p{font-size:10px;color:#616d63;line-height:1.6;white-space:pre-wrap;margin:0;padding-right:2px}.prompt-type{position:absolute;right:8px;top:-8px;background:white;border:1px solid #edf0eb;padding:2px 6px;border-radius:3px;color:#829087;font-size:8px}.rubric-heading{display:flex;align-items:center;justify-content:space-between;margin:15px 0 7px}.points-total{font:9px var(--mono);color:#8a948b}.rubric-list{border-top:1px solid #eff1ed}.rubric-row{display:flex;align-items:flex-start;gap:9px;padding:8px 2px;border-bottom:1px solid #eff1ed}.rubric-index{font:9px var(--mono);color:#a0ada1;padding-top:1px}.rubric-copy{display:flex;flex-direction:column;gap:3px;flex:1}.rubric-copy strong{font-size:9px;font-weight:700;color:#536055}.rubric-copy small{font-size:8px;color:#929b92;line-height:1.35}.rubric-points{font:500 10px var(--mono);color:#59675b;white-space:nowrap}.rubric-points small{font-size:8px;color:#a1a9a0}.skills-row{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:11px 0 2px}.skills-row>span:first-child{font:8px var(--mono);letter-spacing:.6px;color:#9ba49b;margin-right:3px}.skill-pill{background:#f4f6f2;color:#737f75;border-radius:3px;padding:4px 6px;font-size:8px}.human-note{margin-top:12px;border:1px solid #e6eee5;background:#f6f9f5;border-radius:5px;padding:9px;display:flex;align-items:flex-start;gap:7px;color:#68806d}.human-note svg{flex-shrink:0}.human-note span{font-size:9px;color:#78877b;line-height:1.45}.human-note strong{color:#4e6c54}.preview-actions{display:flex;gap:7px;margin-top:12px}.assign-button{height:33px;font-size:10px}.preview-action-secondary{height:33px;font-size:9px}.page-footer{display:flex;align-items:center;justify-content:space-between;color:#a0a79f;font-size:9px;margin-top:21px;padding:0 2px}.page-footer i{font-style:normal;margin:0 5px;color:#c4c9c2}.recent-submissions{margin-top:18px;border:1px solid #e4e8e1;border-radius:8px;background:#fff;padding:17px}.recent-submissions-heading{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px}.recent-submissions-heading h2{font:700 14px Manrope;margin:5px 0 0}.recent-submissions-heading>span{font-size:9px;color:#849087}.submission-list{display:flex;flex-direction:column}.submission-row{width:100%;display:flex;align-items:center;gap:11px;padding:11px 5px;border:0;border-top:1px solid #edf0eb;background:white;text-align:left;color:#506056}.submission-row:hover{background:#fafbf9}.submission-avatar{width:29px;height:29px;display:grid;place-items:center;border-radius:50%;background:#edf3ec;color:#41694f;font-size:9px;font-weight:700}.submission-candidate{display:flex;flex-direction:column;gap:3px;flex:1}.submission-candidate strong{font-size:10px;color:#334138}.submission-candidate small{font-size:9px;color:#849087}.submission-score{font:600 11px var(--mono);color:#44604b}.submission-score small{font-size:9px;color:#99a199}.submission-review-state{display:flex;align-items:center;gap:4px;font-size:9px;color:#7d8a7e}.modal-backdrop{position:fixed;inset:0;background:#18231db3;z-index:5;display:grid;place-items:center;padding:20px}.editor-modal{width:min(620px,100%);max-height:min(90vh,850px);overflow:auto;background:#fff;border-radius:9px;padding:21px;box-shadow:0 20px 70px #1720193b}.modal-heading{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #edf0eb;padding-bottom:15px}.modal-heading h2{font:700 18px Manrope;letter-spacing:-.5px;margin:6px 0 0}.editor-fields{padding:16px 0;display:flex;flex-direction:column;gap:12px}.editor-fields label{display:flex;flex-direction:column;gap:5px;color:#5c695f;font-size:10px;font-weight:600}.editor-fields input,.editor-fields textarea{border:1px solid #e2e7e0;background:white;border-radius:5px;padding:9px 10px;font-size:11px;color:#2e3b32;outline:none;resize:vertical}.editor-fields input:focus,.editor-fields textarea:focus{border-color:#7ca287;box-shadow:0 0 0 2px #e9f1e9}.field-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}.modal-section-head{display:flex;align-items:center;justify-content:space-between;color:#506052;font-size:11px}.text-action{display:flex;align-items:center;gap:3px;color:#3e7252;border:0;background:transparent;font-size:10px;font-weight:600}.criterion-editor{display:grid;grid-template-columns:1fr 1.5fr 66px;gap:6px}.criterion-editor input{min-width:0;font-size:9px}.form-error{color:#a34035;background:#fbf0ee;padding:8px;border-radius:4px;font-size:10px;margin:0}.modal-footer{border-top:1px solid #edf0eb;padding-top:13px;display:flex;align-items:center;justify-content:space-between;gap:8px}.modal-footer>span{color:#89938a;font-size:9px}.modal-footer .button-primary{height:33px;font-size:10px}.toast{position:fixed;right:22px;bottom:22px;z-index:10;background:#254e3b;color:white;border-radius:6px;box-shadow:0 5px 20px #1b3b2b30;padding:11px 14px;display:flex;align-items:center;gap:8px;font-size:11px}.candidate-shell,.review-shell{min-height:100vh;background:#f5f6f2;color:#1f2c23}.candidate-topbar,.review-topbar{height:58px;background:#fbfcfa;border-bottom:1px solid #e5eae2;display:flex;align-items:center;justify-content:space-between;padding:0 max(22px,calc((100vw - 1140px)/2));}.candidate-brand{font:800 16px Manrope;letter-spacing:-.5px;display:flex;align-items:center;gap:8px}.candidate-brand .brand-mark{width:24px;height:24px}.candidate-back{display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:#69766d;font-size:11px}.candidate-back:hover{color:#285c42}.candidate-secure,.review-mode{display:flex;align-items:center;gap:6px;color:#62816a;font-size:10px}.candidate-layout{max-width:1080px;padding:42px 24px 64px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:38px}.candidate-main{min-width:0}.candidate-role{font:500 9px var(--mono);letter-spacing:1px;color:#86958a;display:flex;gap:7px;align-items:center}.candidate-main h1{font:700 29px Manrope;letter-spacing:-1px;margin:12px 0 6px}.candidate-intro{font-size:12px;color:#738075;margin:0 0 14px}.candidate-meta{display:flex;gap:15px;flex-wrap:wrap;border-bottom:1px solid #e3e9e1;padding-bottom:17px}.candidate-meta span{display:flex;gap:6px;align-items:center;color:#7d887f;font-size:10px}.candidate-prompt{margin:19px 0 18px;background:white;border:1px solid #e3e9e1;border-radius:7px;padding:15px}.candidate-section-title{display:flex;justify-content:space-between;font:500 9px var(--mono);letter-spacing:.6px;color:#76907a}.candidate-section-title span:last-child{color:#9ba49c;font:9px 'DM Sans',sans-serif;letter-spacing:0}.candidate-prompt-text{white-space:pre-wrap;font-size:11px;line-height:1.7;color:#435047;margin-top:12px}.candidate-answer-label{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}.candidate-answer-label span:first-child{font-size:11px;font-weight:700;color:#3d4a40}.candidate-answer-label span:last-child{font-size:9px;color:#8b958d}.candidate-answer{width:100%;min-height:220px;border:1px solid #dfe6dd;border-radius:6px;background:#fff;padding:13px;font:11px/1.6 var(--mono);color:#344239;outline:none;resize:vertical}.candidate-answer:focus{border-color:#78a084;box-shadow:0 0 0 3px #e7f0e6}.answer-footer{display:flex;justify-content:space-between;gap:10px;margin:7px 1px 14px;color:#929b93;font-size:9px}.candidate-submit{min-width:150px}.candidate-submit .submit-arrow{transform:rotate(180deg)}.candidate-submit-note{display:inline;margin-left:10px;color:#919a91;font-size:9px}.candidate-aside{display:flex;flex-direction:column;gap:11px;padding-top:45px}.candidate-aside-card{background:#fff;border:1px solid #e3e9e1;border-radius:7px;padding:15px}.aside-eyebrow{font:500 8px var(--mono);letter-spacing:.8px;color:#8a988c}.candidate-aside-card h2{font:700 15px Manrope;letter-spacing:-.3px;margin:10px 0 6px}.candidate-aside-card p{font-size:10px;line-height:1.55;color:#7c887e;margin:0}.aside-skills{display:flex;flex-wrap:wrap;gap:5px;margin-top:12px}.aside-skills span{border-radius:3px;background:#f0f4ef;color:#68806c;padding:4px 6px;font-size:8px}.candidate-privacy{display:grid;grid-template-columns:20px 1fr;gap:5px 7px;color:#578061}.candidate-privacy strong{font-size:10px;color:#55725a}.candidate-privacy p{grid-column:2}.candidate-name-label{display:flex;flex-direction:column;gap:5px;color:#708074;font-size:9px}.candidate-name-label input{height:33px;border:1px solid #e0e6de;border-radius:5px;padding:0 9px;background:white;font-size:10px;color:#405045;outline:none}.candidate-time-note{font-size:9px;color:#9aa39a}.candidate-complete{max-width:500px;margin:15vh auto 0;background:#fff;border:1px solid #e3e9e1;border-radius:9px;padding:38px;text-align:center}.candidate-complete h1{font:700 26px Manrope;letter-spacing:-.8px;margin:10px 0}.candidate-complete p{font-size:12px;line-height:1.65;color:#768178;margin:0 auto 20px;max-width:390px}.complete-mark{margin:0 auto 15px;width:45px;height:45px;border-radius:50%;display:grid;place-items:center;background:#eaf3e9;color:#3e7a54}.review-content{max-width:1120px;margin:0 auto;padding:34px 24px 40px}.review-breadcrumb,.review-title-kicker,.report-kicker,.score-overline,.decision-label{font:500 8px var(--mono);letter-spacing:.9px;color:#849187}.review-breadcrumb span{color:#b0b8b0;padding:0 7px}.review-title-row{display:flex;justify-content:space-between;align-items:flex-end;margin:12px 0 20px}.review-title-row h1{font:700 26px Manrope;letter-spacing:-.8px;margin:5px 0 3px}.review-title-row p{font-size:10px;color:#829087;margin:0}.review-title-row p span{padding:0 4px}.review-status{display:inline-flex;align-items:center;gap:6px;border:1px solid #dfe6de;border-radius:5px;background:#fff;color:#718074;padding:8px 10px;font-size:9px}.review-status.reviewed{background:#edf5ec;color:#457451;border-color:#dbe8d9}.review-summary-grid{display:grid;grid-template-columns:1.15fr 1fr;gap:13px}.score-panel,.review-decision-panel,.evidence-panel,.integrity-panel,.privacy-panel,.challenge-context{background:#fff;border:1px solid #e3e9e1;border-radius:7px}.score-panel{padding:16px}.score-overline{display:flex;align-items:center;gap:6px}.score-main{display:flex;align-items:baseline;gap:5px;margin-top:7px}.score-main>strong{font:700 34px Manrope;letter-spacing:-1.2px;color:#304c37}.score-main>span:nth-child(2){color:#8e998f;font:11px var(--mono)}.score-percent{margin-left:auto;color:#60816a;font:11px var(--mono)}.score-panel>p{font-size:10px;line-height:1.5;color:#7b877d;margin:8px 0}.score-meter{height:5px;border-radius:5px;background:#edf1eb;overflow:hidden}.score-meter span{display:block;height:100%;background:#75a17b}.score-source{display:flex;align-items:center;gap:5px;margin-top:9px;color:#8a968c;font-size:8px}.score-source svg{color:#879d78}.review-decision-panel{padding:16px}.decision-prompt{display:flex;align-items:center;gap:8px;color:#3d6046;font:700 12px Manrope;margin-top:11px}.review-decision-panel>p{font-size:10px;line-height:1.5;color:#7b877e}.decision-actions{display:flex;gap:7px}.decision-actions button{border:1px solid #e1e7df;border-radius:4px;background:#fff;color:#647269;padding:7px 8px;font-size:8px}.decision-actions button:hover{border-color:#a9bda8;background:#f7faf6}.review-two-column{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;margin-top:14px;align-items:start}.evidence-panel{padding:17px}.report-section-heading{display:flex;align-items:center;justify-content:space-between}.report-section-heading h2{font:700 14px Manrope;letter-spacing:-.3px;margin:5px 0 0}.rubric-total-pill{border:1px solid #e8ece6;border-radius:4px;padding:5px 7px;color:#869188;font:8px var(--mono)}.report-helper{font-size:9px;color:#8a958c;margin:8px 0 12px}.criterion-reports{border-top:1px solid #edf0eb}.criterion-report{border-bottom:1px solid #edf0eb}.criterion-report-button{width:100%;border:0;background:white;display:flex;align-items:center;gap:10px;padding:11px 2px;text-align:left;color:#7a867d}.criterion-report-button:hover{background:#fcfdfb}.report-criterion-number{font:9px var(--mono);color:#9eaa9f}.report-criterion-name{flex:1;display:flex;flex-direction:column;gap:3px}.report-criterion-name strong{font-size:10px;color:#4a584c}.report-criterion-name small{font-size:8px;color:#939c93}.criterion-report-score{white-space:nowrap}.criterion-report-score strong{color:#45634b;font:600 12px var(--mono)}.criterion-report-score small{font:9px var(--mono);color:#9ba49b}.rotate-chevron{transform:rotate(180deg)}.criterion-evidence{padding:1px 10px 13px 30px}.criterion-rationale{font-size:9px;line-height:1.5;color:#6f7c72}.criterion-evidence blockquote{margin:8px 0;padding:8px 10px;border-left:2px solid #98b69a;background:#f7f9f6;color:#5f6c62}.criterion-evidence blockquote p{font:9px/1.5 var(--mono);margin:0;white-space:pre-wrap}.uncertainty-note{display:flex;align-items:flex-start;gap:5px;color:#9a865e;font-size:8px;line-height:1.45;margin-top:7px}.uncertainty-note svg{flex-shrink:0}.no-evidence{font-size:9px;color:#9a8a74;background:#faf7f1;padding:8px;border-radius:4px;margin-top:7px}.full-response{margin-top:15px;border:1px solid #edf0eb;border-radius:5px;overflow:hidden}.response-heading{display:flex;align-items:center;gap:6px;background:#fafbf9;padding:8px 9px;color:#6d7c70}.response-heading strong{font-size:9px;flex:1}.response-heading span{font-size:8px;color:#9aa39b}.full-response pre{font:9px/1.6 var(--mono);color:#516056;white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;margin:0;padding:11px}.review-side-column{display:flex;flex-direction:column;gap:10px}.integrity-panel{padding:14px}.integrity-panel>.report-section-heading>svg{color:#8c997f}.integrity-disclaimer{display:flex;gap:6px;align-items:flex-start;border:1px solid #ecefe7;background:#f8f9f5;border-radius:4px;padding:8px;margin-top:10px;color:#8a927d;font-size:8px;line-height:1.4}.integrity-disclaimer svg{flex-shrink:0;color:#82977b}.integrity-empty{min-height:104px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#9aaa9b;text-align:center}.integrity-empty strong{color:#738174;font-size:9px}.integrity-empty span{font-size:8px;color:#9aa39b}.integrity-events{margin-top:9px;display:flex;flex-direction:column;gap:10px}.integrity-event{display:grid;grid-template-columns:9px 1fr;gap:7px;align-items:start}.event-dot{width:7px;height:7px;margin-top:4px;background:#d0a66d;border-radius:50%}.integrity-event strong{font-size:9px;color:#59685c}.integrity-event p{font-size:8px;line-height:1.4;color:#88938a;margin:3px 0}.integrity-event small{font:8px var(--mono);color:#a2aaa2}.privacy-panel{display:flex;gap:8px;padding:12px;color:#739176;background:#f9fbf8}.privacy-panel svg{flex-shrink:0}.privacy-panel strong{font-size:9px;color:#58745d}.privacy-panel p{font-size:8px;line-height:1.45;color:#89958b;margin:4px 0 0}.challenge-context{padding:13px;display:flex;flex-direction:column;gap:7px}.challenge-context>strong{font:700 10px Manrope;color:#506053}.challenge-context>span:not(.report-kicker){font-size:8px;color:#909a90}.challenge-context>span i{font-style:normal;padding:0 4px;color:#bdc4bc}.challenge-context-tags{display:flex;gap:4px;flex-wrap:wrap}.challenge-context-tags span{background:#f1f4ef;color:#788578;padding:4px 5px;border-radius:3px;font-size:7px}.review-footer{display:flex;justify-content:space-between;gap:10px;margin-top:17px;color:#9ca59c;font-size:8px}.review-footer i{font-style:normal;padding:0 4px}.review-footer button{border:0;background:transparent;color:#68806e;text-decoration:underline;font-size:8px}.auth-shell{min-height:100vh;display:grid;place-items:center;padding:22px;background:radial-gradient(ellipse at 50% 30%,#ffffff 0%,#f3f6f1 58%,#eaf0e9 100%)}.auth-card{width:min(420px,100%);background:#fff;border:1px solid #e2e9e1;border-radius:11px;padding:29px;box-shadow:0 14px 50px #21402a12}.auth-brand{display:flex;align-items:center;gap:9px;font:800 18px Manrope;margin-bottom:26px}.auth-card h1{font:700 25px Manrope;letter-spacing:-.8px;margin:8px 0}.auth-intro{font-size:11px;line-height:1.55;color:#818c82;margin:0 0 17px}.auth-roles{display:grid;grid-template-columns:1fr 1fr;padding:3px;background:#f1f4ef;border-radius:6px;gap:3px}.auth-role{height:32px;border:0;border-radius:4px;background:transparent;color:#7b867d;font-size:10px}.auth-role.active{background:#fff;color:#315b40;box-shadow:0 1px 3px #172a1914;font-weight:700}.auth-form{display:flex;flex-direction:column;gap:12px;margin-top:17px}.auth-form label{display:flex;flex-direction:column;gap:5px;color:#69766c;font-size:9px;font-weight:600}.auth-form input{height:37px;border:1px solid #e0e7de;border-radius:5px;padding:0 10px;color:#324035;font-size:11px;outline:none}.auth-form input:focus{border-color:#7fa285;box-shadow:0 0 0 3px #e7f0e6}.auth-submit{width:100%;height:38px;margin-top:3px}.demo-credentials{display:flex;flex-direction:column;gap:5px;margin-top:16px;padding:11px;border:1px solid #e8ede6;background:#fafbf9;border-radius:5px;color:#818b82;font-size:9px}.demo-credentials strong{font-size:9px;color:#5c6a5e}.demo-credentials code{font:9px var(--mono);color:#637b67}.auth-disclaimer{text-align:center;font-size:8px;line-height:1.5;color:#a0a8a0;margin:13px 4px 0}.camera-consent{display:flex;align-items:flex-start;gap:7px;color:#66756a;font-size:9px;line-height:1.5}.camera-consent input{margin:2px 0 0;accent-color:#28654d}.setup-preview{width:100%;margin-top:13px;border-radius:6px;border:1px solid var(--line)}.setup-status{font-size:10px;line-height:1.5;color:#66756a}
`; 

function lanAddress(): string {
  for (const items of Object.values(networkInterfaces())) {
    for (const item of items ?? []) {
      if ((item.family === 'IPv4' || item.family === 4) && !item.internal) return item.address;
    }
  }
  return '';
}

function reply(response: import('node:http').ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY) throw new Error('Request body too large.');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function isSubmission(value: unknown): value is { challenge: Challenge; submission: CandidateSubmission; integrityEvents: IntegrityEvent[] } {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  if (!input.challenge || typeof input.challenge !== 'object' || !input.submission || typeof input.submission !== 'object' || !Array.isArray(input.integrityEvents)) return false;
  const submission = input.submission as Record<string, unknown>;
  const challenge = input.challenge as Challenge;
  const validation = validateSubmission(submission as CandidateSubmission, challenge);
  const events = input.integrityEvents as unknown[];
  return validateChallenge(challenge).length === 0 && validation.length === 0 && events.length <= 20 && events.every((event) => {
    if (!event || typeof event !== 'object') return false;
    const item = event as Record<string, unknown>;
    return typeof item.id === 'string' && item.id.length <= 128
      && typeof item.occurredAt === 'string' && Number.isFinite(Date.parse(item.occurredAt))
      && ['focus-lost', 'fullscreen-exit', 'camera-check', 'paste-blocked', 'proctor-flag'].includes(String(item.kind))
      && typeof item.description === 'string' && item.description.length <= 1500
      && typeof item.reviewRequired === 'boolean'
      && (item.imageData === undefined || (typeof item.imageData === 'string' && item.imageData.startsWith('data:image/jpeg;base64,') && item.imageData.length <= 250_000));
  });
}

function isIntegrityEvent(value: unknown): value is IntegrityEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === 'string' && event.id.length <= 128
    && typeof event.occurredAt === 'string' && Number.isFinite(Date.parse(event.occurredAt))
    && (event.kind === 'focus-lost' || event.kind === 'fullscreen-exit' || event.kind === 'proctor-flag')
    && typeof event.description === 'string' && event.description.length <= 600
    && event.reviewRequired === true;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/api/health') {
    reply(response, 200, { ok: true, geminiConfigured: Boolean(process.env.GEMINI_API_KEY), lanAddress: lanAddress() });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/candidate') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Candidate assessment â€” Examiner</title><style>${styles}</style><script type="module" src="/src/main.tsx"></script></head><body><div id="root"></div></body></html>`);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/setup') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phone setup checkpoint â€” Examiner</title><style>${styles}</style><script type="module" src="/src/main.tsx"></script></head><body><div id="root"></div></body></html>`);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/assessment-sessions') {
    try {
      const input = await readJson(request) as { challengeId?: string; challenge?: unknown };
      const libraryChallenge = challengeLibrary.find((item) => item.id === input.challengeId);
      const fallbackChallenge = !libraryChallenge && input.challenge && typeof input.challenge === 'object' && validateChallenge(input.challenge as Challenge).length === 0 ? input.challenge as Challenge : undefined;
      const challenge = libraryChallenge ?? fallbackChallenge;
      if (!challenge) { reply(response, 404, { error: 'Challenge not found.' }); return; }
      const id = randomUUID();
      const candidateToken = randomUUID();
      sessions.set(id, { challenge, createdAt: Date.now(), candidateToken });
      sessionEvents.set(id, []);
      setupEvents.set(id, []);
      reply(response, 201, { sessionId: id, candidateToken, challenge });
    } catch (error) { reply(response, 400, { error: error instanceof Error ? error.message : 'Invalid request.' }); }
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/setup-check') {
    try {
      const input = await readJson(request) as { imageData?: unknown; consented?: unknown; sessionId?: unknown };
      if (input.consented !== true || typeof input.imageData !== 'string' || input.imageData.length > 190_000 || typeof input.sessionId !== 'string') { reply(response, 400, { error: 'Consent, session, or setup image is invalid.' }); return; }
      const session = sessions.get(input.sessionId);
      if (!session || Date.now() - session.createdAt > 24 * 60 * 60 * 1000) { reply(response, 404, { error: 'Assessment session not found.' }); return; }
      const candidateToken = request.headers['x-candidate-token'];
      if (typeof candidateToken !== 'string' || candidateToken !== session.candidateToken) { reply(response, 403, { error: 'Assessment session authorization failed.' }); return; }
      const note = await describeSetupImage(input.imageData, process.env.GEMINI_API_KEY);
      const event: IntegrityEvent = { id: randomUUID(), occurredAt: new Date().toISOString(), kind: 'camera-check', description: `${note.note} Visible details: ${note.observations.join('; ') || 'no specific object observations.'} ${note.uncertainty}`, reviewRequired: true, imageData: input.imageData };
      const events = setupEvents.get(input.sessionId) ?? [];
      events.push(event);
      setupEvents.set(input.sessionId, events.slice(-10));
      reply(response, 200, { note, event });
    } catch { reply(response, 400, { error: 'Unable to process setup image.' }); }
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/proctor-check') {
    try {
      const input = await readJson(request) as { sessionId?: unknown; imageData?: unknown; consented?: unknown };
      if (typeof input.sessionId !== 'string' || input.consented !== true || typeof input.imageData !== 'string' || !input.imageData.startsWith('data:image/jpeg;base64,') || input.imageData.length > 120_000) { reply(response, 400, { error: 'Proctor frame is invalid.' }); return; }
      const session = sessions.get(input.sessionId);
      if (!session) { reply(response, 404, { error: 'Assessment session not found.' }); return; }
      if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
        sessions.delete(input.sessionId);
        reply(response, 410, { error: 'Assessment session expired.' });
        return;
      }
      const candidateToken = request.headers['x-candidate-token'];
      if (typeof candidateToken !== 'string' || candidateToken !== session.candidateToken) { reply(response, 403, { error: 'Assessment session authorization failed.' }); return; }
      const verdict = await analyzeProctorFrame(input.imageData, process.env.GEMINI_API_KEY);
      if (verdict.flagged) {
        const event: IntegrityEvent = { id: randomUUID(), occurredAt: new Date().toISOString(), kind: 'proctor-flag', description: `Live frame flagged: ${verdict.note} Device: ${verdict.device || 'unspecified'}. Uncertainty: ${verdict.uncertainty} This is a review signal, not a misconduct verdict.`, reviewRequired: true, imageData: input.imageData };
        const events = setupEvents.get(input.sessionId) ?? [];
        events.push(event);
        setupEvents.set(input.sessionId, events.slice(-20));
      }
      reply(response, 200, { flagged: verdict.flagged, stop: verdict.flagged, note: verdict.note, device: verdict.device, uncertainty: verdict.uncertainty });
    } catch { reply(response, 400, { error: 'Proctor frame is invalid.' }); }
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/assess') {
    try {
      const input: unknown = await readJson(request);
      if (!isSubmission(input)) { reply(response, 400, { error: 'Submission payload is invalid.' }); return; }
      const challenge = challengeLibrary.find((item) => item.id === input.challenge.id) ?? input.challenge;
      if (challenge.id !== input.challenge.id || validateChallenge(challenge).length > 0) { reply(response, 400, { error: 'Challenge is invalid.' }); return; }
      const sessionId = typeof (input as Record<string, unknown>).sessionId === 'string' ? String((input as Record<string, unknown>).sessionId) : '';
      if (sessionId) {
        const session = sessions.get(sessionId);
        const candidateToken = request.headers['x-candidate-token'];
        if (!session || session.challenge.id !== challenge.id || typeof candidateToken !== 'string' || candidateToken !== session.candidateToken) { reply(response, 403, { error: 'Assessment invitation is invalid.' }); return; }
      }
      const result = await assessSubmissionWithGemini(challenge, input.submission, process.env.GEMINI_API_KEY);
      if (validateAssessment(result, input.submission, challenge).length > 0) { reply(response, 502, { error: 'Assessment output failed validation.' }); return; }
      const events = sessionId ? [...input.integrityEvents, ...(setupEvents.get(sessionId) ?? [])] : input.integrityEvents;
      assessments.set(input.submission.id, { challenge, submission: input.submission, result, integrityEvents: events, createdAt: Date.now(), reviewStatus: 'needs-review' });
      reply(response, 200, { assessment: result, integrityEvents: events });
    } catch (error) { reply(response, 400, { error: error instanceof Error ? error.message : 'Unable to assess submission.' }); }
    return;
  }
  if (request.method === 'GET' && url.pathname === '/api/recruiter/submissions') {
    reply(response, 200, { submissions: Array.from(assessments.values()).map(({ challenge, submission, result, integrityEvents, reviewStatus }) => ({ challenge, submission, assessment: result, integrityEvents, reviewStatus })) });
    return;
  }
  if (request.method === 'PATCH' && url.pathname.startsWith('/api/recruiter/submissions/')) {
    const submissionId = url.pathname.split('/').at(-1) ?? '';
    const existing = assessments.get(submissionId);
    if (!existing) { reply(response, 404, { error: 'Submission not found.' }); return; }
    try {
      const input = await readJson(request) as { reviewStatus?: string };
      if (input.reviewStatus !== 'reviewed' && input.reviewStatus !== 'needs-review') { reply(response, 400, { error: 'Review status is invalid.' }); return; }
      assessments.set(submissionId, { ...existing, reviewStatus: input.reviewStatus });
      reply(response, 200, { ok: true, reviewStatus: input.reviewStatus });
    } catch { reply(response, 400, { error: 'Review status is invalid.' }); }
    return;
  }
  if (request.method === 'GET' && /^\/api\/assessment-sessions\/[^/]+\/setup-count$/.test(url.pathname)) {
    const id = url.pathname.split('/')[3] ?? '';
    const session = sessions.get(id);
    if (!session) { reply(response, 404, { error: 'Assessment session not found.' }); return; }
    if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
      sessions.delete(id);
      reply(response, 410, { error: 'Assessment session expired.' });
      return;
    }
    const candidateToken = request.headers['x-candidate-token'];
    if (typeof candidateToken !== 'string' || candidateToken !== session.candidateToken) { reply(response, 403, { error: 'Assessment invitation is invalid.' }); return; }
    reply(response, 200, { count: (setupEvents.get(id) ?? []).length });
    return;
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/assessment-sessions/')) {
    const pieces = url.pathname.split('/').filter(Boolean);
    const id = pieces[pieces.length - 1] === 'events' ? pieces[pieces.length - 2] ?? '' : pieces.at(-1) ?? '';
    const session = sessions.get(id);
    if (!session) { reply(response, 404, { error: 'Assessment session not found.' }); return; }
    if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
      sessions.delete(id);
      reply(response, 410, { error: 'Assessment session expired.' });
      return;
    }
    const candidateToken = request.headers['x-candidate-token'];
    if (typeof candidateToken !== 'string' || candidateToken !== session.candidateToken) { reply(response, 403, { error: 'Assessment invitation is invalid.' }); return; }
    reply(response, 200, { sessionId: id, challenge: session.challenge });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/generate-challenge') {
    try {
      const input = await readJson(request) as { roleTitle?: unknown; difficulty?: unknown; mode?: unknown; department?: unknown };
      const roleTitle = typeof input.roleTitle === 'string' ? input.roleTitle.trim() : '';
      if (roleTitle.length < 3 || roleTitle.length > 120) { reply(response, 400, { error: 'Enter a job role with at least 3 characters.' }); return; }
      const difficulty = input.difficulty === undefined ? 'Intermediate' : input.difficulty;
      if (difficulty !== 'Foundational' && difficulty !== 'Intermediate' && difficulty !== 'Advanced') { reply(response, 400, { error: 'Difficulty is invalid.' }); return; }
      const mode = input.mode === undefined ? 'technical-scenario' : input.mode;
      if (mode !== 'debugging' && mode !== 'code-review' && mode !== 'technical-scenario') { reply(response, 400, { error: 'Mode is invalid.' }); return; }
      const department = typeof input.department === 'string' ? input.department.slice(0, 120) : 'General';
      const { challenge, generatedBy } = await generateChallengeFromRole(roleTitle, difficulty, mode, department, process.env.GEMINI_API_KEY);
      if (validateChallenge(challenge).length > 0) { reply(response, 502, { error: 'Generated challenge failed validation.' }); return; }
      reply(response, 200, { challenge, generatedBy });
    } catch (error) { reply(response, 400, { error: error instanceof Error ? error.message : 'Unable to generate challenge.' }); }
    return;
  }
  reply(response, 404, { error: 'Not found.' });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`Examiner API listening on http://127.0.0.1:${PORT}\n`);
});
