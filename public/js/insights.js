let INSIGHTS = {}, TEST_CATALOG = {};

function onLoginSuccess() { boot(); }

async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  try {
    const res = await fetch(apiUrl('data'));
    if (res.status === 401) { showAuthModal(); return; }
    const d = await parseApiJson(res, '/api/data');
    TEST_CATALOG = d.testCatalog || {};
    buildInsightSelect();
    await loadInsights();
    restoreUrlState();
    await loadPatientName();
  } catch(e) {
    toast('Could not connect to server: ' + e.message, 'err');
  }
}

function buildInsightSelect() {
  const sel = document.getElementById('ins-test');
  sel.innerHTML = '<option value="">Select test item...</option>';
  Object.entries(TEST_CATALOG).forEach(([testId, testName]) => {
    const o = document.createElement('option');
    o.value = testId; o.textContent = testName;
    sel.appendChild(o);
  });
}

function restoreUrlState() {
  const p = new URLSearchParams(location.search);
  const itest = p.get('itest');
  if (itest && [...document.getElementById('ins-test').options].some(o => o.value === itest)) {
    document.getElementById('ins-test').value = itest;
    loadSelectedInsight();
  }
}

async function loadInsights() {
  const res = await fetch(apiUrl('test-insights'));
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/test-insights');
  INSIGHTS = d.testInsights || {};
  loadSelectedInsight();
}

function loadSelectedInsight() {
  const testId = document.getElementById('ins-test').value;
  const params = new URLSearchParams();
  if (testId) params.set('itest', testId);
  history.replaceState(null, '', testId ? '?' + params.toString() : location.pathname);
  if (!testId) {
    document.getElementById('ins-meaning').innerHTML = '';
    document.getElementById('ins-high').innerHTML = '';
    document.getElementById('ins-low').innerHTML = '';
    document.getElementById('ins-meta').textContent = '';
    return;
  }
  const item = INSIGHTS[testId] || { meaningHtml: '', highHtml: '', lowHtml: '' };
  document.getElementById('ins-meaning').innerHTML = item.meaningHtml || '';
  document.getElementById('ins-high').innerHTML = item.highHtml || '';
  document.getElementById('ins-low').innerHTML = item.lowHtml || '';
  document.getElementById('ins-meta').textContent = item.updatedAt ? `Last updated: ${new Date(item.updatedAt).toLocaleString()}` : '';
}

async function saveInsight() {
  const testId = document.getElementById('ins-test').value;
  if (!testId) { toast('Please select a test item first', 'err'); return; }
  const payload = {
    testId,
    meaningHtml: document.getElementById('ins-meaning').innerHTML.trim(),
    highHtml:    document.getElementById('ins-high').innerHTML.trim(),
    lowHtml:     document.getElementById('ins-low').innerHTML.trim()
  };
  const res = await fetch(apiUrl('test-insight'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.status === 401) { showAuthModal(); return; }
  const d = await parseApiJson(res, '/api/test-insight');
  if (!res.ok || !d.ok) { toast('Error: ' + (d.error || 'Could not save insight'), 'err'); return; }
  INSIGHTS[testId] = d.insight;
  loadSelectedInsight();
  toast('Insight saved', 'ok');
}

function rteCmd(cmd) {
  const editor = document.activeElement;
  if (!editor || !editor.classList.contains('rte-editor')) {
    document.execCommand(cmd, false, null);
    return;
  }
  if (cmd === 'insertUnorderedList') {
    document.execCommand('insertHTML', false, '<ul><li>Item</li></ul>');
  } else if (cmd === 'insertOrderedList') {
    document.execCommand('insertHTML', false, '<ol><li>Item</li></ol>');
  } else {
    document.execCommand(cmd, false, null);
  }
}

boot();
