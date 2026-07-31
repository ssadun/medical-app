function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadDiseaseOptions(), loadPatientName()]);
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

async function loadDiseaseOptions() {
  const [res, directory] = await Promise.all([
    fetch(apiUrl('diseases')),
    loadDirectory()
  ]);
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/diseases');
  const list = d.diseases || [];

  const services = uniqSorted([...(directory?.services || []), ...list.map(x => x.service || x.department || '')]);
  const doctors = uniqSorted([...(directory?.doctors || []), ...list.map(x => x.doctor || '')]);
  const diagnosis = uniqSorted([...(directory?.diagnosis || []), ...list.map(x => x.diagnosis || '')]);

  setOptions('service-list', services);
  setOptions('doctor-list', doctors);
  setOptions('diagnosis-list', diagnosis);
}

async function addDisease() {
  const date = document.getElementById('d-date').value.trim();
  const diagnosis = document.getElementById('d-diagnosis').value.trim();
  const service = document.getElementById('d-service').value.trim();
  const doctor = document.getElementById('d-doctor').value.trim();

  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
    toast('Date must be DD.MM.YYYY', 'err');
    return;
  }
  if (!diagnosis || !service || !doctor) {
    toast('Diagnosis, service and doctor are required', 'err');
    return;
  }

  const res = await fetch(apiUrl('diseases'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, diagnosis, service, doctor })
  });
  if (res.status === 401) { showAuthModal(); return; }
  if (res.status === 409) {
    toast('Duplicate: same date, diagnosis, service and doctor already exists', 'err');
    return;
  }
  const d = await parseApiJson(res, '/api/diseases');
  if (!res.ok || !d.ok) {
    toast('Error: ' + (d.error || 'Could not save disease record'), 'err');
    return;
  }

  clearDiseaseForm();
  toast('Disease record saved', 'ok');
  setTimeout(() => { window.location.href = 'list-diseases.html'; }, 700);
}

function clearDiseaseForm() {
  document.getElementById('d-date').value = '';
  document.getElementById('d-diagnosis').value = '';
  document.getElementById('d-service').value = '';
  document.getElementById('d-doctor').value = '';
}

boot();
