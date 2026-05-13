const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

let _db = null;
let _readyResolve;
const _readyPromise = new Promise(r => { _readyResolve = r; });

/* ===== Wrapper sql.js → API compatible better-sqlite3 ===== */
class SqlJsDb {
  constructor(sqlDb) { this._sql = sqlDb; }

  pragma() { return this; }

  exec(sql) {
    this._sql.exec(sql);
    return this;
  }

  prepare(sql) {
    const s = this._sql;
    const toArr = a => (!a.length ? [] : a.length === 1 && Array.isArray(a[0]) ? a[0] : [...a]);
    return {
      run(...args) {
        s.run(sql, toArr(args));
        const changes = s.getRowsModified();
        const r = s.exec('SELECT last_insert_rowid()');
        return { lastInsertRowid: r[0]?.values[0][0] ?? null, changes };
      },
      get(...args) {
        const stmt = s.prepare(sql);
        stmt.bind(toArr(args));
        const row = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.free();
        return row;
      },
      all(...args) {
        const stmt = s.prepare(sql);
        stmt.bind(toArr(args));
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
      },
    };
  }
}

/* ===== Initialisation asynchrone ===== */
(async () => {
  try {
    const sqlJsDir = path.dirname(require.resolve('sql.js'));
    const wasmPath = path.join(sqlJsDir, 'sql-wasm.wasm');
    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary });
    const sqlDb = new SQL.Database();
    _db = new SqlJsDb(sqlDb);

    _db.exec(`
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
        question_id INTEGER NOT NULL REFERENCES questions(id),
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
        event_id INTEGER NOT NULL REFERENCES events(id),
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
    `);

    const count = _db.prepare('SELECT COUNT(*) as n FROM users').get();
    if (!count || count.n === 0) {
      const hash = bcrypt.hashSync('azerty123', 10);
      const ins = _db.prepare(
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
      console.log('UITVR — Comptes initialisés, mot de passe : azerty123');
    }

    _readyResolve(_db);
    console.log('UITVR — Base de données prête.');
  } catch (err) {
    console.error('UITVR — Erreur initialisation DB:', err);
  }
})();

/* ===== Proxy synchrone (accès via require('../db')) ===== */
const proxy = new Proxy({}, {
  get(_, prop) {
    if (prop === 'ready') return () => _readyPromise;
    if (!_db) throw new Error(`DB non initialisée (accès à .${String(prop)})`);
    const val = _db[prop];
    return typeof val === 'function' ? val.bind(_db) : val;
  },
});

module.exports = proxy;
