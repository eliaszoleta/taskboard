// ─── State ───────────────────────────────────────────────────────────────────
let tasks = [];
let editingId = null;
let draggedId = null;

// ─── Persistence ─────────────────────────────────────────────────────────────
function loadTasks() {
  try {
    tasks = JSON.parse(localStorage.getItem('taskboard-tasks') || '[]');
  } catch {
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem('taskboard-tasks', JSON.stringify(tasks));
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') < today;
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  ['todo', 'inprogress', 'done'].forEach(status => {
    const list  = document.getElementById('list-'  + status);
    const count = document.getElementById('count-' + status);
    const statusTasks = tasks.filter(t => t.status === status);

    count.textContent = statusTasks.length;
    list.innerHTML = '';

    if (statusTasks.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="icon">📋</div>
          No tasks yet
        </div>`;
    } else {
      statusTasks.forEach(task => list.appendChild(buildCard(task)));
    }
  });
}

function buildCard(task) {
  const overdue = isOverdue(task.due);

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
      ${task.due
        ? `<span class="due-date ${overdue ? 'overdue' : ''}">
             📅 ${formatDate(task.due)}${overdue ? ' · overdue' : ''}
           </span>`
        : ''}
    </div>
  `;

  // Card-level button events
  card.querySelector('.btn-icon.edit').addEventListener('click', e => {
    e.stopPropagation();
    openEdit(task.id);
  });
  card.querySelector('.btn-icon.delete').addEventListener('click', e => {
    e.stopPropagation();
    deleteTask(task.id);
  });

  // Drag events
  card.addEventListener('dragstart', e => {
    draggedId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedId = null;
  });

  return card;
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openNew(defaultStatus = 'todo') {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'New Task';
  document.getElementById('taskForm').reset();
  document.getElementById('taskStatus').value = defaultStatus;
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('taskTitle').focus();
}

function openEdit(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Task';
  document.getElementById('taskTitle').value    = task.title;
  document.getElementById('taskDesc').value     = task.desc     || '';
  document.getElementById('taskPriority').value = task.priority;
  document.getElementById('taskDue').value      = task.due      || '';
  document.getElementById('taskStatus').value   = task.status;
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('taskTitle').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingId = null;
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────
function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  render();
}

document.getElementById('taskForm').addEventListener('submit', e => {
  e.preventDefault();

  const title = document.getElementById('taskTitle').value.trim();
  if (!title) {
    document.getElementById('taskTitle').focus();
    return;
  }

  const fields = {
    title,
    desc:     document.getElementById('taskDesc').value.trim(),
    priority: document.getElementById('taskPriority').value,
    due:      document.getElementById('taskDue').value,
    status:   document.getElementById('taskStatus').value,
  };

  if (editingId) {
    const task = tasks.find(t => t.id === editingId);
    if (task) Object.assign(task, fields);
  } else {
    tasks.push({ id: uid(), createdAt: Date.now(), ...fields });
  }

  saveTasks();
  render();
  closeModal();
});

// ─── Drag & Drop on columns ───────────────────────────────────────────────────
document.querySelectorAll('.task-list').forEach(list => {
  list.addEventListener('dragover', e => {
    e.preventDefault();
    list.classList.add('drag-over');
    e.dataTransfer.dropEffect = 'move';
  });

  list.addEventListener('dragleave', e => {
    if (!list.contains(e.relatedTarget)) {
      list.classList.remove('drag-over');
    }
  });

  list.addEventListener('drop', e => {
    e.preventDefault();
    list.classList.remove('drag-over');
    if (!draggedId) return;

    const newStatus = list.id.replace('list-', '');
    const task = tasks.find(t => t.id === draggedId);
    if (task && task.status !== newStatus) {
      task.status = newStatus;
      saveTasks();
      render();
    }
  });
});

// ─── UI Events ────────────────────────────────────────────────────────────────
document.getElementById('addTaskBtn').addEventListener('click', () => openNew());
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// Close modal on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadTasks();
render();
