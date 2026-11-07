Q.pages.dashboard = {
  async render(view, live) {
    const s = await Q.api('/summary'); if (!live()) return;
    const h = new Date().getHours(), greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const first = Q.user.name;

    if (Q.can('requester')) {
      view.innerHTML = `
        <section class="hero"><div><p class="hero-date">${today}</p><h2>${greet}, ${esc(first)}</h2>
          <p>${esc(Q.user.institution || '')}${Q.user.department ? ' · ' + esc(Q.user.department) : ''}. Ask the store for what your department needs and follow the request here.</p></div>
          <div class="hero-actions"><button class="btn light" id="newReq">${Q.icon('plus')} New request</button></div></section>
        <div class="stats">
          <div class="stat warn"><span class="stat-ic">${Q.icon('clipboard', 22)}</span><b data-count="${s.mine.pending}">0</b><span>Waiting for approval</span></div>
          <div class="stat good"><span class="stat-ic">${Q.icon('check', 22)}</span><b data-count="${s.mine.approved}">0</b><span>Approved and issued</span></div>
          <div class="stat bad"><span class="stat-ic">${Q.icon('x', 22)}</span><b data-count="${s.mine.rejected}">0</b><span>Not approved</span></div>
        </div>
        <div class="panel"><div class="panel-head"><h3>Your recent requests</h3><a class="link-btn" href="#requests">See all</a></div>
          ${s.recent.length ? s.recent.map(r => `<div class="list-row"><div><b>${esc(r.req_no)}</b><small>${r.line_count} item${r.line_count > 1 ? 's' : ''} · ${Q.fmtDate(r.created_at)}</small></div>${Q.reqChip(r.status)}</div>`).join('')
            : Q.empty('clipboard', 'No requests yet', 'Press New request to ask the store for items.')}</div>`;
      $('#newReq').onclick = () => Q.openRequestModal();
      Q.countUp(view); return;
    }

    let budgets = [];
    try { budgets = (await Q.api('/institutions')).filter(i => i.monthly_budget > 0); } catch {}
    if (!live()) return;
    view.innerHTML = `
      <section class="hero"><div><p class="hero-date">${today}</p><h2>${greet}, ${esc(first)}</h2>
        <p>${s.low ? `${s.low} item${s.low > 1 ? 's need' : ' needs'} attention.` : 'Every item is above its minimum level.'} ${Q.can('admin') && s.pending ? `${s.pending} request${s.pending > 1 ? 's are' : ' is'} waiting for your decision.` : ''}</p></div>
        <div class="hero-actions">
          ${Q.can('admin') ? `<a class="btn light" href="#issue">${Q.icon('send')} Issue items</a><a class="btn ghost-light" href="#requests">${Q.icon('clipboard')} Requests${s.pending ? ` (${s.pending})` : ''}</a>` : ''}
          <a class="btn ghost-light" href="#reports">${Q.icon('chart')} Reports</a></div></section>
      <div class="stats">
        <div class="stat"><span class="stat-ic">${Q.icon('box', 22)}</span><b data-count="${s.items}">0</b><span>Item types in store</span></div>
        <div class="stat"><span class="stat-ic">${Q.icon('grid', 22)}</span><b data-count="${s.units}">0</b><span>Units on hand</span></div>
        <div class="stat"><span class="stat-ic">${Q.icon('rupee', 22)}</span><b data-count="${Math.round(s.value)}" data-pre="₹">0</b><span>Stock value</span></div>
        <div class="stat ${s.low ? 'bad' : 'good'}"><span class="stat-ic">${Q.icon('alert', 22)}</span><b data-count="${s.low}">0</b><span>Low or out of stock</span></div>
        <div class="stat"><span class="stat-ic">${Q.icon('send', 22)}</span><b data-count="${s.issuedToday}">0</b><span>Units issued today</span></div>
        <div class="stat ${s.pending ? 'warn' : ''}"><span class="stat-ic">${Q.icon('clipboard', 22)}</span><b data-count="${s.pending}">0</b><span>Requests waiting</span></div>
      </div>
      <div class="grid-2">
        <div class="panel"><div class="panel-head"><h3>Units issued each month</h3></div>${Q.barChart(s.trend.map(t => ({ label: Q.monthLabel(t.month), value: t.units })))}</div>
        <div class="panel"><div class="panel-head"><h3>Running low</h3><a class="link-btn" href="#store">Open store</a></div>
          ${s.lowItems.length ? s.lowItems.map(i => `<div class="list-row"><div><b>${esc(i.name)}</b><small>Minimum ${i.min_stock} ${esc(i.unit)}</small>
            <div class="progress slim ${i.quantity === 0 ? 'bad' : 'warn'}"><div class="progress-bar" style="width:${Math.min(100, Math.round(100 * i.quantity / Math.max(i.min_stock, 1)))}%"></div></div></div>
            <div class="right"><b>${i.quantity}</b> ${esc(i.unit)}<small>left</small></div></div>`).join('')
            : Q.empty('check', 'All stocked up', 'Nothing is below its minimum level.')}</div>
      </div>
      <div class="grid-2">
        <div class="panel"><div class="panel-head"><h3>Recently issued</h3><a class="link-btn" href="#records">All records</a></div>
          ${s.recent.length ? s.recent.map(r => `<div class="list-row"><div><b>${esc(r.item)}</b><small>${esc(r.issued_to)}, ${esc(r.institution)}</small></div>
            <div class="right"><b>${r.quantity}</b> ${esc(r.unit)}<small>${r.voucher_id ? `<a href="#" data-slip="${r.voucher_id}" class="link">${esc(r.voucher_no)}</a> · ` : ''}${Q.fmtDate(r.issued_at, false)}</small></div></div>`).join('')
            : Q.empty('send', 'Nothing issued yet', 'Issued items will be listed here.')}</div>
        <div class="panel"><div class="panel-head"><h3>Budgets this month</h3><a class="link-btn" href="#reports">Details</a></div>
          ${budgets.length ? budgets.map(b => { const p = Math.round(100 * b.used / b.monthly_budget);
            return `<div class="hbar"><div class="hbar-top"><span>${esc(b.name)}</span><b>${Q.money(b.used)} of ${Q.money(b.monthly_budget)}</b></div><div class="progress ${p >= 100 ? 'bad' : p >= 90 ? 'warn' : ''}"><div class="progress-bar" style="width:${Math.min(100, p)}%"></div></div></div>`; }).join('')
            : Q.empty('rupee', 'No budgets set', Q.can('admin') ? 'Set a monthly budget for an institution under Admin.' : 'No monthly budgets have been set.')}</div>
      </div>`;
    Q.countUp(view);
  },
};
document.addEventListener('click', e => { if (e.target.closest('a[data-slip]')) e.preventDefault(); });
