const PS = 30;
let pg = 0;
let APPOINTMENTS = [];
let activeFilter = { q: '', hospital: '', yr: '' };
let sortState = { key: 'date', dir: 'desc' };

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadAppointments(), loadPatientName()]);
}

function buildSelects() {
  const hs = [...new Set(APPOINTMENTS.map(a => String(a.hospital || '').trim()))].filter(Boolean).sort();
  const ys = [...new Set(APPOINTMENTS.map(a => String(a.date || '').split('.')[2] || ''))].filter(Boolean).sort();
  const hSel = document.getElementById('hospital');
  const ySel = document.getElementById('yr');
  hSel.innerHTML = '<option value="">All hospitals</option>';
  ySel.innerHTML = '<option value="">All years</option>';
  hs.forEach(h => {
    const o = document.createElement('option');
    o.value = h;
    o.textContent = h;
    hSel.appendChild(o);
  });
  ys.forEach(y => {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = y;
    ySel.appendChild(o);
  });
}

function restoreUrlState() {
  const p = new URLSearchParams(location.search);
  if (p.get('q')) document.getElementById('q').value = p.get('q');
  if (p.get('hospital')) document.getElementById('hospital').value = p.get('hospital');
  if (p.get('yr')) document.getElementById('yr').value = p.get('yr');
  if (p.get('p')) pg = parseInt(p.get('p'), 10) || 0;
  activeFilter = {
    q: (p.get('q') || '').toLowerCase(),
    hospital: p.get('hospital') || '',
    yr: p.get('yr') || ''
  };
}

function syncUrl() {
  const params = new URLSearchParams();
  if (activeFilter.q) params.set('q', activeFilter.q);
  if (activeFilter.hospital) params.set('hospital', activeFilter.hospital);
  if (activeFilter.yr) params.set('yr', activeFilter.yr);
  if (pg > 0) params.set('p', String(pg));
  const qs = params.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

function applyFilters() {
  activeFilter = {
    q: document.getElementById('q').value.trim().toLowerCase(),
    hospital: document.getElementById('hospital').value,
    yr: document.getElementById('yr').value
  };
  pg = 0;
  renderAppointments();
  syncUrl();
}

function parseDateKey(s) {
  const p = String(s || '').split('.');
  if (p.length !== 3) return 0;
  return new Date(+p[2], +p[1] - 1, +p[0]).getTime() || 0;
}

function filt() {
  const { q, hospital, yr } = activeFilter;
  return APPOINTMENTS.filter(a => {
    if (hospital && String(a.hospital || '') !== hospital) return false;
    if (yr && String(a.date || '').split('.')[2] !== yr) return false;
    if (q) {
      const hay = `${a.hospital || ''} ${a.service || ''} ${a.doctor || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function compareBySort(a, b) {
  const k = sortState.key;
  const dir = sortState.dir === 'asc' ? 1 : -1;
  if (k === 'date') return (parseDateKey(a.date) - parseDateKey(b.date)) * dir;
  return String(a[k] || '').toLowerCase().localeCompare(String(b[k] || '').toLowerCase(), 'tr') * dir;
}

function updateSortIndicators() {
  ['date', 'hospital', 'service', 'doctor'].forEach(k => {
    const el = document.getElementById('sort-' + k);
    const th = document.getElementById('th-' + k);
    if (!el) return;
    el.textContent = sortState.key === k ? (sortState.dir === 'asc' ? '▲' : '▼') : '';
    if (th) th.classList.toggle('sorted-col', sortState.key === k);
  });
}

function setSort(key) {
  sortState = sortState.key === key
    ? { key, dir: sortState.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: 'asc' };
  pg = 0;
  renderAppointments();
}

function renderAppointments() {
  const rows = filt().sort(compareBySort);
  const start = pg * PS;
  const slice = rows.slice(start, start + PS);
  document.getElementById('appointmentsBody').innerHTML = slice.map(a => `
    <tr>
      <td>${a.date}</td>
      <td title="${a.hospital}">${a.hospital}</td>
      <td title="${a.service}">${a.service}</td>
      <td title="${a.doctor}">${a.doctor}</td>
      <td><button class="sm danger" onclick="deleteAppointment(${a.id})">Delete</button></td>
    </tr>
  `).join('');
  const pages = Math.max(1, Math.ceil(rows.length / PS));
  const pager = document.getElementById('pager');
  pager.innerHTML = `
    <button onclick="chPg(-1)" ${pg === 0 ? 'disabled' : ''}>← Previous</button>
    <span>Page ${pg + 1} / ${pages} · ${rows.length} appointments</span>
    <button onclick="chPg(1)" ${pg >= pages - 1 ? 'disabled' : ''}>Next →</button>`;
  updateSortIndicators();
}

function chPg(d) {
  pg += d;
  renderAppointments();
  syncUrl();
}

async function loadAppointments() {
  const res = await fetch(apiUrl('appointments'));
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/appointments');
  APPOINTMENTS = d.appointments || [];
  buildSelects();
  restoreUrlState();
  renderAppointments();
}

async function deleteAppointment(id) {
  if (!await appConfirm('Move this appointment to Recover? You can restore it later.', { title: 'Delete Appointment', okText: 'Move to Recover' })) return;
  const res = await fetch(apiUrl('appointments/' + id), { method: 'DELETE' });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/appointments/:id');
  if (!res.ok || !d.ok) { toast('Delete failed', 'err'); return; }
  APPOINTMENTS = APPOINTMENTS.filter(a => a.id !== id);
  buildSelects();
  renderAppointments();
  toast('Appointment deleted', 'ok');
}

boot();
