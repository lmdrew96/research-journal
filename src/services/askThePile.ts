import type { FlatQuestion, LibraryArticle } from '../types';

/**
 * "Ask the pile": a short synthesis of what the papers linked to a question say
 * about it, built from their abstracts, AI summaries and Nae's excerpts — never
 * from full texts, and never from a title alone.
 *
 * Sonnet rather than the Haiku the other AI features use: holding every claim
 * to the right paper across a dozen sources is where a smaller model slips, and
 * a misattributed claim here would mislead the research quietly.
 */

/** "Barzykowski 2021" — the citation key the synthesis uses for a paper. */
export function citationKey(article: LibraryArticle): string {
  const [first, second] = article.authors;
  // No authors: the opening words of the title stand in, as in APA.
  const lead = first ? lastName(first) : article.title.split(/\s+/).slice(0, 3).join(' ');
  const rest = article.authors.length > 2 ? ' et al.' : second ? ` & ${lastName(second)}` : '';
  return `${lead}${rest} ${article.year ?? 'n.d.'}`;
}

/** Surname from "First Last", "F. Last" or "Last, First". */
const lastName = (name: string): string =>
  (name.includes(',') ? name.split(',')[0] : name.trim().split(/\s+/).pop() ?? name).trim();

/** Whether a paper carries anything beyond its title to synthesize from. */
export const hasMaterial = (a: LibraryArticle): boolean =>
  !!a.abstract?.trim() || !!a.aiSummary?.trim() || a.excerpts.length > 0;

function describePaper(a: LibraryArticle, key: string): string {
  let block = `### [${key}] ${a.title}`;
  if (a.authors.length > 0) block += `\nAuthors: ${a.authors.join(', ')}`;
  if (a.journal) block += `\nVenue: ${a.journal}`;
  if (a.abstract?.trim()) block += `\n\nAbstract:\n${a.abstract.trim()}`;
  if (a.aiSummary?.trim()) {
    block += `\n\nEarlier AI summary (written from the abstract — secondary, prefer the abstract where they differ):\n${a.aiSummary.trim()}`;
  }
  if (a.excerpts.length > 0) {
    block += '\n\nPassages the researcher highlighted:';
    for (const e of a.excerpts) {
      block += `\n- "${e.quote}"${e.page ? ` (p. ${e.page})` : ''}`;
      if (e.comment) block += ` — researcher's note: ${e.comment}`;
    }
  }
  return block;
}

function buildPrompt(question: FlatQuestion, papers: { article: LibraryArticle; key: string }[]): string {
  return `You are helping a linguistics researcher decide what to read. Below is one of their research questions and the papers they have linked to it. For each paper you have only its abstract, possibly an earlier AI summary, and passages the researcher highlighted — not the full text.

Research question: "${question.q}"

Why it matters to them: ${question.why}

Papers:

${papers.map(({ article, key }) => describePaper(article, key)).join('\n\n')}

Write a short synthesis in markdown, in exactly this structure:

**Answer so far** — 2–4 sentences: what these papers, taken together, suggest about the question. Hedge where the evidence is thin or mixed.

**What the papers say** — a bulleted list of specific claims. Every bullet ends with the key of the paper it comes from, in square brackets, e.g. [${papers[0]?.key ?? 'Author 2020'}]. Use only the keys given above. A claim drawn from two papers cites both.

**Not relevant to this question** — the keys of papers that don't bear on the question, each with a few words on why. Write "None." if every paper bears on it.

**Read next** — 1 to 3 papers, by key, each with one sentence on what reading it in full would settle that the abstract can't.

Rules:
- Use only what the material above states. Never add findings, methods or numbers it doesn't contain, and never infer a result from a title.
- If papers disagree, or report null or mixed results, say so plainly rather than smoothing it over.
- Keep the whole response under 350 words.`;
}

export interface PileSynthesis {
  text: string;
  /** Papers that went into it, and linked papers left out for having no material. */
  used: LibraryArticle[];
  skipped: LibraryArticle[];
}

export async function askThePile(
  question: FlatQuestion,
  linked: LibraryArticle[],
  token: string | null,
): Promise<PileSynthesis> {
  const used = linked.filter(hasMaterial);
  const skipped = linked.filter((a) => !hasMaterial(a));
  if (used.length === 0) {
    throw new Error(
      'None of the linked papers has an abstract, AI summary or excerpt yet, so there is nothing to synthesize. Add an abstract to one of them first.',
    );
  }

  // Two papers by the same first author in the same year would share a key;
  // a letter suffix keeps every citation pointing at exactly one paper.
  const seen = new Map<string, number>();
  const papers = used.map((article) => {
    const base = citationKey(article);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { article, key: n === 1 ? base : `${base}${String.fromCharCode(96 + n)}` };
  });

  const res = await fetch('/api/anthropic/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 4000,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: buildPrompt(question, papers) }],
    }),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('Your session has expired. Sign in again to use AI features.');
    if (res.status === 429) throw new Error('Rate limited. Wait a moment and try again.');
    throw new Error(`Synthesis failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as {
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  };
  if (json.stop_reason === 'refusal') throw new Error('Claude declined to synthesize these papers.');
  if (json.stop_reason === 'max_tokens') throw new Error('The synthesis was cut off before it finished. Try again.');
  const text = json.content?.find((b) => b.type === 'text')?.text?.trim();
  if (!text) throw new Error('No synthesis returned from the API.');

  return { text, used, skipped };
}
