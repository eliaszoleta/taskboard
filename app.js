import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─── SUPABASE CONFIG ────────────────────────────────────────────────────────
// Same project as the Solo Board (see solo/board.js). The anon key is safe to
// expose in client code — every table is protected by Row Level Security
// (see supabase/migrations/0002_teams.sql), so a request can only ever touch
// rows for teams the signed-in account actually belongs to.
const SUPABASE_URL      = 'https://mtlefbbziquriovbtyvb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10bGVmYmJ6aXF1cmlvdmJ0eXZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNzI3NTIsImV4cCI6MjEwNDg0ODc1Mn0.2J6Y4yAp14ZCcZnNPyQTJ9BJ-66eN0mNiP_G9w5ewnA';

if (SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_')) {
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center;padding:24px">
    <div><h2 style="color:#4f46e5">Supabase setup required</h2>
    <p style="color:#64748b;max-width:420px">Open <strong>app.js</strong> and replace <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> with your Supabase project's values (Project Settings → API).</p></div>
  </div>`;
  throw new Error('Supabase config not set up.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ATTACHMENTS_BUCKET = 'task-attachments';
const AVATARS_BUCKET     = 'avatars';

// ─── SVG ICON LIBRARY ─────────────────────────────────────────────────────────
const ICONS = {
  edit:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  comment: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  calendar:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  clock:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  clip:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  eye:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser        = null;   // Supabase auth user, or null
let myTeams            = [];     // [{ id, name, invite_code, max_users, role, display_name }]
let currentTeam        = null;   // { id, name, invite_code, max_users, created_by }
let myMembership       = null;   // full team_members row for currentUser in currentTeam
let members            = {};     // { user_id: { display_name, role, photo_url, joined_at } }
let tasks              = {};     // { task_id: task }
let commentCounts      = {};
let allNotifications   = {};
let knownNotifIds      = null;
let editingTaskId      = null;
let detailTaskId       = null;
let draggedId          = null;

let tasksChannel        = null;
let commentsChannel     = null;
let taskCommentsChannel = null;
let notifChannel        = null;
let membersChannel      = null;
let teamChannel         = null;
let dmChannel           = null;

let currentFilter       = 'all';
let currentUserFilter   = 'all';
let customDateStart     = null;
let customDateEnd       = null;
let colPriorityFilter   = { todo: 'all', inprogress: 'all', done: 'all', overdue: 'all' };
let sidebarLimit        = 10;
let pendingDeleteId     = null;
let pendingDeleteMemberUid = null;
let pendingResourceFiles = [];
let pendingResourceLinks = [''];
let pendingAfterLogin   = null;

// Direct messages
let dmMessages       = [];    // all of my DM rows in the current team
let dmActivePeerId   = null;
let dmActivePeerName = null;

let _resolveTasksLoaded;
const tasksLoaded = new Promise(r => { _resolveTasksLoaded = r; });

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const escHtml = str =>
  String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const formatDate = dateStr => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  return `${m}-${d}-${y}`;
};

const fmtTimestamp = ts => ts
  ? new Date(Number(ts)).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  : null;

const isOverdue = dateStr => {
  if (!dateStr) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(dateStr + 'T00:00:00') < today;
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTaskResources(task) {
  if (task.resources && task.resources.length) return task.resources;
  return [];
}

let toastTimer = null;
function showToast(msg, duration = 3000) {
  let el = document.getElementById('appToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appToast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), duration);
}

const byNewest = (a, b) => b.createdAt - a.createdAt;

const COLORS = ['#4f46e5','#7c3aed','#db2777','#dc2626','#d97706','#059669','#0284c7','#0e7490'];
const avatarColor = name => {
  let h = 0;
  for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return COLORS[h % COLORS.length];
};
const initials = name => (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

// Look a team member up by user id and render their avatar chip.
function avatarHtml(uid, lg = false) {
  const cls = `avatar${lg ? ' avatar-lg' : ''}`;
  const m   = members[uid];
  const name = m?.display_name || 'Unknown';
  if (m?.photo_url) {
    return `<img class="${cls} avatar-photo" src="${escHtml(m.photo_url)}" alt="${escHtml(initials(name))}">`;
  }
  return `<span class="${cls}" style="background:${avatarColor(name)}">${initials(name)}</span>`;
}
function memberName(uid) { return members[uid]?.display_name || 'Unknown'; }

// Map a Postgres team_tasks row to the in-memory shape the renderer expects.
function rowToTask(row) {
  return {
    title:              row.title,
    desc:               row.description || '',
    priority:           row.priority,
    status:             row.status,
    scheduledFor:       row.scheduled_for,
    due:                row.due_date,
    resources:          row.resources || [],
    assignedTo:         row.assigned_to,
    createdBy:          row.created_by,
    createdAt:          new Date(row.created_at).getTime(),
    overdueNotifiedAt:  row.overdue_notified_at ? new Date(row.overdue_notified_at).getTime() : null,
  };
}

function memberRowToObj(row) {
  return { display_name: row.display_name, role: row.role, photo_url: row.photo_url, joined_at: new Date(row.joined_at).getTime() };
}

function notifRowToObj(row) {
  return { message: row.message, taskId: row.task_id, actorId: row.actor_id, read: row.read, createdAt: new Date(row.created_at).getTime() };
}

// Extract the storage object path from a public attachment URL, e.g.
// ".../storage/v1/object/public/task-attachments/<uid>/<file>" → "<uid>/<file>"
function storagePathFromUrl(url, bucket) {
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

async function deleteResourceFiles(resources) {
  const paths = (resources || [])
    .filter(r => r.type === 'file')
    .map(r => storagePathFromUrl(r.url, ATTACHMENTS_BUCKET))
    .filter(Boolean);
  if (paths.length) {
    try { await supabase.storage.from(ATTACHMENTS_BUCKET).remove(paths); } catch {}
  }
}

function isTaskOwner(task) {
  if (!currentUser) return false;
  return task.createdBy === currentUser.id || task.assignedTo === currentUser.id;
}

// ─── DATE FILTER LOGIC ────────────────────────────────────────────────────────
function weekRange(offset = 0) {
  const today = new Date(); today.setHours(0,0,0,0);
  const dow   = today.getDay();
  const toMon = (dow === 0 ? -6 : 1 - dow) + offset * 7;
  const start = new Date(today); start.setDate(today.getDate() + toMon);
  const end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  return { start, end };
}

function taskMatchesFilter(task) {
  if (currentFilter === 'all') return true;
  const today = new Date(); today.setHours(0,0,0,0);
  if (currentFilter === 'overdue') {
    if (!task.due) return false;
    return new Date(task.due + 'T00:00:00') < today;
  }
  const d = task.scheduledFor
    ? new Date(task.scheduledFor + 'T00:00:00')
    : (() => { const t = new Date(Number(task.createdAt) || Date.now()); t.setHours(0,0,0,0); return t; })();
  if (currentFilter === 'custom') {
    const from = customDateStart ? new Date(customDateStart + 'T00:00:00') : null;
    const to   = customDateEnd   ? new Date(customDateEnd   + 'T23:59:59') : null;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  }
  if (currentFilter === 'today')      { const e = new Date(today); e.setHours(23,59,59,999); return d >= today && d <= e; }
  if (currentFilter === 'this-week')  { const { start, end } = weekRange(0);  return d >= start && d <= end; }
  if (currentFilter === 'next-week')  { const { start, end } = weekRange(1);  return d >= start && d <= end; }
  if (currentFilter === 'last-week')  { const { start, end } = weekRange(-1); return d >= start && d <= end; }
  if (currentFilter === 'this-month') {
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }
  return true;
}

const FILTER_LABELS = {
  'today':'Today','this-week':'This week','next-week':'Next week',
  'last-week':'Last week','this-month':'This month','overdue':'Overdue','custom':'Custom range',
};

// ─── AUTH OVERLAY ─────────────────────────────────────────────────────────────
function setActiveStep(activeId) {
  ['stepAuth','stepTeamSetup','stepPayment'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === activeId ? '' : 'none';
  });
}

function showAuthOverlay() {
  document.getElementById('userOverlay').classList.add('open');
  document.getElementById('userOverlayClose').style.display = '';
  setActiveStep('stepAuth');
  document.getElementById('loginErr').textContent  = '';
  document.getElementById('signupErr').textContent = '';
  const pendingCode = localStorage.getItem('ab_pending_invite_code');
  if (pendingCode) {
    document.getElementById('preInviteSection').style.display = '';
    document.getElementById('preInviteCode').value = pendingCode;
  }
}

// "Have an invite code?" toggle on the login/signup screen — lets someone
// stash a code *before* they even have an account, so once they're logged
// in they land straight on the pre-filled Join step instead of a generic
// "create or join a team" screen with no context.
document.getElementById('haveInviteCodeToggle').addEventListener('click', () => {
  const section = document.getElementById('preInviteSection');
  const opening = section.style.display === 'none';
  section.style.display = opening ? '' : 'none';
  if (opening) document.getElementById('preInviteCode').focus();
});
document.getElementById('preInviteCode').addEventListener('input', e => {
  const v = e.target.value.trim();
  if (v) localStorage.setItem('ab_pending_invite_code', v);
  else localStorage.removeItem('ab_pending_invite_code');
});

function hideAuthOverlay() {
  document.getElementById('userOverlay').classList.remove('open');
  sidebarLimit = 10;
  if (pendingAfterLogin) {
    const fn = pendingAfterLogin;
    pendingAfterLogin = null;
    fn();
  }
}

function showTeamSetupStep() {
  document.getElementById('userOverlay').classList.add('open');
  document.getElementById('userOverlayClose').style.display = myTeams.length ? '' : 'none';
  setActiveStep('stepTeamSetup');
  document.getElementById('teamSetupSub').textContent = currentUser
    ? `Signed in as ${currentUser.email}`
    : 'Create a new team or join one with an invite code';
  document.getElementById('createTeamName').value    = '';
  document.getElementById('createDisplayName').value = '';
  document.getElementById('teamSizeSelect').value     = '2';
  document.getElementById('createError').textContent  = '';
  document.getElementById('joinInviteCode').value     = '';
  document.getElementById('joinDisplayName').value    = '';
  document.getElementById('joinError').textContent    = '';
  updatePlanInfo();
}

async function handleLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginErr');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Please enter your email and password.'; return; }

  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Logging in…';
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Log In';
  if (error) { errEl.textContent = error.message; return; }
}

async function handleSignup() {
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const errEl    = document.getElementById('signupErr');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Please enter an email and password.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }

  const btn = document.getElementById('signupBtn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  btn.disabled = false; btn.textContent = 'Create Free Account';
  if (error) { errEl.textContent = error.message; return; }

  if (!data.session) {
    errEl.style.color = '#16a34a';
    errEl.textContent = 'Account created! Check your email to confirm it, then log in.';
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('loginEmail').value.trim();
  const errEl = document.getElementById('loginErr');
  if (!email) { errEl.textContent = 'Enter your email above first, then click "Forgot password?".'; return; }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
  errEl.style.color = error ? '' : '#16a34a';
  errEl.textContent = error ? error.message : 'Password reset email sent — check your inbox.';
}

document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('signupBtn').addEventListener('click', handleSignup);
document.getElementById('forgotPasswordBtn').addEventListener('click', handleForgotPassword);
[['loginEmail','loginPassword'], ['signupEmail','signupPassword']].flat().forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (id.startsWith('login')) handleLogin(); else handleSignup();
  });
});
document.getElementById('userOverlayClose').addEventListener('click', () => {
  pendingAfterLogin = null;
  document.getElementById('userOverlay').classList.remove('open');
});
document.getElementById('guestSignInBtn')?.addEventListener('click', () => {
  if (!currentUser) showAuthOverlay();
  else showTeamSetupStep();
});
document.getElementById('teamSetupLogoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  showAuthOverlay();
});

// ─── PLAN INFO / PRICING (unchanged from the legacy Firebase build) ──────────
const PLAN_INFO = {
  '2':  { label: 'Free forever',  note: 'No credit card required',         cls: 'free' },
  '5':  { label: '$15/month',     note: 'Billed monthly · cancel anytime', cls: 'paid' },
  '10': { label: '$30/month',     note: 'Billed monthly · cancel anytime', cls: 'paid' },
  '15': { label: '$50/month',     note: 'Billed monthly · cancel anytime', cls: 'paid' },
  '20': { label: '$70/month',     note: 'Billed monthly · cancel anytime', cls: 'paid' },
};

// ─── STRIPE PAYMENT LINKS ─────────────────────────────────────────────────────
const STRIPE_LINKS = {
  '5':  'https://buy.stripe.com/4gMdR97pOa04faA4uad7q01',   // Starter  – $15/mo, up to 5 users
  '10': 'PASTE_YOUR_STRIPE_LINK_FOR_GROWTH_HERE',    // Growth   – $30/mo, up to 10 users
  '15': 'PASTE_YOUR_STRIPE_LINK_FOR_TEAM_HERE',      // Team     – $50/mo, up to 15 users
  '20': 'PASTE_YOUR_STRIPE_LINK_FOR_BUSINESS_HERE',  // Business – $70/mo, up to 20 users
};

const PLAN_NAMES  = { '5': 'Starter', '10': 'Growth', '15': 'Team', '20': 'Business' };
const PLAN_PRICES = { '5': '$15/month', '10': '$30/month', '15': '$50/month', '20': '$70/month' };
const PLAN_FEATURES = {
  '5':  ['Task assignment with instant notifications', 'Comments & real-time threads', 'File & link attachments', 'Due dates & overdue tracking', 'Flat rate — not per user'],
  '10': ['Everything in Starter', 'Up to 10 team members', 'Flat rate — not per user'],
  '15': ['Everything in Growth', 'Up to 15 team members', 'Flat rate — not per user'],
  '20': ['Everything in Team', 'Up to 20 team members', 'Flat rate — not per user'],
};
function updatePlanInfo() {
  const sel  = document.getElementById('teamSizeSelect');
  const info = document.getElementById('planInfo');
  if (!sel || !info) return;
  const p = PLAN_INFO[sel.value] || PLAN_INFO['2'];
  info.innerHTML = `<span class="plan-badge plan-badge--${p.cls}">${p.label}</span>${p.note}`;
}
document.getElementById('teamSizeSelect')?.addEventListener('change', updatePlanInfo);

// ─── UPGRADE MODAL ─────────────────────────────────────────────────────────────
function openUpgradeModal()  { document.getElementById('upgradeOverlay')?.classList.add('open'); }
function closeUpgradeModal() { document.getElementById('upgradeOverlay')?.classList.remove('open'); }
document.getElementById('upgradeClose')?.addEventListener('click', closeUpgradeModal);
document.getElementById('upgradeCancel')?.addEventListener('click', closeUpgradeModal);
document.getElementById('upgradeOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeUpgradeModal(); });

// ─── CREATE / JOIN A TEAM ─────────────────────────────────────────────────────
async function handleCreateTeamSubmit() {
  const errEl       = document.getElementById('createError');
  errEl.textContent = '';
  const teamName    = document.getElementById('createTeamName').value.trim();
  const displayName = document.getElementById('createDisplayName').value.trim();
  const teamSize    = parseInt(document.getElementById('teamSizeSelect').value, 10);

  if (!teamName)    { errEl.textContent = 'Please enter a team name.';         return; }
  if (!displayName) { errEl.textContent = 'Please enter your display name.';  return; }

  if (teamSize > 2) {
    const stripeLink = STRIPE_LINKS[String(teamSize)];
    if (!stripeLink || stripeLink.startsWith('PASTE_YOUR')) {
      errEl.textContent = 'Payments are not configured yet. Contact the site admin.';
      return;
    }
    localStorage.setItem('ab_pending_team', JSON.stringify({ teamName, displayName, teamSize, savedAt: Date.now() }));
    showPaymentStep(teamSize);
    return;
  }

  await doCreateTeam({ teamName, displayName, teamSize });
}

async function doCreateTeam({ teamName, displayName, teamSize }) {
  const errEl = document.getElementById('createError');
  const btn   = document.getElementById('createTeamBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  try {
    const { data: team, error } = await supabase.rpc('create_team', {
      _name: teamName, _display_name: displayName, _max_users: teamSize,
    });
    if (error) throw error;
    localStorage.removeItem('ab_pending_team');
    localStorage.removeItem('ab_pending_invite_code');
    localStorage.setItem('ab_last_team_id', team.id);
    await loadMyTeams();
    const entry = myTeams.find(t => t.id === team.id) || team;
    await enterTeam(entry);
    hideAuthOverlay();
  } catch (e) {
    if (errEl) errEl.textContent = e.message || 'Error creating team. Please try again.';
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Create Team'; }
  }
}

async function handleJoinTeamSubmit() {
  const errEl       = document.getElementById('joinError');
  errEl.textContent = '';
  const code        = document.getElementById('joinInviteCode').value.trim();
  const displayName = document.getElementById('joinDisplayName').value.trim();
  if (!code)        { errEl.textContent = 'Please enter an invite code.'; return; }
  if (!displayName) { errEl.textContent = 'Please enter your display name.'; return; }

  const btn = document.getElementById('joinTeamBtn');
  btn.disabled = true; btn.textContent = 'Joining…';
  try {
    const { data: team, error } = await supabase.rpc('redeem_invite_code', {
      _code: code, _display_name: displayName,
    });
    if (error) throw error;
    localStorage.setItem('ab_last_team_id', team.id);
    localStorage.removeItem('ab_pending_invite_code');
    await loadMyTeams();
    const entry = myTeams.find(t => t.id === team.id) || team;
    await enterTeam(entry);
    hideAuthOverlay();
  } catch (e) {
    errEl.textContent = e.message || 'Could not join that team.';
  } finally {
    btn.disabled = false; btn.textContent = 'Join Team';
  }
}

document.getElementById('createTeamBtn').addEventListener('click', handleCreateTeamSubmit);
document.getElementById('joinTeamBtn').addEventListener('click', handleJoinTeamSubmit);

// ─── PAYMENT STEP ─────────────────────────────────────────────────────────────
function showPaymentStep(teamSize) {
  const key   = String(teamSize);
  const name  = PLAN_NAMES[key]  || 'Paid Plan';
  const price = PLAN_PRICES[key] || '';
  const feats = PLAN_FEATURES[key] || [];

  document.getElementById('paymentPlanSub').textContent = `${name} Plan · ${price} · Up to ${teamSize} users`;
  document.getElementById('paymentSummary').innerHTML = `
    <ul class="payment-features-list">
      ${feats.map(f => `<li>${escHtml(f)}</li>`).join('')}
    </ul>`;
  document.getElementById('paymentError').textContent = '';

  document.getElementById('payNowBtn').onclick = () => {
    const url    = STRIPE_LINKS[key];
    const params = new URLSearchParams();
    if (currentUser?.email) params.set('prefilled_email', currentUser.email);
    window.location.href = params.toString() ? `${url}?${params.toString()}` : url;
  };

  setActiveStep('stepPayment');
}

document.getElementById('backFromPaymentBtn')?.addEventListener('click', () => {
  localStorage.removeItem('ab_pending_team');
  setActiveStep('stepTeamSetup');
});

// Returns true if a Stripe redirect was handled (so callers can skip the
// normal "load my teams" flow for this page load).
async function handlePaymentReturn() {
  const p = new URLSearchParams(window.location.search);
  if (p.get('payment_ok') === '1') {
    const plan    = p.get('plan');
    const pending = JSON.parse(localStorage.getItem('ab_pending_team') || 'null');
    history.replaceState({}, '', window.location.pathname);

    if (!currentUser) {
      showAuthOverlay();
      showToast('Please log in, then finish creating your team.', 5000);
      return true;
    }
    if (pending && (!plan || String(pending.teamSize) === plan) && (Date.now() - pending.savedAt) < 7_200_000) {
      showTeamSetupStep();
      document.getElementById('createError').textContent = 'Payment confirmed — creating your team…';
      await doCreateTeam(pending);
    } else {
      localStorage.removeItem('ab_pending_team');
      showTeamSetupStep();
      showToast('Payment received but setup data expired — please create your team again.', 5000);
    }
    return true;
  }
  if (p.get('payment_cancelled') === '1') {
    history.replaceState({}, '', window.location.pathname);
    localStorage.removeItem('ab_pending_team');
    if (currentUser) showTeamSetupStep(); else showAuthOverlay();
    showToast('Payment was cancelled. You can try again anytime.', 4000);
    return true;
  }
  return false;
}

// ─── PRICING CARD (marketing section) ─────────────────────────────────────────
const PRICING_CARD_DATA = {
  '2':  { name: 'Free',     tagline: 'For small teams just getting started', amount: '$0',  seats: 'Up to 2 users · forever free',       cta: 'Get Started Free' },
  '5':  { name: 'Starter',  tagline: 'For small teams ready to grow',        amount: '$15', seats: 'Up to 5 users · flat team rate',       cta: 'Get Starter'      },
  '10': { name: 'Growth',   tagline: 'Best value for most teams',            amount: '$30', seats: 'Up to 10 users · flat team rate',      cta: 'Get Growth'       },
  '15': { name: 'Team',     tagline: 'For established, larger teams',        amount: '$50', seats: 'Up to 15 users · flat team rate',      cta: 'Get Team'         },
  '20': { name: 'Business', tagline: 'For large, high-output teams',         amount: '$70', seats: 'Up to 20 users · flat team rate',      cta: 'Get Business'     },
};
function updatePricingCard() {
  const sel = document.getElementById('pricingPlanSelect');
  if (!sel) return;
  const d = PRICING_CARD_DATA[sel.value] || PRICING_CARD_DATA['2'];
  document.getElementById('pricingPlanName').textContent    = d.name;
  document.getElementById('pricingPlanTagline').textContent = d.tagline;
  document.getElementById('pricingPriceAmount').textContent = d.amount;
  document.getElementById('pricingPlanSeats').textContent   = d.seats;
  const btn = document.getElementById('pricingCtaBtn');
  if (btn) { btn.textContent = d.cta; btn.dataset.plan = sel.value; }
}
document.getElementById('pricingPlanSelect')?.addEventListener('change', updatePricingCard);

document.getElementById('pricingCtaBtn')?.addEventListener('click', () => {
  const plan = document.getElementById('pricingCtaBtn')?.dataset.plan;
  const open = () => {
    showTeamSetupStep();
    if (plan && plan !== '2') {
      const sel = document.getElementById('teamSizeSelect');
      if (sel) { sel.value = plan; updatePlanInfo(); }
    }
  };
  if (!currentUser) { pendingAfterLogin = open; showAuthOverlay(); }
  else open();
});

// ─── LOAD / SWITCH TEAMS ──────────────────────────────────────────────────────
async function loadMyTeams() {
  const { data, error } = await supabase
    .from('team_members')
    .select('team_id, role, display_name, teams(id, name, invite_code, max_users, created_by, created_at)')
    .eq('user_id', currentUser.id);
  if (error) { console.error(error); myTeams = []; return; }
  myTeams = (data || [])
    .filter(row => row.teams)
    .map(row => ({ ...row.teams, role: row.role, display_name: row.display_name }));
}

function populateTeamSwitcher() {
  const sel = document.getElementById('teamSwitcher');
  if (!sel) return;
  if (!myTeams.length) { sel.style.display = 'none'; return; }
  sel.style.display = '';
  sel.innerHTML = myTeams.map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join('') +
    `<option value="__new__">+ New / Join Team…</option>`;
  if (currentTeam) sel.value = currentTeam.id;
}

document.getElementById('teamSwitcher')?.addEventListener('change', async e => {
  const val = e.target.value;
  if (val === '__new__') {
    if (currentTeam) e.target.value = currentTeam.id;
    showTeamSetupStep();
    return;
  }
  const team = myTeams.find(t => t.id === val);
  if (team) await enterTeam(team);
});

async function enterTeam(team) {
  currentTeam = team;
  localStorage.setItem('ab_last_team_id', team.id);

  const { data: memRow } = await supabase
    .from('team_members').select('*').eq('team_id', team.id).eq('user_id', currentUser.id).maybeSingle();
  myMembership = memRow || { team_id: team.id, user_id: currentUser.id, display_name: team.display_name, role: team.role };

  document.getElementById('guestBanner').style.display  = 'none';
  document.querySelector('.board-wrapper').style.display = '';
  populateTeamSwitcher();
  updateHeaderUser();
  await subscribeToTeam();
}

// ─── TEAM SUBSCRIPTIONS ───────────────────────────────────────────────────────
function unsubscribeTeam() {
  [tasksChannel, commentsChannel, notifChannel, taskCommentsChannel, membersChannel, teamChannel, dmChannel]
    .forEach(ch => { if (ch) supabase.removeChannel(ch); });
  tasksChannel = commentsChannel = notifChannel = taskCommentsChannel = membersChannel = teamChannel = dmChannel = null;
}

async function subscribeToTeam() {
  unsubscribeTeam();
  if (!currentTeam) return;
  const teamId = currentTeam.id;

  // ── Members roster ──
  const { data: memberRows } = await supabase.from('team_members').select('*').eq('team_id', teamId);
  members = {};
  (memberRows || []).forEach(row => { members[row.user_id] = memberRowToObj(row); });
  populateAssigneeDropdown();
  populateUserFilter();
  updateHeaderUser();
  if (document.getElementById('profileOverlay')?.classList.contains('open')) renderAdminSection();

  membersChannel = supabase.channel(`team-members-${teamId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members', filter: `team_id=eq.${teamId}` }, payload => {
      if (payload.eventType === 'DELETE') { delete members[payload.old.user_id]; }
      else { members[payload.new.user_id] = memberRowToObj(payload.new); }
      populateAssigneeDropdown();
      populateUserFilter();
      renderBoard();
      updateHeaderUser();
      renderDmContacts();
      if (document.getElementById('profileOverlay')?.classList.contains('open')) renderAdminSection();
    })
    .subscribe();

  // ── Team row itself (rename / invite code regen / plan change) ──
  teamChannel = supabase.channel(`team-${teamId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${teamId}` }, payload => {
      currentTeam = { ...currentTeam, ...payload.new };
      const idx = myTeams.findIndex(t => t.id === teamId);
      if (idx !== -1) myTeams[idx] = { ...myTeams[idx], ...payload.new };
      populateTeamSwitcher();
      if (document.getElementById('profileOverlay')?.classList.contains('open')) renderAdminSection();
    })
    .subscribe();

  // ── Tasks ──
  const { data: taskRows } = await supabase.from('team_tasks').select('*').eq('team_id', teamId);
  tasks = {};
  (taskRows || []).forEach(row => { tasks[row.id] = rowToTask(row); });
  _resolveTasksLoaded();
  currentUserFilter = currentUser.id;
  renderBoard();
  checkAndNotifyOverdue();

  tasksChannel = supabase.channel(`team-tasks-${teamId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_tasks', filter: `team_id=eq.${teamId}` }, payload => {
      if (payload.eventType === 'DELETE') { delete tasks[payload.old.id]; }
      else { tasks[payload.new.id] = rowToTask(payload.new); }
      renderBoard();
    })
    .subscribe();

  // ── Comment counts (board-wide) ──
  const { data: commentRows } = await supabase.from('team_comments').select('task_id').eq('team_id', teamId);
  commentCounts = {};
  (commentRows || []).forEach(c => { commentCounts[c.task_id] = (commentCounts[c.task_id] || 0) + 1; });
  renderBoard();

  commentsChannel = supabase.channel(`team-comments-${teamId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_comments', filter: `team_id=eq.${teamId}` }, payload => {
      const tid = payload.new.task_id;
      commentCounts[tid] = (commentCounts[tid] || 0) + 1;
      renderBoard();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'team_comments', filter: `team_id=eq.${teamId}` }, payload => {
      const tid = payload.old.task_id;
      if (commentCounts[tid]) commentCounts[tid]--;
      renderBoard();
    })
    .subscribe();

  await setupNotifListener();
  await setupDmListener();
}

// ─── HEADER USER DISPLAY ──────────────────────────────────────────────────────
function updateHeaderUser() {
  const logoutBtn     = document.getElementById('changeUserBtn');
  const currentUserEl = document.getElementById('currentUserBtn');
  if (!currentUser) {
    document.getElementById('userNameDisplay').textContent = '';
    document.getElementById('userAvatar').innerHTML = '';
    logoutBtn.style.display     = 'none';
    currentUserEl.style.display = 'none';
    return;
  }
  logoutBtn.style.display     = '';
  currentUserEl.style.display = '';
  const name = myMembership?.display_name || currentUser.email;
  document.getElementById('userNameDisplay').textContent = name;
  document.getElementById('userAvatar').innerHTML = myMembership
    ? avatarHtml(currentUser.id, true)
    : `<span class="avatar avatar-lg" style="background:${avatarColor(name)}">${initials(name)}</span>`;
}

function populateAssigneeDropdown() {
  const sel  = document.getElementById('taskAssignee');
  const prev = sel.value;
  sel.innerHTML = '<option value="">Unassigned</option>' +
    Object.entries(members)
      .sort(([,a],[,b]) => a.display_name.localeCompare(b.display_name))
      .map(([id, m]) => `<option value="${id}">${escHtml(m.display_name)}</option>`).join('');
  sel.value = prev;
}

function populateUserFilter() {
  const sel  = document.getElementById('userFilter');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="all">All users</option>' +
    '<option value="unassigned">Unassigned</option>' +
    Object.entries(members)
      .sort(([,a],[,b]) => a.display_name.localeCompare(b.display_name))
      .map(([id, m]) => `<option value="${id}">${escHtml(m.display_name)}</option>`).join('');
  if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
}

// ─── BOARD ────────────────────────────────────────────────────────────────────
function renderBoard() {
  const dateSel = document.getElementById('dateFilter');
  const userSel = document.getElementById('userFilter');
  if (dateSel) { dateSel.value = currentFilter;     dateSel.classList.toggle('active', currentFilter !== 'all'); }
  if (userSel) { userSel.value = currentUserFilter; userSel.classList.toggle('active', currentUserFilter !== 'all'); }

  const bar   = document.getElementById('filterBar');
  const label = document.getElementById('filterBarLabel');
  const parts = [];
  if (currentUserFilter === 'unassigned') {
    parts.push('Unassigned tasks');
  } else if (currentUserFilter !== 'all' && currentUserFilter !== currentUser?.id) {
    parts.push(members[currentUserFilter] ? `${memberName(currentUserFilter)}'s tasks` : 'Unknown user');
  } else if (currentUserFilter === currentUser?.id) {
    parts.push('My tasks');
  }
  if (currentFilter === 'custom') {
    const fmt = s => s ? new Date(s + 'T00:00:00').toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' }) : '…';
    parts.push(`${fmt(customDateStart)} - ${fmt(customDateEnd)}`);
  } else if (currentFilter !== 'all') {
    parts.push(FILTER_LABELS[currentFilter] || currentFilter);
  }
  bar.classList.toggle('visible', parts.length > 0);
  label.textContent = parts.length ? `Showing: ${parts.join(' · ')}` : '';

  ['todo', 'inprogress', 'done', 'overdue'].forEach(col => {
    const sel = document.getElementById('pf-' + col);
    if (sel) sel.classList.toggle('active', colPriorityFilter[col] !== 'all');
  });

  ['todo', 'inprogress', 'done'].forEach(status => {
    const list  = document.getElementById('list-'  + status);
    const count = document.getElementById('count-' + status);
    const cols  = Object.entries(tasks)
      .filter(([, t]) => t.status === status)
      .map(([id, t]) => ({ id, ...t }))
      .filter(t => status === 'done' || !isOverdue(t.due))
      .filter(t => taskMatchesFilter(t))
      .filter(t => currentUserFilter === 'all' || (currentUserFilter === 'unassigned' ? !t.assignedTo : t.assignedTo === currentUserFilter))
      .filter(t => colPriorityFilter[status] === 'all' || t.priority === colPriorityFilter[status])
      .sort(byNewest);

    count.textContent = cols.length;
    list.innerHTML = '';
    if (!cols.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </div>${parts.length ? 'No tasks in this range' : 'No tasks yet'}</div>`;
    } else {
      cols.forEach(t => list.appendChild(buildCard(t)));
    }
  });

  const overdueList  = document.getElementById('list-overdue');
  const overdueCount = document.getElementById('count-overdue');
  const overdueTasks = Object.entries(tasks)
    .filter(([, t]) => t.status !== 'done' && isOverdue(t.due))
    .map(([id, t]) => ({ id, ...t }))
    .filter(t => currentUserFilter === 'all' || (currentUserFilter === 'unassigned' ? !t.assignedTo : t.assignedTo === currentUserFilter))
    .filter(t => colPriorityFilter.overdue === 'all' || t.priority === colPriorityFilter.overdue)
    .sort(byNewest);

  overdueCount.textContent = overdueTasks.length;
  overdueList.innerHTML = '';
  if (!overdueTasks.length) {
    overdueList.innerHTML = `<div class="empty-state"><div class="empty-icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>No overdue tasks</div>`;
  } else {
    overdueTasks.forEach(t => overdueList.appendChild(buildCard(t)));
  }
}

function buildCard(task) {
  const overdue  = isOverdue(task.due);
  const assignee = task.assignedTo && members[task.assignedTo] ? task.assignedTo : null;
  const owned    = isTaskOwner(task);
  const cCount   = commentCounts[task.id] || 0;
  const hasRes   = !!(task.resources && task.resources.length);

  const card = document.createElement('div');
  card.className = 'task-card';
  card.dataset.id = task.id;

  if (owned) {
    card.draggable = true;
    card.style.cursor = 'grab';
  }

  card.innerHTML = `
    <div class="task-card-header">
      <span class="task-title">${escHtml(task.title)}</span>
      ${owned ? `<div class="card-actions">
        <button class="btn-icon edit"   title="Edit"   data-id="${task.id}">${ICONS.edit}</button>
        <button class="btn-icon delete" title="Delete" data-id="${task.id}">${ICONS.trash}</button>
      </div>` : ''}
    </div>
    ${task.desc ? `<div class="task-desc">${escHtml(task.desc)}</div>` : ''}
    <div class="task-card-footer">
      <span class="priority-badge priority-${task.priority}">${task.priority}</span>
      <div class="card-meta">
        ${task.due ? `<span class="due-date ${overdue?'overdue':''}">${ICONS.calendar} ${formatDate(task.due)}</span>` : ''}
        ${task.createdAt ? `<span class="created-date">${ICONS.clock} ${fmtTimestamp(task.createdAt)}</span>` : ''}
        ${assignee ? `<span class="assignee-chip">${avatarHtml(assignee)}<span>${escHtml(memberName(assignee))}</span></span>` : ''}
        <span class="comment-count" title="${cCount} comment${cCount === 1 ? '' : 's'}">${ICONS.comment} ${cCount}</span>
        ${hasRes ? `<span class="resource-indicator" title="Has attachment">${ICONS.clip}</span>` : ''}
      </div>
    </div>`;

  if (owned) {
    card.querySelector('.btn-icon.edit').addEventListener('click', e => { e.stopPropagation(); openEdit(task.id); });
    card.querySelector('.btn-icon.delete').addEventListener('click', e => { e.stopPropagation(); deleteTask(task.id); });

    card.addEventListener('dragstart', e => {
      draggedId = task.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); draggedId = null; });
  }

  card.addEventListener('click', () => openDetail(task.id));
  return card;
}

// ─── DRAG & DROP ─────────────────────────────────────────────────────────────
document.querySelectorAll('.task-list').forEach(list => {
  list.addEventListener('dragover', e => { e.preventDefault(); list.classList.add('drag-over'); });
  list.addEventListener('dragleave', e => { if (!list.contains(e.relatedTarget)) list.classList.remove('drag-over'); });
  list.addEventListener('drop', async e => {
    e.preventDefault();
    list.classList.remove('drag-over');
    const id = draggedId;
    draggedId = null;
    if (!id || !currentTeam) return;
    const newStatus = list.id.replace('list-', '');
    if (newStatus === 'overdue') return;
    const task = tasks[id];
    if (!task || task.status === newStatus) return;
    if (!isTaskOwner(task)) return;
    const oldStatus = task.status;
    tasks[id] = { ...task, status: newStatus };
    renderBoard();
    await supabase.from('team_tasks').update({ status: newStatus }).eq('id', id);
    if (newStatus === 'done' && oldStatus !== 'done') {
      await notifyParticipants(task, id, `${memberName(currentUser.id)} completed "${task.title}"`);
    }
  });
});

// ─── RESOURCE ATTACHMENTS ─────────────────────────────────────────────────────
function renderLinkRows() {
  const container = document.getElementById('resourceLinksContainer');
  container.innerHTML = pendingResourceLinks.map((url, i) => `
    <div class="resource-link-row">
      <input type="url" class="resource-url-input" value="${escHtml(url)}" placeholder="https://…" data-idx="${i}">
      <button type="button" class="resource-link-remove" data-idx="${i}" title="Remove"${pendingResourceLinks.length === 1 ? ' style="visibility:hidden"' : ''}>&times;</button>
    </div>`).join('');
  container.querySelectorAll('.resource-url-input').forEach(input => {
    input.addEventListener('input', () => { pendingResourceLinks[+input.dataset.idx] = input.value; });
  });
  container.querySelectorAll('.resource-link-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingResourceLinks.splice(+btn.dataset.idx, 1);
      renderLinkRows();
    });
  });
}

function renderFileList() {
  const container = document.getElementById('resourceFileList');
  if (!pendingResourceFiles.length) {
    container.innerHTML = '<span class="no-files-label">No files chosen</span>';
    return;
  }
  const totalSize = pendingResourceFiles.reduce((s, f) => s + (f.size || 0), 0);
  container.innerHTML =
    pendingResourceFiles.map((f, i) => `
      <div class="resource-file-item">
        <span class="resource-file-item-name" title="${escHtml(f.name)}">${escHtml(f.name)}</span>
        ${f.size ? `<span class="resource-file-item-size">${formatSize(f.size)}</span>` : ''}
        <button type="button" class="resource-link-remove" data-idx="${i}" title="Remove">&times;</button>
      </div>`).join('') +
    (totalSize ? `<div class="resource-file-total">${formatSize(totalSize)} / 10 MB</div>` : '');
  container.querySelectorAll('.resource-link-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = +btn.dataset.idx;
      const [removed] = pendingResourceFiles.splice(idx, 1);
      renderFileList();
      if (removed?.path) { try { await supabase.storage.from(ATTACHMENTS_BUCKET).remove([removed.path]); } catch {} }
    });
  });
}

function resetResourceFields() {
  pendingResourceLinks = [''];
  pendingResourceFiles = [];
  document.getElementById('resourceFile').value = '';
  renderLinkRows();
  renderFileList();
}

function populateResourceFields(task) {
  resetResourceFields();
  const resources = getTaskResources(task);
  if (!resources.length) return;
  const linkResources = resources.filter(r => r.type !== 'file');
  const fileResources = resources.filter(r => r.type === 'file');
  if (linkResources.length) { pendingResourceLinks = linkResources.map(r => r.url); renderLinkRows(); }
  if (fileResources.length) {
    pendingResourceFiles = fileResources.map(r => ({ url: r.url, path: storagePathFromUrl(r.url, ATTACHMENTS_BUCKET), name: r.name, size: 0 }));
    renderFileList();
  }
}

document.getElementById('resourceLinkAdd').addEventListener('click', () => {
  pendingResourceLinks.push('');
  renderLinkRows();
  const inputs = document.querySelectorAll('.resource-url-input');
  inputs[inputs.length - 1]?.focus();
});

document.getElementById('resourceFileBtn').addEventListener('click', () => {
  document.getElementById('resourceFile').click();
});

document.getElementById('resourceFile').addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  e.target.value = '';
  if (!files.length || !currentUser) return;
  const MAX_TOTAL = 10 * 1024 * 1024;
  const existingSize = pendingResourceFiles.reduce((s, f) => s + (f.size || 0), 0);
  const newSize = files.reduce((s, f) => s + f.size, 0);
  if (existingSize + newSize > MAX_TOTAL) {
    showToast(`Combined size exceeds the 10 MB limit.`);
    return;
  }

  showToast('Uploading…', 1500);
  for (const file of files) {
    const path = `${currentUser.id}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file);
    if (error) { showToast(`Upload failed: ${error.message}`); continue; }
    const { data } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);
    pendingResourceFiles.push({ url: data.publicUrl, path, name: file.name, size: file.size });
  }
  renderFileList();
});

// ─── TASK CREATE / EDIT MODAL ─────────────────────────────────────────────────
function openNew(defaultStatus = 'todo') {
  editingTaskId = null;
  document.getElementById('modalTitle').textContent = 'New Task';
  document.getElementById('taskForm').reset();
  document.getElementById('taskStatus').value = defaultStatus;
  resetResourceFields();
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('taskTitle').focus();
}

function openEdit(id) {
  const task = tasks[id]; if (!task) return;
  editingTaskId = id;
  document.getElementById('modalTitle').textContent = 'Edit Task';
  document.getElementById('taskTitle').value        = task.title;
  document.getElementById('taskDesc').value         = task.desc || '';
  document.getElementById('taskPriority').value     = task.priority;
  document.getElementById('taskScheduled').value    = task.scheduledFor || '';
  document.getElementById('taskDue').value          = task.due || '';
  document.getElementById('taskStatus').value       = task.status;
  document.getElementById('taskAssignee').value     = task.assignedTo || '';
  populateResourceFields(task);
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('taskTitle').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingTaskId = null;
}

document.getElementById('taskForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentUser || !currentTeam) return;
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) return;

  const linkItems = pendingResourceLinks.map(u => u.trim()).filter(u => u)
    .map(url => {
      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      return { type: 'link', url: normalized, name: url };
    });
  const fileItems = pendingResourceFiles.map(f => ({ type: 'file', url: f.url, name: f.name }));
  const resources = [...linkItems, ...fileItems];

  const newAssignee = document.getElementById('taskAssignee').value || null;
  const newStatus   = document.getElementById('taskStatus').value;

  const row = {
    title,
    description:   document.getElementById('taskDesc').value.trim(),
    priority:      document.getElementById('taskPriority').value,
    scheduled_for: document.getElementById('taskScheduled').value || null,
    due_date:      document.getElementById('taskDue').value || null,
    status:        newStatus,
    assigned_to:   newAssignee,
    resources,
  };
  const local = {
    title, desc: row.description, priority: row.priority, scheduledFor: row.scheduled_for,
    due: row.due_date, status: newStatus, assignedTo: newAssignee, resources,
  };

  if (editingTaskId) {
    const old = tasks[editingTaskId];
    tasks[editingTaskId] = { ...old, ...local };
    closeModal();
    renderBoard();
    await supabase.from('team_tasks').update(row).eq('id', editingTaskId);
    if (newAssignee && newAssignee !== old.assignedTo) {
      await notifyUser(newAssignee, `${memberName(currentUser.id)} assigned "${title}" to you`, editingTaskId);
    }
    if (newStatus === 'done' && old.status !== 'done') {
      await notifyParticipants({ ...old, ...local }, editingTaskId, `${memberName(currentUser.id)} completed "${title}"`);
    }
  } else {
    const newId = crypto.randomUUID();
    tasks[newId] = { ...local, createdBy: currentUser.id, createdAt: Date.now() };
    closeModal();
    renderBoard();
    await supabase.from('team_tasks').insert({ id: newId, team_id: currentTeam.id, created_by: currentUser.id, ...row });
    if (newAssignee) await notifyUser(newAssignee, `${memberName(currentUser.id)} assigned "${title}" to you`, newId);
    if (newStatus === 'done') await notifyParticipants(tasks[newId], newId, `${memberName(currentUser.id)} completed "${title}"`);
  }
});

function deleteTask(id) {
  const task = tasks[id]; if (!task) return;
  pendingDeleteId = id;
  document.getElementById('deleteConfirmTitle').textContent = task.title;
  document.getElementById('deleteConfirmOverlay').classList.add('open');
}

function closeDeleteConfirm() {
  document.getElementById('deleteConfirmOverlay').classList.remove('open');
  pendingDeleteId = null;
}

async function confirmDeleteTask() {
  const id = pendingDeleteId;
  closeDeleteConfirm();
  if (!id) return;
  const task = tasks[id];
  delete tasks[id];
  renderBoard();
  await supabase.from('team_tasks').delete().eq('id', id);
  if (task) await deleteResourceFiles(task.resources);
}

// ─── OVERDUE AUTO-NOTIFY ──────────────────────────────────────────────────────
async function checkAndNotifyOverdue() {
  if (!currentTeam) return;
  const now = Date.now();
  for (const [id, task] of Object.entries(tasks)) {
    if (task.status === 'done')  continue;
    if (task.overdueNotifiedAt)  continue;
    if (!isOverdue(task.due))    continue;
    const msg      = `Task "${task.title}" is now overdue!`;
    const toNotify = new Set([task.createdBy, task.assignedTo].filter(Boolean));
    for (const uid of toNotify) {
      await supabase.from('team_notifications').insert({
        team_id: currentTeam.id, user_id: uid, actor_id: currentUser.id, task_id: id, message: msg, read: false,
      });
    }
    await supabase.from('team_tasks').update({ overdue_notified_at: new Date(now).toISOString() }).eq('id', id);
    tasks[id] = { ...tasks[id], overdueNotifiedAt: now };
  }
}

// ─── FILE PREVIEW ─────────────────────────────────────────────────────────────
function openFilePreview(resource) {
  const overlay = document.getElementById('filePreviewOverlay');
  const nameEl  = document.getElementById('filePreviewName');
  const bodyEl  = document.getElementById('filePreviewBody');
  const dlBtn   = document.getElementById('filePreviewDownload');

  nameEl.textContent = resource.name || 'File';
  dlBtn.href         = resource.url;
  dlBtn.download     = resource.name || 'download';

  const extMatch = (resource.name || resource.url).match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  const mime = resource.mime || {
    jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml',
    pdf:'application/pdf', mp4:'video/mp4', webm:'video/webm', mp3:'audio/mpeg', wav:'audio/wav',
    txt:'text/plain', json:'application/json',
  }[ext] || '';

  if (mime.startsWith('image/')) {
    bodyEl.innerHTML = `<img class="fp-image" src="${resource.url}" alt="${escHtml(resource.name || 'File')}">`;
  } else if (mime === 'application/pdf') {
    bodyEl.innerHTML = `<iframe class="fp-embed" src="${resource.url}" title="${escHtml(resource.name || 'File')}"></iframe>`;
  } else if (mime.startsWith('video/')) {
    bodyEl.innerHTML = `<video class="fp-video" src="${resource.url}" controls></video>`;
  } else if (mime.startsWith('audio/')) {
    bodyEl.innerHTML = `<audio class="fp-audio" src="${resource.url}" controls></audio>`;
  } else {
    bodyEl.innerHTML = `<div class="fp-unsupported"><p>Preview not available.<br>Use the Download button above.</p></div>`;
  }

  overlay.classList.add('open');
}

function closeFilePreview() {
  document.getElementById('filePreviewOverlay').classList.remove('open');
  document.getElementById('filePreviewBody').innerHTML = '';
}

// ─── TASK DETAIL MODAL ────────────────────────────────────────────────────────
async function openDetail(id) {
  if (!id || id === 'undefined' || id === 'null') {
    showToast('This notification is not linked to a task.');
    return false;
  }
  await tasksLoaded;
  let task = tasks[id];
  if (!task && currentTeam) {
    try {
      const { data: row } = await supabase.from('team_tasks').select('*').eq('id', id).maybeSingle();
      if (row) { task = rowToTask(row); tasks[id] = task; }
    } catch (err) { console.error(err); }
  }
  if (!task) {
    showToast('Task not found — it may have been deleted.');
    return false;
  }
  detailTaskId = id;

  const overdue       = isOverdue(task.due);
  const owned         = isTaskOwner(task);
  const taskResources = getTaskResources(task);

  let resourceHtml = '';
  if (taskResources.length) {
    const hasFiles = taskResources.some(r => r.type === 'file');
    const hasLinks = taskResources.some(r => r.type !== 'file');
    const label    = hasFiles && hasLinks ? 'Resources' : hasFiles ? 'Attachments' : 'Links';
    resourceHtml = `<div class="detail-resources-section">
      <span class="detail-resources-label">${label}</span>
      <div class="detail-resources-list">
        ${taskResources.map((r, i) => r.type === 'file'
          ? `<button class="resource-link resource-preview-btn" type="button" data-res-idx="${i}">${ICONS.eye} ${escHtml(r.name || 'File')}</button>`
          : `<a class="resource-link" href="${escHtml(r.url)}" target="_blank" rel="noopener noreferrer">${ICONS.clip} ${escHtml(r.name || r.url)}</a>`
        ).join('')}
      </div>
    </div>`;
  }

  document.getElementById('detailTitle').textContent = task.title;
  document.getElementById('detailBody').innerHTML = `
    <div class="detail-chips">
      <div class="detail-chip">
        <span class="detail-chip-label">Status</span>
        <select class="detail-status-sel" id="detailStatusSel" data-status="${task.status}" ${!owned ? 'disabled' : ''}>
          <option value="todo"       ${task.status==='todo'       ?'selected':''}>To Do</option>
          <option value="inprogress" ${task.status==='inprogress' ?'selected':''}>In Progress</option>
          <option value="done"       ${task.status==='done'       ?'selected':''}>Done</option>
        </select>
        ${owned ? `<button class="btn-sm btn-primary save-status-btn" id="saveStatusBtn" style="display:none">Save</button>` : ''}
      </div>
      <div class="detail-chip">
        <span class="detail-chip-label">Priority</span>
        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
      </div>
      ${task.due ? `<div class="detail-chip">
        <span class="detail-chip-label">Due date</span>
        <span class="detail-due ${overdue?'overdue':''}">${formatDate(task.due)}${overdue?' · overdue':''}</span>
      </div>` : ''}
      ${task.createdAt ? `<div class="detail-chip">
        <span class="detail-chip-label">Created</span>
        <span class="detail-created">${fmtTimestamp(task.createdAt)}</span>
      </div>` : ''}
      ${task.assignedTo && members[task.assignedTo] ? `<div class="detail-chip">
        <span class="detail-chip-label">Assigned to</span>
        <span class="assignee-chip">${avatarHtml(task.assignedTo, true)}<span>${escHtml(memberName(task.assignedTo))}</span></span>
      </div>` : ''}
      ${task.createdBy && members[task.createdBy] ? `<div class="detail-chip">
        <span class="detail-chip-label">Created by</span>
        <span class="assignee-chip">${avatarHtml(task.createdBy, true)}<span>${escHtml(memberName(task.createdBy))}</span></span>
      </div>` : ''}
    </div>
    ${task.desc ? `<p class="detail-desc">${escHtml(task.desc)}</p>` : ''}
    ${resourceHtml}`;

  document.getElementById('detailBody').querySelectorAll('.resource-preview-btn').forEach(btn => {
    const idx = parseInt(btn.dataset.resIdx, 10);
    if (!isNaN(idx) && taskResources[idx]) {
      btn.addEventListener('click', () => openFilePreview(taskResources[idx]));
    }
  });

  if (owned) {
    const sel        = document.getElementById('detailStatusSel');
    const saveBtn    = document.getElementById('saveStatusBtn');
    const origStatus = task.status;
    sel.addEventListener('change', () => {
      sel.dataset.status = sel.value;
      saveBtn.style.display = sel.value !== origStatus ? '' : 'none';
    });
    saveBtn.addEventListener('click', async () => {
      const newStatus = sel.value;
      const oldStatus = tasks[id]?.status;
      saveBtn.disabled = true;
      await supabase.from('team_tasks').update({ status: newStatus }).eq('id', id);
      tasks[id] = { ...tasks[id], status: newStatus };
      saveBtn.style.display = 'none';
      saveBtn.disabled = false;
      renderBoard();
      if (newStatus === 'done' && oldStatus !== 'done') {
        await notifyParticipants(task, id, `${memberName(currentUser.id)} completed "${task.title}"`);
      }
    });
    document.getElementById('detailEditBtn').style.display = '';
    document.getElementById('detailEditBtn').onclick = () => { closeDetail(); openEdit(id); };
  } else {
    document.getElementById('detailEditBtn').style.display = 'none';
  }

  if (taskCommentsChannel) supabase.removeChannel(taskCommentsChannel);
  const { data: initialComments } = await supabase.from('team_comments').select('*').eq('task_id', id).order('created_at', { ascending: true });
  renderCommentsList(initialComments || []);

  taskCommentsChannel = supabase.channel(`team-task-comments-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_comments', filter: `task_id=eq.${id}` }, async () => {
      if (detailTaskId !== id) return;
      const { data: rows } = await supabase.from('team_comments').select('*').eq('task_id', id).order('created_at', { ascending: true });
      renderCommentsList(rows || []);
    })
    .subscribe();

  document.getElementById('detailOverlay').classList.add('open');
  document.getElementById('commentInput').focus();
  return true;
}

function renderCommentsList(rows) {
  const list = document.getElementById('commentsList');
  if (!rows.length) {
    list.innerHTML = '<div class="no-comments">No comments yet. Be the first!</div>';
    return;
  }
  list.innerHTML = rows.map(c => {
    const time = new Date(c.created_at).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const name = memberName(c.author_id);
    return `<div class="comment">
      ${avatarHtml(c.author_id, true)}
      <div class="comment-body">
        <div class="comment-meta"><strong>${escHtml(name)}</strong><span class="comment-time">${time}</span></div>
        <p class="comment-text">${escHtml(c.text)}</p>
      </div>
    </div>`;
  }).join('');
  list.scrollTop = list.scrollHeight;
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
  detailTaskId = null;
  if (taskCommentsChannel) { supabase.removeChannel(taskCommentsChannel); taskCommentsChannel = null; }
}

// ─── COMMENTS ─────────────────────────────────────────────────────────────────
async function postComment() {
  if (!currentUser || !currentTeam || !detailTaskId) return;
  const input = document.getElementById('commentInput');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';

  await supabase.from('team_comments').insert({
    task_id: detailTaskId, team_id: currentTeam.id, author_id: currentUser.id, text,
  });

  const task = tasks[detailTaskId];
  if (task) {
    const recipient = currentUser.id === task.assignedTo ? task.createdBy : task.assignedTo;
    if (recipient && recipient !== currentUser.id) {
      const preview = text.length > 80 ? text.slice(0, 80) + '…' : text;
      await notifyUser(recipient, `${memberName(currentUser.id)} commented on "${task.title}": "${preview}"`, detailTaskId);
    }
  }
}

document.getElementById('postCommentBtn').addEventListener('click', postComment);
document.getElementById('commentInput').addEventListener('keydown', e => { if (e.key === 'Enter') postComment(); });

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────
async function notifyUser(toUserId, message, taskId) {
  if (!toUserId || toUserId === currentUser?.id || !currentTeam) return;
  await supabase.from('team_notifications').insert({
    team_id: currentTeam.id, user_id: toUserId, actor_id: currentUser.id, task_id: taskId || null, message, read: false,
  });
}

async function notifyParticipants(task, taskId, message) {
  if (task.createdBy && task.createdBy !== currentUser?.id) {
    await notifyUser(task.createdBy, message, taskId);
  }
}

async function setupNotifListener() {
  if (notifChannel) supabase.removeChannel(notifChannel);
  const badge = document.getElementById('notifBadge');
  badge.textContent = '';
  badge.classList.remove('visible');
  document.getElementById('notifList').innerHTML = '<div class="no-notifs">No notifications yet</div>';
  if (!currentTeam) return;
  const teamId = currentTeam.id;

  const { data: rows } = await supabase.from('team_notifications').select('*').eq('team_id', teamId).eq('user_id', currentUser.id);
  allNotifications = {};
  (rows || []).forEach(r => { allNotifications[r.id] = notifRowToObj(r); });
  refreshNotifUI();

  notifChannel = supabase.channel(`team-notifications-${teamId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_notifications', filter: `team_id=eq.${teamId}` }, payload => {
      if (payload.eventType === 'DELETE') { delete allNotifications[payload.old.id]; }
      else { allNotifications[payload.new.id] = notifRowToObj(payload.new); }
      refreshNotifUI();
    })
    .subscribe();
}

function refreshNotifUI() {
  const entries = Object.entries(allNotifications).map(([id, n]) => ({ id, ...n }));
  const unread  = entries.filter(n => !n.read);
  const badge   = document.getElementById('notifBadge');
  badge.textContent = unread.length > 9 ? '9+' : String(unread.length);
  badge.classList.toggle('visible', unread.length > 0);

  if (knownNotifIds !== null) {
    const newOnes = entries.filter(n => !n.read && !knownNotifIds.has(n.id));
    if (newOnes.length) playNotificationSound();
  }
  knownNotifIds = new Set(entries.map(n => n.id));

  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  const list = document.getElementById('notifList');
  if (!sorted.length) {
    list.innerHTML = '<div class="no-notifs">No notifications yet</div>';
  } else {
    list.innerHTML = sorted.slice(0, 30).map(n => {
      const time = new Date(n.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      return `<div class="notif-item ${n.read?'':'unread'}" data-id="${n.id}" data-task="${n.taskId || ''}">
        <div class="notif-msg">${escHtml(n.message)}</div>
        <div class="notif-time">${time}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', async () => {
        const nid = item.dataset.id, tid = item.dataset.task;
        closeNotifPanel();
        if (nid && allNotifications[nid] && !allNotifications[nid].read) {
          await supabase.from('team_notifications').update({ read: true }).eq('id', nid);
        }
        if (tid) openDetail(tid);
      });
    });
  }

  renderNotifSidebar(sorted);
}

function closeNotifPanel() { document.getElementById('notifPanel').classList.remove('open'); }

document.getElementById('notifBtn').addEventListener('click', e => {
  e.stopPropagation();
  const panel = document.getElementById('notifPanel');
  if (window.innerWidth <= 640) {
    const rect = e.currentTarget.getBoundingClientRect();
    panel.style.top = (rect.bottom + 8) + 'px';
  }
  panel.classList.toggle('open');
});

document.getElementById('markAllRead').addEventListener('click', async () => {
  if (!currentTeam) return;
  const unreadIds = Object.entries(allNotifications).filter(([, n]) => !n.read).map(([id]) => id);
  if (unreadIds.length) await supabase.from('team_notifications').update({ read: true }).in('id', unreadIds);
});

document.addEventListener('click', e => {
  if (!e.target.closest('.notif-wrapper')) closeNotifPanel();
});

// ─── ACTIVITY SIDEBAR ─────────────────────────────────────────────────────────
function renderNotifSidebar(sortedEntries) {
  const body = document.getElementById('notifSidebarBody');
  if (!body) return;

  if (!currentTeam) {
    body.innerHTML = '<div class="sidebar-empty">Sign in to see your activity</div>';
    return;
  }
  const all = sortedEntries || Object.entries(allNotifications).map(([id, n]) => ({ id, ...n })).sort((a, b) => b.createdAt - a.createdAt);
  if (!all.length) {
    body.innerHTML = '<div class="sidebar-empty">No activity yet</div>';
    return;
  }

  const visible = all.slice(0, sidebarLimit);
  const hasMore = all.length > sidebarLimit;

  body.innerHTML = visible.map(n => {
    const time = new Date(n.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    return `<div class="sidebar-notif-item ${n.read ? '' : 'unread'}" data-task="${n.taskId || ''}" data-id="${n.id}">
      <div class="sidebar-notif-msg">${escHtml(n.message)}</div>
      <div class="sidebar-notif-time">${time}</div>
    </div>`;
  }).join('') + (hasMore ? `<button class="sidebar-show-more" id="sidebarShowMore">Show more</button>` : '');

  body.querySelectorAll('.sidebar-notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      const taskId = item.dataset.task, notifId = item.dataset.id;
      const found  = await openDetail(taskId);
      if (found && notifId && allNotifications[notifId] && !allNotifications[notifId].read) {
        await supabase.from('team_notifications').update({ read: true }).eq('id', notifId);
      }
    });
  });

  const showMoreBtn = body.querySelector('#sidebarShowMore');
  if (showMoreBtn) showMoreBtn.addEventListener('click', () => { sidebarLimit += 10; renderNotifSidebar(); });
}

// ─── NOTIFICATION SOUND ───────────────────────────────────────────────────────
let audioCtx          = null;
let pendingSound      = false;
let pendingNotifCount = 0;
const BASE_TITLE      = 'Achiever Board';

function setTabNotifTitle(count) {
  document.title = count > 0 ? `(${count}) New notification! — ${BASE_TITLE}` : BASE_TITLE;
}

function unlockAudioContext() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0);
  } catch { audioCtx = null; }
}

function _playBeep() {
  if (!audioCtx) return;
  audioCtx.resume().then(() => {
    const notes = [
      { freq: 880,  start: 0.00, dur: 0.25 },
      { freq: 1100, start: 0.18, dur: 0.25 },
      { freq: 1320, start: 0.36, dur: 0.40 },
    ];
    notes.forEach(({ freq, start, dur }) => {
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = audioCtx.currentTime + start;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.9, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
    });
  }).catch(() => {});
}

function playNotificationSound() {
  if (document.visibilityState === 'visible') {
    _playBeep();
  } else {
    pendingSound = true;
    pendingNotifCount++;
    setTabNotifTitle(pendingNotifCount);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (pendingSound) { pendingSound = false; _playBeep(); }
    if (pendingNotifCount > 0) { pendingNotifCount = 0; setTabNotifTitle(0); }
  }
});

// ─── DARK MODE ────────────────────────────────────────────────────────────────
document.getElementById('themeBtn').addEventListener('click', () => {
  const isDark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
});

// ─── DM WIDGET ────────────────────────────────────────────────────────────────
function updateDmFabBadge() {
  const total = dmMessages.filter(m => m.recipientId === currentUser?.id && !m.read).length;
  const badge = document.getElementById('dmFabBadge');
  if (!badge) return;
  badge.textContent = total > 9 ? '9+' : String(total);
  badge.style.display = total > 0 ? 'flex' : 'none';
}

function dmUnreadFrom(peerId) {
  return dmMessages.filter(m => m.senderId === peerId && m.recipientId === currentUser?.id && !m.read).length;
}

function renderDmContacts() {
  const list = document.getElementById('dmContactsList');
  if (!list) return;
  if (!currentUser || !currentTeam) {
    list.innerHTML = '<div class="sidebar-empty">Sign in to message teammates</div>';
    return;
  }
  const peers = Object.entries(members)
    .filter(([id]) => id !== currentUser.id)
    .sort(([, a], [, b]) => a.display_name.localeCompare(b.display_name));
  if (!peers.length) {
    list.innerHTML = '<div class="sidebar-empty">No other team members yet</div>';
    return;
  }
  list.innerHTML = peers.map(([id, m]) => {
    const unread = dmUnreadFrom(id);
    return `<div class="dm-contact-item" data-id="${id}" data-name="${escHtml(m.display_name)}">
      ${avatarHtml(id)}
      <span class="dm-contact-name">${escHtml(m.display_name)}</span>
      ${unread > 0 ? `<span class="dm-contact-unread">${unread > 9 ? '9+' : unread}</span>` : ''}
    </div>`;
  }).join('');
  list.querySelectorAll('.dm-contact-item').forEach(item => {
    item.addEventListener('click', () => openDmChat(item.dataset.id, item.dataset.name));
  });
}

async function openDmChat(peerId, peerName) {
  if (!currentUser || !currentTeam) return;
  dmActivePeerId   = peerId;
  dmActivePeerName = peerName;
  document.getElementById('dmContactsView').style.display = 'none';
  document.getElementById('dmChatView').style.display     = '';
  document.getElementById('dmPopupTitle').textContent      = peerName;
  document.getElementById('dmBackBtn').style.display       = '';

  renderDmMessages();

  const unreadIds = dmMessages.filter(m => m.senderId === peerId && m.recipientId === currentUser.id && !m.read).map(m => m.id);
  if (unreadIds.length) {
    await supabase.from('team_direct_messages').update({ read: true }).in('id', unreadIds);
    unreadIds.forEach(id => { const m = dmMessages.find(x => x.id === id); if (m) m.read = true; });
    updateDmFabBadge();
    renderDmContacts();
  }

  document.getElementById('dmInput')?.focus();
}

function closeDmChat() {
  dmActivePeerId = null; dmActivePeerName = null;
  const cv = document.getElementById('dmContactsView');
  const chv = document.getElementById('dmChatView');
  const bb  = document.getElementById('dmBackBtn');
  const tt  = document.getElementById('dmPopupTitle');
  if (cv)  cv.style.display  = '';
  if (chv) chv.style.display = 'none';
  if (bb)  bb.style.display  = 'none';
  if (tt)  tt.textContent    = 'Messages';
  renderDmContacts();
}

function renderDmMessages() {
  const container = document.getElementById('dmChatMessages');
  if (!container || !dmActivePeerId) return;
  const msgs = dmMessages
    .filter(m => (m.senderId === currentUser.id && m.recipientId === dmActivePeerId) || (m.senderId === dmActivePeerId && m.recipientId === currentUser.id))
    .sort((a, b) => a.createdAt - b.createdAt);
  if (!msgs.length) {
    container.innerHTML = '<div class="sidebar-empty">No messages yet — say hi!</div>';
    return;
  }
  const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
  container.innerHTML = msgs.map(m => {
    const isMe = m.senderId === currentUser.id;
    const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="dm-msg${isMe ? ' dm-msg-me' : ''}">
      <div class="dm-msg-bubble">${escHtml(m.text)}</div>
      <div class="dm-msg-time">${time}</div>
    </div>`;
  }).join('');
  if (wasAtBottom) container.scrollTop = container.scrollHeight;
}

async function sendDmMessage() {
  if (!currentUser || !currentTeam || !dmActivePeerId) return;
  const input = document.getElementById('dmInput');
  const text  = input?.value.trim();
  if (!text) return;
  input.value = '';
  await supabase.from('team_direct_messages').insert({
    team_id: currentTeam.id, sender_id: currentUser.id, recipient_id: dmActivePeerId, text, read: false,
  });
}

async function setupDmListener() {
  if (dmChannel) supabase.removeChannel(dmChannel);
  dmMessages = [];
  updateDmFabBadge();
  if (!currentTeam) return;
  const teamId = currentTeam.id;

  const { data: rows } = await supabase.from('team_direct_messages').select('*').eq('team_id', teamId);
  dmMessages = (rows || []).map(r => ({
    id: r.id, text: r.text, senderId: r.sender_id, recipientId: r.recipient_id, read: r.read, createdAt: new Date(r.created_at).getTime(),
  }));
  updateDmFabBadge();
  renderDmContacts();
  if (dmActivePeerId) renderDmMessages();

  dmChannel = supabase.channel(`team-dm-${teamId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_direct_messages', filter: `team_id=eq.${teamId}` }, payload => {
      if (payload.eventType === 'INSERT') {
        const r = payload.new;
        dmMessages.push({ id: r.id, text: r.text, senderId: r.sender_id, recipientId: r.recipient_id, read: r.read, createdAt: new Date(r.created_at).getTime() });
      } else if (payload.eventType === 'UPDATE') {
        const r = payload.new;
        const m = dmMessages.find(x => x.id === r.id);
        if (m) m.read = r.read;
      }
      updateDmFabBadge();
      renderDmContacts();
      if (dmActivePeerId) renderDmMessages();
    })
    .subscribe();
}

document.getElementById('dmFab')?.addEventListener('click', () => {
  const popup = document.getElementById('dmPopup');
  if (!popup) return;
  const opening = popup.style.display === 'none';
  if (opening) {
    if (!currentUser) { pendingAfterLogin = () => { popup.style.display = ''; renderDmContacts(); }; showAuthOverlay(); return; }
    popup.style.display = '';
    renderDmContacts();
  } else {
    popup.style.display = 'none';
    closeDmChat();
  }
});
document.getElementById('dmPopupClose')?.addEventListener('click', () => {
  document.getElementById('dmPopup').style.display = 'none';
  closeDmChat();
});
document.getElementById('dmBackBtn')?.addEventListener('click', closeDmChat);
document.getElementById('dmSendBtn')?.addEventListener('click', sendDmMessage);
document.getElementById('dmInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendDmMessage(); });

// ─── PROFILE SETTINGS ─────────────────────────────────────────────────────────
document.getElementById('currentUserBtn').addEventListener('click', openProfile);

function openProfile() {
  if (!currentUser || !currentTeam || !myMembership) return;

  document.getElementById('profileNameDisplay').textContent   = myMembership.display_name;
  document.getElementById('profileMemberSince').textContent   = myMembership.joined_at ? `Member since ${fmtTimestamp(myMembership.joined_at)}` : '';

  const preview = document.getElementById('profilePhotoPreview');
  if (myMembership.photo_url) {
    preview.innerHTML = `<img class="avatar avatar-lg avatar-photo" src="${escHtml(myMembership.photo_url)}" alt="${escHtml(initials(myMembership.display_name))}" style="width:72px;height:72px">`;
  } else {
    preview.innerHTML = `<span class="avatar" style="background:${avatarColor(myMembership.display_name)};width:72px;height:72px;font-size:1.6rem">${initials(myMembership.display_name)}</span>`;
  }

  document.getElementById('profileDisplayName').value      = myMembership.display_name || '';
  document.getElementById('profileEmail').value             = currentUser.email || '';
  document.getElementById('profileNewPassword').value       = '';
  document.getElementById('profileConfirmPassword').value   = '';
  document.getElementById('profileError').textContent       = '';
  document.getElementById('profilePhotoInput').value        = '';

  renderAdminSection();
  document.getElementById('profileOverlay').classList.add('open');
}

function closeProfile() { document.getElementById('profileOverlay').classList.remove('open'); }
document.getElementById('closeProfile').addEventListener('click', closeProfile);
document.getElementById('profileOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeProfile(); });

document.getElementById('profilePhotoEditBtn').addEventListener('click', () => {
  document.getElementById('profilePhotoInput').click();
});

document.getElementById('profilePhotoInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file || !currentUser || !currentTeam) return;
  showToast('Uploading photo…', 1500);
  const path = `${currentUser.id}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(path, file);
  if (error) { showToast(`Upload failed: ${error.message}`); return; }
  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  const preview = document.getElementById('profilePhotoPreview');
  preview.innerHTML = `<img class="avatar avatar-lg avatar-photo" src="${escHtml(data.publicUrl)}" alt="preview" style="width:72px;height:72px">`;
  await supabase.from('team_members').update({ photo_url: data.publicUrl }).eq('team_id', currentTeam.id).eq('user_id', currentUser.id);
  myMembership.photo_url = data.publicUrl;
  members[currentUser.id] = { ...members[currentUser.id], photo_url: data.publicUrl };
  updateHeaderUser();
  renderBoard();
});

document.getElementById('saveProfileBtn').addEventListener('click', async () => {
  if (!currentUser || !currentTeam) return;
  const err        = document.getElementById('profileError');
  const newPwd     = document.getElementById('profileNewPassword').value;
  const confirmPwd = document.getElementById('profileConfirmPassword').value;
  const email      = document.getElementById('profileEmail').value.trim();
  const displayName = document.getElementById('profileDisplayName').value.trim();

  if (!displayName) { err.textContent = 'Display name cannot be empty.'; return; }
  if (newPwd || confirmPwd) {
    if (newPwd !== confirmPwd) { err.textContent = 'Passwords do not match.'; return; }
    if (newPwd.length < 6)     { err.textContent = 'Password must be at least 6 characters.'; return; }
  }
  err.textContent = '';

  const authUpdates = {};
  if (email && email !== currentUser.email) authUpdates.email = email;
  if (newPwd) authUpdates.password = newPwd;
  if (Object.keys(authUpdates).length) {
    const { error } = await supabase.auth.updateUser(authUpdates);
    if (error) { err.textContent = error.message; return; }
  }

  if (displayName !== myMembership.display_name) {
    await supabase.from('team_members').update({ display_name: displayName }).eq('team_id', currentTeam.id).eq('user_id', currentUser.id);
    myMembership.display_name = displayName;
    members[currentUser.id] = { ...members[currentUser.id], display_name: displayName };
    const idx = myTeams.findIndex(t => t.id === currentTeam.id);
    if (idx !== -1) myTeams[idx].display_name = displayName;
  }

  updateHeaderUser();
  renderBoard();
  closeProfile();
  showToast('Profile updated.');
});

// ─── LEAVE TEAM ───────────────────────────────────────────────────────────────
document.getElementById('leaveTeamBtn').addEventListener('click', () => {
  if (!currentTeam) return;
  document.getElementById('leaveTeamMsg').textContent =
    `Leave "${currentTeam.name}"? You'll lose access to its tasks and messages. This cannot be undone.`;
  document.getElementById('leaveTeamOverlay').classList.add('open');
});
function closeLeaveTeamOverlay() { document.getElementById('leaveTeamOverlay').classList.remove('open'); }
document.getElementById('leaveTeamOverlayClose').addEventListener('click', closeLeaveTeamOverlay);
document.getElementById('leaveTeamOverlayCancel').addEventListener('click', closeLeaveTeamOverlay);
document.getElementById('leaveTeamOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeLeaveTeamOverlay(); });

document.getElementById('leaveTeamOverlayOk').addEventListener('click', async () => {
  if (!currentUser || !currentTeam) return;
  const teamId = currentTeam.id;
  closeLeaveTeamOverlay();
  closeProfile();
  await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', currentUser.id);
  myTeams = myTeams.filter(t => t.id !== teamId);
  unsubscribeTeam();
  currentTeam = null; myMembership = null; members = {}; tasks = {}; commentCounts = {};
  allNotifications = {}; knownNotifIds = null; dmMessages = [];
  document.getElementById('dmPopup').style.display = 'none';
  updateDmFabBadge();
  if (localStorage.getItem('ab_last_team_id') === teamId) localStorage.removeItem('ab_last_team_id');
  showToast('You left the team.');
  if (myTeams.length) {
    await enterTeam(myTeams[0]);
  } else {
    document.querySelector('.board-wrapper').style.display = 'none';
    document.getElementById('guestBanner').style.display   = '';
    updateHeaderUser();
    renderBoard();
    showTeamSetupStep();
  }
});

// ─── ADMIN TEAM PANEL ─────────────────────────────────────────────────────────
function renderAdminSection() {
  const section = document.getElementById('adminTeamSection');
  if (!section || !currentTeam) return;
  if (!myMembership || myMembership.role !== 'admin') { section.style.display = 'none'; return; }
  section.style.display = '';

  const memberArr   = Object.entries(members).map(([id, m]) => ({ id, ...m })).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const maxUsers    = currentTeam.max_users || 0;
  const memberCount = memberArr.length;

  document.getElementById('seatUsage').textContent = `${memberCount} / ${maxUsers} seats`;
  document.getElementById('inviteCodeInput').value  = currentTeam.invite_code || '';
  document.getElementById('inviteCodeMsg').textContent = memberCount >= maxUsers
    ? 'All seats are filled — new joins will be rejected until you upgrade.' : '';

  document.getElementById('membersList').innerHTML = memberArr.map(m => `
    <div class="member-row">
      ${avatarHtml(m.id)}
      <span class="member-name">${escHtml(m.display_name)}${m.role === 'admin' ? ' <span class="admin-tag">admin</span>' : ''}</span>
      ${m.id !== currentUser.id
        ? `<button class="btn-icon delete remove-member-btn" data-uid="${m.id}" title="Remove ${escHtml(m.display_name)}">${ICONS.trash}</button>`
        : '<span class="its-you-tag">you</span>'}
    </div>`).join('');

  document.getElementById('membersList').querySelectorAll('.remove-member-btn').forEach(btn => {
    btn.addEventListener('click', () => openDeleteMemberModal(btn.dataset.uid));
  });
}

document.getElementById('copyInviteBtn').addEventListener('click', async () => {
  const code = document.getElementById('inviteCodeInput').value;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast('Invite code copied.');
  } catch {
    document.getElementById('inviteCodeInput').select();
    showToast('Select and copy the code above.');
  }
});

document.getElementById('regenerateInviteBtn').addEventListener('click', async () => {
  if (!currentTeam || myMembership?.role !== 'admin') return;
  const newCode = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const { error } = await supabase.from('teams').update({ invite_code: newCode }).eq('id', currentTeam.id);
  if (error) { showToast('Could not regenerate invite code.'); return; }
  currentTeam.invite_code = newCode;
  const idx = myTeams.findIndex(t => t.id === currentTeam.id);
  if (idx !== -1) myTeams[idx].invite_code = newCode;
  renderAdminSection();
  showToast('New invite code generated.');
});

// ─── REMOVE MEMBER MODAL ──────────────────────────────────────────────────────
function openDeleteMemberModal(uid) {
  if (!currentTeam || myMembership?.role !== 'admin') return;
  const m = members[uid];
  if (!m || uid === currentUser.id) return;
  pendingDeleteMemberUid = uid;
  document.getElementById('deleteMemberMsg').textContent =
    `Remove "${m.display_name}" from this team? They will lose access immediately. Their tasks will remain on the board.`;
  document.getElementById('deleteMemberOverlay').classList.add('open');
}
function closeDeleteMemberModal() {
  pendingDeleteMemberUid = null;
  document.getElementById('deleteMemberOverlay')?.classList.remove('open');
}
document.getElementById('deleteMemberConfirmBtn')?.addEventListener('click', async () => {
  const uid = pendingDeleteMemberUid;
  if (!uid || !currentTeam) return;
  const name = members[uid]?.display_name || 'Member';
  closeDeleteMemberModal();
  await supabase.from('team_members').delete().eq('team_id', currentTeam.id).eq('user_id', uid);
  showToast(`${name} has been removed from the team.`);
});
document.getElementById('deleteMemberCloseBtn')?.addEventListener('click', closeDeleteMemberModal);
document.getElementById('deleteMemberCancelBtn')?.addEventListener('click', closeDeleteMemberModal);
document.getElementById('deleteMemberOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeDeleteMemberModal(); });

// ─── GLOBAL UI EVENTS ─────────────────────────────────────────────────────────
['todo', 'inprogress', 'done', 'overdue'].forEach(col => {
  document.getElementById('pf-' + col).addEventListener('change', e => {
    colPriorityFilter[col] = e.target.value;
    renderBoard();
  });
});

document.getElementById('userFilter').addEventListener('change', e => {
  currentUserFilter = e.target.value;
  renderBoard();
});
document.getElementById('dateFilter').addEventListener('change', e => {
  currentFilter = e.target.value;
  const row = document.getElementById('customDateRow');
  row.style.display = currentFilter === 'custom' ? 'flex' : 'none';
  if (currentFilter !== 'custom') { customDateStart = null; customDateEnd = null; }
  renderBoard();
});

function fmtDateDash(val) {
  if (!val) return 'dd-mm-yyyy';
  const [y, m, d] = val.split('-');
  return `${d}-${m}-${y}`;
}
document.getElementById('customFrom').addEventListener('change', e => {
  document.getElementById('customFromText').textContent = fmtDateDash(e.target.value);
});
document.getElementById('customTo').addEventListener('change', e => {
  document.getElementById('customToText').textContent = fmtDateDash(e.target.value);
});
document.getElementById('customDateApply').addEventListener('click', () => {
  customDateStart = document.getElementById('customFrom').value || null;
  customDateEnd   = document.getElementById('customTo').value   || null;
  renderBoard();
});
document.getElementById('filterBarClear').addEventListener('click', () => {
  currentFilter = 'all'; currentUserFilter = 'all';
  customDateStart = null; customDateEnd = null;
  document.getElementById('customFrom').value            = '';
  document.getElementById('customTo').value              = '';
  document.getElementById('customFromText').textContent  = 'dd-mm-yyyy';
  document.getElementById('customToText').textContent    = 'dd-mm-yyyy';
  document.getElementById('customDateRow').style.display = 'none';
  renderBoard();
});

document.getElementById('addTaskBtn').addEventListener('click', () => {
  if (!currentUser) { pendingAfterLogin = () => openNew(); showAuthOverlay(); return; }
  if (!currentTeam) { showTeamSetupStep(); return; }
  openNew();
});
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.getElementById('closeDetail').addEventListener('click', closeDetail);
document.getElementById('detailOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDetail(); });
document.getElementById('deleteConfirmClose').addEventListener('click', closeDeleteConfirm);
document.getElementById('deleteConfirmCancel').addEventListener('click', closeDeleteConfirm);
document.getElementById('deleteConfirmOk').addEventListener('click', confirmDeleteTask);
document.getElementById('deleteConfirmOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDeleteConfirm(); });
document.getElementById('filePreviewClose').addEventListener('click', closeFilePreview);
document.getElementById('filePreviewOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeFilePreview(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal(); closeDetail(); closeProfile(); closeDeleteConfirm();
    closeLeaveTeamOverlay(); closeFilePreview(); closeDeleteMemberModal(); closeUpgradeModal();
  }
});

// ─── LOG OUT / RESET STATE ────────────────────────────────────────────────────
function resetToSignedOutState() {
  unsubscribeTeam();
  currentUser = null; currentTeam = null; myMembership = null; myTeams = [];
  members = {}; tasks = {}; commentCounts = {}; allNotifications = {}; knownNotifIds = null;
  dmMessages = []; dmActivePeerId = null; dmActivePeerName = null;
  document.getElementById('teamSwitcher').style.display = 'none';
  document.getElementById('dmPopup').style.display = 'none';
  updateDmFabBadge();
  document.getElementById('notifBadge').classList.remove('visible');
  document.getElementById('notifList').innerHTML = '';
  document.getElementById('guestBanner').style.display   = '';
  document.querySelector('.board-wrapper').style.display = 'none';
  updateHeaderUser();
  renderBoard();
  renderNotifSidebar([]);
}

document.getElementById('changeUserBtn').addEventListener('click', async () => {
  showToast('Logging out…', 1200);
  await supabase.auth.signOut();
});

// ─── AUTH STATE / BOOTSTRAP ───────────────────────────────────────────────────
async function loadTeamsAndEnter() {
  await loadMyTeams();

  const pendingCode = localStorage.getItem('ab_pending_invite_code');
  if (pendingCode) {
    showTeamSetupStep();
    document.getElementById('joinInviteCode').value = pendingCode;
    document.getElementById('joinDisplayName').focus();
    return;
  }

  if (!myTeams.length) { showTeamSetupStep(); return; }
  const preferredId = localStorage.getItem('ab_last_team_id');
  const team = myTeams.find(t => t.id === preferredId) || myTeams[0];
  await enterTeam(team);
  hideAuthOverlay();
}

supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN') {
    if (currentUser?.id === session.user.id && (currentTeam || myTeams.length)) return; // already entered
    currentUser = session.user;
    unlockAudioContext();
    const handled = await handlePaymentReturn();
    if (!handled) await loadTeamsAndEnter();
  } else if (event === 'SIGNED_OUT') {
    resetToSignedOutState();
  }
});

async function init() {
  document.getElementById('guestBanner').style.display   = '';
  document.querySelector('.board-wrapper').style.display = 'none';
  renderBoard();

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    const handled = await handlePaymentReturn();
    if (!handled) await loadTeamsAndEnter();
  } else {
    const handled = await handlePaymentReturn();
    if (!handled) showAuthOverlay();
  }
}

init();

// ─── CUSTOM DATE PICKER ────────────────────────────────────────────────────────
(function initCustomDatePickers() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOWS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const CAL_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const p2 = n => String(n).padStart(2, '0');
  const fmtDisp = v => { if (!v) return null; const [y,m,d] = v.split('-'); return `${p2(d)}/${p2(m)}/${y}`; };

  function wire(input) {
    if (input._cdpDone) return;
    input._cdpDone = true;
    input.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'cdp-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const btn = document.createElement('div');
    btn.className = 'cdp-btn empty';
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('role', 'button');
    btn.innerHTML = `<span class="cdp-display">dd/mm/yyyy</span><span class="cdp-btn-icon">${CAL_SVG}</span>`;
    wrap.appendChild(btn);
    const popup = document.createElement('div');
    popup.className = 'cdp-popup';
    wrap.appendChild(popup);
    let viewY = 0, viewM = 0;

    function syncDisplay() {
      const v = input.value, disp = btn.querySelector('.cdp-display');
      if (v) { disp.textContent = fmtDisp(v); btn.classList.remove('empty'); }
      else   { disp.textContent = 'dd/mm/yyyy'; btn.classList.add('empty'); }
    }

    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(input, 'value', {
      get: () => proto.get.call(input),
      set: v  => { proto.set.call(input, v); syncDisplay(); },
      configurable: true,
    });

    function buildPopup() {
      const today = new Date(), sel = input.value;
      const first = new Date(viewY, viewM, 1).getDay();
      const last  = new Date(viewY, viewM + 1, 0).getDate();
      const prev  = new Date(viewY, viewM, 0).getDate();
      let cells = '';
      for (let i = first - 1; i >= 0; i--) cells += `<div class="cdp-day cdp-other">${prev - i}</div>`;
      for (let d = 1; d <= last; d++) {
        const ds = `${viewY}-${p2(viewM+1)}-${p2(d)}`;
        const isT = today.getFullYear()===viewY && today.getMonth()===viewM && today.getDate()===d;
        const isS = sel === ds;
        cells += `<div class="cdp-day${isT?' cdp-today':''}${isS?' cdp-sel':''}" data-d="${ds}">${d}</div>`;
      }
      const fill = 42 - first - last;
      for (let d = 1; d <= fill; d++) cells += `<div class="cdp-day cdp-other">${d}</div>`;
      popup.innerHTML = `
        <div class="cdp-hdr">
          <button class="cdp-nav cdp-p" type="button">↑</button>
          <span class="cdp-mth">${MONTHS[viewM]} ${viewY}</span>
          <button class="cdp-nav cdp-n" type="button">↓</button>
        </div>
        <div class="cdp-grid">
          ${DOWS.map(d => `<div class="cdp-dow">${d}</div>`).join('')}
          ${cells}
        </div>
        <div class="cdp-ftr">
          <button class="cdp-ftr-btn cdp-clr" type="button">Clear</button>
          <button class="cdp-ftr-btn cdp-tdy" type="button">Today</button>
        </div>`;
      popup.querySelector('.cdp-p').onclick = e => { e.stopPropagation(); viewM--; if (viewM < 0) { viewM = 11; viewY--; } buildPopup(); };
      popup.querySelector('.cdp-n').onclick = e => { e.stopPropagation(); viewM++; if (viewM > 11) { viewM = 0; viewY++; } buildPopup(); };
      popup.querySelectorAll('[data-d]').forEach(el => {
        el.onclick = e => { e.stopPropagation(); input.value = el.dataset.d; input.dispatchEvent(new Event('change', {bubbles:true})); popup.classList.remove('open'); };
      });
      popup.querySelector('.cdp-clr').onclick = e => { e.stopPropagation(); input.value = ''; input.dispatchEvent(new Event('change', {bubbles:true})); popup.classList.remove('open'); };
      popup.querySelector('.cdp-tdy').onclick = e => {
        e.stopPropagation();
        const t = new Date();
        input.value = `${t.getFullYear()}-${p2(t.getMonth()+1)}-${p2(t.getDate())}`;
        input.dispatchEvent(new Event('change', {bubbles:true})); popup.classList.remove('open');
      };
    }

    function openPicker() {
      document.querySelectorAll('.cdp-popup.open').forEach(p => p.classList.remove('open'));
      if (input.value) { const [y,m] = input.value.split('-'); viewY = +y; viewM = +m - 1; }
      else { const n = new Date(); viewY = n.getFullYear(); viewM = n.getMonth(); }
      buildPopup();
      popup.classList.add('open');
    }

    btn.addEventListener('click', openPicker);
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) popup.classList.remove('open'); });
    syncDisplay();
  }

  ['taskScheduled', 'taskDue'].forEach(id => { const el = document.getElementById(id); if (el) wire(el); });
})();
