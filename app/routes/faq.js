const express = require('express');
const db = require('../db');

const router = express.Router();

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié.' });
  next();
}

/* ===== Questions ===== */

// List questions with filter
router.get('/questions', auth, (req, res) => {
  const filter = req.query.filter || 'all';
  const me = req.session.userId;
  const myRole = req.session.role;

  let where = '1=1';
  const params = [];

  if (filter === 'mine') {
    where += ' AND q.author_id = ?';
    params.push(me);
  } else if (filter === 'tome') {
    where += ` AND (',' || q.target_roles || ',') LIKE ?`;
    params.push(`%,${myRole},%`);
  }

  const questions = db.prepare(`
    SELECT q.*, u.display_name AS author_name, u.role AS author_role,
      (SELECT COUNT(*) FROM answers WHERE question_id = q.id) AS answer_count
    FROM questions q
    JOIN users u ON u.id = q.author_id
    WHERE ${where}
    ORDER BY q.created_at DESC
  `).all(...params);

  res.json({ questions });
});

// Get one question with all answers
router.get('/questions/:id', auth, (req, res) => {
  const q = db.prepare(`
    SELECT q.*, u.display_name AS author_name, u.role AS author_role
    FROM questions q JOIN users u ON u.id = q.author_id
    WHERE q.id = ?
  `).get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Question introuvable.' });

  const answers = db.prepare(`
    SELECT a.*, u.display_name AS author_name, u.role AS author_role
    FROM answers a JOIN users u ON u.id = a.author_id
    WHERE a.question_id = ?
    ORDER BY a.is_primary DESC, a.created_at ASC
  `).all(req.params.id);

  res.json({ question: q, answers });
});

// Create question
router.post('/questions', auth, (req, res) => {
  const { title, body, target_roles } = req.body;
  if (!title || !target_roles || !Array.isArray(target_roles) || target_roles.length === 0) {
    return res.status(400).json({ error: 'Titre et au moins un pôle destinataire requis.' });
  }
  const roles = target_roles.join(',');
  const r = db.prepare(
    'INSERT INTO questions (author_id, title, body, target_roles) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, title.trim(), (body || '').trim(), roles);
  res.json({ success: true, id: r.lastInsertRowid });
});

// Delete own question
router.delete('/questions/:id', auth, (req, res) => {
  const q = db.prepare('SELECT author_id FROM questions WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Question introuvable.' });
  if (q.author_id !== req.session.userId && req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Action non autorisée.' });
  }
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Add answer
router.post('/questions/:id/answers', auth, (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Réponse vide.' });

  const q = db.prepare('SELECT target_roles FROM questions WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Question introuvable.' });

  const targets = q.target_roles.split(',');
  const isPrimary = targets.includes(req.session.role) ? 1 : 0;

  const r = db.prepare(
    'INSERT INTO answers (question_id, author_id, body, is_primary) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, req.session.userId, body.trim(), isPrimary);

  // Mark question answered if a primary (targeted pole) answered
  if (isPrimary) {
    db.prepare("UPDATE questions SET status = 'answered' WHERE id = ?").run(req.params.id);
  }

  res.json({ success: true, id: r.lastInsertRowid });
});

// Delete own answer
router.delete('/answers/:id', auth, (req, res) => {
  const a = db.prepare('SELECT author_id, question_id FROM answers WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Réponse introuvable.' });
  if (a.author_id !== req.session.userId && req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Action non autorisée.' });
  }
  db.prepare('DELETE FROM answers WHERE id = ?').run(req.params.id);

  // Recompute status
  const remainingPrimary = db.prepare(
    'SELECT COUNT(*) as n FROM answers WHERE question_id = ? AND is_primary = 1'
  ).get(a.question_id);
  if (remainingPrimary.n === 0) {
    db.prepare("UPDATE questions SET status = 'open' WHERE id = ?").run(a.question_id);
  }
  res.json({ success: true });
});

/* ===== Announcements ===== */

router.get('/announcements', auth, (_req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.display_name AS author_name, u.role AS author_role
    FROM announcements a JOIN users u ON u.id = a.author_id
    ORDER BY a.created_at DESC
  `).all();
  res.json({ announcements: rows });
});

router.post('/announcements', auth, (req, res) => {
  const { title, body } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Titre requis.' });
  const r = db.prepare(
    'INSERT INTO announcements (author_id, title, body) VALUES (?, ?, ?)'
  ).run(req.session.userId, title.trim(), (body || '').trim());
  res.json({ success: true, id: r.lastInsertRowid });
});

router.delete('/announcements/:id', auth, (req, res) => {
  const a = db.prepare('SELECT author_id FROM announcements WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Annonce introuvable.' });
  if (a.author_id !== req.session.userId && req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Action non autorisée.' });
  }
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
