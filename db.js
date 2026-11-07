/* Database layer. Works with a hosted Turso database (for Vercel) or a local file (for your own computer).
   Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to use Turso; leave them out to use the local file stationery.db */
const path = require('path');
const crypto = require('crypto');

const REMOTE = process.env.TURSO_DATABASE_URL;
const URL_ = REMOTE || 'file:' + (process.env.DB_PATH || path.join(__dirname, 'stationery.db'));
// The remote client is pure JavaScript; the file client is only loaded when a local file is used.
const { createClient } = REMOTE ? require('@libsql/client/web') : require('@libsql/client');
const client = createClient({ url: URL_, authToken: process.env.TURSO_AUTH_TOKEN });

/* Time zone: Vercel servers run in UTC, so we store times shifted to the college's time zone (India, +5:30 by default). */
const OFF = Number(process.env.TZ_OFFSET_MINUTES ?? 330);
const NOWS = `'now','${OFF >= 0 ? '+' : ''}${OFF} minutes'`;
const nowDate = () => new Date(Date.now() + OFF * 60000);   // read it with the getUTC... methods

const plain = rs => rs.rows.map(r => Object.fromEntries(rs.columns.map((c, i) => [c, typeof r[i] === 'bigint' ? Number(r[i]) : r[i]])));
const wrap = ex => {
  const api = {
    all: async (sql, args = []) => plain(await ex.execute({ sql, args: args.map(a => (a === undefined ? null : a)) })),
    get: async (sql, args = []) => (await api.all(sql, args))[0],
    run: async (sql, args = []) => {
      const rs = await ex.execute({ sql, args: args.map(a => (a === undefined ? null : a)) });
      return { changes: rs.rowsAffected, lastInsertRowid: Number(rs.lastInsertRowid ?? 0) };
    },
  };
  return api;
};
const db = wrap(client);
db.client = client;
db.url = URL_;
db.exec = sql => client.executeMultiple(sql);
// Run several statements as one all-or-nothing unit: await db.tx(async x => { await x.run(...); ... })
db.tx = async fn => {
  const t = await client.transaction('write');
  try { const r = await fn(wrap(t)); await t.commit(); return r; }
  catch (e) { try { await t.rollback(); } catch {} throw e; }
  finally { t.close(); }
};

db.hashPassword = p => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(p, salt, 64).toString('hex'); };

const SCHEMA_VERSION = 3;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS institutions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, monthly_budget REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'requester', institution_id INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
  department TEXT, email TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, category TEXT NOT NULL DEFAULT 'General', unit TEXT NOT NULL DEFAULT 'pcs',
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0), min_stock INTEGER NOT NULL DEFAULT 10, unit_price REAL NOT NULL DEFAULT 0,
  barcode TEXT, photo TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS stock_in (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE, quantity INTEGER NOT NULL CHECK (quantity > 0),
  supplier TEXT, note TEXT, bill_no TEXT, rate REAL, added_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, voucher_no TEXT, institution TEXT NOT NULL, department TEXT, issued_to TEXT NOT NULL,
  issued_by TEXT, note TEXT, requisition_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE, quantity INTEGER NOT NULL CHECK (quantity > 0),
  institution TEXT NOT NULL, department TEXT, issued_to TEXT NOT NULL, note TEXT, issued_by TEXT, voucher_id INTEGER,
  unit_price REAL NOT NULL DEFAULT 0, returned_qty INTEGER NOT NULL DEFAULT 0, issued_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS requisitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, req_no TEXT, user_id INTEGER NOT NULL REFERENCES users(id), institution TEXT NOT NULL, department TEXT,
  requested_by TEXT NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'pending', decided_by TEXT, decided_at TEXT, decision_note TEXT,
  voucher_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS requisition_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, requisition_id INTEGER NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE, quantity INTEGER NOT NULL CHECK (quantity > 0), approved_qty INTEGER);
CREATE TABLE IF NOT EXISTS adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE, delta INTEGER NOT NULL,
  kind TEXT NOT NULL, reason TEXT NOT NULL, done_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL DEFAULT 'info', title TEXT NOT NULL, message TEXT NOT NULL, link TEXT,
  is_read INTEGER NOT NULL DEFAULT 0, user_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, n INTEGER NOT NULL, until_ms INTEGER NOT NULL DEFAULT 0);
`;
const INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE INDEX IF NOT EXISTS idx_issues_item ON issues(item_id);
CREATE INDEX IF NOT EXISTS idx_issues_date ON issues(issued_at);
CREATE INDEX IF NOT EXISTS idx_issues_voucher ON issues(voucher_id);
CREATE INDEX IF NOT EXISTS idx_stockin_item ON stock_in(item_id);
CREATE INDEX IF NOT EXISTS idx_req_user ON requisitions(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
`;

async function addColumn(table, col, def) {
  if (!(await db.all(`PRAGMA table_info(${table})`)).some(c => c.name === col)) await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

async function init() {
  await client.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
  const v = await db.get("SELECT value FROM settings WHERE key = 'schema_version'");
  if (!v || Number(v.value) < SCHEMA_VERSION) {
    await db.exec(SCHEMA);
    // upgrade databases made by earlier versions
    for (const [t, c, d] of [['items', 'unit_price', 'REAL NOT NULL DEFAULT 0'], ['items', 'barcode', 'TEXT'], ['items', 'photo', 'TEXT'],
      ['stock_in', 'bill_no', 'TEXT'], ['stock_in', 'rate', 'REAL'], ['issues', 'issued_by', 'TEXT'], ['issues', 'voucher_id', 'INTEGER'],
      ['issues', 'unit_price', 'REAL NOT NULL DEFAULT 0'], ['issues', 'returned_qty', 'INTEGER NOT NULL DEFAULT 0'], ['notifications', 'user_id', 'INTEGER']]) await addColumn(t, c, d);
    await db.exec(INDEXES);
    await client.execute("INSERT OR IGNORE INTO institutions (name) SELECT DISTINCT institution FROM issues WHERE institution <> ''");
    if (!(await db.get('SELECT 1 AS x FROM users LIMIT 1'))) {
      await db.run('INSERT INTO users (username, name, password_hash, role, created_at) VALUES (?,?,?,?,datetime(' + NOWS + '))',
        [process.env.ADMIN_USER || 'admin', process.env.ADMIN_NAME || 'Miss Surjeet Kaur', db.hashPassword(process.env.ADMIN_PASS || 'admin123'), 'admin']);
    }
    if (!v && !(await db.get('SELECT 1 AS x FROM items LIMIT 1'))) {      // brand new database: add a few sample items
      for (const r of [['A4 Paper Ream (75 GSM)', 'Paper', 'ream', 120, 30, 230], ['Ball Pen - Blue', 'Writing', 'pcs', 500, 100, 5],
        ['Whiteboard Marker - Black', 'Writing', 'pcs', 80, 25, 25], ['Stapler (Medium)', 'Office', 'pcs', 15, 5, 120], ['Notebook 200 pages', 'Paper', 'pcs', 150, 40, 60]])
        await db.run('INSERT INTO items (name, category, unit, quantity, min_stock, unit_price, created_at) VALUES (?,?,?,?,?,?,datetime(' + NOWS + '))', r);
    }
    await client.execute({ sql: "INSERT OR IGNORE INTO settings (key, value) VALUES ('session_secret', ?)", args: [crypto.randomBytes(32).toString('hex')] });
    await client.execute({ sql: "INSERT INTO settings (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [String(SCHEMA_VERSION)] });
  }
}
// Set-up runs once per server instance. If it fails (for example the database is unreachable) the next request tries again.
let readyPromise;
db.ensure = () => readyPromise || (readyPromise = init().catch(e => { readyPromise = null; throw e; }));

let secret;
db.secret = async () => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!secret) secret = (await db.get("SELECT value FROM settings WHERE key = 'session_secret'")).value;
  return secret;
};

db.NOWS = NOWS; db.OFF = OFF; db.nowDate = nowDate;
module.exports = db;
