const db = require('../db');
const { clean, posInt, nonNegInt, money, fail, notify, audit, stockAlert, toCsv, NOWS } = require('../lib');

const photoOk = p => p === null || p === '' || (typeof p === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p) && p.length < 150000);

module.exports = app => {
  const admin = global.need('admin');

  app.get('/api/items', async (req, res) => {
    const q = `%${clean(req.query.q) || ''}%`, cat = clean(req.query.category) || '', st = clean(req.query.status) || '';
    res.json(await db.all(`
      SELECT * FROM items WHERE (name LIKE ? OR category LIKE ? OR IFNULL(barcode,'') LIKE ?) AND (? = '' OR category = ?)
        AND (? = '' OR (? = 'out' AND quantity = 0) OR (? = 'low' AND quantity > 0 AND quantity <= min_stock) OR (? = 'ok' AND quantity > min_stock))
      ORDER BY name COLLATE NOCASE`, [q, q, q, cat, cat, st, st, st, st]));
  });
  app.get('/api/categories', async (req, res) => res.json((await db.all('SELECT DISTINCT category FROM items ORDER BY category')).map(r => r.category)));

  function readItemBody(b, existing) {
    const name = clean(b.name) || (existing && existing.name);
    if (!name) throw fail(400, 'Item name is required.');
    const minStock = b.min_stock === undefined ? (existing ? existing.min_stock : 10) : nonNegInt(b.min_stock);
    const price = b.unit_price === undefined || b.unit_price === '' ? (existing ? existing.unit_price : 0) : money(b.unit_price);
    if (minStock === null) throw fail(400, 'Minimum stock must be a whole number, 0 or more.');
    if (price === null) throw fail(400, 'Price must be a number, 0 or more.');
    if (b.photo !== undefined && !photoOk(b.photo)) throw fail(400, 'That photo is too large or not a JPG, PNG or WebP image.');
    return {
      name, minStock, price,
      category: clean(b.category) || (existing && existing.category) || 'General',
      unit: clean(b.unit) || (existing && existing.unit) || 'pcs',
      barcode: b.barcode === undefined ? (existing ? existing.barcode : null) : (clean(b.barcode) || null),
      photo: b.photo === undefined ? (existing ? existing.photo : null) : (b.photo || null),
    };
  }

  async function createItem(b, user) {
    const v = readItemBody(b), qty = nonNegInt(b.quantity ?? 0);
    if (qty === null) throw fail(400, 'Quantity must be a whole number, 0 or more.');
    const created = await db.tx(async x => {
      const info = await x.run(`INSERT INTO items (name, category, unit, quantity, min_stock, unit_price, barcode, photo, created_at) VALUES (?,?,?,?,?,?,?,?,datetime(${NOWS}))`,
        [v.name, v.category, v.unit, qty, v.minStock, v.price, v.barcode, v.photo]);
      if (qty > 0) await x.run(`INSERT INTO stock_in (item_id, quantity, supplier, note, rate, added_at) VALUES (?,?,?,?,?,datetime(${NOWS}))`,
        [info.lastInsertRowid, qty, clean(b.supplier) || null, 'Opening stock', v.price || null]);
      return x.get('SELECT * FROM items WHERE id = ?', [info.lastInsertRowid]);
    });
    await audit(user, 'Added item', `${v.name} (${qty} ${v.unit})`);
    return created;
  }

  app.post('/api/items', admin, async (req, res) => {
    let created;
    try { created = await createItem(req.body, req.user); }
    catch (e) {
      if (String(e.message).includes('UNIQUE')) throw fail(400, String(e.message).includes('barcode') ? 'That barcode belongs to another item.' : `"${clean(req.body.name)}" is already in the store. Use Restock to add more.`);
      throw e;
    }
    await notify('info', 'New item added', `${created.name} was added to the store with ${created.quantity} ${created.unit}.`, 'store');
    if (created.quantity > 0 && created.quantity <= created.min_stock)
      await notify('warning', 'Low stock', `${created.name} starts at ${created.quantity} ${created.unit}, at or below its minimum of ${created.min_stock}.`, 'store');
    res.status(201).json(created);
  });

  app.put('/api/items/:id', admin, async (req, res) => {
    const item = await db.get('SELECT * FROM items WHERE id = ?', [req.params.id]);
    if (!item) throw fail(404, 'Item not found.');
    const v = readItemBody(req.body, item);
    try {
      await db.run('UPDATE items SET name=?, category=?, unit=?, min_stock=?, unit_price=?, barcode=?, photo=? WHERE id=?', [v.name, v.category, v.unit, v.minStock, v.price, v.barcode, v.photo, item.id]);
    } catch (e) { if (String(e.message).includes('UNIQUE')) throw fail(400, 'That name or barcode is already used by another item.'); throw e; }
    await audit(req.user, 'Edited item', v.name);
    res.json(await db.get('SELECT * FROM items WHERE id = ?', [item.id]));
  });

  app.delete('/api/items/:id', admin, async (req, res) => {
    const item = await db.get('SELECT * FROM items WHERE id = ?', [req.params.id]);
    if (!item) throw fail(404, 'Item not found.');
    await db.tx(async x => {   // remove the item's history too (done by hand so it works on every database)
      for (const t of ['stock_in', 'issues', 'requisition_lines', 'adjustments']) await x.run(`DELETE FROM ${t} WHERE item_id = ?`, [item.id]);
      await x.run('DELETE FROM items WHERE id = ?', [item.id]);
    });
    await audit(req.user, 'Deleted item', item.name);
    res.json({ ok: true });
  });

  app.post('/api/items/:id/restock', admin, async (req, res) => {
    const qty = posInt(req.body.quantity), rate = req.body.rate === undefined || req.body.rate === '' ? null : money(req.body.rate);
    if (!qty) throw fail(400, 'Quantity must be a whole number above 0.');
    if (rate === null && req.body.rate !== undefined && req.body.rate !== '') throw fail(400, 'Rate must be a number, 0 or more.');
    const result = await db.tx(async x => {
      const item = await x.get('SELECT * FROM items WHERE id = ?', [req.params.id]);
      if (!item) throw fail(404, 'Item not found.');
      await x.run('UPDATE items SET quantity = quantity + ?, unit_price = CASE WHEN ? > 0 THEN ? ELSE unit_price END WHERE id = ?', [qty, rate || 0, rate || 0, item.id]);
      await x.run(`INSERT INTO stock_in (item_id, quantity, supplier, note, bill_no, rate, added_at) VALUES (?,?,?,?,?,?,datetime(${NOWS}))`,
        [item.id, qty, clean(req.body.supplier) || null, clean(req.body.note) || null, clean(req.body.bill_no) || null, rate]);
      return x.get('SELECT * FROM items WHERE id = ?', [item.id]);
    });
    await audit(req.user, 'Restocked', `${qty} ${result.unit} of ${result.name}`);
    await notify('success', 'Stock added', `${qty} ${result.unit} of ${result.name} received. Now ${result.quantity} ${result.unit} in store.`, 'records');
    res.json(result);
  });

  app.post('/api/items/:id/adjust', admin, async (req, res) => {
    const kind = ['correction', 'damage', 'stocktake'].includes(req.body.kind) ? req.body.kind : 'correction';
    let delta = Number(req.body.delta); const reason = clean(req.body.reason);
    if (!Number.isInteger(delta) || delta === 0) throw fail(400, 'Enter a whole number that is not zero (use a minus sign to reduce stock).');
    if (!reason) throw fail(400, 'Please give a reason. It is saved in the records.');
    if (kind === 'damage') delta = -Math.abs(delta);
    const r = await db.tx(async x => {
      const item = await x.get('SELECT * FROM items WHERE id = ?', [req.params.id]);
      if (!item) throw fail(404, 'Item not found.');
      if (item.quantity + delta < 0) throw fail(400, `Only ${item.quantity} ${item.unit} in stock, so it cannot be reduced by ${-delta}.`);
      await x.run('UPDATE items SET quantity = quantity + ? WHERE id = ?', [delta, item.id]);
      await x.run(`INSERT INTO adjustments (item_id, delta, kind, reason, done_by, created_at) VALUES (?,?,?,?,?,datetime(${NOWS}))`, [item.id, delta, kind, reason, req.user.name]);
      return { item, after: item.quantity + delta };
    });
    await audit(req.user, 'Stock ' + kind, `${r.item.name}: ${delta > 0 ? '+' : ''}${delta} (${reason})`);
    await stockAlert(r.item.name, r.item.unit, r.item.quantity, r.after, r.item.min_stock);
    res.json(await db.get('SELECT * FROM items WHERE id = ?', [r.item.id]));
  });

  // Bulk import from a CSV file (the browser reads the file and sends it in small batches)
  app.post('/api/items/import', admin, async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 60) : [];
    if (!rows.length) throw fail(400, 'The file has no rows to import.');
    let added = 0, skipped = 0; const errors = [];
    for (const [i, r] of rows.entries()) {
      try {
        if (await db.get('SELECT 1 AS x FROM items WHERE name = ? COLLATE NOCASE', [clean(r.name) || ''])) { skipped++; continue; }
        await createItem(r, req.user); added++;
      } catch (e) { errors.push({ row: Number(req.body.offset || 0) + i + 2, error: String(e.message).includes('UNIQUE') ? 'Duplicate barcode' : e.message }); }
    }
    if (added && req.body.last) await notify('info', 'Items imported', `Items were imported from a file.`, 'store');
    res.json({ added, skipped, errors: errors.slice(0, 20) });
  });

  /* ---------- CSV exports ---------- */
  const exports_ = {
    items: ['SELECT name, category, unit, quantity, min_stock, unit_price, barcode FROM items ORDER BY name', ['admin', 'viewer']],
    issues: [`SELECT i.issued_at, v.voucher_no, it.name AS item, i.quantity, i.returned_qty, it.unit, i.unit_price, i.institution, i.department, i.issued_to, i.issued_by, i.note
              FROM issues i JOIN items it ON it.id = i.item_id LEFT JOIN vouchers v ON v.id = i.voucher_id ORDER BY i.id DESC`, ['admin', 'viewer']],
    'stock-in': [`SELECT s.added_at, it.name AS item, s.quantity, it.unit, s.rate, s.supplier, s.bill_no, s.note FROM stock_in s JOIN items it ON it.id = s.item_id ORDER BY s.id DESC`, ['admin', 'viewer']],
    adjustments: [`SELECT a.created_at, it.name AS item, a.kind, a.delta, a.reason, a.done_by FROM adjustments a JOIN items it ON it.id = a.item_id ORDER BY a.id DESC`, ['admin', 'viewer']],
    audit: ['SELECT created_at, user, action, detail FROM audit_log ORDER BY id DESC', ['admin']],
  };
  app.get('/api/export/:what', async (req, res) => {
    const e = exports_[req.params.what];
    if (!e) throw fail(404, 'Unknown export.');
    if (!e[1].includes(req.user.role)) throw fail(403, 'Your account does not have permission to do this.');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.what}.csv"`);
    res.send(toCsv(await db.all(e[0])));
  });
};
