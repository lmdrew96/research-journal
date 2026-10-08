import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, getActiveProjectOrNull, type McpContext, liveThemes } from '../store.js';
import type {
  JournalEntry,
  LibraryArticle,
  Project,
  ResearchQuestion,
  ResearchTheme,
  Study,
} from '../../../src/types/index.js';
import { ok, okEmpty } from '../envelope.js';
import {
  articleFields,
  entryFields,
  matchedGroups,
  matchedIds,
  matchFields,
  normalizeText,
  noteFields,
  queryTerms,
  questionFields,
  sourceFields,
  studyFields,
} from '../../_search-match.js';

const NO_PROJECTS_MSG =
  'No projects yet — create one in the app (Manage Projects) to get started.';

/**
 * Matching and the fields each kind searches live in api/_search-match.ts,
 * shared with the app's Search view — that is what keeps the two in parity.
 * This file only shapes what matched into the tool's response.
 */
interface Scored<T> {
  score: number;
  item: T;
}

const byScore = <T>(results: Scored<T>[]): T[] =>
  results.sort((a, b) => b.score - a.score).map((r) => r.item);

const containsAny = (text: string | null | undefined, terms: string[]): boolean => {
  if (!text) return false;
  const normalized = normalizeText(text);
  return terms.some((t) => normalized.includes(t));
};

interface MatchedExcerpt {
  id: string;
  quote: string;
  comment: string;
  matchedIn: ('quote' | 'comment')[];
}

interface SearchResult {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  status: string;
  matchedIn: string[];
  matchedExcerpts: MatchedExcerpt[];
}

function searchArticle(article: LibraryArticle, terms: string[]): Scored<SearchResult> | null {
  const hit = matchFields(articleFields(article), terms);
  if (!hit) return null;

  const excerptIds = matchedIds(hit, 'excerpts');
  const matchedExcerpts: MatchedExcerpt[] = article.excerpts
    .filter((e) => excerptIds.has(e.id))
    .map((e) => {
      const where: MatchedExcerpt['matchedIn'] = [];
      if (containsAny(e.quote, terms)) where.push('quote');
      if (containsAny(e.comment, terms)) where.push('comment');
      return { id: e.id, quote: e.quote, comment: e.comment, matchedIn: where };
    });

  return {
    score: hit.score,
    item: {
      id: article.id,
      title: article.title,
      authors: article.authors,
      year: article.year,
      status: article.status,
      matchedIn: matchedGroups(hit),
      matchedExcerpts,
    },
  };
}

interface QuestionResult {
  id: string;
  question: string;
  theme: string;
  matchedIn: string[];
  matchedNotes: { id: string; content: string }[];
  matchedSources: { id: string; text: string; notes: string }[];
}

/**
 * Questions, their notes and their user sources. As in the app, the question
 * itself, each note and each source match independently; the question is
 * returned when any of them does.
 */
function searchQuestion(
  question: ResearchQuestion,
  theme: ResearchTheme,
  project: Project,
  terms: string[],
): Scored<QuestionResult> | null {
  const hit = matchFields(questionFields(question), terms);
  const matchedFields: string[] = hit ? matchedGroups(hit) : [];
  let score = hit?.score ?? 0;

  const userData = project.questions[question.id];

  const matchedNotes: QuestionResult['matchedNotes'] = [];
  for (const n of userData?.notes ?? []) {
    const noteHit = matchFields(noteFields(n), terms);
    if (!noteHit) continue;
    score = Math.max(score, noteHit.score);
    matchedNotes.push({ id: n.id, content: n.content });
  }
  if (matchedNotes.length > 0) matchedFields.push('notes');

  const matchedSources: QuestionResult['matchedSources'] = [];
  for (const s of userData?.userSources ?? []) {
    const sourceHit = matchFields(sourceFields(s), terms);
    if (!sourceHit) continue;
    score = Math.max(score, sourceHit.score);
    matchedSources.push({ id: s.id, text: s.text, notes: s.notes });
  }
  if (matchedSources.length > 0) matchedFields.push('sources');

  if (matchedFields.length === 0) return null;

  return {
    score,
    item: {
      id: question.id,
      question: question.q,
      theme: theme.theme,
      matchedIn: matchedFields,
      matchedNotes,
      matchedSources,
    },
  };
}

interface EntryResult {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  themeName: string | null;
  matchedIn: string[];
}

function searchEntry(
  entry: JournalEntry,
  terms: string[],
  project: Project,
): Scored<EntryResult> | null {
  const hit = matchFields(entryFields(entry), terms);
  if (!hit) return null;

  return {
    score: hit.score,
    item: {
      id: entry.id,
      content: entry.content,
      tags: entry.tags,
      createdAt: entry.createdAt,
      themeName: liveThemes(project).find((t) => t.id === entry.themeId)?.theme ?? null,
      matchedIn: matchedGroups(hit),
    },
  };
}

interface MatchedHypothesis {
  id: string;
  statement: string;
  status: string;
}

interface MatchedDecision {
  id: string;
  decision: string;
  rationale: string | null;
  status: string;
  matchedIn: ('decision' | 'rationale' | 'alternativesRejected')[];
}

interface StudyResult {
  id: string;
  title: string;
  status: string;
  matchedIn: string[];
  matchedHypotheses: MatchedHypothesis[];
  matchedDecisions: MatchedDecision[];
}

function searchStudy(study: Study, terms: string[]): Scored<StudyResult> | null {
  const hit = matchFields(studyFields(study), terms);
  if (!hit) return null;

  const hypothesisIds = matchedIds(hit, 'hypotheses');
  const matchedHypotheses: MatchedHypothesis[] = study.hypotheses
    .filter((h) => hypothesisIds.has(h.id))
    .map((h) => ({ id: h.id, statement: h.statement, status: h.status }));

  const decisionIds = matchedIds(hit, 'decisions');
  const matchedDecisions: MatchedDecision[] = study.decisions
    .filter((d) => decisionIds.has(d.id))
    .map((d) => {
      const where: MatchedDecision['matchedIn'] = [];
      if (containsAny(d.decision, terms)) where.push('decision');
      if (containsAny(d.rationale, terms)) where.push('rationale');
      if (containsAny(d.alternativesRejected, terms)) where.push('alternativesRejected');
      return {
        id: d.id,
        decision: d.decision,
        rationale: d.rationale,
        status: d.status,
        matchedIn: where,
      };
    });

  return {
    score: hit.score,
    item: {
      id: study.id,
      title: study.title,
      status: study.status,
      matchedIn: matchedGroups(hit),
      matchedHypotheses,
      matchedDecisions,
    },
  };
}

export function registerSearchTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    'journal_search',
    {
      title: 'Search Library',
      description:
        'Full-text search across the active project: research questions (text, why, ' +
        'implication, tags) with their notes and user sources; article titles, tags, authors, ' +
        'journal, abstracts, notes and excerpt quotes/comments; journal entry content and tags; ' +
        'and study titles, descriptions, design prose, hypothesis statements and decision ' +
        'text/rationale. The query is split into words and every word must appear somewhere ' +
        'on an item (not necessarily in the same field). Matching ignores case, diacritics ' +
        '(limbă = limba) and hyphens. Results are grouped by kind — questions, articles, ' +
        'entries, studies — each ranked best match first (title > tags > abstract > notes) ' +
        'and listing which fields matched.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Search query string'),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ query }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProjectOrNull(data);
      if (!project) {
        return okEmpty(NO_PROJECTS_MSG, { questions: [], results: [], entries: [], studies: [] });
      }

      const terms = queryTerms(query);

      const scoredQuestions: Scored<QuestionResult>[] = [];
      for (const theme of liveThemes(project)) {
        for (const question of theme.questions) {
          const result = searchQuestion(question, theme, project, terms);
          if (result) scoredQuestions.push(result);
        }
      }
      const questions = byScore(scoredQuestions);

      const results = byScore(
        project.library
          .map((a) => searchArticle(a, terms))
          .filter((r): r is Scored<SearchResult> => r !== null),
      );

      const entries = byScore(
        project.journal
          .map((e) => searchEntry(e, terms, project))
          .filter((r): r is Scored<EntryResult> => r !== null),
      );

      const studies = byScore(
        (project.studies ?? [])
          .map((s) => searchStudy(s, terms))
          .filter((r): r is Scored<StudyResult> => r !== null),
      );

      if (
        questions.length === 0 &&
        results.length === 0 &&
        entries.length === 0 &&
        studies.length === 0
      ) {
        return ok(project, `No results found for "${query}".`, {
          questions: [],
          results: [],
          entries: [],
          studies: [],
        });
      }

      const parts: string[] = [];
      if (questions.length > 0) {
        parts.push(
          `${questions.length} question(s) matching "${query}":\n\n` +
            JSON.stringify(questions, null, 2),
        );
      }
      if (results.length > 0) {
        parts.push(
          `${results.length} article(s) matching "${query}":\n\n` +
            JSON.stringify(results, null, 2),
        );
      }
      if (entries.length > 0) {
        parts.push(
          `${entries.length} journal entr${entries.length === 1 ? 'y' : 'ies'} matching ` +
            `"${query}":\n\n${JSON.stringify(entries, null, 2)}`,
        );
      }
      if (studies.length > 0) {
        parts.push(
          `${studies.length} stud${studies.length === 1 ? 'y' : 'ies'} matching ` +
            `"${query}":\n\n${JSON.stringify(studies, null, 2)}`,
        );
      }

      return ok(project, parts.join('\n\n'), { questions, results, entries, studies });
    }
  );
}
