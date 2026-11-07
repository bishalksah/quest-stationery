/* Core helpers shared by every page: API, icons, modal, router, notifications, charts */
const Q = window.Q = { pages: {}, user: null, token: sessionStorage.getItem('qs_token') || '' };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Icons (Feather-style) ---------- */
const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  box: '<path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  rows: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  rupee: '<path d="M6 3h12"/><path d="M6 8h12"/><path d="M6 13l8.5 8"/><path d="M6 13h3a4 4 0 0 0 0-8"/>',
};
Q.icon = (n, size = 18) => `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
Q.iconBtn = (name, label, attrs = '', cls = '') => `<button type="button" class="icon-btn small ${cls}" title="${label}" aria-label="${label}" ${attrs}>${Q.icon(name, 16)}</button>`;

/* ---------- Small helpers ---------- */
Q.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const esc = Q.esc;
Q.fmtDate = (s, withTime = true) => {
  const d = new Date(String(s).replace(' ', 'T')); if (isNaN(d)) return s;
  return d.toLocaleString('en-IN', withTime ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' });
};
Q.money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
Q.monthLabel = m => new Date(m + '-01T00:00:00').toLocaleString('en-IN', { month: 'short' });
Q.debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
Q.can = (...roles) => Q.user && roles.includes(Q.user.role);
Q.roleLabel = r => ({ admin: 'Store administrator', requester: 'Department user', viewer: 'Management (view only)' }[r] || r);
Q.statusChip = i => i.quantity === 0 ? '<span class="chip out">Out of stock</span>' : i.quantity <= i.min_stock ? '<span class="chip low">Low stock</span>' : '<span class="chip ok">In stock</span>';
Q.reqChip = s => `<span class="chip ${{ pending: 'low', approved: 'ok', rejected: 'out', cancelled: 'muted' }[s] || 'muted'}">${s[0].toUpperCase() + s.slice(1)}</span>`;
Q.empty = (icon, title, text) => `<div class="empty">${Q.icon(icon, 34)}<b>${title}</b><span>${text || ''}</span></div>`;
Q.loading = el => { el.innerHTML = '<div class="skeleton"></div><div class="skeleton short"></div>'; };

Q.toast = (msg, isErr) => {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!isErr); t.classList.add('show');
  clearTimeout(Q.toast.t); Q.toast.t = setTimeout(() => t.classList.remove('show'), 3600);
};

/* ---------- API ---------- */
Q.api = async (path, opts = {}) => {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Q.token, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && path !== '/login') { Q.signOut(); throw new Error('Please sign in again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};
Q.download = async (what, filename) => {
  try {
    const res = await fetch(what, { headers: { Authorization: 'Bearer ' + Q.token } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Download failed.');
    const blob = await res.blob(), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  } catch (e) { Q.toast(e.message, true); }
};
Q.exportCsv = what => Q.download('/api/export/' + what, what + '.csv');

/* ---------- Modal ---------- */
Q.modal = (title, body, wide) => {
  $('#modalBox').innerHTML = `<div class="modal-head"><h3>${title}</h3><button type="button" class="icon-btn" data-close aria-label="Close">${Q.icon('x')}</button></div><div class="modal-body">${body}</div>`;
  $('#modal').classList.toggle('wide', !!wide);
  const d = $('#modal'); if (!d.open) d.showModal();
  return $('.modal-body', d);
};
Q.closeModal = () => { const d = $('#modal'); if (d.open) d.close(); };
document.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) Q.closeModal();
  else if (e.target === $('#modal')) Q.closeModal();   // click on the backdrop
});

/* ---------- Charts ---------- */
Q.barChart = (data, fmt = v => v) => {
  const w = 600, h = 230, t = 28, b = 30, max = Math.max(1, ...data.map(d => d.value)), bw = w / data.length;
  const bars = data.map((d, i) => {
    const bh = Math.round((h - t - b) * d.value / max), x = i * bw + bw * 0.18, ww = bw * 0.64, y = h - b - bh;
    return `<rect class="bar${d.value === max && max > 1 ? ' top' : ''}" x="${x}" y="${y}" width="${ww}" height="${Math.max(bh, d.value ? 2 : 0)}" rx="5"><title>${esc(d.label)}: ${esc(fmt(d.value))}</title></rect>
      <text class="bar-val" x="${x + ww / 2}" y="${y - 7}" text-anchor="middle">${d.value ? esc(fmt(d.value)) : ''}</text>
      <text class="bar-lbl" x="${x + ww / 2}" y="${h - 9}" text-anchor="middle">${esc(d.label)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Bar chart">${bars}<line class="axis" x1="0" y1="${h - b}" x2="${w}" y2="${h - b}"/></svg>`;
};
Q.hbars = (rows, fmt = v => v) => {
  const max = Math.max(1, ...rows.map(r => r.value));
  return rows.map(r => `<div class="hbar"><div class="hbar-top"><span>${esc(r.label)}</span><b>${esc(fmt(r.value))}</b></div><div class="progress"><div class="progress-bar" style="width:${Math.max(3, Math.round(100 * r.value / max))}%"></div></div></div>`).join('');
};
Q.countUp = root => $$('[data-count]', root).forEach(el => {
  const end = Number(el.dataset.count), pre = el.dataset.pre || '', t0 = performance.now(), dur = 700;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !end) { el.textContent = pre + end.toLocaleString('en-IN'); return; }
  const tick = t => { const p = Math.min(1, (t - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - p, 3))); el.textContent = pre + v.toLocaleString('en-IN'); if (p < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});

/* ---------- Photo helper: shrink to a small JPEG before saving ---------- */
Q.shrinkPhoto = file => new Promise((resolve, reject) => {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const s = Math.min(1, 220 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.75));
  };
  img.onerror = () => reject(new Error('That file is not a readable image.'));
  img.src = url;
});
Q.thumb = (i, cls = '') => i.photo ? `<img class="thumb ${cls}" src="${i.photo}" alt="">` : `<span class="thumb ph ${cls}" aria-hidden="true">${esc((i.name || '?')[0].toUpperCase())}</span>`;

/* ---------- Printable issue slip ---------- */
Q.showSlip = async id => {
  try {
    const v = await Q.api('/vouchers/' + id), showMoney = Q.can('admin', 'viewer');
    const total = v.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    Q.modal('Issue slip', `
      <div class="slip" id="slip">
        <div class="slip-head"><img src="logo.webp" alt="Quest Group of Institutions"><div><h2>ISSUE SLIP</h2><b>${esc(v.voucher_no)}</b><span>${Q.fmtDate(v.created_at)}</span></div></div>
        <div class="slip-meta">
          <div><small>Institution</small><b>${esc(v.institution)}</b></div>
          <div><small>Department</small><b>${esc(v.department || '-')}</b></div>
          <div><small>Issued to</small><b>${esc(v.issued_to)}</b></div>
          <div><small>Reference</small><b>${esc(v.note || '-')}</b></div>
        </div>
        <table><thead><tr><th>#</th><th>Item</th><th class="num">Quantity</th>${showMoney ? '<th class="num">Rate</th><th class="num">Amount</th>' : ''}</tr></thead><tbody>
          ${v.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.item)}</td><td class="num">${l.quantity} ${esc(l.unit)}${l.returned_qty ? ` <small>(${l.returned_qty} returned)</small>` : ''}</td>${showMoney ? `<td class="num">${Q.money(l.unit_price)}</td><td class="num">${Q.money(l.quantity * l.unit_price)}</td>` : ''}</tr>`).join('')}
          ${showMoney ? `<tr class="total"><td colspan="4">Total</td><td class="num">${Q.money(total)}</td></tr>` : ''}
        </tbody></table>
        <div class="sign"><div><span></span>Issued by<br><b>${esc(v.issued_by || '')}</b><br><small>Store In-charge</small></div><div><span></span>Received by<br><b>${esc(v.issued_to)}</b></div></div>
        <p class="slip-foot">Quest Group of Institutions · Stationery Store</p>
      </div>
      <div class="modal-actions no-print"><button class="btn" data-close>Close</button><button class="btn primary" id="printSlip">${Q.icon('printer')} Print slip</button></div>`, true);
    $('#printSlip').onclick = () => window.print();
  } catch (e) { Q.toast(e.message, true); }
};
document.addEventListener('click', e => { const b = e.target.closest('[data-slip]'); if (b) Q.showSlip(b.dataset.slip); });

/* ---------- Router ---------- */
Q.navItems = () => [
  ['dashboard', 'Dashboard', 'home', ['admin', 'viewer', 'requester']],
  ['store', 'Store items', 'box', ['admin', 'viewer', 'requester']],
  ['issue', 'Issue items', 'send', ['admin']],
  ['requests', Q.can('requester') ? 'My requests' : 'Requisitions', 'clipboard', ['admin', 'viewer', 'requester']],
  ['records', 'Records', 'file', ['admin', 'viewer']],
  ['reports', 'Reports', 'chart', ['admin', 'viewer']],
  ['admin', 'Admin', 'settings', ['admin']],
].filter(n => n[3].includes(Q.user.role));

let renderId = 0;
Q.route = async () => {
  if (!Q.user) return;
  const nav = Q.navItems(), want = (location.hash || '#dashboard').slice(1).split('?')[0];
  const cur = nav.find(n => n[0] === want) || nav[0], page = Q.pages[cur[0]];
  $('#nav').innerHTML = nav.map(n => `<a href="#${n[0]}" class="nav-link${n[0] === cur[0] ? ' active' : ''}">${Q.icon(n[2], 19)}<span>${n[1]}</span>${n[0] === 'requests' && Q.pending ? `<i class="nav-badge">${Q.pending}</i>` : ''}</a>`).join('');
  $('#pageTitle').textContent = cur[1];
  document.title = cur[1] + ' · Quest Stationery Store';
  closeMenu();
  const view = $('#view'), my = ++renderId;
  Q.loading(view);
  try { await page.render(view, () => my === renderId); }
  catch (e) { if (my === renderId) view.innerHTML = Q.empty('alert', 'Could not load this page', esc(e.message)); }
  if (my === renderId) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); window.scrollTo(0, 0); }
};
window.addEventListener('hashchange', () => Q.route());
Q.refresh = () => Q.route();

/* ---------- Mobile menu & theme ---------- */
const closeMenu = () => { $('#side').classList.remove('open'); $('#scrim').classList.remove('show'); };
$('#menuBtn').innerHTML = Q.icon('menu', 22);
$('#menuBtn').onclick = () => { $('#side').classList.add('open'); $('#scrim').classList.add('show'); };
$('#scrim').onclick = closeMenu;
$('#bellIcon').innerHTML = Q.icon('bell', 21);
function paintTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#themeBtn').innerHTML = Q.icon(dark ? 'sun' : 'moon') + (dark ? ' Light mode' : ' Dark mode');
}
$('#themeBtn').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t; localStorage.setItem('qs_theme', t); paintTheme();
};
$('#logout').innerHTML = Q.icon('logout') + ' Sign out';
paintTheme();

/* ---------- Notifications ---------- */
let pollTimer = null, lastNotifId = null;
const ago = s => {
  const m = Math.round((Date.now() - new Date(s.replace(' ', 'T'))) / 60000);
  if (isNaN(m) || m < 1) return 'Just now'; if (m < 60) return m + ' min ago'; if (m < 1440) return Math.round(m / 60) + ' hr ago';
  return Q.fmtDate(s);
};
Q.poll = async first => {
  if (!Q.token) return;
  try {
    const { unread, items, pending = 0 } = await Q.api('/notifications'), newest = items.length ? items[0].id : 0;
    if (Q.can('admin', 'viewer') && pending !== Q.pending) {
      Q.pending = pending; const nl = $('#nav .nav-link[href="#requests"]');
      if (nl) { const old = $('.nav-badge', nl); if (old) old.remove(); if (pending) nl.insertAdjacentHTML('beforeend', `<i class="nav-badge">${pending}</i>`); }
    }
    if (lastNotifId !== null && newest > lastNotifId) {
      const fresh = items.filter(n => n.id > lastNotifId && !n.is_read);
      if (fresh.length) {
        Q.toast(fresh.length === 1 ? `${fresh[0].title}: ${fresh[0].message}` : `${fresh.length} new notifications`, fresh.some(n => n.type === 'danger'));
        const b = $('#bell'); b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring');
        // keep the page you are looking at up to date (for example a request that was just approved)
        if (!$('#modal').open && fresh.some(n => n.link && '#' + n.link === (location.hash || '#dashboard'))) Q.route();
      }
    }
    if (first && unread) Q.toast(`You have ${unread} unread notification${unread > 1 ? 's' : ''}.`);
    lastNotifId = Math.max(lastNotifId || 0, newest);
    const c = $('#bellCount'); c.textContent = unread > 99 ? '99+' : unread; c.classList.toggle('hidden', !unread);
    $('#notifList').innerHTML = items.length ? items.map(n => `
      <button class="notif ${esc(n.type)}${n.is_read ? '' : ' unread'}" data-id="${n.id}" data-link="${esc(n.link || '')}">
        <i class="dot"></i><div><b>${esc(n.title)}</b><span>${esc(n.message)}</span><small>${ago(n.created_at)}</small></div></button>`).join('')
      : '<p class="notif-empty">No notifications yet. Alerts and activity will appear here.</p>';
  } catch { /* ignore polling errors */ }
  // the pending-requests badge comes along with the notifications call (one request instead of two)
}
Q.startPolling = () => { clearInterval(pollTimer); lastNotifId = null; Q.poll(true); pollTimer = setInterval(() => Q.poll(false), 30000); };
Q.stopPolling = () => clearInterval(pollTimer);
const closePanel = () => { $('#notifPanel').classList.add('hidden'); $('#bell').setAttribute('aria-expanded', 'false'); };
$('#bell').onclick = e => {
  e.stopPropagation();
  const open = $('#notifPanel').classList.toggle('hidden') === false;
  $('#bell').setAttribute('aria-expanded', open); if (open) Q.poll(false);
};
document.addEventListener('click', e => { if (!e.target.closest('.notif-wrap')) closePanel(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
$('#notifList').onclick = async e => {
  const b = e.target.closest('.notif'); if (!b) return;
  try { await Q.api(`/notifications/${b.dataset.id}/read`, { method: 'POST' }); } catch {}
  closePanel();
  if (b.dataset.link) { if (location.hash === '#' + b.dataset.link) Q.route(); else location.hash = b.dataset.link; }
  Q.poll(false);
};
$('#markAll').onclick = async () => { try { await Q.api('/notifications/read-all', { method: 'POST' }); Q.poll(false); } catch (e) { Q.toast(e.message, true); } };
$('#clearAll').onclick = async () => { if (confirm('Clear all notifications?')) try { await Q.api('/notifications', { method: 'DELETE' }); Q.poll(false); } catch (e) { Q.toast(e.message, true); } };

/* ---------- My account ---------- */
$('#adminChip').onclick = () => {
  const u = Q.user, body = Q.modal('My account', `
    <div class="account"><span class="avatar big">${esc(Q.initials(u.name))}</span><div><b>${esc(u.name)}</b><br><span class="muted">${Q.roleLabel(u.role)}${u.institution ? ' · ' + esc(u.institution) : ''}${u.department ? ', ' + esc(u.department) : ''}</span><br><small class="muted">Signed in as ${esc(u.username)}</small></div></div>
    <h4>Change password</h4>
    <form id="pwForm" class="stack">
      <label>Current password <input type="password" name="current" autocomplete="current-password" required></label>
      <label>New password (6 or more characters) <input type="password" name="next" autocomplete="new-password" minlength="6" required></label>
      <p class="error" id="pwErr" role="alert"></p>
      <div class="modal-actions"><button type="button" class="btn" data-close>Close</button><button class="btn primary">Update password</button></div>
    </form>`);
  $('#pwForm', body).onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    try { const r = await Q.api('/me/password', { method: 'POST', body: { current: f.current.value, next: f.next.value } }); Q.token = r.token; sessionStorage.setItem('qs_token', r.token); Q.closeModal(); Q.toast('Password updated.'); }
    catch (err) { $('#pwErr').textContent = err.message; }
  };
};
Q.initials = n => n.replace(/^(miss|mr|mrs|ms|dr|prof)\.?\s+/i, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/* ---------- Sign in / out ---------- */
Q.signOut = () => {
  Q.stopPolling(); Q.token = ''; Q.user = null; sessionStorage.removeItem('qs_token'); closePanel(); Q.closeModal();
  $('#app').classList.add('hidden'); $('#login').classList.remove('hidden');
};
$('#logout').onclick = async () => { try { await Q.api('/logout', { method: 'POST' }); } catch {} Q.signOut(); };
Q.enter = user => {
  Q.user = user; Q.pending = 0;
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#adminName').textContent = user.name; $('#adminRole').textContent = Q.roleLabel(user.role); $('#adminAvatar').textContent = Q.initials(user.name);
  Q.startPolling(); Q.route();
};
$('#loginForm').onsubmit = async e => {
  e.preventDefault(); $('#loginError').textContent = '';
  const f = new FormData(e.target);
  try {
    const r = await Q.api('/login', { method: 'POST', body: { username: f.get('username'), password: f.get('password') } });
    Q.token = r.token; sessionStorage.setItem('qs_token', r.token); e.target.reset(); Q.enter(r.user);
  } catch (err) { $('#loginError').textContent = err.message; }
};

/* ---------- CSV helpers ---------- */
Q.parseCsv = text => {
  const rows = []; let row = [], cur = '', q = false; text = text.replace(/^\ufeff/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
};
