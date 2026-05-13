const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const fs = require('fs');

require('./db');

const app = express();
const PORT = process.env.PORT || 3002;

const sessionsDir = path.join(__dirname, 'data', 'sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new FileStore({ path: sessionsDir, ttl: 7 * 24 * 60 * 60, retries: 1 }),
  secret: process.env.SESSION_SECRET || 'uitvr-mod3-dev-secret',
  resave: false, saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));

app.get('/app', (req, res) => {
  if (!req.session.userId) return res.redirect('/');
  res.sendFile(path.join(__dirname, '../frontend/app.html'));
});

app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/app');
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.listen(PORT, () => console.log(`Module 3 (Événements) → http://localhost:${PORT}`));
