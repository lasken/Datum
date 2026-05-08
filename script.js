/* ════════════════════════════════════════════════════════
   TASKFLOW v2 — app.js
   Sections:
   1.  CONFIG & SUPABASE
   2.  STATE
   3.  HELPERS
   4.  INIT
   5.  AUTH — LOGIN / LOGOUT
   6.  CLOCK
   7.  ADMIN — RENDER TASKS
   8.  ADMIN — TASK ACTIONS
   9.  ADMIN — MEMBERS
   10. ADMIN — ACTIVITY LOG
   11. ADMIN — NAV
   12. MEMBER — RENDER & NAV
   13. MEMBER — TASK ACTIONS
   14. MODAL HELPERS
   15. FILTER CHIPS
   16. TOAST
════════════════════════════════════════════════════════ */


/* ── 1. CONFIG & SUPABASE ──────────────────────────── */
const SUPABASE_URL  = 'https://pphuibtoaeqtoxfvdfyl.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwaHVpYnRvYWVxdG94ZnZkZnlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjgwOTAsImV4cCI6MjA5MzgwNDA5MH0.nviWHxwCfjy0_8eZXPDnFQ7Y0sef41__VamgeZhiiZs';

// Lightweight Supabase REST wrapper
const db = {
  async query(table, params = '') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
      }
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async insert(table, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async update(table, match, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${match}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async delete(table, match) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${match}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
      },
    });
    if (!r.ok) throw new Error(await r.text());
  },
};


/* ── 2. STATE ──────────────────────────────────────── */
let currentUser   = null;   // { id, username, display_name, role, whatsapp_number }
let tasks         = [];
let members       = [];
let activityLog   = [];
let editingTaskId = null;
let currentPriority = 'all';


/* ── 3. HELPERS ────────────────────────────────────── */
function $(id)   { return document.getElementById(id); }
function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateStr(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTimeStr(s) {
  // "HH:MM:SS" or "HH:MM" → "HH:MM"
  if (!s) return '';
  return s.slice(0, 5);
}
function isOverdue(task) {
  if (!task.due_date || task.status === 'done') return false;
  const [y, m, d] = task.due_date.split('-').map(Number);
  return new Date(y, m - 1, d) < new Date(new Date().toDateString());
}
function avatarColor(name) {
  const colors = ['#6c63ff','#22c55e','#f59e0b','#3b82f6','#ef4444','#ec4899','#06b6d4','#8b5cf6'];
  let h = 0;
  for (const c of (name || '?')) h = (h + c.charCodeAt(0)) % colors.length;
  return colors[h];
}
function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function timeAgo(ts) {
  if (!ts) return 'Never logged in';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return fmtDate(ts);
}
function isOnline(ts) {
  if (!ts) return false;
  return Date.now() - new Date(ts).getTime() < 5 * 60 * 1000; // 5 min
}
function groupByDay(list) {
  const groups = {};
  list.forEach(a => {
    const key = new Date(a.timestamp).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  });
  return groups;
}
function buildWaLink(number, message) {
  const clean = (number || '').replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}
function buildWaMessage(task, member) {
  const priority = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
  const lines = [
    `Hi ${member.display_name},`,
    ``,
    `You've been assigned a new task:`,
    ``,
    `*${task.title}*`,
    task.description ? `${task.description}` : null,
    ``,
    task.due_date   ? `Due: ${fmtDateStr(task.due_date)}` : null,
    task.start_time ? `Start: ${fmtTimeStr(task.start_time)}` : null,
    task.end_time   ? `End: ${fmtTimeStr(task.end_time)}` : null,
    `Priority: ${priority}`,
    ``,
    `Log in to TaskFlow to get started.`,
  ].filter(l => l !== null);
  return lines.join('\n');
}

function emptyState(msg) {
  return `<div class="empty-state">
    <div class="empty-icon"><i class="fa-regular fa-clipboard"></i></div>
    <div class="empty-title">Nothing here yet</div>
    <div class="empty-msg">${msg}</div>
  </div>`;
}

function priorityBadge(p) {
  const map = {
    high:   ['badge-red',   '<i class="fa-solid fa-circle-exclamation"></i> High'],
    medium: ['badge-amber', '<i class="fa-solid fa-circle-minus"></i> Medium'],
    low:    ['badge-green', '<i class="fa-solid fa-circle-dot"></i> Low'],
  };
  const [cls, lbl] = map[p] || ['badge-gray', p];
  return `<span class="badge ${cls}">${lbl}</span>`;
}
function statusBadge(s) {
  const map = {
    pending: ['badge-blue',  '<i class="fa-regular fa-clock"></i> Pending'],
    ongoing: ['badge-amber', '<i class="fa-solid fa-rotate"></i> Ongoing'],
    done:    ['badge-green', '<i class="fa-solid fa-circle-check"></i> Done'],
  };
  const [cls, lbl] = map[s] || ['badge-gray', s];
  return `<span class="badge ${cls}">${lbl}</span>`;
}
function memberTag(username) {
  const m = members.find(x => x.username === username);
  if (!m) return username ? `<span class="member-tag">${username}</span>` : '';
  const col = avatarColor(m.display_name);
  return `<span class="member-tag">
    <span class="member-avatar" style="background:${col}">${initials(m.display_name)}</span>
    ${m.display_name}
  </span>`;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}
function showView(viewId, navParent) {
  $(navParent).querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(viewId).classList.add('active');
}


/* ── 4. INIT ───────────────────────────────────────── */
async function init() {
  // Restore session from localStorage
  const saved = localStorage.getItem('tf_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    await loadAll();
    if (currentUser.role === 'admin') {
      showScreen('screen-admin');
      startClock();
      updateAdminCounts();
      renderAdminTasks();
      renderMembers();
    } else {
      await updateLastSeen();
      showScreen('screen-member');
      startClock();
      renderMemberTasks();
      $('member-greeting').textContent = `Hi, ${currentUser.display_name}`;
    }
  } else {
    showScreen('screen-login');
  }
  hideLoading();

  // Enter key on login
  $('login-pin').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('login-username').addEventListener('keydown', e => { if (e.key === 'Enter') $('login-pin').focus(); });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', function () {
      currentPriority = this.dataset.priority || 'all';
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      renderAdminTasks();
    });
  });

  // Esc closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('modal-task');
      closeModal('modal-member');
    }
  });
}

async function loadAll() {
  try {
    [tasks, members, activityLog] = await Promise.all([
      db.query('tasks', '?order=created_at.desc'),
      db.query('users', '?role=eq.member&order=display_name.asc'),
      db.query('activity_log', '?order=timestamp.desc&limit=200'),
    ]);
  } catch (e) {
    console.error('Load error:', e);
  }
}

function hideLoading() {
  const el = $('loading-overlay');
  el.classList.add('hidden');
  setTimeout(() => el.style.display = 'none', 400);
}


/* ── 5. AUTH ───────────────────────────────────────── */
async function doLogin() {
  const username = $('login-username').value.trim().toLowerCase();
  const pin      = $('login-pin').value.trim();
  const errEl    = $('login-error');

  if (!username || !pin) {
    errEl.textContent = 'Please enter your username and PIN.';
    errEl.classList.add('show');
    return;
  }

  $('login-btn').disabled = true;
  $('login-btn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…';

  try {
    const rows = await db.query('users', `?username=eq.${encodeURIComponent(username)}&pin=eq.${encodeURIComponent(pin)}`);
    if (!rows.length) {
      errEl.textContent = 'Invalid username or PIN. Try again.';
      errEl.classList.add('show');
      $('login-btn').disabled = false;
      $('login-btn').innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In';
      return;
    }

    currentUser = rows[0];
    localStorage.setItem('tf_user', JSON.stringify(currentUser));
    errEl.classList.remove('show');

    await loadAll();

    if (currentUser.role === 'admin') {
      showScreen('screen-admin');
      startClock();
      updateAdminCounts();
      renderAdminTasks();
      renderMembers();
    } else {
      await updateLastSeen();
      showScreen('screen-member');
      startClock();
      renderMemberTasks();
      $('member-greeting').textContent = `Hi, ${currentUser.display_name}`;
    }

  } catch (e) {
    errEl.textContent = 'Connection error. Please try again.';
    errEl.classList.add('show');
    console.error(e);
  }

  $('login-btn').disabled = false;
  $('login-btn').innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In';
}

async function updateLastSeen() {
  try {
    await db.update('users', `id=eq.${currentUser.id}`, { last_seen: new Date().toISOString() });
  } catch (e) { console.error(e); }
}

function doLogout() {
  currentUser = null;
  localStorage.removeItem('tf_user');
  tasks = []; members = []; activityLog = [];
  $('login-username').value = '';
  $('login-pin').value = '';
  showScreen('screen-login');
}


/* ── 6. CLOCK ──────────────────────────────────────── */
function startClock() {
  function tick() {
    const now  = new Date();
    const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    ['admin', 'member'].forEach(k => {
      const d = $(`date-text-${k}`); const t = $(`time-text-${k}`);
      if (d) d.textContent = date;
      if (t) t.textContent = time;
    });
  }
  tick();
  setInterval(tick, 30000);
}


/* ── 7. ADMIN — RENDER TASKS ───────────────────────── */
function taskCard(t, isAdmin = true) {
  const isDone   = t.status === 'done';
  const overdue  = isOverdue(t);
  const member   = members.find(m => m.username === t.assigned_to);

  let datesHtml = '';
  if (t.start_time) datesHtml += `<div class="task-date start"><i class="fa-regular fa-clock"></i> Start: ${fmtTimeStr(t.start_time)}</div>`;
  if (t.end_time)   datesHtml += `<div class="task-date"><i class="fa-solid fa-flag-checkered"></i> End: ${fmtTimeStr(t.end_time)}</div>`;
  if (t.due_date)   datesHtml += `<div class="task-date"><i class="fa-regular fa-calendar"></i> Due: ${fmtDateStr(t.due_date)}</div>`;
  if (isDone && t.completed_at) datesHtml += `<div class="task-date done-at"><i class="fa-solid fa-circle-check"></i> Done: ${fmtDate(t.completed_at)} ${fmtTime(t.completed_at)}</div>`;

  // WhatsApp send button
  let waHtml = '';
  if (isAdmin && member && member.whatsapp_number) {
    const msg = buildWaMessage(t, member);
    waHtml = `<a class="btn-wa" href="${buildWaLink(member.whatsapp_number, msg)}" target="_blank" title="Send via WhatsApp">
      <i class="fa-brands fa-whatsapp"></i> Notify
    </a>`;
  }

  // Admin shows edit/delete; member only shows status change
  let actionsHtml = '';
  if (isAdmin) {
    actionsHtml = `
      ${waHtml}
      <button class="icon-btn" onclick="openEditTask('${t.id}')" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
      <button class="icon-btn danger" onclick="deleteTask('${t.id}')" title="Delete"><i class="fa-solid fa-trash-can"></i></button>`;
  } else {
    if (!isDone) {
      if (t.status === 'pending') {
        actionsHtml = `<button class="btn btn-ghost" style="font-size:12px;padding:5px 10px" onclick="memberUpdateStatus('${t.id}','ongoing')">
          <i class="fa-solid fa-rotate"></i> Start
        </button>`;
      }
      actionsHtml += `<button class="btn btn-green" style="font-size:12px;padding:5px 10px" onclick="memberUpdateStatus('${t.id}','done')">
        <i class="fa-solid fa-circle-check"></i> Done
      </button>`;
    } else {
      actionsHtml = `<button class="btn btn-ghost" style="font-size:12px;padding:5px 10px" onclick="memberUpdateStatus('${t.id}','pending')">
        <i class="fa-solid fa-rotate-left"></i> Undo
      </button>`;
    }
  }

  return `<div class="task-card ${isDone ? 'done' : ''} priority-${t.priority}" id="tc-${t.id}">
    <div class="task-check" onclick="${isAdmin ? `adminToggleDone('${t.id}')` : `memberUpdateStatus('${t.id}','${isDone ? 'pending' : 'done'}')`}" title="${isDone ? 'Mark incomplete' : 'Mark complete'}">
      <i class="fa-solid fa-check"></i>
    </div>
    <div class="task-body">
      <div class="task-name">${t.title}</div>
      <div class="task-meta">
        ${t.description ? `<span class="task-desc">${t.description}</span>` : ''}
        ${statusBadge(t.status)}
        ${priorityBadge(t.priority)}
        ${memberTag(t.assigned_to)}
        ${overdue ? `<span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i> Overdue</span>` : ''}
      </div>
    </div>
    <div class="task-right">
      <div class="task-dates">${datesHtml}</div>
      <div class="task-actions">${actionsHtml}</div>
    </div>
  </div>`;
}

function getFilteredTasks(status = 'all') {
  const search = ($('search-all') || {}).value?.toLowerCase() || '';
  return tasks.filter(t => {
    if (status !== 'all' && t.status !== status) return false;
    if (currentPriority !== 'all' && t.priority !== currentPriority) return false;
    if (search && !t.title.toLowerCase().includes(search) && !(t.description || '').toLowerCase().includes(search)) return false;
    return true;
  });
}

function renderAdminTasks() {
  $('list-all').innerHTML     = (() => { const f = getFilteredTasks('all'); return f.length ? f.map(t => taskCard(t,true)).join('') : emptyState('No tasks yet — create the first one!'); })();
  $('list-pending').innerHTML = (() => { const f = tasks.filter(t=>t.status==='pending'); return f.length ? f.map(t => taskCard(t,true)).join('') : emptyState('No pending tasks'); })();
  $('list-ongoing').innerHTML = (() => { const f = tasks.filter(t=>t.status==='ongoing'); return f.length ? f.map(t => taskCard(t,true)).join('') : emptyState('No ongoing tasks'); })();
  $('list-done').innerHTML    = (() => { const f = tasks.filter(t=>t.status==='done'); return f.length ? f.map(t => taskCard(t,true)).join('') : emptyState('No completed tasks yet'); })();
  updateAdminStats();
  updateAdminCounts();
}

function updateAdminStats() {
  const total   = tasks.length;
  const done    = tasks.filter(t => t.status === 'done').length;
  const ongoing = tasks.filter(t => t.status === 'ongoing').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const pct     = total ? Math.round((done / total) * 100) : 0;
  $('s-total').textContent   = total;
  $('s-done').textContent    = done;
  $('s-active').textContent  = ongoing;
  $('s-pending').textContent = pending;
  $('progress-pct').textContent  = pct + '%';
  $('progress-fill').style.width = pct + '%';
  $('sub-all').textContent = total ? `${done} of ${total} tasks completed` : 'Track every task across your team';
}

function updateAdminCounts() {
  $('cnt-all').textContent     = tasks.length;
  $('cnt-pending').textContent = tasks.filter(t => t.status === 'pending').length;
  $('cnt-ongoing').textContent = tasks.filter(t => t.status === 'ongoing').length;
  $('cnt-done').textContent    = tasks.filter(t => t.status === 'done').length;
  $('cnt-members').textContent = members.length;
}


/* ── 8. ADMIN — TASK ACTIONS ───────────────────────── */
function openTaskModal() {
  editingTaskId = null;
  $('task-modal-title').textContent = 'New Task';
  $('f-title').value    = '';
  $('f-desc').value     = '';
  $('f-status').value   = 'pending';
  $('f-priority').value = 'medium';
  $('f-due').value      = '';
  $('f-start').value    = '';
  $('f-end').value      = '';
  populateAssigneeSelect();
  openModal('modal-task');
  setTimeout(() => $('f-title').focus(), 120);
}

function openEditTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  editingTaskId = id;
  $('task-modal-title').textContent = 'Edit Task';
  $('f-title').value    = t.title;
  $('f-desc').value     = t.description || '';
  $('f-status').value   = t.status === 'done' ? 'pending' : t.status;
  $('f-priority').value = t.priority;
  $('f-due').value      = t.due_date || '';
  $('f-start').value    = t.start_time ? t.start_time.slice(0,5) : '';
  $('f-end').value      = t.end_time   ? t.end_time.slice(0,5)   : '';
  populateAssigneeSelect(t.assigned_to);
  openModal('modal-task');
}

function populateAssigneeSelect(selected = '') {
  const sel = $('f-assignee');
  sel.innerHTML = `<option value="">— Unassigned —</option>` +
    members.map(m => `<option value="${m.username}" ${m.username === selected ? 'selected' : ''}>${m.display_name}</option>`).join('');
}

async function saveTask() {
  const title = $('f-title').value.trim();
  if (!title) { $('f-title').focus(); return; }

  const payload = {
    title,
    description: $('f-desc').value.trim() || null,
    status:      $('f-status').value,
    priority:    $('f-priority').value,
    assigned_to: $('f-assignee').value || null,
    due_date:    $('f-due').value   || null,
    start_time:  $('f-start').value || null,
    end_time:    $('f-end').value   || null,
  };

  try {
    if (editingTaskId) {
      const [updated] = await db.update('tasks', `id=eq.${editingTaskId}`, payload);
      tasks = tasks.map(t => t.id === editingTaskId ? updated : t);
      await logActivity(editingTaskId, 'updated', currentUser.username);
      showToast('Task updated');
    } else {
      payload.created_by = currentUser.username;
      const [created] = await db.insert('tasks', payload);
      tasks.unshift(created);
      await logActivity(created.id, 'created', currentUser.username, `Task "${created.title}" created`);
      showToast('Task created');
    }
    renderAdminTasks();
    closeModal('modal-task');
  } catch (e) {
    console.error(e);
    showToast('Error saving task');
  }
}

async function adminToggleDone(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  const newStatus = t.status === 'done' ? 'pending' : 'done';
  const patch     = { status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString() : null };
  try {
    const [updated] = await db.update('tasks', `id=eq.${id}`, patch);
    tasks = tasks.map(x => x.id === id ? updated : x);
    await logActivity(id, newStatus === 'done' ? 'completed' : 'restored', currentUser.username);
    renderAdminTasks();
    showToast(newStatus === 'done' ? 'Task completed!' : 'Task restored');
  } catch (e) { console.error(e); }
}

async function deleteTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t || !confirm(`Delete "${t.title}"?`)) return;
  try {
    await logActivity(id, 'deleted', currentUser.username, `Task "${t.title}" deleted`);
    await db.delete('tasks', `id=eq.${id}`);
    tasks = tasks.filter(x => x.id !== id);
    renderAdminTasks();
    showToast('Task deleted');
  } catch (e) { console.error(e); }
}


/* ── 9. ADMIN — MEMBERS ────────────────────────────── */
function renderMembers() {
  const grid = $('member-grid');
  if (!members.length) {
    grid.innerHTML = emptyState('No members yet — add your first team member!');
    return;
  }
  grid.innerHTML = members.map(m => {
    const myTasks   = tasks.filter(t => t.assigned_to === m.username);
    const total     = myTasks.length;
    const done      = myTasks.filter(t => t.status === 'done').length;
    const ongoing   = myTasks.filter(t => t.status === 'ongoing').length;
    const pct       = total ? Math.round((done / total) * 100) : 0;
    const col       = avatarColor(m.display_name);
    const online    = isOnline(m.last_seen);
    const waLink    = m.whatsapp_number
      ? buildWaLink(m.whatsapp_number, `Hi ${m.display_name}, checking in from TaskFlow 👋`)
      : '';

    return `<div class="member-card">
      <div class="mc-top">
        <div class="mc-avatar" style="background:${col}">${initials(m.display_name)}</div>
        <div class="mc-info">
          <div class="mc-name">${m.display_name}</div>
          <div class="mc-username">@${m.username}</div>
        </div>
      </div>
      <div class="mc-stats">
        <div class="mc-stat"><div class="mc-stat-val">${total}</div><div class="mc-stat-lbl">Tasks</div></div>
        <div class="mc-stat"><div class="mc-stat-val" style="color:var(--green)">${done}</div><div class="mc-stat-lbl">Done</div></div>
        <div class="mc-stat"><div class="mc-stat-val" style="color:var(--amber)">${ongoing}</div><div class="mc-stat-lbl">Active</div></div>
      </div>
      <div class="mc-last-seen ${online ? 'mc-online' : ''}">
        <i class="fa-solid fa-circle" style="font-size:7px"></i>
        ${online ? 'Online now' : 'Last seen: ' + timeAgo(m.last_seen)}
      </div>
      <div class="mc-progress"><div class="mc-progress-fill" style="width:${pct}%"></div></div>
      <div class="mc-footer">
        ${waLink ? `<a class="mc-wa-btn" href="${waLink}" target="_blank"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>` : '<span style="font-size:12px;color:var(--text3)">No WhatsApp</span>'}
        <button class="mc-delete-btn" onclick="deleteMember('${m.id}','${m.username}')" title="Remove member"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    </div>`;
  }).join('');
}

function openMemberModal() {
  $('m-name').value     = '';
  $('m-username').value = '';
  $('m-whatsapp').value = '';
  $('m-pin').value      = '';
  $('member-error').classList.remove('show');
  openModal('modal-member');
  setTimeout(() => $('m-name').focus(), 120);
}

async function saveMember() {
  const name     = $('m-name').value.trim();
  const username = $('m-username').value.trim().toLowerCase().replace(/\s+/g, '_');
  const whatsapp = $('m-whatsapp').value.trim();
  const pin      = $('m-pin').value.trim();
  const errEl    = $('member-error');

  if (!name || !username || !pin) {
    errEl.textContent = 'Name, username and PIN are required.';
    errEl.classList.add('show'); return;
  }
  if (pin.length !== 4 || !/^\d+$/.test(pin)) {
    errEl.textContent = 'PIN must be exactly 4 digits.';
    errEl.classList.add('show'); return;
  }
  if (members.find(m => m.username === username)) {
    errEl.textContent = 'That username is already taken.';
    errEl.classList.add('show'); return;
  }

  try {
    const [created] = await db.insert('users', {
      display_name: name, username, whatsapp_number: whatsapp || null,
      pin, role: 'member',
    });
    members.push(created);
    updateAdminCounts();
    renderMembers();
    closeModal('modal-member');
    showToast(`${name} added to the team!`);
  } catch (e) {
    errEl.textContent = 'Error adding member. Username may already exist.';
    errEl.classList.add('show');
    console.error(e);
  }
}

async function deleteMember(id, username) {
  const m = members.find(x => x.id === id);
  if (!m || !confirm(`Remove ${m.display_name} from the team? Their tasks will remain.`)) return;
  try {
    await db.delete('users', `id=eq.${id}`);
    members = members.filter(x => x.id !== id);
    updateAdminCounts();
    renderMembers();
    showToast('Member removed');
  } catch (e) { console.error(e); }
}


/* ── 10. ADMIN — ACTIVITY LOG ──────────────────────── */
async function logActivity(taskId, action, performedBy, note = '') {
  try {
    const [entry] = await db.insert('activity_log', {
      task_id: taskId, action, performed_by: performedBy, note,
    });
    activityLog.unshift(entry);
    renderHistory();
  } catch (e) { console.error(e); }
}

function renderHistory() {
  const container = $('history-container');
  if (!container) return;
  if (!activityLog.length) {
    container.innerHTML = emptyState('No activity yet — start by creating a task!');
    return;
  }
  const dotMap = { completed:'dot-green', created:'dot-blue', updated:'dot-amber', deleted:'dot-red', restored:'dot-blue' };
  const msgMap = (a) => {
    const taskTitle = (tasks.find(t=>t.id===a.task_id)||{}).title || a.note || 'a task';
    const map = {
      completed: `<strong>${taskTitle}</strong> marked as completed by ${a.performed_by}`,
      created:   `New task <strong>${taskTitle}</strong> created by ${a.performed_by}`,
      updated:   `<strong>${taskTitle}</strong> was updated by ${a.performed_by}`,
      deleted:   a.note || `A task was deleted by ${a.performed_by}`,
      restored:  `<strong>${taskTitle}</strong> restored by ${a.performed_by}`,
    };
    return map[a.action] || a.note || a.action;
  };
  const groups = groupByDay(activityLog);
  container.innerHTML = Object.entries(groups).map(([day, items]) => `
    <div class="activity-day">
      <div class="activity-day-label">${day}</div>
      <div class="activity-list">
        ${items.map(a => `<div class="activity-item">
          <div class="activity-dot ${dotMap[a.action]||'dot-blue'}"></div>
          <div class="activity-content">
            <div class="activity-text">${msgMap(a)}</div>
            <div class="activity-time"><i class="fa-regular fa-clock" style="font-size:10px"></i> ${fmtTime(a.timestamp)}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>`).join('');
}

async function clearHistory() {
  if (!confirm('Clear all activity history?')) return;
  try {
    await db.delete('activity_log', 'id=neq.00000000-0000-0000-0000-000000000000');
    activityLog = [];
    renderHistory();
    showToast('Activity log cleared');
  } catch (e) { console.error(e); }
}


/* ── 11. ADMIN — NAV ───────────────────────────────── */
function adminNav(view, el) {
  document.querySelectorAll('#screen-admin .nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('#screen-admin .view').forEach(v => v.classList.remove('active'));
  $(`view-${view}`).classList.add('active');
  if (view === 'history') { loadAll().then(renderHistory); }
  if (view === 'members') { loadAll().then(() => renderMembers()); }
}


/* ── 12. MEMBER — RENDER & NAV ─────────────────────── */
function renderMemberTasks() {
  const myTasks = tasks.filter(t => t.assigned_to === currentUser.username);
  const total   = myTasks.length;
  const done    = myTasks.filter(t => t.status === 'done').length;
  const ongoing = myTasks.filter(t => t.status === 'ongoing').length;
  const pending = myTasks.filter(t => t.status === 'pending').length;

  $('my-s-total').textContent   = total;
  $('my-s-done').textContent    = done;
  $('my-s-ongoing').textContent = ongoing;
  $('my-s-pending').textContent = pending;
  $('my-cnt-all').textContent     = total;
  $('my-cnt-pending').textContent = pending;
  $('my-cnt-ongoing').textContent = ongoing;
  $('my-cnt-done').textContent    = done;

  const all     = myTasks;
  const pend    = myTasks.filter(t => t.status === 'pending');
  const ong     = myTasks.filter(t => t.status === 'ongoing');
  const comp    = myTasks.filter(t => t.status === 'done');

  $('list-my-all').innerHTML     = all.length     ? all.map(t => taskCard(t, false)).join('') : emptyState("You're all caught up!");
  $('list-my-pending').innerHTML = pend.length    ? pend.map(t => taskCard(t, false)).join('') : emptyState('No pending tasks');
  $('list-my-ongoing').innerHTML = ong.length     ? ong.map(t => taskCard(t, false)).join('') : emptyState('Nothing in progress');
  $('list-my-done').innerHTML    = comp.length    ? comp.map(t => taskCard(t, false)).join('') : emptyState("No completed tasks yet — let's go!");

  $('member-page-sub').textContent = total
    ? `${done} of ${total} tasks completed`
    : 'No tasks assigned yet';
}

function memberNav(view, el) {
  document.querySelectorAll('#screen-member .nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('#screen-member .view').forEach(v => v.classList.remove('active'));
  $(`view-${view}`).classList.add('active');
}


/* ── 13. MEMBER — TASK ACTIONS ─────────────────────── */
async function memberUpdateStatus(id, newStatus) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  const patch = {
    status: newStatus,
    completed_at: newStatus === 'done' ? new Date().toISOString() : null,
  };
  try {
    const [updated] = await db.update('tasks', `id=eq.${id}`, patch);
    tasks = tasks.map(x => x.id === id ? updated : x);
    await logActivity(id, newStatus === 'done' ? 'completed' : 'updated', currentUser.username);
    renderMemberTasks();
    showToast(newStatus === 'done' ? 'Task marked done!' : `Task moved to ${newStatus}`);
  } catch (e) { console.error(e); }
}


/* ── 14. MODAL HELPERS ─────────────────────────────── */
function openModal(id)  { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
function closeModalOutside(e, id) {
  if (e.target === $(id)) closeModal(id);
}


/* ── 15. FILTER CHIPS ──────────────────────────────── */
// Bound in init()


/* ── 16. TOAST ─────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}


/* ── BOOT ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);