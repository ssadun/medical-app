let APPOINTMENTS = [];

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadAppointments(), loadPatientName()]);
}

function parseDateKey(s) {
  const p = String(s || '').split('.');
  if (p.length !== 3) return 0;
  return new Date(+p[2], +p[1] - 1, +p[0]).getTime() || 0;
}

function renderAppointments() {
  const rows = [...APPOINTMENTS].sort((a, b) => parseDateKey(b.date) - parseDateKey(a.date));
  document.getElementById('appointmentsBody').innerHTML = rows.map(a => `
    <tr>
      <td>${a.date}</td>
      <td title="${a.hospital}">${a.hospital}</td>
      <td title="${a.service}">${a.service}</td>
      <td title="${a.doctor}">${a.doctor}</td>
      <td><button class="sm danger" onclick="deleteAppointment(${a.id})">Delete</button></td>
    </tr>
  `).join('');
}

async function loadAppointments() {
  const res = await fetch(apiUrl('appointments'));
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/appointments');
  APPOINTMENTS = d.appointments || [];
  renderAppointments();
}

async function deleteAppointment(id) {
  if (!confirm('Delete this appointment?')) return;
  const res = await fetch(apiUrl('appointments/' + id), { method: 'DELETE' });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/appointments/:id');
  if (!res.ok || !d.ok) { toast('Delete failed', 'err'); return; }
  APPOINTMENTS = APPOINTMENTS.filter(a => a.id !== id);
  renderAppointments();
  toast('Appointment deleted', 'ok');
}

boot();
