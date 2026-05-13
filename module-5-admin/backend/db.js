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
    last_login DATETIME,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER NOT NULL REFERENCES users(id),
    target_user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
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
  console.log('Module 5 — Comptes créés, mot de passe : azerty123');
}

module.exports = db;
