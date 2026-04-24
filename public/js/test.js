const PS = 30;
let pg = 0, ALL = [];
let activeFilter = { q: '', fac: '', yr: '', flag: '' };
let sortState = { key: 'tarih', dir: 'desc' };

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  try {
    const res = await fetch(apiUrl('data'));
    if (res.status === 401) { showAuthModal(); return; }
    const d = await parseApiJson(res, '/api/data');
    ALL = d.kayitlar || [];
    buildSelects();
    restoreUrlState();
    renderTable();
    await loadPatientName();
  } catch(e) {
    toast('Could not connect to server: ' + e.message, 'err');
  }
}

function buildSelects() {
  const facs = [...new Set(ALL.map(r=>r.tesis))].filter(Boolean).sort();
  const yrs  = [...new Set(ALL.map(r=>r.tarih.split('.')[2]))].filter(Boolean).sort();
  const fSel = document.getElementById('fac');
  facs.forEach(f=>{const o=document.createElement('option');o.value=f;o.textContent=f;fSel.appendChild(o);});
  const ySel = document.getElementById('yr');
  yrs.forEach(y=>{const o=document.createElement('option');o.value=y;o.textContent=y;ySel.appendChild(o);});
}

function restoreUrlState() {
  const p = new URLSearchParams(location.search);
  if (p.get('q')) document.getElementById('q').value = p.get('q');
  if (p.get('fac')) document.getElementById('fac').value = p.get('fac');
  if (p.get('yr'))  document.getElementById('yr').value  = p.get('yr');
  if (p.get('flag')) document.getElementById('flag').value = p.get('flag');
  if (p.get('p')) pg = parseInt(p.get('p')) || 0;
  activeFilter = {
    q:    (p.get('q') || '').toLowerCase(),
    fac:  p.get('fac') || '',
    yr:   p.get('yr')  || '',
    flag: p.get('flag') || ''
  };
}

function syncUrl() {
  const params = new URLSearchParams();
  if (activeFilter.q)    params.set('q',    activeFilter.q);
  if (activeFilter.fac)  params.set('fac',  activeFilter.fac);
  if (activeFilter.yr)   params.set('yr',   activeFilter.yr);
  if (activeFilter.flag) params.set('flag', activeFilter.flag);
  if (pg > 0) params.set('p', String(pg));
  history.replaceState(null, '', '?' + params.toString());
}

function applyFilters() {
  activeFilter = {
    q:    document.getElementById('q').value.trim().toLowerCase(),
    fac:  document.getElementById('fac').value,
    yr:   document.getElementById('yr').value,
    flag: document.getElementById('flag').value
  };
  pg = 0;
  renderTable();
  syncUrl();
}

function filt() {
  const { q, fac, yr, flag } = activeFilter;
  return ALL.filter(r => {
    if (fac  && r.tesis !== fac) return false;
    if (yr   && r.tarih.split('.')[2] !== yr) return false;
    if (flag === '1' && !r.flag) return false;
    if (flag === '0' &&  r.flag) return false;
    if (q    && !(r.tahlil.toLowerCase().includes(q) || r.tesis.toLowerCase().includes(q) || r.sonuc.toLowerCase().includes(q))) return false;
    return true;
  });
}

function parseDateValue(s) {
  const p = String(s || '').split('.');
  if (p.length !== 3) return 0;
  return new Date(+p[2], +p[1] - 1, +p[0]).getTime() || 0;
}

function compareBySort(a, b) {
  const k = sortState.key;
  const dir = sortState.dir === 'asc' ? 1 : -1;
  if (k === 'tarih') return (parseDateValue(a.tarih) - parseDateValue(b.tarih)) * dir;
  if (k === 'sonuc' || k === 'refAlt' || k === 'refUst') {
    const av = parseFloat(String(a[k] || '').replace(',', '.'));
    const bv = parseFloat(String(b[k] || '').replace(',', '.'));
    if (!isNaN(av) && !isNaN(bv)) return (av - bv) * dir;
  }
  return String(a[k] || '').toLowerCase().localeCompare(String(b[k] || '').toLowerCase(), 'tr') * dir;
}

function updateSortIndicators() {
  ['tarih','tesis','tahlil','sonuc','birim','refAlt','refUst'].forEach(k => {
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
  renderTable();
}

function renderTable() {
  const rows = filt().sort(compareBySort), start = pg * PS, slice = rows.slice(start, start + PS);
  document.getElementById('tbody').innerHTML = slice.map(r => `
    <tr class="${r.flag ? 'abn' : ''}">
      <td>${r.tarih}</td>
      <td title="${r.tesis}">${r.tesis}</td>
      <td title="${r.tahlil}">${r.tahlil}</td>
      <td class="${r.flag ? 'bad' : 'ok'}">${r.flag ? '<span class="dot"></span>' : ''}${r.sonuc}</td>
      <td>${r.birim}</td><td>${r.refAlt}</td><td>${r.refUst}</td>
      <td style="white-space:nowrap;overflow:visible;max-width:none">
        <button class="sm" onclick="viewTrend(this.dataset.test)" data-test="${r.tahlil.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">View</button>
        <button class="sm danger" onclick="deleteRecord(${r.id})">Delete</button>
      </td>
    </tr>`).join('');
  const pages = Math.max(1, Math.ceil(rows.length / PS));
  document.getElementById('pager').innerHTML = `
    <button onclick="chPg(-1)" ${pg === 0 ? 'disabled' : ''}>← Previous</button>
    <span>Page ${pg + 1} / ${pages} · ${rows.length} records</span>
    <button onclick="chPg(1)" ${pg >= pages - 1 ? 'disabled' : ''}>Next →</button>`;
  updateSortIndicators();
}

function chPg(d) { pg += d; renderTable(); syncUrl(); }

function viewTrend(testName) {
  window.location.href = 'trend.html?ttest=' + encodeURIComponent(testName);
}

async function deleteRecord(id) {
  if (!await appConfirm('Move this test record to Recover? You can restore it later.', { title: 'Delete Test Record', okText: 'Move to Recover' })) return;
  const res = await fetch(apiUrl('kayit/' + id), { method: 'DELETE' });
  if (res.status === 401) { showAuthModal(); return; }
  if (res.ok) { ALL = ALL.filter(r => r.id !== id); renderTable(); toast('Record moved to Recover', 'ok'); }
  else toast('Delete failed', 'err');
}

boot();
