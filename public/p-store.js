Q.pages.store = {
  mode: localStorage.getItem('qs_view') || 'cards',
  async render(view, live) {
    const P = Q.pages.store, admin = Q.can('admin'), cats = await Q.api('/categories'); if (!live()) return;
    view.innerHTML = `
      <div class="page-head"><div class="filters">
          <label class="search">${Q.icon('search', 16)}<input id="itemSearch" type="search" placeholder="Search name, category or barcode" aria-label="Search items"></label>
          <select id="itemCategory" aria-label="Category"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
          <select id="itemStatus" aria-label="Status"><option value="">Any status</option><option value="ok">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></div>
        <div class="actions">
          <div class="seg" role="group" aria-label="View"><button class="${P.mode === 'cards' ? 'on' : ''}" data-mode="cards" title="Cards">${Q.icon('grid', 16)}</button><button class="${P.mode === 'table' ? 'on' : ''}" data-mode="table" title="Table">${Q.icon('rows', 16)}</button></div>
          ${Q.can('admin', 'viewer') ? `<button class="btn" id="exportItems">${Q.icon('download')} CSV</button>` : ''}
          ${admin ? `<button class="btn" id="importBtn">${Q.icon('upload')} Import</button><button class="btn primary" id="addItemBtn">${Q.icon('plus')} Add item</button>` : ''}
        </div></div>
      <div id="itemsArea"></div>`;
    const load = async () => {
      const p = new URLSearchParams({ q: $('#itemSearch').value, category: $('#itemCategory').value, status: $('#itemStatus').value });
      P.items = await Q.api('/items?' + p); P.paint();
    };
    $('#itemSearch').oninput = Q.debounce(() => load().catch(e => Q.toast(e.message, true)));
    $('#itemCategory').onchange = $('#itemStatus').onchange = () => load().catch(e => Q.toast(e.message, true));
    $$('.seg button', view).forEach(b => b.onclick = () => { P.mode = b.dataset.mode; localStorage.setItem('qs_view', P.mode); $$('.seg button', view).forEach(x => x.classList.toggle('on', x === b)); P.paint(); });
    if (Q.can('admin', 'viewer')) $('#exportItems').onclick = () => Q.exportCsv('items');
    if (admin) { $('#addItemBtn').onclick = () => P.itemDialog(); $('#importBtn').onclick = () => P.importDialog(); }
    P.reload = () => load().catch(e => Q.toast(e.message, true));
    view.onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const it = P.items.find(i => i.id == b.dataset.id); if (!it) return;
      ({ restock: P.restockDialog, adjust: P.adjustDialog, edit: P.itemDialog, remove: P.removeItem, request: i => Q.openRequestModal(i.id) })[b.dataset.act]?.call(P, it);
    };
    await load();
  },

  actions(i) {
    if (Q.can('admin')) return `${Q.iconBtn('refresh', 'Restock', `data-act="restock" data-id="${i.id}"`)}${Q.iconBtn('tool', 'Correct stock', `data-act="adjust" data-id="${i.id}"`)}${Q.iconBtn('edit', 'Edit', `data-act="edit" data-id="${i.id}"`)}${Q.iconBtn('trash', 'Delete', `data-act="remove" data-id="${i.id}"`, 'danger')}`;
    if (Q.can('requester') && i.quantity > 0) return `<button class="btn small primary" data-act="request" data-id="${i.id}">${Q.icon('plus', 14)} Request</button>`;
    return '';
  },
  paint() {
    const P = this, items = P.items, area = $('#itemsArea'); if (!area) return;
    if (!items.length) { area.innerHTML = `<div class="panel">${Q.empty('box', 'No items match', Q.can('admin') ? 'Try another search, or use Add item to stock the store.' : 'Try another search.')}</div>`; return; }
    if (P.mode === 'table') {
      area.innerHTML = `<div class="table-wrap"><table><thead><tr><th></th><th>Item</th><th>Category</th><th class="num">In stock</th><th class="num">Minimum</th><th class="num">Price</th><th>Status</th><th></th></tr></thead><tbody>
        ${items.map(i => `<tr><td class="thumb-cell">${Q.thumb(i)}</td><td><b>${esc(i.name)}</b>${i.barcode ? `<small class="block muted">${esc(i.barcode)}</small>` : ''}</td><td>${esc(i.category)}</td>
          <td class="num"><b>${i.quantity}</b> ${esc(i.unit)}</td><td class="num">${i.min_stock}</td><td class="num">${i.unit_price ? Q.money(i.unit_price) : '-'}</td><td>${Q.statusChip(i)}</td><td class="row-actions">${P.actions(i)}</td></tr>`).join('')}</tbody></table></div>`;
    } else {
      area.innerHTML = `<div class="items-grid">${items.map(i => {
        const pct = Math.min(100, Math.round(100 * i.quantity / Math.max(i.min_stock * 3, 1))), tone = i.quantity === 0 ? 'bad' : i.quantity <= i.min_stock ? 'warn' : '';
        return `<article class="item-card"><div class="item-top">${Q.thumb(i, 'lg')}<div class="item-title"><b>${esc(i.name)}</b><span class="chip muted">${esc(i.category)}</span></div></div>
          <div class="item-qty"><b>${i.quantity}</b><span>${esc(i.unit)}</span>${Q.statusChip(i)}</div>
          <div class="progress slim ${tone}"><div class="progress-bar" style="width:${pct}%"></div></div>
          <div class="item-meta"><span>Minimum ${i.min_stock}</span><span>${i.unit_price ? Q.money(i.unit_price) + ' / ' + esc(i.unit) : ''}</span></div>
          <div class="item-actions">${P.actions(i)}</div></article>`; }).join('')}</div>`;
    }
  },

  /* ----- dialogs ----- */
  itemDialog(item) {
    const P = Q.pages.store, edit = !!item, cats = [...new Set(P.items.map(i => i.category))];
    let photo = edit ? item.photo : null;
    const body = Q.modal(edit ? 'Edit item' : 'Add new item', `
      <form id="itemForm" class="stack">
        <div class="photo-row"><div id="photoPrev">${Q.thumb({ name: edit ? item.name : '?', photo }, 'xl')}</div>
          <div><label class="btn small file-btn">${Q.icon('camera', 15)} ${edit && photo ? 'Change photo' : 'Add photo'}<input type="file" id="photoFile" accept="image/*" hidden></label>
            <button type="button" class="btn small ghost" id="photoClear" ${photo ? '' : 'hidden'}>Remove</button><small class="block muted">Optional. Resized automatically.</small></div></div>
        <label>Item name <input name="name" required value="${esc(edit ? item.name : '')}"></label>
        <div class="row2"><label>Category <input name="category" list="catList" value="${esc(edit ? item.category : '')}" placeholder="e.g. Paper"><datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
          <label>Unit <input name="unit" value="${esc(edit ? item.unit : '')}" placeholder="pcs, ream, box"></label></div>
        <div class="row2">${edit ? '' : '<label>Opening quantity <input name="quantity" type="number" min="0" step="1" value="0"></label>'}
          <label>Minimum stock <input name="min_stock" type="number" min="0" step="1" value="${edit ? item.min_stock : 10}"></label>
          <label>Price per unit (₹) <input name="unit_price" type="number" min="0" step="0.01" value="${edit ? item.unit_price : ''}" placeholder="0"></label></div>
        <div class="row2"><label>Barcode <input name="barcode" value="${esc(edit ? item.barcode || '' : '')}" placeholder="Optional, scan or type"></label>
          ${edit ? '' : '<label>Supplier <input name="supplier" placeholder="Optional"></label>'}</div>
        <p class="error" id="itemErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save item</button></div>
      </form>`);
    const prev = () => { $('#photoPrev', body).innerHTML = Q.thumb({ name: $('[name=name]', body).value || '?', photo }, 'xl'); $('#photoClear', body).hidden = !photo; };
    $('#photoFile', body).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { photo = await Q.shrinkPhoto(f); prev(); } catch (err) { $('#itemErr').textContent = err.message; } };
    $('#photoClear', body).onclick = () => { photo = null; prev(); };
    $('#itemForm', body).onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      const b = { name: f.name.value, category: f.category.value, unit: f.unit.value, min_stock: f.min_stock.value, unit_price: f.unit_price.value, barcode: f.barcode.value, photo: photo || '' };
      if (!edit) { b.quantity = f.quantity.value || 0; b.supplier = f.supplier.value; }
      try { await Q.api(edit ? '/items/' + item.id : '/items', { method: edit ? 'PUT' : 'POST', body: b }); Q.closeModal(); Q.toast(edit ? 'Item updated.' : 'Item added to the store.'); P.reload(); Q.poll(false); }
      catch (err) { $('#itemErr').textContent = err.message; }
    };
  },
  restockDialog(item) {
    const P = Q.pages.store;
    const body = Q.modal('Restock: ' + esc(item.name), `
      <form id="rsForm" class="stack"><p class="muted">Now in store: <b>${item.quantity} ${esc(item.unit)}</b></p>
        <div class="row2"><label>Quantity received <input name="quantity" type="number" min="1" step="1" required autofocus></label>
          <label>Rate per ${esc(item.unit)} (₹) <input name="rate" type="number" min="0" step="0.01" value="${item.unit_price || ''}"></label></div>
        <div class="row2"><label>Supplier <input name="supplier" placeholder="Optional"></label><label>Bill / invoice no. <input name="bill_no" placeholder="Optional"></label></div>
        <label>Note <input name="note" placeholder="Optional"></label><p class="error" id="rsErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Add stock</button></div></form>`);
    $('#rsForm', body).onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      try { await Q.api(`/items/${item.id}/restock`, { method: 'POST', body: { quantity: f.quantity.value, rate: f.rate.value, supplier: f.supplier.value, bill_no: f.bill_no.value, note: f.note.value } }); Q.closeModal(); Q.toast('Stock added.'); P.reload(); Q.poll(false); }
      catch (err) { $('#rsErr').textContent = err.message; }
    };
  },
  adjustDialog(item) {
    const P = Q.pages.store;
    const body = Q.modal('Correct stock: ' + esc(item.name), `
      <form id="adjForm" class="stack"><p class="muted">Now in store: <b>${item.quantity} ${esc(item.unit)}</b>. Every correction is saved with your reason.</p>
        <label>Type <select name="kind"><option value="damage">Damaged, lost or expired (reduces stock)</option><option value="stocktake">Physical stock-take difference</option><option value="correction">Entry mistake correction</option></select></label>
        <label id="deltaLabel">Quantity lost <input name="delta" type="number" step="1" required></label>
        <p class="hint" id="deltaHint">Enter how many ${esc(item.unit)} were lost.</p>
        <label>Reason <input name="reason" required placeholder="e.g. Water damage in store room"></label><p class="error" id="adjErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save correction</button></div></form>`);
    const f = $('#adjForm', body), upd = () => {
      const dmg = f.kind.value === 'damage';
      $('#deltaLabel', body).firstChild.textContent = dmg ? 'Quantity lost ' : 'Change in quantity ';
      $('#deltaHint', body).textContent = dmg ? `Enter how many ${item.unit} were lost.` : `Use a minus sign to reduce (for example -4) or a plain number to increase.`;
    };
    f.kind.onchange = upd;
    f.onsubmit = async e => {
      e.preventDefault();
      try { await Q.api(`/items/${item.id}/adjust`, { method: 'POST', body: { kind: f.kind.value, delta: f.delta.value, reason: f.reason.value } }); Q.closeModal(); Q.toast('Stock corrected.'); P.reload(); Q.poll(false); }
      catch (err) { $('#adjErr').textContent = err.message; }
    };
  },
  async removeItem(item) {
    if (!confirm(`Delete "${item.name}"? Its issue and stock history will also be deleted.\n\nTip: if you only want to stop using it, set its minimum stock to 0 instead.`)) return;
    try { await Q.api('/items/' + item.id, { method: 'DELETE' }); Q.toast('Item deleted.'); this.reload(); } catch (e) { Q.toast(e.message, true); }
  },
  importDialog() {
    const P = Q.pages.store; let rows = [];
    const body = Q.modal('Import items from a file', `
      <div class="stack"><p>Use a <b>CSV file</b> (in Excel choose <i>Save As, CSV</i>). The first row must have these headings: <code>name, category, unit, quantity, min_stock, unit_price, barcode, supplier</code>. Only <code>name</code> is required. Items that already exist are skipped.</p>
        <button class="btn small" id="tplBtn" type="button">${Q.icon('download', 15)} Download a blank template</button>
        <input type="file" id="csvFile" accept=".csv,text/csv"><div id="csvInfo" class="hint"></div><p class="error" id="csvErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn" data-close>Close</button><button class="btn primary" id="doImport" disabled>Import</button></div></div>`);
    $('#tplBtn', body).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeffname,category,unit,quantity,min_stock,unit_price,barcode,supplier\nA3 Paper Ream,Paper,ream,20,5,320,,ABC Traders\n'], { type: 'text/csv' })); a.download = 'items-template.csv'; a.click(); };
    $('#csvFile', body).onchange = async e => {
      const f = e.target.files[0]; if (!f) return; $('#csvErr').textContent = '';
      const t = Q.parseCsv(await f.text()); if (t.length < 2) { $('#csvErr').textContent = 'The file needs a heading row and at least one item row.'; return; }
      const head = t[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      if (!head.includes('name')) { $('#csvErr').textContent = 'The first row must include a "name" heading.'; return; }
      rows = t.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
      $('#csvInfo').textContent = `${rows.length} row${rows.length > 1 ? 's' : ''} found. Press Import to add them.`; $('#doImport').disabled = false;
    };
    $('#doImport', body).onclick = async () => {
      try {
        const tot = { added: 0, skipped: 0, errors: [] };
        for (let i = 0; i < rows.length; i += 50) {      // small batches keep each request quick
          $('#csvInfo').textContent = `Importing ${Math.min(i + 50, rows.length)} of ${rows.length}...`;
          const r = await Q.api('/items/import', { method: 'POST', body: { rows: rows.slice(i, i + 50), offset: i, last: i + 50 >= rows.length } });
          tot.added += r.added; tot.skipped += r.skipped; tot.errors.push(...r.errors);
        }
        const r = tot;
        $('#csvInfo').innerHTML = `<b>${r.added}</b> added, <b>${r.skipped}</b> skipped because they already exist.` + (r.errors.length ? `<br>Problems: ${r.errors.slice(0, 20).map(x => `row ${x.row} (${esc(x.error)})`).join(', ')}` : '');
        $('#doImport').disabled = true; P.reload(); Q.poll(false);
      } catch (err) { $('#csvErr').textContent = err.message; }
    };
  },
};
