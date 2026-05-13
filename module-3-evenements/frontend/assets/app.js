'use strict';

const ROLES = {
  admin:             { label: 'Admin',          short: 'AD', color: '#7C3AED', bg: '#F5F3FF' },
  president:         { label: 'Présidence',     short: 'PR', color: '#DC2626', bg: '#FEF2F2' },
  tresorier:         { label: 'Trésorerie',     short: 'TR', color: '#D97706', bg: '#FFFBEB' },
  secretaire:        { label: 'Secrétariat',    short: 'SE', color: '#0284C7', bg: '#E0F2FE' },
  pole_sport:        { label: 'Sport',          short: 'SP', color: '#059669', bg: '#ECFDF5' },
  pole_partenariat:  { label: 'Partenariat',    short: 'PA', color: '#7C3AED', bg: '#F5F3FF' },
  pole_communication:{ label: 'Communication',  short: 'CO', color: '#DB2777', bg: '#FDF2F8' },
  pole_intercentre:  { label: 'Intercentre',    short: 'IN', color: '#2563EB', bg: '#EFF6FF' },
  pole_vie_campus:   { label: 'Vie campus',     short: 'VC', color: '#16A34A', bg: '#F0FDF4' },
  pole_gala:         { label: 'Gala',           short: 'GA', color: '#9333EA', bg: '#FAF5FF' },
};

const STATUS_LABEL = {
  draft: 'Brouillon', pending: 'En attente', validated: 'Validé', rejected: 'Refusé',
};

let me = null;
let isAdmin = false;
let openEventId = null;
let currentFilter = 'all';

const $ = (id) => document.getElementById(id);
const roleCfg = (r) => ROLES[r] || { label: r, short: '?', color: '#64748B', bg: '#F1F5F9' };

function darken(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 30);
  const g = Math.max(0, ((n >> 8) & 0xff) - 30);
  const b = Math.max(0, (n & 0xff) - 30);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function fmtMoney(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtAgo(iso) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s/60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s/3600)} h`;
  if (s < 86400*7) return `il y a ${Math.floor(s/86400)} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast ' + type;
  setTimeout(() => t.classList.add('hidden'), 2500);
}

/* ===== Init ===== */
async function init() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (!r.ok) { window.location.href = '/'; return; }
    me = (await r.json()).user;
  } catch { window.location.href = '/'; return; }

  isAdmin = ['admin', 'president'].includes(me.role);
  $('loading-screen').classList.add('hidden');
  $('app-content').classList.remove('hidden');

  const rc = roleCfg(me.role);
  const av = $('sidebar-avatar');
  av.textContent = rc.short;
  av.style.background = `linear-gradient(135deg, ${rc.color}, ${darken(rc.color)})`;
  $('sidebar-user-name').textContent = me.display_name;
  $('sidebar-user-role').textContent = rc.label;

  if (isAdmin) $('filter-pending').classList.remove('hidden');

  await loadEvents();
}

async function loadEvents() {
  const res = await fetch(`/api/events?filter=${currentFilter}`, { credentials: 'include' });
  const data = await res.json();
  const events = data.events;

  $('event-empty').classList.toggle('hidden', events.length > 0);
  $('event-list').innerHTML = events.map(renderEventCard).join('');

  $('event-list').querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, a, input, textarea, select, form')) return;
      const id = parseInt(card.dataset.id, 10);
      toggleEvent(id);
    });
  });

  if (openEventId) {
    const card = $('event-list').querySelector(`[data-id="${openEventId}"]`);
    if (card) await loadEventDetail(openEventId);
  }
}

function renderEventCard(e) {
  const rc = roleCfg(e.organizer_role);
  const isOwn = e.organizer_role === me.role;
  const balance = e.total_revenue != null ? e.total_revenue - e.total_expense : null;
  return `
    <div class="item-card" data-id="${e.id}">
      <div class="item-head">
        <div style="flex:1;min-width:0;">
          <div class="item-title">${esc(e.name)}</div>
          <div class="item-meta">
            <span class="role-chip" style="background:${rc.bg};color:${rc.color}">${rc.label}</span>
            <span class="item-meta-item">${fmtDate(e.event_date)}</span>
            ${isOwn ? '<span class="item-meta-item">· vous</span>' : ''}
          </div>
          ${e.simplified
            ? '<div class="item-meta"><span style="color:var(--text-light);">Détails financiers réservés à l’organisateur</span></div>'
            : `<div class="item-meta">
                <span class="item-meta-item">${e.line_count} ligne${e.line_count > 1 ? 's' : ''}</span>
                <span class="item-meta-item">·</span>
                <span class="item-meta-item" style="color:var(--danger);font-weight:600;">${fmtMoney(e.total_expense)} dépenses</span>
                <span class="item-meta-item">·</span>
                <span class="item-meta-item" style="color:var(--success);font-weight:600;">${fmtMoney(e.total_revenue)} revenus</span>
                ${balance != null ? `<span class="item-meta-item">· solde <strong style="color:${balance >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmtMoney(balance)}</strong></span>` : ''}
              </div>`}
        </div>
        <span class="status-badge ${e.status}">${STATUS_LABEL[e.status]}</span>
      </div>
      ${e.description ? `<div class="item-body">${esc(e.description)}</div>` : ''}
      ${openEventId === e.id ? `<div id="detail-${e.id}" class="event-detail"><div style="color:var(--text-light)">Chargement…</div></div>` : ''}
    </div>
  `;
}

async function toggleEvent(id) {
  openEventId = openEventId === id ? null : id;
  await loadEvents();
  if (openEventId === id) await loadEventDetail(id);
}

async function loadEventDetail(id) {
  const res = await fetch(`/api/events/${id}`, { credentials: 'include' });
  const data = await res.json();
  const detail = $(`detail-${id}`);
  if (!detail) return;

  const { event, lines, summary, simplified } = data;
  const isOwn = event.organizer_role === me.role;
  const canEdit = (isOwn && ['draft', 'rejected'].includes(event.status)) || isAdmin;
  const canSubmit = (isOwn && ['draft', 'rejected'].includes(event.status));
  const canValidate = isAdmin && event.status === 'pending';
  const canDelete = canEdit;

  if (simplified) {
    detail.innerHTML = `
      <div class="simplified-notice">Cet événement validé est visible mais ses détails financiers sont réservés à l'organisateur et à la présidence.</div>
    `;
    return;
  }

  detail.innerHTML = `
    <div class="event-summary">
      <div class="summary-tile expense">
        <div class="summary-tile-label">Dépenses</div>
        <div class="summary-tile-value">${fmtMoney(summary.expense)}</div>
      </div>
      <div class="summary-tile revenue">
        <div class="summary-tile-label">Revenus</div>
        <div class="summary-tile-value">${fmtMoney(summary.revenue)}</div>
      </div>
      <div class="summary-tile balance ${summary.balance >= 0 ? 'positive' : 'negative'}">
        <div class="summary-tile-label">Solde</div>
        <div class="summary-tile-value">${fmtMoney(summary.balance)}</div>
      </div>
    </div>

    ${event.validation_comment ? `
      <div class="validation-comment ${event.status}">
        <strong>${event.status === 'rejected' ? 'Motif du refus' : 'Commentaire de validation'} :</strong>
        ${esc(event.validation_comment)}
        ${event.validator_name ? `<div style="margin-top:0.25rem;opacity:0.8;font-size:0.75rem;">— ${esc(event.validator_name)}</div>` : ''}
      </div>` : ''}

    <div class="lines-section">
      <h4>Lignes prévisionnelles</h4>
      <div class="lines-table">
        ${lines.length === 0
          ? '<div style="color:var(--text-light);font-size:0.875rem;padding:0.5rem 0;">Aucune ligne.</div>'
          : lines.map(l => renderLine(l, canEdit)).join('')}
      </div>
      ${canEdit ? `
        <form class="add-line-form" onsubmit="addLine(event, ${id})">
          <input type="text" id="ln-label-${id}" placeholder="Intitulé" required maxlength="120">
          <input type="number" id="ln-amount-${id}" placeholder="Montant" step="0.01" min="0" required>
          <select id="ln-kind-${id}">
            <option value="expense">Dépense</option>
            <option value="revenue">Revenu</option>
          </select>
          <button type="submit" class="btn btn-primary btn-sm">Ajouter</button>
        </form>
      ` : ''}
    </div>

    <div class="event-actions">
      ${canEdit ? `<button class="btn btn-ghost btn-sm" onclick="openEditEvent(${id})">Modifier</button>` : ''}
      ${canSubmit ? `<button class="btn btn-primary btn-sm" onclick="submitEvent(${id})">Soumettre à validation</button>` : ''}
      ${canValidate ? `<button class="btn btn-primary btn-sm" onclick="validateEvent(${id})">Valider</button>` : ''}
      ${canValidate ? `<button class="btn btn-danger btn-sm" onclick="openRejectModal(${id})">Refuser</button>` : ''}
      ${canDelete ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger);margin-left:auto;" onclick="deleteEvent(${id})">Supprimer</button>` : ''}
    </div>
  `;
}

function renderLine(l, canEdit) {
  return `
    <div class="line-row">
      <span class="line-kind-dot ${l.kind}" title="${l.kind === 'expense' ? 'Dépense' : 'Revenu'}"></span>
      <span class="line-label">${esc(l.label)}${l.category ? `<span class="line-cat">${esc(l.category)}</span>` : ''}</span>
      <span class="line-amount ${l.kind}">${l.kind === 'expense' ? '−' : '+'}${fmtMoney(l.amount).replace('€', '€')}</span>
      ${canEdit ? `
        <div class="line-actions">
          <button onclick="deleteLine(${l.event_id}, ${l.id})" aria-label="Supprimer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      ` : '<span></span>'}
    </div>
  `;
}

window.addLine = async (e, eid) => {
  e.preventDefault();
  const body = {
    label: $(`ln-label-${eid}`).value.trim(),
    amount: parseFloat($(`ln-amount-${eid}`).value),
    kind: $(`ln-kind-${eid}`).value,
    category: null,
  };
  const res = await fetch(`/api/events/${eid}/lines`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (res.ok) {
    toast('Ligne ajoutée', 'success');
    await loadEvents();
  } else {
    const d = await res.json().catch(() => ({}));
    toast(d.error || 'Erreur', 'error');
  }
};

window.deleteLine = async (eid, lid) => {
  if (!confirm('Supprimer cette ligne ?')) return;
  const res = await fetch(`/api/events/${eid}/lines/${lid}`, { method: 'DELETE', credentials: 'include' });
  if (res.ok) { toast('Ligne supprimée'); await loadEvents(); }
};

window.submitEvent = async (id) => {
  if (!confirm('Soumettre cet événement à la présidence ?')) return;
  const res = await fetch(`/api/events/${id}/submit`, { method: 'POST', credentials: 'include' });
  if (res.ok) { toast('Événement soumis', 'success'); await loadEvents(); }
  else { const d = await res.json().catch(() => ({})); toast(d.error || 'Erreur', 'error'); }
};

window.validateEvent = async (id) => {
  if (!confirm('Valider cet événement ?')) return;
  const res = await fetch(`/api/events/${id}/validate`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  if (res.ok) { toast('Événement validé', 'success'); await loadEvents(); }
};

window.openRejectModal = (id) => {
  $('rej-event-id').value = id;
  $('rej-comment').value = '';
  $('modal-reject').classList.remove('hidden');
};

$('reject-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('rej-event-id').value;
  const comment = $('rej-comment').value.trim();
  if (!comment) return;
  const res = await fetch(`/api/events/${id}/reject`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }),
  });
  if (res.ok) {
    $('modal-reject').classList.add('hidden');
    toast('Événement refusé', 'success');
    await loadEvents();
  }
});

window.deleteEvent = async (id) => {
  if (!confirm('Supprimer cet événement ?')) return;
  const res = await fetch(`/api/events/${id}`, { method: 'DELETE', credentials: 'include' });
  if (res.ok) { openEventId = null; toast('Supprimé'); await loadEvents(); }
};

window.openEditEvent = async (id) => {
  const res = await fetch(`/api/events/${id}`, { credentials: 'include' });
  const { event } = await res.json();
  $('modal-event-title').textContent = 'Modifier l\'événement';
  $('ev-id').value = id;
  $('ev-name').value = event.name;
  $('ev-date').value = event.event_date || '';
  $('ev-desc').value = event.description || '';
  $('modal-event').classList.remove('hidden');
};

/* New event */
$('new-event-btn').addEventListener('click', () => {
  $('modal-event-title').textContent = 'Nouvel événement';
  $('ev-id').value = '';
  $('ev-name').value = '';
  $('ev-date').value = '';
  $('ev-desc').value = '';
  $('modal-event').classList.remove('hidden');
});

$('event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('ev-id').value;
  const body = {
    name: $('ev-name').value.trim(),
    event_date: $('ev-date').value || null,
    description: $('ev-desc').value.trim(),
  };
  if (!body.name) return;
  const url = id ? `/api/events/${id}` : '/api/events';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) {
    $('modal-event').classList.add('hidden');
    toast(id ? 'Modifié' : 'Créé', 'success');
    await loadEvents();
  } else {
    const d = await res.json().catch(() => ({}));
    toast(d.error || 'Erreur', 'error');
  }
});

/* Filters */
document.querySelectorAll('#event-filters .pill').forEach(p => {
  p.addEventListener('click', async () => {
    document.querySelectorAll('#event-filters .pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    currentFilter = p.dataset.filter;
    openEventId = null;
    await loadEvents();
  });
});

/* Modals close */
document.querySelectorAll('[data-close]').forEach(b => {
  b.addEventListener('click', () => b.closest('.modal-overlay').classList.add('hidden'));
});
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', (e) => { if (e.target === o) o.classList.add('hidden'); });
});

/* Logout / Mobile */
$('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  window.location.href = '/';
});
$('mobile-menu-btn').addEventListener('click', () => {
  $('sidebar').classList.toggle('open');
  $('sidebar-overlay').classList.toggle('show');
});
$('sidebar-overlay').addEventListener('click', () => {
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('show');
});

init();
