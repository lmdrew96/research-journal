export async function checkAuth(): Promise<boolean> {
  // In local dev, skip auth entirely
  if (window.location.hostname === 'localhost') {
    return true;
  }

  try {
    // Try fetching the data endpoint — if middleware redirects us, we're not authed
    const res = await fetch('/api/data', { method: 'GET', redirect: 'manual' });
    // If we get 200 or 404 (no data yet), we're authenticated
    // If we get 0 (opaque redirect) or 3xx, middleware redirected us = not authed
    return res.status === 200 || res.status === 404 || res.status === 500;
  } catch {
    // Network error — assume authed (offline mode)
    return true;
  }
}

export async function login(password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      return { ok: true };
    }

    const data = await res.json();
    return { ok: false, error: data.error || 'Login failed' };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST' });
  window.location.reload();
}