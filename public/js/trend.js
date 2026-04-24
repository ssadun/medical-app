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
    buildTestSelect();
    restoreUrlState();
    await loadPatientName();
  } catch(e) {
    toast('Could not connect to server: ' + e.message, 'err');
  }
}

function buildTestSelect() {
  const sel = document.getElementById('ttest');
  [...new Set(ALL.map(r => r.tahlil))].sort().forEach(t => {
    const o = document.createElement('option');
    o.value = t; o.textContent = t;
    sel.appendChild(o);
  });
}

function restoreUrlState() {
  const p = new URLSearchParams(location.search);
  const ttest = p.get('ttest');
  if (ttest) {
    document.getElementById('ttest').value = ttest;
    renderTrend();
  }
}

function onTestChange() {
  const ttest = document.getElementById('ttest').value;
  const params = new URLSearchParams();
  if (ttest) params.set('ttest', ttest);
  history.replaceState(null, '', ttest ? '?' + params.toString() : location.pathname);
  renderTrend();
}

function pD(s) {
  const p = s.split('.');
  return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : new Date(0);
}

function renderTrend() {
  const name = document.getElementById('ttest').value;
  if (!name) { document.getElementById('trendTable').innerHTML = ''; return; }
  const pts = ALL
    .filter(r => r.tahlil === name && r.sonuc && !isNaN(parseFloat(r.sonuc)))
    .map(r => ({ x: pD(r.tarih), y: parseFloat(r.sonuc), flag: r.flag, label: r.tarih, rL: parseFloat(r.refAlt) || null, rH: parseFloat(r.refUst) || null }))
    .sort((a, b) => a.x - b.x);
  const noteEl = document.getElementById('tnote');
  if (!pts.length) { noteEl.textContent = 'No numeric data found.'; document.getElementById('trendTable').innerHTML = ''; return; }
  noteEl.textContent = `${pts.length} measurements · ${pts.filter(p => p.flag).length} out of range`;
  const cv = document.getElementById('cv');
  const W = cv.parentElement.clientWidth - 32;
  cv.width = W; cv.height = 280;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, 280);
  const P = { l: 52, r: 16, t: 20, b: 56 };
  const cW = W - P.l - P.r, cH = 280 - P.t - P.b;
  const vals = pts.map(p => p.y);
  const rH = pts.find(p => p.rH)?.rH, rL = pts.find(p => p.rL)?.rL;
  const allY = [...vals]; if (rH) allY.push(rH); if (rL) allY.push(rL);
  const minY = Math.min(...allY) * 0.9, maxY = Math.max(...allY) * 1.1;
  const xS = i => P.l + (i / (pts.length - 1 || 1)) * cW;
  const yS = v => P.t + cH - ((v - minY) / (maxY - minY)) * cH;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) { const y = P.t + (i / 4) * cH; ctx.beginPath(); ctx.moveTo(P.l, y); ctx.lineTo(P.l + cW, y); ctx.stroke(); }
  ctx.fillStyle = '#e2e8ff'; ctx.font = "11px 'JetBrains Mono', monospace"; ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const v = maxY - ((maxY - minY) * i / 4); ctx.fillText(v.toFixed(1), P.l - 6, P.t + (i / 4) * cH + 4); }
  if (rH) { ctx.strokeStyle = '#e05555'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(P.l, yS(rH)); ctx.lineTo(P.l + cW, yS(rH)); ctx.stroke(); ctx.setLineDash([]); }
  if (rL) { ctx.strokeStyle = '#2d5d4e'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(P.l, yS(rL)); ctx.lineTo(P.l + cW, yS(rL)); ctx.stroke(); ctx.setLineDash([]); }
  ctx.beginPath(); ctx.moveTo(xS(0), yS(pts[0].y));
  pts.forEach((p, i) => { if (i > 0) ctx.lineTo(xS(i), yS(p.y)); });
  ctx.lineTo(xS(pts.length - 1), P.t + cH); ctx.lineTo(P.l, P.t + cH); ctx.closePath();
  ctx.fillStyle = 'rgba(91,163,224,0.08)'; ctx.fill();
  ctx.strokeStyle = '#5ba3e0'; ctx.lineWidth = 2; ctx.beginPath();
  pts.forEach((p, i) => { i === 0 ? ctx.moveTo(xS(i), yS(p.y)) : ctx.lineTo(xS(i), yS(p.y)); }); ctx.stroke();
  pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(xS(i), yS(p.y), 5, 0, Math.PI * 2); ctx.fillStyle = p.flag ? '#e05555' : '#5ba3e0'; ctx.fill(); });
  ctx.fillStyle = '#e2e8ff'; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(pts.length / 10));
  pts.forEach((p, i) => { if (i % step === 0 || i === pts.length - 1) ctx.fillText(p.label, xS(i), P.t + cH + 18); });
  document.getElementById('tleg').innerHTML = `
    <span><span class="ls" style="background:#5ba3e0"></span>Normal</span>
    <span><span class="ls" style="background:#e05555"></span>Out of range</span>
    ${rH ? '<span><span class="ls" style="background:#e05555"></span>Ref high</span>' : ''}
    ${rL ? '<span><span class="ls" style="background:#2d5d4e"></span>Ref low</span>' : ''}`;
  document.getElementById('trendTable').innerHTML = `
    <div class="tbl-wrap" style="margin-top:1.5rem">
      <table class="fixed-cols">
        <thead><tr>
          <th style="width:100px">Date</th>
          <th style="width:100px">Result</th>
          <th style="width:80px">Unit</th>
          <th style="width:90px">Ref Low</th>
          <th style="width:90px">Ref High</th>
          <th style="width:100px">Status</th>
        </tr></thead>
        <tbody>
          ${[...pts].reverse().map(p => `
            <tr class="${p.flag ? 'abn' : ''}">
              <td>${p.label}</td>
              <td class="${p.flag ? 'bad' : 'ok'}">${p.flag ? '<span class="dot"></span>' : ''}${p.y}</td>
              <td>${ALL.find(r => r.tahlil === name && r.tarih === p.label)?.birim || ''}</td>
              <td>${p.rL ?? '—'}</td>
              <td>${p.rH ?? '—'}</td>
              <td>${p.flag ? '<span class="bmi-badge obese">Out of Range</span>' : '<span class="bmi-badge normal">Normal</span>'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

window.addEventListener('resize', () => { if (document.getElementById('ttest').value) renderTrend(); });
boot();
