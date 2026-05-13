const express = require('express');
const db = require('../db');

const router = express.Router();
const FINANCE = new Set(['admin', 'president', 'tresorier']);

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié.' });
  next();
}

function canManage(req) { return FINANCE.has(req.session.role); }

// List lines
router.get('/lines', auth, (req, res) => {
  const me = req.session.userId;
  const myRole = req.session.role;
  const canSeeAll = FINANCE.has(myRole);

  const filters = [];
  const params = [];

  if (!canSeeAll) {
    filters.push('t.role = ?');
    params.push(myRole);
  } else if (req.query.role) {
    filters.push('t.role = ?');
    params.push(req.query.role);
  }

  if (req.query.state && ['provisional', 'real'].includes(req.query.state)) {
    filters.push('t.state = ?');
    params.push(req.query.state);
  }

  if (req.query.kind && ['expense', 'revenue'].includes(req.query.kind)) {
    filters.push('t.kind = ?');
    params.push(req.query.kind);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  const lines = db.prepare(`
    SELECT t.*, u.display_name AS author_name, uu.display_name AS updater_name
    FROM treasury_lines t
    JOIN users u ON u.id = t.created_by
    LEFT JOIN users uu ON uu.id = t.updated_by
    ${where}
    ORDER BY t.created_at DESC
  `).all(...params);

  res.json({ lines, can_manage: canManage(req), can_see_all: canSeeAll, my_role: myRole });
});

// Summary
router.get('/summary', auth, (req, res) => {
  const myRole = req.session.role;
  const canSeeAll = FINANCE.has(myRole);

  if (canSeeAll) {
    // Global summary + per-role breakdown
    const totals = db.prepare(`
      SELECT state, kind, IFNULL(SUM(amount), 0) AS total
      FROM treasury_lines
      GROUP BY state, kind
    `).all();
    const byRole = db.prepare(`
      SELECT role, state, kind, IFNULL(SUM(amount), 0) AS total
      FROM treasury_lines
      GROUP BY role, state, kind
    `).all();
    return res.json({ scope: 'all', totals, by_role: byRole });
  }

  const totals = db.prepare(`
    SELECT state, kind, IFNULL(SUM(amount), 0) AS total
    FROM treasury_lines WHERE role = ?
    GROUP BY state, kind
  `).all(myRole);
  res.json({ scope: 'own', role: myRole, totals });
});

// Create line
router.post('/lines', auth, (req, res) => {
  let { role, label, amount, category, kind, state, comment } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'Intitulé requis.' });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: 'Montant invalide.' });
  if (!['expense', 'revenue'].includes(kind)) return res.status(400).json({ error: 'Type invalide.' });
  if (!['provisional', 'real'].includes(state || 'provisional')) return res.status(400).json({ error: 'État invalide.' });

  // Non-finance roles can only create lines for their own role
  if (!canManage(req)) {
    role = req.session.role;
  } else {
    if (!role) return res.status(400).json({ error: 'Pôle bénéficiaire requis.' });
  }

  const r = db.prepare(`
    INSERT INTO treasury_lines (role, label, amount, category, kind, state, source, comment, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)
  `).run(role, label.trim(), amt, (category || '').trim() || null, kind, state || 'provisional',
         (comment || '').trim() || null, req.session.userId, req.session.userId);
  res.json({ success: true, id: r.lastInsertRowid });
});

// Update line
router.put('/lines/:id', auth, (req, res) => {
  const line = db.prepare('SELECT * FROM treasury_lines WHERE id = ?').get(req.params.id);
  if (!line) return res.status(404).json({ error: 'Ligne introuvable.' });

  const isOwner = line.role === req.session.role;
  if (!canManage(req) && !isOwner) return res.status(403).json({ error: 'Non autorisé.' });
  if (!isOwner && !canManage(req)) return res.status(403).json({ error: 'Non autorisé.' });

  const { label, amount, category, kind, state, comment } = req.body;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: 'Montant invalide.' });
  if (!['expense', 'revenue'].includes(kind)) return res.status(400).json({ error: 'Type invalide.' });
  if (!['provisional', 'real'].includes(state)) return res.status(400).json({ error: 'État invalide.' });

  db.prepare(`
    UPDATE treasury_lines
    SET label=?, amount=?, category=?, kind=?, state=?, comment=?, updated_at=CURRENT_TIMESTAMP, updated_by=?
    WHERE id=?
  `).run(label.trim(), amt, (category || '').trim() || null, kind, state,
         (comment || '').trim() || null, req.session.userId, req.params.id);
  res.json({ success: true });
});

// Delete
router.delete('/lines/:id', auth, (req, res) => {
  const line = db.prepare('SELECT * FROM treasury_lines WHERE id = ?').get(req.params.id);
  if (!line) return res.status(404).json({ error: 'Introuvable.' });
  const isOwner = line.role === req.session.role;
  if (!canManage(req) && !isOwner) return res.status(403).json({ error: 'Non autorisé.' });
  db.prepare('DELETE FROM treasury_lines WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Comment-only update (treasurer/admin/president can comment on any)
router.patch('/lines/:id/comment', auth, (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Réservé à la trésorerie / présidence.' });
  const { comment } = req.body;
  db.prepare(`
    UPDATE treasury_lines SET comment=?, updated_at=CURRENT_TIMESTAMP, updated_by=? WHERE id=?
  `).run((comment || '').trim() || null, req.session.userId, req.params.id);
  res.json({ success: true });
});

module.exports = router;
