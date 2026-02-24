import { useMemo, useState, useCallback } from 'react';
import { useUserData } from './useUserData';

export interface SearchResult {
  type: 'question' | 'note' | 'journal' | 'source';
  questionId?: string;
  journalEntryId?: string;
  title: string;
  excerpt: string;
  themeColor?: string;
}

export function useSearch() {
  const [query, setQuery] = useState('');
  const { data, getAllQuestions } = useUserData();

  const results = useMemo((): SearchResult[] => {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return [];

    const matches: SearchResult[] = [];
    const allQuestions = getAllQuestions();

    for (const question of allQuestions) {
      // Search question text
      if (
        question.q.toLowerCase().includes(q) ||
        question.why.toLowerCase().includes(q) ||
        question.appImplication.toLowerCase().includes(q) ||
        question.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        matches.push({
          type: 'question',
          questionId: question.id,
          title: question.q.slice(0, 80) + (question.q.length > 80 ? '...' : ''),
          excerpt: findExcerpt(
            [question.q, question.why, question.appImplication].join(' '),
            q
          ),
          themeColor: question.themeColor,
        });
      }

      // Search notes for this question
      const qData = data.questions[question.id];
      if (qData) {
        for (const note of qData.notes) {
          if (note.content.toLowerCase().includes(q)) {
            matches.push({
              type: 'note',
              questionId: question.id,
              title: `Note on: ${question.q.slice(0, 60)}...`,
              excerpt: findExcerpt(note.content, q),
              themeColor: question.themeColor,
            });
          }
        }

        // Search user sources
        for (const source of qData.userSources) {
          if (
            source.text.toLowerCase().includes(q) ||
            source.notes.toLowerCase().includes(q)
          ) {
            matches.push({
              type: 'source',
              questionId: question.id,
              title: source.text,
              excerpt: findExcerpt(source.notes || source.text, q),
              themeColor: question.themeColor,
            });
          }
        }
      }
    }

    // Search journal entries
    for (const entry of data.journal) {
      if (
        entry.content.toLowerCase().includes(q) ||
        entry.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        matches.push({
          type: 'journal',
          journalEntryId: entry.id,
          questionId: entry.questionId || undefined,
          title: `Journal: ${new Date(entry.createdAt).toLocaleDateString()}`,
          excerpt: findExcerpt(entry.content, q),
        });
      }
    }

    return matches;
  }, [query, data]);

  const search = useCallback((q: string) => setQuery(q), []);

  return { query, search, results };
}

function findExcerpt(text: string, query: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return text.slice(0, 120) + '...';
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt += '...';
  return excerpt;
}
