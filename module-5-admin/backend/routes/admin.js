const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

const VALID_ROLES = ['admin', 'president', 'tresorier', 'secretaire',
  'pole_sport', 'pole_partenariat', 'pole_communication',
  'pole_intercentre', 'pole_vie_campus', 'pole_gala'];

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié.' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'administrateur.' });
  next();
}

function log(actorId, targetId, action, details) {
  db.prepare(`INSERT INTO admin_log (actor_id, target_user_id, action, details) VALUES (?, ?, ?, ?)`)
    .run(actorId, targetId || null, action, details || null);
}

// List users
router.get('/users', requireAdmin, (_req, res) => {
  const users = db.prepare(`
    SELECT id, username, display_name, role, last_login, created_at, is_active
    FROM users ORDER BY id
  `).all();
  res.json({ users });
});

// Recent admin activity
router.get('/log', requireAdmin, (_req, res) => {
  const log = db.prepare(`
    SELECT l.*, a.display_name AS actor_name, t.display_name AS target_name
    FROM admin_log l
    LEFT JOIN users a ON a.id = l.actor_id
    LEFT JOIN users t ON t.id = l.target_user_id
    ORDER BY l.created_at DESC
    LIMIT 30
  `).all();
  res.json({ log });
});

// Create user
router.post('/users', requireAdmin, (req, res) => {
  const { username, display_name, role, password } = req.body;
  if (!username || !display_name || !role || !password)
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ error: 'Rôle invalide.' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Mot de passe trop court (minimum 6 caractères).' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return res.status(409).json({ error: 'Identifiant déjà utilisé.' });

  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare(`
    INSERT INTO users (username, display_name, role, password_hash) VALUES (?, ?, ?, ?)
  `).run(username.trim(), display_name.trim(), role, hash);
  log(req.session.userId, r.lastInsertRowid, 'create_user', `${username} (${role})`);
  res.json({ success: true, id: r.lastInsertRowid });
});

// Update user (display_name, role, is_active)
router.put('/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const { display_name, role, is_active, username } = req.body;
  if (role && !VALID_ROLES.includes(role))
    return res.status(400).json({ error: 'Rôle invalide.' });

  // Prevent self-locking (admin can't demote/disable themselves)
  if (id === req.session.userId && (role && role !== 'admin'))
    return res.status(400).json({ error: 'Vous ne pouvez pas changer votre propre rôle d\'admin.' });
  if (id === req.session.userId && is_active === 0)
    return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' });

  // If renaming username, check unique
  if (username && username.trim() !== user.username) {
    const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), id);
    if (taken) return res.status(409).json({ error: 'Identifiant déjà utilisé.' });
  }

  db.prepare(`
    UPDATE users SET
      display_name = COALESCE(?, display_name),
      username     = COALESCE(?, username),
      role         = COALESCE(?, role),
      is_active    = COALESCE(?, is_active)
    WHERE id = ?
  `).run(
    display_name?.trim() ?? null,
    username?.trim() ?? null,
    role ?? null,
    typeof is_active === 'number' ? is_active : null,
    id
  );
  log(req.session.userId, id, 'update_user', JSON.stringify({ display_name, role, is_active, username }));
  res.json({ success: true });
});

// Reset password
router.post('/users/:id/reset-password', requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Mot de passe trop court (min. 6 caractères).' });
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  log(req.session.userId, id, 'reset_password', null);
  res.json({ success: true });
});

// Delete user
router.delete('/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.session.userId)
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Introuvable.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  log(req.session.userId, null, 'delete_user', user.username);
  res.json({ success: true });
});

module.exports = router;
