const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'uitvr.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    event_date DATE,
    description TEXT,
    organizer_role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME,
    validation_comment TEXT,
    validated_by INTEGER REFERENCES users(id),
    validated_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS event_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    category TEXT,
    kind TEXT NOT NULL DEFAULT 'expense',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_ev_status ON events(status);
  CREATE INDEX IF NOT EXISTS idx_ev_organizer ON events(organizer_role);
  CREATE INDEX IF NOT EXISTS idx_lines_ev ON event_lines(event_id);
`);

const count = db.prepare('SELECT COUNT(*) as n FROM users').get();
if (count.n === 0) {
  const hash = bcrypt.hashSync('azerty123', 10);
  const ins = db.prepare('INSERT INTO users (username, display_name, role, password_hash) VALUES (?, ?, ?, ?)');
  const accounts = [
    ['admin',         'Administrateur',              'admin'],
    ['president',     'Président / Vice-Président',  'president'],
    ['tresorier',     'Trésorier',                   'tresorier'],
    ['secretaire',    'Secrétaire',                  'secretaire'],
    ['sport',         'Pôle Sport & Événements',     'pole_sport'],
    ['partenariat',   'Pôle Partenariat',            'pole_partenariat'],
    ['communication', 'Pôle Communication',          'pole_communication'],
    ['intercentre',   'Pôle Intercentre',            'pole_intercentre'],
    ['viecampus',     'Pôle Vie de Campus',          'pole_vie_campus'],
    ['gala',          'Pôle Gala',                   'pole_gala'],
  ];
  for (const [u, d, r] of accounts) ins.run(u, d, r, hash);
  console.log('Module 3 — Comptes créés, mot de passe : azerty123');
}

module.exports = db;
