const crypto = require('crypto');
const db = require('./db');
const { NOWS, OFF, nowDate } = db;

const clean = v => (typeof v === 'string' ? v.trim() : v);
const posInt = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const nonNegInt = v => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : null; };
const money = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
const fail = (status, message) => { const e = new Error(message); e.status = status; return e; };

/* ---------- passwords and sign-in tokens (stateless, so they work on serverless hosting) ---------- */
function checkPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64), good = Buffer.from(hash, 'hex');
  return good.length === test.length && crypto.timingSafeEqual(good, test);
}
const pwStamp = hash => crypto.createHash('sha256').update(String(hash)).digest('hex').slice(0, 12);
async function signToken(user, hours = 8) {
  const body = Buffer.from(JSON.stringify({ uid: user.id, pv: pwStamp(user.password_hash), exp: Date.now() + hours * 3600 * 1000 })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', await db.secret()).update(body).digest('base64url');
}
async function readToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', await db.secret()).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}

/* ---------- optional email alerts (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM, ALERT_EMAIL) ---------- */
let transporter;
function mailer() {
  if (transporter !== undefined) return transporter;
  if (!process.env.SMTP_HOST) return (transporter = null);
  try {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = require('nodemailer').createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
  } catch { transporter = null; }
  return transporter;
}
async function sendAlertMail(subject, text) {
  const t = mailer(); if (!t) return;
  try {
    const to = [...(await db.all("SELECT email FROM users WHERE role='admin' AND active=1 AND email IS NOT NULL AND email <> ''")).map(r => r.email), process.env.ALERT_EMAIL].filter(Boolean);
    if (!to.length) return;
    await Promise.race([
      t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: [...new Set(to)].join(','), subject: '[Quest Stationery] ' + subject, text }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), 8000)),
    ]);
  } catch (e) { console.error('Alert email failed:', e.message); }
}

/* ---------- notifications and audit ---------- */
async function notify(type, title, message, link, userId = null) {
  await db.run(`INSERT INTO notifications (type, title, message, link, user_id, created_at) VALUES (?,?,?,?,?,datetime(${NOWS}))`, [type, title, message, link || null, userId]);
  if (Math.random() < 0.05) await db.run(`DELETE FROM notifications WHERE is_read = 1 AND created_at < datetime(${NOWS},'-60 days')`);
  if (!userId && (type === 'warning' || type === 'danger')) await sendAlertMail(title, message);
}
async function audit(user, action, detail) {
  await db.run(`INSERT INTO audit_log (user, action, detail, created_at) VALUES (?,?,?,datetime(${NOWS}))`, [user ? user.name : 'system', action, detail || null]);
}
async function stockAlert(name, unit, before, after, minStock) {
  if (after === 0 && before > 0) await notify('danger', 'Out of stock', `${name} is now out of stock. Restock it so it can be issued again.`, 'store');
  else if (after > 0 && after <= minStock && before > minStock) await notify('warning', 'Low stock', `${name} is down to ${after} ${unit} (minimum ${minStock}).`, 'store');
}
async function monthSpend(institution) {
  return (await db.get(`SELECT COALESCE(SUM((quantity - returned_qty) * unit_price),0) AS v FROM issues
    WHERE institution = ? AND strftime('%Y-%m', issued_at) = strftime('%Y-%m', ${NOWS})`, [institution])).v;
}
async function budgetCheck(institution, addedValue) {
  const inst = await db.get('SELECT * FROM institutions WHERE name = ?', [institution]);
  if (!inst || !(inst.monthly_budget > 0) || !(addedValue > 0)) return;
  const used = await monthSpend(institution), before = used - addedValue, b = inst.monthly_budget;
  const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
  if (used > b && before <= b) await notify('danger', 'Budget exceeded', `${institution} has used ${inr(used)} of its ${inr(b)} monthly stationery budget.`, 'reports');
  else if (used >= b * 0.9 && before < b * 0.9) await notify('warning', 'Budget almost used', `${institution} has used ${inr(used)} of its ${inr(b)} monthly budget (90%+).`, 'reports');
}

function toCsv(rows) {
  if (!rows.length) return '\ufeff';
  const cols = Object.keys(rows[0]), esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '\ufeff' + [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');   // BOM so Excel reads it correctly
}

module.exports = { clean, posInt, nonNegInt, money, fail, checkPassword, signToken, readToken, pwStamp, notify, audit, stockAlert, budgetCheck, monthSpend, toCsv, NOWS, OFF, nowDate };
