function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  try {
    const res = await fetch(apiUrl('data'));
    if (res.status === 401) { showAuthModal(); return; }
    const d = await parseApiJson(res, '/api/data');
    buildDataLists(d.kayitlar || []);
    await loadPatientName();
  } catch(e) {
    toast('Could not connect to server: ' + e.message, 'err');
  }
}

function buildDataLists(all) {
  const tl = document.getElementById('tahlil-list');
  const fl = document.getElementById('tesis-list');
  [...new Set(all.map(r => r.tahlil))].sort().forEach(t => { const o = document.createElement('option'); o.value = t; tl.appendChild(o); });
  [...new Set(all.map(r => r.tesis))].filter(Boolean).sort().forEach(f => { const o = document.createElement('option'); o.value = f; fl.appendChild(o); });
}

async function submitRecord() {
  const tarih  = document.getElementById('f-tarih').value.trim();
  const tesis  = document.getElementById('f-tesis').value.trim();
  const tahlil = document.getElementById('f-tahlil').value.trim();
  const sonuc  = document.getElementById('f-sonuc').value.trim();
  if (!tarih || !tahlil || !sonuc) { toast('Date, test, and result are required', 'err'); return; }
  const body = {
    tarih, tesis, tahlil, sonuc,
    birim:  document.getElementById('f-birim').value.trim(),
    refAlt: document.getElementById('f-refalt').value.trim(),
    refUst: document.getElementById('f-refust').value.trim()
  };
  const res = await fetch(apiUrl('kayit'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await res.json();
  if (d.ok) { clearForm(); toast('Record added ✓', 'ok'); setTimeout(() => window.location.href = 'test.html', 800); }
  else toast('Error: ' + d.error, 'err');
}

function clearForm() {
  ['f-tarih','f-tesis','f-tahlil','f-sonuc','f-birim','f-refalt','f-refust'].forEach(id => document.getElementById(id).value = '');
}

boot();
