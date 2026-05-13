/* Module 5 — Administration */

const ROLE_LABELS = {
  admin: 'Administrateur',
  president: 'Président / VP',
  tresorier: 'Trésorier',
  secretaire: 'Secrétaire',
  pole_sport: 'Pôle Sport',
  pole_partenariat: 'Pôle Partenariat',
  pole_communication: 'Pôle Communication',
  pole_intercentre: 'Pôle Intercentre',
  pole_vie_campus: 'Pôle Vie de Campus',
  pole_gala: 'Pôle Gala',
};

const AVATAR_COLORS = [
  '#4F46E5','#7C3AED','#DB2777','#059669','#D97706','#0284C7','#DC2626','#16A34A'
];

let currentUser = null;
let users = [];

/* ===== Startup ===== */
async function init() {
  try {
    const r = await fetch('/api/auth/me');
    if (!r.ok) { location.href = '/'; return; }
    const { user } = await r.json();
    currentUser = user;

    if (user.role !== 'admin') {
      document.getElementById('loading-screen').classList.add('hidden');
      document.getElementById('forbidden-screen').classList.remove('hidden');
      document.getElementById('forbidden-logout').addEventListener('click', logout);
      return;
    }

    const initials = avatarInitials(user.display_name);
    document.getElementById('sidebar-avatar').textContent = initials;
    document.getElementById('sidebar-user-name').textContent = user.display_name;
    document.getElementById('sidebar-user-role').textContent = ROLE_LABELS[user.role] || user.role;

    await loadUsers();

    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('app-content').classList.remove('hidden');

    setupNav();
    setupSidebar();
    setupModals();
  } catch (e) {
    location.href = '/';
  }
}

/* ===== Navigation ===== */
function setupNav() {
  document.getElementById('nav-users').addEventListener('click', e => {
    e.preventDefault(); switchSection('users');
  });
  document.getElementById('nav-log').addEventListener('click', async e => {
    e.preventDefault(); switchSection('log'); await loadLog();
  });
  document.getElementById('mobile-menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('show');
  });
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
}

function setupSidebar() {
  document.getElementById('logout-btn').addEventListener('click', logout);
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

function switchSection(name) {
  closeSidebar();
  document.getElementById('section-users').classList.toggle('hidden', name !== 'users');
  document.getElementById('section-log').classList.toggle('hidden', name !== 'log');
  document.getElementById('nav-users').classList.toggle('active', name === 'users');
  document.getElementById('nav-log').classList.toggle('active', name === 'log');
  document.getElementById('topbar-title').textContent = name === 'users' ? 'Administration' : "Journal d'activité";
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/';
}

/* ===== Load Users ===== */
async function loadUsers() {
  const r = await fetch('/api/admin/users');
  const { users: list } = await r.json();
  users = list;
  renderStats();
  renderUsers();
}

function renderStats() {
  const total = users.length;
  const active = users.filter(u => u.is_active !== 0).length;
  const inactive = total - active;
  document.getElementById('admin-stats').innerHTML = `
    <div class="admin-stat-card">
      <div class="admin-stat-label">Comptes total</div>
      <div class="admin-stat-value">${total}</div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-label">Actifs</div>
      <div class="admin-stat-value" style="color:var(--success)">${active}</div>
    </div>
    <div class="admin-stat-card">
      <div class="admin-stat-label">Désactivés</div>
      <div class="admin-stat-value" style="color:var(--danger)">${inactive}</div>
    </div>
  `;
}

function renderUsers() {
  const grid = document.getElementById('users-grid');
  if (!users.length) {
    grid.innerHTML = '<p class="empty-state">Aucun compte trouvé.</p>';
    return;
  }
  grid.innerHTML = users.map((u, i) => {
    const initials = avatarInitials(u.display_name);
    const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const isMe = u.id === currentUser.id;
    const inactive = u.is_active === 0;
    const lastLogin = u.last_login ? formatDate(u.last_login) : 'Jamais';
    return `
      <div class="user-card${inactive ? ' inactive' : ''}">
        <div class="user-card-head">
          <div class="user-card-avatar" style="background:${color}">${initials}</div>
          <div class="user-card-info">
            <div class="user-card-name">${esc(u.display_name)}${isMe ? ' <span style="font-size:0.6875rem;background:var(--primary-light);color:var(--primary-dark);padding:1px 6px;border-radius:var(--radius-full);font-weight:700;">moi</span>' : ''}</div>
            <div class="user-card-username">@${esc(u.username)}</div>
          </div>
          ${inactive ? '<span class="status-badge inactive">Désactivé</span>' : ''}
        </div>
        <div class="user-card-meta">
          <span class="status-badge">${ROLE_LABELS[u.role] || u.role}</span>
          <span>Connexion : ${lastLogin}</span>
        </div>
        <div class="user-card-actions">
          <button class="btn btn-outline btn-sm" onclick="openEdit(${u.id})">Modifier</button>
          <button class="btn btn-outline btn-sm" onclick="openReset(${u.id})">MDP</button>
          ${!isMe ? `<button class="btn btn-danger btn-sm" onclick="openDelete(${u.id})">Supprimer</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/* ===== Load Log ===== */
async function loadLog() {
  const r = await fetch('/api/admin/log');
  const { log } = await r.json();
  const list = document.getElementById('log-list');
  if (!log.length) {
    list.innerHTML = '<p class="empty-state">Aucune activité enregistrée.</p>';
    return;
  }

  const ACTION_LABELS = {
    create_user: 'Compte créé',
    update_user: 'Compte modifié',
    delete_user: 'Compte supprimé',
    reset_password: 'MDP réinitialisé',
  };

  list.innerHTML = log.map(entry => `
    <div class="log-item">
      <span class="log-action ${entry.action}">${ACTION_LABELS[entry.action] || entry.action}</span>
      <div class="log-body">
        par <strong>${esc(entry.actor_name || '?')}</strong>
        ${entry.target_name ? ` → <strong>${esc(entry.target_name)}</strong>` : ''}
        ${entry.details ? ` <span style="color:var(--text-muted);font-size:0.75rem;">(${esc(entry.details)})</span>` : ''}
      </div>
      <span class="log-time">${formatDate(entry.created_at)}</span>
    </div>
  `).join('');
}

/* ===== Modals ===== */
function setupModals() {
  document.getElementById('new-user-btn').addEventListener('click', openCreate);
  document.getElementById('modal-create-close').addEventListener('click', () => closeModal('modal-create'));
  document.getElementById('modal-create-cancel').addEventListener('click', () => closeModal('modal-create'));
  document.getElementById('form-create').addEventListener('submit', submitCreate);

  document.getElementById('modal-edit-close').addEventListener('click', () => closeModal('modal-edit'));
  document.getElementById('modal-edit-cancel').addEventListener('click', () => closeModal('modal-edit'));
  document.getElementById('form-edit').addEventListener('submit', submitEdit);

  document.getElementById('modal-reset-close').addEventListener('click', () => closeModal('modal-reset'));
  document.getElementById('modal-reset-cancel').addEventListener('click', () => closeModal('modal-reset'));
  document.getElementById('form-reset').addEventListener('submit', submitReset);

  document.getElementById('modal-delete-close').addEventListener('click', () => closeModal('modal-delete'));
  document.getElementById('modal-delete-cancel').addEventListener('click', () => closeModal('modal-delete'));
  document.getElementById('confirm-delete-btn').addEventListener('click', submitDelete);

  document.getElementById('refresh-log-btn').addEventListener('click', loadLog);

  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.target);
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); });
  });
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function openCreate() {
  document.getElementById('form-create').reset();
  hideErr('create-error');
  openModal('modal-create');
}

function openEdit(id) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  document.getElementById('edit-id').value = u.id;
  document.getElementById('edit-username').value = u.username;
  document.getElementById('edit-display-name').value = u.display_name;
  document.getElementById('edit-role').value = u.role;
  document.getElementById('edit-active').value = u.is_active === 0 ? '0' : '1';
  hideErr('edit-error');
  openModal('modal-edit');
}

function openReset(id) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  document.getElementById('reset-id').value = u.id;
  document.getElementById('reset-name').textContent = u.display_name;
  document.getElementById('reset-password').value = '';
  hideErr('reset-error');
  openModal('modal-reset');
}

function openDelete(id) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  document.getElementById('delete-id').value = u.id;
  document.getElementById('delete-name').textContent = u.display_name;
  hideErr('delete-error');
  openModal('modal-delete');
}

/* ===== API calls ===== */
async function submitCreate(e) {
  e.preventDefault();
  const body = {
    username: document.getElementById('create-username').value.trim(),
    display_name: document.getElementById('create-display-name').value.trim(),
    role: document.getElementById('create-role').value,
    password: document.getElementById('create-password').value,
  };
  const r = await fetch('/api/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) { showErr('create-error', data.error); return; }
  closeModal('modal-create');
  toast('Compte créé avec succès.');
  await loadUsers();
}

async function submitEdit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const body = {
    username: document.getElementById('edit-username').value.trim(),
    display_name: document.getElementById('edit-display-name').value.trim(),
    role: document.getElementById('edit-role').value,
    is_active: parseInt(document.getElementById('edit-active').value, 10),
  };
  const r = await fetch(`/api/admin/users/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) { showErr('edit-error', data.error); return; }
  closeModal('modal-edit');
  toast('Compte mis à jour.');
  await loadUsers();
}

async function submitReset(e) {
  e.preventDefault();
  const id = document.getElementById('reset-id').value;
  const password = document.getElementById('reset-password').value;
  const r = await fetch(`/api/admin/users/${id}/reset-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
  });
  const data = await r.json();
  if (!r.ok) { showErr('reset-error', data.error); return; }
  closeModal('modal-reset');
  toast('Mot de passe réinitialisé.');
}

async function submitDelete() {
  const id = document.getElementById('delete-id').value;
  const r = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  const data = await r.json();
  if (!r.ok) { showErr('delete-error', data.error); return; }
  closeModal('modal-delete');
  toast('Compte supprimé.');
  await loadUsers();
}

/* ===== Helpers ===== */
function avatarInitials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function showErr(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg; el.classList.remove('hidden');
}
function hideErr(id) { document.getElementById(id).classList.add('hidden'); }

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

init();
