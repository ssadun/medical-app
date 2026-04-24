let DELETED = [];

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadDeleted(), loadPatientName()]);
}

async function loadDeleted() {
  const res = await fetch(apiUrl('kayit/deleted'));
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/kayit/deleted');
  DELETED = d.kayitlar || [];
  renderDeleted();
}

function fmtDeletedAt(iso) {
  if (!iso) return '-';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '-';
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
  if (!DELETED.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = DELETED.map(r => `
    <tr class="${r.flag ? 'abn' : ''}">
      <td>${r.tarih || ''}</td>
      <td title="${r.tesis || ''}">${r.tesis || ''}</td>
      <td title="${r.tahlil || ''}">${r.tahlil || ''}</td>
      <td class="${r.flag ? 'bad' : 'ok'}">${r.flag ? '<span class="dot"></span>' : ''}${r.sonuc || ''}</td>
      <td>${r.birim || ''}</td>
      <td>${r.refAlt || ''}</td>
      <td>${r.refUst || ''}</td>
      <td>${fmtDeletedAt(r.deletedAt)}</td>
      <td class="action-cell">
        <div class="action-stack">
          <button class="sm" onclick="recoverRecord(${r.id})">Recover</button>
          <button class="sm danger" onclick="deletePermanent(${r.id})">Delete Forever</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function recoverRecord(id) {
  const res = await fetch(apiUrl('kayit/' + id + '/recover'), { method: 'PATCH' });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/kayit/:id/recover');
  if (!res.ok || !d.ok) {
    toast('Recover failed: ' + (d.error || ''), 'err');
    return;
  }
  DELETED = DELETED.filter(r => r.id !== id);
  renderDeleted();
  toast('Record recovered', 'ok');
}

async function deletePermanent(id) {
  if (!await appConfirm('Permanently delete this test record? This cannot be undone.', { title: 'Delete Forever', okText: 'Delete Forever' })) return;
  const res = await fetch(apiUrl('kayit/' + id + '/permanent'), { method: 'DELETE' });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/kayit/:id/permanent');
  if (!res.ok || !d.ok) {
    toast('Permanent delete failed: ' + (d.error || ''), 'err');
    return;
  }
  DELETED = DELETED.filter(r => r.id !== id);
  renderDeleted();
  toast('Record permanently deleted', 'ok');
}

boot();
