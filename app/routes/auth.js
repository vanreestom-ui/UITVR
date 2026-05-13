const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  if (user.is_active === 0)
    return res.status(403).json({ error: 'Compte désactivé.' });
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ success: true, user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role } });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Non authentifié.' });
  const user = db.prepare('SELECT id, username, display_name, role, last_login FROM users WHERE id = ?').get(req.session.userId);
  if (!user) { req.session = null; return res.status(401).json({ error: 'Session invalide.' }); }
  res.json({ user });
});

module.exports = router;
