const db = require('../db');
const { clean, money, fail, audit, monthSpend } = require('../lib');

// Tables included in a backup, in an order that is safe to restore
const BACKUP_TABLES = ['institutions', 'users', 'items', 'stock_in', 'vouchers', 'issues', 'requisitions', 'requisition_lines', 'adjustments', 'audit_log', 'notifications'];

module.exports = app => {
  const admin = global.need('admin');

  /* ---------- Institutions ---------- */
  app.get('/api/institutions', async (req, res) => {
    const rows = await db.all('SELECT id, name, monthly_budget FROM institutions ORDER BY name COLLATE NOCASE');
    if (req.user.role === 'requester') return res.json(rows.map(r => ({ id: r.id, name: r.name })));
    const out = []; for (const r of rows) out.push({ ...r, used: await monthSpend(r.name) });
    res.json(out);
  });
  app.post('/api/institutions', admin, async (req, res) => {
    const name = clean(req.body.name), budget = money(req.body.monthly_budget ?? 0);
    if (!name) throw fail(400, 'Institution name is required.');
    if (budget === null) throw fail(400, 'Budget must be a number, 0 or more.');
    const info = await db.run('INSERT INTO institutions (name, monthly_budget) VALUES (?,?)', [name, budget]);
    await audit(req.user, 'Added institution', name);
    res.status(201).json({ id: info.lastInsertRowid });
  });
  app.put('/api/institutions/:id', admin, async (req, res) => {
    const cur = await db.get('SELECT * FROM institutions WHERE id = ?', [req.params.id]);
    if (!cur) throw fail(404, 'Institution not found.');
    const name = clean(req.body.name) || cur.name, budget = req.body.monthly_budget === undefined ? cur.monthly_budget : money(req.body.monthly_budget);
    if (budget === null) throw fail(400, 'Budget must be a number, 0 or more.');
    await db.tx(async x => {
      await x.run('UPDATE institutions SET name = ?, monthly_budget = ? WHERE id = ?', [name, budget, cur.id]);
      if (name !== cur.name) for (const t of ['issues', 'vouchers', 'requisitions']) await x.run(`UPDATE ${t} SET institution = ? WHERE institution = ?`, [name, cur.name]);
    });
    await audit(req.user, 'Edited institution', `${cur.name}${name !== cur.name ? ' → ' + name : ''}, budget ₹${budget}`);
    res.json({ ok: true });
  });
  app.delete('/api/institutions/:id', admin, async (req, res) => {
    const cur = await db.get('SELECT * FROM institutions WHERE id = ?', [req.params.id]);
    if (!cur) throw fail(404, 'Institution not found.');
    const used = (await db.get('SELECT (SELECT COUNT(*) FROM issues WHERE institution = ?) + (SELECT COUNT(*) FROM users WHERE institution_id = ?) AS n', [cur.name, cur.id])).n;
    if (used) throw fail(400, 'This institution has records or users linked to it, so it cannot be deleted.');
    await db.run('DELETE FROM institutions WHERE id = ?', [cur.id]);
    await audit(req.user, 'Deleted institution', cur.name);
    res.json({ ok: true });
  });

  /* ---------- Users ---------- */
  const ROLES = ['admin', 'requester', 'viewer'];
  const adminCount = async () => (await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1")).n;
  app.get('/api/users', admin, async (req, res) => res.json(await db.all(
    `SELECT u.id, u.username, u.name, u.role, u.department, u.email, u.active, u.institution_id, i.name AS institution
     FROM users u LEFT JOIN institutions i ON i.id = u.institution_id ORDER BY u.active DESC, u.role, u.name`)));

  async function userFields(b, cur) {
    const role = b.role === undefined ? cur.role : b.role;
    if (!ROLES.includes(role)) throw fail(400, 'Choose a valid role.');
    const instId = b.institution_id === undefined ? ((cur && cur.institution_id) ?? null) : (Number(b.institution_id) || null);
    if (role === 'requester' && !instId) throw fail(400, 'A department user must be linked to an institution.');
    if (instId && !(await db.get('SELECT 1 AS x FROM institutions WHERE id = ?', [instId]))) throw fail(400, 'That institution does not exist.');
    return {
      role, instId: instId || null, name: clean(b.name) || (cur && cur.name),
      department: b.department === undefined ? ((cur && cur.department) ?? null) : (clean(b.department) || null),
      email: b.email === undefined ? ((cur && cur.email) ?? null) : (clean(b.email) || null),
    };
  }
  app.post('/api/users', admin, async (req, res) => {
    const username = clean(req.body.username), password = String(req.body.password || '');
    const f = await userFields(req.body, { role: 'requester' });
    if (!username || !/^[A-Za-z0-9._-]{3,30}$/.test(username)) throw fail(400, 'Username must be 3 to 30 letters, numbers, dots, dashes or underscores.');
    if (!f.name) throw fail(400, 'Full name is required.');
    if (password.length < 6) throw fail(400, 'Password must be at least 6 characters.');
    try {
      await db.run(`INSERT INTO users (username, name, password_hash, role, institution_id, department, email, created_at) VALUES (?,?,?,?,?,?,?,datetime(${db.NOWS}))`,
        [username, f.name, db.hashPassword(password), f.role, f.instId, f.department, f.email]);
    } catch (e) { if (String(e.message).includes('UNIQUE')) throw fail(400, 'That username is already taken.'); throw e; }
    await audit(req.user, 'Created user', `${username} (${f.role})`);
    res.status(201).json({ ok: true });
  });
  app.put('/api/users/:id', admin, async (req, res) => {
    const cur = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!cur) throw fail(404, 'User not found.');
    const f = await userFields(req.body, cur), active = req.body.active === undefined ? cur.active : (req.body.active ? 1 : 0);
    if (cur.role === 'admin' && (f.role !== 'admin' || !active) && (await adminCount()) <= 1) throw fail(400, 'There must always be at least one active store administrator.');
    if (cur.id === req.user.id && !active) throw fail(400, 'You cannot deactivate your own account.');
    if (req.body.password && String(req.body.password).length < 6) throw fail(400, 'Password must be at least 6 characters.');
    await db.run('UPDATE users SET name=?, role=?, institution_id=?, department=?, email=?, active=? WHERE id=?', [f.name, f.role, f.instId, f.department, f.email, active, cur.id]);
    if (req.body.password) await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [db.hashPassword(req.body.password), cur.id]);
    await audit(req.user, 'Edited user', `${cur.username}${req.body.password ? ' (password reset)' : ''}${active ? '' : ' (deactivated)'}`);
    res.json({ ok: true });
  });

  /* ---------- Audit log and backup ---------- */
  app.get('/api/audit', admin, async (req, res) => {
    const q = `%${clean(req.query.q) || ''}%`;
    res.json(await db.all("SELECT * FROM audit_log WHERE user LIKE ? OR action LIKE ? OR IFNULL(detail,'') LIKE ? ORDER BY id DESC LIMIT 300", [q, q, q]));
  });
  // A copy of all the data as one file. (Item photos are left out here to keep the file small; `npm run backup` includes them.)
  app.get('/api/backup', admin, async (req, res) => {
    const tables = {};
    for (const t of BACKUP_TABLES) tables[t] = await db.all(t === 'items' ? 'SELECT id, name, category, unit, quantity, min_stock, unit_price, barcode, created_at FROM items' : `SELECT * FROM ${t}`);
    await audit(req.user, 'Downloaded backup');
    const d = new Date(Date.now() + db.OFF * 60000), stamp = d.toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="stationery-backup-${stamp}.json"`);
    res.send(JSON.stringify({ app: 'quest-stationery', version: 3, exported_at: d.toISOString(), photos_included: false, tables }));
  });
};
module.exports.BACKUP_TABLES = BACKUP_TABLES;
