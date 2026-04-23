// ── Shared utilities ─────────────────────────────────────────

(function injectSharedHead() {
  const h = document.head;
  const links = [
    { rel: 'icon', type: 'image/svg+xml', href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='50' font-size='50'%3E%F0%9F%94%AC%3C/text%3E%3C/svg%3E" },
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: '' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@400;500;600;700&display=swap' }
  ];
  links.forEach(attrs => {
    if (document.querySelector(`link[href="${attrs.href}"]`)) return;
    const el = document.createElement('link');
    Object.entries(attrs).forEach(([k, v]) => { if (k === 'crossOrigin') el.crossOrigin = v; else el[k] = v; });
    h.appendChild(el);
  });
})();

const DEFAULT_NAVIGATION = [
  { label: 'Dashboard', href: 'dashboard.html', icon: '📊' },
  { label: 'Tests', href: 'test.html', icon: '🧪' },
  { label: 'Appointments', href: 'appointments.html', icon: '🏥' },
  { label: 'Patient Info', href: 'patient.html', icon: '👤' }
];

function renderSideNav(items = DEFAULT_NAVIGATION) {
  const nav = document.getElementById('sideNav');
  if (!nav) return;
  nav.innerHTML = `
    <div class="nav-logo"><h1><span class="app-icon" aria-hidden="true">🔬</span>Medical App</h1><p id="navPatientName">—</p></div>
    ${items.map(i => `
      <a class="nav-item" href="${i.href}"><span class="nav-icon">${i.icon || '•'}</span><span>${i.label}</span></a>
    `).join('')}
    <a class="nav-item" href="#" onclick="logout();return false;" style="margin-top:auto"><span class="nav-icon">↩</span><span>Logout</span></a>
  `;
}

function renderTopNav(containerId = 'topNav') {
  const el = document.getElementById(containerId);
  if (!el) return;
  const appNav = window.APP_NAVIGATION;
  if (!appNav || !Array.isArray(appNav.navigation)) return;
  const page = location.pathname.split('/').pop() || 'dashboard.html';
  let group = null;
  for (const item of appNav.navigation) {
    if (item.href === page || (Array.isArray(item.children) && item.children.some(c => c.href === page))) {
      group = item;
      break;
    }
  }
  if (!group || !Array.isArray(group.children) || group.children.length === 0) return;
  const allItems = [
    { label: group.label, href: group.href, icon: group.icon, navCls: group.navCls || 'top-nav-trend' },
    ...group.children
  ];
  el.innerHTML = allItems
    .filter(item => item.href !== page)
    .map(item => `<a href="${item.href}" class="top-nav-btn ${item.navCls || 'top-nav-trend'}"><span>${item.icon}</span>${item.label}</a>`)
    .join('');
}

async function loadNavigationConfig() {
  try {
    const res = await fetch(new URL('navigation.json', document.baseURI).toString());
    if (!res.ok) return DEFAULT_NAVIGATION;
    const data = await res.json();
    const items = Array.isArray(data.navigation) ? data.navigation : DEFAULT_NAVIGATION;
    window.APP_NAVIGATION = data;
    return items;
  } catch {
    return DEFAULT_NAVIGATION;
  }
}

function apiUrl(path) {
  const apiBase = new URL('api/', document.baseURI);
  return new URL(String(path || '').replace(/^\/+/, ''), apiBase).toString();
}

async function parseApiJson(res, endpoint) {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const bodyText = await res.text();
  if (!contentType.includes('application/json')) {
    const sample = bodyText.slice(0, 80).replace(/\s+/g, ' ');
    throw new Error(`${endpoint} returned non-JSON response (${res.status}): ${sample}`);
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    const sample = bodyText.slice(0, 80).replace(/\s+/g, ' ');
    throw new Error(`${endpoint} returned invalid JSON: ${sample}`);
  }
}

function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + (type === 'err' ? 'err' : 'ok');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function showAuthModal() {
  document.getElementById('authBackdrop').classList.add('open');
  document.getElementById('authError').textContent = '';
}

function hideAuthModal() {
  document.getElementById('authBackdrop').classList.remove('open');
}

async function login(e) {
  e.preventDefault();
  const username = document.getElementById('authUser').value.trim();
  const password = document.getElementById('authPass').value;
  const errEl = document.getElementById('authError');
  errEl.textContent = '';
  const res = await fetch(apiUrl('auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  let data;
  try {
    data = await parseApiJson(res, '/api/auth/login');
  } catch (err) {
    errEl.textContent = err.message;
    return;
  }
  if (!res.ok || !data.ok) {
    errEl.textContent = data.error || 'Login failed';
    return;
  }
  document.getElementById('authPass').value = '';
  hideAuthModal();
  if (typeof onLoginSuccess === 'function') onLoginSuccess();
}

async function logout() {
  await fetch(apiUrl('auth/logout'), { method: 'POST' });
  showAuthModal();
}

// Call on each page to verify session; shows modal if 401
async function checkAuth() {
  const res = await fetch(apiUrl('auth/me'));
  if (res.status === 401) { showAuthModal(); return false; }
  return true;
}

// Highlight the active nav item whose href matches the current page
function markActiveNav() {
  const page = location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.nav-item[href]').forEach(el => {
    el.classList.toggle('on', el.getAttribute('href') === page);
  });
  const activeSub = document.querySelector('.nav-sub-item.on');
  if (activeSub) {
    const parent = activeSub.closest('.nav-group')?.querySelector('.nav-item[href]');
    if (parent) parent.classList.add('on');
  }
}

// Render fallback nav immediately so page scripts can use navPatientName.
renderSideNav(DEFAULT_NAVIGATION);

// Wire auth form on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  loadNavigationConfig().then(items => { renderSideNav(items); markActiveNav(); renderTopNav(); });
  const form = document.getElementById('authForm');
  if (form) form.addEventListener('submit', login);
});

async function loadPatientName() {
  try {
    const res = await fetch(apiUrl('patient'));
    if (!res.ok) return;
    const d = await parseApiJson(res, '/api/patient');
    const p = d.patient || {};
    const name = [p.ad, p.soyad].filter(Boolean).join(' ');
    const el = document.getElementById('navPatientName');
    if (el) el.textContent = name || '—';
  } catch {}
}
