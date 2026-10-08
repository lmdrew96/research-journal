import { AwsClient } from 'aws4fetch';

/**
 * Article PDFs live in Cloudflare R2, reached through short-lived presigned
 * URLs. The browser uploads straight to R2 (a Vercel function body caps out
 * around 4.5MB), and Claude reads a PDF from a signed GET URL.
 *
 * Keys are `{userId}/{uuid}.pdf`: the uuid makes them unguessable, and every
 * route that signs a key checks the userId prefix first with ownsPdfKey.
 */

/** The Messages API request limit — a larger PDF can't be read anyway. */
export const MAX_PDF_BYTES = 32 * 1024 * 1024;

const PDF_KEY = /^[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.pdf$/;

interface R2 {
  client: AwsClient;
  base: string;
}

function r2(): R2 {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error('PDF storage is not configured (R2_* environment variables missing)');
  }
  return {
    client: new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    }),
    base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
  };
}

export const newPdfKey = (userId: string): string => `${userId}/${crypto.randomUUID()}.pdf`;

export const ownsPdfKey = (userId: string, key: unknown): key is string =>
  typeof key === 'string' && PDF_KEY.test(key) && key.startsWith(`${userId}/`);

async function presign(
  method: 'GET' | 'PUT',
  key: string,
  expiresSeconds: number,
  headers?: Record<string, string>,
): Promise<string> {
  const { client, base } = r2();
  const url = new URL(`${base}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
  // allHeaders: aws4fetch otherwise leaves Content-Type out of a query
  // signature, and an upload of any type would be accepted.
  const signed = await client.sign(url.toString(), {
    method,
    headers,
    aws: { signQuery: true, allHeaders: true },
  });
  return signed.url;
}

/** Content-Type is part of the signature, so only a PDF upload is accepted. */
export const presignPdfPut = (key: string): Promise<string> =>
  presign('PUT', key, 600, { 'Content-Type': 'application/pdf' });

export const presignPdfGet = (key: string, expiresSeconds: number): Promise<string> =>
  presign('GET', key, expiresSeconds);

/** Size in bytes, or null when the object doesn't exist. */
export async function pdfSize(key: string): Promise<number | null> {
  const { client, base } = r2();
  const res = await client.fetch(`${base}/${key}`, { method: 'HEAD' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD returned ${res.status}`);
  return Number(res.headers.get('content-length') ?? 0);
}

export interface StoredPdf {
  key: string;
  size: number;
  lastModified: Date;
}

/** Every object in the bucket (ListObjectsV2, followed through every page). */
export async function listPdfObjects(): Promise<StoredPdf[]> {
  const { client, base } = r2();
  const objects: StoredPdf[] = [];
  let token: string | null = null;
  do {
    const url = new URL(base);
    url.searchParams.set('list-type', '2');
    if (token) url.searchParams.set('continuation-token', token);
    const res = await client.fetch(url.toString());
    if (!res.ok) throw new Error(`R2 list returned ${res.status}`);
    const xml = await res.text();
    for (const [, body] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = body.match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
      const modified = body.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1];
      if (!key || !modified) throw new Error('R2 list returned an object without a key or date');
      objects.push({
        key,
        size: Number(body.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0),
        lastModified: new Date(modified),
      });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? null
      : null;
  } while (token);
  return objects;
}

/** Permanently removes one object. Used only by scripts/sweep-orphan-pdfs.mts. */
export async function deletePdf(key: string): Promise<void> {
  const { client, base } = r2();
  const res = await client.fetch(`${base}/${key}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE returned ${res.status}`);
}
