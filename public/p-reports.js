Q.pages.reports = {
  months: 6,
  async render(view, live) {
    const P = Q.pages.reports, d = await Q.api('/reports/overview?months=' + P.months); if (!live()) return;
    const totU = d.consumption.reduce((s, c) => s + c.units, 0), totV = d.consumption.reduce((s, c) => s + c.value, 0), totP = d.purchases.reduce((s, c) => s + c.spend, 0);
    const maxInst = Math.max(1, ...d.byInstitution.map(i => i.value));
    view.innerHTML = `
      <div class="page-head"><div class="filters"><label class="inline">Period <select id="rpPeriod">${[3, 6, 12].map(n => `<option value="${n}" ${n === P.months ? 'selected' : ''}>Last ${n} months</option>`).join('')}</select></label></div>
        <div class="actions no-print"><button class="btn" id="rpIssues">${Q.icon('download')} Issues CSV</button><button class="btn" id="rpStock">${Q.icon('download')} Stock CSV</button><button class="btn primary" id="rpPrint">${Q.icon('printer')} Print or save as PDF</button></div></div>
      <div class="print-title"><img src="logo.webp" alt=""><div><h2>Stationery report</h2><span>Last ${P.months} months · generated ${Q.fmtDate(new Date().toISOString())}</span></div></div>
      <div class="stats">
        <div class="stat"><span class="stat-ic">${Q.icon('send', 22)}</span><b data-count="${totU}">0</b><span>Units issued</span></div>
        <div class="stat"><span class="stat-ic">${Q.icon('rupee', 22)}</span><b data-count="${Math.round(totV)}" data-pre="₹">0</b><span>Value issued</span></div>
        <div class="stat"><span class="stat-ic">${Q.icon('download', 22)}</span><b data-count="${Math.round(totP)}" data-pre="₹">0</b><span>Spent on purchases</span></div>
      </div>
      <div class="grid-2">
        <div class="panel"><div class="panel-head"><h3>Value issued each month</h3></div>${Q.barChart(d.consumption.map(c => ({ label: Q.monthLabel(c.month), value: Math.round(c.value) })), v => Q.money(v))}</div>
        <div class="panel"><div class="panel-head"><h3>Purchases each month</h3></div>${Q.barChart(d.purchases.map(c => ({ label: Q.monthLabel(c.month), value: Math.round(c.spend) })), v => Q.money(v))}
          <p class="hint">Purchases are counted when a rate is entered while restocking.</p></div>
      </div>
      <div class="grid-2">
        <div class="panel"><div class="panel-head"><h3>Consumption by institution</h3></div>
          ${d.byInstitution.length ? `<div class="table-wrap flat"><table><thead><tr><th>Institution</th><th class="num">Units</th><th class="num">Value</th></tr></thead><tbody>${d.byInstitution.map(i => `<tr><td>${esc(i.institution)}<div class="progress slim"><div class="progress-bar" style="width:${Math.max(3, Math.round(100 * i.value / maxInst))}%"></div></div></td><td class="num">${i.units}</td><td class="num">${Q.money(i.value)}</td></tr>`).join('')}</tbody></table></div>` : Q.empty('chart', 'No issues in this period', '')}</div>
        <div class="panel"><div class="panel-head"><h3>Budget this month</h3></div>
          ${d.budgets.filter(b => b.monthly_budget > 0).length ? d.budgets.filter(b => b.monthly_budget > 0).map(b => { const p = Math.round(100 * b.used / b.monthly_budget);
            return `<div class="hbar"><div class="hbar-top"><span>${esc(b.name)}</span><b>${Q.money(b.used)} of ${Q.money(b.monthly_budget)} (${p}%)</b></div><div class="progress ${p >= 100 ? 'bad' : p >= 90 ? 'warn' : ''}"><div class="progress-bar" style="width:${Math.min(100, p)}%"></div></div></div>`; }).join('')
            : Q.empty('rupee', 'No budgets set', 'Set monthly budgets under Admin, then Institutions.')}</div>
      </div>
      <div class="grid-2">
        <div class="panel"><div class="panel-head"><h3>Most used items (last 90 days)</h3></div>${d.topItems.length ? Q.hbars(d.topItems.map(t => ({ label: t.name, value: t.units })), v => v + '') : Q.empty('box', 'No usage yet', '')}</div>
        <div class="panel"><div class="panel-head"><h3>Top suppliers (last 12 months)</h3></div>${d.suppliers.length ? Q.hbars(d.suppliers.map(s => ({ label: s.supplier + ' · ' + s.orders + ' order' + (s.orders > 1 ? 's' : ''), value: s.spend })), v => Q.money(v)) : Q.empty('download', 'No supplier spend recorded', 'Enter a supplier and rate when restocking.')}</div>
      </div>
      <div class="panel"><div class="panel-head"><h3>Reorder suggestions</h3><span class="muted">Based on the last 30 days of use, covering the next 30 days plus the minimum level</span></div>
        ${d.reorder.length ? `<div class="table-wrap flat"><table><thead><tr><th>Item</th><th class="num">In stock</th><th class="num">Used in 30 days</th><th class="num">Lasts about</th><th class="num">Suggested order</th>${Q.can('admin') ? '<th class="no-print"></th>' : ''}</tr></thead><tbody>
          ${d.reorder.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="num">${r.quantity} ${esc(r.unit)}</td><td class="num">${r.used_30}</td><td class="num ${r.days_left !== null && r.days_left < 14 ? 'err-text' : ''}">${r.days_left === null ? 'No recent use' : r.days_left + ' days'}</td><td class="num"><b>${r.suggested}</b> ${esc(r.unit)}</td>${Q.can('admin') ? `<td class="row-actions no-print"><a class="btn small" href="#store">Open store</a></td>` : ''}</tr>`).join('')}</tbody></table></div>`
          : Q.empty('check', 'Nothing to reorder', 'Stock levels look healthy for the next 30 days.')}</div>`;
    $('#rpPeriod').onchange = e => { P.months = Number(e.target.value); Q.route(); };
    $('#rpIssues').onclick = () => Q.exportCsv('issues'); $('#rpStock').onclick = () => Q.exportCsv('stock-in');
    $('#rpPrint').onclick = () => window.print();
    Q.countUp(view);
  },
};
