import type { AppUserData } from '../types';

const isProduction = () => window.location.hostname !== 'localhost';

export async function fetchRemoteData(): Promise<AppUserData | null> {
  if (!isProduction()) return null;

  try {
    const res = await fetch('/api/data');
    if (res.status === 404) return null; // No data on server yet
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

export async function pushRemoteData(data: AppUserData): Promise<boolean> {
  if (!isProduction()) return true;

  try {
    const res = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}