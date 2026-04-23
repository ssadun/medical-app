function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await loadPatientName();
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
  const d = await parseApiJson(res, '/api/appointments');
  if (!res.ok || !d.ok) {
    toast('Error: ' + (d.error || 'Could not save appointment'), 'err');
    return;
  }

  clearAppointmentForm();
  toast('Appointment saved', 'ok');
  setTimeout(() => { window.location.href = 'appointments.html'; }, 700);
}

function clearAppointmentForm() {
  document.getElementById('a-date').value = '';
  document.getElementById('a-hospital').value = '';
  document.getElementById('a-service').value = '';
  document.getElementById('a-doctor').value = '';
}

boot();
