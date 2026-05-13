const express = require('express');
const db = require('../db');

const router = express.Router();
const ADMIN = new Set(['admin', 'president']);

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié.' });
  next();
}

function getEvent(id) {
  return db.prepare(`
    SELECT e.*, u.display_name AS creator_name, u.role AS creator_role,
           v.display_name AS validator_name
    FROM events e
    JOIN users u ON u.id = e.created_by
    LEFT JOIN users v ON v.id = e.validated_by
    WHERE e.id = ?
  `).get(id);
}

function getLines(eventId) {
  return db.prepare('SELECT * FROM event_lines WHERE event_id = ? ORDER BY id').all(eventId);
}

function summary(lines) {
  let expense = 0, revenue = 0;
  for (const l of lines) {
    if (l.kind === 'expense') expense += l.amount;
    else if (l.kind === 'revenue') revenue += l.amount;
  }
  return { expense, revenue, balance: revenue - expense };
}

// List events with filter, role-aware visibility
router.get('/', auth, (req, res) => {
  const filter = req.query.filter || 'all';
  const me = req.session.userId;
  const myRole = req.session.role;
  const isAdmin = ADMIN.has(myRole);

  let where = '1=1';
  const params = [];

  if (filter === 'mine') {
    where += ' AND e.organizer_role = ?';
    params.push(myRole);
  } else if (filter === 'pending') {
    where += " AND e.status = 'pending'";
  } else if (filter === 'validated') {
    where += " AND e.status = 'validated'";
  } else if (filter === 'rejected') {
    where += " AND e.status = 'rejected'";
  } else if (filter === 'draft') {
    where += " AND e.status = 'draft'";
  }

  // Non-admin: see own events (any state) + others' validated only
  if (!isAdmin) {
    where += ` AND (e.organizer_role = ? OR e.status = 'validated')`;
    params.push(myRole);
  }

  const events = db.prepare(`
    SELECT e.*, u.display_name AS creator_name, u.role AS creator_role,
      (SELECT COUNT(*) FROM event_lines WHERE event_id = e.id) AS line_count,
      (SELECT IFNULL(SUM(CASE WHEN kind='expense' THEN amount ELSE 0 END),0) FROM event_lines WHERE event_id = e.id) AS total_expense,
      (SELECT IFNULL(SUM(CASE WHEN kind='revenue' THEN amount ELSE 0 END),0) FROM event_lines WHERE event_id = e.id) AS total_revenue
    FROM events e
    JOIN users u ON u.id = e.created_by
    WHERE ${where}
    ORDER BY e.event_date IS NULL, e.event_date ASC, e.created_at DESC
  `).all(...params);

  // For non-admin viewing others' validated events: hide numbers
  const result = events.map(e => {
    const isOwn = e.organizer_role === myRole;
    if (!isAdmin && !isOwn) {
      return { ...e, total_expense: null, total_revenue: null, simplified: true };
    }
    return e;
  });

  res.json({ events: result, my_role: myRole, is_admin: isAdmin });
});

// Detail
router.get('/:id', auth, (req, res) => {
  const ev = getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Événement introuvable.' });

  const isAdmin = ADMIN.has(req.session.role);
  const isOwn   = ev.organizer_role === req.session.role;

  if (!isAdmin && !isOwn && ev.status !== 'validated') {
    return res.status(403).json({ error: 'Accès non autorisé.' });
  }

  const lines = getLines(ev.id);

  if (!isAdmin && !isOwn) {
    // Simplified view — no financial details
    return res.json({ event: ev, lines: [], summary: null, simplified: true });
  }

  res.json({ event: ev, lines, summary: summary(lines), simplified: false });
});

// Create event (draft)
router.post('/', auth, (req, res) => {
  const { name, event_date, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis.' });
  const r = db.prepare(`
    INSERT INTO events (name, event_date, description, organizer_role, created_by, status)
    VALUES (?, ?, ?, ?, ?, 'draft')
  `).run(name.trim(), event_date || null, (description || '').trim(), req.session.role, req.session.userId);
  res.json({ success: true, id: r.lastInsertRowid });
});

// Update event (own + draft/rejected, or admin)
router.put('/:id', auth, (req, res) => {
  const ev = getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Introuvable.' });
  const isAdmin = ADMIN.has(req.session.role);
  if (!isAdmin && ev.organizer_role !== req.session.role)
    return res.status(403).json({ error: 'Non autorisé.' });
  if (!isAdmin && !['draft', 'rejected'].includes(ev.status))
    return res.status(400).json({ error: 'Événement déjà soumis.' });

  const { name, event_date, description } = req.body;
  db.prepare(`
    UPDATE events SET name = COALESCE(?, name), event_date = ?, description = ?
    WHERE id = ?
  `).run(name?.trim(), event_date || null, (description || '').trim(), req.params.id);
  res.json({ success: true });
});

// Delete (own + draft/rejected, or admin)
router.delete('/:id', auth, (req, res) => {
  const ev = getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Introuvable.' });
  const isAdmin = ADMIN.has(req.session.role);
  if (!isAdmin && ev.organizer_role !== req.session.role)
    return res.status(403).json({ error: 'Non autorisé.' });
  if (!isAdmin && !['draft', 'rejected'].includes(ev.status))
    return res.status(400).json({ error: 'Événement déjà soumis.' });
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Submit for validation
router.post('/:id/submit', auth, (req, res) => {
  const ev = getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Introuvable.' });
  if (ev.organizer_role !== req.session.role && !ADMIN.has(req.session.role))
    return res.status(403).json({ error: 'Non autorisé.' });
  if (!['draft', 'rejected'].includes(ev.status))
    return res.status(400).json({ error: `Statut actuel : ${ev.status}` });
  db.prepare(`UPDATE events SET status='pending', submitted_at=CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
  res.json({ success: true });
});

// Validate (admin/president only)
router.post('/:id/validate', auth, (req, res) => {
  if (!ADMIN.has(req.session.role)) return res.status(403).json({ error: 'Réservé à la présidence.' });
  const ev = getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Introuvable.' });
  if (ev.status !== 'pending') return res.status(400).json({ error: 'Pas en attente.' });
  db.prepare(`
    UPDATE events SET status='validated', validated_by=?, validated_at=CURRENT_TIMESTAMP,
                      validation_comment=COALESCE(?, validation_comment) WHERE id = ?
  `).run(req.session.userId, req.body.comment || null, req.params.id);
  res.json({ success: true });
});

// Reject (admin/president only)
router.post('/:id/reject', auth, (req, res) => {
  if (!ADMIN.has(req.session.role)) return res.status(403).json({ error: 'Réservé à la présidence.' });
  const ev = getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Introuvable.' });
  if (ev.status !== 'pending') return res.status(400).json({ error: 'Pas en attente.' });
  const { comment } = req.body;
  if (!comment || !comment.trim()) return res.status(400).json({ error: 'Motif requis pour un refus.' });
  db.prepare(`
    UPDATE events SET status='rejected', validated_by=?, validated_at=CURRENT_TIMESTAMP, validation_comment=?
    WHERE id = ?
  `).run(req.session.userId, comment.trim(), req.params.id);
  res.json({ success: true });
});

/* ===== Event lines ===== */

function canEditLines(req, ev) {
  if (ADMIN.has(req.session.role)) return true;
  if (ev.organizer_role !== req.session.role) return false;
  return ['draft', 'rejected'].includes(ev.status);
}

router.post('/:id/lines', auth, (req, res) => {
  const ev = getEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Introuvable.' });
  if (!canEditLines(req, ev)) return res.status(403).json({ error: 'Non modifiable.' });
  const { label, amount, category, kind } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'Intitulé requis.' });
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: 'Montant invalide.' });
  if (!['expense', 'revenue'].includes(kind)) return res.status(400).json({ error: 'Type invalide.' });
  const r = db.prepare(`
    INSERT INTO event_lines (event_id, label, amount, category, kind) VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, label.trim(), amt, (category || '').trim() || null, kind);
  res.json({ success: true, id: r.lastInsertRowid });
});

router.put('/:eid/lines/:lid', auth, (req, res) => {
  const ev = getEvent(req.params.eid);
  if (!ev) return res.status(404).json({ error: 'Introuvable.' });
  if (!canEditLines(req, ev)) return res.status(403).json({ error: 'Non modifiable.' });
  const { label, amount, category, kind } = req.body;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt < 0) return res.status(400).json({ error: 'Montant invalide.' });
  db.prepare(`
    UPDATE event_lines SET label=?, amount=?, category=?, kind=? WHERE id=? AND event_id=?
  `).run(label.trim(), amt, (category || '').trim() || null, kind, req.params.lid, req.params.eid);
  res.json({ success: true });
});

router.delete('/:eid/lines/:lid', auth, (req, res) => {
  const ev = getEvent(req.params.eid);
  if (!ev) return res.status(404).json({ error: 'Introuvable.' });
  if (!canEditLines(req, ev)) return res.status(403).json({ error: 'Non modifiable.' });
  db.prepare('DELETE FROM event_lines WHERE id=? AND event_id=?').run(req.params.lid, req.params.eid);
  res.json({ success: true });
});

module.exports = router;
