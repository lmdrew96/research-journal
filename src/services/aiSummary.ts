import type { LibraryArticle } from '../types';

interface LinkedQuestion {
  id: string;
  text: string;
}

function buildPrompt(article: LibraryArticle, linkedQuestions: LinkedQuestion[]): string {
  let prompt = `You are a research assistant helping a linguistics student analyze academic papers for their research on ChaosLimbă, an English-to-Romanian CALL (Computer-Assisted Language Learning) app grounded in interlanguage theory.

Summarize this paper in 3-4 concise paragraphs:

1. **What the study found** — Key findings, methods, and conclusions
2. **Relevance to the researcher's work** — How this connects to second language acquisition, CALL, or cognitive science
3. **Implications for ChaosLimbă** — What this means for designing an adaptive language learning app

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

  prompt += `\n\nKeep the summary focused and useful. Write in plain academic English, not bullet points. Do not repeat the abstract verbatim.`;

  return prompt;
}

export async function generateSummary(
  article: LibraryArticle,
  linkedQuestions: LinkedQuestion[]
): Promise<string> {
  const prompt = buildPrompt(article, linkedQuestions);

  const res = await fetch('/api/anthropic/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      throw new Error('Invalid API key. Check your .env file.');
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

  return text;
}