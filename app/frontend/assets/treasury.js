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

const ALL_ROLES = ['president','tresorier','secretaire','pole_sport','pole_partenariat','pole_communication','pole_intercentre','pole_vie_campus','pole_gala'];

let me = null;
let canManage = false;
let canSeeAll = false;
let filters = { state: '', kind: '', role: '' };

const $ = (id) => document.getElementById(id);
const roleCfg = (r) => ROLES[r] || { label: r, short: '?', color: '#64748B', bg: '#F1F5F9' };

function darken(hex) {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [(n>>16)-30, ((n>>8)&0xff)-30, (n&0xff)-30].map(v => Math.max(0, v).toString(16).padStart(2, '0')).join('');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function fmt(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
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

  canManage = ['admin', 'president', 'tresorier'].includes(me.role);
  canSeeAll = canManage;

  $('loading-screen').classList.add('hidden');
  $('app-content').classList.remove('hidden');

  const rc = roleCfg(me.role);
  const av = $('sidebar-avatar');
  av.textContent = rc.short;
  av.style.background = `linear-gradient(135deg, ${rc.color}, ${darken(rc.color)})`;
  $('sidebar-user-name').textContent = me.display_name;
  $('sidebar-user-role').textContent = rc.label;
  $('topbar-title').textContent = canSeeAll ? 'Trésorerie globale' : `Trésorerie · ${rc.label}`;

  // Build role select for admin/tresorier
  if (canSeeAll) {
    $('role-filter-wrap').classList.remove('hidden');
    const sel = $('role-filter');
    for (const r of ALL_ROLES) {
      const opt = document.createElement('option');
      opt.value = r; opt.textContent = roleCfg(r).label;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', async () => { filters.role = sel.value; await refresh(); });
  }

  // Role select for new-line modal (only shown to managers)
  const lnRoleSel = $('ln-role');
  for (const r of ALL_ROLES) {
    const opt = document.createElement('option');
    opt.value = r; opt.textContent = roleCfg(r).label;
    lnRoleSel.appendChild(opt);
  }

  await refresh();
}

async function refresh() {
  await Promise.all([loadSummary(), loadLines()]);
}

async function loadSummary() {
  const res = await fetch('/api/treasury/summary', { credentials: 'include' });
  const data = await res.json();
  renderSummary(data);
  if (canSeeAll) renderRoleBreakdown(data);
}

function aggregate(totals) {
  let realExp = 0, realRev = 0, provExp = 0, provRev = 0;
  for (const r of totals) {
    if (r.state === 'real' && r.kind === 'expense') realExp = r.total;
    else if (r.state === 'real' && r.kind === 'revenue') realRev = r.total;
    else if (r.state === 'provisional' && r.kind === 'expense') provExp = r.total;
    else if (r.state === 'provisional' && r.kind === 'revenue') provRev = r.total;
  }
  return {
    realBalance: realRev - realExp,
    provBalance: (realRev + provRev) - (realExp + provExp),
    realExp, realRev, provExp, provRev,
  };
}

function renderSummary(data) {
  const s = aggregate(data.totals);
  $('summary').innerHTML = `
    <div class="summary-card real ${s.realBalance >= 0 ? 'balance-positive' : 'balance-negative'}">
      <div class="summary-card-label">Solde réel</div>
      <div class="summary-card-value">${fmt(s.realBalance)}</div>
      <div class="summary-card-sub">+${fmt(s.realRev)} / −${fmt(s.realExp)}</div>
    </div>
    <div class="summary-card provisional ${s.provBalance >= 0 ? 'balance-positive' : 'balance-negative'}">
      <div class="summary-card-label">Solde prévisionnel</div>
      <div class="summary-card-value">${fmt(s.provBalance)}</div>
      <div class="summary-card-sub">incluant les engagements à venir</div>
    </div>
    <div class="summary-card expense">
      <div class="summary-card-label">Dépenses (toutes)</div>
      <div class="summary-card-value">${fmt(s.realExp + s.provExp)}</div>
      <div class="summary-card-sub">${fmt(s.realExp)} réel · ${fmt(s.provExp)} prévu</div>
    </div>
    <div class="summary-card revenue">
      <div class="summary-card-label">Revenus (tous)</div>
      <div class="summary-card-value">${fmt(s.realRev + s.provRev)}</div>
      <div class="summary-card-sub">${fmt(s.realRev)} réel · ${fmt(s.provRev)} prévu</div>
    </div>
  `;
}

function renderRoleBreakdown(data) {
  if (!data.by_role) return;
  const byRole = {};
  for (const row of data.by_role) {
    byRole[row.role] = byRole[row.role] || { real: { expense: 0, revenue: 0 }, provisional: { expense: 0, revenue: 0 } };
    byRole[row.role][row.state][row.kind] = row.total;
  }
  const roles = Object.keys(byRole).sort();
  if (roles.length === 0) { $('role-breakdown').classList.add('hidden'); return; }

  let totals = { realExp: 0, realRev: 0, provExp: 0, provRev: 0 };
  const rows = roles.map(r => {
    const v = byRole[r];
    const realB = v.real.revenue - v.real.expense;
    const provB = (v.real.revenue + v.provisional.revenue) - (v.real.expense + v.provisional.expense);
    totals.realExp += v.real.expense; totals.realRev += v.real.revenue;
    totals.provExp += v.provisional.expense; totals.provRev += v.provisional.revenue;
    const rc = roleCfg(r);
    return `
      <tr>
        <td><span class="role-chip" style="background:${rc.bg};color:${rc.color}">${rc.label}</span></td>
        <td class="num">${fmt(v.real.revenue)}</td>
        <td class="num">${fmt(v.real.expense)}</td>
        <td class="num ${realB >= 0 ? 'pos' : 'neg'}">${fmt(realB)}</td>
        <td class="num ${provB >= 0 ? 'pos' : 'neg'}">${fmt(provB)}</td>
      </tr>
    `;
  }).join('');

  const totalReal = totals.realRev - totals.realExp;
  const totalProv = (totals.realRev + totals.provRev) - (totals.realExp + totals.provExp);

  $('role-breakdown').classList.remove('hidden');
  $('role-breakdown').innerHTML = `
    <div class="role-summary-table">
      <table>
        <thead>
          <tr><th>Pôle</th><th class="num">Revenus réels</th><th class="num">Dépenses réelles</th><th class="num">Solde réel</th><th class="num">Solde prévisionnel</th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="totals"><td>Total</td><td class="num">${fmt(totals.realRev)}</td><td class="num">${fmt(totals.realExp)}</td><td class="num ${totalReal >= 0 ? 'pos' : 'neg'}">${fmt(totalReal)}</td><td class="num ${totalProv >= 0 ? 'pos' : 'neg'}">${fmt(totalProv)}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

async function loadLines() {
  const q = new URLSearchParams();
  if (filters.state) q.set('state', filters.state);
  if (filters.kind)  q.set('kind',  filters.kind);
  if (filters.role)  q.set('role',  filters.role);

  const res = await fetch('/api/treasury/lines?' + q, { credentials: 'include' });
  const { lines } = await res.json();
  $('line-empty').classList.toggle('hidden', lines.length > 0);
  $('line-list').innerHTML = lines.map(renderLine).join('');
}

function renderLine(l) {
  const rc = roleCfg(l.role);
  const canEdit = canManage || l.role === me.role;
  return `
    <div class="treasury-line ${l.comment ? 'has-comment' : ''}">
      <span class="tl-kind ${l.kind}" title="${l.kind === 'expense' ? 'Dépense' : 'Revenu'}"></span>
      <div class="tl-main">
        <div class="tl-label">${esc(l.label)}</div>
        <div class="tl-meta">
          <span class="role-chip" style="background:${rc.bg};color:${rc.color}">${rc.label}</span>
          ${l.category ? `<span class="tl-category">${esc(l.category)}</span>` : ''}
          <span class="status-badge ${l.state}">${l.state === 'real' ? 'Réel' : 'Prévu'}</span>
          ${l.source === 'event' ? '<span style="color:var(--text-light);">issu d\'un événement</span>' : ''}
        </div>
      </div>
      <div class="tl-amount ${l.kind}">${l.kind === 'expense' ? '−' : '+'}${fmt(l.amount)}</div>
      <div class="tl-actions">
        ${canEdit ? `
          <button onclick="openEdit(${l.id})" title="Modifier" aria-label="Modifier">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button onclick="deleteLine(${l.id})" title="Supprimer" aria-label="Supprimer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        ` : ''}
      </div>
      ${l.comment ? `<div class="tl-comment"><strong>Commentaire :</strong> ${esc(l.comment)}${l.updater_name && l.updater_name !== l.author_name ? ` <span style="opacity:0.7;font-size:0.7rem;">— ${esc(l.updater_name)}</span>` : ''}</div>` : ''}
    </div>
  `;
}

window.openEdit = async (id) => {
  const res = await fetch('/api/treasury/lines?', { credentials: 'include' });
  const { lines } = await res.json();
  const l = lines.find(x => x.id === id);
  if (!l) return;
  $('modal-line-title').textContent = 'Modifier la ligne';
  $('ln-id').value = l.id;
  $('ln-label').value = l.label;
  $('ln-amount').value = l.amount;
  $('ln-kind').value = l.kind;
  $('ln-state').value = l.state;
  $('ln-category').value = l.category || '';
  $('ln-comment').value = l.comment || '';
  if (canSeeAll) { $('role-wrap').classList.remove('hidden'); $('ln-role').value = l.role; }
  else { $('role-wrap').classList.add('hidden'); }
  $('modal-line').classList.remove('hidden');
};

window.deleteLine = async (id) => {
  if (!confirm('Supprimer cette ligne ?')) return;
  const res = await fetch(`/api/treasury/lines/${id}`, { method: 'DELETE', credentials: 'include' });
  if (res.ok) { toast('Ligne supprimée'); await refresh(); }
};

/* New line */
$('new-line-btn').addEventListener('click', () => {
  $('modal-line-title').textContent = 'Nouvelle ligne';
  $('ln-id').value = '';
  $('ln-label').value = '';
  $('ln-amount').value = '';
  $('ln-kind').value = 'expense';
  $('ln-state').value = 'provisional';
  $('ln-category').value = '';
  $('ln-comment').value = '';
  if (canSeeAll) { $('role-wrap').classList.remove('hidden'); $('ln-role').value = me.role; }
  else { $('role-wrap').classList.add('hidden'); }
  $('modal-line').classList.remove('hidden');
});

$('line-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('ln-id').value;
  const body = {
    label: $('ln-label').value.trim(),
    amount: parseFloat($('ln-amount').value),
    kind: $('ln-kind').value,
    state: $('ln-state').value,
    category: $('ln-category').value.trim() || null,
    comment: $('ln-comment').value.trim() || null,
  };
  if (canSeeAll) body.role = $('ln-role').value;
  if (!body.label || !Number.isFinite(body.amount)) return;

  const url = id ? `/api/treasury/lines/${id}` : '/api/treasury/lines';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.ok) { $('modal-line').classList.add('hidden'); toast(id ? 'Modifiée' : 'Créée', 'success'); await refresh(); }
  else { const d = await res.json().catch(() => ({})); toast(d.error || 'Erreur', 'error'); }
});

/* Filters */
$('state-filter').addEventListener('click', async (e) => {
  if (!e.target.matches('.pill')) return;
  document.querySelectorAll('#state-filter .pill').forEach(x => x.classList.remove('active'));
  e.target.classList.add('active');
  filters.state = e.target.dataset.state || '';
  await loadLines();
});

document.querySelector('#advanced-filters .filter-pills').addEventListener('click', async (e) => {
  if (!e.target.matches('.pill')) return;
  document.querySelectorAll('#advanced-filters .filter-pills .pill').forEach(x => x.classList.remove('active'));
  e.target.classList.add('active');
  filters.kind = e.target.dataset.kind || '';
  await loadLines();
});

/* Modal close */
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
