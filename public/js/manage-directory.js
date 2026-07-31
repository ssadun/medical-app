let VALUES = [];

function onLoginSuccess() { boot(); }

function cfg() {
  return window.MD_CONFIG || { key: '', label: 'Item' };
}

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadValues(), loadPatientName()]);
}

async function loadValues() {
  const c = cfg();
  if (!c.key) return;
  const res = await fetch(apiUrl('medical-directory'));
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/medical-directory');
  VALUES = (d.directory && Array.isArray(d.directory[c.key])) ? d.directory[c.key] : [];
  renderValues();
}

function renderValues() {
  const c = cfg();
  const body = document.getElementById('md-body');
  if (!body) return;
  if (!VALUES.length) {
    body.innerHTML = `<tr><td colspan="2" style="color:var(--text3)">No ${c.label.toLowerCase()} values yet.</td></tr>`;
    return;
  }
  body.innerHTML = VALUES.map((v, i) => `
    <tr>
      <td title="${v}">${v}</td>
      <td><button class="sm danger" onclick="removeValue(${i})">Delete</button></td>
    </tr>
  `).join('');
}

async function saveValues() {
  const c = cfg();
  const res = await fetch(apiUrl('medical-directory/' + encodeURIComponent(c.key)), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: VALUES })
  });
  if (res.status === 401) { showAuthModal(); return false; }
  const d = await parseApiJson(res, '/api/medical-directory/:key');
  if (!res.ok || !d.ok) {
    toast('Save failed: ' + (d.error || ''), 'err');
    return false;
  }
  VALUES = d.values || [];
  return true;
}

async function addValue() {
  const input = document.getElementById('md-input');
  const val = String(input.value || '').trim();
  if (!val) return;
  if (VALUES.some(v => String(v).toLowerCase() === val.toLowerCase())) {
    toast('Already exists', 'err');
    return;
  }
  VALUES.push(val);
  const ok = await saveValues();
  if (!ok) return;
  input.value = '';
  renderValues();
  toast('Saved', 'ok');
}

async function removeValue(i) {
  const v = VALUES[i];
  if (!v) return;
  if (!await appConfirm(`Delete \"${v}\"?`, { title: 'Delete Value', okText: 'Delete Forever' })) return;
  VALUES.splice(i, 1);
  const ok = await saveValues();
  if (!ok) return;
  renderValues();
  toast('Deleted', 'ok');
}

boot();
