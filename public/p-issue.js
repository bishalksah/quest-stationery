Q.pages.issue = {
  cart: [],
  async render(view, live) {
    const P = Q.pages.issue;
    const [items, insts] = await Promise.all([Q.api('/items'), Q.api('/institutions')]); if (!live()) return;
    P.items = items; P.insts = insts; P.cart = [];
    if (!insts.length) { view.innerHTML = `<div class="panel">${Q.empty('settings', 'Add an institution first', 'Items are issued to an institution. <a href="#admin">Open Admin, then Institutions</a> and add the colleges or schools you supply.')}</div>`; return; }
    view.innerHTML = `
      <div class="grid-issue">
        <section class="panel"><div class="panel-head"><h3>1. Who is receiving?</h3></div>
          <div class="stack">
            <label>Institution <select id="isInst" required><option value="">Choose institution</option>${insts.map(i => `<option value="${esc(i.name)}">${esc(i.name)}</option>`).join('')}</select></label>
            <div id="budgetNote" class="hint"></div>
            <label>Department <input id="isDept" placeholder="e.g. Computer Science"></label>
            <label>Received by <input id="isTo" placeholder="Name of the person collecting" required></label>
            <label>Note <input id="isNote" placeholder="Optional, e.g. exam week supplies"></label>
          </div></section>
        <section class="panel"><div class="panel-head"><h3>2. What is being issued?</h3></div>
          <label class="scan">${Q.icon('search', 16)}<input id="scan" placeholder="Scan a barcode, or type an item name and press Enter" autocomplete="off" list="itemNames"></label>
          <datalist id="itemNames">${items.map(i => `<option value="${esc(i.name)}">`).join('')}</datalist>
          <div class="add-line"><select id="isItem" aria-label="Item"><option value="">Or choose an item</option>${items.map(i => `<option value="${i.id}" ${i.quantity === 0 ? 'disabled' : ''}>${esc(i.name)} (${i.quantity} ${esc(i.unit)})</option>`).join('')}</select>
            <input id="isQty" type="number" min="1" step="1" value="1" aria-label="Quantity"><button class="btn" id="addLine" type="button">${Q.icon('plus', 16)} Add</button></div>
          <div id="cart"></div>
          <p class="error" id="issueErr" role="alert"></p>
          <div class="cart-foot"><span id="cartTotal" class="muted"></span><button class="btn primary big" id="issueBtn" type="button">${Q.icon('printer')} Issue items and create slip</button></div>
        </section>
      </div>`;
    const by = id => P.items.find(i => i.id == id);
    P.add = (item, qty = 1) => {
      const line = P.cart.find(l => l.id === item.id);
      if (line) line.qty += qty; else P.cart.push({ id: item.id, qty });
      P.paint();
    };
    $('#addLine').onclick = () => { const it = by($('#isItem').value); if (!it) { Q.toast('Choose an item first.', true); return; } P.add(it, Math.max(1, Number($('#isQty').value) || 1)); $('#isItem').value = ''; $('#isQty').value = 1; };
    $('#scan').onkeydown = e => {
      if (e.key !== 'Enter') return; e.preventDefault();
      const v = e.target.value.trim().toLowerCase(); if (!v) return;
      const part = P.items.filter(i => i.name.toLowerCase().includes(v));
      const it = P.items.find(i => (i.barcode || '').toLowerCase() === v) || P.items.find(i => i.name.toLowerCase() === v) || (part.length === 1 ? part[0] : null);
      if (!it) { Q.toast('No single item matches "' + e.target.value + '".', true); return; }
      if (it.quantity === 0) { Q.toast(it.name + ' is out of stock.', true); return; }
      P.add(it, 1); e.target.value = '';
    };
    $('#isInst').onchange = () => {
      const i = P.insts.find(x => x.name === $('#isInst').value);
      $('#budgetNote').innerHTML = i && i.monthly_budget > 0 ? `Budget this month: <b>${Q.money(i.used)}</b> used of <b>${Q.money(i.monthly_budget)}</b> (${Math.round(100 * i.used / i.monthly_budget)}%)` : '';
    };
    $('#cart').onclick = e => {
      const b = e.target.closest('[data-rm]'); if (b) { P.cart = P.cart.filter(l => l.id != b.dataset.rm); P.paint(); }
    };
    $('#cart').onchange = e => {
      const inp = e.target.closest('[data-q]'); if (!inp) return;
      const l = P.cart.find(x => x.id == inp.dataset.q), n = Math.floor(Number(inp.value));
      l.qty = n > 0 ? n : 1; P.paint();
    };
    $('#issueBtn').onclick = async () => {
      $('#issueErr').textContent = '';
      const body = { institution: $('#isInst').value, department: $('#isDept').value, issued_to: $('#isTo').value, note: $('#isNote').value, lines: P.cart.map(l => ({ item_id: l.id, quantity: l.qty })) };
      if (!body.lines.length) { $('#issueErr').textContent = 'Add at least one item.'; return; }
      $('#issueBtn').disabled = true;
      try {
        const r = await Q.api('/vouchers', { method: 'POST', body });
        Q.poll(false);
        const m = Q.modal('Items issued', `<div class="success-box">${Q.icon('check', 30)}<b>Slip ${esc(r.voucher_no)} created</b><span>Stock has been updated. Print the slip for the receiver to sign.</span></div>
          <div class="modal-actions"><button class="btn" data-close id="again">Issue more</button><button class="btn primary" id="showSlip">${Q.icon('printer')} View and print slip</button></div>`);
        $('#showSlip', m).onclick = () => Q.showSlip(r.id);
        $('#modal').addEventListener('close', () => Q.route(), { once: true });
      } catch (e) { $('#issueErr').textContent = e.message; }
      $('#issueBtn').disabled = false;
    };
    P.paint = () => {
      const rows = P.cart.map(l => ({ l, it: by(l.id) }));
      let total = 0;
      $('#cart').innerHTML = rows.length ? `<div class="table-wrap flat"><table><thead><tr><th>Item</th><th class="num">Available</th><th class="num">Quantity</th><th class="num">Value</th><th></th></tr></thead><tbody>
        ${rows.map(({ l, it }) => { total += l.qty * it.unit_price; const over = l.qty > it.quantity;
          return `<tr class="${over ? 'row-bad' : ''}"><td><b>${esc(it.name)}</b></td><td class="num">${it.quantity} ${esc(it.unit)}</td><td class="num"><input class="qty" type="number" min="1" step="1" value="${l.qty}" data-q="${l.id}" aria-label="Quantity of ${esc(it.name)}">${over ? '<small class="block err-text">More than in stock</small>' : ''}</td><td class="num">${it.unit_price ? Q.money(l.qty * it.unit_price) : '-'}</td><td class="row-actions">${Q.iconBtn('x', 'Remove', `data-rm="${l.id}"`)}</td></tr>`; }).join('')}</tbody></table></div>`
        : Q.empty('send', 'No items added yet', 'Scan a barcode or pick an item above.');
      $('#cartTotal').textContent = rows.length ? `${rows.length} item${rows.length > 1 ? 's' : ''} · value ${Q.money(total)}` : '';
    };
    P.paint();
  },
};
