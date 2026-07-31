let PARSED_ROWS = [];
let EXISTING_KEYS = new Set();

function normalizeReportPart(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function reportKey(date, reportNumber, doctor) {
  return [
    String(date || '').trim(),
    normalizeReportPart(reportNumber),
    normalizeReportPart(doctor)
  ].join('|');
}

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadPatientName(), loadExistingReports()]);
  const dz = document.getElementById('dropZone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('over');
    handleFile(e.dataTransfer.files[0]);
  });
}

async function loadExistingReports() {
  const res = await fetch(apiUrl('reports'));
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/reports');
  EXISTING_KEYS = new Set((d.reports || []).map(x => reportKey(x.date, x.reportNumber, x.doctor)));
}

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('csvText').value = e.target.result;
    parseCsv(e.target.result);
  };
  reader.readAsText(file);
}

function handlePaste() {
  parseCsv(document.getElementById('csvText').value);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows = [];
  const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
  const fileSeen = new Set();

  lines.forEach((line, i) => {
    const parts = line
      .split(/[;,\t]/)
      .map(p => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 7) return;

    const [date, reportNumber, reportType, starting, ending, doctor, diagnosis] = parts;
    if (i === 0 && !DATE_RE.test(date)) return;

    const valid = DATE_RE.test(date) && reportNumber && reportType && starting && ending && doctor && diagnosis;
    const key = reportKey(date, reportNumber, doctor);
    const duplicateExisting = EXISTING_KEYS.has(key);
    const duplicateFile = fileSeen.has(key);
    if (valid) fileSeen.add(key);

    rows.push({
      date,
      reportNumber,
      reportType,
      starting,
      ending,
      doctor,
      diagnosis,
      valid,
      duplicate: duplicateExisting || duplicateFile,
      duplicateReason: duplicateExisting ? 'Existing' : (duplicateFile ? 'CSV' : '')
    });
  });

  PARSED_ROWS = rows;
  renderPreview(rows);
}

function renderPreview(rows) {
  const statusEl = document.getElementById('parseStatus');
  const previewEl = document.getElementById('importPreview');

  if (!rows.length) {
    previewEl.style.display = 'none';
    statusEl.textContent = '';
    return;
  }

  const valid = rows.filter(r => r.valid && !r.duplicate).length;
  const invalid = rows.filter(r => !r.valid).length;
  const duplicates = rows.filter(r => r.duplicate).length;
  statusEl.textContent = `${rows.length} rows parsed · ${valid} importable · ${invalid} invalid · ${duplicates} duplicates`;

  document.getElementById('importCount').textContent = `${valid} rows ready to import`;
  document.getElementById('previewBody').innerHTML = rows.map((r, i) => `
    <tr class="${r.valid && !r.duplicate ? '' : 'abn'}">
      <td><input type="checkbox" id="rc-${i}" ${r.valid && !r.duplicate ? 'checked' : 'disabled'}></td>
      <td>${r.date || '<em style="color:var(--text3)">missing</em>'}</td>
      <td title="${r.reportNumber}">${r.reportNumber || '<em style="color:var(--text3)">missing</em>'}</td>
      <td title="${r.reportType}">${r.reportType || '<em style="color:var(--text3)">missing</em>'}</td>
      <td title="${r.starting}">${r.starting || '<em style="color:var(--text3)">missing</em>'}</td>
      <td title="${r.ending}">${r.ending || '<em style="color:var(--text3)">missing</em>'}</td>
      <td title="${r.doctor}">${r.doctor || '<em style="color:var(--text3)">missing</em>'}</td>
      <td title="${r.diagnosis}">${r.diagnosis || '<em style="color:var(--text3)">missing</em>'}</td>
      <td>${!r.valid
        ? '<span class="bmi-badge obese">Invalid</span>'
        : (r.duplicate
          ? `<span class="bmi-badge over">Dup: ${r.duplicateReason || 'record'}</span>`
          : '<span class="bmi-badge normal">OK</span>')}</td>
    </tr>`).join('');

  previewEl.style.display = 'block';
}

function selectAll(v) {
  PARSED_ROWS.forEach((r, i) => {
    const cb = document.getElementById('rc-' + i);
    if (cb && !cb.disabled) cb.checked = v;
  });
  const chkAll = document.getElementById('chkAll');
  if (chkAll) chkAll.checked = v;
}

async function saveSelected() {
  try {
    const selected = PARSED_ROWS.filter((r, i) => {
      const cb = document.getElementById('rc-' + i);
      return cb && cb.checked && r.valid && !r.duplicate;
    });

    if (!selected.length) {
      toast('No valid rows selected', 'err');
      return;
    }

    const res = await fetch(apiUrl('reports/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: selected })
    });
    if (res.status === 401) { showAuthModal(); return; }
    const d = await parseApiJson(res, '/api/reports/import');
    if (!res.ok || !d.ok) throw new Error(d.error || 'Import failed');

    const added = Number(d.added) || 0;
    const skipped = Array.isArray(d.errors) ? d.errors.length : 0;
    if (added === 0) {
      toast('No report records were saved', 'err');
      return;
    }
    if (skipped > 0) toast(`${added} saved · ${skipped} skipped`, 'ok');
    else toast(`${added} report record${added !== 1 ? 's' : ''} saved ✓`, 'ok');

    setTimeout(() => { window.location.href = 'list-reports.html'; }, 800);
  } catch (e) {
    toast('Import failed: ' + e.message, 'err');
  }
}

boot();
