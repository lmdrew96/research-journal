import { useMemo, useState, useCallback } from 'react';
import { useUserData } from './useUserData';
import {
  articleFields,
  entryFields,
  excerptAround,
  matchExcerpt,
  matchFields,
  noteFields,
  queryTerms,
  questionFields,
  sourceFields,
  studyFields,
} from '../../api/_search-match';

export interface SearchResult {
  type: 'question' | 'note' | 'journal' | 'source' | 'study' | 'article';
  questionId?: string;
  journalEntryId?: string;
  studyId?: string;
  articleId?: string;
  title: string;
  excerpt: string;
  themeColor?: string;
}

export function useSearch() {
  const [query, setQuery] = useState('');
  const { questions, journal, studies, library, getAllQuestions } = useUserData();

  const results = useMemo((): SearchResult[] => {
    const terms = queryTerms(query);
    if (terms.join(' ').length < 2) return [];

    // Each result carries its score so the list can be ranked across kinds.
    // The fields searched for each kind live in api/_search-match.ts, shared
    // with the MCP's journal_search, so both find the same things.
    const matches: (SearchResult & { score: number })[] = [];

    for (const question of getAllQuestions()) {
      const hit = matchFields(questionFields(question), terms);
      if (hit) {
        matches.push({
          type: 'question',
          questionId: question.id,
          title: question.q.slice(0, 80) + (question.q.length > 80 ? '...' : ''),
          excerpt: matchExcerpt(hit, terms),
          themeColor: question.themeColor,
          score: hit.score,
        });
      }

      const qData = questions[question.id];
      if (!qData) continue;

      for (const note of qData.notes) {
        const noteHit = matchFields(noteFields(note), terms);
        if (!noteHit) continue;
        matches.push({
          type: 'note',
          questionId: question.id,
          title: `Note on: ${question.q.slice(0, 60)}...`,
          excerpt: matchExcerpt(noteHit, terms),
          themeColor: question.themeColor,
          score: noteHit.score,
        });
      }

      for (const source of qData.userSources) {
        const sourceHit = matchFields(sourceFields(source), terms);
        if (!sourceHit) continue;
        matches.push({
          type: 'source',
          questionId: question.id,
          title: source.text,
          excerpt: matchExcerpt(sourceHit, terms),
          themeColor: question.themeColor,
          score: sourceHit.score,
        });
      }
    }

    for (const entry of journal) {
      const hit = matchFields(entryFields(entry), terms);
      if (!hit) continue;
      matches.push({
        type: 'journal',
        journalEntryId: entry.id,
        questionId: entry.questionId || undefined,
        title: `Journal: ${new Date(entry.createdAt).toLocaleDateString()}`,
        excerpt: excerptAround(entry.content, terms),
        score: hit.score,
      });
    }

    for (const study of studies) {
      const hit = matchFields(studyFields(study), terms);
      if (!hit) continue;
      matches.push({
        type: 'study',
        studyId: study.id,
        title: `Study: ${study.title}`,
        excerpt: matchExcerpt(hit, terms),
        score: hit.score,
      });
    }

    // The Library's own filter box stays the quick way to narrow a long list;
    // this is the project-wide search.
    for (const article of library) {
      const hit = matchFields(articleFields(article), terms);
      if (!hit) continue;
      matches.push({
        type: 'article',
        articleId: article.id,
        title: article.title,
        excerpt: matchExcerpt(hit, terms),
        score: hit.score,
      });
    }

    // Array.prototype.sort is stable, so equal scores keep their kind order.
    return matches.sort((a, b) => b.score - a.score);
  }, [query, questions, journal, studies, library, getAllQuestions]);

  const search = useCallback((q: string) => setQuery(q), []);

  return { query, search, results };
}
