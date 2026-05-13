const express = require('express');
const db = require('../db');

const router = express.Router();

const ADMIN_ROLES = new Set(['admin', 'president']);
const FINANCE_ROLES = new Set(['admin', 'president', 'tresorier']);

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non authentifié.' });
  next();
}

router.get('/data', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, username, display_name, role, last_login FROM users WHERE id = ?')
    .get(req.session.userId);

  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Session invalide.' });
  }

  const { role } = user;

  const permissions = {
    canViewAllFinances: FINANCE_ROLES.has(role),
    canValidateEvents: ADMIN_ROLES.has(role),
    canManageAccounts: role === 'admin',
    canViewAllData: ADMIN_ROLES.has(role),
    canViewOwnFinances: true,
  };

  const payload = { user, permissions, modules: getModuleStatus() };

  // Admin sees all accounts (for the admin section preview)
  if (role === 'admin') {
    payload.accounts = db
      .prepare('SELECT id, username, display_name, role, last_login FROM users ORDER BY id')
      .all();
  }

  res.json(payload);
});

function getModuleStatus() {
  return [
    { key: 'auth',     label: 'Authentification & Tableau de bord', status: 'active', url: '/dashboard' },
    { key: 'faq',      label: 'FAQ & Annonces',                      status: 'active', url: '/faq' },
    { key: 'events',   label: 'Événements',                          status: 'active', url: '/events' },
    { key: 'treasury', label: 'Trésorerie',                          status: 'active', url: '/treasury' },
    { key: 'admin',    label: 'Interface Administration',            status: 'active', url: '/admin' },
  ];
}

module.exports = router;
