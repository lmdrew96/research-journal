import type { FlatQuestion } from '../types';

function buildPrompt(question: FlatQuestion): string {
  return `You are a research assistant helping a linguistics student find peer-reviewed papers. Given a research question, generate 4-5 concise academic search phrases that would find relevant papers on OpenAlex (an academic search engine).

Research question: "${question.q}"

Context — why this matters:
${question.why}

Application context:
${question.appImplication}

Tags: ${question.tags.join(', ')}
Research theme: ${question.themeLabel}

Rules:
- Each phrase should be 3-6 words, suitable as a search engine query
- Use precise academic terminology
- Cover different angles of the question (theoretical, empirical, applied)
- Do NOT use quotes or special operators
- Return ONLY the phrases, one per line, no numbering or bullets`;
}

export async function generateSearchPhrases(question: FlatQuestion): Promise<string[]> {
  const prompt = buildPrompt(question);

  const res = await fetch('/api/anthropic/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Invalid API key. Check your .env file.');
    }
    if (res.status === 429) {
      throw new Error('Rate limited. Wait a moment and try again.');
    }
    throw new Error(`Failed to generate search phrases (${res.status}).`);
  }

  const json = await res.json();
  const text: string = json.content?.[0]?.text || '';

  return text
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0 && line.length < 80);
}
