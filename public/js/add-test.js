function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  try {
    const [res, directory] = await Promise.all([
      fetch(apiUrl('data')),
      loadDirectory()
    ]);
    if (res.status === 401) { showAuthModal(); return; }
    const d = await parseApiJson(res, '/api/data');
    buildDataLists(d.kayitlar || [], directory);
    await loadPatientName();
  } catch(e) {
    toast('Could not connect to server: ' + e.message, 'err');
  }
}

function uniqSorted(values) {
  return [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
}

async function loadDirectory() {
  const res = await fetch(apiUrl('medical-directory'));
  if (res.status === 401) { showAuthModal(); return null; }
  const d = await parseApiJson(res, '/api/medical-directory');
  return d.directory || null;
}

function buildDataLists(all, directory) {
  const tl = document.getElementById('tahlil-list');
  const hl = document.getElementById('hospital-list');
  const tests = uniqSorted([...(directory?.testTypes || []), ...all.map(r => r.tahlil)]);
  const hospitals = uniqSorted([...(directory?.hospitals || []), ...all.map(r => r.hospital || r.tesis || '')]);
  tests.forEach(t => { const o = document.createElement('option'); o.value = t; tl.appendChild(o); });
  hospitals.forEach(h => { const o = document.createElement('option'); o.value = h; hl.appendChild(o); });
}

async function submitRecord() {
  const tarih  = document.getElementById('f-tarih').value.trim();
  const hospital = document.getElementById('f-hospital').value.trim();
  const tahlil = document.getElementById('f-tahlil').value.trim();
  const sonuc  = document.getElementById('f-sonuc').value.trim();
  if (!tarih || !tahlil || !sonuc) { toast('Date, test, and result are required', 'err'); return; }
  const body = {
    tarih, hospital, tahlil, sonuc,
    birim:  document.getElementById('f-birim').value.trim(),
    refAlt: document.getElementById('f-refalt').value.trim(),
    refUst: document.getElementById('f-refust').value.trim()
  };
  const res = await fetch(apiUrl('kayit'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await res.json();
  if (d.ok) { clearForm(); toast('Record added ✓', 'ok'); setTimeout(() => window.location.href = 'list-test.html', 800); }
  else toast('Error: ' + d.error, 'err');
}

function clearForm() {
  ['f-tarih','f-hospital','f-tahlil','f-sonuc','f-birim','f-refalt','f-refust'].forEach(id => document.getElementById(id).value = '');
}

boot();
