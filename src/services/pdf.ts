import type { ExtractedMetadata } from '../../api/pdf';

export type { ExtractedMetadata };

/** Matches the server's limit: the largest PDF Claude can read. */
export const MAX_PDF_BYTES = 32 * 1024 * 1024;

async function callPdfApi<T>(action: string, token: string | null, body: object = {}): Promise<T> {
  const res = await fetch(`/api/pdf?action=${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `PDF request failed (${res.status})`);
  return json as T;
}

/**
 * Uploads straight from the browser to R2 through a signed URL, so file size
 * isn't bounded by a serverless request body. Returns the stored key.
 */
export async function uploadPdf(file: File, token: string | null): Promise<string> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('That file is not a PDF.');
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('That PDF is over 32MB, the most Claude can read.');
  }
  const { key, uploadUrl } = await callPdfApi<{ key: string; uploadUrl: string }>('upload-url', token);
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status}). Nothing was saved — try again.`);
  return key;
}

export async function extractPdfMetadata(key: string, token: string | null): Promise<ExtractedMetadata> {
  const { metadata } = await callPdfApi<{ metadata: ExtractedMetadata }>('extract', token, { key });
  return metadata;
}

/**
 * Opens a stored PDF in a new tab. The tab is opened before the signed URL is
 * fetched, so a popup blocker sees it as a direct response to the click.
 */
export async function openPdf(key: string, token: string | null): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const { url } = await callPdfApi<{ url: string }>('view-url', token, { key });
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  } catch (err) {
    tab?.close();
    throw err;
  }
}
