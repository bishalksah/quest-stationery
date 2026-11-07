const db = require('../db');
const { clean, posInt, fail, notify, audit, stockAlert, budgetCheck, NOWS, nowDate } = require('../lib');

const year = () => nowDate().getUTCFullYear();

/* Create one issue voucher (a slip with one or more items) and reduce stock. Runs inside a transaction `x`. */
async function createVoucher(x, { institution, department, issuedTo, note, lines, user, requisitionId }) {
  const merged = new Map();
  for (const l of lines) { const id = posInt(l.item_id), q = posInt(l.quantity); if (!id || !q) throw fail(400, 'Every row needs an item and a quantity above 0.'); merged.set(id, (merged.get(id) || 0) + q); }
  if (!merged.size) throw fail(400, 'Add at least one item to issue.');
  const info = await x.run(`INSERT INTO vouchers (institution, department, issued_to, issued_by, note, requisition_id, created_at) VALUES (?,?,?,?,?,?,datetime(${NOWS}))`,
    [institution, department || null, issuedTo, user.name, note || null, requisitionId || null]);
  const vid = info.lastInsertRowid, no = `QS-${year()}-${String(vid).padStart(4, '0')}`;
  await x.run('UPDATE vouchers SET voucher_no = ? WHERE id = ?', [no, vid]);
  const alerts = []; let value = 0;
  for (const [itemId, qty] of merged) {
    const item = await x.get('SELECT * FROM items WHERE id = ?', [itemId]);
    if (!item) throw fail(404, 'One of the items no longer exists.');
    if (item.quantity < qty) throw fail(400, `Only ${item.quantity} ${item.unit} of "${item.name}" in stock. Lower the quantity or restock first.`);
    await x.run('UPDATE items SET quantity = quantity - ? WHERE id = ?', [qty, itemId]);
    await x.run(`INSERT INTO issues (item_id, quantity, institution, department, issued_to, note, issued_by, voucher_id, unit_price, issued_at) VALUES (?,?,?,?,?,?,?,?,?,datetime(${NOWS}))`,
      [itemId, qty, institution, department || null, issuedTo, note || null, user.name, vid, item.unit_price]);
    value += qty * item.unit_price;
    alerts.push([item.name, item.unit, item.quantity, item.quantity - qty, item.min_stock]);
  }
  return { id: vid, voucher_no: no, alerts, value, count: merged.size };
}
// Notifications and the audit trail, sent after the transaction has been saved
async function afterVoucher(user, out, institution, issuedTo) {
  await audit(user, 'Issued items', `${out.voucher_no} to ${issuedTo}, ${institution} (${out.count} item${out.count > 1 ? 's' : ''})`);
  await notify('info', 'Items issued', `${out.voucher_no}: ${out.count} item${out.count > 1 ? 's' : ''} issued to ${issuedTo}, ${institution}.`, 'records');
  for (const a of out.alerts) await stockAlert(...a);
  await budgetCheck(institution, out.value);
}

module.exports = app => {
  const admin = global.need('admin'), staff = global.need('admin', 'viewer'), requester = global.need('requester');

  /* ---------- Issue vouchers ---------- */
  app.post('/api/vouchers', admin, async (req, res) => {
    const b = req.body, institution = clean(b.institution), issuedTo = clean(b.issued_to);
    if (!institution) throw fail(400, 'Choose the institution receiving the items.');
    if (!(await db.get('SELECT 1 AS x FROM institutions WHERE name = ?', [institution]))) throw fail(400, 'That institution is not in the list. Add it under Admin, then Institutions.');
    if (!issuedTo) throw fail(400, 'Enter the name of the person receiving the items.');
    const out = await db.tx(x => createVoucher(x, { institution, department: clean(b.department), issuedTo, note: clean(b.note), lines: Array.isArray(b.lines) ? b.lines : [], user: req.user }));
    await afterVoucher(req.user, out, institution, issuedTo);
    res.status(201).json({ id: out.id, voucher_no: out.voucher_no });
  });

  app.get('/api/vouchers/:id', async (req, res) => {
    const v = await db.get('SELECT * FROM vouchers WHERE id = ?', [req.params.id]);
    if (!v) throw fail(404, 'Slip not found.');
    if (req.user.role === 'requester') {
      const own = v.requisition_id && await db.get('SELECT 1 AS x FROM requisitions WHERE id = ? AND user_id = ?', [v.requisition_id, req.user.id]);
      if (!own) throw fail(403, 'You can only open slips for your own requests.');
    }
    v.lines = await db.all('SELECT i.id, it.name AS item, it.unit, i.quantity, i.returned_qty, i.unit_price FROM issues i JOIN items it ON it.id = i.item_id WHERE i.voucher_id = ? ORDER BY i.id', [v.id]);
    res.json(v);
  });

  /* ---------- Issue records ---------- */
  app.get('/api/issues', staff, async (req, res) => {
    const q = `%${clean(req.query.q) || ''}%`, from = clean(req.query.from) || '0000-01-01', to = clean(req.query.to) || '9999-12-31', inst = clean(req.query.institution) || '';
    res.json(await db.all(`
      SELECT i.id, i.voucher_id, v.voucher_no, it.name AS item, it.unit, i.quantity, i.returned_qty, i.unit_price, i.institution, i.department, i.issued_to, i.issued_by, i.note, i.issued_at
      FROM issues i JOIN items it ON it.id = i.item_id LEFT JOIN vouchers v ON v.id = i.voucher_id
      WHERE (it.name LIKE ? OR i.issued_to LIKE ? OR i.department LIKE ? OR IFNULL(v.voucher_no,'') LIKE ?)
        AND date(i.issued_at) BETWEEN ? AND ? AND (? = '' OR i.institution = ?)
      ORDER BY i.id DESC LIMIT 500`, [q, q, q, q, from, to, inst, inst]));
  });
  app.get('/api/stock-in', staff, async (req, res) => res.json(await db.all(`
    SELECT s.id, it.name AS item, it.unit, s.quantity, s.rate, s.supplier, s.bill_no, s.note, s.added_at FROM stock_in s JOIN items it ON it.id = s.item_id ORDER BY s.id DESC LIMIT 500`)));
  app.get('/api/adjustments', staff, async (req, res) => res.json(await db.all(`
    SELECT a.id, it.name AS item, it.unit, a.kind, a.delta, a.reason, a.done_by, a.created_at FROM adjustments a JOIN items it ON it.id = a.item_id ORDER BY a.id DESC LIMIT 500`)));

  app.post('/api/issues/:id/return', admin, async (req, res) => {
    const qty = posInt(req.body.quantity), reason = clean(req.body.reason);
    if (!qty) throw fail(400, 'Quantity must be a whole number above 0.');
    if (!reason) throw fail(400, 'Please give a reason for the return.');
    const r = await db.tx(async x => {
      const row = await x.get('SELECT i.*, it.name AS item, it.unit FROM issues i JOIN items it ON it.id = i.item_id WHERE i.id = ?', [req.params.id]);
      if (!row) throw fail(404, 'Issue record not found.');
      const left = row.quantity - row.returned_qty;
      if (qty > left) throw fail(400, left ? `Only ${left} ${row.unit} can still be returned from this issue.` : 'Everything on this issue has already been returned.');
      await x.run('UPDATE issues SET returned_qty = returned_qty + ? WHERE id = ?', [qty, row.id]);
      await x.run('UPDATE items SET quantity = quantity + ? WHERE id = ?', [qty, row.item_id]);
      await x.run(`INSERT INTO adjustments (item_id, delta, kind, reason, done_by, created_at) VALUES (?,?,?,?,?,datetime(${NOWS}))`,
        [row.item_id, qty, 'return', `Returned by ${row.issued_to}, ${row.institution}: ${reason}`, req.user.name]);
      return row;
    });
    await audit(req.user, 'Items returned', `${qty} ${r.unit} of ${r.item} from ${r.institution} (${reason})`);
    await notify('info', 'Items returned', `${qty} ${r.unit} of ${r.item} returned from ${r.issued_to}, ${r.institution}.`, 'records');
    res.json({ ok: true });
  });

  /* ---------- Requisitions ---------- */
  const reqRow = (x, id) => x.get('SELECT * FROM requisitions WHERE id = ?', [id]);
  const reqLines = (x, id) => x.all(`SELECT l.id, l.item_id, it.name AS item, it.unit, it.quantity AS in_stock, l.quantity, l.approved_qty
                                      FROM requisition_lines l JOIN items it ON it.id = l.item_id WHERE l.requisition_id = ? ORDER BY l.id`, [id]);
  const mine = (r, u) => u.role !== 'requester' || r.user_id === u.id;

  app.post('/api/requisitions', requester, async (req, res) => {
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [], merged = new Map();
    for (const l of lines) { const id = posInt(l.item_id), q = posInt(l.quantity); if (!id || !q) throw fail(400, 'Every row needs an item and a quantity above 0.'); merged.set(id, (merged.get(id) || 0) + q); }
    if (!merged.size) throw fail(400, 'Add at least one item to your request.');
    if (!req.user.institution) throw fail(400, 'Your account is not linked to an institution. Ask the store administrator to fix this.');
    const r = await db.tx(async x => {
      const info = await x.run(`INSERT INTO requisitions (user_id, institution, department, requested_by, note, created_at) VALUES (?,?,?,?,?,datetime(${NOWS}))`,
        [req.user.id, req.user.institution, req.user.department || null, req.user.name, clean(req.body.note) || null]);
      const id = info.lastInsertRowid, no = `RQ-${year()}-${String(id).padStart(4, '0')}`;
      await x.run('UPDATE requisitions SET req_no = ? WHERE id = ?', [no, id]);
      for (const [itemId, q] of merged) {
        if (!(await x.get('SELECT 1 AS x FROM items WHERE id = ?', [itemId]))) throw fail(404, 'One of the items no longer exists.');
        await x.run('INSERT INTO requisition_lines (requisition_id, item_id, quantity) VALUES (?,?,?)', [id, itemId, q]);
      }
      return { id, no };
    });
    await audit(req.user, 'Sent requisition', `${r.no} (${merged.size} item${merged.size > 1 ? 's' : ''})`);
    await notify('info', 'New requisition', `${r.no} from ${req.user.name}, ${req.user.institution}: ${merged.size} item${merged.size > 1 ? 's' : ''} requested.`, 'requests');
    res.status(201).json({ id: r.id, req_no: r.no });
  });

  app.get('/api/requisitions', async (req, res) => {
    const status = clean(req.query.status) || '', own = req.user.role === 'requester';
    res.json(await db.all(`
      SELECT r.*, (SELECT COUNT(*) FROM requisition_lines WHERE requisition_id = r.id) AS line_count,
             (SELECT group_concat(it.name, ', ') FROM requisition_lines l JOIN items it ON it.id = l.item_id WHERE l.requisition_id = r.id) AS summary, v.voucher_no
      FROM requisitions r LEFT JOIN vouchers v ON v.id = r.voucher_id
      WHERE (? = 0 OR r.user_id = ?) AND (? = '' OR r.status = ?) ORDER BY r.id DESC LIMIT 200`, [own ? 1 : 0, req.user.id, status, status]));
  });

  app.get('/api/requisitions/:id', async (req, res) => {
    const r = await reqRow(db, req.params.id);
    if (!r || !mine(r, req.user)) throw fail(404, 'Request not found.');
    r.lines = await reqLines(db, r.id);
    r.voucher_no = r.voucher_id ? (await db.get('SELECT voucher_no FROM vouchers WHERE id = ?', [r.voucher_id])).voucher_no : null;
    res.json(r);
  });

  app.post('/api/requisitions/:id/approve', admin, async (req, res) => {
    const out = await db.tx(async x => {
      const r = await reqRow(x, req.params.id);
      if (!r) throw fail(404, 'Request not found.');
      if (r.status !== 'pending') throw fail(400, `This request was already ${r.status}.`);
      const given = new Map((Array.isArray(req.body.lines) ? req.body.lines : []).map(l => [Number(l.id), Number(l.approved_qty)]));
      const lines = await reqLines(x, r.id), issue = [];
      for (const l of lines) {
        const q = given.has(l.id) ? given.get(l.id) : l.quantity;
        if (!Number.isInteger(q) || q < 0 || q > l.quantity) throw fail(400, `Approved quantity for "${l.item}" must be between 0 and ${l.quantity}.`);
        await x.run('UPDATE requisition_lines SET approved_qty = ? WHERE id = ?', [q, l.id]);
        if (q > 0) issue.push({ item_id: l.item_id, quantity: q });
      }
      if (!issue.length) throw fail(400, 'Approve at least one item, or reject the request instead.');
      const v = await createVoucher(x, { institution: r.institution, department: r.department, issuedTo: r.requested_by, note: `Requisition ${r.req_no}`, lines: issue, user: req.user, requisitionId: r.id });
      await x.run(`UPDATE requisitions SET status='approved', decided_by=?, decided_at=datetime(${NOWS}), decision_note=?, voucher_id=? WHERE id=?`, [req.user.name, clean(req.body.note) || null, v.id, r.id]);
      return { r, v };
    });
    await afterVoucher(req.user, out.v, out.r.institution, out.r.requested_by);
    await audit(req.user, 'Approved requisition', `${out.r.req_no} → ${out.v.voucher_no}`);
    await notify('success', 'Request approved', `${out.r.req_no} was approved and issued as slip ${out.v.voucher_no}. You can collect the items.`, 'requests', out.r.user_id);
    res.json({ ok: true, voucher_id: out.v.id });
  });

  app.post('/api/requisitions/:id/reject', admin, async (req, res) => {
    const reason = clean(req.body.reason);
    if (!reason) throw fail(400, 'Please give a reason so the requester knows why.');
    const r = await reqRow(db, req.params.id);
    if (!r) throw fail(404, 'Request not found.');
    if (r.status !== 'pending') throw fail(400, `This request was already ${r.status}.`);
    await db.run(`UPDATE requisitions SET status='rejected', decided_by=?, decided_at=datetime(${NOWS}), decision_note=? WHERE id=?`, [req.user.name, reason, r.id]);
    await audit(req.user, 'Rejected requisition', `${r.req_no} (${reason})`);
    await notify('danger', 'Request rejected', `${r.req_no} was not approved. Reason: ${reason}`, 'requests', r.user_id);
    res.json({ ok: true });
  });

  app.post('/api/requisitions/:id/cancel', requester, async (req, res) => {
    const r = await reqRow(db, req.params.id);
    if (!r || r.user_id !== req.user.id) throw fail(404, 'Request not found.');
    if (r.status !== 'pending') throw fail(400, `This request was already ${r.status}.`);
    await db.run("UPDATE requisitions SET status='cancelled' WHERE id=?", [r.id]);
    await audit(req.user, 'Cancelled requisition', r.req_no);
    res.json({ ok: true });
  });
};
