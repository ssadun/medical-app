function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadAppointmentOptions(), loadPatientName()]);
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

async function loadAppointmentOptions() {
  const [aRes, directory] = await Promise.all([
    fetch(apiUrl('appointments')),
    loadDirectory()
  ]);
  if (aRes.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(aRes, '/api/appointments');
  const list = d.appointments || [];

  const hospitals = uniqSorted([...(directory?.hospitals || []), ...list.map(a => a.hospital)]);
  const services  = uniqSorted([...(directory?.services || []), ...list.map(a => a.service)]);
  const doctors   = uniqSorted([...(directory?.doctors || []), ...list.map(a => a.doctor)]);

  setOptions('hospital-list', hospitals);
  setOptions('service-list', services);
  setOptions('doctor-list', doctors);
}

async function addAppointment() {
  const date     = document.getElementById('a-date').value.trim();
  const hospital = document.getElementById('a-hospital').value.trim();
  const service  = document.getElementById('a-service').value.trim();
  const doctor   = document.getElementById('a-doctor').value.trim();

  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
    toast('Date must be DD.MM.YYYY', 'err');
    return;
  }
  if (!hospital || !service || !doctor) {
    toast('Hospital, service and doctor are required', 'err');
    return;
  }

  const res = await fetch(apiUrl('appointments'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, hospital, service, doctor })
  });
  if (res.status === 401) { showAuthModal(); return; }
  if (res.status === 409) {
    toast('Duplicate: an appointment with the same date, hospital and doctor already exists', 'err');
    document.getElementById('dup-hint').style.display = 'block';
    return;
  }
  document.getElementById('dup-hint').style.display = 'none';
  const d = await parseApiJson(res, '/api/appointments');
  if (!res.ok || !d.ok) {
    toast('Error: ' + (d.error || 'Could not save appointment'), 'err');
    return;
  }

  clearAppointmentForm();
  toast('Appointment saved', 'ok');
  setTimeout(() => { window.location.href = 'list-appointments.html'; }, 700);
}

function clearAppointmentForm() {
  document.getElementById('a-date').value = '';
  document.getElementById('a-hospital').value = '';
  document.getElementById('a-service').value = '';
  document.getElementById('a-doctor').value = '';
  document.getElementById('dup-hint').style.display = 'none';
}

boot();
