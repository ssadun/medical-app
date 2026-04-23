const express = require('express');
const multer  = require('multer');
const pdfParse = require('pdf-parse');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3234;
const DATA_FILE    = path.join(__dirname, 'data', 'medical_results.json');
const SAMPLE_FILE  = path.join(__dirname, 'data', 'medical_results_sample.json');
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
      tesis: r.tesis ?? r.facility ?? '',
      tahlil: r.tahlil ?? r.test ?? '',
      sonuc: r.sonuc ?? r.result ?? '',
      birim: r.birim ?? r.unit ?? '',
      refAlt: r.refAlt ?? r.refLow ?? '',
      refUst: r.refUst ?? r.refHigh ?? '',
      flag: Boolean(r.flag)
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
      facility: r.tesis,
      test: r.tahlil,
      result: r.sonuc,
      unit: r.birim,
      refLow: r.refAlt,
      refHigh: r.refUst,
      flag: Boolean(r.flag)
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

function loadData() {
  const file = fs.existsSync(DATA_FILE) ? DATA_FILE : SAMPLE_FILE;
  const raw = fs.readFileSync(file, 'utf-8');
  const parsed = JSON.parse(raw);
  return ensureDataShape(toInternalSchema(parsed));
}

function saveData(data) {
  ensureDataShape(data);
  // Recalculate meta
  data.meta.toplamKayit  = data.kayitlar.length;
  data.meta.referansDisi = data.kayitlar.filter(r => r.flag).length;
  data.meta.sonGuncelleme = new Date().toLocaleDateString('tr-TR');
  fs.writeFileSync(DATA_FILE, JSON.stringify(toFileSchema(data), null, 2), 'utf-8');
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

  // Try to detect facility name (usually near top)
  let detectedFacility = '';
  const facilityPatterns = ['Hastane', 'Klinik', 'Laboratuvar', 'Medical', 'Tıp', 'Sağlık'];
  for (const line of lines.slice(0, 20)) {
    if (facilityPatterns.some(p => line.includes(p))) { detectedFacility = line; break; }
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
        tesis:   detectedFacility,
        tahlil:  m[1].trim(),
        sonuc:   sonuc,
        birim:   m[3].trim(),
        refAlt:  refAlt,
        refUst:  refUst,
        flag:    flag
      });
    }
  }

  return { results, detectedDate, detectedFacility, rawLineCount: lines.length };
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
    res.json(loadData());
  } catch (e) {
    res.status(500).json({ error: 'Could not read data: ' + e.message });
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
    const kayit = { id: nextId(data.kayitlar), ...req.body };
    // Auto-detect flag if not provided
    if (typeof kayit.flag === 'undefined') {
      const v  = parseFloat(kayit.sonuc);
      const lo = parseFloat(kayit.refAlt);
      const hi = parseFloat(kayit.refUst);
      kayit.flag = !isNaN(v) && ((!isNaN(hi) && v > hi) || (!isNaN(lo) && v < lo));
    }
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
      data.kayitlar.push({ id: nextId(data.kayitlar), ...k });
      added++;
    }
    saveData(data);
    res.json({ ok: true, added });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET all appointments
app.get('/api/appointments', (req, res) => {
  try {
    const data = loadData();
    res.json({ ok: true, appointments: data.appointments || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST add appointment
app.post('/api/appointments', (req, res) => {
  try {
    const data = loadData();
    const date = String(req.body.date || '').trim();
    const hospital = String(req.body.hospital || '').trim();
    const service = String(req.body.service || '').trim();
    const doctor = String(req.body.doctor || '').trim();

    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) {
      return res.status(400).json({ error: 'date must be DD.MM.YYYY' });
    }
    if (!hospital || !service || !doctor) {
      return res.status(400).json({ error: 'hospital, service and doctor are required' });
    }

    const id = data.appointments.length
      ? Math.max(...data.appointments.map(a => Number(a.id) || 0)) + 1
      : 1;

    const appointment = { id, date, hospital, service, doctor };
    data.appointments.push(appointment);
    saveData(data);
    res.json({ ok: true, appointment });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE appointment
app.delete('/api/appointments/:id', (req, res) => {
  try {
    const data = loadData();
    const id = parseInt(req.params.id, 10);
    const before = data.appointments.length;
    data.appointments = data.appointments.filter(a => a.id !== id);
    if (data.appointments.length === before) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    saveData(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update a record
app.put('/api/kayit/:id', (req, res) => {
  try {
    const data = loadData();
    const idx  = data.kayitlar.findIndex(r => r.id === parseInt(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Record not found' });
    data.kayitlar[idx] = { ...data.kayitlar[idx], ...req.body };
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
    const before = data.kayitlar.length;
    data.kayitlar = data.kayitlar.filter(r => r.id !== parseInt(req.params.id));
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
