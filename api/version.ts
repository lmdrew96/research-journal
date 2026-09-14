import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * The version of the deployment answering this request.
 *
 * Every deploy runs its functions with its own VERCEL_GIT_COMMIT_SHA, the same
 * value vite.config.ts baked into that deploy's bundle. A tab opened before a
 * deploy still holds the old value, and the difference is what useAppVersion
 * watches for.
 *
 * Never cached — a cached answer is the old answer — and deliberately
 * unauthenticated: it reveals a short commit SHA and nothing else, and a stale
 * tab whose session has expired still needs to be told to refresh.
 */
export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).json({ version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev' });
}
