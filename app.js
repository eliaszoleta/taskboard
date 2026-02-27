import { initializeApp }                                    from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, push, set, update, remove,
         onValue, get }                                      from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
// Replace these placeholder values with your own Firebase project config.
// See README or setup instructions for how to get these values.
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL:       "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
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
  renderUserList();
}

function hideUserOverlay() {
  document.getElementById('userOverlay').classList.remove('open');
  document.getElementById('userNameDisplay').textContent = currentUser.name;
  document.getElementById('userAvatar').innerHTML = avatarHtml(currentUser.name);
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
    <button class="user-chip" data-uid="${u.id}">
      ${avatarHtml(u.name)}
      <span>${escHtml(u.name)}</span>
    </button>`).join('');

  list.querySelectorAll('.user-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = users[btn.dataset.uid];
      if (u) { saveCurrentUser({ id: btn.dataset.uid, name: u.name }); hideUserOverlay(); }
    });
  });
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

// ─── USERS LISTENER ───────────────────────────────────────────────────────────
onValue(ref(db, 'users'), snap => {
  users = snap.val() || {};
  renderUserList();
  populateAssigneeDropdown();
});

function populateAssigneeDropdown() {
  const sel  = document.getElementById('taskAssignee');
  const prev = sel.value;
  sel.innerHTML = '<option value="">Unassigned</option>' +
    Object.entries(users).map(([id, u]) =>
      `<option value="${id}">${escHtml(u.name)}</option>`).join('');
  sel.value = prev;
}

// ─── TASKS LISTENER ───────────────────────────────────────────────────────────
onValue(ref(db, 'tasks'), snap => {
  tasks = snap.val() || {};
  renderBoard();
});

// ─── BOARD ────────────────────────────────────────────────────────────────────
function renderBoard() {
  ['todo', 'inprogress', 'done'].forEach(status => {
    const list  = document.getElementById('list-'  + status);
    const count = document.getElementById('count-' + status);
    const cols  = Object.entries(tasks)
      .filter(([, t]) => t.status === status)
      .map(([id, t]) => ({ id, ...t }))
      .sort((a, b) => a.createdAt - b.createdAt);

    count.textContent = cols.length;
    list.innerHTML = '';
    if (!cols.length) {
      list.innerHTML = '<div class="empty-state"><div class="icon">📋</div>No tasks yet</div>';
    } else {
      cols.forEach(t => list.appendChild(buildCard(t)));
    }
  });
}

function buildCard(task) {
  const overdue  = isOverdue(task.due);
  const assignee = task.assignedTo ? users[task.assignedTo] : null;

  const card = document.createElement('div');
  card.className = 'task-card';
  card.draggable = true;
  card.dataset.id = task.id;

  card.innerHTML = `
    <div class="task-card-header">
      <span class="task-title">${escHtml(task.title)}</span>
      <div class="card-actions">
        <button class="btn-icon edit"   title="Edit"   data-id="${task.id}">✏️</button>
        <button class="btn-icon delete" title="Delete" data-id="${task.id}">🗑️</button>
      </div>
    </div>
    ${task.desc ? `<div class="task-desc">${escHtml(task.desc)}</div>` : ''}
    <div class="task-card-footer">
      <span class="priority-badge priority-${task.priority}">${task.priority}</span>
      <div class="card-meta">
        ${task.due ? `<span class="due-date ${overdue?'overdue':''}">📅 ${formatDate(task.due)}</span>` : ''}
        ${assignee ? `<span class="assignee-chip">${avatarHtml(assignee.name)}<span>${escHtml(assignee.name)}</span></span>` : ''}
      </div>
    </div>`;

  card.querySelector('.btn-icon.edit').addEventListener('click', e => { e.stopPropagation(); openEdit(task.id); });
  card.querySelector('.btn-icon.delete').addEventListener('click', e => { e.stopPropagation(); deleteTask(task.id); });
  card.addEventListener('click', () => openDetail(task.id));

  card.addEventListener('dragstart', e => {
    draggedId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => { card.classList.remove('dragging'); draggedId = null; });

  return card;
}

// ─── DRAG & DROP ─────────────────────────────────────────────────────────────
document.querySelectorAll('.task-list').forEach(list => {
  list.addEventListener('dragover', e => { e.preventDefault(); list.classList.add('drag-over'); });
  list.addEventListener('dragleave', e => { if (!list.contains(e.relatedTarget)) list.classList.remove('drag-over'); });
  list.addEventListener('drop', async e => {
    e.preventDefault();
    list.classList.remove('drag-over');
    if (!draggedId) return;
    const newStatus = list.id.replace('list-', '');
    const task = tasks[draggedId];
    if (!task || task.status === newStatus) return;
    const oldStatus = task.status;
    await update(ref(db, `tasks/${draggedId}`), { status: newStatus });
    if (newStatus === 'done' && oldStatus !== 'done') {
      await notifyAll(`${currentUser.name} completed "${task.title}"`, draggedId);
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
    if (newAssignee && newAssignee !== old.assignedTo) {
      await notify(newAssignee, `${currentUser.name} assigned "${title}" to you`, editingTaskId);
    }
    if (newStatus === 'done' && old.status !== 'done') {
      await notifyAll(`${currentUser.name} completed "${title}"`, editingTaskId);
    }
  } else {
    const newRef = push(ref(db, 'tasks'));
    await set(newRef, { ...fields, createdBy: currentUser.id, createdAt: Date.now() });
    if (newAssignee) await notify(newAssignee, `${currentUser.name} assigned "${title}" to you`, newRef.key);
    if (newStatus === 'done') await notifyAll(`${currentUser.name} completed "${title}"`, newRef.key);
  }
  closeModal();
});

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await remove(ref(db, `tasks/${id}`));
  await remove(ref(db, `comments/${id}`));
}

// ─── TASK DETAIL MODAL ────────────────────────────────────────────────────────
function openDetail(id) {
  const task = tasks[id]; if (!task) return;
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

  document.getElementById('detailStatusSel').addEventListener('change', async ev => {
    const newStatus = ev.target.value;
    const old       = tasks[id]?.status;
    await update(ref(db, `tasks/${id}`), { status: newStatus });
    if (newStatus === 'done' && old !== 'done') {
      await notifyAll(`${currentUser.name} completed "${task.title}"`, id);
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
    const toNotify = new Set();
    if (task.createdBy  && task.createdBy  !== currentUser.id) toNotify.add(task.createdBy);
    if (task.assignedTo && task.assignedTo !== currentUser.id) toNotify.add(task.assignedTo);
    for (const uid of toNotify) {
      await notify(uid, `${currentUser.name} commented on "${task.title}"`, detailTaskId);
    }
  }
}

document.getElementById('postCommentBtn').addEventListener('click', postComment);
document.getElementById('commentInput').addEventListener('keydown', e => { if (e.key === 'Enter') postComment(); });

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────
async function notify(toUserId, message, taskId) {
  if (!toUserId || toUserId === currentUser?.id) return;
  await push(ref(db, `notifications/${toUserId}`), { message, taskId: taskId || '', read: false, createdAt: Date.now() });
}

async function notifyAll(message, taskId) {
  await Promise.all(
    Object.keys(users)
      .filter(id => id !== currentUser?.id)
      .map(id => notify(id, message, taskId))
  );
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
      item.addEventListener('click', async () => {
        await update(ref(db, `notifications/${currentUser.id}/${item.dataset.id}`), { read: true });
        const tid = item.dataset.task;
        if (tid && tasks[tid]) { closeNotifPanel(); openDetail(tid); }
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
  setupNotifListener();
} else {
  showUserOverlay();
}
