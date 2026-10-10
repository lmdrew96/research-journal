import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getClerkUserId } from './_auth.js';
import { SONNET_MODEL } from './_models.js';
import { MAX_PDF_BYTES, newPdfKey, ownsPdfKey, pdfSize, presignPdfGet, presignPdfPut } from './_r2.js';

/**
 * Article PDFs. Every action is POST and needs a Clerk session:
 *
 *   ?action=upload-url  → { key, uploadUrl }  the browser PUTs the file to uploadUrl
 *   ?action=view-url    { key } → { url }     a 5-minute link to open the PDF
 *   ?action=extract     { key } → { metadata } Claude reads the PDF's bibliographic details
 *   ?action=find-sections { key | pdfUrl, question } → { sections, note }
 *                       Claude finds the 1–3 sections that bear on a research question
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

/**
 * One structured-output request in which Claude reads a whole PDF from a URL.
 * Sonnet, not Haiku: a 200K-context model is capped at 100 pages (Nae, Oct 7).
 */
async function readPdf<T>(
  pdfUrl: string,
  prompt: string,
  schema: object,
  effort: 'low' | 'medium',
  what: string,
): Promise<T> {
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
      model: SONNET_MODEL,
      max_tokens: 8000,
      output_config: { effort, format: { type: 'json_schema', schema } },
      fallbacks: 'default',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'url', url: pdfUrl } },
            { type: 'text', text: prompt },
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
  if (message.stop_reason === 'max_tokens') throw new Error(`The ${what} was cut off before it finished.`);

  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error(`Claude returned no ${what}.`);
  return JSON.parse(text) as T;
}

export const extractMetadata = (pdfUrl: string): Promise<ExtractedMetadata> =>
  readPdf<ExtractedMetadata>(pdfUrl, PROMPT, METADATA_SCHEMA, 'low', 'metadata');

// ── Sections that answer a question ─────────────────────────────────────────

export interface RelevantSection {
  /** The section heading as printed, or null for an unheaded passage. */
  heading: string | null;
  /** Page or page range as printed on the pages, e.g. "12" or "12–14". */
  pages: string | null;
  /** The first words of the section, verbatim, so it can be found by eye or search. */
  opening: string;
  /** One sentence on what this section offers the question. */
  why: string;
}

export interface SectionFinding {
  sections: RelevantSection[];
  /** Set when nothing bears on the question, or the text could not be used. */
  note: string | null;
}

const SECTIONS_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: nullable('string'),
          pages: nullable('string'),
          opening: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['heading', 'pages', 'opening', 'why'],
        additionalProperties: false,
      },
    },
    note: nullable('string'),
  },
  required: ['sections', 'note'],
  additionalProperties: false,
};

const sectionsPrompt = (question: string, why: string) => `A researcher wants to read only the part of this paper that bears on one of their research questions.

Research question: "${question}"
${why ? `Why it matters to them: ${why}\n` : ''}
Find the 1 to 3 sections or passages of THIS paper that most directly bear on the question — results and discussion that speak to it outrank background. For each:

- heading: the section heading exactly as printed (e.g. "4.2 Results"), or null if the passage has none.
- pages: the page number(s) as printed on the pages themselves (e.g. "12" or "12–14"), or null if the pages carry no numbers.
- opening: the first 8–15 words of that section or passage, copied verbatim, so the researcher can find it.
- why: one sentence on what this part says that matters for the question. State only what the paper says.

Order them most useful first. If no part of the paper bears on the question, return an empty list and say so in note. If this document is not the paper itself (a cover page, a landing page, a different work), return an empty list and say what it is in note. Otherwise note is null.`;

export const findSections = (pdfUrl: string, question: string, why: string): Promise<SectionFinding> =>
  readPdf<SectionFinding>(pdfUrl, sectionsPrompt(question, why), SECTIONS_SCHEMA, 'medium', 'section list');

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

    if (action === 'find-sections') {
      const { pdfUrl, question, why } = (req.body ?? {}) as { pdfUrl?: unknown; question?: unknown; why?: unknown };
      if (typeof question !== 'string' || !question.trim()) {
        return res.status(400).json({ error: 'A research question is required.' });
      }
      const questionWhy = typeof why === 'string' ? why : '';

      // An uploaded PDF is read through a fresh signed URL; otherwise the
      // article's free version, which must be a public https link.
      let url: string;
      if (key !== undefined) {
        if (!ownsPdfKey(userId, key)) return res.status(403).json({ error: 'Not your PDF' });
        const size = await pdfSize(key);
        if (size === null) return res.status(404).json({ error: 'The PDF is not in storage. Upload it again.' });
        if (size > MAX_PDF_BYTES) {
          return res.status(413).json({ error: 'This PDF is over 32MB, too large for Claude to read.' });
        }
        url = await presignPdfGet(key, 600);
      } else if (typeof pdfUrl === 'string' && /^https:\/\//i.test(pdfUrl)) {
        url = pdfUrl;
      } else {
        return res.status(400).json({ error: 'No full text to read: attach a PDF or find a free version first.' });
      }

      try {
        return res.status(200).json(await findSections(url, question.trim(), questionWhy));
      } catch (err) {
        // A free-version link is often a publisher's web page rather than a
        // PDF, and Claude rejects it as an unsupported file. That is an
        // expected miss, not a server fault.
        if (key === undefined && err instanceof Error && /\(400\)|\(404\)|\(403\)/.test(err.message)) {
          return res.status(422).json({
            error:
              "Couldn't read a full text: this paper's free version is a web page, not a PDF Claude can open. " +
              'Attach the PDF to use this, or go by the abstract (AI Summary, Ask the pile).',
          });
        }
        throw err;
      }
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
