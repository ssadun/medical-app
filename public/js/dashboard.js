let ALL = [];

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  try {
    const res = await fetch(apiUrl('data'));
    if (res.status === 401) { showAuthModal(); return; }
    const d = await parseApiJson(res, '/api/data');
    ALL = d.kayitlar || [];
    buildMeta(d.meta);
    renderDashboard();
    await loadPatientName();
  } catch(e) {
    toast('Could not connect to server: ' + e.message, 'err');
  }
}

function buildMeta(m) {
  document.getElementById('metrics').innerHTML = `
    <div class="metric"><div class="lbl">Total records</div><div class="val">${m.toplamKayit}</div></div>
    <div class="metric"><div class="lbl">Out of range</div><div class="val red">${m.referansDisi}</div></div>
    <div class="metric"><div class="lbl">Facilities</div><div class="val">${[...new Set(ALL.map(r=>r.tesis))].filter(Boolean).length}</div></div>
    <div class="metric"><div class="lbl">Unique tests</div><div class="val">${[...new Set(ALL.map(r=>r.tahlil))].length}</div></div>
    <div class="metric"><div class="lbl">Last updated</div><div class="val" style="font-size:14px">${m.sonGuncelleme}</div></div>`;
}

function renderDashboard() {
  const abn = ALL.filter(r=>r.flag).slice(-20).reverse();
  if (!abn.length) { document.getElementById('recentAbn').textContent = 'No out-of-range records found.'; return; }
  document.getElementById('recentAbn').innerHTML = abn.map(r=>`
    <div style="display:flex;gap:12px;padding:6px 0;border-bottom:0.5px solid var(--border);flex-wrap:wrap">
      <span style="color:var(--text3);min-width:85px">${r.tarih}</span>
      <span style="color:var(--text2);min-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.tesis}</span>
      <span style="min-width:160px">${r.tahlil}</span>
      <span class="bad"><span class="dot"></span>${r.sonuc} ${r.birim}</span>
      ${r.refUst?`<span style="color:var(--text3);font-size:12px">ref: ${r.refAlt||'?'}–${r.refUst}</span>`:''}
    </div>`).join('');
}

boot();
