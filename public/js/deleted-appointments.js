let DELETED = [];

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadDeleted(), loadPatientName()]);
}

async function loadDeleted() {
  const res = await fetch(apiUrl('appointments/deleted'));
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/appointments/deleted');
  DELETED = d.appointments || [];
  renderDeleted();
}

function formatDeletedAt(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

function renderDeleted() {
  const tbody = document.getElementById('deletedBody');
  const empty = document.getElementById('emptyMsg');
  if (DELETED.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = DELETED.map(a => `
    <tr>
      <td>${a.date}</td>
      <td title="${a.hospital}">${a.hospital}</td>
      <td title="${a.service}">${a.service}</td>
      <td title="${a.doctor}">${a.doctor}</td>
      <td>${formatDeletedAt(a.deletedAt)}</td>
      <td class="action-cell">
        <div class="action-stack">
          <button class="sm" onclick="recoverAppointment(${a.id})">Recover</button>
          <button class="sm danger" onclick="permanentDelete(${a.id})">Delete Forever</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function recoverAppointment(id) {
  const res = await fetch(apiUrl('appointments/' + id + '/recover'), { method: 'PATCH' });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/appointments/:id/recover');
  if (!res.ok || !d.ok) { toast('Recover failed: ' + (d.error || ''), 'err'); return; }
  DELETED = DELETED.filter(a => a.id !== id);
  renderDeleted();
  toast('Appointment recovered', 'ok');
}

async function permanentDelete(id) {
  if (!await appConfirm('Permanently delete this appointment? This cannot be undone.', { title: 'Delete Forever', okText: 'Delete Forever' })) return;
  const res = await fetch(apiUrl('appointments/' + id + '/permanent'), { method: 'DELETE' });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/appointments/:id/permanent');
  if (!res.ok || !d.ok) { toast('Delete failed: ' + (d.error || ''), 'err'); return; }
  DELETED = DELETED.filter(a => a.id !== id);
  renderDeleted();
  toast('Appointment permanently deleted', 'ok');
}

boot();
