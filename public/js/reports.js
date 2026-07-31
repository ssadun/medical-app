const PS = 30;
let pg = 0;
let REPORTS = [];
let DISEASE_KEYS = new Set();
let activeFilter = { q: '', reportType: '', yr: '' };
let sortState = { key: 'date', dir: 'desc' };

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await Promise.all([loadReports(), loadDiseasesForLinks(), loadPatientName()]);
}

function buildSelects() {
  const ds = [...new Set(REPORTS.map(r => String(r.reportType || '').trim()))].filter(Boolean).sort();
  const ys = [...new Set(REPORTS.map(r => String(r.date || '').split('.')[2] || ''))].filter(Boolean).sort();
  const dSel = document.getElementById('reportType');
  const ySel = document.getElementById('yr');
  dSel.innerHTML = '<option value="">All report types</option>';
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
  if (p.get('reportType')) document.getElementById('reportType').value = p.get('reportType');
  if (p.get('yr')) document.getElementById('yr').value = p.get('yr');
  if (p.get('p')) pg = parseInt(p.get('p'), 10) || 0;
  activeFilter = {
    q: (p.get('q') || '').toLowerCase(),
    reportType: p.get('reportType') || '',
    yr: p.get('yr') || ''
  };
}

function syncUrl() {
  const params = new URLSearchParams();
  if (activeFilter.q) params.set('q', activeFilter.q);
  if (activeFilter.reportType) params.set('reportType', activeFilter.reportType);
  if (activeFilter.yr) params.set('yr', activeFilter.yr);
  if (pg > 0) params.set('p', String(pg));
  const qs = params.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

function applyFilters() {
  activeFilter = {
    q: document.getElementById('q').value.trim().toLowerCase(),
    reportType: document.getElementById('reportType').value,
    yr: document.getElementById('yr').value
  };
  pg = 0;
  renderReports();
  syncUrl();
}

function parseDateKey(s) {
  const p = String(s || '').split('.');
  if (p.length !== 3) return 0;
  return new Date(+p[2], +p[1] - 1, +p[0]).getTime() || 0;
}

function filt() {
  const { q, reportType, yr } = activeFilter;
  return REPORTS.filter(r => {
    if (reportType && String(r.reportType || '') !== reportType) return false;
    if (yr && String(r.date || '').split('.')[2] !== yr) return false;
    if (q) {
      const hay = `${r.reportNumber || ''} ${r.reportType || ''} ${r.starting || ''} ${r.ending || ''} ${r.doctor || ''} ${r.diagnosis || ''}`.toLowerCase();
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
  ['date', 'reportNumber', 'reportType', 'starting', 'ending', 'doctor', 'diagnosis'].forEach(k => {
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
  renderReports();
}

function renderReports() {
  const rows = filt().sort(compareBySort);
  const start = pg * PS;
  const slice = rows.slice(start, start + PS);
  document.getElementById('reportsBody').innerHTML = slice.map(r => `
    <tr>
      <td>${r.date}</td>
      <td title="${r.reportNumber}">${r.reportNumber}</td>
      <td title="${r.reportType}">${r.reportType}</td>
      <td title="${r.starting}">${r.starting}</td>
      <td title="${r.ending}">${r.ending}</td>
      <td title="${r.doctor}">${r.doctor}</td>
      <td title="${r.diagnosis}">${renderDiagnosis(r)}</td>
      <td style="white-space:nowrap;overflow:visible;max-width:none">
        <button class="sm" onclick="window.location.href='edit-report.html?id=${r.id}'">Edit</button>
        <button class="sm danger" onclick="deleteReport(${r.id})">Delete</button>
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

function normalizeDiseasePart(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function diagnosisLinkKey(date, doctor, diagnosis) {
  return [String(date || '').trim(), normalizeDiseasePart(doctor), normalizeDiseasePart(diagnosis)].join('|');
}

function renderDiagnosis(r) {
  const text = String(r.diagnosis || '');
  if (!text) return '';
  const hasMatch = DISEASE_KEYS.has(diagnosisLinkKey(r.date, r.doctor, r.diagnosis));
  if (!hasMatch) return text;
  const yr = String(r.date || '').split('.')[2] || '';
  const href = `list-diseases.html?q=${encodeURIComponent(text)}${yr ? `&yr=${encodeURIComponent(yr)}` : ''}`;
  return `<a href="${href}" title="Matching disease record found for same date and doctor">${text}</a>`;
}

function chPg(d) {
  pg += d;
  renderReports();
  syncUrl();
}

async function loadReports() {
  const res = await fetch(apiUrl('reports'));
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/reports');
  REPORTS = d.reports || [];
  buildSelects();
  restoreUrlState();
  renderReports();
}

async function loadDiseasesForLinks() {
  const res = await fetch(apiUrl('diseases'));
  if (!res.ok) return;
  const d = await parseApiJson(res, '/api/diseases');
  DISEASE_KEYS = new Set((d.diseases || []).map(x => diagnosisLinkKey(x.date, x.doctor, x.diagnosis)));
}

async function deleteReport(id) {
  if (!await appConfirm('Delete this report record?', { title: 'Delete Report', okText: 'Delete Forever' })) return;
  const res = await fetch(apiUrl('reports/' + id), { method: 'DELETE' });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/reports/:id');
  if (!res.ok || !d.ok) { toast('Delete failed', 'err'); return; }
  REPORTS = REPORTS.filter(x => x.id !== id);
  buildSelects();
  renderReports();
  toast('Report record deleted', 'ok');
}

boot();
