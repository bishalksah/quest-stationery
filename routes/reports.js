const db = require('../db');
const { monthSpend, NOWS, nowDate } = require('../lib');

function lastMonths(n) {
  const base = nowDate(), out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// Suggest what to order: cover the next 30 days of usage plus the minimum buffer.
async function reorderList() {
  const rows = await db.all(`
    SELECT it.id, it.name, it.unit, it.quantity, it.min_stock, it.unit_price,
      COALESCE((SELECT SUM(i.quantity - i.returned_qty) FROM issues i WHERE i.item_id = it.id AND i.issued_at >= datetime(${NOWS},'-30 days')), 0) AS used_30
    FROM items it`);
  return rows.map(r => {
    const daily = r.used_30 / 30;
    return { ...r, daily: Math.round(daily * 10) / 10, days_left: daily > 0 ? Math.floor(r.quantity / daily) : null, suggested: Math.max(0, Math.ceil(daily * 30 + r.min_stock - r.quantity)) };
  }).filter(r => r.suggested > 0 && (r.used_30 > 0 || r.quantity <= r.min_stock)).sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999));
}

module.exports = app => {
  const staff = global.need('admin', 'viewer');

  app.get('/api/summary', async (req, res) => {
    if (req.user.role === 'requester') {
      const rows = await db.all('SELECT status, COUNT(*) AS n FROM requisitions WHERE user_id = ? GROUP BY status', [req.user.id]);
      const c = s => (rows.find(r => r.status === s) || { n: 0 }).n;
      return res.json({
        mine: { pending: c('pending'), approved: c('approved'), rejected: c('rejected') },
        recent: await db.all('SELECT id, req_no, status, created_at, (SELECT COUNT(*) FROM requisition_lines WHERE requisition_id = requisitions.id) AS line_count FROM requisitions WHERE user_id = ? ORDER BY id DESC LIMIT 6', [req.user.id]),
      });
    }
    const months = lastMonths(6);
    const [t, trend, today, pending, lowItems, recent] = await Promise.all([
      db.get(`SELECT COUNT(*) AS items, COALESCE(SUM(quantity),0) AS units, COALESCE(SUM(quantity * unit_price),0) AS value,
              COALESCE(SUM(CASE WHEN quantity <= min_stock THEN 1 ELSE 0 END),0) AS low FROM items`),
      db.all(`SELECT strftime('%Y-%m', issued_at) AS m, SUM(quantity - returned_qty) AS units FROM issues WHERE issued_at >= date(${NOWS},'start of month','-5 months') GROUP BY m`),
      db.get(`SELECT COALESCE(SUM(quantity - returned_qty),0) AS n FROM issues WHERE date(issued_at) = date(${NOWS})`),
      db.get("SELECT COUNT(*) AS n FROM requisitions WHERE status = 'pending'"),
      db.all('SELECT id, name, quantity, min_stock, unit FROM items WHERE quantity <= min_stock ORDER BY quantity * 1.0 / MAX(min_stock,1) ASC LIMIT 6'),
      db.all(`SELECT i.id, i.voucher_id, v.voucher_no, it.name AS item, i.quantity, it.unit, i.institution, i.issued_to, i.issued_at
              FROM issues i JOIN items it ON it.id = i.item_id LEFT JOIN vouchers v ON v.id = i.voucher_id ORDER BY i.id DESC LIMIT 6`),
    ]);
    res.json({ ...t, issuedToday: today.n, pending: pending.n, lowItems, recent, trend: months.map(m => ({ month: m, units: (trend.find(x => x.m === m) || {}).units || 0 })) });
  });

  app.get('/api/reports/overview', staff, async (req, res) => {
    const n = Math.min(12, Math.max(3, Number(req.query.months) || 6)), months = lastMonths(n), since = `date(${NOWS},'start of month','-${n - 1} months')`;
    const [cons, purchases, byInstitution, topItems, suppliers, insts, reorder] = await Promise.all([
      db.all(`SELECT strftime('%Y-%m', issued_at) AS m, institution, SUM(quantity - returned_qty) AS units, SUM((quantity - returned_qty) * unit_price) AS value FROM issues WHERE issued_at >= ${since} GROUP BY m, institution`),
      db.all(`SELECT strftime('%Y-%m', added_at) AS m, SUM(quantity * COALESCE(rate,0)) AS spend FROM stock_in WHERE added_at >= ${since} GROUP BY m`),
      db.all(`SELECT institution, SUM(quantity - returned_qty) AS units, SUM((quantity - returned_qty) * unit_price) AS value FROM issues WHERE issued_at >= ${since} GROUP BY institution ORDER BY value DESC`),
      db.all(`SELECT it.name, it.unit, SUM(i.quantity - i.returned_qty) AS units FROM issues i JOIN items it ON it.id = i.item_id WHERE i.issued_at >= datetime(${NOWS},'-90 days') GROUP BY it.id HAVING units > 0 ORDER BY units DESC LIMIT 8`),
      db.all(`SELECT supplier, SUM(quantity * COALESCE(rate,0)) AS spend, COUNT(*) AS orders FROM stock_in WHERE supplier IS NOT NULL AND supplier <> '' AND added_at >= date(${NOWS},'-365 days') GROUP BY supplier ORDER BY spend DESC LIMIT 6`),
      db.all('SELECT id, name, monthly_budget FROM institutions ORDER BY name'),
      reorderList(),
    ]);
    const budgets = [];
    for (const i of insts) budgets.push({ ...i, used: await monthSpend(i.name) });
    res.json({
      months,
      consumption: months.map(m => ({ month: m, units: cons.filter(c => c.m === m).reduce((s, c) => s + c.units, 0), value: cons.filter(c => c.m === m).reduce((s, c) => s + c.value, 0) })),
      byInstitution, topItems, suppliers, budgets, reorder,
      purchases: months.map(m => ({ month: m, spend: (purchases.find(p => p.m === m) || {}).spend || 0 })),
    });
  });
};
