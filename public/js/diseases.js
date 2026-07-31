const PS = 30;
let pg = 0;
let DISEASES = [];
let activeFilter = { q: '', service: '', yr: '' };
let sortState = { key: 'date', dir: 'desc' };

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadDiseases(), loadPatientName()]);
}

function buildSelects() {
  const ds = [...new Set(DISEASES.map(d => String(d.service || d.department || '').trim()))].filter(Boolean).sort();
  const ys = [...new Set(DISEASES.map(d => String(d.date || '').split('.')[2] || ''))].filter(Boolean).sort();
  const dSel = document.getElementById('service');
  const ySel = document.getElementById('yr');
  dSel.innerHTML = '<option value="">All services</option>';
  ySel.innerHTML = '<option value="">All years</option>';
  ds.forEach(dep => {
    const o = document.createElement('option');
    o.value = dep;
    o.textContent = dep;
    dSel.appendChild(o);
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
  if (p.get('service')) document.getElementById('service').value = p.get('service');
  if (p.get('department') && !p.get('service')) document.getElementById('service').value = p.get('department');
  if (p.get('yr')) document.getElementById('yr').value = p.get('yr');
  if (p.get('p')) pg = parseInt(p.get('p'), 10) || 0;
  activeFilter = {
    q: (p.get('q') || '').toLowerCase(),
    service: p.get('service') || p.get('department') || '',
    yr: p.get('yr') || ''
  };
}

function syncUrl() {
  const params = new URLSearchParams();
  if (activeFilter.q) params.set('q', activeFilter.q);
  if (activeFilter.service) params.set('service', activeFilter.service);
  if (activeFilter.yr) params.set('yr', activeFilter.yr);
  if (pg > 0) params.set('p', String(pg));
  const qs = params.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

function applyFilters() {
  activeFilter = {
    q: document.getElementById('q').value.trim().toLowerCase(),
    service: document.getElementById('service').value,
    yr: document.getElementById('yr').value
  };
  pg = 0;
  renderDiseases();
  syncUrl();
}

function parseDateKey(s) {
  const p = String(s || '').split('.');
  if (p.length !== 3) return 0;
  return new Date(+p[2], +p[1] - 1, +p[0]).getTime() || 0;
}

function filt() {
  const { q, service, yr } = activeFilter;
  return DISEASES.filter(d => {
    if (service && String(d.service || d.department || '') !== service) return false;
    if (yr && String(d.date || '').split('.')[2] !== yr) return false;
    if (q) {
      const hay = `${d.diagnosis || ''} ${d.service || d.department || ''} ${d.doctor || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function compareBySort(a, b) {
  const k = sortState.key;
  const dir = sortState.dir === 'asc' ? 1 : -1;
  if (k === 'date') return (parseDateKey(a.date) - parseDateKey(b.date)) * dir;
  if (k === 'service') {
    return String(a.service || a.department || '').toLowerCase().localeCompare(String(b.service || b.department || '').toLowerCase(), 'tr') * dir;
  }
  return String(a[k] || '').toLowerCase().localeCompare(String(b[k] || '').toLowerCase(), 'tr') * dir;
}

function updateSortIndicators() {
  ['date', 'diagnosis', 'service', 'doctor'].forEach(k => {
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
  renderDiseases();
}

function renderDiseases() {
  const rows = filt().sort(compareBySort);
  const start = pg * PS;
  const slice = rows.slice(start, start + PS);
  document.getElementById('diseasesBody').innerHTML = slice.map(d => `
    <tr>
      <td>${d.date}</td>
      <td title="${d.diagnosis}">${d.diagnosis}</td>
      <td title="${d.service || d.department || ''}">${d.service || d.department || ''}</td>
      <td title="${d.doctor}">${d.doctor}</td>
      <td>
        <button class="sm" onclick="window.location.href='edit-disease.html?id=${d.id}'">Edit</button>
        <button class="sm danger" onclick="deleteDisease(${d.id})">Delete</button>
      </td>
    </tr>
  `).join('');
  const pages = Math.max(1, Math.ceil(rows.length / PS));
  const pager = document.getElementById('pager');
  pager.innerHTML = `
    <button onclick="chPg(-1)" ${pg === 0 ? 'disabled' : ''}>← Previous</button>
    <span>Page ${pg + 1} / ${pages} · ${rows.length} records</span>
    <button onclick="chPg(1)" ${pg >= pages - 1 ? 'disabled' : ''}>Next →</button>`;
  updateSortIndicators();
}

function chPg(d) {
  pg += d;
  renderDiseases();
  syncUrl();
}

async function loadDiseases() {
  const res = await fetch(apiUrl('diseases'));
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/diseases');
  DISEASES = d.diseases || [];
  buildSelects();
  restoreUrlState();
  renderDiseases();
}

async function deleteDisease(id) {
  if (!await appConfirm('Delete this disease record?', { title: 'Delete Disease', okText: 'Delete Forever' })) return;
  const res = await fetch(apiUrl('diseases/' + id), { method: 'DELETE' });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/diseases/:id');
  if (!res.ok || !d.ok) { toast('Delete failed', 'err'); return; }
  DISEASES = DISEASES.filter(x => x.id !== id);
  buildSelects();
  renderDiseases();
  toast('Disease record deleted', 'ok');
}

boot();
