import type { LibraryArticle } from '../types';
import {
  lookupCrossrefByDoi,
  lookupOpenAlexByDoi,
  lookupSemanticScholarAbstract,
} from '../../api/_scholar';

interface LinkedQuestion {
  id: string;
  text: string;
}

function buildPrompt(article: LibraryArticle, linkedQuestions: LinkedQuestion[]): string {
  let prompt = `You are a research assistant helping a student analyze academic papers for their research.

Summarize this paper in 3-4 concise paragraphs, using ONLY the abstract and excerpts below as evidence:

1. **What the study found** — Key findings, methods, and conclusions, as the abstract states them
2. **Relevance to the researcher's work** — How this connects to the researcher's field
3. **Practical implications** — What this means for applied or design work

Paper: "${article.title}"`;

  if (article.authors.length > 0) {
    prompt += `\nAuthors: ${article.authors.join(', ')}`;
  }
  if (article.year) {
    prompt += `\nYear: ${article.year}`;
  }
  if (article.journal) {
    prompt += `\nJournal: ${article.journal}`;
  }
  if (article.abstract) {
    prompt += `\n\nAbstract:\n${article.abstract}`;
  }
  if (article.excerpts.length > 0) {
    prompt += `\n\nUser-highlighted excerpts:`;
    for (const e of article.excerpts) {
      prompt += `\n- "${e.quote}"`;
      if (e.comment) prompt += ` (note: ${e.comment})`;
    }
  }
  if (linkedQuestions.length > 0) {
    prompt += `\n\nResearch questions this paper is linked to:`;
    for (const q of linkedQuestions) {
      prompt += `\n- ${q.text}`;
    }
  }

  prompt += `\n\nReport only what the abstract and excerpts state. If they report null, mixed or contrary results, say so explicitly — never substitute the result the title or hypothesis would lead you to expect. Do not infer methods or findings that are not stated.`;
  prompt += `\n\nKeep the summary focused and useful. Write in plain academic English, not bullet points. Do not repeat the abstract verbatim.`;

  return prompt;
}

/**
 * The stored abstract, or one looked up by DOI (OpenAlex, Crossref, then
 * Semantic Scholar).
 * A lookup failure is treated as "no abstract" — the caller refuses to
 * summarize rather than guessing.
 */
async function findAbstract(article: LibraryArticle): Promise<string | null> {
  if (article.abstract?.trim()) return article.abstract;
  if (!article.doi) return null;
  const lookups: Array<(doi: string) => Promise<string | null>> = [
    async (doi) => (await lookupOpenAlexByDoi(doi))?.abstract ?? null,
    async (doi) => (await lookupCrossrefByDoi(doi))?.abstract ?? null,
    lookupSemanticScholarAbstract,
  ];
  for (const lookup of lookups) {
    try {
      const abstract = await lookup(article.doi);
      if (abstract?.trim()) return abstract;
    } catch (err) {
      console.warn('[aiSummary] abstract lookup failed:', err);
    }
  }
  return null;
}

export interface SummaryResult {
  summary: string;
  /** Set when the abstract was looked up for this summary, so it can be saved too. */
  foundAbstract: string | null;
}

/**
 * Summarizes from the abstract only. A title cannot support claims about
 * findings — a title-only summary once stated the opposite of a paper's null
 * result — so with no abstract this throws instead of generating.
 */
export async function generateSummary(
  article: LibraryArticle,
  linkedQuestions: LinkedQuestion[],
  token: string | null,
): Promise<SummaryResult> {
  const abstract = await findAbstract(article);
  if (!abstract) {
    throw new Error(
      'No abstract available — summary not generated. Add the abstract to this article to summarize it.',
    );
  }
  const prompt = buildPrompt({ ...article, abstract }, linkedQuestions);

  const res = await fetch('/api/anthropic/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      throw new Error('Your session has expired. Sign in again to use AI features.');
    }
    if (res.status === 429) {
      throw new Error('Rate limited. Wait a moment and try again.');
    }
    throw new Error(`Summary failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  const text = json.content?.[0]?.text;

  if (!text) {
    throw new Error('No summary returned from API.');
  }

  return { summary: text, foundAbstract: article.abstract?.trim() ? null : abstract };
}