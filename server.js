const express = require('express');
const multer  = require('multer');
const pdfParse = require('pdf-parse');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3234;
const DATA_FILE         = path.join(__dirname, 'data', 'medical_results.json');
const SAMPLE_FILE       = path.join(__dirname, 'data', 'medical_results_sample.json');
const APPOINTMENTS_FILE        = path.join(__dirname, 'data', 'appointments.json');
const APPOINTMENTS_SAMPLE_FILE = path.join(__dirname, 'data', 'appointments_sample.json');
const DISEASES_FILE            = path.join(__dirname, 'data', 'diseases.json');
const DISEASES_SAMPLE_FILE     = path.join(__dirname, 'data', 'diseases_sample.json');
const REPORTS_FILE             = path.join(__dirname, 'data', 'reports.json');
const REPORTS_SAMPLE_FILE      = path.join(__dirname, 'data', 'reports_sample.json');
const MEDICAL_DIRECTORY_FILE   = path.join(__dirname, 'data', 'medical_directory.json');
const MEDICAL_DIRECTORY_SAMPLE_FILE = path.join(__dirname, 'data', 'medical_directory_sample.json');
const AUTH_COOKIE = 'medical_app_auth';
const AUTH_TTL_MS = 4 * 60 * 60 * 1000;
const AUTH_PBKDF2_ITERATIONS = 100000;
const AUTH_PBKDF2_KEYLEN = 64;
const AUTH_PBKDF2_DIGEST = 'sha512';
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD_SALT = process.env.AUTH_PASSWORD_SALT || 'd212bca4b3e4ddfea4f85207b2a1f7ebec04d1b590afd5061de715115b6de32b';
const AUTH_PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH || '6723385abcbea9231f7e64da26fa210397cfb192e83fc10020abfd7674a108e0b606ac670f13343cc45b6b8e511afc1da4cfbbdf5937d9b16f5f43322b58c827';
const sessions = new Map();

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function parseCookies(req) {
  const header = req.headers.cookie || '';
  if (!header) return {};
  return header.split(';').reduce((acc, pair) => {
    const i = pair.indexOf('=');
    if (i === -1) return acc;
    const k = decodeURIComponent(pair.slice(0, i).trim());
    const v = decodeURIComponent(pair.slice(i + 1).trim());
    acc[k] = v;
    return acc;
  }, {});
}

function assertAuthConfig() {
  if (!/^[a-fA-F0-9]{64}$/.test(AUTH_PASSWORD_SALT)) {
    throw new Error('AUTH_PASSWORD_SALT must be a 32-byte hex string (64 hex chars)');
  }
  if (!/^[a-fA-F0-9]{128}$/.test(AUTH_PASSWORD_HASH)) {
    throw new Error('AUTH_PASSWORD_HASH must be a 64-byte hex string (128 hex chars)');
  }
}

function verifyPassword(password) {
  const salt = Buffer.from(AUTH_PASSWORD_SALT, 'hex');
  const expected = Buffer.from(AUTH_PASSWORD_HASH, 'hex');
  const actual = crypto.pbkdf2Sync(password, salt, AUTH_PBKDF2_ITERATIONS, AUTH_PBKDF2_KEYLEN, AUTH_PBKDF2_DIGEST);
  return crypto.timingSafeEqual(actual, expected);
}

function setAuthCookie(res, token) {
  const maxAge = Math.floor(AUTH_TTL_MS / 1000);
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function getValidSession(req) {
  const token = parseCookies(req)[AUTH_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, session };
}

function authGuard(req, res, next) {
  const openPaths = new Set(['/auth/login']);
  if (openPaths.has(req.path)) return next();
  const auth = getValidSession(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  req.authToken = auth.token;
  req.authUser = auth.session.username;
  next();
}

// ── Helpers ─────────────────────────────────────────────────
function ensureDataShape(data) {
  if (!data.meta || typeof data.meta !== 'object') data.meta = {};
  if (!Array.isArray(data.kayitlar)) data.kayitlar = [];
  if (!Array.isArray(data.appointments)) data.appointments = [];
  if (!data.testCatalog || typeof data.testCatalog !== 'object') data.testCatalog = {};
  if (!data.testInsights || typeof data.testInsights !== 'object') data.testInsights = {};
  if (!data.patient || typeof data.patient !== 'object') data.patient = {};

  const hasCatalog = Object.keys(data.testCatalog).length > 0;
  if (!hasCatalog) {
    const tests = [...new Set(data.kayitlar.map(r => String(r.tahlil || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    tests.forEach((testName, idx) => {
      const testId = `test_${String(idx + 1).padStart(3, '0')}`;
      data.testCatalog[testId] = testName;
    });
  }

  const normalizedInsights = {};
  Object.entries(data.testInsights).forEach(([key, value]) => {
    if (data.testCatalog[key]) {
      normalizedInsights[key] = value;
      return;
    }
    const foundId = Object.keys(data.testCatalog).find(id => data.testCatalog[id] === key);
    if (foundId) normalizedInsights[foundId] = value;
  });
  data.testInsights = normalizedInsights;

  return data;
}

function toInternalSchema(data) {
  const source = (data && typeof data === 'object') ? data : {};
  const meta = (source.meta && typeof source.meta === 'object') ? source.meta : {};
  const rawRecords = Array.isArray(source.kayitlar)
    ? source.kayitlar
    : (Array.isArray(source.records) ? source.records : []);
  const patient = (source.patient && typeof source.patient === 'object') ? source.patient : {};
  const rawAppointments = Array.isArray(source.appointments) ? source.appointments : [];

  return {
    meta: {
      sonGuncelleme: meta.sonGuncelleme ?? meta.lastUpdated ?? '',
      toplamKayit: meta.toplamKayit ?? meta.totalRecords ?? rawRecords.length,
      referansDisi: meta.referansDisi ?? meta.outOfRange ?? 0,
      patient: meta.patient ?? ''
    },
    kayitlar: rawRecords.map(r => ({
      id: r.id,
      tarih: r.tarih ?? r.date ?? '',
      hospital: r.hospital ?? r.tesis ?? r.facility ?? '',
      tesis: r.hospital ?? r.tesis ?? r.facility ?? '',
      tahlil: r.tahlil ?? r.test ?? '',
      sonuc: r.sonuc ?? r.result ?? '',
      birim: r.birim ?? r.unit ?? '',
      refAlt: r.refAlt ?? r.refLow ?? '',
      refUst: r.refUst ?? r.refHigh ?? '',
      flag: Boolean(r.flag),
      active: r.active !== false,
      deletedAt: r.deletedAt || ''
    })),
    appointments: rawAppointments.map(a => ({
      id: a.id,
      date: a.date || '',
      hospital: a.hospital || '',
      service: a.service || '',
      doctor: a.doctor || ''
    })),
    testCatalog: (source.testCatalog && typeof source.testCatalog === 'object') ? source.testCatalog : {},
    testInsights: (source.testInsights && typeof source.testInsights === 'object') ? source.testInsights : {},
    patient: {
      ad: patient.ad ?? patient.firstName ?? '',
      soyad: patient.soyad ?? patient.lastName ?? '',
      tcNo: patient.tcNo ?? patient.idNumber ?? '',
      cinsiyet: patient.cinsiyet ?? patient.gender ?? '',
      bloodType: patient.bloodType ?? patient.kanGrubu ?? '',
      dogumTarihi: patient.dogumTarihi ?? patient.birthDate ?? '',
      boy: patient.boy ?? patient.height ?? '',
      kilo: patient.kilo ?? patient.weight ?? '',
      updatedAt: patient.updatedAt
    }
  };
}

function toFileSchema(data) {
  return {
    meta: {
      lastUpdated: data.meta.sonGuncelleme,
      totalRecords: data.meta.toplamKayit,
      outOfRange: data.meta.referansDisi,
      patient: data.meta.patient
    },
    records: data.kayitlar.map(r => ({
      id: r.id,
      date: r.tarih,
      hospital: r.hospital ?? r.tesis,
      facility: r.hospital ?? r.tesis,
      test: r.tahlil,
      result: r.sonuc,
      unit: r.birim,
      refLow: r.refAlt,
      refHigh: r.refUst,
      flag: Boolean(r.flag),
      active: r.active !== false,
      deletedAt: r.deletedAt || ''
    })),
    appointments: data.appointments.map(a => ({
      id: a.id,
      date: a.date,
      hospital: a.hospital,
      service: a.service,
      doctor: a.doctor
    })),
    testCatalog: data.testCatalog,
    testInsights: data.testInsights,
    patient: {
      firstName: data.patient.ad || '',
      lastName: data.patient.soyad || '',
      idNumber: data.patient.tcNo || '',
      gender: data.patient.cinsiyet || '',
      bloodType: data.patient.bloodType || '',
      birthDate: data.patient.dogumTarihi || '',
      height: data.patient.boy || '',
      weight: data.patient.kilo || '',
      updatedAt: data.patient.updatedAt
    }
  };
}

function loadAppointments() {
  const file = fs.existsSync(APPOINTMENTS_FILE)
    ? APPOINTMENTS_FILE
    : (fs.existsSync(APPOINTMENTS_SAMPLE_FILE) ? APPOINTMENTS_SAMPLE_FILE : null);
  if (!file) return [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveAppointments(list) {
  fs.writeFileSync(APPOINTMENTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function nextAppointmentId(list) {
  return list.length ? Math.max(...list.map(a => Number(a.id) || 0)) + 1 : 1;
}

function normalizeAppointmentPart(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function appointmentKey(date, hospital, doctor) {
  return [
    String(date || '').trim(),
    normalizeAppointmentPart(hospital),
    normalizeAppointmentPart(doctor)
  ].join('|');
}

function loadDiseases() {
  const file = fs.existsSync(DISEASES_FILE)
    ? DISEASES_FILE
    : (fs.existsSync(DISEASES_SAMPLE_FILE) ? DISEASES_SAMPLE_FILE : null);
  if (!file) return [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(d => {
      const service = String(d.service || d.department || '').trim();
      return {
        id: Number(d.id) || 0,
        date: String(d.date || '').trim(),
        diagnosis: String(d.diagnosis || '').trim(),
        service,
        department: service,
        doctor: String(d.doctor || '').trim()
      };
    });
  } catch { return []; }
}

function saveDiseases(list) {
  const normalized = (Array.isArray(list) ? list : []).map(d => ({
    id: Number(d.id) || 0,
    date: String(d.date || '').trim(),
    diagnosis: String(d.diagnosis || '').trim(),
    service: String(d.service || d.department || '').trim(),
    doctor: String(d.doctor || '').trim()
  }));
  fs.writeFileSync(DISEASES_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
}

function nextDiseaseId(list) {
  return list.length ? Math.max(...list.map(d => Number(d.id) || 0)) + 1 : 1;
}

function loadReports() {
  const file = fs.existsSync(REPORTS_FILE)
    ? REPORTS_FILE
    : (fs.existsSync(REPORTS_SAMPLE_FILE) ? REPORTS_SAMPLE_FILE : null);
  if (!file) return [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(r => ({
      id: Number(r.id) || 0,
      date: String(r.date || '').trim(),
      reportNumber: String(r.reportNumber || '').trim(),
      reportType: String(r.reportType || r.department || '').trim(),
      starting: String(r.starting || '').trim(),
      ending: String(r.ending || '').trim(),
      doctor: String(r.doctor || '').trim(),
      diagnosis: String(r.diagnosis || '').trim()
    }));
  } catch { return []; }
}

function saveReports(list) {
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function nextReportId(list) {
  return list.length ? Math.max(...list.map(r => Number(r.id) || 0)) + 1 : 1;
}

function normalizeDiseasePart(v) {
  return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function uniqSorted(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(v => String(v || '').trim())
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
}

function normalizeMedicalDirectory(obj) {
  const src = (obj && typeof obj === 'object') ? obj : {};
  return {
    hospitals: uniqSorted(src.hospitals),
    services: uniqSorted(src.services),
    doctors: uniqSorted(src.doctors),
    diagnosis: uniqSorted(src.diagnosis),
    reportTypes: uniqSorted(src.reportTypes),
    testTypes: uniqSorted(src.testTypes)
  };
}

function buildDefaultMedicalDirectory() {
  const data = loadData();
  const appointments = loadAppointments();
  const diseases = loadDiseases();
  const reports = loadReports();
  return normalizeMedicalDirectory({
    hospitals: [
      ...appointments.map(a => a.hospital),
      ...data.kayitlar.map(r => r.hospital || r.tesis || '')
    ],
    services: [
      ...appointments.map(a => a.service),
      ...diseases.map(d => d.service || d.department || '')
    ],
    doctors: [
      ...appointments.map(a => a.doctor),
      ...diseases.map(d => d.doctor),
      ...reports.map(r => r.doctor)
    ],
    diagnosis: [
      ...diseases.map(d => d.diagnosis),
      ...reports.map(r => r.diagnosis)
    ],
    reportTypes: reports.map(r => r.reportType),
    testTypes: [
      ...Object.values(data.testCatalog || {}),
      ...data.kayitlar.map(r => r.tahlil)
    ]
  });
}

function loadMedicalDirectory() {
  const file = fs.existsSync(MEDICAL_DIRECTORY_FILE)
    ? MEDICAL_DIRECTORY_FILE
    : (fs.existsSync(MEDICAL_DIRECTORY_SAMPLE_FILE) ? MEDICAL_DIRECTORY_SAMPLE_FILE : null);
  if (!file) return buildDefaultMedicalDirectory();
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return normalizeMedicalDirectory(JSON.parse(raw));
  } catch {
    return buildDefaultMedicalDirectory();
  }
}

function saveMedicalDirectory(dir) {
  fs.writeFileSync(MEDICAL_DIRECTORY_FILE, JSON.stringify(normalizeMedicalDirectory(dir), null, 2), 'utf-8');
}

function diseaseKey(date, diagnosis, service, doctor) {
  return [
    String(date || '').trim(),
    normalizeDiseasePart(diagnosis),
    normalizeDiseasePart(service),
    normalizeDiseasePart(doctor)
  ].join('|');
}

function reportKey(date, reportNumber, doctor) {
  return [
    String(date || '').trim(),
    normalizeDiseasePart(reportNumber),
    normalizeDiseasePart(doctor)
  ].join('|');
}

function loadData() {
  const file = fs.existsSync(DATA_FILE) ? DATA_FILE : SAMPLE_FILE;
  const raw = fs.readFileSync(file, 'utf-8');
  const parsed = JSON.parse(raw);
  const data = ensureDataShape(toInternalSchema(parsed));
  // Always use appointments.json as the canonical store
  data.appointments = loadAppointments();
  return data;
}

function saveData(data) {
  ensureDataShape(data);
  // Recalculate meta
  const activeRecords = data.kayitlar.filter(r => r.active !== false);
  data.meta.toplamKayit  = activeRecords.length;
  data.meta.referansDisi = activeRecords.filter(r => r.flag).length;
  data.meta.sonGuncelleme = new Date().toLocaleDateString('tr-TR');
  fs.writeFileSync(DATA_FILE, JSON.stringify(toFileSchema(data), null, 2), 'utf-8');
  // Appointments are stored separately; don't include them in medical_results.json
}

function sanitizeRichHtml(html) {
  const source = String(html || '');
  return source
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

function nextId(kayitlar) {
  return kayitlar.length ? Math.max(...kayitlar.map(r => r.id || 0)) + 1 : 1;
}

function normalizeTestHospitalFields(record) {
  const hospital = String(record?.hospital ?? record?.tesis ?? record?.facility ?? '').trim();
  return { ...record, hospital, tesis: hospital };
}

// ── PDF Parser ───────────────────────────────────────────────
// Tries to extract lab rows from Turkish lab report PDF text.
// Returns array of partial kayit objects (user can review before saving).
function parsePdfText(text) {
  const results = [];
  const lines   = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Common Turkish lab report patterns:
  // "Hemoglobin   13.5   g/dL   13.5 - 17.0"
  // "ALT (SGPT)   37   U/L   0 - 55"
  const rowPattern = /^(.+?)\s{2,}([\d.,<>]+\s*\w*)\s{2,}([\w\/\^³µ%]+)\s*([\d.,]+)?\s*[-–]\s*([\d.,]+)?/;
  const simplePattern = /^(.+?)\s{2,}([\d.,<>]+(?:\s+\w+)?)\s*$/;

  // Try to detect date in PDF (DD.MM.YYYY or DD/MM/YYYY)
  let detectedDate = '';
  const dateMatch = text.match(/(\d{2})[./](\d{2})[./](\d{4})/);
  if (dateMatch) detectedDate = `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]}`;

  // Try to detect hospital name (usually near top)
  let detectedHospital = '';
  const hospitalPatterns = ['Hastane', 'Klinik', 'Laboratuvar', 'Medical', 'Tıp', 'Sağlık'];
  for (const line of lines.slice(0, 20)) {
    if (hospitalPatterns.some(p => line.includes(p))) { detectedHospital = line; break; }
  }

  for (const line of lines) {
    const m = line.match(rowPattern);
    if (m) {
      const refAlt = m[4] ? m[4].replace(',', '.') : '';
      const refUst = m[5] ? m[5].replace(',', '.') : '';
      const sonuc  = m[2].trim();
      const refAltN = parseFloat(refAlt);
      const refUstN = parseFloat(refUst);
      const sonucN  = parseFloat(sonuc.replace(',', '.'));
      const flag = !isNaN(sonucN) && (
        (!isNaN(refUstN) && sonucN > refUstN) ||
        (!isNaN(refAltN) && sonucN < refAltN)
      );
      results.push({
        tarih:   detectedDate,
        hospital: detectedHospital,
        tesis:   detectedHospital,
        tahlil:  m[1].trim(),
        sonuc:   sonuc,
        birim:   m[3].trim(),
        refAlt:  refAlt,
        refUst:  refUst,
        flag:    flag
      });
    }
  }

  return { results, detectedDate, detectedHospital, detectedFacility: detectedHospital, rawLineCount: lines.length };
}

// ── API Routes ───────────────────────────────────────────────
app.use('/api', authGuard);

app.post('/api/auth/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';
  if (username !== AUTH_USERNAME || !verifyPassword(password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expiresAt: Date.now() + AUTH_TTL_MS });
  setAuthCookie(res, token);
  res.json({ ok: true, username });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ ok: true, username: req.authUser });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.authToken) sessions.delete(req.authToken);
  clearAuthCookie(res);
  res.json({ ok: true });
});

// GET all data
app.get('/api/data', (req, res) => {
  try {
    const data = loadData();
    res.json({
      ...data,
      kayitlar: data.kayitlar
        .filter(r => r.active !== false)
        .map(r => normalizeTestHospitalFields(r))
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not read data: ' + e.message });
  }
});

// GET deleted test records
app.get('/api/kayit/deleted', (req, res) => {
  try {
    const data = loadData();
    res.json({
      ok: true,
      kayitlar: data.kayitlar
        .filter(r => r.active === false)
        .map(r => normalizeTestHospitalFields(r))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET meta only
app.get('/api/meta', (req, res) => {
  res.json(loadData().meta);
});

// GET all test insight entries
app.get('/api/test-insights', (req, res) => {
  const data = loadData();
  res.json({ ok: true, testInsights: data.testInsights || {} });
});

app.get('/api/medical-directory', (req, res) => {
  try {
    res.json({ ok: true, directory: loadMedicalDirectory() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/medical-directory/:key', (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    const allowed = new Set(['hospitals', 'services', 'doctors', 'diagnosis', 'reportTypes', 'testTypes']);
    if (!allowed.has(key)) return res.status(400).json({ error: 'Invalid directory key' });
    const values = Array.isArray(req.body.values) ? req.body.values : [];
    const dir = loadMedicalDirectory();
    dir[key] = uniqSorted(values);
    saveMedicalDirectory(dir);
    res.json({ ok: true, key, values: dir[key] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT one test insight entry
app.put('/api/test-insight', (req, res) => {
  try {
    const testId = String(req.body.testId || '').trim();
    if (!testId) return res.status(400).json({ error: 'testId is required' });

    const meaningHtml = sanitizeRichHtml(req.body.meaningHtml || '');
    const highHtml = sanitizeRichHtml(req.body.highHtml || '');
    const lowHtml = sanitizeRichHtml(req.body.lowHtml || '');

    const data = loadData();
    if (!data.testCatalog || !data.testCatalog[testId]) {
      return res.status(404).json({ error: 'Test ID not found in catalog' });
    }
    
    data.testInsights[testId] = {
      meaningHtml,
      highHtml,
      lowHtml,
      updatedAt: new Date().toISOString()
    };
    saveData(data);

    res.json({ ok: true, testId, insight: data.testInsights[testId] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// POST add single record
app.post('/api/kayit', (req, res) => {
  try {
    const data = loadData();
    const kayit = normalizeTestHospitalFields({ id: nextId(data.kayitlar), ...req.body });
    // Auto-detect flag if not provided
    if (typeof kayit.flag === 'undefined') {
      const v  = parseFloat(kayit.sonuc);
      const lo = parseFloat(kayit.refAlt);
      const hi = parseFloat(kayit.refUst);
      kayit.flag = !isNaN(v) && ((!isNaN(hi) && v > hi) || (!isNaN(lo) && v < lo));
    }
    kayit.active = true;
    kayit.deletedAt = '';
    data.kayitlar.push(kayit);
    saveData(data);
    res.json({ ok: true, kayit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST add multiple records (batch from PDF import)
app.post('/api/kayitlar', (req, res) => {
  try {
    const data   = loadData();
    const newOnes = req.body.kayitlar || [];
    let added = 0;
    for (const k of newOnes) {
      data.kayitlar.push(normalizeTestHospitalFields({ id: nextId(data.kayitlar), ...k, active: true, deletedAt: '' }));
      added++;
    }
    saveData(data);
    res.json({ ok: true, added });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET all active appointments
app.get('/api/appointments', (req, res) => {
  try {
    const all = loadAppointments();
    res.json({ ok: true, appointments: all.filter(a => a.active !== false) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET deleted (soft-deleted) appointments
app.get('/api/appointments/deleted', (req, res) => {
  try {
    const all = loadAppointments();
    res.json({ ok: true, appointments: all.filter(a => a.active === false) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST add single appointment
app.post('/api/appointments', (req, res) => {
  try {
    const list = loadAppointments();
    const date     = String(req.body.date     || '').trim();
    const hospital = String(req.body.hospital || '').trim();
    const service  = String(req.body.service  || '').trim();
    const doctor   = String(req.body.doctor   || '').trim();

    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
      return res.status(400).json({ error: 'date must be DD.MM.YYYY' });
    }
    if (!hospital || !service || !doctor) {
      return res.status(400).json({ error: 'hospital, service and doctor are required' });
    }

    const key = appointmentKey(date, hospital, doctor);
    const exists = list.some(a => a.active !== false && appointmentKey(a.date, a.hospital, a.doctor) === key);
    if (exists) {
      return res.status(409).json({ error: 'Duplicate appointment: same date, hospital and doctor already exists' });
    }

    const appointment = { id: nextAppointmentId(list), date, hospital, service, doctor };
    list.push(appointment);
    saveAppointments(list);
    res.json({ ok: true, appointment });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST bulk import appointments from CSV
app.post('/api/appointments/import', (req, res) => {
  try {
    const rows = req.body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows provided' });
    }

    const list = loadAppointments();
    const existingKeys = new Set(list.filter(a => a.active !== false).map(a => appointmentKey(a.date, a.hospital, a.doctor)));
    const incomingKeys = new Set();
    let added = 0;
    const errors = [];

    rows.forEach((row, i) => {
      const date     = String(row.date     || '').trim();
      const hospital = String(row.hospital || '').trim();
      const service  = String(row.service  || '').trim();
      const doctor   = String(row.doctor   || '').trim();

      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
        errors.push(`Row ${i + 1}: invalid date "${date}"`);
        return;
      }
      if (!hospital || !service || !doctor) {
        errors.push(`Row ${i + 1}: hospital, service and doctor are required`);
        return;
      }

      const key = appointmentKey(date, hospital, doctor);
      if (existingKeys.has(key)) {
        errors.push(`Row ${i + 1}: duplicate of existing appointment (same date, hospital, doctor)`);
        return;
      }
      if (incomingKeys.has(key)) {
        errors.push(`Row ${i + 1}: duplicate within import file (same date, hospital, doctor)`);
        return;
      }

      list.push({ id: nextAppointmentId(list), date, hospital, service, doctor });
      incomingKeys.add(key);
      added++;
    });

    if (added > 0) saveAppointments(list);
    res.json({ ok: true, added, errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH recover a soft-deleted appointment
app.patch('/api/appointments/:id/recover', (req, res) => {
  try {
    const list = loadAppointments();
    const id = parseInt(req.params.id, 10);
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Appointment not found' });
    list[idx].active = true;
    delete list[idx].deletedAt;
    saveAppointments(list);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE appointment permanently
app.delete('/api/appointments/:id/permanent', (req, res) => {
  try {
    const list = loadAppointments();
    const id = parseInt(req.params.id, 10);
    const filtered = list.filter(a => a.id !== id);
    if (filtered.length === list.length) return res.status(404).json({ error: 'Appointment not found' });
    saveAppointments(filtered);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE appointment (soft delete)
app.delete('/api/appointments/:id', (req, res) => {
  try {
    const list = loadAppointments();
    const id = parseInt(req.params.id, 10);
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Appointment not found' });
    list[idx].active = false;
    list[idx].deletedAt = new Date().toISOString();
    saveAppointments(list);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update an appointment
app.put('/api/appointments/:id', (req, res) => {
  try {
    const list = loadAppointments();
    const id = parseInt(req.params.id, 10);
    const idx = list.findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Appointment not found' });

    const date     = String(req.body.date     || '').trim();
    const hospital = String(req.body.hospital || '').trim();
    const service  = String(req.body.service  || '').trim();
    const doctor   = String(req.body.doctor   || '').trim();

    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
      return res.status(400).json({ error: 'date must be DD.MM.YYYY' });
    }
    if (!hospital || !service || !doctor) {
      return res.status(400).json({ error: 'hospital, service and doctor are required' });
    }

    const key = appointmentKey(date, hospital, doctor);
    const exists = list.some(a => a.id !== id && a.active !== false && appointmentKey(a.date, a.hospital, a.doctor) === key);
    if (exists) return res.status(409).json({ error: 'Duplicate: same date, hospital and doctor already exists' });

    list[idx] = { ...list[idx], date, hospital, service, doctor };
    saveAppointments(list);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET all diseases
app.get('/api/diseases', (req, res) => {
  try {
    res.json({ ok: true, diseases: loadDiseases() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST add single disease record
app.post('/api/diseases', (req, res) => {
  try {
    const list = loadDiseases();
    const date = String(req.body.date || '').trim();
    const diagnosis = String(req.body.diagnosis || '').trim();
    const service = String(req.body.service || req.body.department || '').trim();
    const doctor = String(req.body.doctor || '').trim();

    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
      return res.status(400).json({ error: 'date must be DD.MM.YYYY' });
    }
    if (!diagnosis || !service || !doctor) {
      return res.status(400).json({ error: 'diagnosis, service and doctor are required' });
    }

    const key = diseaseKey(date, diagnosis, service, doctor);
    const exists = list.some(d => diseaseKey(d.date, d.diagnosis, d.service || d.department, d.doctor) === key);
    if (exists) {
      return res.status(409).json({ error: 'Duplicate disease record: same date, diagnosis, service and doctor already exists' });
    }

    const disease = { id: nextDiseaseId(list), date, diagnosis, service, department: service, doctor };
    list.push(disease);
    saveDiseases(list);
    res.json({ ok: true, disease });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST bulk import diseases from CSV
app.post('/api/diseases/import', (req, res) => {
  try {
    const rows = req.body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows provided' });
    }

    const list = loadDiseases();
    const existingKeys = new Set(list.map(d => diseaseKey(d.date, d.diagnosis, d.service || d.department, d.doctor)));
    const incomingKeys = new Set();
    let added = 0;
    const errors = [];

    rows.forEach((row, i) => {
      const date = String(row.date || '').trim();
      const diagnosis = String(row.diagnosis || '').trim();
      const service = String(row.service || row.department || '').trim();
      const doctor = String(row.doctor || '').trim();

      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
        errors.push(`Row ${i + 1}: invalid date "${date}"`);
        return;
      }
      if (!diagnosis || !service || !doctor) {
        errors.push(`Row ${i + 1}: diagnosis, service and doctor are required`);
        return;
      }

      const key = diseaseKey(date, diagnosis, service, doctor);
      if (existingKeys.has(key)) {
        errors.push(`Row ${i + 1}: duplicate of existing disease record (same date, diagnosis, service, doctor)`);
        return;
      }
      if (incomingKeys.has(key)) {
        errors.push(`Row ${i + 1}: duplicate within import file (same date, diagnosis, service, doctor)`);
        return;
      }

      list.push({ id: nextDiseaseId(list), date, diagnosis, service, department: service, doctor });
      incomingKeys.add(key);
      added++;
    });

    if (added > 0) saveDiseases(list);
    res.json({ ok: true, added, errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE disease record
app.delete('/api/diseases/:id', (req, res) => {
  try {
    const list = loadDiseases();
    const id = parseInt(req.params.id, 10);
    const filtered = list.filter(d => d.id !== id);
    if (filtered.length === list.length) return res.status(404).json({ error: 'Disease record not found' });
    saveDiseases(filtered);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update a disease record
app.put('/api/diseases/:id', (req, res) => {
  try {
    const list = loadDiseases();
    const id = parseInt(req.params.id, 10);
    const idx = list.findIndex(d => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Disease record not found' });

    const date       = String(req.body.date       || '').trim();
    const diagnosis  = String(req.body.diagnosis  || '').trim();
    const service    = String(req.body.service    || req.body.department || '').trim();
    const doctor     = String(req.body.doctor     || '').trim();

    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
      return res.status(400).json({ error: 'date must be DD.MM.YYYY' });
    }
    if (!diagnosis || !service || !doctor) {
      return res.status(400).json({ error: 'diagnosis, service and doctor are required' });
    }

    const key = diseaseKey(date, diagnosis, service, doctor);
    const exists = list.some(d => d.id !== id && diseaseKey(d.date, d.diagnosis, d.service || d.department, d.doctor) === key);
    if (exists) return res.status(409).json({ error: 'Duplicate: same date, diagnosis, service and doctor already exists' });

    list[idx] = { ...list[idx], date, diagnosis, service, department: service, doctor };
    saveDiseases(list);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET all reports
app.get('/api/reports', (req, res) => {
  try {
    res.json({ ok: true, reports: loadReports() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST add single report record
app.post('/api/reports', (req, res) => {
  try {
    const list = loadReports();
    const date = String(req.body.date || '').trim();
    const reportNumber = String(req.body.reportNumber || '').trim();
    const reportType = String(req.body.reportType || '').trim();
    const starting = String(req.body.starting || '').trim();
    const ending = String(req.body.ending || '').trim();
    const doctor = String(req.body.doctor || '').trim();
    const diagnosis = String(req.body.diagnosis || '').trim();

    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
      return res.status(400).json({ error: 'date must be DD.MM.YYYY' });
    }
    if (!reportNumber || !reportType || !starting || !ending || !doctor || !diagnosis) {
      return res.status(400).json({ error: 'reportNumber, reportType, starting, ending, doctor and diagnosis are required' });
    }

    const key = reportKey(date, reportNumber, doctor);
    const exists = list.some(r => reportKey(r.date, r.reportNumber, r.doctor) === key);
    if (exists) {
      return res.status(409).json({ error: 'Duplicate report record: same date, report number and doctor already exists' });
    }

    const report = { id: nextReportId(list), date, reportNumber, reportType, starting, ending, doctor, diagnosis };
    list.push(report);
    saveReports(list);
    res.json({ ok: true, report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST bulk import reports from CSV
app.post('/api/reports/import', (req, res) => {
  try {
    const rows = req.body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows provided' });
    }

    const list = loadReports();
    const existingKeys = new Set(list.map(r => reportKey(r.date, r.reportNumber, r.doctor)));
    const incomingKeys = new Set();
    let added = 0;
    const errors = [];

    rows.forEach((row, i) => {
      const date = String(row.date || '').trim();
      const reportNumber = String(row.reportNumber || '').trim();
      const reportType = String(row.reportType || '').trim();
      const starting = String(row.starting || '').trim();
      const ending = String(row.ending || '').trim();
      const doctor = String(row.doctor || '').trim();
      const diagnosis = String(row.diagnosis || '').trim();

      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
        errors.push(`Row ${i + 1}: invalid date "${date}"`);
        return;
      }
      if (!reportNumber || !reportType || !starting || !ending || !doctor || !diagnosis) {
        errors.push(`Row ${i + 1}: reportNumber, reportType, starting, ending, doctor and diagnosis are required`);
        return;
      }

      const key = reportKey(date, reportNumber, doctor);
      if (existingKeys.has(key)) {
        errors.push(`Row ${i + 1}: duplicate of existing report record (same date, report number, doctor)`);
        return;
      }
      if (incomingKeys.has(key)) {
        errors.push(`Row ${i + 1}: duplicate within import file (same date, report number, doctor)`);
        return;
      }

      list.push({ id: nextReportId(list), date, reportNumber, reportType, starting, ending, doctor, diagnosis });
      incomingKeys.add(key);
      added++;
    });

    if (added > 0) saveReports(list);
    res.json({ ok: true, added, errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE report record
app.delete('/api/reports/:id', (req, res) => {
  try {
    const list = loadReports();
    const id = parseInt(req.params.id, 10);
    const filtered = list.filter(r => r.id !== id);
    if (filtered.length === list.length) return res.status(404).json({ error: 'Report record not found' });
    saveReports(filtered);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update a report record
app.put('/api/reports/:id', (req, res) => {
  try {
    const list = loadReports();
    const id = parseInt(req.params.id, 10);
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Report record not found' });

    const date         = String(req.body.date         || '').trim();
    const reportNumber = String(req.body.reportNumber || '').trim();
    const reportType   = String(req.body.reportType   || '').trim();
    const starting     = String(req.body.starting     || '').trim();
    const ending       = String(req.body.ending       || '').trim();
    const doctor       = String(req.body.doctor       || '').trim();
    const diagnosis    = String(req.body.diagnosis    || '').trim();

    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
      return res.status(400).json({ error: 'date must be DD.MM.YYYY' });
    }
    if (!reportNumber || !reportType || !starting || !ending || !doctor || !diagnosis) {
      return res.status(400).json({ error: 'reportNumber, reportType, starting, ending, doctor and diagnosis are required' });
    }

    const key = reportKey(date, reportNumber, doctor);
    const exists = list.some(r => r.id !== id && reportKey(r.date, r.reportNumber, r.doctor) === key);
    if (exists) return res.status(409).json({ error: 'Duplicate: same date, report number and doctor already exists' });

    list[idx] = { ...list[idx], date, reportNumber, reportType, starting, ending, doctor, diagnosis };
    saveReports(list);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update a test record
app.put('/api/kayit/:id', (req, res) => {
  try {
    const data = loadData();
    const idx  = data.kayitlar.findIndex(r => r.id === parseInt(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Record not found' });
    data.kayitlar[idx] = normalizeTestHospitalFields({ ...data.kayitlar[idx], ...req.body });
    saveData(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE a record
app.delete('/api/kayit/:id', (req, res) => {
  try {
    const data = loadData();
    const id = parseInt(req.params.id, 10);
    const idx = data.kayitlar.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Record not found' });
    data.kayitlar[idx].active = false;
    data.kayitlar[idx].deletedAt = new Date().toISOString();
    saveData(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH recover a soft-deleted test record
app.patch('/api/kayit/:id/recover', (req, res) => {
  try {
    const data = loadData();
    const id = parseInt(req.params.id, 10);
    const idx = data.kayitlar.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Record not found' });
    data.kayitlar[idx].active = true;
    data.kayitlar[idx].deletedAt = '';
    saveData(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE test record permanently
app.delete('/api/kayit/:id/permanent', (req, res) => {
  try {
    const data = loadData();
    const id = parseInt(req.params.id, 10);
    const before = data.kayitlar.length;
    data.kayitlar = data.kayitlar.filter(r => r.id !== id);
    if (data.kayitlar.length === before) return res.status(404).json({ error: 'Record not found' });
    saveData(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET patient info
app.get('/api/patient', (req, res) => {
  try {
    const data = loadData();
    res.json({ ok: true, patient: data.patient || {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT patient info
app.put('/api/patient', (req, res) => {
  try {
    const allowed = ['ad', 'soyad', 'tcNo', 'cinsiyet', 'bloodType', 'dogumTarihi', 'boy', 'kilo'];
    const data = loadData();
    allowed.forEach(k => {
      if (req.body[k] !== undefined) data.patient[k] = req.body[k];
    });
    data.patient.updatedAt = new Date().toISOString();
    saveData(data);
    res.json({ ok: true, patient: data.patient });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST import PDF
app.post('/api/import-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'PDF file not found' });
    const parsed = await pdfParse(req.file.buffer);
    const result = parsePdfText(parsed.text);
    res.json({
      ok: true,
      pageCount:       parsed.numpages,
      detectedDate:    result.detectedDate,
      detectedHospital: result.detectedHospital,
      detectedFacility: result.detectedFacility,
      rawLineCount:    result.rawLineCount,
      results:         result.results
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not parse PDF: ' + e.message });
  }
});

// ── Start ────────────────────────────────────────────────────
assertAuthConfig();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Lab Results app running at http://0.0.0.0:${PORT}`);
});
