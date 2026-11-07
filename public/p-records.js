Q.pages.records = {
  tab: 'issues',
  async render(view, live) {
    const P = Q.pages.records, insts = await Q.api('/institutions'); if (!live()) return;
    view.innerHTML = `
      <div class="page-head"><div class="tabs" role="tablist">${[['issues', 'Issued items'], ['stockin', 'Stock added'], ['adj', 'Corrections and returns']].map(t => `<button class="tab${P.tab === t[0] ? ' active' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>
        <div class="actions"><button class="btn" id="exp">${Q.icon('download')} Download CSV</button></div></div>
      <div id="filters" class="filters ${P.tab === 'issues' ? '' : 'hidden'}">
        <label class="search">${Q.icon('search', 16)}<input id="rq" type="search" placeholder="Search item, person, department or slip no."></label>
        <select id="ri"><option value="">All institutions</option>${insts.map(i => `<option>${esc(i.name)}</option>`).join('')}</select>
        <label class="inline">From <input type="date" id="rf"></label><label class="inline">To <input type="date" id="rt"></label></div>
      <div id="recArea"></div>`;
    $$('.tab', view).forEach(t => t.onclick = () => { P.tab = t.dataset.t; Q.route(); });
    $('#exp').onclick = () => Q.exportCsv({ issues: 'issues', stockin: 'stock-in', adj: 'adjustments' }[P.tab]);
    const load = async () => {
      const area = $('#recArea');
      if (P.tab === 'issues') {
        const p = new URLSearchParams({ q: $('#rq').value, institution: $('#ri').value, from: $('#rf').value, to: $('#rt').value });
        const rows = await Q.api('/issues?' + p); P.rows = rows;
        area.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Slip</th><th>Item</th><th class="num">Qty</th><th>Institution</th><th>Issued to</th><th>Issued by</th><th></th></tr></thead><tbody>
          ${rows.map(r => { const left = r.quantity - r.returned_qty; return `<tr><td>${Q.fmtDate(r.issued_at)}</td>
            <td>${r.voucher_id ? `<a href="#" class="link" data-slip="${r.voucher_id}">${esc(r.voucher_no)}</a>` : '<span class="muted">-</span>'}</td>
            <td><b>${esc(r.item)}</b></td><td class="num">${r.quantity} ${esc(r.unit)}${r.returned_qty ? `<small class="block muted">${r.returned_qty} returned</small>` : ''}</td>
            <td>${esc(r.institution)}${r.department ? `<small class="block muted">${esc(r.department)}</small>` : ''}</td><td>${esc(r.issued_to)}</td><td>${esc(r.issued_by || '')}</td>
            <td class="row-actions">${Q.can('admin') && left > 0 ? `<button class="btn small" data-ret="${r.id}">Return</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`
          : `<div class="panel">${Q.empty('file', 'No issue records match', 'Change the filters, or issue some items first.')}</div>`;
      } else if (P.tab === 'stockin') {
        const rows = await Q.api('/stock-in');
        area.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th class="num">Quantity</th><th class="num">Rate</th><th>Supplier</th><th>Bill no.</th><th>Note</th></tr></thead><tbody>
          ${rows.map(r => `<tr><td>${Q.fmtDate(r.added_at)}</td><td><b>${esc(r.item)}</b></td><td class="num">${r.quantity} ${esc(r.unit)}</td><td class="num">${r.rate ? Q.money(r.rate) : '-'}</td><td>${esc(r.supplier || '')}</td><td>${esc(r.bill_no || '')}</td><td>${esc(r.note || '')}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="panel">${Q.empty('download', 'No stock added yet', 'Restocks appear here.')}</div>`;
      } else {
        const rows = await Q.api('/adjustments'), kinds = { damage: 'Damaged or lost', stocktake: 'Stock-take', correction: 'Correction', return: 'Returned' };
        area.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="num">Change</th><th>Reason</th><th>By</th></tr></thead><tbody>
          ${rows.map(r => `<tr><td>${Q.fmtDate(r.created_at)}</td><td><b>${esc(r.item)}</b></td><td><span class="chip ${r.kind === 'return' ? 'ok' : 'low'}">${kinds[r.kind] || r.kind}</span></td><td class="num ${r.delta < 0 ? 'err-text' : ''}">${r.delta > 0 ? '+' : ''}${r.delta} ${esc(r.unit)}</td><td>${esc(r.reason)}</td><td>${esc(r.done_by || '')}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="panel">${Q.empty('tool', 'No corrections or returns', 'Damage, stock-take corrections and returned items are listed here.')}</div>`;
      }
    };
    const reload = () => load().catch(e => Q.toast(e.message, true));
    if (P.tab === 'issues') { $('#rq').oninput = Q.debounce(reload); ['#ri', '#rf', '#rt'].forEach(s => $(s).onchange = reload); }
    view.onclick = e => {
      const r = e.target.closest('[data-ret]'); if (!r) return;
      const row = P.rows.find(x => x.id == r.dataset.ret), left = row.quantity - row.returned_qty;
      const body = Q.modal('Return items to the store', `<form class="stack" id="retForm"><p><b>${esc(row.item)}</b> issued to ${esc(row.issued_to)}, ${esc(row.institution)}. Up to <b>${left} ${esc(row.unit)}</b> can be returned.</p>
        <label>Quantity returned <input name="q" type="number" min="1" max="${left}" step="1" value="${left}" required></label>
        <label>Reason <input name="reason" required placeholder="e.g. Issued by mistake, or surplus returned"></label><p class="error" id="retErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Return to store</button></div></form>`);
      $('#retForm', body).onsubmit = async ev => {
        ev.preventDefault(); const f = ev.target;
        try { await Q.api(`/issues/${row.id}/return`, { method: 'POST', body: { quantity: f.q.value, reason: f.reason.value } }); Q.closeModal(); Q.toast('Items returned to stock.'); Q.poll(false); reload(); }
        catch (err) { $('#retErr').textContent = err.message; }
      };
    };
    await load();
  },
};
