const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DB_PATH ||
  (process.env.AWS_LAMBDA_FUNCTION_NAME ? '/tmp/uitvr' : path.join(__dirname, 'data'));
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

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT,
    target_roles TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  CREATE TABLE IF NOT EXISTS treasury_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    label TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    category TEXT,
    kind TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'provisional',
    source TEXT NOT NULL DEFAULT 'manual',
    event_id INTEGER,
    comment TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER NOT NULL REFERENCES users(id),
    target_user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_q_target ON questions(target_roles);
  CREATE INDEX IF NOT EXISTS idx_a_question ON answers(question_id);
  CREATE INDEX IF NOT EXISTS idx_ev_status ON events(status);
  CREATE INDEX IF NOT EXISTS idx_ev_organizer ON events(organizer_role);
  CREATE INDEX IF NOT EXISTS idx_lines_ev ON event_lines(event_id);
  CREATE INDEX IF NOT EXISTS idx_tr_role ON treasury_lines(role);
  CREATE INDEX IF NOT EXISTS idx_tr_state ON treasury_lines(state);
  CREATE INDEX IF NOT EXISTS idx_tr_kind ON treasury_lines(kind);
`);

const count = db.prepare('SELECT COUNT(*) as n FROM users').get();
if (count.n === 0) {
  const hash = bcrypt.hashSync('azerty123', 10);
  const ins = db.prepare(
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
  for (const [u, d, r] of accounts) ins.run(u, d, r, hash);
  console.log('UITVR — Comptes créés, mot de passe par défaut : azerty123');
}

module.exports = db;
