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
  pole_vie_campus:   { label: 'Vie de campus',  short: 'VC', color: '#16A34A', bg: '#F0FDF4' },
  pole_gala:         { label: 'Gala',           short: 'GA', color: '#9333EA', bg: '#FAF5FF' },
};

const TARGET_ROLES = [
  'president', 'tresorier', 'secretaire',
  'pole_sport', 'pole_partenariat', 'pole_communication',
  'pole_intercentre', 'pole_vie_campus', 'pole_gala',
];

let me = null;
let currentTab = 'questions';
let currentFilter = 'all';
let openQuestionId = null;

const $ = (id) => document.getElementById(id);

function roleCfg(r) { return ROLES[r] || { label: r, short: '?', color: '#64748B', bg: '#F1F5F9' }; }

function darken(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - 30);
  const g = Math.max(0, ((n >> 8) & 0xff) - 30);
  const b = Math.max(0, (n & 0xff) - 30);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function fmtAgo(iso) {
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)        return 'à l’instant';
  if (s < 3600)      return `il y a ${Math.floor(s/60)} min`;
  if (s < 86400)     return `il y a ${Math.floor(s/3600)} h`;
  if (s < 86400*7)   return `il y a ${Math.floor(s/86400)} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function toast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  setTimeout(() => t.classList.add('hidden'), 2500);
}

/* ===== Init ===== */
async function init() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (!r.ok) { window.location.href = '/'; return; }
    const d = await r.json();
    me = d.user;
  } catch { window.location.href = '/'; return; }

  $('loading-screen').classList.add('hidden');
  $('app-content').classList.remove('hidden');

  const rc = roleCfg(me.role);
  const av = $('sidebar-avatar');
  av.textContent = rc.short;
  av.style.background = `linear-gradient(135deg, ${rc.color}, ${darken(rc.color)})`;
  $('sidebar-user-name').textContent = me.display_name;
  $('sidebar-user-role').textContent = rc.label;

  buildTargetCheckboxes();
  await loadQuestions();
}

function buildTargetCheckboxes() {
  $('q-targets').innerHTML = TARGET_ROLES.map(r => {
    const rc = roleCfg(r);
    return `
      <label class="check-pill" data-role="${r}">
        <input type="checkbox" value="${r}" />
        <span>${rc.label}</span>
      </label>
    `;
  }).join('');
  $('q-targets').addEventListener('change', (e) => {
    if (e.target.matches('input[type="checkbox"]')) {
      e.target.closest('.check-pill').classList.toggle('checked', e.target.checked);
    }
  });
}

/* ===== Questions ===== */
async function loadQuestions() {
  const res = await fetch(`/api/faq/questions?filter=${currentFilter}`, { credentials: 'include' });
  const { questions } = await res.json();

  $('question-empty').classList.toggle('hidden', questions.length > 0);
  $('question-list').innerHTML = questions.map(q => renderQuestionCard(q)).join('');

  // Re-bind clicks
  $('question-list').querySelectorAll('.item-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, a, textarea, input')) return;
      const id = parseInt(card.dataset.id, 10);
      toggleQuestionOpen(id);
    });
  });
}

function renderQuestionCard(q) {
  const rcAuthor = roleCfg(q.author_role);
  const targets = q.target_roles.split(',');
  const isOpen = openQuestionId === q.id;
  const mineFlag = q.author_id === me.id;
  const canDelete = mineFlag || me.role === 'admin';

  return `
    <div class="item-card" data-id="${q.id}">
      <div class="item-head">
        <div style="flex:1;min-width:0;">
          <div class="item-title">${esc(q.title)}</div>
          <div class="item-meta">
            <span class="item-meta-item" style="color:${rcAuthor.color};font-weight:600;">${esc(q.author_name)}</span>
            <span class="item-meta-item">→</span>
            <span class="role-chips">${targets.map(r => {
              const rc = roleCfg(r);
              return `<span class="role-chip" style="background:${rc.bg};color:${rc.color}">${rc.label}</span>`;
            }).join('')}</span>
          </div>
          <div class="item-meta">
            <span class="item-meta-item">${fmtAgo(q.created_at)}</span>
            <span class="item-meta-item">·</span>
            <span class="item-meta-item">${q.answer_count} réponse${q.answer_count > 1 ? 's' : ''}</span>
            ${mineFlag ? '<span class="item-meta-item">· vous</span>' : ''}
          </div>
        </div>
        <span class="status-badge ${q.status}">${q.status === 'answered' ? 'Répondue' : 'En attente'}</span>
      </div>
      ${q.body ? `<div class="item-body">${esc(q.body)}</div>` : ''}
      ${isOpen ? `<div class="answers" id="answers-${q.id}"><div style="color:var(--text-light)">Chargement…</div></div>` : ''}
      ${canDelete && isOpen ? `<div style="margin-top:0.5rem;text-align:right;"><button class="btn btn-ghost btn-sm" onclick="deleteQuestion(${q.id})">Supprimer la question</button></div>` : ''}
    </div>
  `;
}

async function toggleQuestionOpen(id) {
  openQuestionId = openQuestionId === id ? null : id;
  await loadQuestions();
  if (openQuestionId === id) {
    await loadAnswers(id);
  }
}

async function loadAnswers(id) {
  const res = await fetch(`/api/faq/questions/${id}`, { credentials: 'include' });
  const { question, answers } = await res.json();
  const el = $(`answers-${id}`);
  if (!el) return;

  const myTargets = question.target_roles.split(',');
  const isMyTarget = myTargets.includes(me.role);

  el.innerHTML = `
    ${answers.length ? answers.map(a => {
      const rc = roleCfg(a.author_role);
      const canDel = a.author_id === me.id || me.role === 'admin';
      return `
        <div class="answer ${a.is_primary ? 'primary' : ''}">
          <div class="answer-head">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              <span class="answer-author" style="color:${rc.color}">${esc(a.author_name)}</span>
              ${a.is_primary ? '<span class="answer-primary-flag">Pôle concerné</span>' : ''}
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;">
              <span class="answer-time">${fmtAgo(a.created_at)}</span>
              ${canDel ? `<button class="btn-icon" style="color:var(--text-light);font-size:0.75rem;" onclick="deleteAnswer(${a.id}, ${id})" aria-label="Supprimer">✕</button>` : ''}
            </div>
          </div>
          <div class="answer-body">${esc(a.body)}</div>
        </div>
      `;
    }).join('') : '<div style="color:var(--text-light);font-size:0.875rem;">Aucune réponse encore.</div>'}

    <form class="reply-form" onsubmit="postAnswer(event, ${id})">
      <textarea required placeholder="Votre réponse…" id="reply-${id}"></textarea>
      <div class="reply-form-actions">
        <span class="reply-hint">${isMyTarget ? 'Vous êtes un pôle concerné — réponse marquée prioritaire.' : 'Tout le monde peut répondre.'}</span>
        <button type="submit" class="btn btn-primary btn-sm">Envoyer</button>
      </div>
    </form>
  `;
}

window.postAnswer = async (e, qid) => {
  e.preventDefault();
  const body = $(`reply-${qid}`).value.trim();
  if (!body) return;
  const res = await fetch(`/api/faq/questions/${qid}/answers`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
  });
  if (res.ok) {
    toast('Réponse envoyée', 'success');
    await loadQuestions();
    if (openQuestionId === qid) await loadAnswers(qid);
  } else {
    const d = await res.json().catch(() => ({}));
    toast(d.error || 'Erreur', 'error');
  }
};

window.deleteAnswer = async (id, qid) => {
  if (!confirm('Supprimer cette réponse ?')) return;
  const res = await fetch(`/api/faq/answers/${id}`, { method: 'DELETE', credentials: 'include' });
  if (res.ok) {
    toast('Réponse supprimée');
    await loadQuestions();
    if (openQuestionId === qid) await loadAnswers(qid);
  }
};

window.deleteQuestion = async (id) => {
  if (!confirm('Supprimer cette question ?')) return;
  const res = await fetch(`/api/faq/questions/${id}`, { method: 'DELETE', credentials: 'include' });
  if (res.ok) {
    toast('Question supprimée');
    openQuestionId = null;
    await loadQuestions();
  }
};

/* ===== Announcements ===== */
async function loadAnnouncements() {
  const res = await fetch('/api/faq/announcements', { credentials: 'include' });
  const { announcements } = await res.json();
  $('announcement-empty').classList.toggle('hidden', announcements.length > 0);
  $('announcement-list').innerHTML = announcements.map(a => {
    const rc = roleCfg(a.author_role);
    const canDel = a.author_id === me.id || me.role === 'admin';
    return `
      <div class="item-card">
        <div class="item-head">
          <div style="flex:1;min-width:0;">
            <div class="item-title" style="cursor:default">${esc(a.title)}</div>
            <div class="item-meta">
              <span class="item-meta-item" style="color:${rc.color};font-weight:600;">${esc(a.author_name)}</span>
              <span class="item-meta-item">${fmtAgo(a.created_at)}</span>
            </div>
          </div>
          ${canDel ? `<button class="btn btn-ghost btn-sm" onclick="deleteAnnouncement(${a.id})">Supprimer</button>` : ''}
        </div>
        ${a.body ? `<div class="item-body">${esc(a.body)}</div>` : ''}
      </div>
    `;
  }).join('');
}

window.deleteAnnouncement = async (id) => {
  if (!confirm('Supprimer cette annonce ?')) return;
  const res = await fetch(`/api/faq/announcements/${id}`, { method: 'DELETE', credentials: 'include' });
  if (res.ok) { toast('Annonce supprimée'); await loadAnnouncements(); }
};

/* ===== Tab switching ===== */
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', async () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    currentTab = t.dataset.tab;
    $('panel-questions').classList.toggle('hidden', currentTab !== 'questions');
    $('panel-announcements').classList.toggle('hidden', currentTab !== 'announcements');
    if (currentTab === 'announcements') await loadAnnouncements();
    else await loadQuestions();
  });
});

/* Filter pills */
document.querySelectorAll('#question-filters .pill').forEach(p => {
  p.addEventListener('click', async () => {
    document.querySelectorAll('#question-filters .pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    currentFilter = p.dataset.filter;
    openQuestionId = null;
    await loadQuestions();
  });
});

/* ===== Modals ===== */
function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach(b => {
  b.addEventListener('click', () => b.closest('.modal-overlay').classList.add('hidden'));
});
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', (e) => { if (e.target === o) o.classList.add('hidden'); });
});

$('new-question-btn').addEventListener('click', () => {
  $('q-title').value = '';
  $('q-body').value = '';
  $('q-targets').querySelectorAll('input[type="checkbox"]').forEach(c => { c.checked = false; c.closest('.check-pill').classList.remove('checked'); });
  openModal('modal-question');
});

$('question-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('q-title').value.trim();
  const body  = $('q-body').value.trim();
  const target_roles = [...$('q-targets').querySelectorAll('input:checked')].map(c => c.value);
  if (!title || target_roles.length === 0) {
    toast('Titre et au moins un pôle requis', 'error');
    return;
  }
  const res = await fetch('/api/faq/questions', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, target_roles }),
  });
  if (res.ok) {
    closeModal('modal-question');
    toast('Question publiée', 'success');
    await loadQuestions();
  } else {
    const d = await res.json().catch(() => ({}));
    toast(d.error || 'Erreur', 'error');
  }
});

$('new-announcement-btn').addEventListener('click', () => {
  $('a-title').value = '';
  $('a-body').value = '';
  openModal('modal-announcement');
});

$('announcement-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('a-title').value.trim();
  const body  = $('a-body').value.trim();
  if (!title) return;
  const res = await fetch('/api/faq/announcements', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
  if (res.ok) {
    closeModal('modal-announcement');
    toast('Annonce publiée', 'success');
    await loadAnnouncements();
  } else {
    const d = await res.json().catch(() => ({}));
    toast(d.error || 'Erreur', 'error');
  }
});

/* ===== Logout / Mobile ===== */
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
