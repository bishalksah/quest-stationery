Q.pages.admin = {
  tab: 'institutions',
  async render(view, live) {
    const P = Q.pages.admin;
    view.innerHTML = `<div class="page-head"><div class="tabs" role="tablist">${[['institutions', 'Institutions'], ['users', 'Users'], ['audit', 'Audit log'], ['backup', 'Backup and settings']].map(t => `<button class="tab${P.tab === t[0] ? ' active' : ''}" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div class="actions" id="adminActions"></div></div><div id="adminArea"></div>`;
    $$('.tab', view).forEach(t => t.onclick = () => { P.tab = t.dataset.t; Q.route(); });
    await P[P.tab](live);
  },

  async institutions() {
    const P = Q.pages.admin, rows = await Q.api('/institutions');
    $('#adminActions').innerHTML = `<button class="btn primary" id="addInst">${Q.icon('plus')} Add institution</button>`;
    $('#adminArea').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Institution</th><th class="num">Monthly budget</th><th>Used this month</th><th></th></tr></thead><tbody>
      ${rows.map(r => { const p = r.monthly_budget > 0 ? Math.round(100 * r.used / r.monthly_budget) : null;
        return `<tr><td><b>${esc(r.name)}</b></td><td class="num">${r.monthly_budget > 0 ? Q.money(r.monthly_budget) : '<span class="muted">No limit</span>'}</td>
        <td style="min-width:200px">${Q.money(r.used)}${p !== null ? ` (${p}%)<div class="progress slim ${p >= 100 ? 'bad' : p >= 90 ? 'warn' : ''}"><div class="progress-bar" style="width:${Math.min(100, p)}%"></div></div>` : ''}</td>
        <td class="row-actions">${Q.iconBtn('edit', 'Edit', `data-edit="${r.id}"`)}${Q.iconBtn('trash', 'Delete', `data-del="${r.id}"`, 'danger')}</td></tr>`; }).join('')}</tbody></table></div>`
      : `<div class="panel">${Q.empty('settings', 'No institutions yet', 'Add each college or school you supply. A monthly budget is optional.')}</div>`;
    const dlg = r => {
      const b = Q.modal(r ? 'Edit institution' : 'Add institution', `<form id="instForm" class="stack"><label>Name <input name="name" required value="${esc(r ? r.name : '')}"></label>
        <label>Monthly stationery budget (₹) <input name="b" type="number" min="0" step="1" value="${r ? r.monthly_budget : 0}"></label><p class="hint">Use 0 for no limit. You are warned at 90% and when the budget is crossed.</p><p class="error" id="instErr" role="alert"></p>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`);
      $('#instForm', b).onsubmit = async e => { e.preventDefault(); const f = e.target;
        try { await Q.api(r ? '/institutions/' + r.id : '/institutions', { method: r ? 'PUT' : 'POST', body: { name: f.name.value, monthly_budget: f.b.value } }); Q.closeModal(); Q.toast('Saved.'); Q.route(); }
        catch (err) { $('#instErr').textContent = String(err.message).includes('already') ? 'That institution already exists.' : err.message; } };
    };
    $('#addInst').onclick = () => dlg();
    $('#adminArea').onclick = async e => {
      const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
      if (ed) dlg(rows.find(r => r.id == ed.dataset.edit));
      if (del && confirm('Delete this institution?')) { try { await Q.api('/institutions/' + del.dataset.del, { method: 'DELETE' }); Q.toast('Deleted.'); Q.route(); } catch (err) { Q.toast(err.message, true); } }
    };
  },

  async users() {
    const [rows, insts] = await Promise.all([Q.api('/users'), Q.api('/institutions')]);
    $('#adminActions').innerHTML = `<button class="btn primary" id="addUser">${Q.icon('plus')} Add user</button>`;
    $('#adminArea').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Institution</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(u => `<tr class="${u.active ? '' : 'dim'}"><td><b>${esc(u.name)}</b></td><td>${esc(u.username)}</td><td><span class="chip ${u.role === 'admin' ? 'info' : u.role === 'viewer' ? 'muted' : 'low'}">${esc(Q.roleLabel(u.role))}</span></td>
        <td>${esc(u.institution || '-')}${u.department ? `<small class="block muted">${esc(u.department)}</small>` : ''}</td><td>${esc(u.email || '')}</td><td>${u.active ? '<span class="chip ok">Active</span>' : '<span class="chip muted">Disabled</span>'}</td>
        <td class="row-actions">${Q.iconBtn('edit', 'Edit', `data-edit="${u.id}"`)}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint pad">Department users send requests for their own institution. Management users can see everything but change nothing. Store administrators have full control.</p>`;
    const dlg = u => {
      const b = Q.modal(u ? 'Edit user' : 'Add user', `<form id="userForm" class="stack">
        <div class="row2"><label>Full name <input name="name" required value="${esc(u ? u.name : '')}"></label><label>Username <input name="username" ${u ? 'disabled' : 'required'} value="${esc(u ? u.username : '')}" autocomplete="off"></label></div>
        <div class="row2"><label>Role <select name="role"><option value="requester">Department user (sends requests)</option><option value="viewer">Management (view only)</option><option value="admin">Store administrator</option></select></label>
          <label>Institution <select name="inst"><option value="">None</option>${insts.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></label></div>
        <div class="row2"><label>Department <input name="department" value="${esc(u ? u.department || '' : '')}"></label><label>Email (optional) <input name="email" type="email" value="${esc(u ? u.email || '' : '')}"></label></div>
        <label>${u ? 'New password (leave blank to keep the current one)' : 'Password (6 or more characters)'} <input name="password" type="text" autocomplete="off" ${u ? '' : 'required'} minlength="6"></label>
        ${u ? '<label class="check"><input type="checkbox" name="active"> Account is active</label>' : ''}
        <p class="error" id="userErr" role="alert"></p><div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save user</button></div></form>`);
      const f = $('#userForm', b); if (u) { f.role.value = u.role; f.inst.value = u.institution_id || ''; f.active.checked = !!u.active; }
      f.onsubmit = async e => { e.preventDefault();
        const body = { name: f.name.value, role: f.role.value, institution_id: f.inst.value || null, department: f.department.value, email: f.email.value };
        if (f.password.value) body.password = f.password.value; if (u) body.active = f.active.checked; else body.username = f.username.value;
        try { await Q.api(u ? '/users/' + u.id : '/users', { method: u ? 'PUT' : 'POST', body }); Q.closeModal(); Q.toast('User saved.'); Q.route(); } catch (err) { $('#userErr').textContent = err.message; } };
    };
    $('#addUser').onclick = () => dlg();
    $('#adminArea').onclick = e => { const ed = e.target.closest('[data-edit]'); if (ed) dlg(rows.find(r => r.id == ed.dataset.edit)); };
  },

  async audit() {
    $('#adminActions').innerHTML = `<button class="btn" id="auExp">${Q.icon('download')} Download CSV</button>`;
    $('#auExp').onclick = () => Q.exportCsv('audit');
    $('#adminArea').innerHTML = `<div class="filters"><label class="search">${Q.icon('search', 16)}<input id="auQ" type="search" placeholder="Search by person, action or detail"></label></div><div id="auTable"></div>`;
    const load = async () => { const rows = await Q.api('/audit?q=' + encodeURIComponent($('#auQ').value));
      $('#auTable').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>${rows.map(r => `<tr><td>${Q.fmtDate(r.created_at)}</td><td>${esc(r.user)}</td><td><b>${esc(r.action)}</b></td><td>${esc(r.detail || '')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="panel">${Q.empty('file', 'Nothing logged', '')}</div>`; };
    $('#auQ').oninput = Q.debounce(() => load().catch(e => Q.toast(e.message, true))); await load();
  },

  async backup() {
    $('#adminArea').innerHTML = `<div class="grid-2">
      <div class="panel"><div class="panel-head"><h3>Backup</h3></div>
        <p>Download a copy of all your data (items, records, users) as one file and keep it somewhere safe, such as Google Drive. Do this regularly, for example once a month.</p>
        <button class="btn primary" id="bkBtn">${Q.icon('download')} Download backup now</button>
        <p class="hint">The backup file contains user password codes, so keep it private. Item photos are not included in this download.</p>
        <h4>Restoring and full backups (with photos)</h4>
        <p>These two steps run from the project folder on a computer, using the same database settings as the website:</p>
        <p><code>npm run backup</code> saves everything including photos.<br><code>npm run restore -- backup-file.json</code> replaces all data with the backup.</p>
        <p class="hint">Your database host may also keep its own recent copies. Check its dashboard.</p></div>
      <div class="panel"><div class="panel-head"><h3>Email alerts</h3></div>
        <p>Low-stock and budget alerts can also be emailed to store administrators who have an email address (set one under Users). To switch this on, add these settings where the website is hosted (on Vercel: Project, Settings, Environment Variables):</p>
        <pre class="code">SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourname@gmail.com
SMTP_PASS=your-app-password
ALERT_EMAIL=store@yourcollege.edu</pre><p class="hint">Without these, alerts show only in the bell. WhatsApp alerts need a paid messaging service and are not included.</p>
        <h4>Your account</h4><p>Use the account button at the top right to change your password. New users are added under Users.</p></div></div>`;
    $('#bkBtn').onclick = () => Q.download('/api/backup', 'stationery-backup.json');
  },
};
