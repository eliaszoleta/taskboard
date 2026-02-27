import { initializeApp }                                    from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, push, set, update, remove,
         onValue, get }                                      from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
// Replace these placeholder values with your own Firebase project config.
// See README or setup instructions for how to get these values.
const firebaseConfig = {
  apiKey:            "AIzaSyCT2yccAHsvB6_NvLL1if7V1FxzYK6tRE0",
  authDomain:        "taskboard-d91be.firebaseapp.com",
  databaseURL:       "https://taskboard-d91be-default-rtdb.firebaseio.com",
  projectId:         "taskboard-d91be",
  storageBucket:     "taskboard-d91be.firebasestorage.app",
  messagingSenderId: "34815479362",
  appId:             "1:34815479362:web:25069a6f086ecfcb17e7db",
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
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
let users              = {};     // { userId: { name, createdAt } }
let tasks              = {};     // { taskId: { ...fields } }
let editingTaskId      = null;
let detailTaskId       = null;
let draggedId          = null;
let commentsUnsub      = null;
let currentFilter      = 'all';
let currentUserFilter  = 'all';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const escHtml = str =>
  String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const formatDate = dateStr => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
};

const isOverdue = dateStr => {
  if (!dateStr) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(dateStr + 'T00:00:00') < today;
};

// Returns the Mon–Sun boundaries for a week offset (0 = this week, -1 = last, 1 = next)
function weekRange(offset = 0) {
  const today = new Date(); today.setHours(0,0,0,0);
  const dow   = today.getDay();                          // 0=Sun
  const toMon = (dow === 0 ? -6 : 1 - dow) + offset * 7;
  const start = new Date(today); start.setDate(today.getDate() + toMon);
  const end   = new Date(start);  end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  return { start, end };
}

function taskMatchesFilter(task) {
  if (currentFilter === 'all') return true;
  if (!task.due) return false;          // undated tasks only shown in "All"
  const d = new Date(task.due + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  if (currentFilter === 'today')      { const e = new Date(today); e.setHours(23,59,59,999); return d >= today && d <= e; }
  if (currentFilter === 'this-week')  { const { start, end } = weekRange(0);  return d >= start && d <= end; }
  if (currentFilter === 'next-week')  { const { start, end } = weekRange(1);  return d >= start && d <= end; }
  if (currentFilter === 'last-week')  { const { start, end } = weekRange(-1); return d >= start && d <= end; }
  if (currentFilter === 'this-month') {
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }
  if (currentFilter === 'overdue')    { return d < today; }
  return true;
}

const FILTER_LABELS = {
  'today':      'Today',
  'this-week':  'This week',
  'next-week':  'Next week',
  'last-week':  'Last week',
  'this-month': 'This month',
  'overdue':    '⚠️ Overdue',
};

const COLORS = ['#4f46e5','#7c3aed','#db2777','#dc2626','#d97706','#059669','#0284c7','#0e7490'];
const avatarColor = name => {
  let h = 0;
  for (const c of (name||'')) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return COLORS[h % COLORS.length];
};
const initials = name =>
  (name||'?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const avatarHtml = (name, lg = false) =>
  `<span class="avatar${lg?' avatar-lg':''}" style="background:${avatarColor(name)}">${initials(name)}</span>`;

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
  // Show cancel button only when a user is already logged in (changing profile)
  document.getElementById('userOverlayClose').style.display = currentUser ? '' : 'none';
  renderUserList();
}

function hideUserOverlay() {
  document.getElementById('userOverlay').classList.remove('open');
  document.getElementById('userNameDisplay').textContent = currentUser.name;
  document.getElementById('userAvatar').innerHTML = avatarHtml(currentUser.name);
  currentUserFilter = currentUser.id;
  renderBoard();
  setupNotifListener();
}

function renderUserList() {
  const list    = document.getElementById('userList');
  const userArr = Object.entries(users).map(([id, u]) => ({ id, ...u }));
  if (!userArr.length) {
    list.innerHTML = '<p class="no-users">No users yet — be the first to join!</p>';
    return;
  }
  list.innerHTML = userArr.map(u => `
    <div class="user-chip-row">
      <button class="user-chip" data-uid="${u.id}">
        ${avatarHtml(u.name)}
        <span>${escHtml(u.name)}</span>
      </button>
      <button class="user-delete-btn" data-uid="${u.id}" title="Delete profile">🗑️</button>
    </div>`).join('');

  list.querySelectorAll('.user-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = users[btn.dataset.uid];
      if (u) { saveCurrentUser({ id: btn.dataset.uid, name: u.name }); hideUserOverlay(); }
    });
  });

  list.querySelectorAll('.user-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteUser(btn.dataset.uid);
    });
  });
}

async function deleteUser(id) {
  const u = users[id];
  if (!u) return;
  if (!confirm(`Delete profile "${u.name}"? This cannot be undone.`)) return;
  await remove(ref(db, `users/${id}`));
  await remove(ref(db, `notifications/${id}`));
  if (currentUser?.id === id) {
    localStorage.removeItem('taskboard-user');
    currentUser = null;
    showUserOverlay();
  }
}

async function joinAs(name) {
  const trimmed  = name.trim();
  if (!trimmed) return;
  const existing = Object.entries(users).find(([, u]) => u.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) {
    saveCurrentUser({ id: existing[0], name: existing[1].name });
  } else {
    const newRef = push(ref(db, 'users'));
    await set(newRef, { name: trimmed, createdAt: Date.now() });
    saveCurrentUser({ id: newRef.key, name: trimmed });
  }
  hideUserOverlay();
}

document.getElementById('joinBtn').addEventListener('click', () =>
  joinAs(document.getElementById('newUserName').value));
document.getElementById('newUserName').addEventListener('keydown', e => {
  if (e.key === 'Enter') joinAs(document.getElementById('newUserName').value);
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
});

function populateAssigneeDropdown() {
  const sel  = document.getElementById('taskAssignee');
  const prev = sel.value;
  sel.innerHTML = '<option value="">Unassigned</option>' +
    Object.entries(users).map(([id, u]) =>
      `<option value="${id}">${escHtml(u.name)}</option>`).join('');
  sel.value = prev;
}

function populateUserFilter() {
  const sel  = document.getElementById('userFilter');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="all">👤 All users</option>' +
    Object.entries(users).map(([id, u]) =>
      `<option value="${id}">${escHtml(u.name)}</option>`).join('');
  if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
}

// ─── TASKS LISTENER ───────────────────────────────────────────────────────────
onValue(ref(db, 'tasks'), snap => {
  tasks = snap.val() || {};
  renderBoard();
});

// ─── BOARD ────────────────────────────────────────────────────────────────────
function renderBoard() {
  // Sync filter selects
  const dateSel = document.getElementById('dateFilter');
  const userSel = document.getElementById('userFilter');
  if (dateSel) { dateSel.value = currentFilter;     dateSel.classList.toggle('active', currentFilter !== 'all'); }
  if (userSel) { userSel.value = currentUserFilter; userSel.classList.toggle('active', currentUserFilter !== 'all'); }

  // Filter bar
  const bar   = document.getElementById('filterBar');
  const label = document.getElementById('filterBarLabel');
  const parts = [];
  if (currentUserFilter !== 'all') {
    const u = users[currentUserFilter];
    parts.push(u ? `${u.name}'s tasks` : 'Unknown user');
  }
  if (currentFilter !== 'all') parts.push(FILTER_LABELS[currentFilter] || currentFilter);
  if (parts.length) {
    bar.classList.add('visible');
    label.textContent = `Showing: ${parts.join(' · ')}`;
  } else {
    bar.classList.remove('visible');
  }

  ['todo', 'inprogress', 'done'].forEach(status => {
    const list  = document.getElementById('list-'  + status);
    const count = document.getElementById('count-' + status);
    const cols  = Object.entries(tasks)
      .filter(([, t]) => t.status === status)
      .map(([id, t]) => ({ id, ...t }))
      .filter(t => status === 'done' || !isOverdue(t.due))   // overdue non-done → own column
      .filter(t => taskMatchesFilter(t))
      .filter(t => currentUserFilter === 'all' || t.assignedTo === currentUserFilter)
      .sort((a, b) => a.createdAt - b.createdAt);

    count.textContent = cols.length;
    list.innerHTML = '';
    if (!cols.length) {
      const msg = (parts.length) ? 'No tasks in this range' : 'No tasks yet';
      list.innerHTML = `<div class="empty-state"><div class="icon">📋</div>${msg}</div>`;
    } else {
      cols.forEach(t => list.appendChild(buildCard(t)));
    }
  });

  // Overdue column — always shows all overdue non-done tasks (ignores date filter)
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
        ${assignee ? `<span class="assignee-chip">${avatarHtml(assignee.name)}<span>${escHtml(assignee.name)}</span></span>` : ''}
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
    const id = draggedId;   // capture before any await — dragend can fire during await and null it
    draggedId = null;
    if (!id) return;
    const newStatus = list.id.replace('list-', '');
    if (newStatus === 'overdue') return;   // overdue column is read-only
    const task = tasks[id];
    if (!task || task.status === newStatus) return;
    const oldStatus = task.status;
    // Optimistic update: reflect move immediately so the board feels instant
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
  document.getElementById('modalTitle').textContent          = 'Edit Task';
  document.getElementById('taskTitle').value                 = task.title;
  document.getElementById('taskDesc').value                  = task.desc || '';
  document.getElementById('taskPriority').value              = task.priority;
  document.getElementById('taskDue').value                   = task.due || '';
  document.getElementById('taskStatus').value                = task.status;
  document.getElementById('taskAssignee').value              = task.assignedTo || '';
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
      await notifyParticipants({...old, ...fields}, editingTaskId, `${currentUser.name} completed "${title}"`);
    }
  } else {
    const newRef = push(ref(db, 'tasks'));
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

  const assignee = task.assignedTo ? users[task.assignedTo] : null;
  const creator  = task.createdBy  ? users[task.createdBy]  : null;
  const overdue  = isOverdue(task.due);

  document.getElementById('detailTitle').textContent = task.title;
  document.getElementById('detailBody').innerHTML = `
    <div class="detail-meta">
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <select class="detail-status-sel" id="detailStatusSel">
          <option value="todo"       ${task.status==='todo'       ?'selected':''}>To Do</option>
          <option value="inprogress" ${task.status==='inprogress' ?'selected':''}>In Progress</option>
          <option value="done"       ${task.status==='done'       ?'selected':''}>Done</option>
        </select>
      </div>
      <div class="detail-row">
        <span class="detail-label">Priority</span>
        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
      </div>
      ${task.due ? `<div class="detail-row">
        <span class="detail-label">Due</span>
        <span class="due-date ${overdue?'overdue':''}">${formatDate(task.due)}${overdue?' · overdue':''}</span>
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

  const owned = isTaskOwner(task);
  if (!owned) {
    document.getElementById('detailStatusSel').disabled = true;
    document.getElementById('detailEditBtn').style.display = 'none';
  } else {
    document.getElementById('detailStatusSel').disabled = false;
    document.getElementById('detailEditBtn').style.display = '';
  }

  document.getElementById('detailStatusSel').addEventListener('change', async ev => {
    if (!owned) return;
    const newStatus = ev.target.value;
    const old       = tasks[id]?.status;
    await update(ref(db, `tasks/${id}`), { status: newStatus });
    tasks[id] = { ...tasks[id], status: newStatus };
    renderBoard();
    if (newStatus === 'done' && old !== 'done') {
      await notifyParticipants(task, id, `${currentUser.name} completed "${task.title}"`);
    }
  });

  document.getElementById('detailEditBtn').onclick = () => { closeDetail(); openEdit(id); };

  // Comments
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
    const recipient = task.assignedTo && task.assignedTo !== currentUser.id
      ? task.assignedTo
      : task.createdBy && task.createdBy !== currentUser.id
        ? task.createdBy
        : null;
    if (recipient) await notify(recipient, `${currentUser.name} commented on "${task.title}"`, detailTaskId);
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
  // Only notify the person who created/assigned the task — not the assignee who completed it
  if (task.createdBy && task.createdBy !== currentUser?.id) {
    await notify(task.createdBy, message, taskId);
  }
}

// ─── ACTIVITY SIDEBAR ─────────────────────────────────────────────────────────
let allNotifications = {};

onValue(ref(db, 'notifications'), snap => {
  allNotifications = snap.val() || {};
  renderNotifSidebar();
});

function renderNotifSidebar() {
  const body = document.getElementById('notifSidebarBody');
  if (!body) return;

  const userArr = Object.entries(users)
    .map(([id, u]) => ({ id, ...u }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!userArr.length) {
    body.innerHTML = '<div class="sidebar-empty">No users yet</div>';
    return;
  }

  body.innerHTML = userArr.map(u => {
    const userNotifs = Object.entries(allNotifications[u.id] || {})
      .map(([id, n]) => ({ id, ...n }))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);
    const unread = userNotifs.filter(n => !n.read).length;

    return `<div class="sidebar-user-section">
      <div class="sidebar-user-header">
        ${avatarHtml(u.name)}
        <span class="sidebar-user-name">${escHtml(u.name)}</span>
        ${unread ? `<span class="sidebar-unread-badge">${unread}</span>` : ''}
      </div>
      ${userNotifs.length
        ? userNotifs.map(n => {
            const time = new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return `<div class="sidebar-notif-item ${n.read ? 'read' : 'unread'}" data-task="${n.taskId}">
              <div class="sidebar-notif-msg">${escHtml(n.message)}</div>
              <div class="sidebar-notif-time">${time}</div>
            </div>`;
          }).join('')
        : '<div class="sidebar-no-notifs">No activity yet</div>'}
    </div>`;
  }).join('');

  body.querySelectorAll('.sidebar-notif-item[data-task]').forEach(item => {
    item.addEventListener('click', () => {
      const tid = item.dataset.task;
      if (tid) openDetail(tid);
    });
  });
}

function setupNotifListener() {
  if (!currentUser) return;
  onValue(ref(db, `notifications/${currentUser.id}`), snap => {
    const data   = snap.val() || {};
    const notifs = Object.entries(data).map(([id, n]) => ({ id, ...n })).sort((a,b) => b.createdAt - a.createdAt);
    const unread = notifs.filter(n => !n.read).length;

    const badge = document.getElementById('notifBadge');
    badge.textContent = unread;
    badge.classList.toggle('visible', unread > 0);

    const list = document.getElementById('notifList');
    if (!notifs.length) {
      list.innerHTML = '<div class="no-notifs">No notifications yet</div>';
      return;
    }
    list.innerHTML = notifs.slice(0, 30).map(n => {
      const time = new Date(n.createdAt).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      return `<div class="notif-item ${n.read?'read':'unread'}" data-id="${n.id}" data-task="${n.taskId}">
        <div class="notif-msg">${escHtml(n.message)}</div>
        <div class="notif-time">${time}</div>
      </div>`;
    }).join('');

    list.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', () => {
        // Mark as read in background — don't block opening the task
        update(ref(db, `notifications/${currentUser.id}/${item.dataset.id}`), { read: true });
        const tid = item.dataset.task;
        if (tid) { closeNotifPanel(); openDetail(tid); }
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
document.addEventListener('click', e => {
  if (!e.target.closest('.notif-wrapper')) closeNotifPanel();
});

// ─── GLOBAL UI EVENTS ─────────────────────────────────────────────────────────
document.getElementById('userFilter').addEventListener('change', e => {
  currentUserFilter = e.target.value;
  renderBoard();
});
document.getElementById('dateFilter').addEventListener('change', e => {
  currentFilter = e.target.value;
  renderBoard();
});
document.getElementById('filterBarClear').addEventListener('click', () => {
  currentFilter     = 'all';
  currentUserFilter = 'all';
  renderBoard();
});

document.getElementById('addTaskBtn').addEventListener('click', () => openNew());
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.getElementById('closeDetail').addEventListener('click', closeDetail);
document.getElementById('detailOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDetail(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDetail(); } });

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
loadCurrentUser();
if (currentUser) {
  document.getElementById('userNameDisplay').textContent = currentUser.name;
  document.getElementById('userAvatar').innerHTML = avatarHtml(currentUser.name);
  currentUserFilter = currentUser.id;
  setupNotifListener();
} else {
  showUserOverlay();
}
