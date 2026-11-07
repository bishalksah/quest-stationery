/* Requisitions: department users ask, the store administrator approves or rejects */
Q.openRequestModal = async (preId) => {
  let items; try { items = (await Q.api('/items')).filter(i => i.quantity > 0); } catch (e) { Q.toast(e.message, true); return; }
  const cart = []; if (preId && items.find(i => i.id == preId)) cart.push({ id: Number(preId), qty: 1 });
  const body = Q.modal('New request to the store', `
    <div class="stack"><p class="muted">Requesting for <b>${esc(Q.user.institution || '')}</b>${Q.user.department ? ', ' + esc(Q.user.department) : ''}.</p>
      <div class="add-line"><select id="rqItem" aria-label="Item"><option value="">Choose an item</option>${items.map(i => `<option value="${i.id}">${esc(i.name)} (${i.quantity} ${esc(i.unit)} in store)</option>`).join('')}</select>
        <input id="rqQty" type="number" min="1" step="1" value="1" aria-label="Quantity"><button class="btn" id="rqAdd" type="button">${Q.icon('plus', 16)} Add</button></div>
      <div id="rqCart"></div>
      <label>Note for the store <input id="rqNote" placeholder="Optional, e.g. needed before Monday"></label>
      <p class="error" id="rqErr" role="alert"></p>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" id="rqSend">Send request</button></div></div>`, true);
  const paint = () => {
    $('#rqCart', body).innerHTML = cart.length ? `<div class="table-wrap flat"><table><thead><tr><th>Item</th><th class="num">Quantity</th><th></th></tr></thead><tbody>${cart.map(l => { const it = items.find(i => i.id === l.id);
      return `<tr><td><b>${esc(it.name)}</b></td><td class="num"><input class="qty" type="number" min="1" step="1" value="${l.qty}" data-q="${l.id}" aria-label="Quantity of ${esc(it.name)}"> ${esc(it.unit)}</td><td class="row-actions">${Q.iconBtn('x', 'Remove', `data-rm="${l.id}"`)}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="hint">Add the items you need.</p>';
  };
  $('#rqAdd', body).onclick = () => {
    const id = Number($('#rqItem', body).value); if (!id) { Q.toast('Choose an item first.', true); return; }
    const q = Math.max(1, Number($('#rqQty', body).value) || 1), l = cart.find(x => x.id === id); if (l) l.qty += q; else cart.push({ id, qty: q });
    $('#rqItem', body).value = ''; $('#rqQty', body).value = 1; paint();
  };
  $('#rqCart', body).onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { cart.splice(cart.findIndex(l => l.id == b.dataset.rm), 1); paint(); } };
  $('#rqCart', body).onchange = e => { const i = e.target.closest('[data-q]'); if (!i) return; const l = cart.find(x => x.id == i.dataset.q), n = Math.floor(Number(i.value)); l.qty = n > 0 ? n : 1; paint(); };
  $('#rqSend', body).onclick = async () => {
    try {
      const r = await Q.api('/requisitions', { method: 'POST', body: { note: $('#rqNote', body).value, lines: cart.map(l => ({ item_id: l.id, quantity: l.qty })) } });
      Q.closeModal(); Q.toast(`Request ${r.req_no} sent to the store.`); Q.poll(false);
      if (location.hash === '#requests') Q.route(); else location.hash = 'requests';
    } catch (e) { $('#rqErr', body).textContent = e.message; }
  };
  paint();
};

Q.pages.requests = {
  tab: 'pending',
  async render(view, live) {
    const P = Q.pages.requests, mine = Q.can('requester');
    if (mine) P.tab = 'all';
    view.innerHTML = `<div class="page-head">
        ${mine ? '<div></div>' : `<div class="tabs" role="tablist">${[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(t => `<button class="tab${P.tab === t[0] ? ' active' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div>`}
        <div class="actions">${mine ? `<button class="btn primary" id="newReq">${Q.icon('plus')} New request</button>` : ''}</div></div>
      <div id="reqList"></div>`;
    if (mine) $('#newReq').onclick = () => Q.openRequestModal();
    $$('.tab', view).forEach(t => t.onclick = () => { P.tab = t.dataset.t; Q.route(); });
    const rows = await Q.api('/requisitions' + (P.tab === 'all' ? '' : '?status=' + P.tab)); if (!live()) return;
    $('#reqList').innerHTML = rows.length ? `<div class="req-list">${rows.map(r => `
      <article class="req-card"><div class="req-main"><div class="req-title"><b>${esc(r.req_no)}</b>${Q.reqChip(r.status)}</div>
        <p>${esc(r.summary || '')}</p>
        <small class="muted">${mine ? '' : `${esc(r.requested_by)} · ${esc(r.institution)}${r.department ? ', ' + esc(r.department) : ''} · `}${r.line_count} item${r.line_count > 1 ? 's' : ''} · ${Q.fmtDate(r.created_at)}</small>
        ${r.status === 'rejected' && r.decision_note ? `<p class="reason">Reason: ${esc(r.decision_note)}</p>` : ''}
        ${r.status === 'approved' ? `<small class="muted block">Approved by ${esc(r.decided_by)}${r.voucher_no ? ' · slip ' + esc(r.voucher_no) : ''}</small>` : ''}</div>
        <div class="req-actions">
          ${r.voucher_id ? `<button class="btn small" data-slip="${r.voucher_id}">${Q.icon('printer', 14)} Slip</button>` : ''}
          ${Q.can('admin') && r.status === 'pending' ? `<button class="btn small primary" data-review="${r.id}">Review</button>` : `<button class="btn small" data-review="${r.id}">Details</button>`}
          ${mine && r.status === 'pending' ? `<button class="btn small danger" data-cancel="${r.id}">Cancel</button>` : ''}
        </div></article>`).join('')}</div>`
      : `<div class="panel">${Q.empty('clipboard', mine ? 'No requests yet' : 'Nothing here', mine ? 'Press New request to ask the store for items.' : P.tab === 'pending' ? 'No requests are waiting for a decision.' : 'No requests in this list.')}</div>`;
    view.onclick = async e => {
      const rv = e.target.closest('[data-review]'), cn = e.target.closest('[data-cancel]');
      if (rv) P.detail(rv.dataset.review);
      if (cn && confirm('Cancel this request?')) { try { await Q.api(`/requisitions/${cn.dataset.cancel}/cancel`, { method: 'POST' }); Q.toast('Request cancelled.'); Q.route(); } catch (err) { Q.toast(err.message, true); } }
    };
  },

  async detail(id) {
    let r; try { r = await Q.api('/requisitions/' + id); } catch (e) { Q.toast(e.message, true); return; }
    const decide = Q.can('admin') && r.status === 'pending';
    const body = Q.modal(esc(r.req_no), `
      <div class="stack"><div class="detail-meta"><div><small>From</small><b>${esc(r.requested_by)}</b></div><div><small>Institution</small><b>${esc(r.institution)}</b></div><div><small>Department</small><b>${esc(r.department || '-')}</b></div><div><small>Status</small>${Q.reqChip(r.status)}</div></div>
        ${r.note ? `<p><small class="muted">Note from requester</small><br>${esc(r.note)}</p>` : ''}
        <div class="table-wrap flat"><table><thead><tr><th>Item</th><th class="num">Requested</th><th class="num">In store</th><th class="num">${decide ? 'Approve' : 'Approved'}</th></tr></thead><tbody>
          ${r.lines.map(l => `<tr><td><b>${esc(l.item)}</b></td><td class="num">${l.quantity} ${esc(l.unit)}</td><td class="num ${l.in_stock < l.quantity ? 'err-text' : ''}">${l.in_stock}</td>
            <td class="num">${decide ? `<input class="qty" type="number" min="0" max="${l.quantity}" step="1" value="${Math.min(l.quantity, l.in_stock)}" data-line="${l.id}" aria-label="Approved quantity of ${esc(l.item)}">` : (r.status === 'approved' ? (l.approved_qty ?? 0) : '-')}</td></tr>`).join('')}</tbody></table></div>
        ${r.status === 'approved' ? `<p class="muted">Approved by ${esc(r.decided_by)} on ${Q.fmtDate(r.decided_at)}.${r.decision_note ? ' ' + esc(r.decision_note) : ''}</p>` : ''}
        ${r.status === 'rejected' ? `<p class="reason">Rejected by ${esc(r.decided_by)}. Reason: ${esc(r.decision_note || '')}</p>` : ''}
        ${decide ? `<label>Note or reason <input id="decNote" placeholder="Required if you reject; optional if you approve"></label>` : ''}
        <p class="error" id="decErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn" data-close>Close</button>
          ${r.voucher_id ? `<button class="btn" data-slip="${r.voucher_id}">${Q.icon('printer')} Slip ${esc(r.voucher_no)}</button>` : ''}
          ${decide ? `<button class="btn danger" id="rejectBtn">Reject</button><button class="btn primary" id="approveBtn">${Q.icon('check')} Approve and issue</button>` : ''}</div></div>`, true);
    if (!decide) return;
    $('#approveBtn', body).onclick = async () => {
      const lines = $$('[data-line]', body).map(i => ({ id: Number(i.dataset.line), approved_qty: Number(i.value) }));
      try { await Q.api(`/requisitions/${id}/approve`, { method: 'POST', body: { lines, note: $('#decNote', body).value } }); Q.closeModal(); Q.toast('Approved. Items issued and slip created.'); Q.poll(false); Q.route(); }
      catch (e) { $('#decErr', body).textContent = e.message; }
    };
    $('#rejectBtn', body).onclick = async () => {
      try { await Q.api(`/requisitions/${id}/reject`, { method: 'POST', body: { reason: $('#decNote', body).value } }); Q.closeModal(); Q.toast('Request rejected.'); Q.poll(false); Q.route(); }
      catch (e) { $('#decErr', body).textContent = e.message; }
    };
  },
};
