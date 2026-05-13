const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');

const db = require('./db');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const isProd = process.env.NODE_ENV === 'production';
app.use(cookieSession({
  name: 'uitvr',
  secret: process.env.SESSION_SECRET || 'uitvr-unified-secret-2024',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  secure: isProd,
  httpOnly: true,
  sameSite: isProd ? 'none' : 'lax',
}));

// Wait for DB before processing any API request
app.use('/api', async (req, res, next) => {
  try { await db.ready(); next(); }
  catch (e) { res.status(503).json({ error: 'Base de données non disponible.' }); }
});

app.use(express.static(path.join(__dirname, 'frontend')));

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/faq',       require('./routes/faq'));
app.use('/api/events',    require('./routes/events'));
app.use('/api/treasury',  require('./routes/treasury'));
app.use('/api/admin',     require('./routes/admin'));

function requireAuth(req, res) {
  if (!req.session.userId) { res.redirect('/'); return true; }
  return false;
}

const pages = [
  { path: '/dashboard', file: 'dashboard.html' },
  { path: '/faq',       file: 'faq.html' },
  { path: '/events',    file: 'events.html' },
  { path: '/treasury',  file: 'treasury.html' },
  { path: '/admin',     file: 'admin.html' },
];

for (const { path: p, file } of pages) {
  app.get(p, (req, res) => {
    if (requireAuth(req, res)) return;
    res.sendFile(path.join(__dirname, 'frontend', file));
  });
}

app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  db.ready().then(() => {
    app.listen(PORT, () => console.log(`UITVR → http://localhost:${PORT}`));
  });
}

module.exports = app;
