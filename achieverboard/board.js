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

const firebaseApp = initializeApp(firebaseConfig);
const db          = getDatabase(firebaseApp);

// ─── SVG ICONS ─────────────────────────────────────────────────────────────────
const ICONS = {
  edit:    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  comment: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  calendar:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  clock:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  clip:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
  eye:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentSpace       = null;   // { key, name }
let tasks              = {};
let commentCounts      = {};
let allNotifications   = {};
let knownNotifIds      = null;
let editingTaskId      = null;
let detailTaskId       = null;
let draggedId          = null;
let commentsUnsub      = null;
let tasksUnsub         = null;
let commentsGlobalUnsub = null;
let notifUnsub         = null;
let currentFilter      = 'all';
let customDateStart    = null;
let customDateEnd      = null;
let colPriorityFilter  = { todo: 'all', inprogress: 'all', pending: 'all', done: 'all', overdue: 'all' };
let pendingDeleteId    = null;
let pendingResourceFiles = [];
let pendingResourceLinks = [''];
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
  if (task.resourceUrl) return [{ type: task.resourceType || 'link', url: task.resourceUrl, name: task.resourceName || task.resourceUrl }];
  return [];
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), duration);
}

const byNewest = (a, b) => b.createdAt - a.createdAt;

// ─── SPACE KEY UTILS ──────────────────────────────────────────────────────────
/** Turn a human-readable name into a safe Firebase key */
function toSpaceKey(name) {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || null;
}

// ─── SPACE OVERLAY ────────────────────────────────────────────────────────────
function showSpaceOverlay() {
  document.getElementById('spaceOverlay').classList.add('open');
  document.getElementById('createSpaceInput').value = '';
  document.getElementById('openSpaceInput').value   = '';
  document.getElementById('createErr').textContent  = '';
  document.getElementById('openErr').textContent    = '';
  document.getElementById('createSpaceInput').focus();
}

function hideSpaceOverlay() {
  document.getElementById('spaceOverlay').classList.remove('open');
}

async function handleCreateSpace() {
  const raw = document.getElementById('createSpaceInput').value.trim();
  const errEl = document.getElementById('createErr');
  errEl.textContent = '';

  if (!raw) { errEl.textContent = 'Please enter a name for your AchieverBoard.'; return; }
  const key = toSpaceKey(raw);
  if (!key) { errEl.textContent = 'Please use letters, numbers, or spaces.'; return; }

  const btn = document.getElementById('createSpaceBtn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    const snap = await get(ref(db, `spaces/${key}/meta`));
    if (snap.exists()) {
      errEl.textContent = 'That name is already taken. Please choose a different one.';
      btn.disabled = false;
      btn.textContent = 'Create Taskboard';
      return;
    }
    await set(ref(db, `spaces/${key}/meta`), { displayName: raw, createdAt: Date.now() });
    localStorage.setItem('tb-space', key);
    currentSpace = { key, name: raw };
    hideSpaceOverlay();
    enterBoard();
  } catch (e) {
    errEl.textContent = 'Something went wrong. Please try again.';
    btn.disabled = false;
    btn.textContent = 'Create Taskboard';
  }
}

async function handleOpenSpace() {
  const raw = document.getElementById('openSpaceInput').value.trim();
  const errEl = document.getElementById('openErr');
  errEl.textContent = '';

  if (!raw) { errEl.textContent = 'Please enter your AchieverBoard name.'; return; }
  const key = toSpaceKey(raw);
  if (!key) { errEl.textContent = 'Please use letters, numbers, or spaces.'; return; }

  const btn = document.getElementById('openSpaceBtn');
  btn.disabled = true;
  btn.textContent = 'Opening…';

  try {
    const snap = await get(ref(db, `spaces/${key}/meta`));
    if (!snap.exists()) {
      errEl.textContent = 'No AchieverBoard found with that name. Check the spelling.';
      btn.disabled = false;
      btn.textContent = 'Open Taskboard';
      return;
    }
    const displayName = snap.val().displayName || raw;
    localStorage.setItem('tb-space', key);
    currentSpace = { key, name: displayName };
    hideSpaceOverlay();
    enterBoard();
  } catch (e) {
    errEl.textContent = 'Something went wrong. Please try again.';
    btn.disabled = false;
    btn.textContent = 'Open Taskboard';
  }
}

// ─── ENTER BOARD ──────────────────────────────────────────────────────────────
function enterBoard() {
  const nameEl = document.getElementById('spaceNameDisplay');
  nameEl.textContent = currentSpace.name;
  document.getElementById('spaceDisplay').classList.add('visible');
  document.getElementById('boardSettingsWrapper').style.display = '';
  subscribeToSpace();
}

function subscribeToSpace() {
  // Unsubscribe from any previous space
  if (tasksUnsub)          tasksUnsub();
  if (commentsGlobalUnsub) commentsGlobalUnsub();
  if (notifUnsub)          notifUnsub();

  const spaceRef = `spaces/${currentSpace.key}`;

  // Tasks
  tasksUnsub = onValue(ref(db, `${spaceRef}/tasks`), snap => {
    tasks = snap.val() || {};
    _resolveTasksLoaded();
    renderBoard();
    checkAndNotifyOverdue();
  });

  // Comment counts
  commentsGlobalUnsub = onValue(ref(db, `${spaceRef}/comments`), snap => {
    const data = snap.val() || {};
    commentCounts = {};
    for (const [taskId, cmts] of Object.entries(data)) {
      commentCounts[taskId] = Object.keys(cmts).length;
    }
    renderBoard();
  });

  // Notifications
  setupNotifListener();
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

  // Date-based filters use scheduledFor date, or fall back to createdAt
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
  const dateSel = document.getElementById('dateFilter');
  if (dateSel) { dateSel.value = currentFilter; dateSel.classList.toggle('active', currentFilter !== 'all'); }

  const bar   = document.getElementById('filterBar');
  const label = document.getElementById('filterBarLabel');
  let part = '';
  if (currentFilter === 'custom') {
    const fmt = s => s ? new Date(s + 'T00:00:00').toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' }) : '…';
    part = `${fmt(customDateStart)} – ${fmt(customDateEnd)}`;
  } else if (currentFilter !== 'all') {
    part = FILTER_LABELS[currentFilter] || currentFilter;
  }
  bar.classList.toggle('visible', !!part);
  label.textContent = part ? `Showing: ${part}` : '';

  ['todo','inprogress','pending','done','overdue'].forEach(col => {
    const sel = document.getElementById('pf-' + col);
    if (sel) sel.classList.toggle('active', colPriorityFilter[col] !== 'all');
  });

  // Normal status columns: todo, inprogress, pending
  ['todo', 'inprogress', 'pending'].forEach(status => {
    const list  = document.getElementById('list-'  + status);
    const count = document.getElementById('count-' + status);
    const items = Object.entries(tasks)
      .filter(([, t]) => t.status === status && !isOverdue(t.due))
      .map(([id, t]) => ({ id, ...t }))
      .filter(t => taskMatchesFilter(t))
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

  // Done column
  const doneList  = document.getElementById('list-done');
  const doneCount = document.getElementById('count-done');
  const doneItems = Object.entries(tasks)
    .filter(([, t]) => t.status === 'done')
    .map(([id, t]) => ({ id, ...t }))
    .filter(t => taskMatchesFilter(t))
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

  // Overdue column — tasks past due and not done
  const overdueList  = document.getElementById('list-overdue');
  const overdueCount = document.getElementById('count-overdue');
  const overdueItems = Object.entries(tasks)
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
  const hasRes  = !!(task.resourceUrl || (task.resources && task.resources.length));

  const card = document.createElement('div');
  card.className  = 'task-card';
  card.dataset.id = task.id;
  card.draggable  = true;
  card.style.cursor = 'grab';

  card.innerHTML = `
    <div class="task-card-header">
      <span class="task-title">${escHtml(task.title)}</span>
      <div class="card-actions">
        <button class="btn-icon edit"   title="Edit"   data-id="${task.id}">${ICONS.edit}</button>
        <button class="btn-icon delete" title="Delete" data-id="${task.id}">${ICONS.trash}</button>
      </div>
    </div>
    ${task.desc ? `<div class="task-desc">${escHtml(task.desc)}</div>` : ''}
    <div class="task-card-footer">
      <span class="priority-badge priority-${task.priority}">${task.priority}</span>
      <div class="card-meta">
        ${task.due ? `<span class="due-date ${overdue?'overdue':''}">${ICONS.calendar} ${formatDate(task.due)}</span>` : ''}
        ${task.createdAt ? `<span class="created-date">${ICONS.clock} ${fmtTimestamp(task.createdAt)}</span>` : ''}
        <span class="comment-count" title="${cCount} note${cCount === 1 ? '' : 's'}">${ICONS.comment} ${cCount}</span>
        ${hasRes ? `<span class="resource-indicator" title="Has attachment">${ICONS.clip}</span>` : ''}
      </div>
    </div>`;

  card.querySelector('.btn-icon.edit').addEventListener('click',   e => { e.stopPropagation(); openEdit(task.id); });
  card.querySelector('.btn-icon.delete').addEventListener('click', e => { e.stopPropagation(); deleteTask(task.id); });

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
    if (!id || !currentSpace) return;
    const newStatus = list.id.replace('list-', '');
    if (newStatus === 'overdue') return;
    const task = tasks[id];
    if (!task || task.status === newStatus) return;
    tasks[id] = { ...task, status: newStatus };
    renderBoard();
    await update(ref(db, `spaces/${currentSpace.key}/tasks/${id}`), { status: newStatus });
    if (newStatus === 'done' && task.status !== 'done') {
      await pushNotif(`"${task.title}" marked as Done!`, id);
    }
  });
});

// ─── OVERDUE NOTIFICATIONS ───────────────────────────────────────────────────
async function checkAndNotifyOverdue() {
  if (!currentSpace) return;
  const now = Date.now();
  for (const [id, task] of Object.entries(tasks)) {
    if (task.status === 'done')  continue;
    if (task.overdueNotifiedAt)  continue;
    if (!isOverdue(task.due))    continue;
    await pushNotif(`Task "${task.title}" is now overdue!`, id);
    await update(ref(db, `spaces/${currentSpace.key}/tasks/${id}`), { overdueNotifiedAt: now });
    tasks[id] = { ...tasks[id], overdueNotifiedAt: now };
  }
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
async function pushNotif(message, taskId) {
  if (!currentSpace) return;
  await push(ref(db, `spaces/${currentSpace.key}/notifications`), {
    message, taskId: taskId || null, read: false, createdAt: Date.now(),
  });
}

function setupNotifListener() {
  if (notifUnsub) notifUnsub();
  if (!currentSpace) return;

  notifUnsub = onValue(ref(db, `spaces/${currentSpace.key}/notifications`), snap => {
    allNotifications = snap.val() || {};
    const entries   = Object.entries(allNotifications).map(([id, n]) => ({ id, ...n }));
    const unread    = entries.filter(n => !n.read);
    const badge     = document.getElementById('notifBadge');
    const count     = unread.length;
    badge.textContent = count > 9 ? '9+' : count;
    badge.classList.toggle('visible', count > 0);

    // Sound on new unread notifications (skip first load)
    if (knownNotifIds !== null) {
      const newOnes = entries.filter(n => !n.read && !knownNotifIds.has(n.id));
      if (newOnes.length) tryPlaySound();
    }
    knownNotifIds = new Set(entries.map(n => n.id));

    renderNotifPanel(entries);
  });
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
        await update(ref(db, `spaces/${currentSpace.key}/notifications/${nid}`), { read: true });
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

// Notification panel toggle
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
  if (!currentSpace) return;
  const updates = {};
  for (const [id, n] of Object.entries(allNotifications)) {
    if (!n.read) updates[`spaces/${currentSpace.key}/notifications/${id}/read`] = true;
  }
  if (Object.keys(updates).length) await update(ref(db), updates);
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
    btn.addEventListener('click', () => {
      pendingResourceFiles.splice(+btn.dataset.idx, 1);
      renderFileList();
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
  if (fileResources.length) { pendingResourceFiles = fileResources.map(r => ({ dataUrl: r.url, name: r.name, size: 0 })); renderFileList(); }
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
  if (totalSize > MAX_TOTAL) { showToast(`Combined size (${formatSize(totalSize)}) exceeds 10 MB limit.`); return; }
  pendingResourceFiles = combined;
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
  if (!currentSpace) return;
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

  const newStatus = document.getElementById('taskStatus').value;
  const fields = {
    title,
    desc:         document.getElementById('taskDesc').value.trim(),
    priority:     document.getElementById('taskPriority').value,
    scheduledFor: document.getElementById('taskScheduled').value || null,
    due:          document.getElementById('taskDue').value || null,
    status:       newStatus,
    resources:    resources,
    resourceType: null,
    resourceUrl:  null,
    resourceName: null,
  };

  const spaceTasksRef = `spaces/${currentSpace.key}/tasks`;

  if (editingTaskId) {
    const old = tasks[editingTaskId];
    tasks[editingTaskId] = { ...old, ...fields };
    closeModal();
    renderBoard();
    await update(ref(db, `${spaceTasksRef}/${editingTaskId}`), fields);
    if (newStatus === 'done' && old.status !== 'done') {
      await pushNotif(`"${title}" is now Done!`, editingTaskId);
    }
  } else {
    const newRef   = push(ref(db, spaceTasksRef));
    const taskData = { ...fields, createdAt: Date.now() };
    tasks[newRef.key] = taskData;
    closeModal();
    renderBoard();
    await set(newRef, taskData);
    if (newStatus === 'done') await pushNotif(`"${title}" created as Done!`, newRef.key);
  }
});

// ─── DELETE TASK ──────────────────────────────────────────────────────────────
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
  if (!id || !currentSpace) return;
  await remove(ref(db, `spaces/${currentSpace.key}/tasks/${id}`));
  await remove(ref(db, `spaces/${currentSpace.key}/comments/${id}`));
  delete tasks[id];
  renderBoard();
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
      bodyEl.innerHTML = `<div class="fp-unsupported"><p>Cannot preview this file.<br>Use the Download button above.</p></div>`;
    }
  } else {
    bodyEl.innerHTML = `<div class="fp-unsupported"><p>Preview not available.<br>Use the Download button above.</p></div>`;
  }

  overlay.classList.add('open');
}

function closeFilePreview() {
  document.getElementById('filePreviewOverlay').classList.remove('open');
  document.getElementById('filePreviewBody').innerHTML = '';
}

// ─── TASK DETAIL ──────────────────────────────────────────────────────────────
async function openDetail(id) {
  if (!id || id === 'undefined' || id === 'null') {
    showToast('Notification is not linked to a task.');
    return false;
  }
  await tasksLoaded;
  let task = tasks[id];
  if (!task && currentSpace) {
    try {
      const snap = await get(ref(db, `spaces/${currentSpace.key}/tasks/${id}`));
      if (snap.exists()) { task = snap.val(); tasks[id] = task; }
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
    resourceHtml = `<div class="detail-row">
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
        <select class="detail-status-sel" id="detailStatusSel">
          <option value="todo"       ${task.status==='todo'       ?'selected':''}>To Do</option>
          <option value="inprogress" ${task.status==='inprogress' ?'selected':''}>In Progress</option>
          <option value="pending"    ${task.status==='pending'    ?'selected':''}>Pending</option>
          <option value="done"       ${task.status==='done'       ?'selected':''}>Done</option>
        </select>
        <button class="btn-sm btn-primary save-status-btn" id="saveStatusBtn" style="display:none">Save</button>
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
      ${resourceHtml}
    </div>
    ${task.desc ? `<p class="detail-desc">${escHtml(task.desc)}</p>` : ''}`;

  // File preview buttons
  document.getElementById('detailBody').querySelectorAll('.resource-preview-btn').forEach(btn => {
    const idx = parseInt(btn.dataset.resIdx, 10);
    if (!isNaN(idx) && taskResources[idx]) {
      btn.addEventListener('click', () => openFilePreview(taskResources[idx]));
    }
  });

  // Status save
  const sel     = document.getElementById('detailStatusSel');
  const saveBtn = document.getElementById('saveStatusBtn');
  const origSt  = task.status;
  sel.addEventListener('change', () => {
    saveBtn.style.display = sel.value !== origSt ? '' : 'none';
  });
  saveBtn.addEventListener('click', async () => {
    const newStatus = sel.value;
    const oldStatus = tasks[id]?.status;
    saveBtn.disabled = true;
    await update(ref(db, `spaces/${currentSpace.key}/tasks/${id}`), { status: newStatus });
    tasks[id] = { ...tasks[id], status: newStatus };
    saveBtn.style.display = 'none';
    saveBtn.disabled = false;
    renderBoard();
    if (newStatus === 'done' && oldStatus !== 'done') {
      await pushNotif(`"${task.title}" marked as Done!`, id);
    }
  });

  document.getElementById('detailEditBtn').onclick = () => { closeDetail(); openEdit(id); };

  // Real-time comments / notes
  if (commentsUnsub) commentsUnsub();
  commentsUnsub = onValue(ref(db, `spaces/${currentSpace.key}/comments/${id}`), snap => {
    if (detailTaskId !== id) return;
    const data     = snap.val() || {};
    const comments = Object.entries(data).map(([cid, c]) => ({ id: cid, ...c })).sort((a,b) => a.createdAt - b.createdAt);
    const list     = document.getElementById('commentsList');
    if (!comments.length) {
      list.innerHTML = '<div class="no-comments">No notes yet. Add one below!</div>';
      return;
    }
    list.innerHTML = comments.map(c => {
      const time = new Date(c.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      return `<div class="comment">
        <span class="avatar" style="font-size:.7rem">${escHtml(currentSpace?.name?.slice(0,2).toUpperCase() || '?')}</span>
        <div class="comment-body">
          <div class="comment-meta"><strong>${escHtml(currentSpace?.name || 'You')}</strong><span class="comment-time">${time}</span></div>
          <p>${escHtml(c.text)}</p>
        </div>
      </div>`;
    }).join('');
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

// ─── NOTES (COMMENTS) ─────────────────────────────────────────────────────────
async function postComment() {
  if (!currentSpace || !detailTaskId) return;
  const input = document.getElementById('commentInput');
  const text  = input.value.trim();
  if (!text) return;
  await push(ref(db, `spaces/${currentSpace.key}/comments/${detailTaskId}`), {
    text,
    author: currentSpace.key,
    createdAt: Date.now(),
  });
  input.value = '';
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
  if (!currentSpace) { showSpaceOverlay(); return; }
  openNew();
});

document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('closeDetail').addEventListener('click', closeDetail);
document.getElementById('deleteConfirmClose').addEventListener('click', closeDeleteConfirm);
document.getElementById('deleteConfirmCancel').addEventListener('click', closeDeleteConfirm);
document.getElementById('deleteConfirmOk').addEventListener('click', confirmDeleteTask);
document.getElementById('filePreviewClose').addEventListener('click', closeFilePreview);

// Close modals on backdrop click
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

// ─── SPACE EVENTS ─────────────────────────────────────────────────────────────
document.getElementById('createSpaceBtn').addEventListener('click', handleCreateSpace);
document.getElementById('openSpaceBtn').addEventListener('click', handleOpenSpace);

document.getElementById('createSpaceInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleCreateSpace();
});
document.getElementById('openSpaceInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleOpenSpace();
});

document.getElementById('changeSpaceBtn').addEventListener('click', () => {
  showToast('All tasks saved. See you next time!', 2000);
  setTimeout(() => {
    // Unsubscribe current space listeners
    if (tasksUnsub)          tasksUnsub();
    if (commentsGlobalUnsub) commentsGlobalUnsub();
    if (notifUnsub)          notifUnsub();
    localStorage.removeItem('tb-space');
    currentSpace = null;
    tasks = {};
    allNotifications = {};
    knownNotifIds = null;
    document.getElementById('spaceDisplay').classList.remove('visible');
    document.getElementById('boardSettingsWrapper').style.display = 'none';
    document.getElementById('notifBadge').classList.remove('visible');
    document.getElementById('notifList').innerHTML = '';
    renderBoard();
  }, 1800);
});

// ─── SPACE OVERLAY CLOSE ─────────────────────────────────────────────────────
document.getElementById('spaceOverlayClose').addEventListener('click', hideSpaceOverlay);

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  const savedKey = localStorage.getItem('tb-space');
  if (savedKey) {
    try {
      const snap = await get(ref(db, `spaces/${savedKey}/meta`));
      if (snap.exists()) {
        currentSpace = { key: savedKey, name: snap.val().displayName || savedKey };
        enterBoard();
        return;
      }
    } catch {}
    // Space no longer exists, clear storage and leave board empty
    localStorage.removeItem('tb-space');
  }
  // Don't auto-show overlay — user will trigger it via New Task
}

init();
