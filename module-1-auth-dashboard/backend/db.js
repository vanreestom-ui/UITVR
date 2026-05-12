const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'uitvr.db'));
db.pragma('journal_mode = WAL');

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
`);

const count = db.prepare('SELECT COUNT(*) as n FROM users').get();
if (count.n === 0) {
  const hash = bcrypt.hashSync('uitvr2024', 10);
  const insert = db.prepare(
    'INSERT INTO users (username, display_name, role, password_hash) VALUES (?, ?, ?, ?)'
  );
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
  for (const [username, display_name, role] of accounts) {
    insert.run(username, display_name, role, hash);
  }
  console.log('Comptes créés — mot de passe par défaut : uitvr2024');
}

module.exports = db;
