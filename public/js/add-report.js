function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadReportOptions(), loadPatientName()]);
}

function setOptions(listId, values) {
  const dl = document.getElementById(listId);
  if (!dl) return;
  dl.innerHTML = '';
  values.forEach(v => {
    const o = document.createElement('option');
    o.value = v;
    dl.appendChild(o);
  });
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

async function loadReportOptions() {
  const [res, directory] = await Promise.all([
    fetch(apiUrl('reports')),
    loadDirectory()
  ]);
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/reports');
  const list = d.reports || [];

  const reportTypes = uniqSorted([...(directory?.reportTypes || []), ...list.map(r => r.reportType || '')]);
  const doctors = uniqSorted([...(directory?.doctors || []), ...list.map(r => r.doctor || '')]);
  const diagnosis = uniqSorted([...(directory?.diagnosis || []), ...list.map(r => r.diagnosis || '')]);

  setOptions('report-type-list', reportTypes);
  setOptions('doctor-list', doctors);
  setOptions('diagnosis-list', diagnosis);
}

async function addReport() {
  const date = document.getElementById('r-date').value.trim();
  const reportNumber = document.getElementById('r-report-number').value.trim();
  const reportType = document.getElementById('r-report-type').value.trim();
  const starting = document.getElementById('r-starting').value.trim();
  const ending = document.getElementById('r-ending').value.trim();
  const doctor = document.getElementById('r-doctor').value.trim();
  const diagnosis = document.getElementById('r-diagnosis').value.trim();

  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
    toast('Date must be DD.MM.YYYY', 'err');
    return;
  }
  if (!reportNumber || !reportType || !starting || !ending || !doctor || !diagnosis) {
    toast('Report number, report type, starting, ending, doctor and diagnosis are required', 'err');
    return;
  }

  const res = await fetch(apiUrl('reports'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, reportNumber, reportType, starting, ending, doctor, diagnosis })
  });
  if (res.status === 401) { showAuthModal(); return; }
  if (res.status === 409) {
    toast('Duplicate: same date, report number and doctor already exists', 'err');
    return;
  }
  const d = await parseApiJson(res, '/api/reports');
  if (!res.ok || !d.ok) {
    toast('Error: ' + (d.error || 'Could not save report record'), 'err');
    return;
  }

  clearReportForm();
  toast('Report record saved', 'ok');
  setTimeout(() => { window.location.href = 'list-reports.html'; }, 700);
}

function clearReportForm() {
  document.getElementById('r-date').value = '';
  document.getElementById('r-report-number').value = '';
  document.getElementById('r-report-type').value = '';
  document.getElementById('r-starting').value = '';
  document.getElementById('r-ending').value = '';
  document.getElementById('r-doctor').value = '';
  document.getElementById('r-diagnosis').value = '';
}

boot();
