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
let currentUser        = null;   // { id, name }
let users              = {};     // { userId: { name, passwordHash?, photoURL?, email?, createdAt } }
let tasks              = {};     // { taskId: { ...fields } }
let editingTaskId      = null;
let detailTaskId       = null;
let draggedId          = null;
let commentsUnsub      = null;
let notifBadgeUnsub    = null;
let currentFilter      = 'all';
let currentUserFilter  = 'all';
let customDateStart    = null;
let customDateEnd      = null;
let commentCounts      = {};
let allNotifications   = {};
let sidebarLimit       = 10;
let pendingLoginUid    = null;
let pendingProfilePhoto = null;
let pendingResourceFiles = [];   // [{ dataUrl, name, size }]
let pendingResourceLinks = [''];  // array of URL strings (at least one)
let pendingDeleteId      = null;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
/** Normalise both old single-resource and new multi-resource formats */
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
  'last-week':'Last week','this-month':'This month','overdue':'Overdue','custom':'Custom range',
};

const COLORS = ['#4f46e5','#7c3aed','#db2777','#dc2626','#d97706','#059669','#0284c7','#0e7490'];
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
  setupNotifListener();
  renderNotifSidebar();
}

// ── Step navigation ──
function showStep1() {
  ['userStep1','userStep2','userStep3','userStep4'].forEach(id => {
    document.getElementById(id).style.display = id === 'userStep1' ? '' : 'none';
  });
  pendingLoginUid = null;
  document.getElementById('newUserName').value     = '';
  document.getElementById('newUserEmail').value    = '';
  document.getElementById('newUserPassword').value = '';
  document.getElementById('loginError').textContent = '';
}

function showStep2(uid) {
  const u = users[uid];
  if (!u) return;
  pendingLoginUid = uid;
  ['userStep1','userStep3','userStep4'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('userStep2').style.display = '';
  document.getElementById('pwdPromptName').textContent = u.name;
  document.getElementById('pwdPromptAvatar').innerHTML = avatarHtml(u.name);
  document.getElementById('loginPassword').value       = '';
  document.getElementById('loginError').textContent    = '';
  document.getElementById('loginPassword').focus();
}

function showStep3() {
  const u = users[pendingLoginUid];
  ['userStep1','userStep2','userStep4'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('userStep3').style.display = '';
  document.getElementById('forgotEmail').value       = '';
  document.getElementById('forgotError').textContent = '';

  const sub  = document.getElementById('forgotSub');
  const form = document.getElementById('forgotEmailForm');
  if (!u?.email) {
    sub.textContent  = 'No recovery email is linked to this account. Add one in Profile Settings after signing in.';
    form.style.display = 'none';
  } else {
    const [local, domain] = u.email.split('@');
    const masked = local.slice(0, 2) + '***@' + domain;
    sub.textContent  = `Enter the email linked to your account (hint: ${masked})`;
    form.style.display = '';
    document.getElementById('forgotEmail').focus();
  }
}

function showStep4() {
  ['userStep1','userStep2','userStep3'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('userStep4').style.display = '';
  document.getElementById('resetPassword').value        = '';
  document.getElementById('resetConfirmPassword').value = '';
  document.getElementById('resetError').textContent     = '';
  document.getElementById('resetPassword').focus();
}

async function handleForgotVerify() {
  const uid = pendingLoginUid;
  const u   = users[uid];
  if (!uid || !u?.email) return;

  const inputEmail = document.getElementById('forgotEmail').value.trim().toLowerCase();
  if (!inputEmail) {
    document.getElementById('forgotError').textContent = 'Please enter your email address.';
    return;
  }
  if (inputEmail !== u.email.toLowerCase()) {
    document.getElementById('forgotError').textContent = 'Email does not match our records. Try again.';
    return;
  }
  showStep4();
}

async function handleResetPassword() {
  const uid = pendingLoginUid;
  if (!uid) return;

  const newPwd     = document.getElementById('resetPassword').value;
  const confirmPwd = document.getElementById('resetConfirmPassword').value;
  const errEl      = document.getElementById('resetError');

  if (!newPwd)                  { errEl.textContent = 'Please enter a new password.'; return; }
  if (newPwd !== confirmPwd)    { errEl.textContent = 'Passwords do not match.'; return; }
  if (newPwd.length < 4)        { errEl.textContent = 'Password must be at least 4 characters.'; return; }

  const hash = await hashPassword(newPwd);
  await update(ref(db, `users/${uid}`), { passwordHash: hash });
  users[uid] = { ...users[uid], passwordHash: hash };

  saveCurrentUser({ id: uid, name: users[uid].name });
  hideUserOverlay();
}

// ── Render user list ──
function renderUserList() {
  const list    = document.getElementById('userList');
  const userArr = Object.entries(users)
    .map(([id, u]) => ({ id, ...u }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!userArr.length) {
    list.innerHTML = '<p class="no-users">No users yet — be the first to join!</p>';
    return;
  }

  list.innerHTML = userArr.map(u => `
    <button class="user-chip" data-uid="${u.id}">
      ${avatarHtml(u.name)}
      <span class="chip-name">${escHtml(u.name)}</span>
      ${u.passwordHash
        ? `<span class="chip-lock" title="Password protected">${ICONS.lock}</span>`
        : `<span class="no-pwd-tag">no password</span>`}
    </button>`).join('');

  list.querySelectorAll('.user-chip').forEach(btn => {
    btn.addEventListener('click', () => handleUserChipClick(btn.dataset.uid));
  });
}

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

async function joinAs(name, email, password) {
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
  const hash    = await hashPassword(password);
  const newData = { name: trimmed, passwordHash: hash, createdAt: Date.now() };
  if (email.trim()) newData.email = email.trim().toLowerCase();
  const newRef  = push(ref(db, 'users'));
  await set(newRef, newData);
  saveCurrentUser({ id: newRef.key, name: trimmed });
  hideUserOverlay();
}

// ── Event wiring for user overlay ──
document.getElementById('loginBtn').addEventListener('click', attemptLogin);
document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
document.getElementById('backToList').addEventListener('click', showStep1);
document.getElementById('forgotPwdBtn').addEventListener('click', showStep3);
document.getElementById('backToStep2').addEventListener('click', () => showStep2(pendingLoginUid));
document.getElementById('forgotVerifyBtn').addEventListener('click', handleForgotVerify);
document.getElementById('forgotEmail').addEventListener('keydown', e => { if (e.key === 'Enter') handleForgotVerify(); });
document.getElementById('resetPasswordBtn').addEventListener('click', handleResetPassword);
document.getElementById('resetPassword').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('resetConfirmPassword').focus(); });
document.getElementById('resetConfirmPassword').addEventListener('keydown', e => { if (e.key === 'Enter') handleResetPassword(); });

document.getElementById('joinBtn').addEventListener('click', () =>
  joinAs(
    document.getElementById('newUserName').value,
    document.getElementById('newUserEmail').value,
    document.getElementById('newUserPassword').value,
  ));
document.getElementById('newUserPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') joinAs(
    document.getElementById('newUserName').value,
    document.getElementById('newUserEmail').value,
    document.getElementById('newUserPassword').value,
  );
});
document.getElementById('newUserName').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('newUserEmail').focus();
});
document.getElementById('newUserEmail').addEventListener('keydown', e => {
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
  updateHeaderUser();
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
  sel.innerHTML = '<option value="all">All users</option>' +
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

// ─── GLOBAL COMMENTS LISTENER ────────────────────────────────────────────────
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
    if (task.status === 'done')     continue;
    if (task.overdueNotifiedAt)     continue;
    if (!isOverdue(task.due))       continue;

    const msg      = `Task "${task.title}" is now overdue!`;
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
      .sort((a, b) => b.createdAt - a.createdAt);  // newest first

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

  // Overdue column — always shows all overdue non-done tasks, newest first
  const overdueList  = document.getElementById('list-overdue');
  const overdueCount = document.getElementById('count-overdue');
  const overdueTasks = Object.entries(tasks)
    .filter(([, t]) => t.status !== 'done' && isOverdue(t.due))
    .map(([id, t]) => ({ id, ...t }))
    .filter(t => currentUserFilter === 'all' || t.assignedTo === currentUserFilter)
    .sort((a, b) => b.createdAt - a.createdAt);  // newest first

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

  // Only owned tasks are draggable
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
    // Only owners can move tasks
    if (!isTaskOwner(task)) return;
    const oldStatus = task.status;
    tasks[id] = { ...task, status: newStatus };
    renderBoard();
    await update(ref(db, `tasks/${id}`), { status: newStatus });
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
  // Focus the new input
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
  const MAX_TOTAL = 10 * 1024 * 1024; // 10 MB
  const newEntries = [];
  for (const file of files) {
    const dataUrl = await readFileAsDataURL(file);
    newEntries.push({ dataUrl, name: file.name, size: file.size });
  }
  const combined = [...pendingResourceFiles, ...newEntries];
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
  if (linkResources.length) {
    pendingResourceLinks = linkResources.map(r => r.url);
    renderLinkRows();
  }
  if (fileResources.length) {
    pendingResourceFiles = fileResources.map(r => ({ dataUrl: r.url, name: r.name, size: 0 }));
    renderFileList();
  }
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

  // Collect links and files from both sections — they can coexist in one task
  const linkItems = pendingResourceLinks.map(u => u.trim()).filter(u => u)
    .map(url => {
      // Ensure URL has a protocol so browsers don't treat it as a relative path
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
    due:          document.getElementById('taskDue').value || null,
    status:       newStatus,
    assignedTo:   newAssignee,
    resources:    resources,
    // Clear legacy single-resource fields
    resourceType: null,
    resourceUrl:  null,
    resourceName: null,
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
  await remove(ref(db, `tasks/${id}`));
  await remove(ref(db, `comments/${id}`));
  delete tasks[id];
  renderBoard();
}

// ─── FILE PREVIEW ─────────────────────────────────────────────────────────────
function openFilePreview(resource) {
  const overlay  = document.getElementById('filePreviewOverlay');
  const nameEl   = document.getElementById('filePreviewName');
  const bodyEl   = document.getElementById('filePreviewBody');
  const dlBtn    = document.getElementById('filePreviewDownload');

  nameEl.textContent = resource.name || 'File';
  dlBtn.href         = resource.url;
  dlBtn.download     = resource.name || 'download';

  // Detect MIME from data URL prefix
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
  const overlay = document.getElementById('filePreviewOverlay');
  overlay.classList.remove('open');
  document.getElementById('filePreviewBody').innerHTML = '';
}

// ─── TASK DETAIL MODAL ────────────────────────────────────────────────────────
async function openDetail(id) {
  // Guard against obviously invalid IDs (empty string, literal "undefined"/"null")
  if (!id || id === 'undefined' || id === 'null') {
    showToast('This notification is not linked to a task.');
    return false;
  }
  // Primary lookup: local cache. Fallback: fetch directly from Firebase.
  let task = tasks[id];
  if (!task) {
    try {
      const snap = await get(ref(db, `tasks/${id}`));
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

  const assignee = task.assignedTo ? users[task.assignedTo] : null;
  const creator  = task.createdBy  ? users[task.createdBy]  : null;
  const overdue  = isOverdue(task.due);
  const owned    = isTaskOwner(task);

  // Build resource HTML (supports both old single-resource and new multi-resource formats)
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

  // Wire file preview buttons (rendered into innerHTML above)
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
    return `<div class="sidebar-notif-item ${n.read ? '' : 'unread'}" data-task="${n.taskId || ''}" data-id="${n.id}">
      <div class="sidebar-notif-msg">${escHtml(n.message)}</div>
      <div class="sidebar-notif-time">${time}</div>
    </div>`;
  }).join('') + (hasMore ? `<button class="sidebar-show-more" id="sidebarShowMore">Show more</button>` : '');

  body.querySelectorAll('.sidebar-notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      const taskId  = item.dataset.task;
      const notifId = item.dataset.id;
      const found   = await openDetail(taskId);
      // Auto-clean stale notifications that point to deleted tasks
      if (found === false && notifId && currentUser) {
        remove(ref(db, `notifications/${currentUser.id}/${notifId}`));
      }
      // Mark as read on successful open
      if (found && notifId && currentUser) {
        update(ref(db, `notifications/${currentUser.id}/${notifId}`), { read: true });
      }
    });
  });

  const showMoreBtn = body.querySelector('#sidebarShowMore');
  if (showMoreBtn) showMoreBtn.addEventListener('click', () => { sidebarLimit += 10; renderNotifSidebar(); });
}

// ─── HEADER NOTIFICATION PANEL ────────────────────────────────────────────────
function setupNotifListener() {
  if (notifBadgeUnsub) { notifBadgeUnsub(); notifBadgeUnsub = null; }

  const badge = document.getElementById('notifBadge');
  badge.textContent = '';
  badge.classList.remove('visible');
  document.getElementById('notifList').innerHTML = '<div class="no-notifs">No notifications yet</div>';

  if (!currentUser) return;

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
      item.addEventListener('click', async () => {
        const taskId  = item.dataset.task;
        const notifId = item.dataset.id;
        closeNotifPanel();
        const found = await openDetail(taskId);
        if (found === false && notifId && currentUser) {
          // Task no longer exists — remove the stale notification
          remove(ref(db, `notifications/${currentUser.id}/${notifId}`));
        } else if (notifId && currentUser) {
          update(ref(db, `notifications/${currentUser.id}/${notifId}`), { read: true });
        }
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
  if (newPwd)             updates.passwordHash = await hashPassword(newPwd);
  if (pendingProfilePhoto) updates.photoURL    = pendingProfilePhoto;
  updates.email = email || null;

  await update(ref(db, `users/${currentUser.id}`), updates);

  pendingProfilePhoto = null;
  closeProfile();
});

document.getElementById('deleteAccountBtn').addEventListener('click', () => {
  if (!currentUser) return;
  const hasPwd = !!currentUser.passwordHash;
  document.getElementById('deleteAccountMsg').textContent =
    `Delete your account "${currentUser.name}"? This cannot be undone.`;
  const pwdGroup = document.getElementById('deleteAccountPwdGroup');
  pwdGroup.style.display = hasPwd ? '' : 'none';
  document.getElementById('deleteAccountPwdInput').value = '';
  document.getElementById('deleteAccountPwdError').textContent = '';
  document.getElementById('deleteAccountOverlay').classList.add('open');
});

function closeDeleteAccountOverlay() {
  document.getElementById('deleteAccountOverlay').classList.remove('open');
  document.getElementById('deleteAccountPwdInput').value = '';
  document.getElementById('deleteAccountPwdError').textContent = '';
}

document.getElementById('deleteAccountOverlayClose').addEventListener('click', closeDeleteAccountOverlay);
document.getElementById('deleteAccountOverlayCancel').addEventListener('click', closeDeleteAccountOverlay);
document.getElementById('deleteAccountOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDeleteAccountOverlay(); });

document.getElementById('deleteAccountOverlayOk').addEventListener('click', async () => {
  if (!currentUser) return;
  if (currentUser.passwordHash) {
    const pwd = document.getElementById('deleteAccountPwdInput').value;
    if (!pwd) {
      document.getElementById('deleteAccountPwdError').textContent = 'Please enter your password.';
      return;
    }
    const hash = await hashPassword(pwd);
    if (hash !== currentUser.passwordHash) {
      document.getElementById('deleteAccountPwdError').textContent = 'Incorrect password.';
      return;
    }
  }
  closeDeleteAccountOverlay();
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
document.getElementById('deleteConfirmClose').addEventListener('click', closeDeleteConfirm);
document.getElementById('deleteConfirmCancel').addEventListener('click', closeDeleteConfirm);
document.getElementById('deleteConfirmOk').addEventListener('click', confirmDeleteTask);
document.getElementById('deleteConfirmOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDeleteConfirm(); });
document.getElementById('filePreviewClose').addEventListener('click', closeFilePreview);
document.getElementById('filePreviewOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeFilePreview(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDetail(); closeProfile(); closeDeleteConfirm(); closeDeleteAccountOverlay(); closeFilePreview(); } });

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
if (currentUser) {
  updateHeaderUser();
  currentUserFilter = currentUser.id;
  setupNotifListener();
} else {
  showUserOverlay();
}
