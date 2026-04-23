let PARSED_ROWS = [];

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await loadPatientName();
  const dz = document.getElementById('dropZone');
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop',      e => { e.preventDefault(); dz.classList.remove('over'); handleFile(e.dataTransfer.files[0]); });
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

  lines.forEach((line, i) => {
    // Split on comma, allowing quoted fields
    const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 4) return; // skip short lines

    const [date, hospital, service, doctor] = parts;

    // Skip header rows
    if (i === 0 && !DATE_RE.test(date)) return;

    const valid = DATE_RE.test(date) && hospital && service && doctor;
    rows.push({ date, hospital, service, doctor, valid });
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

  const valid = rows.filter(r => r.valid).length;
  const invalid = rows.length - valid;
  statusEl.textContent = `${rows.length} rows parsed · ${valid} valid · ${invalid > 0 ? invalid + ' invalid (shown in red)' : '0 invalid'}`;

  document.getElementById('importCount').textContent = `${valid} valid rows ready to import`;
  document.getElementById('previewBody').innerHTML = rows.map((r, i) => `
    <tr class="${r.valid ? '' : 'abn'}">
      <td><input type="checkbox" id="rc-${i}" ${r.valid ? 'checked' : 'disabled'}></td>
      <td>${r.date || '<em style="color:var(--text3)">missing</em>'}</td>
      <td title="${r.hospital}">${r.hospital || '<em style="color:var(--text3)">missing</em>'}</td>
      <td title="${r.service}">${r.service || '<em style="color:var(--text3)">missing</em>'}</td>
      <td title="${r.doctor}">${r.doctor || '<em style="color:var(--text3)">missing</em>'}</td>
      <td>${r.valid
        ? '<span class="bmi-badge normal">OK</span>'
        : '<span class="bmi-badge obese">Invalid</span>'}</td>
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
  const selected = PARSED_ROWS.filter((r, i) => {
    const cb = document.getElementById('rc-' + i);
    return cb && cb.checked && r.valid;
  });

  if (!selected.length) { toast('No valid rows selected', 'err'); return; }

  const res = await fetch(apiUrl('appointments/import'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: selected })
  });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await res.json();
  if (!d.ok) { toast('Error: ' + (d.error || 'Import failed'), 'err'); return; }

  if (d.errors && d.errors.length) {
    toast(`${d.added} saved · ${d.errors.length} skipped`, 'ok');
  } else {
    toast(`${d.added} appointment${d.added !== 1 ? 's' : ''} saved ✓`, 'ok');
  }
  setTimeout(() => { window.location.href = 'appointments.html'; }, 800);
}

boot();
