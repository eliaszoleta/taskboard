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

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser        = null;   // { id, name }
let users              = {};     // { userId: { name, passwordHash?, photoURL?, createdAt } }
let tasks              = {};     // { taskId: { ...fields } }
let editingTaskId      = null;
let detailTaskId       = null;
let draggedId          = null;
let commentsUnsub      = null;
let notifBadgeUnsub    = null;   // unsubscribe for the per-user notification listener
let currentFilter      = 'all';
let currentUserFilter  = 'all';
let customDateStart    = null;
let customDateEnd      = null;
let commentCounts      = {};     // taskId → number of comments
let allNotifications   = {};
let sidebarLimit       = 10;
let pendingLoginUid    = null;   // uid awaiting password entry
let pendingProfilePhoto = null;  // base64 data URL pending save in profile modal

// ─── HELPERS ─────────────────────────────────────────────────────────────────
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
  const ts = Number(task.createdAt) || Date.now();
  const d  = new Date(ts); d.setHours(0,0,0,0);
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
  'last-week':'Last week','this-month':'This month','overdue':'⚠️ Overdue','custom':'Custom range',
};

const COLORS = ['#4f46e5','#7c3aed','#db2777','#dc2626','#d97706','#059669','#0284c7','#0e7490'];
const avatarColor = name => {
  let h = 0;
  for (const c of (name||'')) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return COLORS[h % COLORS.length];
};
const initials = name =>
  (name||'?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

// Renders an avatar — shows profile photo if the user has one, otherwise initials
const avatarHtml = (name, lg = false) => {
  const cls  = `avatar${lg ? ' avatar-lg' : ''}`;
  const user = Object.values(users).find(u => u.name === name);
  if (user?.photoURL) {
    return `<img class="${cls} avatar-photo" src="${user.photoURL}" alt="${escHtml(initials(name))}">`;
  }
  return `<span class="${cls}" style="background:${avatarColor(name)}">${initials(name)}</span>`;
};

// SHA-256 via Web Crypto API
async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// Resize an image file to ≤ maxPx square, returns a JPEG data URL
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

// ─── USER SELECTION ───────────────────────────────────────────────────────────
function loadCurrentUser() {
  try { currentUser = JSON.parse(localStorage.getItem('taskboard-user')); } catch { currentUser = null; }
}

function saveCurrentUser(user) {
  currentUser = user;
  localStorage.setItem('taskboard-user', JSON.stringify(user));
}

function showUserOverlay() {
  document.getElementById('userOverlay').classList.add('open');
  document.getElementById('userOverlayClose').style.display = currentUser ? '' : 'none';
  showStep1();
  renderUserList();
}

function hideUserOverlay() {
  document.getElementById('userOverlay').classList.remove('open');
  sidebarLimit = 10;
  updateHeaderUser();
  currentUserFilter = currentUser.id;
  renderBoard();
  setupNotifListener();   // tears down old listener, registers new one
  renderNotifSidebar();   // immediately refresh sidebar for new user
}

// ── Step navigation ──
function showStep1() {
  document.getElementById('userStep1').style.display = '';
  document.getElementById('userStep2').style.display = 'none';
  pendingLoginUid = null;
  document.getElementById('newUserName').value     = '';
  document.getElementById('newUserPassword').value = '';
  document.getElementById('loginError').textContent = '';
}

function showStep2(uid) {
  const u = users[uid];
  if (!u) return;
  pendingLoginUid = uid;
  document.getElementById('userStep1').style.display = 'none';
  document.getElementById('userStep2').style.display = '';
  document.getElementById('pwdPromptName').textContent    = u.name;
  document.getElementById('pwdPromptAvatar').innerHTML    = avatarHtml(u.name);
  document.getElementById('loginPassword').value          = '';
  document.getElementById('loginError').textContent       = '';
  document.getElementById('loginPassword').focus();
}

// ── Render user list ──
function renderUserList() {
  const list    = document.getElementById('userList');
  const userArr = Object.entries(users)
    .map(([id, u]) => ({ id, ...u }))
    .sort((a, b) => a.name.localeCompare(b.name));   // alphabetical

  if (!userArr.length) {
    list.innerHTML = '<p class="no-users">No users yet — be the first to join!</p>';
    return;
  }

  list.innerHTML = userArr.map(u => `
    <button class="user-chip" data-uid="${u.id}">
      ${avatarHtml(u.name)}
      <span class="chip-name">${escHtml(u.name)}</span>
      ${u.passwordHash ? '🔒' : `<span class="no-pwd-tag">no password</span>`}
    </button>`).join('');

  list.querySelectorAll('.user-chip').forEach(btn => {
    btn.addEventListener('click', () => handleUserChipClick(btn.dataset.uid));
  });
}

// Clicking a user chip: if they have a password → step 2, else log in directly
async function handleUserChipClick(uid) {
  const u = users[uid];
  if (!u) return;
  if (u.passwordHash) {
    showStep2(uid);
  } else {
    saveCurrentUser({ id: uid, name: u.name });
    hideUserOverlay();
  }
}

// Password login (step 2)
async function attemptLogin() {
  const uid = pendingLoginUid;
  const u   = users[uid];
  if (!uid || !u) return;
  const pwd = document.getElementById('loginPassword').value;
  if (!pwd) { document.getElementById('loginError').textContent = 'Please enter your password.'; return; }
  const hash = await hashPassword(pwd);
  if (hash !== u.passwordHash) {
    document.getElementById('loginError').textContent = 'Incorrect password. Try again.';
    document.getElementById('loginPassword').select();
    return;
  }
  saveCurrentUser({ id: uid, name: u.name });
  hideUserOverlay();
}

// Create a new account
async function joinAs(name, password) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const existing = Object.entries(users).find(([, u]) => u.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    alert(`"${trimmed}" already exists. Please select them from the list above to sign in.`);
    return;
  }
  if (!password) {
    alert('Please choose a password for your account.');
    document.getElementById('newUserPassword').focus();
    return;
  }
  if (password.length < 4) {
    alert('Password must be at least 4 characters.');
    document.getElementById('newUserPassword').focus();
    return;
  }
  const hash   = await hashPassword(password);
  const newRef = push(ref(db, 'users'));
  await set(newRef, { name: trimmed, passwordHash: hash, createdAt: Date.now() });
  saveCurrentUser({ id: newRef.key, name: trimmed });
  hideUserOverlay();
}

// ── Event wiring for user overlay ──
document.getElementById('loginBtn').addEventListener('click', attemptLogin);
document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
document.getElementById('backToList').addEventListener('click', showStep1);
document.getElementById('joinBtn').addEventListener('click', () =>
  joinAs(document.getElementById('newUserName').value, document.getElementById('newUserPassword').value));
document.getElementById('newUserPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') joinAs(document.getElementById('newUserName').value, document.getElementById('newUserPassword').value);
});
document.getElementById('newUserName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('newUserPassword').focus();
});
document.getElementById('changeUserBtn').addEventListener('click', showUserOverlay);
document.getElementById('userOverlayClose').addEventListener('click', hideUserOverlay);

// ─── USERS LISTENER ───────────────────────────────────────────────────────────
onValue(ref(db, 'users'), snap => {
  users = snap.val() || {};
  renderUserList();
  populateAssigneeDropdown();
  populateUserFilter();
  renderNotifSidebar();
  updateHeaderUser();   // re-render header avatar in case photo changed
});

function updateHeaderUser() {
  if (!currentUser) return;
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
  sel.innerHTML = '<option value="all">👤 All users</option>' +
    Object.entries(users)
      .sort(([,a],[,b]) => a.name.localeCompare(b.name))
      .map(([id, u]) => `<option value="${id}">${escHtml(u.name)}</option>`).join('');
  if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
}

// ─── TASKS LISTENER ───────────────────────────────────────────────────────────
onValue(ref(db, 'tasks'), snap => {
  tasks = snap.val() || {};
  renderBoard();
  checkAndNotifyOverdue();
});

// ─── GLOBAL COMMENTS LISTENER (for card count badges) ────────────────────────
onValue(ref(db, 'comments'), snap => {
  const data = snap.val() || {};
  commentCounts = {};
  for (const [taskId, cmts] of Object.entries(data)) {
    commentCounts[taskId] = Object.keys(cmts).length;
  }
  renderBoard();
});

// ─── OVERDUE AUTO-NOTIFY ──────────────────────────────────────────────────────
async function checkAndNotifyOverdue() {
  const now = Date.now();
  for (const [id, task] of Object.entries(tasks)) {
    if (task.status === 'done')        continue;   // already completed
    if (task.overdueNotifiedAt)        continue;   // already notified
    if (!isOverdue(task.due))          continue;   // not yet overdue

    const msg      = `⚠️ Task "${task.title}" is now overdue!`;
    const toNotify = new Set([task.createdBy, task.assignedTo].filter(Boolean));
    for (const uid of toNotify) {
      await push(ref(db, `notifications/${uid}`), { message: msg, taskId: id, read: false, createdAt: now });
    }
    await update(ref(db, `tasks/${id}`), { overdueNotifiedAt: now });
    tasks[id] = { ...tasks[id], overdueNotifiedAt: now };
  }
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
  if (currentUserFilter !== 'all') {
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

  ['todo', 'inprogress', 'done'].forEach(status => {
    const list  = document.getElementById('list-'  + status);
    const count = document.getElementById('count-' + status);
    const cols  = Object.entries(tasks)
      .filter(([, t]) => t.status === status)
      .map(([id, t]) => ({ id, ...t }))
      .filter(t => status === 'done' || !isOverdue(t.due))
      .filter(t => taskMatchesFilter(t))
      .filter(t => currentUserFilter === 'all' || t.assignedTo === currentUserFilter)
      .sort((a, b) => a.createdAt - b.createdAt);

    count.textContent = cols.length;
    list.innerHTML = '';
    if (!cols.length) {
      list.innerHTML = `<div class="empty-state"><div class="icon">📋</div>${parts.length ? 'No tasks in this range' : 'No tasks yet'}</div>`;
    } else {
      cols.forEach(t => list.appendChild(buildCard(t)));
    }
  });

  // Overdue column — always shows all overdue non-done tasks
  const overdueList  = document.getElementById('list-overdue');
  const overdueCount = document.getElementById('count-overdue');
  const overdueTasks = Object.entries(tasks)
    .filter(([, t]) => t.status !== 'done' && isOverdue(t.due))
    .map(([id, t]) => ({ id, ...t }))
    .filter(t => currentUserFilter === 'all' || t.assignedTo === currentUserFilter)
    .sort((a, b) => a.createdAt - b.createdAt);

  overdueCount.textContent = overdueTasks.length;
  overdueList.innerHTML = '';
  if (!overdueTasks.length) {
    overdueList.innerHTML = `<div class="empty-state"><div class="icon">✅</div>No overdue tasks</div>`;
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

  const card = document.createElement('div');
  card.className = 'task-card';
  card.draggable = true;
  card.dataset.id = task.id;

  card.innerHTML = `
    <div class="task-card-header">
      <span class="task-title">${escHtml(task.title)}</span>
      ${owned ? `<div class="card-actions">
        <button class="btn-icon edit"   title="Edit"   data-id="${task.id}">✏️</button>
        <button class="btn-icon delete" title="Delete" data-id="${task.id}">🗑️</button>
      </div>` : ''}
    </div>
    ${task.desc ? `<div class="task-desc">${escHtml(task.desc)}</div>` : ''}
    <div class="task-card-footer">
      <span class="priority-badge priority-${task.priority}">${task.priority}</span>
      <div class="card-meta">
        ${task.due ? `<span class="due-date ${overdue?'overdue':''}">📅 ${formatDate(task.due)}</span>` : ''}
        ${task.createdAt ? `<span class="created-date">🕒 ${fmtTimestamp(task.createdAt)}</span>` : ''}
        ${assignee ? `<span class="assignee-chip">${avatarHtml(assignee.name)}<span>${escHtml(assignee.name)}</span></span>` : ''}
        <span class="comment-count" title="${cCount} comment${cCount === 1 ? '' : 's'}">💬 ${cCount}</span>
      </div>
    </div>`;

  if (owned) {
    card.querySelector('.btn-icon.edit').addEventListener('click', e => { e.stopPropagation(); openEdit(task.id); });
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
    const oldStatus = task.status;
    tasks[id] = { ...task, status: newStatus };
    renderBoard();
    await update(ref(db, `tasks/${id}`), { status: newStatus });
    if (newStatus === 'done' && oldStatus !== 'done') {
      await notifyParticipants(task, id, `${currentUser.name} completed "${task.title}"`);
    }
  });
});

// ─── TASK CREATE / EDIT MODAL ─────────────────────────────────────────────────
function openNew(defaultStatus = 'todo') {
  editingTaskId = null;
  document.getElementById('modalTitle').textContent = 'New Task';
  document.getElementById('taskForm').reset();
  document.getElementById('taskStatus').value = defaultStatus;
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('taskTitle').focus();
}

function openEdit(id) {
  const task = tasks[id]; if (!task) return;
  editingTaskId = id;
  document.getElementById('modalTitle').textContent     = 'Edit Task';
  document.getElementById('taskTitle').value            = task.title;
  document.getElementById('taskDesc').value             = task.desc || '';
  document.getElementById('taskPriority').value         = task.priority;
  document.getElementById('taskDue').value              = task.due || '';
  document.getElementById('taskStatus').value           = task.status;
  document.getElementById('taskAssignee').value         = task.assignedTo || '';
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

  const newAssignee = document.getElementById('taskAssignee').value || null;
  const newStatus   = document.getElementById('taskStatus').value;
  const fields = {
    title,
    desc:       document.getElementById('taskDesc').value.trim(),
    priority:   document.getElementById('taskPriority').value,
    due:        document.getElementById('taskDue').value || null,
    status:     newStatus,
    assignedTo: newAssignee,
  };

  if (editingTaskId) {
    const old = tasks[editingTaskId];
    await update(ref(db, `tasks/${editingTaskId}`), fields);
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
    const newRef   = push(ref(db, 'tasks'));
    const taskData = { ...fields, createdBy: currentUser.id, createdAt: Date.now() };
    await set(newRef, taskData);
    tasks[newRef.key] = taskData;
    closeModal();
    renderBoard();
    if (newAssignee) await notify(newAssignee, `${currentUser.name} assigned "${title}" to you`, newRef.key);
    if (newStatus === 'done') await notifyParticipants(taskData, newRef.key, `${currentUser.name} completed "${title}"`);
  }
});

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await remove(ref(db, `tasks/${id}`));
  await remove(ref(db, `comments/${id}`));
  delete tasks[id];
  renderBoard();
}

// ─── TASK DETAIL MODAL ────────────────────────────────────────────────────────
function openDetail(id) {
  const task = tasks[id];
  if (!task) { alert('This task no longer exists.'); return; }
  detailTaskId = id;

  const assignee   = task.assignedTo ? users[task.assignedTo] : null;
  const creator    = task.createdBy  ? users[task.createdBy]  : null;
  const overdue    = isOverdue(task.due);
  const owned      = isTaskOwner(task);

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
        <span class="due-date ${overdue?'overdue':''}">${formatDate(task.due)}${overdue?' · overdue':''}</span>
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
    </div>
    ${task.desc ? `<p class="detail-desc">${escHtml(task.desc)}</p>` : ''}`;

  if (owned) {
    const sel        = document.getElementById('detailStatusSel');
    const saveBtn    = document.getElementById('saveStatusBtn');
    const origStatus = task.status;

    // Only show Save when the status actually changed — no auto-save
    sel.addEventListener('change', () => {
      saveBtn.style.display = sel.value !== origStatus ? '' : 'none';
    });

    saveBtn.addEventListener('click', async () => {
      const newStatus = sel.value;
      const oldStatus = tasks[id]?.status;
      saveBtn.disabled = true;
      await update(ref(db, `tasks/${id}`), { status: newStatus });
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

  // Real-time comments listener
  if (commentsUnsub) commentsUnsub();
  commentsUnsub = onValue(ref(db, `comments/${id}`), snap => {
    if (detailTaskId !== id) return;
    const data     = snap.val() || {};
    const comments = Object.entries(data).map(([cid, c]) => ({ id: cid, ...c })).sort((a,b) => a.createdAt - b.createdAt);
    const list     = document.getElementById('commentsList');
    if (!comments.length) {
      list.innerHTML = '<div class="no-comments">No comments yet. Be the first!</div>';
      return;
    }
    list.innerHTML = comments.map(c => {
      const author = users[c.author];
      const name   = author ? author.name : 'Unknown';
      const time   = new Date(c.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      return `<div class="comment">
        ${avatarHtml(name, true)}
        <div class="comment-body">
          <div class="comment-meta"><strong>${escHtml(name)}</strong><span class="comment-time">${time}</span></div>
          <p>${escHtml(c.text)}</p>
        </div>
      </div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
  });

  document.getElementById('detailOverlay').classList.add('open');
  document.getElementById('commentInput').focus();
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

  await push(ref(db, `comments/${detailTaskId}`), { text, author: currentUser.id, createdAt: Date.now() });
  input.value = '';

  const task = tasks[detailTaskId];
  if (task) {
    const recipient = currentUser.id === task.assignedTo ? task.createdBy : task.assignedTo;
    const preview   = text.length > 80 ? text.slice(0, 80) + '…' : text;
    if (recipient) await notify(recipient, `${currentUser.name} commented on "${task.title}": "${preview}"`, detailTaskId);
  }
}

document.getElementById('postCommentBtn').addEventListener('click', postComment);
document.getElementById('commentInput').addEventListener('keydown', e => { if (e.key === 'Enter') postComment(); });

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────
async function notify(toUserId, message, taskId) {
  if (!toUserId || toUserId === currentUser?.id) return;
  await push(ref(db, `notifications/${toUserId}`), { message, taskId: taskId || '', read: false, createdAt: Date.now() });
}

async function notifyParticipants(task, taskId, message) {
  if (task.createdBy && task.createdBy !== currentUser?.id) {
    await notify(task.createdBy, message, taskId);
  }
}

// ─── ACTIVITY SIDEBAR ─────────────────────────────────────────────────────────
// Global listener — fires in real-time for ALL users' notifications
onValue(ref(db, 'notifications'), snap => {
  allNotifications = snap.val() || {};
  renderNotifSidebar();
});

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
    return `<div class="sidebar-notif-item ${n.read ? '' : 'unread'}" data-task="${n.taskId}">
      <div class="sidebar-notif-msg">${escHtml(n.message)}</div>
      <div class="sidebar-notif-time">${time}</div>
    </div>`;
  }).join('') + (hasMore ? `<button class="sidebar-show-more" id="sidebarShowMore">Show more</button>` : '');

  body.querySelectorAll('.sidebar-notif-item[data-task]').forEach(item => {
    item.addEventListener('click', () => { if (item.dataset.task) openDetail(item.dataset.task); });
  });

  const showMoreBtn = body.querySelector('#sidebarShowMore');
  if (showMoreBtn) showMoreBtn.addEventListener('click', () => { sidebarLimit += 10; renderNotifSidebar(); });
}

// ─── HEADER NOTIFICATION PANEL ────────────────────────────────────────────────
// Manages a per-user listener that drives the bell badge + dropdown
function setupNotifListener() {
  // Always tear down the previous listener first to avoid stale data
  if (notifBadgeUnsub) { notifBadgeUnsub(); notifBadgeUnsub = null; }

  // Reset badge & list immediately so the old user's data doesn't linger
  const badge = document.getElementById('notifBadge');
  badge.textContent = '';
  badge.classList.remove('visible');
  document.getElementById('notifList').innerHTML = '<div class="no-notifs">No notifications yet</div>';

  if (!currentUser) return;

  // Register fresh listener for the new current user
  notifBadgeUnsub = onValue(ref(db, `notifications/${currentUser.id}`), snap => {
    const data   = snap.val() || {};
    const notifs = Object.entries(data).map(([id, n]) => ({ id, ...n })).sort((a,b) => b.createdAt - a.createdAt);
    const unread = notifs.filter(n => !n.read).length;

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
      item.addEventListener('click', () => {
        update(ref(db, `notifications/${currentUser.id}/${item.dataset.id}`), { read: true });
        if (item.dataset.task) { closeNotifPanel(); openDetail(item.dataset.task); }
      });
    });
  });
}

document.getElementById('notifBtn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('notifPanel').classList.toggle('open');
});

document.getElementById('markAllRead').addEventListener('click', async () => {
  if (!currentUser) return;
  const snap = await get(ref(db, `notifications/${currentUser.id}`));
  const data = snap.val() || {};
  const upd  = Object.fromEntries(Object.keys(data).map(k => [`${k}/read`, true]));
  if (Object.keys(upd).length) await update(ref(db, `notifications/${currentUser.id}`), upd);
});

function closeNotifPanel() { document.getElementById('notifPanel').classList.remove('open'); }
document.addEventListener('click', e => { if (!e.target.closest('.notif-wrapper')) closeNotifPanel(); });

// ─── PROFILE SETTINGS ─────────────────────────────────────────────────────────
document.getElementById('currentUserBtn').addEventListener('click', openProfile);

function openProfile() {
  if (!currentUser) return;
  const u = users[currentUser.id];
  if (!u) return;

  document.getElementById('profileNameDisplay').textContent =
    u.name + (u.passwordHash ? ' 🔒' : ' (no password)');
  document.getElementById('profileMemberSince').textContent =
    u.createdAt ? `Member since ${fmtTimestamp(u.createdAt)}` : '';

  // Render current avatar / photo at larger size
  const preview = document.getElementById('profilePhotoPreview');
  if (u.photoURL) {
    preview.innerHTML = `<img class="avatar avatar-lg avatar-photo" src="${u.photoURL}" alt="${escHtml(initials(u.name))}" style="width:72px;height:72px">`;
  } else {
    preview.innerHTML = `<span class="avatar" style="background:${avatarColor(u.name)};width:72px;height:72px;font-size:1.6rem">${initials(u.name)}</span>`;
  }

  document.getElementById('profileNewPassword').value     = '';
  document.getElementById('profileConfirmPassword').value = '';
  document.getElementById('profileError').textContent     = '';
  pendingProfilePhoto = null;
  document.getElementById('profilePhotoInput').value = '';

  document.getElementById('profileOverlay').classList.add('open');
}

function closeProfile() {
  document.getElementById('profileOverlay').classList.remove('open');
}

document.getElementById('closeProfile').addEventListener('click', closeProfile);
document.getElementById('profileOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeProfile(); });

// Photo upload
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

  if (newPwd || confirmPwd) {
    if (newPwd !== confirmPwd) { err.textContent = 'Passwords do not match.'; return; }
    if (newPwd.length < 4)    { err.textContent = 'Password must be at least 4 characters.'; return; }
  }
  err.textContent = '';

  const updates = {};
  if (newPwd)            updates.passwordHash = await hashPassword(newPwd);
  if (pendingProfilePhoto) updates.photoURL   = pendingProfilePhoto;

  if (Object.keys(updates).length) {
    await update(ref(db, `users/${currentUser.id}`), updates);
  }

  pendingProfilePhoto = null;
  closeProfile();
});

document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
  if (!currentUser) return;
  if (!confirm(`Delete your account "${currentUser.name}"? This cannot be undone.`)) return;
  await remove(ref(db, `users/${currentUser.id}`));
  await remove(ref(db, `notifications/${currentUser.id}`));
  localStorage.removeItem('taskboard-user');
  currentUser = null;
  if (notifBadgeUnsub) { notifBadgeUnsub(); notifBadgeUnsub = null; }
  closeProfile();
  showUserOverlay();
});

// ─── GLOBAL UI EVENTS ─────────────────────────────────────────────────────────
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
  document.getElementById('customFrom').value           = '';
  document.getElementById('customTo').value             = '';
  document.getElementById('customFromText').textContent = 'dd-mm-yyyy';
  document.getElementById('customToText').textContent   = 'dd-mm-yyyy';
  document.getElementById('customDateRow').style.display = 'none';
  renderBoard();
});

document.getElementById('addTaskBtn').addEventListener('click', () => openNew());
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.getElementById('closeDetail').addEventListener('click', closeDetail);
document.getElementById('detailOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDetail(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDetail(); closeProfile(); } });

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
loadCurrentUser();
if (currentUser) {
  updateHeaderUser();
  currentUserFilter = currentUser.id;
  setupNotifListener();
} else {
  showUserOverlay();
}
