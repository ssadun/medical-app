function resolveNextPage() {
  const params = new URLSearchParams(location.search);
  const next = (params.get('next') || '').trim();
  if (!next || next === 'login.html') return 'dashboard.html';
  return next;
}

function onLoginSuccess() {
  window.location.href = resolveNextPage();
}

async function boot() {
  try {
    const res = await fetch(apiUrl('auth/me'));
    if (res.ok) {
      onLoginSuccess();
      return;
    }
  } catch {}
  const err = document.getElementById('authError');
  if (err) err.textContent = '';
}

boot();
