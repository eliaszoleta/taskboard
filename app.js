import { initializeApp }                                    from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, push, set, update, remove,
         onValue, get }                                      from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCT2yccAHsvB6_NvLL1if7V1FxzYK6tRE0",
  authDomain:        "taskboard-d91be.firebaseapp.com",
  databaseURL:       "https://taskboard-d91be-default-rtdb.firebaseio.com",
  projectId:         "taskboard-d91be",
  storageBucket:     "taskboard-d91be.firebasestorage.app",
  messagingSenderId: "34815479362",
  appId:             "1:34815479362:web:25069a6f086ecfcb17e7db",
};

if (firebaseConfig.apiKey === 'YOUR_API_KEY') {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;flex-direction:column;gap:16px;padding:24px;text-align:center;">
      <div style="font-size:2.5rem">⚙️</div>
      <h2 style="color:#4f46e5">Firebase setup required</h2>
      <p style="color:#64748b;max-width:400px">Open <strong>app.js</strong> and replace the placeholder values in <code>firebaseConfig</code> with your Firebase project credentials.</p>
    </div>`;
  throw new Error('Firebase config not set up.');
}

const firebaseApp = initializeApp(firebaseConfig);
const db          = getDatabase(firebaseApp);

// ─── SVG ICON LIBRARY ─────────────────────────────────────────────────────────
const ICONS = {
  edit:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  comment: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  calendar:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  clock:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  lock:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  clip:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
  eye:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser          = null;   // { id, workspaceId, name, role }
let users                = {};     // workspace users { userId: { name, passwordHash, email?, role, createdAt, photoURL? } }
let tasks                = {};
let commentCounts        = {};
let allNotifications     = {};
let currentWorkspaceMeta = null;   // { name, adminId, maxUsers, createdAt }

// Workspace Firebase listener unsubscribers
let wsMetaUnsub        = null;
let wsUsersUnsub       = null;
let wsTasksUnsub       = null;
let wsCommentsUnsub    = null;
let wsNotifsAllUnsub   = null;
let notifBadgeUnsub    = null;
let commentsUnsub      = null;

let _resolveTasksLoaded;
const tasksLoaded = new Promise(r => { _resolveTasksLoaded = r; });

let editingTaskId        = null;
let detailTaskId         = null;
let draggedId            = null;
let currentFilter        = 'all';
let currentUserFilter    = 'all';
let colPriorityFilter    = { todo: 'all', inprogress: 'all', done: 'all', overdue: 'all' };
let customDateStart      = null;
let customDateEnd        = null;
let sidebarLimit         = 10;
let knownNotifIds        = null;
let pendingLoginUid      = null;    // user ID within workspace during login flow
let pendingWorkspaceId   = null;    // workspace key during login flow
let loginWorkspaceUsers  = {};      // users loaded during login (before listeners start)
let pendingAfterLogin    = null;
let pendingProfilePhoto  = null;
let pendingResourceFiles = [];
let pendingResourceLinks = [''];
let pendingDeleteId      = null;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getTaskResources(task) {
  if (task.resources && task.resources.length) return task.resources;
  if (task.resourceUrl) return [{ type: task.resourceType || 'link', url: task.resourceUrl, name: task.resourceName || task.resourceUrl }];
  return [];
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

const COLORS = ['#4f46e5','#7c3aed','#db2777','#dc2626','#d97706','#059669','#0284c7','#0e7490'];
const byNewest = (a, b) => b.createdAt - a.createdAt;
const avatarColor = name => {
  let h = 0;
  for (const c of (name||'')) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return COLORS[h % COLORS.length];
};
const initials = name =>
  (name||'?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const avatarHtml = (name, lg = false) => {
  const cls  = `avatar${lg ? ' avatar-lg' : ''}`;
  const user = Object.values(users).find(u => u.name === name);
  if (user?.photoURL) {
    return `<img class="${cls} avatar-photo" src="${user.photoURL}" alt="${escHtml(initials(name))}">`;
  }
  return `<span class="${cls}" style="background:${avatarColor(name)}">${initials(name)}</span>`;
};

async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function resizeImage(file, maxPx = 200) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const c = document.createElement('canvas');
        c.width  = Math.round(img.width  * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toWorkspaceKey(name) {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || null;
}

// Workspace-scoped Firebase ref helper (requires currentUser to be set)
const wsRef = (...path) => ref(db, ['workspaces', currentUser.workspaceId, ...path].join('/'));

// ─── USER AUTH / STORAGE ──────────────────────────────────────────────────────
function loadCurrentUser() {
  try { currentUser = JSON.parse(localStorage.getItem('achieverboard-ws-user')); } catch { currentUser = null; }
}

function saveCurrentUser(user) {
  currentUser = user;
  localStorage.setItem('achieverboard-ws-user', JSON.stringify(user));
}

function clearCurrentUser() {
  currentUser = null;
  localStorage.removeItem('achieverboard-ws-user');
}

function logout() {
  closeProfile();
  stopWorkspaceListeners();
  clearCurrentUser();
  const guestBanner  = document.getElementById('guestBanner');
  const boardWrapper = document.querySelector('.board-wrapper');
  if (guestBanner)  guestBanner.style.display  = '';
  if (boardWrapper) boardWrapper.style.display = 'none';
  updateHeaderUser();
}

// ─── OVERLAY MANAGEMENT ───────────────────────────────────────────────────────
function setActiveStep(activeId) {
  ['stepWorkspace','stepLogin','stepCreate','stepPayment','stepForgot','stepReset'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === activeId ? '' : 'none';
  });
}

function showUserOverlay() {
  document.getElementById('userOverlay').classList.add('open');
  document.getElementById('userOverlayClose').style.display = '';
  showStepWorkspace();
}

function hideUserOverlay() {
  document.getElementById('userOverlay').classList.remove('open');
  sidebarLimit = 10;
  // Update guest banner / board visibility
  const guestBanner  = document.getElementById('guestBanner');
  const boardWrapper = document.querySelector('.board-wrapper');
  if (guestBanner)  guestBanner.style.display  = currentUser ? 'none' : '';
  if (boardWrapper) boardWrapper.style.display = currentUser ? ''     : 'none';
  updateHeaderUser();
  if (currentUser) currentUserFilter = currentUser.id;
  renderBoard();
  setupNotifListener();
  renderNotifSidebar();
  unlockAudioContext();
  if (pendingAfterLogin) {
    const fn = pendingAfterLogin;
    pendingAfterLogin = null;
    fn();
  }
}

function showStepWorkspace() {
  setActiveStep('stepWorkspace');
  pendingLoginUid     = null;
  pendingWorkspaceId  = null;
  loginWorkspaceUsers = {};
  const inp = document.getElementById('wsNameInput');
  if (inp) { inp.value = ''; inp.focus(); }
  const inp2 = document.getElementById('wsCreateNameInput');
  if (inp2) inp2.value = '';
  const err = document.getElementById('wsError');
  if (err) err.textContent = '';
  const err2 = document.getElementById('wsCreateError');
  if (err2) err2.textContent = '';
}

function showStepLogin(wsId, wsDisplayName) {
  pendingWorkspaceId = wsId;
  const nameEl = document.getElementById('loginWsName');
  if (nameEl) nameEl.textContent = wsDisplayName;

  // Build user chip list
  const list = document.getElementById('loginUserList');
  list.innerHTML = '';
  pendingLoginUid = null;
  document.getElementById('loginPasswordSection').style.display = 'none';
  document.getElementById('forgotPwdBtn').style.display = 'none';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').textContent = '';

  Object.entries(loginWorkspaceUsers)
    .sort(([,a],[,b]) => a.name.localeCompare(b.name))
    .forEach(([uid, u]) => {
      const chip = document.createElement('button');
      chip.className = 'user-chip';
      chip.type = 'button';
      chip.innerHTML = `${avatarHtml(u.name)}<span class="chip-name">${escHtml(u.name)}</span>` +
        (u.role === 'admin' ? `<span class="admin-tag">ADMIN</span>` : '');
      chip.addEventListener('click', () => {
        pendingLoginUid = uid;
        document.getElementById('loginPasswordSection').style.display = '';
        document.getElementById('forgotPwdBtn').style.display = '';
        document.getElementById('loginError').textContent = '';
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();
        // highlight selected chip
        list.querySelectorAll('.user-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
      });
      list.appendChild(chip);
    });

  setActiveStep('stepLogin');
}

function showStepCreate(wsId, wsDisplayName) {
  pendingWorkspaceId = wsId;
  const sub = document.getElementById('createWsSub');
  if (sub) sub.textContent = `Create teamboard "${wsDisplayName}"`;
  setActiveStep('stepCreate');
  document.getElementById('adminName').value            = '';
  document.getElementById('adminEmail').value           = '';
  document.getElementById('adminPassword').value        = '';
  document.getElementById('adminConfirmPassword').value = '';
  document.getElementById('teamSizeSelect').value       = '2';
  document.getElementById('createError').textContent    = '';
  updatePlanInfo();
  document.getElementById('adminName').focus();
}

// ─── PLAN INFO DISPLAY ─────────────────────────────────────────────────────────
const PLAN_INFO = {
  '2':  { label: 'Free forever',  note: 'No credit card required',         cls: 'free' },
  '5':  { label: '$15/month',     note: 'Billed monthly · cancel anytime', cls: 'paid' },
  '10': { label: '$30/month',     note: 'Billed monthly · cancel anytime', cls: 'paid' },
  '15': { label: '$50/month',     note: 'Billed monthly · cancel anytime', cls: 'paid' },
  '20': { label: '$70/month',     note: 'Billed monthly · cancel anytime', cls: 'paid' },
};

// ─── STRIPE PAYMENT LINKS ─────────────────────────────────────────────────────
// HOW TO SET UP:
//   1. Create a Stripe account at https://stripe.com
//   2. Go to Dashboard → Payment Links → Create a link for each plan below
//   3. Set the price for each link (e.g. $15/month recurring)
//   4. In "After payment", set Confirmation page → Redirect to URL:
//        https://achieverboard.com/team/?payment_ok=1&plan=PLAN_SIZE&session_id={CHECKOUT_SESSION_ID}
//      Replace PLAN_SIZE with the actual number (5, 10, 15, or 20)
//   5. Set Cancel URL to: https://achieverboard.com/team/?payment_cancelled=1
//   6. Paste each link URL below, replacing the placeholder strings
const STRIPE_LINKS = {
  '5':  'PASTE_YOUR_STRIPE_LINK_FOR_STARTER_HERE',   // Starter  – $15/mo, up to 5 users
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
function openUpgradeModal() {
  document.getElementById('upgradeOverlay')?.classList.add('open');
}
function closeUpgradeModal() {
  document.getElementById('upgradeOverlay')?.classList.remove('open');
}
document.getElementById('upgradeClose')?.addEventListener('click', closeUpgradeModal);
document.getElementById('upgradeCancel')?.addEventListener('click', closeUpgradeModal);
document.getElementById('upgradeOverlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeUpgradeModal();
});

function showStepForgot() {
  setActiveStep('stepForgot');
  document.getElementById('forgotEmail').value       = '';
  document.getElementById('forgotError').textContent = '';
  const u    = loginWorkspaceUsers[pendingLoginUid];
  const sub  = document.getElementById('forgotSub');
  const form = document.getElementById('forgotEmailForm');
  if (!u?.email) {
    sub.textContent    = 'No recovery email is linked to this account. Contact your workspace admin.';
    form.style.display = 'none';
  } else {
    const [local, domain] = u.email.split('@');
    const masked = local.slice(0, 2) + '***@' + domain;
    sub.textContent    = `Enter the email linked to your account (hint: ${masked})`;
    form.style.display = '';
    document.getElementById('forgotEmail').focus();
  }
}

// ─── WORKSPACE LOOKUP ─────────────────────────────────────────────────────────
// Sign In path: look up existing teamboard → go to login step
async function handleWsContinue() {
  const name  = document.getElementById('wsNameInput').value.trim();
  const errEl = document.getElementById('wsError');
  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Please enter your teamboard name.'; return; }
  const wsKey = toWorkspaceKey(name);
  if (!wsKey) { errEl.textContent = 'Invalid teamboard name.'; return; }

  errEl.textContent = 'Looking up teamboard…';
  try {
    const snap = await get(ref(db, `workspaces/${wsKey}/meta`));
    if (snap.exists()) {
      const usersSnap    = await get(ref(db, `workspaces/${wsKey}/users`));
      loginWorkspaceUsers = usersSnap.val() || {};
      errEl.textContent  = '';
      showStepLogin(wsKey, snap.val().name || name);
    } else {
      errEl.textContent = 'Teamboard not found. Check the name or create a new one below.';
    }
  } catch (e) {
    errEl.textContent = 'Connection error. Please try again.';
    console.error(e);
  }
}

// Create path: go directly to create step with the chosen name
async function handleWsCreate() {
  const name  = document.getElementById('wsCreateNameInput').value.trim();
  const errEl = document.getElementById('wsCreateError');
  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Please enter a name for your teamboard.'; return; }
  const wsKey = toWorkspaceKey(name);
  if (!wsKey) { errEl.textContent = 'Invalid teamboard name.'; return; }

  errEl.textContent = 'Checking availability…';
  try {
    const snap = await get(ref(db, `workspaces/${wsKey}/meta`));
    if (snap.exists()) {
      errEl.textContent = 'A teamboard with this name already exists. Sign in above instead.';
      return;
    }
    errEl.textContent = '';
    showStepCreate(wsKey, name);
  } catch (e) {
    errEl.textContent = 'Connection error. Please try again.';
    console.error(e);
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
async function attemptLogin() {
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  if (!pendingLoginUid) { errEl.textContent = 'Please select who you are first.'; return; }
  const u   = loginWorkspaceUsers[pendingLoginUid];
  const pwd = document.getElementById('loginPassword').value;
  if (!pwd) { errEl.textContent = 'Please enter your password.'; return; }
  const hash = await hashPassword(pwd);
  if (hash !== u.passwordHash) {
    errEl.textContent = 'Incorrect password. Try again.';
    document.getElementById('loginPassword').select();
    return;
  }
  saveCurrentUser({ id: pendingLoginUid, workspaceId: pendingWorkspaceId, name: u.name, role: u.role || 'member' });
  startWorkspaceListeners();
  hideUserOverlay();
}

// ─── CREATE WORKSPACE ─────────────────────────────────────────────────────────
async function createWorkspace() {
  const errEl      = document.getElementById('createError');
  errEl.textContent = '';
  const adminName    = document.getElementById('adminName').value.trim();
  const adminEmail   = document.getElementById('adminEmail').value.trim().toLowerCase();
  const adminPwd     = document.getElementById('adminPassword').value;
  const confirmPwd   = document.getElementById('adminConfirmPassword').value;
  const teamSize     = parseInt(document.getElementById('teamSizeSelect').value, 10);

  if (!adminName)              { errEl.textContent = 'Please enter your name.';                    return; }
  if (!adminPwd)               { errEl.textContent = 'Please choose a password.';                 return; }
  if (adminPwd.length < 4)    { errEl.textContent = 'Password must be at least 4 characters.';    return; }
  if (adminPwd !== confirmPwd) { errEl.textContent = 'Passwords do not match.';                   return; }

  // ── Paid plan: gate behind Stripe payment before touching Firebase ──────────
  if (teamSize > 2) {
    const stripeLink = STRIPE_LINKS[String(teamSize)];
    if (!stripeLink || stripeLink.startsWith('PASTE_YOUR')) {
      errEl.textContent = 'Payments are not configured yet. Contact the site admin.';
      return;
    }
    const wsName = document.getElementById('createWsSub').textContent
      .replace(/^Create teamboard "/, '').replace(/"$/, '');
    const hash   = await hashPassword(adminPwd);
    sessionStorage.setItem('ab_pending_ws', JSON.stringify({
      workspaceId: pendingWorkspaceId,
      workspaceName: wsName,
      adminName, adminEmail, passwordHash: hash, teamSize,
      savedAt: Date.now(),
    }));
    showPaymentStep(teamSize);
    return;
  }

  // ── Free plan (2 users): create immediately ─────────────────────────────────
  await doCreateWorkspace({ workspaceId: pendingWorkspaceId, adminName, adminEmail,
    passwordHash: await hashPassword(adminPwd), teamSize });
}

async function doCreateWorkspace({ workspaceId, adminName, adminEmail, passwordHash, teamSize }) {
  const errEl = document.getElementById('createError');
  try {
    const existing = await get(ref(db, `workspaces/${workspaceId}/meta`));
    if (existing.exists()) {
      if (errEl) errEl.textContent = 'This teamboard was just created by someone else. Click "← Back" and sign in.';
      return;
    }
    const now    = Date.now();
    const wsName = document.getElementById('createWsSub')?.textContent
      .replace(/^Create teamboard "/, '').replace(/"$/, '') || workspaceId;

    await set(ref(db, `workspaces/${workspaceId}/meta`), {
      name: wsName, maxUsers: teamSize || 0, createdAt: now,
    });

    const userRef   = push(ref(db, `workspaces/${workspaceId}/users`));
    const adminData = { name: adminName, passwordHash, role: 'admin', createdAt: now };
    if (adminEmail) adminData.email = adminEmail;
    await set(userRef, adminData);
    await update(ref(db, `workspaces/${workspaceId}/meta`), { adminId: userRef.key });

    pendingWorkspaceId = workspaceId;
    saveCurrentUser({ id: userRef.key, workspaceId, name: adminName, role: 'admin' });
    startWorkspaceListeners();
    hideUserOverlay();
  } catch (e) {
    if (errEl) errEl.textContent = 'Error creating workspace. Please try again.';
    console.error(e);
  }
}

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
    const pending = JSON.parse(sessionStorage.getItem('ab_pending_ws') || '{}');
    let url = STRIPE_LINKS[key];
    const params = new URLSearchParams({ client_reference_id: pending.workspaceId || '' });
    if (pending.adminEmail) params.set('prefilled_email', pending.adminEmail);
    window.location.href = `${url}?${params.toString()}`;
  };

  setActiveStep('stepPayment');
}

// Resume workspace creation after returning from Stripe
async function resumePendingWorkspaceCreation(pending) {
  // Show user overlay in a "completing" state briefly
  document.getElementById('userOverlay')?.classList.add('open');
  document.getElementById('userOverlayClose').style.display = 'none';
  setActiveStep('stepCreate');
  const sub = document.getElementById('createWsSub');
  if (sub) sub.textContent = `Create teamboard "${pending.workspaceName}"`;
  const errEl = document.getElementById('createError');
  if (errEl) errEl.textContent = 'Payment confirmed — creating your workspace…';

  await doCreateWorkspace(pending);
}

// ─── STRIPE RETURN HANDLER ────────────────────────────────────────────────────
async function handlePaymentReturn() {
  const p = new URLSearchParams(window.location.search);
  if (p.get('payment_ok') === '1') {
    const plan    = p.get('plan');
    const pending = JSON.parse(sessionStorage.getItem('ab_pending_ws') || 'null');
    history.replaceState({}, '', window.location.pathname);

    if (pending && String(pending.teamSize) === plan && (Date.now() - pending.savedAt) < 7_200_000) {
      sessionStorage.removeItem('ab_pending_ws');
      await resumePendingWorkspaceCreation(pending);
    } else {
      sessionStorage.removeItem('ab_pending_ws');
      setTimeout(() => {
        showUserOverlay();
        showToast('Payment received but setup data expired — please create your workspace again.', 5000);
      }, 400);
    }
    return;
  }
  if (p.get('payment_cancelled') === '1') {
    history.replaceState({}, '', window.location.pathname);
    sessionStorage.removeItem('ab_pending_ws');
    setTimeout(() => {
      showUserOverlay();
      showToast('Payment was cancelled. You can try again anytime.', 4000);
    }, 400);
  }
}

document.getElementById('backFromPaymentBtn')?.addEventListener('click', () => {
  sessionStorage.removeItem('ab_pending_ws');
  setActiveStep('stepCreate');
});

// Pricing table CTA buttons → open the user overlay (payment gate handles the rest)
document.querySelectorAll('.pricing-cta-btn[data-plan]').forEach(btn => {
  btn.addEventListener('click', () => {
    showUserOverlay();
    const plan = btn.dataset.plan;
    if (plan && plan !== '2') {
      // Pre-select the matching plan in the dropdown once the create step is reached
      const sel = document.getElementById('teamSizeSelect');
      if (sel) { sel.value = plan; updatePlanInfo(); }
    }
  });
});

// ─── FORGOT / RESET PASSWORD ──────────────────────────────────────────────────
function handleForgotPwdClick() {
  const errEl = document.getElementById('loginError');
  if (!pendingLoginUid) { errEl.textContent = 'Select your account first.'; return; }
  showStepForgot();
}

async function handleForgotVerify() {
  const u     = loginWorkspaceUsers[pendingLoginUid];
  const errEl = document.getElementById('forgotError');
  if (!u?.email) return;
  const inputEmail = document.getElementById('forgotEmail').value.trim().toLowerCase();
  if (!inputEmail) { errEl.textContent = 'Please enter your email address.'; return; }
  if (inputEmail !== u.email.toLowerCase()) {
    errEl.textContent = 'Email does not match our records. Try again.';
    return;
  }
  setActiveStep('stepReset');
  document.getElementById('resetPassword').value        = '';
  document.getElementById('resetConfirmPassword').value = '';
  document.getElementById('resetError').textContent     = '';
  document.getElementById('resetPassword').focus();
}

async function handleResetPassword() {
  const errEl     = document.getElementById('resetError');
  const newPwd    = document.getElementById('resetPassword').value;
  const confirmPwd = document.getElementById('resetConfirmPassword').value;
  if (!newPwd)               { errEl.textContent = 'Please enter a new password.';               return; }
  if (newPwd !== confirmPwd) { errEl.textContent = 'Passwords do not match.';                    return; }
  if (newPwd.length < 4)     { errEl.textContent = 'Password must be at least 4 characters.';   return; }

  const hash = await hashPassword(newPwd);
  await update(ref(db, `workspaces/${pendingWorkspaceId}/users/${pendingLoginUid}`), { passwordHash: hash });
  if (loginWorkspaceUsers[pendingLoginUid]) {
    loginWorkspaceUsers[pendingLoginUid] = { ...loginWorkspaceUsers[pendingLoginUid], passwordHash: hash };
  }
  const u = loginWorkspaceUsers[pendingLoginUid];
  saveCurrentUser({ id: pendingLoginUid, workspaceId: pendingWorkspaceId, name: u.name, role: u.role || 'member' });
  startWorkspaceListeners();
  hideUserOverlay();
}

// ─── EVENT WIRING: OVERLAY ────────────────────────────────────────────────────
document.getElementById('wsContinueBtn').addEventListener('click', handleWsContinue);
document.getElementById('wsNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') handleWsContinue(); });
document.getElementById('wsCreateBtn').addEventListener('click', handleWsCreate);
document.getElementById('wsCreateNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') handleWsCreate(); });
document.getElementById('loginBtn').addEventListener('click', attemptLogin);
document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
document.getElementById('forgotPwdBtn').addEventListener('click', handleForgotPwdClick);
document.getElementById('backToWorkspaceBtn').addEventListener('click', showStepWorkspace);
document.getElementById('backToWorkspaceFromCreate').addEventListener('click', showStepWorkspace);
document.getElementById('createWsBtn').addEventListener('click', createWorkspace);
document.getElementById('backToLoginBtn').addEventListener('click', () => {
  setActiveStep('stepLogin');
  document.getElementById('forgotError').textContent = '';
});
document.getElementById('forgotVerifyBtn').addEventListener('click', handleForgotVerify);
document.getElementById('forgotEmail').addEventListener('keydown', e => { if (e.key === 'Enter') handleForgotVerify(); });
document.getElementById('resetPasswordBtn').addEventListener('click', handleResetPassword);
document.getElementById('resetPassword').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('resetConfirmPassword').focus(); });
document.getElementById('resetConfirmPassword').addEventListener('keydown', e => { if (e.key === 'Enter') handleResetPassword(); });
document.getElementById('changeUserBtn').addEventListener('click', logout);
document.getElementById('userOverlayClose').addEventListener('click', () => {
  pendingAfterLogin = null;
  hideUserOverlay();
});
document.getElementById('guestSignInBtn')?.addEventListener('click', () => {
  showUserOverlay();
});

// ─── WORKSPACE LISTENERS ──────────────────────────────────────────────────────
function startWorkspaceListeners() {
  stopWorkspaceListeners();
  if (!currentUser) return;
  const wsId = currentUser.workspaceId;

  wsMetaUnsub = onValue(ref(db, `workspaces/${wsId}/meta`), snap => {
    currentWorkspaceMeta = snap.val() || null;
    // Refresh admin section if profile is open
    if (document.getElementById('profileOverlay')?.classList.contains('open')) {
      renderAdminSection();
    }
  });

  wsUsersUnsub = onValue(ref(db, `workspaces/${wsId}/users`), snap => {
    users = snap.val() || {};
    populateAssigneeDropdown();
    populateUserFilter();
    renderNotifSidebar();
    updateHeaderUser();
    if (document.getElementById('profileOverlay')?.classList.contains('open')) {
      renderAdminSection();
    }
  });

  wsTasksUnsub = onValue(ref(db, `workspaces/${wsId}/tasks`), snap => {
    tasks = snap.val() || {};
    _resolveTasksLoaded();
    renderBoard();
    checkAndNotifyOverdue();
  });

  wsCommentsUnsub = onValue(ref(db, `workspaces/${wsId}/comments`), snap => {
    const data = snap.val() || {};
    commentCounts = {};
    for (const [taskId, cmts] of Object.entries(data)) {
      commentCounts[taskId] = Object.keys(cmts).length;
    }
    renderBoard();
  });

  wsNotifsAllUnsub = onValue(ref(db, `workspaces/${wsId}/notifications`), snap => {
    allNotifications = snap.val() || {};
    renderNotifSidebar();
  });
}

function stopWorkspaceListeners() {
  [wsMetaUnsub, wsUsersUnsub, wsTasksUnsub, wsCommentsUnsub, wsNotifsAllUnsub, notifBadgeUnsub]
    .forEach(u => { if (u) u(); });
  wsMetaUnsub = wsUsersUnsub = wsTasksUnsub = wsCommentsUnsub = wsNotifsAllUnsub = notifBadgeUnsub = null;
  users = {}; tasks = {}; commentCounts = {}; allNotifications = {};
  currentWorkspaceMeta = null;
}

// ─── HEADER USER DISPLAY ──────────────────────────────────────────────────────
function updateHeaderUser() {
  const logoutBtn     = document.getElementById('changeUserBtn');
  const currentUserEl = document.getElementById('currentUserBtn');
  if (!currentUser) {
    document.getElementById('userNameDisplay').textContent = '';
    document.getElementById('userAvatar').innerHTML = '';
    if (logoutBtn)     logoutBtn.style.display     = 'none';
    if (currentUserEl) currentUserEl.style.display = 'none';
    return;
  }
  if (logoutBtn)     logoutBtn.style.display     = '';
  if (currentUserEl) currentUserEl.style.display = '';
  document.getElementById('userNameDisplay').textContent = currentUser.name;
  const u  = users[currentUser.id];
  const el = document.getElementById('userAvatar');
  if (u?.photoURL) {
    el.innerHTML = `<img class="avatar avatar-lg avatar-photo" src="${u.photoURL}" alt="${escHtml(initials(currentUser.name))}">`;
  } else {
    el.innerHTML = avatarHtml(currentUser.name, true);
  }
}

function populateAssigneeDropdown() {
  const sel  = document.getElementById('taskAssignee');
  const prev = sel.value;
  sel.innerHTML = '<option value="">Unassigned</option>' +
    Object.entries(users)
      .sort(([,a],[,b]) => a.name.localeCompare(b.name))
      .map(([id, u]) => `<option value="${id}">${escHtml(u.name)}</option>`).join('');
  sel.value = prev;
}

function populateUserFilter() {
  const sel  = document.getElementById('userFilter');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="all">All users</option>' +
    '<option value="unassigned">Unassigned</option>' +
    Object.entries(users)
      .sort(([,a],[,b]) => a.name.localeCompare(b.name))
      .map(([id, u]) => `<option value="${id}">${escHtml(u.name)}</option>`).join('');
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
  } else if (currentUserFilter !== 'all') {
    const u = users[currentUserFilter];
    parts.push(u ? `${u.name}'s tasks` : 'Unknown user');
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
    .filter(t => currentUserFilter === 'all' || t.assignedTo === currentUserFilter)
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

function isTaskOwner(task) {
  if (!currentUser) return false;
  return task.createdBy === currentUser.id || task.assignedTo === currentUser.id;
}

function buildCard(task) {
  const overdue  = isOverdue(task.due);
  const assignee = task.assignedTo ? users[task.assignedTo] : null;
  const owned    = isTaskOwner(task);
  const cCount   = commentCounts[task.id] || 0;
  const hasRes   = !!(task.resourceUrl || (task.resources && task.resources.length));

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
        ${assignee ? `<span class="assignee-chip">${avatarHtml(assignee.name)}<span>${escHtml(assignee.name)}</span></span>` : ''}
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
    if (!id) return;
    const newStatus = list.id.replace('list-', '');
    if (newStatus === 'overdue') return;
    const task = tasks[id];
    if (!task || task.status === newStatus) return;
    if (!isTaskOwner(task)) return;
    const oldStatus = task.status;
    tasks[id] = { ...task, status: newStatus };
    renderBoard();
    await update(wsRef('tasks', id), { status: newStatus });
    if (newStatus === 'done' && oldStatus !== 'done') {
      await notifyParticipants(task, id, `${currentUser.name} completed "${task.title}"`);
    }
  });
});

// ─── RESOURCE ATTACHMENTS ────────────────────────────────────────────────────
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
    (totalSize ? `<div class="resource-file-total">${formatSize(totalSize)} / 10 MB used</div>` : '');
  container.querySelectorAll('.resource-link-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingResourceFiles.splice(+btn.dataset.idx, 1);
      renderFileList();
    });
  });
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
  if (!files.length) return;
  const MAX_TOTAL = 10 * 1024 * 1024;
  const newEntries = [];
  for (const file of files) {
    const dataUrl = await readFileAsDataURL(file);
    newEntries.push({ dataUrl, name: file.name, size: file.size });
  }
  const combined  = [...pendingResourceFiles, ...newEntries];
  const totalSize = combined.reduce((s, f) => s + (f.size || 0), 0);
  if (totalSize > MAX_TOTAL) {
    showToast(`Combined size (${formatSize(totalSize)}) exceeds the 10 MB limit.`);
    return;
  }
  pendingResourceFiles = combined;
  renderFileList();
});

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
  if (fileResources.length) { pendingResourceFiles = fileResources.map(r => ({ dataUrl: r.url, name: r.name, size: 0 })); renderFileList(); }
}

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
  if (!currentUser) return;
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) return;

  const linkItems = pendingResourceLinks.map(u => u.trim()).filter(u => u)
    .map(url => {
      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      return { type: 'link', url: normalized, name: url };
    });
  const fileItems = pendingResourceFiles.map(f => ({ type: 'file', url: f.dataUrl, name: f.name }));
  const allItems  = [...linkItems, ...fileItems];
  const resources = allItems.length ? allItems : null;

  const newAssignee = document.getElementById('taskAssignee').value || null;
  const newStatus   = document.getElementById('taskStatus').value;
  const fields = {
    title,
    desc:         document.getElementById('taskDesc').value.trim(),
    priority:     document.getElementById('taskPriority').value,
    scheduledFor: document.getElementById('taskScheduled').value || null,
    due:          document.getElementById('taskDue').value || null,
    status:       newStatus,
    assignedTo:   newAssignee,
    resources,
    resourceType: null,
    resourceUrl:  null,
    resourceName: null,
  };

  if (editingTaskId) {
    const old = tasks[editingTaskId];
    await update(wsRef('tasks', editingTaskId), fields);
    tasks[editingTaskId] = { ...old, ...fields };
    closeModal();
    renderBoard();
    if (newAssignee && newAssignee !== old.assignedTo) {
      await notify(newAssignee, `${currentUser.name} assigned "${title}" to you`, editingTaskId);
    }
    if (newStatus === 'done' && old.status !== 'done') {
      await notifyParticipants({...old,...fields}, editingTaskId, `${currentUser.name} completed "${title}"`);
    }
  } else {
    const newRef   = push(wsRef('tasks'));
    const taskData = { ...fields, createdBy: currentUser.id, createdAt: Date.now() };
    await set(newRef, taskData);
    tasks[newRef.key] = taskData;
    closeModal();
    renderBoard();
    if (newAssignee) await notify(newAssignee, `${currentUser.name} assigned "${title}" to you`, newRef.key);
    if (newStatus === 'done') await notifyParticipants(taskData, newRef.key, `${currentUser.name} completed "${title}"`);
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
  await remove(wsRef('tasks', id));
  await remove(wsRef('comments', id));
  delete tasks[id];
  renderBoard();
}

// ─── OVERDUE AUTO-NOTIFY ──────────────────────────────────────────────────────
async function checkAndNotifyOverdue() {
  if (!currentUser) return;
  const now = Date.now();
  for (const [id, task] of Object.entries(tasks)) {
    if (task.status === 'done')  continue;
    if (task.overdueNotifiedAt)  continue;
    if (!isOverdue(task.due))    continue;
    const msg      = `Task "${task.title}" is now overdue!`;
    const toNotify = new Set([task.createdBy, task.assignedTo].filter(Boolean));
    for (const uid of toNotify) {
      await push(wsRef('notifications', uid), { message: msg, taskId: id, read: false, createdAt: now });
    }
    await update(wsRef('tasks', id), { overdueNotifiedAt: now });
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

  const mime = resource.url.match(/^data:([^;]+);/)?.[1] || '';
  if (mime.startsWith('image/')) {
    bodyEl.innerHTML = `<img class="fp-image" src="${resource.url}" alt="${escHtml(resource.name || 'File')}">`;
  } else if (mime === 'application/pdf') {
    bodyEl.innerHTML = `<iframe class="fp-embed" src="${resource.url}" title="${escHtml(resource.name || 'File')}"></iframe>`;
  } else if (mime.startsWith('video/')) {
    bodyEl.innerHTML = `<video class="fp-video" src="${resource.url}" controls></video>`;
  } else if (mime.startsWith('audio/')) {
    bodyEl.innerHTML = `<audio class="fp-audio" src="${resource.url}" controls></audio>`;
  } else if (mime.startsWith('text/') || mime === 'application/json') {
    try {
      const text = atob(resource.url.split(',')[1]);
      bodyEl.innerHTML = `<pre class="fp-text">${escHtml(text)}</pre>`;
    } catch {
      bodyEl.innerHTML = `<div class="fp-unsupported">Cannot preview this file type.<br>Use the Download button above.</div>`;
    }
  } else {
    bodyEl.innerHTML = `<div class="fp-unsupported">Preview not available for this file type.<br>Use the Download button above.</div>`;
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
  if (!task) {
    try {
      const snap = await get(wsRef('tasks', id));
      if (snap.exists()) { task = snap.val(); tasks[id] = task; }
    } catch (err) {
      console.error('openDetail: Firebase fetch error', err);
    }
  }
  if (!task) {
    showToast('Task not found — it may have been deleted.');
    return false;
  }
  detailTaskId = id;

  const assignee      = task.assignedTo ? users[task.assignedTo] : null;
  const creator       = task.createdBy  ? users[task.createdBy]  : null;
  const overdue       = isOverdue(task.due);
  const owned         = isTaskOwner(task);
  const taskResources = getTaskResources(task);

  let resourceHtml = '';
  if (taskResources.length) {
    const hasFiles = taskResources.some(r => r.type === 'file');
    const hasLinks = taskResources.some(r => r.type !== 'file');
    const label    = hasFiles && hasLinks ? 'Resources' : hasFiles ? 'Attachments' : 'Links';
    resourceHtml = `<div class="detail-row detail-row-resources">
      <span class="detail-label">${label}</span>
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
    <div class="detail-meta">
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <select class="detail-status-sel" id="detailStatusSel" ${!owned ? 'disabled' : ''}>
          <option value="todo"       ${task.status==='todo'       ?'selected':''}>To Do</option>
          <option value="inprogress" ${task.status==='inprogress' ?'selected':''}>In Progress</option>
          <option value="done"       ${task.status==='done'       ?'selected':''}>Done</option>
        </select>
        ${owned ? `<button class="btn-sm btn-primary save-status-btn" id="saveStatusBtn" style="display:none">Save</button>` : ''}
      </div>
      <div class="detail-row">
        <span class="detail-label">Priority</span>
        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
      </div>
      ${task.due ? `<div class="detail-row">
        <span class="detail-label">Due date</span>
        <span class="detail-due ${overdue?'overdue':''}">${formatDate(task.due)}${overdue?' · overdue':''}</span>
      </div>` : ''}
      ${task.createdAt ? `<div class="detail-row">
        <span class="detail-label">Created</span>
        <span class="detail-created">${fmtTimestamp(task.createdAt)}</span>
      </div>` : ''}
      ${assignee ? `<div class="detail-row">
        <span class="detail-label">Assigned to</span>
        <span class="assignee-chip">${avatarHtml(assignee.name, true)}<span>${escHtml(assignee.name)}</span></span>
      </div>` : ''}
      ${creator ? `<div class="detail-row">
        <span class="detail-label">Created by</span>
        <span class="assignee-chip">${avatarHtml(creator.name, true)}<span>${escHtml(creator.name)}</span></span>
      </div>` : ''}
      ${resourceHtml}
    </div>
    ${task.desc ? `<p class="detail-desc">${escHtml(task.desc)}</p>` : ''}`;

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
      saveBtn.style.display = sel.value !== origStatus ? '' : 'none';
    });
    saveBtn.addEventListener('click', async () => {
      const newStatus = sel.value;
      const oldStatus = tasks[id]?.status;
      saveBtn.disabled = true;
      await update(wsRef('tasks', id), { status: newStatus });
      tasks[id] = { ...tasks[id], status: newStatus };
      saveBtn.style.display = 'none';
      saveBtn.disabled = false;
      renderBoard();
      if (newStatus === 'done' && oldStatus !== 'done') {
        await notifyParticipants(task, id, `${currentUser.name} completed "${task.title}"`);
      }
    });
    document.getElementById('detailEditBtn').style.display = '';
    document.getElementById('detailEditBtn').onclick = () => { closeDetail(); openEdit(id); };
  } else {
    document.getElementById('detailEditBtn').style.display = 'none';
  }

  if (commentsUnsub) commentsUnsub();
  commentsUnsub = onValue(wsRef('comments', id), snap => {
    if (detailTaskId !== id) return;
    const data     = snap.val() || {};
    const comments = Object.entries(data).map(([cid, c]) => ({ id: cid, ...c })).sort((a,b) => a.createdAt - b.createdAt);
    const list     = document.getElementById('commentsList');
    if (!comments.length) {
      list.innerHTML = '<div class="no-comments">No comments yet. Be the first!</div>';
      return;
    }
    list.innerHTML = comments.map(c => {
      const author   = users[c.author];
      const name     = author ? author.name : 'Unknown';
      const time     = new Date(c.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const isOwn    = currentUser && c.author === currentUser.id;
      const editedTag = c.editedAt ? '<span class="comment-edited">(edited)</span>' : '';
      return `<div class="comment" data-cid="${c.id}">
        ${avatarHtml(name, true)}
        <div class="comment-body">
          <div class="comment-meta">
            <strong>${escHtml(name)}</strong>
            <span class="comment-time">${time}</span>
            ${editedTag}
            ${isOwn ? `<button class="comment-edit-btn" data-cid="${c.id}" title="Edit comment">${ICONS.edit}</button>` : ''}
          </div>
          <p class="comment-text" data-cid="${c.id}">${escHtml(c.text)}</p>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('.comment-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cData = comments.find(x => x.id === btn.dataset.cid);
        if (cData) startEditComment(btn.dataset.cid, cData);
      });
    });
    list.scrollTop = list.scrollHeight;
  });

  document.getElementById('detailOverlay').classList.add('open');
  document.getElementById('commentInput').focus();
  return true;
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
  detailTaskId = null;
  if (commentsUnsub) { commentsUnsub(); commentsUnsub = null; }
}

// ─── COMMENTS ─────────────────────────────────────────────────────────────────
async function postComment() {
  if (!currentUser || !detailTaskId) return;
  const input = document.getElementById('commentInput');
  const text  = input.value.trim();
  if (!text) return;

  const commentData = { text, author: currentUser.id, createdAt: Date.now() };

  const task = tasks[detailTaskId];
  if (task) {
    const recipient = currentUser.id === task.assignedTo ? task.createdBy : task.assignedTo;
    if (recipient && recipient !== currentUser.id) {
      const preview   = text.length > 80 ? text.slice(0, 80) + '…' : text;
      const notifRef  = push(wsRef('notifications', recipient), {
        message: `${currentUser.name} commented on "${task.title}": "${preview}"`,
        taskId: detailTaskId, read: false, createdAt: Date.now(),
      });
      commentData.notifId = notifRef.key;
      commentData.notifTo = recipient;
    }
  }

  await push(wsRef('comments', detailTaskId), commentData);
  input.value = '';
}

document.getElementById('postCommentBtn').addEventListener('click', postComment);
document.getElementById('commentInput').addEventListener('keydown', e => { if (e.key === 'Enter') postComment(); });

// ─── COMMENT EDITING ──────────────────────────────────────────────────────────
function startEditComment(cid, comment) {
  const commentEl = document.querySelector(`.comment[data-cid="${cid}"]`);
  if (!commentEl) return;
  const textEl = commentEl.querySelector('.comment-text');
  if (!textEl) return;
  const origText = comment.text;
  textEl.outerHTML = `<div class="comment-edit-area">
    <textarea class="comment-edit-input" id="editCommentInput_${cid}" rows="2">${escHtml(origText)}</textarea>
    <div class="comment-edit-actions">
      <button class="btn-sm btn-primary" id="saveEdit_${cid}">Save</button>
      <button class="btn-sm btn-secondary" id="cancelEdit_${cid}">Cancel</button>
    </div>
  </div>`;
  const inp = document.getElementById(`editCommentInput_${cid}`);
  if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  document.getElementById(`saveEdit_${cid}`)?.addEventListener('click', () => saveCommentEdit(cid, comment));
  document.getElementById(`cancelEdit_${cid}`)?.addEventListener('click', () => {
    const editArea = document.querySelector(`.comment[data-cid="${cid}"] .comment-edit-area`);
    if (editArea) editArea.outerHTML = `<p class="comment-text" data-cid="${cid}">${escHtml(origText)}</p>`;
  });
}

async function saveCommentEdit(cid, originalComment) {
  const input = document.getElementById(`editCommentInput_${cid}`);
  if (!input) return;
  const newText = input.value.trim();
  if (!newText) return;

  await update(wsRef('comments', detailTaskId, cid), { text: newText, editedAt: Date.now() });

  if (originalComment.notifTo && originalComment.notifId) {
    const task = tasks[detailTaskId];
    if (task) {
      const preview = newText.length > 80 ? newText.slice(0, 80) + '…' : newText;
      await update(wsRef('notifications', originalComment.notifTo, originalComment.notifId), {
        message: `${currentUser.name} commented on "${task.title}": "${preview}" (edited)`,
      });
    }
  }
}

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────
async function notify(toUserId, message, taskId) {
  if (!toUserId || toUserId === currentUser?.id) return;
  await push(wsRef('notifications', toUserId), { message, taskId: taskId || '', read: false, createdAt: Date.now() });
}

async function notifyParticipants(task, taskId, message) {
  if (task.createdBy && task.createdBy !== currentUser?.id) {
    await notify(task.createdBy, message, taskId);
  }
}

// ─── NOTIFICATION TASK ID RESOLVER ────────────────────────────────────────────
async function resolveNotifTaskId(notifId) {
  if (!notifId || !currentUser) return '';
  try {
    const s = await get(wsRef('notifications', currentUser.id, notifId));
    if (!s.exists()) return '';
    const val = s.val();
    if (val.taskId) return val.taskId;
    await tasksLoaded;
    const m = (val.message || '').match(/"([^"]+)"/);
    if (!m) return '';
    const title   = m[1];
    const matchId = Object.keys(tasks).find(id => tasks[id]?.title === title);
    if (!matchId) return '';
    update(wsRef('notifications', currentUser.id, notifId), { taskId: matchId });
    return matchId;
  } catch { return ''; }
}

// ─── ACTIVITY SIDEBAR ─────────────────────────────────────────────────────────
function renderNotifSidebar() {
  const body = document.getElementById('notifSidebarBody');
  if (!body) return;

  if (!currentUser) {
    body.innerHTML = '<div class="sidebar-empty">Sign in to see your activity</div>';
    return;
  }

  const allMyNotifs = Object.entries(allNotifications[currentUser.id] || {})
    .map(([id, n]) => ({ id, ...n }))
    .sort((a, b) => b.createdAt - a.createdAt);

  if (!allMyNotifs.length) {
    body.innerHTML = '<div class="sidebar-empty">No activity yet</div>';
    return;
  }

  const visible = allMyNotifs.slice(0, sidebarLimit);
  const hasMore = allMyNotifs.length > sidebarLimit;

  body.innerHTML = visible.map(n => {
    const time = new Date(n.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    return `<div class="sidebar-notif-item ${n.read ? '' : 'unread'}" data-task="${n.taskId || ''}" data-id="${n.id}">
      <div class="sidebar-notif-msg">${escHtml(n.message)}</div>
      <div class="sidebar-notif-time">${time}</div>
    </div>`;
  }).join('') + (hasMore ? `<button class="sidebar-show-more" id="sidebarShowMore">Show more</button>` : '');

  body.querySelectorAll('.sidebar-notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      let taskId    = item.dataset.task;
      const notifId = item.dataset.id;
      if ((!taskId || taskId === 'undefined' || taskId === 'null') && notifId && currentUser) {
        taskId = await resolveNotifTaskId(notifId);
      }
      const found = await openDetail(taskId);
      if (found === false && notifId && currentUser) {
        remove(wsRef('notifications', currentUser.id, notifId));
      }
      if (found && notifId && currentUser) {
        update(wsRef('notifications', currentUser.id, notifId), { read: true });
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
const BASE_TITLE      = 'AchieverBoard';

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
  } catch (e) { audioCtx = null; }
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

// ─── HEADER NOTIFICATION PANEL ────────────────────────────────────────────────
function setupNotifListener() {
  if (notifBadgeUnsub) { notifBadgeUnsub(); notifBadgeUnsub = null; }
  const badge = document.getElementById('notifBadge');
  badge.textContent = '';
  badge.classList.remove('visible');
  document.getElementById('notifList').innerHTML = '<div class="no-notifs">No notifications yet</div>';
  if (!currentUser) return;

  notifBadgeUnsub = onValue(wsRef('notifications', currentUser.id), snap => {
    const data   = snap.val() || {};
    const notifs = Object.entries(data).map(([id, n]) => ({ id, ...n })).sort((a,b) => b.createdAt - a.createdAt);
    const unread = notifs.filter(n => !n.read).length;

    const incomingIds = new Set(Object.keys(data));
    if (knownNotifIds === null) {
      knownNotifIds = incomingIds;
    } else {
      const newNotifs = notifs.filter(n => !knownNotifIds.has(n.id));
      if (newNotifs.length) playNotificationSound();
      knownNotifIds = incomingIds;
    }

    badge.textContent = unread;
    badge.classList.toggle('visible', unread > 0);

    const list = document.getElementById('notifList');
    if (!notifs.length) {
      list.innerHTML = '<div class="no-notifs">No notifications yet</div>';
      return;
    }
    list.innerHTML = notifs.slice(0, 30).map(n => {
      const time = new Date(n.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      return `<div class="notif-item ${n.read?'':'unread'}" data-id="${n.id}" data-task="${n.taskId}">
        <div class="notif-msg">${escHtml(n.message)}</div>
        <div class="notif-time">${time}</div>
      </div>`;
    }).join('');

    list.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', async () => {
        let taskId    = item.dataset.task;
        const notifId = item.dataset.id;
        closeNotifPanel();
        if ((!taskId || taskId === 'undefined' || taskId === 'null') && notifId && currentUser) {
          taskId = await resolveNotifTaskId(notifId);
        }
        const found = await openDetail(taskId);
        if (found === false && notifId && currentUser) {
          remove(wsRef('notifications', currentUser.id, notifId));
        } else if (notifId && currentUser) {
          update(wsRef('notifications', currentUser.id, notifId), { read: true });
        }
      });
    });
  });
}

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
  if (!currentUser) return;
  const snap = await get(wsRef('notifications', currentUser.id));
  const data = snap.val() || {};
  const upd  = Object.fromEntries(Object.keys(data).map(k => [`${k}/read`, true]));
  if (Object.keys(upd).length) await update(wsRef('notifications', currentUser.id), upd);
});

function closeNotifPanel() { document.getElementById('notifPanel').classList.remove('open'); }
document.addEventListener('click', e => { if (!e.target.closest('.notif-wrapper')) closeNotifPanel(); });

// ─── DARK MODE ────────────────────────────────────────────────────────────────
document.getElementById('themeBtn').addEventListener('click', () => {
  const isDark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
});

// ─── PROFILE SETTINGS ─────────────────────────────────────────────────────────
document.getElementById('currentUserBtn').addEventListener('click', openProfile);

function openProfile() {
  if (!currentUser) return;
  const u = users[currentUser.id];
  if (!u) return;

  document.getElementById('profileNameDisplay').textContent =
    u.name + (u.passwordHash ? '' : ' (no password)');
  document.getElementById('profileMemberSince').textContent =
    u.createdAt ? `Member since ${fmtTimestamp(u.createdAt)}` : '';

  const preview = document.getElementById('profilePhotoPreview');
  if (u.photoURL) {
    preview.innerHTML = `<img class="avatar avatar-lg avatar-photo" src="${u.photoURL}" alt="${escHtml(initials(u.name))}" style="width:72px;height:72px">`;
  } else {
    preview.innerHTML = `<span class="avatar" style="background:${avatarColor(u.name)};width:72px;height:72px;font-size:1.6rem">${initials(u.name)}</span>`;
  }

  document.getElementById('profileEmail').value           = u.email || '';
  document.getElementById('profileNewPassword').value     = '';
  document.getElementById('profileConfirmPassword').value = '';
  document.getElementById('profileError').textContent     = '';
  pendingProfilePhoto = null;
  document.getElementById('profilePhotoInput').value = '';

  renderAdminSection();
  document.getElementById('profileOverlay').classList.add('open');
}

function closeProfile() {
  document.getElementById('profileOverlay').classList.remove('open');
}

document.getElementById('closeProfile').addEventListener('click', closeProfile);
document.getElementById('profileOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeProfile(); });

document.getElementById('profilePhotoEditBtn').addEventListener('click', () => {
  document.getElementById('profilePhotoInput').click();
});

document.getElementById('profilePhotoInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  pendingProfilePhoto = await resizeImage(file, 200);
  const preview = document.getElementById('profilePhotoPreview');
  preview.innerHTML = `<img class="avatar avatar-lg avatar-photo" src="${pendingProfilePhoto}" alt="preview" style="width:72px;height:72px">`;
});

document.getElementById('saveProfileBtn').addEventListener('click', async () => {
  if (!currentUser) return;
  const err        = document.getElementById('profileError');
  const newPwd     = document.getElementById('profileNewPassword').value;
  const confirmPwd = document.getElementById('profileConfirmPassword').value;
  const email      = document.getElementById('profileEmail').value.trim().toLowerCase();

  if (newPwd || confirmPwd) {
    if (newPwd !== confirmPwd) { err.textContent = 'Passwords do not match.'; return; }
    if (newPwd.length < 4)    { err.textContent = 'Password must be at least 4 characters.'; return; }
  }
  err.textContent = '';

  const updates = {};
  if (newPwd)              updates.passwordHash = await hashPassword(newPwd);
  if (pendingProfilePhoto) updates.photoURL     = pendingProfilePhoto;
  updates.email = email || null;

  await update(wsRef('users', currentUser.id), updates);
  pendingProfilePhoto = null;
  closeProfile();
});

// ─── DELETE ACCOUNT ───────────────────────────────────────────────────────────
document.getElementById('deleteAccountBtn').addEventListener('click', () => {
  if (!currentUser) return;
  const u      = users[currentUser.id];
  const hasPwd = !!u?.passwordHash;
  const isAdmin = currentUser.role === 'admin';

  document.getElementById('deleteAccountMsg').textContent = isAdmin
    ? `Delete your admin account "${currentUser.name}"? This will permanently delete the entire workspace and all its tasks, members, and data. This cannot be undone.`
    : `Delete your account "${currentUser.name}"? This cannot be undone.`;

  document.getElementById('deleteAccountPwdGroup').style.display = hasPwd ? '' : 'none';
  document.getElementById('deleteAccountPwdInput').value         = '';
  document.getElementById('deleteAccountPwdError').textContent   = '';
  document.getElementById('deleteAccountOverlay').classList.add('open');
});

function closeDeleteAccountOverlay() {
  document.getElementById('deleteAccountOverlay').classList.remove('open');
  document.getElementById('deleteAccountPwdInput').value       = '';
  document.getElementById('deleteAccountPwdError').textContent = '';
}

document.getElementById('deleteAccountOverlayClose').addEventListener('click', closeDeleteAccountOverlay);
document.getElementById('deleteAccountOverlayCancel').addEventListener('click', closeDeleteAccountOverlay);
document.getElementById('deleteAccountOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDeleteAccountOverlay(); });

document.getElementById('deleteAccountOverlayOk').addEventListener('click', async () => {
  if (!currentUser) return;
  const u = users[currentUser.id];

  if (u?.passwordHash) {
    const pwd = document.getElementById('deleteAccountPwdInput').value;
    if (!pwd) { document.getElementById('deleteAccountPwdError').textContent = 'Please enter your password.'; return; }
    const hash = await hashPassword(pwd);
    if (hash !== u.passwordHash) { document.getElementById('deleteAccountPwdError').textContent = 'Incorrect password.'; return; }
  }

  closeDeleteAccountOverlay();
  const wsId = currentUser.workspaceId;
  const uid  = currentUser.id;
  const role = currentUser.role;

  stopWorkspaceListeners();
  if (role === 'admin') {
    // Admin deletes the entire workspace
    await remove(ref(db, `workspaces/${wsId}`));
  } else {
    // Member removes only their own account
    await remove(ref(db, `workspaces/${wsId}/users/${uid}`));
    await remove(ref(db, `workspaces/${wsId}/notifications/${uid}`));
  }

  clearCurrentUser();
  knownNotifIds = null;
  tasks = {}; users = {}; commentCounts = {}; allNotifications = {};
  closeProfile();
  renderBoard();
  renderNotifSidebar();
  updateHeaderUser();
  setupNotifListener();

  // Show guest banner, hide board
  const guestBanner  = document.getElementById('guestBanner');
  const boardWrapper = document.querySelector('.board-wrapper');
  if (guestBanner)  guestBanner.style.display  = '';
  if (boardWrapper) boardWrapper.style.display = 'none';
});

// ─── ADMIN TEAM PANEL ─────────────────────────────────────────────────────────
function renderAdminSection() {
  const section = document.getElementById('adminTeamSection');
  if (!section) return;
  if (!currentUser || currentUser.role !== 'admin') { section.style.display = 'none'; return; }
  section.style.display = '';

  const userArr    = Object.entries(users).map(([id, u]) => ({ id, ...u })).sort((a, b) => a.name.localeCompare(b.name));
  const maxUsers   = currentWorkspaceMeta?.maxUsers || 0;
  const memberCount = userArr.length;

  document.getElementById('seatUsage').textContent = maxUsers > 0
    ? `${memberCount} / ${maxUsers} seats`
    : `${memberCount} member${memberCount !== 1 ? 's' : ''}`;

  const canAdd = maxUsers === 0 || memberCount < maxUsers;
  const addBtn = document.getElementById('addMemberBtn');
  if (addBtn) {
    addBtn.disabled    = false;
    addBtn.textContent = canAdd ? '+ Add Team Member' : '↑ Upgrade Plan to Add More';
    addBtn.title       = canAdd ? '' : `All ${maxUsers} seats are filled — upgrade to add more members`;
    addBtn.onclick     = canAdd ? null : (e => { e.stopPropagation(); openUpgradeModal(); });
  }

  document.getElementById('membersList').innerHTML = userArr.map(u => `
    <div class="member-row">
      ${avatarHtml(u.name)}
      <span class="member-name">${escHtml(u.name)}${u.role === 'admin' ? ' <span class="admin-tag">admin</span>' : ''}</span>
      ${u.id !== currentUser.id
        ? `<button class="btn-icon delete remove-member-btn" data-uid="${u.id}" title="Remove ${escHtml(u.name)}">${ICONS.trash}</button>`
        : '<span class="its-you-tag">you</span>'}
    </div>`).join('');

  document.getElementById('membersList').querySelectorAll('.remove-member-btn').forEach(btn => {
    btn.addEventListener('click', () => openDeleteMemberModal(btn.dataset.uid));
  });
}

// ─── DELETE MEMBER MODAL ──────────────────────────────────────────────────────
let pendingDeleteUid = null;

function openDeleteMemberModal(uid) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const u = users[uid];
  if (!u || uid === currentUser.id) return;
  pendingDeleteUid = uid;
  document.getElementById('deleteMemberMsg').textContent =
    `You are about to remove "${u.name}" from this workspace. They will lose access immediately, but their tasks will remain. Enter your admin password to confirm.`;
  document.getElementById('deleteMemberPassword').value = '';
  document.getElementById('deleteMemberError').textContent = '';
  document.getElementById('deleteMemberOverlay').classList.add('open');
  document.getElementById('deleteMemberPassword').focus();
}

function closeDeleteMemberModal() {
  pendingDeleteUid = null;
  document.getElementById('deleteMemberOverlay')?.classList.remove('open');
}

async function confirmDeleteMember() {
  const errEl = document.getElementById('deleteMemberError');
  const pwd   = document.getElementById('deleteMemberPassword').value;
  errEl.textContent = '';
  if (!pwd) { errEl.textContent = 'Please enter your password.'; return; }

  const adminUser = users[currentUser.id];
  const hash = await hashPassword(pwd);
  if (hash !== adminUser.passwordHash) {
    errEl.textContent = 'Incorrect password. Please try again.';
    return;
  }

  const uid  = pendingDeleteUid;
  const name = users[uid]?.name || 'Member';
  closeDeleteMemberModal();
  await remove(wsRef('users', uid));
  await remove(wsRef('notifications', uid));
  showToast(`${name} has been removed from the workspace.`);
}

document.getElementById('deleteMemberConfirmBtn')?.addEventListener('click', confirmDeleteMember);
document.getElementById('deleteMemberCloseBtn')?.addEventListener('click', closeDeleteMemberModal);
document.getElementById('deleteMemberCancelBtn')?.addEventListener('click', closeDeleteMemberModal);
document.getElementById('deleteMemberOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeDeleteMemberModal(); });
document.getElementById('deleteMemberPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') confirmDeleteMember(); });

function openAddMemberModal() {
  document.getElementById('memberName').value          = '';
  document.getElementById('memberEmail').value         = '';
  document.getElementById('memberPassword').value      = '';
  document.getElementById('addMemberError').textContent = '';
  document.getElementById('addMemberOverlay').classList.add('open');
  document.getElementById('memberName').focus();
}

function closeAddMemberModal() {
  document.getElementById('addMemberOverlay').classList.remove('open');
}

async function submitAddMember() {
  const name  = document.getElementById('memberName').value.trim();
  const email = document.getElementById('memberEmail').value.trim().toLowerCase();
  const pwd   = document.getElementById('memberPassword').value;
  const errEl = document.getElementById('addMemberError');
  errEl.textContent = '';

  if (!name)          { errEl.textContent = 'Please enter a name.';                      return; }
  if (!pwd)           { errEl.textContent = 'Please set a password.';                    return; }
  if (pwd.length < 4) { errEl.textContent = 'Password must be at least 4 characters.';  return; }

  if (Object.values(users).some(u => u.name.toLowerCase() === name.toLowerCase())) {
    errEl.textContent = 'A member with this name already exists.';
    return;
  }

  const maxUsers = currentWorkspaceMeta?.maxUsers || 0;
  if (maxUsers > 0 && Object.keys(users).length >= maxUsers) {
    closeAddMemberModal();
    openUpgradeModal();
    return;
  }

  const hash       = await hashPassword(pwd);
  const memberData = { name, passwordHash: hash, role: 'member', createdAt: Date.now() };
  if (email) memberData.email = email;

  await push(wsRef('users'), memberData);
  closeAddMemberModal();
  showToast(`${name} has been added to the workspace.`);
}

document.getElementById('addMemberBtn')?.addEventListener('click', openAddMemberModal);
document.getElementById('addMemberClose')?.addEventListener('click', closeAddMemberModal);
document.getElementById('addMemberCancel')?.addEventListener('click', closeAddMemberModal);
document.getElementById('addMemberSubmit')?.addEventListener('click', submitAddMember);
document.getElementById('addMemberOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeAddMemberModal(); });

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
  if (!currentUser) {
    pendingAfterLogin = () => openNew();
    showUserOverlay();
    return;
  }
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
    closeDeleteAccountOverlay(); closeFilePreview(); closeAddMemberModal();
  }
});

// ─── TOAST ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
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
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3000);
}

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
loadCurrentUser();
const _guestBanner  = document.getElementById('guestBanner');
const _boardWrapper = document.querySelector('.board-wrapper');

if (currentUser) {
  if (_guestBanner)  _guestBanner.style.display  = 'none';
  if (_boardWrapper) _boardWrapper.style.display = '';
  updateHeaderUser();
  currentUserFilter = currentUser.id;
  startWorkspaceListeners();
  setupNotifListener();
} else {
  if (_guestBanner)  _guestBanner.style.display  = '';
  if (_boardWrapper) _boardWrapper.style.display = 'none';
  handlePaymentReturn(); // handles ?payment_ok=1 and ?payment_cancelled=1 from Stripe
}

