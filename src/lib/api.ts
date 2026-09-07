import type { AppUserData } from '../types';

/**
 * Serverless API client.
 *
 * These calls used to be gated on `window.location.hostname !== 'localhost'`,
 * which was wrong in both directions. It silently skipped every sync under
 * `vercel dev` — where the API genuinely works — and on plain `vite` it hid the
 * real problem (Vite serves api/data.ts as a static asset, so the response is
 * TypeScript source with a 200 status). Either way the app fell back to seeded
 * defaults with no signal, which reads exactly like data loss.
 *
 * So the backend is now detected rather than assumed: we always attempt the
 * request and report what actually came back.
 */

export type RemoteFetch =
  /** The server returned this user's data. */
  | { status: 'ok'; data: AppUserData }
  /** The server is reachable and healthy; there is simply no row for this user. */
  | { status: 'empty' }
  /** No usable backend. Never treat this as "the account is empty". */
  | { status: 'unavailable'; reason: string };

export type RemotePush = { status: 'ok' } | { status: 'unavailable'; reason: string };

/**
 * A 200 whose body is not JSON means we are talking to something that is not
 * our API — almost always a dev server handing back the handler's own source.
 * That is a misconfigured environment, not an empty account, and the two must
 * not collapse into the same result.
 */
const looksLikeJson = (res: Response): boolean =>
  (res.headers.get('content-type') ?? '').toLowerCase().includes('application/json');

export async function fetchRemoteData(token: string | null): Promise<RemoteFetch> {
  let res: Response;
  try {
    res = await fetch('/api/data', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (err) {
    return { status: 'unavailable', reason: `Network error: ${(err as Error).message}` };
  }

  if (res.status === 404) return { status: 'empty' };
  if (!res.ok) return { status: 'unavailable', reason: `Server returned ${res.status}` };

  if (!looksLikeJson(res)) {
    return {
      status: 'unavailable',
      reason:
        `/api/data returned ${res.headers.get('content-type') ?? 'no content-type'} ` +
        `instead of JSON — the serverless functions are not running`,
    };
  }

  try {
    return { status: 'ok', data: (await res.json()) as AppUserData };
  } catch (err) {
    return { status: 'unavailable', reason: `Malformed JSON: ${(err as Error).message}` };
  }
}

export async function pushRemoteData(data: AppUserData, token: string | null): Promise<RemotePush> {
  try {
    const res = await fetch('/api/data', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) return { status: 'unavailable', reason: `Server returned ${res.status}` };
    return { status: 'ok' };
  } catch (err) {
    return { status: 'unavailable', reason: `Network error: ${(err as Error).message}` };
  }
}
