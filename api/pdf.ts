import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getClerkUserId } from './_auth.js';
import { MAX_PDF_BYTES, newPdfKey, ownsPdfKey, pdfSize, presignPdfGet, presignPdfPut } from './_r2.js';

/**
 * Article PDFs. Every action is POST and needs a Clerk session:
 *
 *   ?action=upload-url  → { key, uploadUrl }  the browser PUTs the file to uploadUrl
 *   ?action=view-url    { key } → { url }     a 5-minute link to open the PDF
 *   ?action=extract     { key } → { metadata } Claude reads the PDF's bibliographic details
 *
 * Nothing here writes to the library: the client shows the extracted metadata
 * in the Add-article form and saves only what Nae confirms.
 */

export interface ExtractedMetadata {
  title: string | null;
  authors: string[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  abstract: string | null;
}

const nullable = (type: 'string' | 'integer') => ({ anyOf: [{ type }, { type: 'null' }] });

const METADATA_SCHEMA = {
  type: 'object',
  properties: {
    title: nullable('string'),
    authors: { type: 'array', items: { type: 'string' } },
    year: nullable('integer'),
    journal: nullable('string'),
    doi: nullable('string'),
    abstract: nullable('string'),
  },
  required: ['title', 'authors', 'year', 'journal', 'doi', 'abstract'],
  additionalProperties: false,
};

const PROMPT = `This PDF is an academic work. Extract the bibliographic details of THIS work itself — not of anything it cites.

- title: the work's full title, as printed.
- authors: every author, in order, as "Given Family" (e.g. "Lia Kvavilashvili"). Empty if none are printed.
- year: the publication year of this work.
- journal: the journal, book or proceedings it appears in.
- doi: this work's DOI only — bare, without "https://doi.org/". Never a DOI from the reference list.
- abstract: the abstract copied exactly as printed, or null if the work has none.

Use null for anything not printed in the document. Do not guess or fill in from memory.`;

export async function extractMetadata(pdfUrl: string): Promise<ExtractedMetadata> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      // Sonnet, not Haiku: Claude reads the whole PDF from the URL, and a
      // 200K-context model is capped at 100 pages (Nae, Oct 7).
      model: 'claude-sonnet-5-5',
      max_tokens: 8000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: METADATA_SCHEMA } },
      fallbacks: 'default',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'url', url: pdfUrl } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Claude could not read the PDF (${response.status}): ${detail.slice(0, 300)}`);
  }

  const message = (await response.json()) as {
    stop_reason: string;
    content: Array<{ type: string; text?: string }>;
  };
  if (message.stop_reason === 'refusal') throw new Error('Claude declined to read this PDF.');
  if (message.stop_reason === 'max_tokens') throw new Error('The metadata was cut off before it finished.');

  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Claude returned no metadata.');
  return JSON.parse(text) as ExtractedMetadata;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await getClerkUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Sign in to manage PDFs.' });
  }

  const action = req.query.action;
  const key: unknown = (req.body ?? {}).key;

  try {
    if (action === 'upload-url') {
      const newKey = newPdfKey(userId);
      return res.status(200).json({ key: newKey, uploadUrl: await presignPdfPut(newKey) });
    }

    if (action !== 'view-url' && action !== 'extract') {
      return res.status(404).json({ error: 'Unknown action' });
    }
    if (!ownsPdfKey(userId, key)) {
      return res.status(403).json({ error: 'Not your PDF' });
    }

    if (action === 'view-url') {
      return res.status(200).json({ url: await presignPdfGet(key, 300) });
    }

    const size = await pdfSize(key);
    if (size === null) {
      return res.status(404).json({ error: 'The PDF is not in storage. Upload it again.' });
    }
    if (size > MAX_PDF_BYTES) {
      return res.status(413).json({ error: 'This PDF is over 32MB, too large for Claude to read.' });
    }
    const metadata = await extractMetadata(await presignPdfGet(key, 600));
    return res.status(200).json({ metadata });
  } catch (err) {
    console.error(`[api/pdf] ${String(action)} failed:`, err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
