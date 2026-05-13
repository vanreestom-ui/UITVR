'use strict';

/* ===== Role configuration ===== */
const ROLES = {
  admin:             { label: 'Administrateur',             initials: 'AD', color: '#7C3AED', bg: '#F5F3FF' },
  president:         { label: 'Président / Vice-Président', initials: 'PR', color: '#DC2626', bg: '#FEF2F2' },
  tresorier:         { label: 'Trésorier',                  initials: 'TR', color: '#D97706', bg: '#FFFBEB' },
  secretaire:        { label: 'Secrétaire',                 initials: 'SE', color: '#0284C7', bg: '#E0F2FE' },
  pole_sport:        { label: 'Pôle Sport & Événements',    initials: 'SP', color: '#059669', bg: '#ECFDF5' },
  pole_partenariat:  { label: 'Pôle Partenariat',           initials: 'PA', color: '#7C3AED', bg: '#F5F3FF' },
  pole_communication:{ label: 'Pôle Communication',         initials: 'CO', color: '#DB2777', bg: '#FDF2F8' },
  pole_intercentre:  { label: 'Pôle Intercentre',           initials: 'IN', color: '#2563EB', bg: '#EFF6FF' },
  pole_vie_campus:   { label: 'Pôle Vie de Campus',         initials: 'VC', color: '#16A34A', bg: '#F0FDF4' },
  pole_gala:         { label: 'Pôle Gala',                  initials: 'GA', color: '#9333EA', bg: '#FAF5FF' },
};

function roleConfig(role) {
  return ROLES[role] || { label: role, initials: '?', color: '#64748B', bg: '#F1F5F9' };
}

/* ===== Bootstrap ===== */
let state = null;

async function init() {
  try {
    const res = await fetch('/api/dashboard/data', { credentials: 'include' });
    if (res.status === 401) { window.location.href = '/'; return; }
    if (!res.ok) throw new Error();
    state = await res.json();
    render();
  } catch {
    document.getElementById('loading-screen').innerHTML =
      '<p style="color:#64748B">Erreur de chargement. <a href="/" style="color:#4F46E5">Reconnectez-vous</a>.</p>';
  }
}

function render() {
  const { user, permissions, modules, accounts } = state;
  const rc = roleConfig(user.role);

  // Swap loading → content
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('dashboard-content').classList.remove('hidden');

  /* Sidebar */
  const avatar = document.getElementById('sidebar-avatar');
  avatar.textContent = rc.initials;
  avatar.style.background = `linear-gradient(135deg, ${rc.color}, ${darken(rc.color)})`;
  document.getElementById('sidebar-user-name').textContent = user.display_name;
  document.getElementById('sidebar-user-role').textContent  = rc.label;

  /* Topbar */
  document.getElementById('topbar-date').textContent = fmtDate(new Date());

  /* Welcome card */
  document.getElementById('welcome-name').textContent     = `Bonjour, ${user.display_name}`;
  document.getElementById('welcome-subtitle').textContent = `Bienvenue sur votre espace UITVR.`;
  const pill = document.getElementById('role-pill');
  pill.textContent = rc.label;
  pill.style.background = 'rgba(255,255,255,0.15)';

  const metaEl = document.getElementById('welcome-meta');
  if (user.last_login) {
    const d = new Date(user.last_login);
    metaEl.innerHTML =
      `<div>Dernière connexion</div><div style="font-weight:600;color:#fff;margin-top:2px;">${fmtDate(d)}</div>`;
  }

  /* Stats */
  renderStats(user.role);

  /* Modules */
  document.getElementById('module-list').innerHTML = modules.map(m => `
    <div class="module-item">
      <div class="mod-dot ${m.status}"></div>
      <span class="mod-name">${m.label}</span>
      <span class="mod-tag ${m.status}">${m.status === 'active' ? 'Actif' : 'Bientôt'}</span>
    </div>
  `).join('');

  /* Permissions */
  const perms = [
    { key: 'canViewAllFinances', label: 'Voir toutes les finances' },
    { key: 'canValidateEvents',  label: 'Valider les événements' },
    { key: 'canManageAccounts',  label: 'Gérer les comptes' },
    { key: 'canViewAllData',     label: 'Accès aux données globales' },
    { key: 'canViewOwnFinances', label: 'Voir son solde prévisionnel' },
  ];

  const checkSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const crossSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  document.getElementById('perm-list').innerHTML = perms.map(p => `
    <div class="perm-item">
      <div class="perm-check ${permissions[p.key] ? 'yes' : 'no'}">
        ${permissions[p.key] ? checkSVG : crossSVG}
      </div>
      <span>${p.label}</span>
    </div>
  `).join('');

  /* Admin: accounts list */
  if (user.role === 'admin' && accounts) {
    document.getElementById('admin-accounts-card').classList.remove('hidden');
    document.getElementById('account-list').innerHTML = accounts.map(a => {
      const arc = roleConfig(a.role);
      return `
        <div class="account-item">
          <div class="account-avatar" style="background:linear-gradient(135deg,${arc.color},${darken(arc.color)})">${arc.initials}</div>
          <div>
            <div class="account-name">${a.display_name}</div>
            <div class="account-username">@${a.username}</div>
          </div>
          <span class="role-badge" style="background:${arc.bg};color:${arc.color}">${arc.label}</span>
        </div>
      `;
    }).join('');
  }
}

function renderStats(role) {
  const ADMIN_ROLES   = ['admin', 'president'];
  const FINANCE_ROLES = ['admin', 'president', 'tresorier'];

  const calIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
  const msgIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  const eurIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
  const chkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

  const items = [
    { icon: calIcon, cls: 'blue',   value: '0', label: 'Événements',      note: 'Module 3 — bientôt disponible' },
    { icon: msgIcon, cls: 'purple', value: '0', label: 'Questions reçues', note: 'Module 2 — bientôt disponible' },
    {
      icon: eurIcon, cls: 'green',
      value: '—',
      label: FINANCE_ROLES.includes(role) ? 'Solde global' : 'Solde prévisionnel',
      note: 'Module 4 — bientôt disponible',
    },
  ];

  if (ADMIN_ROLES.includes(role)) {
    items.push({ icon: chkIcon, cls: 'amber', value: '0', label: 'En attente de validation', note: 'Module 3 — bientôt disponible' });
  }

  document.getElementById('stats-grid').innerHTML = items.map(s => `
    <div class="stat-card">
      <div class="stat-icon ${s.cls}">${s.icon}</div>
      <div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
        <div class="stat-note">${s.note}</div>
      </div>
    </div>
  `).join('');
}

/* ===== Helpers ===== */
function fmtDate(d) {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function darken(hex) {
  // Slightly darken a hex colour for gradient ends
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 30);
  const g = Math.max(0, ((n >> 8) & 0xff) - 30);
  const b = Math.max(0, (n & 0xff) - 30);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* ===== Event listeners ===== */
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  window.location.href = '/';
});

document.getElementById('mobile-menu-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
});

document.getElementById('sidebar-overlay').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
});

init();
