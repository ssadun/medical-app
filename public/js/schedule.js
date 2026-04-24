function onLoginSuccess() { boot(); }
async function boot() {
  const ok = await checkAuth();
  if (!ok) return;
  await loadPatientName();
}

boot();
