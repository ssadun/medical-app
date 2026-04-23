let PATIENT = {};

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await loadPatient();
}

function calcAge(dob) {
  if (!dob) return '';
  const p = dob.split('.');
  if (p.length !== 3) return '';
  const birth = new Date(+p[2], +p[1] - 1, +p[0]);
  if (isNaN(birth)) return '';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? String(age) : '';
}

function bmiInfo(bmi) {
  if (isNaN(bmi)) return null;
  if (bmi < 18.5) return { cls: 'under',  label: 'Underweight' };
  if (bmi < 25)   return { cls: 'normal', label: 'Normal Weight' };
  if (bmi < 30)   return { cls: 'over',   label: 'Overweight' };
  return           { cls: 'obese',  label: 'Obese' };
}

function calcBmi() {
  const boy  = parseFloat(document.getElementById('p-boy').value);
  const kilo = parseFloat(document.getElementById('p-kilo').value);
  const bmiEl = document.getElementById('p-bmi');
  const lblEl = document.getElementById('p-bmiLabel');
  if (!boy || !kilo) { bmiEl.value = ''; lblEl.innerHTML = ''; return; }
  const bmi = kilo / Math.pow(boy / 100, 2);
  bmiEl.value = bmi.toFixed(1);
  const info = bmiInfo(bmi);
  lblEl.innerHTML = info ? `<span class="bmi-badge ${info.cls}">${info.label}</span>` : '';
}

function fillPatientForm(p) {
  document.getElementById('p-ad').value          = p.ad || '';
  document.getElementById('p-soyad').value       = p.soyad || '';
  document.getElementById('p-tcNo').value        = p.tcNo || '';
  document.getElementById('p-cinsiyet').value    = p.cinsiyet || '';
  document.getElementById('p-bloodType').value   = p.bloodType || '';
  document.getElementById('p-dogumTarihi').value = p.dogumTarihi || '';
  document.getElementById('p-boy').value         = p.boy || '';
  document.getElementById('p-kilo').value        = p.kilo || '';
  document.getElementById('p-yas').value         = calcAge(p.dogumTarihi);
  calcBmi();
}

document.addEventListener('input', e => {
  if (e.target.id === 'p-dogumTarihi') {
    document.getElementById('p-yas').value = calcAge(e.target.value);
  }
});

function renderPatientSummary() {
  const p = PATIENT;
  const boy  = parseFloat(p.boy);
  const kilo = parseFloat(p.kilo);
  const bmi  = (boy && kilo) ? (kilo / Math.pow(boy / 100, 2)) : null;
  const bmiStr = bmi ? bmi.toFixed(1) : '—';
  const info = bmi ? bmiInfo(bmi) : null;
  const age = calcAge(p.dogumTarihi);
  document.getElementById('patientSummary').innerHTML = `
    ${p.bloodType ? `<div class="ps-item"><div class="lbl">Blood Type</div><div class="val">${p.bloodType}</div></div>` : ''}
    ${p.cinsiyet ? `<div class="ps-item"><div class="lbl">Gender</div><div class="val">${p.cinsiyet}</div></div>` : ''}
    ${age ? `<div class="ps-item"><div class="lbl">Age</div><div class="val">${age} yrs</div></div>` : ''}
    ${p.dogumTarihi ? `<div class="ps-item"><div class="lbl">Birth Date</div><div class="val" style="font-size:13px">${p.dogumTarihi}</div></div>` : ''}
    ${boy ? `<div class="ps-item"><div class="lbl">Height</div><div class="val">${boy} cm</div></div>` : ''}
    ${kilo ? `<div class="ps-item"><div class="lbl">Weight</div><div class="val">${kilo} kg</div></div>` : ''}
    <div class="ps-item bmi-box ${info ? info.cls : ''}"><div class="lbl">BMI</div><div class="val">${bmiStr}</div>${info ? `<div class="bmi-box-label">${info.label}</div>` : ''}</div>`;
}

async function loadPatient() {
  const res = await fetch(apiUrl('patient'));
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/patient');
  PATIENT = d.patient || {};
  fillPatientForm(PATIENT);
  renderPatientSummary();
  const name = [PATIENT.ad, PATIENT.soyad].filter(Boolean).join(' ');
  document.getElementById('navPatientName').textContent = name || '—';
}

async function savePatient() {
  const payload = {
    ad:          document.getElementById('p-ad').value.trim(),
    soyad:       document.getElementById('p-soyad').value.trim(),
    tcNo:        document.getElementById('p-tcNo').value.trim(),
    cinsiyet:    document.getElementById('p-cinsiyet').value,
    bloodType:   document.getElementById('p-bloodType').value,
    dogumTarihi: document.getElementById('p-dogumTarihi').value.trim(),
    boy:         document.getElementById('p-boy').value,
    kilo:        document.getElementById('p-kilo').value
  };
  const res = await fetch(apiUrl('patient'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/patient');
  if (!res.ok || !d.ok) { toast('Error: ' + (d.error || 'Could not save'), 'err'); return; }
  PATIENT = d.patient;
  const name = [PATIENT.ad, PATIENT.soyad].filter(Boolean).join(' ');
  document.getElementById('navPatientName').textContent = name || '—';
  renderPatientSummary();
  toast('Patient info saved ✓', 'ok');
}

boot();
