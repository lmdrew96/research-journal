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

/**
 * The revision a push is based on.
 *
 * A number is the `rev` the client last saw from the server; the write applies
 * only if that is still the stored revision. `'*'` overwrites unconditionally
 * and is reserved for deliberate whole-document replacement (import).
 */
export type BaseRev = number | '*';

export type RemoteFetch =
  /** The server returned this user's data, at revision `rev`. */
  | { status: 'ok'; data: AppUserData; rev: number }
  /** The server is reachable and healthy; there is simply no row for this user. */
  | { status: 'empty' }
  /** No usable backend. Never treat this as "the account is empty". */
  | { status: 'unavailable'; reason: string };

export type RemotePush =
  /** Applied. `rev` is the new revision to base the next push on. */
  | { status: 'ok'; rev: number }
  /**
   * Refused: someone else wrote since `rev` was read. Nothing was overwritten.
   * `current` is the blob that won, for the caller to rebase onto.
   */
  | { status: 'conflict'; current: AppUserData; rev: number }
  | { status: 'unavailable'; reason: string };

/**
 * The server puts the concurrency token in the response body (and an ETag).
 * Reading it off the body keeps it working through the service worker, which
 * does not preserve every header on a cached response.
 */
const revFrom = (body: unknown): number => {
  const r = (body as { rev?: unknown } | null)?.rev;
  return typeof r === 'number' && Number.isFinite(r) ? r : 0;
};

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
    const body = (await res.json()) as AppUserData;
    return { status: 'ok', data: body, rev: revFrom(body) };
  } catch (err) {
    return { status: 'unavailable', reason: `Malformed JSON: ${(err as Error).message}` };
  }
}

export async function pushRemoteData(
  data: AppUserData,
  token: string | null,
  baseRev: BaseRev,
): Promise<RemotePush> {
  let res: Response;
  try {
    res = await fetch('/api/data', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        // The base revision this push is built on. Without it the server has no
        // way to tell a current write from one that would silently erase
        // whatever the MCP or ThreadBrain wrote in the meantime.
        'If-Match': String(baseRev),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });
  } catch (err) {
    return { status: 'unavailable', reason: `Network error: ${(err as Error).message}` };
  }

  if (res.status === 409) {
    try {
      const body = (await res.json()) as { current: AppUserData; rev?: number };
      return { status: 'conflict', current: body.current, rev: revFrom(body.current) };
    } catch (err) {
      // A 409 we cannot parse is still a refusal — surfacing it as unavailable
      // keeps the local edits queued instead of pretending the push landed.
      return { status: 'unavailable', reason: `Unreadable conflict response: ${(err as Error).message}` };
    }
  }

  if (!res.ok) return { status: 'unavailable', reason: `Server returned ${res.status}` };

  try {
    return { status: 'ok', rev: revFrom(await res.json()) };
  } catch {
    // The write applied but we cannot read the new revision. Reporting 0 makes
    // the next push conflict and rebase onto the server copy — one wasted round
    // trip, which beats guessing a revision and forcing over someone's write.
    return { status: 'ok', rev: 0 };
  }
}
