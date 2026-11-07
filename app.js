const express = require('express');
const path = require('path');
const db = require('./db');
const { clean, checkPassword, signToken, readToken, pwStamp, audit, NOWS } = require('./lib');

const app = express();
app.set('trust proxy', 1);                       // behind Vercel's proxy, so req.ip is the visitor
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));   // used when running locally; Vercel serves /public itself

// Let route handlers be async: any error is passed to the error handler below.
for (const m of ['get', 'post', 'put', 'delete']) {
  const orig = app[m].bind(app);
  app[m] = (p, ...hs) => orig(p, ...hs.map(h => (typeof h === 'function' ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next) : h)));
}

const userView = u => u && ({ id: u.id, username: u.username, name: u.name, role: u.role, department: u.department, email: u.email, institution_id: u.institution_id, institution: u.institution || null });
const loadUser = id => db.get(`SELECT u.*, i.name AS institution FROM users u LEFT JOIN institutions i ON i.id = u.institution_id WHERE u.id = ? AND u.active = 1`, [id]);

app.use('/api', (req, res, next) => db.ensure().then(() => next(), next));

app.post('/api/login', async (req, res) => {
  const username = String(clean(req.body.username) || ''), password = String(req.body.password || '');
  const key = req.ip + '|' + username.toLowerCase(), a = await db.get('SELECT * FROM login_attempts WHERE key = ?', [key]);
  if (a && a.until_ms > Date.now()) return res.status(429).json({ error: 'Too many wrong attempts. Please wait a minute and try again.' });
  const u = await db.get('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
  if (!u || !checkPassword(password, u.password_hash)) {
    const n = (a ? a.n : 0) + 1;
    await db.run('INSERT INTO login_attempts (key, n, until_ms) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET n = excluded.n, until_ms = excluded.until_ms', [key, n, n >= 5 ? Date.now() + 60000 : 0]);
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  if (a) await db.run('DELETE FROM login_attempts WHERE key = ?', [key]);
  await audit(u, 'Signed in');
  res.json({ token: await signToken(u), user: userView(await loadUser(u.id)) });
});

app.use('/api', async (req, res, next) => {
  try {
    const p = await readToken((req.headers.authorization || '').replace('Bearer ', ''));
    const user = p && await loadUser(p.uid);
    if (!user || pwStamp(user.password_hash) !== p.pv) return res.status(401).json({ error: 'Please sign in again.' });
    req.user = user; next();
  } catch (e) { next(e); }
});
global.need = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Your account does not have permission to do this.' });

app.get('/api/me', (req, res) => res.json(userView(req.user)));
app.post('/api/logout', (req, res) => res.json({ ok: true }));   // the browser simply forgets the token
app.post('/api/me/password', async (req, res) => {
  const { current, next } = req.body || {};
  if (!checkPassword(current, req.user.password_hash)) return res.status(400).json({ error: 'Your current password is not correct.' });
  if (String(next || '').length < 6) return res.status(400).json({ error: 'The new password must be at least 6 characters.' });
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [db.hashPassword(next), req.user.id]);
  await audit(req.user, 'Changed own password');
  res.json({ token: await signToken({ ...req.user, password_hash: (await loadUser(req.user.id)).password_hash }) });   // new token, old ones stop working
});

/* ---------- Notifications (admins see store alerts, others see their own) ---------- */
const notifScope = u => (u.role === 'admin' ? ['(user_id IS NULL OR user_id = ?)', [u.id]] : ['user_id = ?', [u.id]]);
app.get('/api/notifications', async (req, res) => {
  const [w, p] = notifScope(req.user), staff = req.user.role !== 'requester';
  const [unread, items, pending] = await Promise.all([
    db.get(`SELECT COUNT(*) AS n FROM notifications WHERE is_read = 0 AND ${w}`, p),
    db.all(`SELECT * FROM notifications WHERE ${w} ORDER BY id DESC LIMIT 40`, p),
    staff ? db.get("SELECT COUNT(*) AS n FROM requisitions WHERE status = 'pending'") : null,
  ]);
  res.json({ unread: unread.n, items, pending: pending ? pending.n : 0 });
});
app.post('/api/notifications/read-all', async (req, res) => { const [w, p] = notifScope(req.user); await db.run(`UPDATE notifications SET is_read = 1 WHERE is_read = 0 AND ${w}`, p); res.json({ ok: true }); });
app.post('/api/notifications/:id/read', async (req, res) => { const [w, p] = notifScope(req.user); await db.run(`UPDATE notifications SET is_read = 1 WHERE id = ? AND ${w}`, [req.params.id, ...p]); res.json({ ok: true }); });
app.delete('/api/notifications', async (req, res) => { const [w, p] = notifScope(req.user); await db.run(`DELETE FROM notifications WHERE ${w}`, p); res.json({ ok: true }); });

require('./routes/items')(app);
require('./routes/issuing')(app);
require('./routes/reports')(app);
require('./routes/admin')(app);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (String(err.message).includes('UNIQUE')) return res.status(400).json({ error: 'That name or code is already in use.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. If this keeps happening, check the database settings.' });
});

module.exports = app;
