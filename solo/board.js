import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─── SUPABASE CONFIG ────────────────────────────────────────────────────────
// Get these two values from: Supabase Dashboard → Project Settings → API.
// The anon key is safe to expose in client code — it has no power on its own;
// every table is protected by Row Level Security (see supabase/migrations/0001_init.sql),
// so a request can only ever touch the signed-in user's own rows.
const SUPABASE_URL      = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

if (SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_')) {
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;text-align:center;padding:24px">
    <div><h2 style="color:#4f46e5">Supabase setup required</h2>
    <p style="color:#64748b;max-width:420px">Open <strong>solo/board.js</strong> and replace <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> with your Supabase project's values (Project Settings → API).</p></div>
  </div>`;
  throw new Error('Supabase config not set up.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ATTACHMENTS_BUCKET = 'task-attachments';

// ─── SVG ICONS ─────────────────────────────────────────────────────────────────
const ICONS = {
  edit:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  comment: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  calendar:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  clock:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  clip:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  eye:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

// ─── DEMO TASKS (shown to signed-out visitors) ─────────────────────────────────
const _D = Date.now();
const DEMO_TASKS_TEMPLATE = {
  'demo-1': {
    isDemo: true,
    title: 'Redesign landing page hero section',
    desc: 'Update the hero copy, add a new CTA button, and replace the stock photo with the brand illustration. Coordinate with design on final approved copy.',
    priority: 'high', status: 'inprogress', scheduledFor: null, due: null,
    createdAt: _D - 86400000 * 2,
    resources: [
      { type: 'link', url: 'https://figma.com', name: 'Figma design file' },
      { type: 'file', url: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&q=80', name: 'hero-mockup.jpg', mime: 'image/jpeg' },
    ],
    createdBy: { name: 'Alex Kim', photoURL: 'https://i.pravatar.cc/40?img=3' },
  },
  'demo-2': {
    isDemo: true,
    title: 'Fix checkout form validation bug',
    desc: 'Users on mobile Safari can submit the checkout form without a valid email. Reproduce, patch the validation logic, and run cross-browser regression tests.',
    priority: 'high', status: 'todo', scheduledFor: null, due: null,
    createdAt: _D - 86400000 * 3,
    resources: [
      { type: 'file', url: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&q=80', name: 'bug-screenshot.jpg', mime: 'image/jpeg' },
    ],
    createdBy: { name: 'Alex Kim', photoURL: 'https://i.pravatar.cc/40?img=3' },
  },
  'demo-3': {
    isDemo: true,
    title: 'Write Q2 product roadmap',
    desc: 'Draft the roadmap for Q2 covering the three core feature pillars. Share with the team for async review and sign-off by end of the week.',
    priority: 'medium', status: 'todo', scheduledFor: null, due: null,
    createdAt: _D - 86400000 * 1,
    resources: [
      { type: 'link', url: 'https://docs.google.com', name: 'Google Docs draft' },
    ],
    createdBy: { name: 'Jordan Lee', photoURL: 'https://i.pravatar.cc/40?img=12' },
  },
  'demo-4': {
    isDemo: true,
    title: 'Set up onboarding email sequences',
    desc: 'Configure a 3-part drip campaign in Mailchimp: welcome email, day-3 tips, and day-7 check-in. Use the approved brand templates.',
    priority: 'medium', status: 'inprogress', scheduledFor: null, due: null,
    createdAt: _D - 86400000 * 4,
    resources: [
      { type: 'link', url: 'https://mailchimp.com', name: 'Mailchimp campaign' },
      { type: 'file', url: 'https://images.unsplash.com/photo-1596526131083-e8c633c948d2?w=600&q=80', name: 'email-template.jpg', mime: 'image/jpeg' },
    ],
    createdBy: { name: 'Sam Rivera', photoURL: 'https://i.pravatar.cc/40?img=52' },
  },
  'demo-5': {
    isDemo: true,
    title: 'Waiting on legal review of updated ToS',
    desc: 'Legal team is reviewing the revised terms of service document. No action needed until their feedback is received.',
    priority: 'low', status: 'pending', scheduledFor: null, due: null,
    createdAt: _D - 86400000 * 5,
    resources: [
      { type: 'link', url: 'https://docs.google.com', name: 'ToS draft document' },
    ],
    createdBy: { name: 'Jordan Lee', photoURL: 'https://i.pravatar.cc/40?img=12' },
  },
  'demo-6': {
    isDemo: true,
    title: 'Publish help center articles',
    desc: 'Wrote and published 5 how-to articles covering the most common support questions. All published to the knowledge base.',
    priority: 'medium', status: 'done', scheduledFor: null, due: null,
    createdAt: _D - 86400000 * 7,
    resources: [
      { type: 'link', url: 'https://notion.so', name: 'Article drafts in Notion' },
    ],
    createdBy: { name: 'Sam Rivera', photoURL: 'https://i.pravatar.cc/40?img=52' },
  },
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser        = null;   // Supabase auth user, or null
let currentBoard       = null;   // { id, name }
let tasks              = {};
let demoTasks          = null;   // populated when signed out
let commentCounts      = {};
let allNotifications   = {};
let knownNotifIds      = null;
let editingTaskId      = null;
let detailTaskId       = null;
let draggedId          = null;
let tasksChannel        = null;
let commentsChannel     = null;   // board-wide, for comment counts
let taskCommentsChannel = null;   // scoped to the open task's detail view
let notifChannel        = null;
let currentFilter      = 'all';
let customDateStart    = null;
let customDateEnd      = null;
let colPriorityFilter  = { todo: 'all', inprogress: 'all', pending: 'all', done: 'all', overdue: 'all' };
let pendingDeleteId    = null;
let pendingResourceFiles = [];   // [{ url, path, name, size }]
let pendingResourceLinks = [''];
let _resolveTasksLoaded;
const tasksLoaded = new Promise(r => { _resolveTasksLoaded = r; });

function isDemoTask(id) {
  return demoTasks !== null && id in demoTasks;
}

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

function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), duration);
}

const byNewest = (a, b) => b.createdAt - a.createdAt;

// Map a Postgres task row to the in-memory shape the renderer expects.
function rowToTask(row) {
  return {
    title:              row.title,
    desc:               row.description || '',
    priority:           row.priority,
    status:             row.status,
    scheduledFor:       row.scheduled_for,
    due:                row.due_date,
    resources:          row.resources || [],
    createdAt:          new Date(row.created_at).getTime(),
    overdueNotifiedAt:  row.overdue_notified_at ? new Date(row.overdue_notified_at).getTime() : null,
  };
}

// Extract the storage object path from a public attachment URL, e.g.
// ".../storage/v1/object/public/task-attachments/<uid>/<file>" → "<uid>/<file>"
function storagePathFromUrl(url) {
  const marker = `/object/public/${ATTACHMENTS_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

async function deleteResourceFiles(resources) {
  const paths = (resources || [])
    .filter(r => r.type === 'file')
    .map(r => storagePathFromUrl(r.url))
    .filter(Boolean);
  if (paths.length) {
    try { await supabase.storage.from(ATTACHMENTS_BUCKET).remove(paths); } catch {}
  }
}

// ─── AUTH OVERLAY ─────────────────────────────────────────────────────────────
function showAuthOverlay(tab = 'login') {
  document.getElementById('authOverlay').classList.add('open');
  setAuthTab(tab);
  document.getElementById('loginErr').textContent  = '';
  document.getElementById('signupErr').textContent = '';
}

function hideAuthOverlay() {
  document.getElementById('authOverlay').classList.remove('open');
}

function setAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('authTabLogin').classList.toggle('active', isLogin);
  document.getElementById('authTabSignup').classList.toggle('active', !isLogin);
  document.getElementById('loginSection').style.display  = isLogin ? '' : 'none';
  document.getElementById('signupSection').style.display = isLogin ? 'none' : '';
  (isLogin ? document.getElementById('loginEmail') : document.getElementById('signupEmail')).focus();
}

document.getElementById('authTabLogin').addEventListener('click', () => setAuthTab('login'));
document.getElementById('authTabSignup').addEventListener('click', () => setAuthTab('signup'));

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
  hideAuthOverlay();
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
    options: { emailRedirectTo: window.location.origin },
  });
  btn.disabled = false; btn.textContent = 'Create Free Account';
  if (error) { errEl.textContent = error.message; return; }

  if (data.session) {
    hideAuthOverlay();
  } else {
    errEl.style.color = '#16a34a';
    errEl.textContent = 'Account created! Check your email to confirm it, then log in.';
    setAuthTab('login');
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('loginEmail').value.trim();
  const errEl = document.getElementById('loginErr');
  if (!email) { errEl.textContent = 'Enter your email above first, then click "Forgot password?".'; return; }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
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
document.getElementById('authOverlayClose').addEventListener('click', hideAuthOverlay);

// ─── ENTER / EXIT BOARD ───────────────────────────────────────────────────────
async function ensureBoard() {
  const { data: existing, error: selErr } = await supabase
    .from('boards').select('id,name').eq('owner_id', currentUser.id).limit(1).maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing;

  // Defensive fallback — normally the signup trigger already created one.
  const { data: created, error: insErr } = await supabase
    .from('boards').insert({ name: 'My Board' }).select('id,name').single();
  if (insErr) throw insErr;
  return created;
}

async function enterBoard() {
  currentBoard = await ensureBoard();
  demoTasks = null;
  const nameEl = document.getElementById('spaceNameDisplay');
  nameEl.textContent = currentUser.email;
  document.getElementById('spaceDisplay').classList.add('visible');
  document.getElementById('boardSettingsWrapper').style.display = '';
  await subscribeToBoard();
}

async function subscribeToBoard() {
  if (tasksChannel)        supabase.removeChannel(tasksChannel);
  if (commentsChannel)     supabase.removeChannel(commentsChannel);
  if (notifChannel)        supabase.removeChannel(notifChannel);
  const boardId = currentBoard.id;

  // ── Tasks: initial load + realtime ──
  const { data: taskRows } = await supabase.from('tasks').select('*').eq('board_id', boardId);
  tasks = {};
  (taskRows || []).forEach(row => { tasks[row.id] = rowToTask(row); });
  _resolveTasksLoaded();
  renderBoard();
  checkAndNotifyOverdue();

  tasksChannel = supabase.channel(`tasks-${boardId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `board_id=eq.${boardId}` }, payload => {
      if (payload.eventType === 'DELETE') { delete tasks[payload.old.id]; }
      else { tasks[payload.new.id] = rowToTask(payload.new); }
      renderBoard();
    })
    .subscribe();

  // ── Comment counts: initial load + realtime ──
  const { data: commentRows } = await supabase.from('comments').select('task_id').eq('board_id', boardId);
  commentCounts = {};
  (commentRows || []).forEach(c => { commentCounts[c.task_id] = (commentCounts[c.task_id] || 0) + 1; });
  renderBoard();

  commentsChannel = supabase.channel(`comments-${boardId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `board_id=eq.${boardId}` }, payload => {
      const tid = payload.new.task_id;
      commentCounts[tid] = (commentCounts[tid] || 0) + 1;
      renderBoard();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments', filter: `board_id=eq.${boardId}` }, payload => {
      const tid = payload.old.task_id;
      if (commentCounts[tid]) commentCounts[tid]--;
      renderBoard();
    })
    .subscribe();

  await setupNotifListener();
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

function monthRange(offset = 0) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + offset;
  const start = new Date(y, m, 1);
  const end   = new Date(y, m + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function taskMatchesFilter(task) {
  if (currentFilter === 'all') return true;

  const today = new Date(); today.setHours(0,0,0,0);

  if (currentFilter === 'overdue') {
    return task.due && new Date(task.due + 'T00:00:00') < today;
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

  if (currentFilter === 'today') {
    const end = new Date(today); end.setHours(23,59,59,999);
    return d >= today && d <= end;
  }

  if (currentFilter === 'yesterday') {
    const yStart = new Date(today); yStart.setDate(today.getDate() - 1);
    const yEnd   = new Date(yStart); yEnd.setHours(23,59,59,999);
    return d >= yStart && d <= yEnd;
  }

  if (currentFilter === 'last-week')  { const { start, end } = weekRange(-1); return d >= start && d <= end; }
  if (currentFilter === 'next-week')  { const { start, end } = weekRange(1);  return d >= start && d <= end; }
  if (currentFilter === 'last-month') { const { start, end } = monthRange(-1); return d >= start && d <= end; }
  if (currentFilter === 'next-month') { const { start, end } = monthRange(1);  return d >= start && d <= end; }

  if (currentFilter === 'last-30-days') {
    const start = new Date(today); start.setDate(today.getDate() - 30);
    const end   = new Date(today); end.setHours(23,59,59,999);
    return d >= start && d <= end;
  }

  return true;
}

const FILTER_LABELS = {
  'today':        'Today',
  'yesterday':    'Yesterday',
  'last-week':    'Last Week',
  'last-month':   'Last Month',
  'next-week':    'Next Week',
  'next-month':   'Next Month',
  'overdue':      'Overdue',
  'last-30-days': 'Last 30 days',
  'custom':       'Custom range',
};

// ─── BOARD RENDERING ──────────────────────────────────────────────────────────
function renderBoard() {
  const demo = !currentBoard && demoTasks !== null;
  const src  = demo ? demoTasks : tasks;

  document.body.classList.toggle('demo-active', demo);

  const dateSel = document.getElementById('dateFilter');
  if (dateSel) { dateSel.value = currentFilter; dateSel.classList.toggle('active', currentFilter !== 'all'); }

  const bar   = document.getElementById('filterBar');
  const label = document.getElementById('filterBarLabel');
  let part = '';
  if (!demo && currentFilter === 'custom') {
    const fmt = s => s ? new Date(s + 'T00:00:00').toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' }) : '…';
    part = `${fmt(customDateStart)} – ${fmt(customDateEnd)}`;
  } else if (!demo && currentFilter !== 'all') {
    part = FILTER_LABELS[currentFilter] || currentFilter;
  }
  bar.classList.toggle('visible', !!part);
  label.textContent = part ? `Showing: ${part}` : '';

  ['todo','inprogress','pending','done','overdue'].forEach(col => {
    const sel = document.getElementById('pf-' + col);
    if (sel) sel.classList.toggle('active', colPriorityFilter[col] !== 'all');
  });

  ['todo', 'inprogress', 'pending'].forEach(status => {
    const list  = document.getElementById('list-'  + status);
    const count = document.getElementById('count-' + status);
    const items = Object.entries(src)
      .filter(([, t]) => t.status === status && !isOverdue(t.due))
      .map(([id, t]) => ({ id, ...t }))
      .filter(t => demo || taskMatchesFilter(t))
      .filter(t => colPriorityFilter[status] === 'all' || t.priority === colPriorityFilter[status])
      .sort(byNewest);

    count.textContent = items.length;
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </div>${part ? 'No tasks in this range' : 'No tasks yet'}</div>`;
    } else {
      items.forEach(t => list.appendChild(buildCard(t)));
    }
  });

  const doneList  = document.getElementById('list-done');
  const doneCount = document.getElementById('count-done');
  const doneItems = Object.entries(src)
    .filter(([, t]) => t.status === 'done')
    .map(([id, t]) => ({ id, ...t }))
    .filter(t => demo || taskMatchesFilter(t))
    .filter(t => colPriorityFilter.done === 'all' || t.priority === colPriorityFilter.done)
    .sort(byNewest);
  doneCount.textContent = doneItems.length;
  doneList.innerHTML = '';
  if (!doneItems.length) {
    doneList.innerHTML = `<div class="empty-state"><div class="empty-icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>No completed tasks</div>`;
  } else {
    doneItems.forEach(t => doneList.appendChild(buildCard(t)));
  }

  const overdueList  = document.getElementById('list-overdue');
  const overdueCount = document.getElementById('count-overdue');
  const overdueItems = Object.entries(src)
    .filter(([, t]) => t.status !== 'done' && isOverdue(t.due))
    .map(([id, t]) => ({ id, ...t }))
    .filter(t => colPriorityFilter.overdue === 'all' || t.priority === colPriorityFilter.overdue)
    .sort(byNewest);
  overdueCount.textContent = overdueItems.length;
  overdueList.innerHTML = '';
  if (!overdueItems.length) {
    overdueList.innerHTML = `<div class="empty-state"><div class="empty-icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>No overdue tasks</div>`;
  } else {
    overdueItems.forEach(t => overdueList.appendChild(buildCard(t)));
  }
}

function buildCard(task) {
  const overdue = isOverdue(task.due);
  const cCount  = commentCounts[task.id] || 0;
  const hasRes  = !!(task.resources && task.resources.length);

  const card = document.createElement('div');
  card.className  = 'task-card';
  if (task.isDemo) card.classList.add('task-card--demo');
  card.dataset.id = task.id;
  card.draggable  = true;
  card.style.cursor = 'grab';

  card.innerHTML = `
    <div class="task-card-header">
      <span class="task-title">${escHtml(task.title)}</span>
      ${!task.isDemo ? `<div class="card-actions">
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
        ${!task.isDemo ? `<span class="comment-count" title="${cCount} note${cCount === 1 ? '' : 's'}">${ICONS.comment} ${cCount}</span>` : ''}
        ${hasRes ? `<span class="resource-indicator" title="Has attachment">${ICONS.clip}</span>` : ''}
        ${task.createdBy ? `<img class="demo-avatar-img-sm" src="${escHtml(task.createdBy.photoURL)}" alt="${escHtml(task.createdBy.name)}" title="${escHtml(task.createdBy.name)}">` : ''}
      </div>
    </div>`;

  if (!task.isDemo) {
    card.querySelector('.btn-icon.edit').addEventListener('click',   e => { e.stopPropagation(); openEdit(task.id); });
    card.querySelector('.btn-icon.delete').addEventListener('click', e => { e.stopPropagation(); deleteTask(task.id); });
  }

  card.addEventListener('dragstart', e => {
    draggedId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => { card.classList.remove('dragging'); draggedId = null; });
  card.addEventListener('click', () => openDetail(task.id));

  return card;
}

// ─── DRAG & DROP ──────────────────────────────────────────────────────────────
document.querySelectorAll('.task-list').forEach(list => {
  list.addEventListener('dragover',  e => { e.preventDefault(); list.classList.add('drag-over'); });
  list.addEventListener('dragleave', e => { if (!list.contains(e.relatedTarget)) list.classList.remove('drag-over'); });
  list.addEventListener('drop', async e => {
    e.preventDefault();
    list.classList.remove('drag-over');
    const id = draggedId; draggedId = null;
    if (!id) return;
    const newStatus = list.id.replace('list-', '');
    if (newStatus === 'overdue') return;
    if (!currentBoard) {
      if (isDemoTask(id) && demoTasks[id] && demoTasks[id].status !== newStatus) {
        demoTasks[id] = { ...demoTasks[id], status: newStatus };
        renderBoard();
      }
      return;
    }
    const task = tasks[id];
    if (!task || task.status === newStatus) return;
    const oldStatus = task.status;
    tasks[id] = { ...task, status: newStatus };
    renderBoard();
    await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
    if (newStatus === 'done' && oldStatus !== 'done') {
      await pushNotif(`"${task.title}" marked as Done!`, id);
    }
  });
});

// ─── OVERDUE NOTIFICATIONS ───────────────────────────────────────────────────
async function checkAndNotifyOverdue() {
  if (!currentBoard) return;
  const now = Date.now();
  for (const [id, task] of Object.entries(tasks)) {
    if (task.status === 'done')  continue;
    if (task.overdueNotifiedAt)  continue;
    if (!isOverdue(task.due))    continue;
    await pushNotif(`Task "${task.title}" is now overdue!`, id);
    await supabase.from('tasks').update({ overdue_notified_at: new Date(now).toISOString() }).eq('id', id);
    tasks[id] = { ...tasks[id], overdueNotifiedAt: now };
  }
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
async function pushNotif(message, taskId) {
  if (!currentBoard) return;
  await supabase.from('notifications').insert({
    board_id: currentBoard.id, message, task_id: taskId || null, read: false,
  });
}

async function setupNotifListener() {
  if (notifChannel) supabase.removeChannel(notifChannel);
  if (!currentBoard) return;
  const boardId = currentBoard.id;

  const { data: rows } = await supabase.from('notifications').select('*').eq('board_id', boardId);
  allNotifications = {};
  (rows || []).forEach(r => { allNotifications[r.id] = notifRowToObj(r); });
  refreshNotifUI();

  notifChannel = supabase.channel(`notifications-${boardId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `board_id=eq.${boardId}` }, payload => {
      if (payload.eventType === 'DELETE') { delete allNotifications[payload.old.id]; }
      else { allNotifications[payload.new.id] = notifRowToObj(payload.new); }
      refreshNotifUI();
    })
    .subscribe();
}

function notifRowToObj(row) {
  return { message: row.message, taskId: row.task_id, read: row.read, createdAt: new Date(row.created_at).getTime() };
}

function refreshNotifUI() {
  const entries = Object.entries(allNotifications).map(([id, n]) => ({ id, ...n }));
  const unread  = entries.filter(n => !n.read);
  const badge   = document.getElementById('notifBadge');
  const count   = unread.length;
  badge.textContent = count > 9 ? '9+' : count;
  badge.classList.toggle('visible', count > 0);

  if (knownNotifIds !== null) {
    const newOnes = entries.filter(n => !n.read && !knownNotifIds.has(n.id));
    if (newOnes.length) tryPlaySound();
  }
  knownNotifIds = new Set(entries.map(n => n.id));

  renderNotifPanel(entries);
}

function renderNotifPanel(entries) {
  const list = document.getElementById('notifList');
  if (!entries.length) {
    list.innerHTML = '<div class="no-notifs">No notifications yet</div>';
    return;
  }
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30);
  list.innerHTML = sorted.map(n => {
    const time = new Date(n.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    return `<div class="notif-item${n.read ? '' : ' unread'}" data-id="${n.id}" data-task="${n.taskId || ''}">
      <div class="notif-msg">${escHtml(n.message)}</div>
      <div class="notif-time">${time}</div>
    </div>`;
  }).join('');

  list.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      const nid = item.dataset.id;
      const tid = item.dataset.task;
      if (nid && allNotifications[nid] && !allNotifications[nid].read) {
        await supabase.from('notifications').update({ read: true }).eq('id', nid);
      }
      if (tid) openDetail(tid);
      document.getElementById('notifPanel').classList.remove('open');
    });
  });
}

function tryPlaySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);
  } catch {}
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
  if (!currentBoard) return;
  const unreadIds = Object.entries(allNotifications).filter(([, n]) => !n.read).map(([id]) => id);
  if (unreadIds.length) await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
});

document.addEventListener('click', e => {
  if (!document.getElementById('notifWrapper')?.contains(e.target)) {
    document.getElementById('notifPanel').classList.remove('open');
  }
  if (!document.getElementById('boardSettingsWrapper')?.contains(e.target)) {
    document.getElementById('boardSettingsDropdown')?.classList.remove('open');
  }
});

// ─── BOARD SETTINGS GEAR ─────────────────────────────────────────────────────
document.getElementById('boardSettingsBtn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('boardSettingsDropdown').classList.toggle('open');
});

// ─── DARK MODE ────────────────────────────────────────────────────────────────
document.getElementById('themeBtn').addEventListener('click', () => {
  const isDark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
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
    pendingResourceFiles = fileResources.map(r => ({ url: r.url, path: storagePathFromUrl(r.url), name: r.name, size: 0 }));
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

// ─── TASK MODAL ───────────────────────────────────────────────────────────────
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
  if (isDemoTask(id)) { showToast('This is a demo task — sign up for your free board to add and edit tasks.'); showAuthOverlay('signup'); return; }
  const task = tasks[id]; if (!task) return;
  editingTaskId = id;
  document.getElementById('modalTitle').textContent = 'Edit Task';
  document.getElementById('taskTitle').value     = task.title;
  document.getElementById('taskDesc').value      = task.desc || '';
  document.getElementById('taskPriority').value  = task.priority;
  document.getElementById('taskScheduled').value = task.scheduledFor || '';
  document.getElementById('taskDue').value       = task.due || '';
  document.getElementById('taskStatus').value    = task.status;
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
  if (!currentBoard) return;
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) return;

  const linkItems = pendingResourceLinks.map(u => u.trim()).filter(u => u)
    .map(url => {
      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      return { type: 'link', url: normalized, name: url };
    });
  const fileItems = pendingResourceFiles.map(f => ({ type: 'file', url: f.url, name: f.name }));
  const resources = [...linkItems, ...fileItems];

  const desc         = document.getElementById('taskDesc').value.trim();
  const priority     = document.getElementById('taskPriority').value;
  const scheduledFor = document.getElementById('taskScheduled').value || null;
  const due          = document.getElementById('taskDue').value || null;
  const status       = document.getElementById('taskStatus').value;

  // `row` uses Postgres column names (sent to Supabase); `local` mirrors the
  // in-memory task shape the renderer expects — kept separate so neither
  // side has to know about the other's naming.
  const row   = { title, description: desc, priority, scheduled_for: scheduledFor, due_date: due, status, resources };
  const local = { title, desc, priority, scheduledFor, due, status, resources };

  if (editingTaskId) {
    const old = tasks[editingTaskId];
    tasks[editingTaskId] = { ...old, ...local };
    closeModal();
    renderBoard();
    await supabase.from('tasks').update(row).eq('id', editingTaskId);
    if (status === 'done' && old.status !== 'done') {
      await pushNotif(`"${title}" is now Done!`, editingTaskId);
    }
  } else {
    const newId = crypto.randomUUID();
    tasks[newId] = { ...local, createdAt: Date.now() };
    closeModal();
    renderBoard();
    await supabase.from('tasks').insert({ id: newId, board_id: currentBoard.id, ...row });
    if (status === 'done') await pushNotif(`"${title}" created as Done!`, newId);
  }
});

// ─── DELETE TASK ──────────────────────────────────────────────────────────────
function deleteTask(id) {
  if (isDemoTask(id)) { showToast('Sign up for your free board to manage your own tasks.'); return; }
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
  if (!id || !currentBoard) return;
  const task = tasks[id];
  delete tasks[id];
  renderBoard();
  await supabase.from('tasks').delete().eq('id', id);
  if (task) await deleteResourceFiles(task.resources);
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

// ─── DEMO TASK DETAIL ─────────────────────────────────────────────────────────
function openDemoDetail(id) {
  const task = demoTasks?.[id];
  if (!task) return false;

  detailTaskId = id;
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

  const STATUS_LABELS = { todo: 'To Do', inprogress: 'In Progress', pending: 'Pending', done: 'Done' };
  const cb = task.createdBy;
  const createdByChip = cb ? `<div class="detail-chip">
    <span class="detail-chip-label">Created by</span>
    <span class="demo-created-by-chip">
      <img class="demo-avatar-img" src="${escHtml(cb.photoURL)}" alt="${escHtml(cb.name)}"
           onerror="this.style.display='none';this.nextElementSibling.style.display=''">
      <span class="demo-avatar-fallback" style="display:none">${escHtml(cb.name.slice(0,2).toUpperCase())}</span>
      <span>${escHtml(cb.name)}</span>
    </span>
  </div>` : '';

  document.getElementById('detailTitle').textContent = task.title;
  document.getElementById('detailBody').innerHTML = `
    <div class="detail-chips">
      <div class="detail-chip">
        <span class="detail-chip-label">Status</span>
        <span class="status-badge status-${task.status}">${STATUS_LABELS[task.status] || task.status}</span>
      </div>
      <div class="detail-chip">
        <span class="detail-chip-label">Priority</span>
        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
      </div>
      ${createdByChip}
      ${task.createdAt ? `<div class="detail-chip">
        <span class="detail-chip-label">Created</span>
        <span class="detail-created">${fmtTimestamp(task.createdAt)}</span>
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

  const overlay = document.getElementById('detailOverlay');
  overlay.classList.add('is-demo');

  const commentsList = document.getElementById('commentsList');
  if (commentsList) commentsList.innerHTML = `<div class="demo-comments-cta">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    <p>Notes &amp; comments are saved on your personal board.</p>
    <button class="btn-primary btn-sm" id="demoDetailCreateBtn">Sign Up Free</button>
  </div>`;
  document.getElementById('demoDetailCreateBtn')?.addEventListener('click', () => {
    closeDetail(); showAuthOverlay('signup');
  });

  overlay.classList.add('open');
  return true;
}

// ─── TASK DETAIL ──────────────────────────────────────────────────────────────
async function openDetail(id) {
  if (!id || id === 'undefined' || id === 'null') {
    showToast('Notification is not linked to a task.');
    return false;
  }
  if (isDemoTask(id)) return openDemoDetail(id);
  await tasksLoaded;
  let task = tasks[id];
  if (!task && currentBoard) {
    try {
      const { data: row } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle();
      if (row) { task = rowToTask(row); tasks[id] = task; }
    } catch {}
  }
  if (!task) { showToast('Task not found — it may have been deleted.'); return false; }

  detailTaskId = id;
  const overdue       = isOverdue(task.due);
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
        <select class="detail-status-sel" id="detailStatusSel" data-status="${task.status}">
          <option value="todo"       ${task.status==='todo'       ?'selected':''}>To Do</option>
          <option value="inprogress" ${task.status==='inprogress' ?'selected':''}>In Progress</option>
          <option value="pending"    ${task.status==='pending'    ?'selected':''}>Pending</option>
          <option value="done"       ${task.status==='done'       ?'selected':''}>Done</option>
        </select>
        <button class="btn-sm btn-primary save-status-btn" id="saveStatusBtn" style="display:none">Save</button>
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
    </div>
    ${task.desc ? `<p class="detail-desc">${escHtml(task.desc)}</p>` : ''}
    ${resourceHtml}`;

  document.getElementById('detailBody').querySelectorAll('.resource-preview-btn').forEach(btn => {
    const idx = parseInt(btn.dataset.resIdx, 10);
    if (!isNaN(idx) && taskResources[idx]) {
      btn.addEventListener('click', () => openFilePreview(taskResources[idx]));
    }
  });

  const sel     = document.getElementById('detailStatusSel');
  const saveBtn = document.getElementById('saveStatusBtn');
  const origSt  = task.status;
  sel.addEventListener('change', () => {
    sel.dataset.status = sel.value;
    saveBtn.style.display = sel.value !== origSt ? '' : 'none';
  });
  saveBtn.addEventListener('click', async () => {
    const newStatus = sel.value;
    const oldStatus = tasks[id]?.status;
    saveBtn.disabled = true;
    await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
    tasks[id] = { ...tasks[id], status: newStatus };
    saveBtn.style.display = 'none';
    saveBtn.disabled = false;
    renderBoard();
    if (newStatus === 'done' && oldStatus !== 'done') {
      await pushNotif(`"${task.title}" marked as Done!`, id);
    }
  });

  document.getElementById('detailEditBtn').onclick = () => { closeDetail(); openEdit(id); };

  // Real-time comments / notes for this task
  if (taskCommentsChannel) supabase.removeChannel(taskCommentsChannel);
  const { data: commentRows } = await supabase.from('comments').select('*').eq('task_id', id).order('created_at', { ascending: true });
  renderCommentsList(commentRows || []);

  taskCommentsChannel = supabase.channel(`task-comments-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `task_id=eq.${id}` }, async () => {
      if (detailTaskId !== id) return;
      const { data: rows } = await supabase.from('comments').select('*').eq('task_id', id).order('created_at', { ascending: true });
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
    list.innerHTML = '<div class="no-comments">No notes yet. Add one below!</div>';
    return;
  }
  list.innerHTML = rows.map(c => {
    const time   = new Date(c.created_at).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const author = c.author_email || currentUser?.email || 'You';
    return `<div class="comment">
      <span class="avatar" style="font-size:.7rem">${escHtml(author.slice(0,2).toUpperCase())}</span>
      <div class="comment-body">
        <div class="comment-meta"><strong>${escHtml(author)}</strong><span class="comment-time">${time}</span></div>
        <p>${escHtml(c.text)}</p>
      </div>
    </div>`;
  }).join('');
  list.scrollTop = list.scrollHeight;
}

function closeDetail() {
  const overlay = document.getElementById('detailOverlay');
  overlay.classList.remove('open');
  overlay.classList.remove('is-demo');
  detailTaskId = null;
  if (taskCommentsChannel) { supabase.removeChannel(taskCommentsChannel); taskCommentsChannel = null; }
  const commentsList = document.getElementById('commentsList');
  if (commentsList && commentsList.querySelector('.demo-comments-cta')) {
    commentsList.innerHTML = '<div class="no-comments">No notes yet. Add one below!</div>';
  }
}

// ─── NOTES (COMMENTS) ─────────────────────────────────────────────────────────
async function postComment() {
  if (!currentBoard || !detailTaskId) return;
  const input = document.getElementById('commentInput');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';
  await supabase.from('comments').insert({
    task_id: detailTaskId, board_id: currentBoard.id, author_email: currentUser.email, text,
  });
}

document.getElementById('postCommentBtn').addEventListener('click', postComment);
document.getElementById('commentInput').addEventListener('keydown', e => { if (e.key === 'Enter') postComment(); });

// ─── DATE FILTER EVENTS ───────────────────────────────────────────────────────
document.getElementById('dateFilter').addEventListener('change', e => {
  currentFilter = e.target.value;
  if (currentFilter === 'custom') {
    document.getElementById('customDateRow').style.display = 'flex';
  } else {
    document.getElementById('customDateRow').style.display = 'none';
    renderBoard();
  }
});

document.getElementById('customDateApply').addEventListener('click', () => {
  customDateStart = document.getElementById('customFrom').value || null;
  customDateEnd   = document.getElementById('customTo').value   || null;
  document.getElementById('customDateRow').style.display = 'none';
  renderBoard();
});

document.getElementById('customFrom').addEventListener('change', e => {
  const v = e.target.value;
  document.getElementById('customFromText').textContent = v
    ? new Date(v + 'T00:00:00').toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' })
    : 'dd-mm-yyyy';
});
document.getElementById('customTo').addEventListener('change', e => {
  const v = e.target.value;
  document.getElementById('customToText').textContent = v
    ? new Date(v + 'T00:00:00').toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' })
    : 'dd-mm-yyyy';
});

document.getElementById('filterBarClear').addEventListener('click', () => {
  currentFilter = 'all';
  customDateStart = null;
  customDateEnd   = null;
  document.getElementById('dateFilter').value = 'all';
  document.getElementById('customDateRow').style.display = 'none';
  renderBoard();
});

// ─── PER-COLUMN PRIORITY FILTERS ─────────────────────────────────────────────
['todo','inprogress','pending','done','overdue'].forEach(col => {
  const sel = document.getElementById('pf-' + col);
  if (!sel) return;
  sel.addEventListener('change', () => {
    colPriorityFilter[col] = sel.value;
    renderBoard();
  });
});

// ─── MODAL CLOSE EVENTS ───────────────────────────────────────────────────────
document.getElementById('addTaskBtn').addEventListener('click', () => {
  if (!currentBoard) { showAuthOverlay('signup'); return; }
  openNew();
});

document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('closeDetail').addEventListener('click', closeDetail);
document.getElementById('deleteConfirmClose').addEventListener('click', closeDeleteConfirm);
document.getElementById('deleteConfirmCancel').addEventListener('click', closeDeleteConfirm);
document.getElementById('deleteConfirmOk').addEventListener('click', confirmDeleteTask);
document.getElementById('filePreviewClose').addEventListener('click', closeFilePreview);

['modalOverlay','deleteConfirmOverlay','detailOverlay','filePreviewOverlay'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('click', e => {
    if (e.target === el) {
      if (id === 'modalOverlay')         closeModal();
      if (id === 'deleteConfirmOverlay') closeDeleteConfirm();
      if (id === 'detailOverlay')        closeDetail();
      if (id === 'filePreviewOverlay')   closeFilePreview();
    }
  });
});

// ─── LOG OUT ──────────────────────────────────────────────────────────────────
function resetToSignedOutState() {
  if (tasksChannel)        { supabase.removeChannel(tasksChannel);        tasksChannel = null; }
  if (commentsChannel)     { supabase.removeChannel(commentsChannel);     commentsChannel = null; }
  if (notifChannel)        { supabase.removeChannel(notifChannel);        notifChannel = null; }
  if (taskCommentsChannel) { supabase.removeChannel(taskCommentsChannel); taskCommentsChannel = null; }
  currentUser  = null;
  currentBoard = null;
  tasks = {};
  allNotifications = {};
  knownNotifIds = null;
  document.getElementById('spaceDisplay').classList.remove('visible');
  document.getElementById('boardSettingsWrapper').style.display = 'none';
  document.getElementById('notifBadge').classList.remove('visible');
  document.getElementById('notifList').innerHTML = '';
  demoTasks = Object.fromEntries(Object.entries(DEMO_TASKS_TEMPLATE).map(([k, t]) => [k, { ...t }]));
  renderBoard();
}

document.getElementById('changeSpaceBtn').addEventListener('click', async () => {
  showToast('All tasks saved. Logging out…', 1500);
  await supabase.auth.signOut();
});

// ─── DELETE BOARD (wipes all tasks and starts fresh) ─────────────────────────
document.getElementById('deleteSpaceBtn').addEventListener('click', () => {
  if (!currentBoard) return;
  document.getElementById('deleteSpaceName').textContent = currentUser.email;
  document.getElementById('deleteSpaceOverlay').classList.add('open');
});

function closeDeleteSpaceOverlay() {
  document.getElementById('deleteSpaceOverlay').classList.remove('open');
}

document.getElementById('deleteSpaceClose').addEventListener('click', closeDeleteSpaceOverlay);
document.getElementById('deleteSpaceCancel').addEventListener('click', closeDeleteSpaceOverlay);
document.getElementById('deleteSpaceOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeDeleteSpaceOverlay();
});

document.getElementById('deleteSpaceOk').addEventListener('click', async () => {
  if (!currentBoard) return;
  const oldBoardId = currentBoard.id;
  closeDeleteSpaceOverlay();

  if (tasksChannel)    { supabase.removeChannel(tasksChannel);    tasksChannel = null; }
  if (commentsChannel) { supabase.removeChannel(commentsChannel); commentsChannel = null; }
  if (notifChannel)    { supabase.removeChannel(notifChannel);    notifChannel = null; }

  const allResources = Object.values(tasks).flatMap(t => t.resources || []);
  await supabase.from('boards').delete().eq('id', oldBoardId); // cascades tasks/comments/notifications
  await deleteResourceFiles(allResources);

  tasks = {};
  allNotifications = {};
  knownNotifIds = null;
  document.getElementById('notifBadge').classList.remove('visible');
  document.getElementById('notifList').innerHTML = '';

  await enterBoard(); // recreates a fresh empty board for this account
  showToast('Board deleted. Starting fresh!');
});

// ─── AUTH STATE / INIT ────────────────────────────────────────────────────────
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN') {
    if (currentUser?.id === session.user.id) return; // already entered
    currentUser = session.user;
    hideAuthOverlay();
    try { await enterBoard(); } catch (e) { showToast('Could not load your board. Please refresh.'); console.error(e); }
  } else if (event === 'SIGNED_OUT') {
    resetToSignedOutState();
  }
});

async function init() {
  demoTasks = Object.fromEntries(Object.entries(DEMO_TASKS_TEMPLATE).map(([k, t]) => [k, { ...t }]));
  renderBoard();

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    try { await enterBoard(); }
    catch (e) { showToast('Could not load your board. Please refresh.'); console.error(e); }
  } else {
    // New or signed-out visitor — stay in demo mode, show the auth overlay.
    showAuthOverlay();
  }
}

document.getElementById('demoBannerCreateBtn')?.addEventListener('click', () => showAuthOverlay('signup'));

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

init();
