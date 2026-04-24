function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await loadPatientName();
  const dz = document.getElementById('dropZone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); handlePdfFile(e.dataTransfer.files[0]); });
}

async function handlePdfFile(file) {
  if (!file || !file.name.endsWith('.pdf')) { toast('Please select a PDF file', 'err'); return; }
  document.getElementById('importStatus').textContent = 'Parsing PDF...';
  document.getElementById('importPreview').style.display = 'none';
  const fd = new FormData(); fd.append('pdf', file);
  const res = await fetch(apiUrl('import-pdf'), { method: 'POST', body: fd });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await res.json();
  if (!d.ok) { toast('Could not read PDF: ' + (d.error || ''), 'err'); document.getElementById('importStatus').textContent = ''; return; }
  document.getElementById('importStatus').textContent = `${d.pageCount} pages read · ${d.results.length} rows detected`;
  renderImportPreview(d.results, d.detectedDate, d.detectedFacility);
}

function renderImportPreview(rows, date, facility) {
  if (!rows.length) { document.getElementById('importPreview').style.display = 'none'; toast('No parsable rows found', 'err'); return; }
  document.getElementById('importCount').textContent = `${rows.length} rows - select the ones you want to save`;
  document.getElementById('importPreview').style.display = 'block';
  window._importRows = rows;
  document.getElementById('importRows').innerHTML = rows.map((r, i) => `
    <div style="display:grid;grid-template-columns:1fr 80px 80px 80px 80px 80px 80px 40px;gap:4px;padding:5px 10px;border-bottom:0.5px solid var(--border);align-items:center;font-size:12px" id="ir-${i}">
      <span title="${r.tahlil}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.tahlil}</span>
      <input type="text" value="${r.sonuc}" onchange="window._importRows[${i}].sonuc=this.value" style="font-size:12px;padding:3px 6px">
      <input type="text" value="${r.birim}" onchange="window._importRows[${i}].birim=this.value" style="font-size:12px;padding:3px 6px">
      <input type="text" value="${r.refAlt}" onchange="window._importRows[${i}].refAlt=this.value" style="font-size:12px;padding:3px 6px">
      <input type="text" value="${r.refUst}" onchange="window._importRows[${i}].refUst=this.value" style="font-size:12px;padding:3px 6px">
      <input type="text" value="${r.tarih || date}" onchange="window._importRows[${i}].tarih=this.value" style="font-size:12px;padding:3px 6px">
      <input type="text" value="${r.tesis || facility}" onchange="window._importRows[${i}].tesis=this.value" style="font-size:12px;padding:3px 6px">
      <input type="checkbox" checked id="ic-${i}">
    </div>`).join('');
}

function selectAllImport(v) {
  document.querySelectorAll('[id^="ic-"]').forEach(cb => cb.checked = v);
}

async function saveImport() {
  const selected = (window._importRows || []).filter((_, i) => document.getElementById('ic-' + i)?.checked);
  if (!selected.length) { toast('No rows selected', 'err'); return; }
  const res = await fetch(apiUrl('kayitlar'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kayitlar: selected }) });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await res.json();
  if (d.ok) {
    toast(`${d.added} records added ✓`, 'ok');
    setTimeout(() => window.location.href = 'test.html', 800);
  } else toast('Error: ' + d.error, 'err');
}

boot();
