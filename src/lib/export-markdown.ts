import type {
  Project,
  FlatQuestion,
  LibraryArticle,
  ResearchTheme,
  Study,
  Hypothesis,
  Decision,
  DesignItem,
} from '../types';
import { buildChains } from './revision-chains';
import { studyStatusLabels } from '../data/study-status';
import {
  DESIGN_FIELDS_BY_KIND,
  DESIGN_FIELD_LABELS,
  DESIGN_ITEM_KINDS,
  DESIGN_SECTION_LABELS,
  SINGLETON_KINDS,
  chainsOfKind,
  currentHypothesisId,
  linksFrom,
  procedureTotal,
} from '../../api/_design-items';

/**
 * Soft-deleted themes never appear in an export. Filtered here rather than at
 * each call site so no future caller can leak them into a document.
 */
const liveThemes = (p: Project): ResearchTheme[] => p.themes.filter((t) => !t.deletedAt);

function flattenThemes(themes: ResearchTheme[]): FlatQuestion[] {
  return themes.flatMap((theme) =>
    theme.questions.map((q, i) => ({
      ...q,
      themeId: theme.id,
      themeLabel: theme.theme,
      themeColor: theme.color,
      questionIndex: i,
    }))
  );
}

export function exportAllAsMarkdown(userData: Project): string {
  const lines: string[] = [];
  lines.push('# ThreadNotes');
  lines.push('');
  lines.push(`Exported: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push('');

  const allQuestions = flattenThemes(liveThemes(userData));

  for (const theme of liveThemes(userData)) {
    lines.push(`## ${theme.theme}`);
    lines.push('');
    lines.push(`*${theme.description}*`);
    lines.push('');

    for (let qi = 0; qi < theme.questions.length; qi++) {
      const q = theme.questions[qi];
      const qId = q.id;
      const qData = userData.questions[qId];

      lines.push(`### Q${qi + 1}: ${q.q}`);
      lines.push('');

      if (qData) {
        lines.push(`**Status:** ${formatStatus(qData.status)}`);
        lines.push('');
      }

      lines.push(`**Why it matters:** ${q.why}`);
      lines.push('');
      lines.push(`**Practical implication:** ${q.appImplication}`);
      lines.push('');

      // Suggested search phrases
      if (qData?.searchPhrases?.length) {
        lines.push(`**Suggested searches:** ${qData.searchPhrases.join(' · ')}`);
        lines.push('');
      }

      lines.push('**Sources:**');
      for (const s of q.sources) {
        if (s.doi) {
          lines.push(`- ${s.text} ([DOI](https://doi.org/${s.doi}))`);
        } else {
          lines.push(`- ${s.text}`);
        }
      }
      if (qData?.userSources.length) {
        lines.push('');
        lines.push('**User-added sources:**');
        for (const s of qData.userSources) {
          const link = s.doi ? `([DOI](https://doi.org/${s.doi}))` : s.url ? `([Link](${s.url}))` : '';
          lines.push(`- ${s.text} ${link}`.trim());
          if (s.notes) lines.push(`  - *${s.notes}*`);
        }
      }
      lines.push('');

      // Linked articles
      const linkedArticles = userData.library.filter((a) => a.linkedQuestions.includes(qId));
      if (linkedArticles.length > 0) {
        lines.push('**Linked Articles:**');
        for (const a of linkedArticles) {
          const meta = [a.authors.slice(0, 3).join(', '), a.year ? String(a.year) : null, a.journal].filter(Boolean).join(', ');
          lines.push(`- ${a.title}${meta ? ` (${meta})` : ''}`);
        }
        lines.push('');
      }

      if (qData?.notes.length) {
        lines.push('**Research Notes:**');
        lines.push('');
        for (const note of qData.notes) {
          const date = new Date(note.createdAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
          });
          lines.push(`#### ${date}`);
          lines.push('');
          lines.push(note.content);
          lines.push('');
        }
      }

      lines.push('---');
      lines.push('');
    }
  }

  // Library
  if (userData.library.length > 0) {
    lines.push('## Library');
    lines.push('');
    lines.push(`${userData.library.length} articles saved.`);
    lines.push('');
    for (const article of userData.library) {
      appendArticleMarkdown(lines, article, allQuestions);
    }
  }

  // Studies. Placed after the library because a study is the thing the reading
  // was for — it reads better last, and the export doubles as the backup, so
  // the irreplaceable part should not be buried mid-document.
  const studies = userData.studies ?? [];
  if (studies.length > 0) {
    lines.push('## Studies');
    lines.push('');
    lines.push(`${studies.length} stud${studies.length === 1 ? 'y' : 'ies'}.`);
    lines.push('');
    for (const study of studies) {
      appendStudyMarkdown(lines, study, allQuestions, userData);
    }
  }

  // Journal
  if (userData.journal.length > 0) {
    lines.push('## Journal Entries');
    lines.push('');
    for (const entry of userData.journal) {
      const date = new Date(entry.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      lines.push(`### ${date}`);
      if (entry.tags.length) {
        lines.push(`*Tags: ${entry.tags.join(', ')}*`);
      }
      lines.push('');
      lines.push(entry.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function appendArticleMarkdown(
  lines: string[],
  article: LibraryArticle,
  allQuestions: FlatQuestion[]
): void {
  lines.push(`### ${article.title}`);
  lines.push('');

  const meta: string[] = [];
  if (article.authors.length > 0) meta.push(article.authors.join(', '));
  if (article.year) meta.push(String(article.year));
  if (article.journal) meta.push(article.journal);
  if (meta.length > 0) lines.push(`*${meta.join(' · ')}*`);

  const badges: string[] = [formatArticleStatus(article.status)];
  if (article.keySource) badges.push('Key Source');
  if (article.isOpenAccess) badges.push('Open Access');
  lines.push(`**Status:** ${badges.join(' · ')}`);

  if (article.doi) {
    lines.push(`**DOI:** [${article.doi}](https://doi.org/${article.doi})`);
  }
  lines.push('');

  // Linked questions
  if (article.linkedQuestions.length > 0) {
    lines.push('**Linked Questions:**');
    for (const qId of article.linkedQuestions) {
      const q = allQuestions.find((q) => q.id === qId);
      if (q) lines.push(`- ${q.q}`);
    }
    lines.push('');
  }

  // Abstract
  if (article.abstract) {
    lines.push('**Abstract:**');
    lines.push(article.abstract);
    lines.push('');
  }

  // AI Summary
  if (article.aiSummary) {
    lines.push('**AI Summary:**');
    lines.push(article.aiSummary);
    lines.push('');
  }

  // Notes
  if (article.notes) {
    lines.push('**Notes:**');
    lines.push(article.notes);
    lines.push('');
  }

  // Excerpts
  if (article.excerpts.length > 0) {
    lines.push(`**Excerpts (${article.excerpts.length}):**`);
    lines.push('');
    for (const ex of article.excerpts) {
      lines.push(`> ${ex.quote}${ex.page !== undefined ? ` (p. ${ex.page})` : ''}`);
      if (ex.comment) {
        lines.push(`> — *${ex.comment}*`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
}

/**
 * A study, including every superseded version and the reason for each step.
 *
 * The revision chains are the point of the section. A hypothesis that took five
 * rewrites to land cannot be reconstructed from the current statement alone, and
 * the export is the backup story — so history goes in the document rather than
 * behind a disclosure the way the detail view renders it.
 */
function appendStudyMarkdown(
  lines: string[],
  study: Study,
  allQuestions: FlatQuestion[],
  project: Project,
): void {
  const questionText = (id: string | null): string | null =>
    id ? allQuestions.find((q) => q.id === id)?.q ?? null : null;

  lines.push(`### ${study.title}`);
  lines.push('');
  lines.push(`**Status:** ${studyStatusLabels[study.status] ?? study.status}`);
  lines.push('');

  if (study.description) {
    lines.push(study.description);
    lines.push('');
  }

  if (study.linkedQuestions.length > 0) {
    lines.push('**Linked Questions:**');
    for (const qId of study.linkedQuestions) {
      const q = questionText(qId);
      if (q) lines.push(`- ${q}`);
    }
    lines.push('');
  }

  appendDesignMarkdown(lines, study, project);

  if (study.design) {
    lines.push('**Original design notes (archived):**');
    lines.push('');
    lines.push(study.design);
    lines.push('');
  }

  // Hypotheses. Retired chains still export — a hypothesis you abandoned is
  // part of the record of what you thought.
  const hypothesisChains = buildChains(study.hypotheses);
  if (hypothesisChains.length > 0) {
    lines.push('**Hypotheses:**');
    lines.push('');
    for (const { current, history } of hypothesisChains) {
      const label = current.label ? `${current.label}. ` : '';
      const retired = current.status === 'retired' ? ' *(retired)*' : '';
      lines.push(`- ${label}${current.statement}${retired}`);

      const q = questionText(current.questionId);
      if (q) lines.push(`  - *Operationalizes:* ${q}`);

      appendRevisionHistory(
        lines,
        history,
        (h: Hypothesis) => h.statement,
        // supersedeHypothesis files the rationale against the NEW hypothesis,
        // not the one being replaced, and records it as a decision pointing at
        // that new row — so the reason for stepping out of a version reads off
        // the version after it. Same rule the detail view renders by.
        (_h, next) =>
          next
            ? study.decisions.find((d) => d.hypothesisId === next.id && d.rationale)?.rationale ??
              null
            : null,
      );
    }
    lines.push('');
  }

  // Decisions, grouped by whether they are still open. "What have I not decided
  // yet" is the question this section exists to answer.
  const decisionChains = buildChains(study.decisions);
  const open = decisionChains.filter((c) => c.current.status === 'open');
  const settled = decisionChains.filter((c) => c.current.status !== 'open');

  for (const [heading, group] of [
    ['Open Decisions', open],
    ['Settled Decisions', settled],
  ] as const) {
    if (group.length === 0) continue;
    lines.push(`**${heading}:**`);
    lines.push('');
    for (const { current, history } of group) {
      lines.push(`- ${current.decision}`);
      if (current.rationale) lines.push(`  - *Why:* ${current.rationale}`);
      if (current.alternativesRejected) {
        lines.push(`  - *Rejected:* ${current.alternativesRejected}`);
      }
      const q = questionText(
        study.hypotheses.find((h) => h.id === current.hypothesisId)?.questionId ?? null,
      );
      if (q) lines.push(`  - *Affects:* ${q}`);

      // A superseding decision carries the reason it replaced the one before
      // it, so a step's rationale reads off the next row.
      appendRevisionHistory(
        lines,
        history,
        (d: Decision) => d.decision,
        (_d, next) => next?.rationale ?? null,
      );
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
}

/**
 * Renders versions 1..n-1 of a chain beneath its current row.
 *
 * Nothing is emitted for a chain that was never superseded, which is the
 * common case — a single-version chain has no history worth a heading.
 */
/**
 * The structured design, section by section, current versions with their
 * history and links — the export is the backup, so nothing is left behind a
 * disclosure.
 */
function appendDesignMarkdown(lines: string[], study: Study, project: Project): void {
  const sections = DESIGN_ITEM_KINDS.filter((k) => chainsOfKind(study, k).length > 0);
  if (sections.length === 0) return;

  const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();
  const summary = (item: DesignItem): string =>
    DESIGN_FIELDS_BY_KIND[item.kind]
      .filter((k) => item.fields[k] !== undefined)
      .map((k) => (k === 'name' ? String(item.fields.name) : `${DESIGN_FIELD_LABELS[k]}: ${oneLine(String(item.fields[k]))}`))
      .join(' · ');
  const linkLines = (item: DesignItem): string[] => {
    const out: string[] = [];
    const articles = linksFrom(project, item.id, 'article')
      .map((c) => project.library.find((a) => a.id === c.toId)?.title)
      .filter(Boolean);
    if (articles.length) out.push(`  - *Sources:* ${articles.join('; ')}`);
    const hyps = linksFrom(project, item.id, 'hypothesis')
      .map((c) => study.hypotheses.find((h) => h.id === currentHypothesisId(study, c.toId)))
      .filter((h): h is Hypothesis => !!h)
      .map((h) => h.label ?? h.statement);
    if (hyps.length) out.push(`  - *Tests:* ${hyps.join(', ')}`);
    const measures = linksFrom(project, item.id, 'design_item')
      .map((c) => study.designItems?.find((d) => d.id === c.toId)?.fields.name)
      .filter(Boolean);
    if (measures.length) out.push(`  - *Measure:* ${measures.join(', ')}`);
    return out;
  };

  lines.push('**Design:**');
  lines.push('');
  for (const kind of sections) {
    const chains = chainsOfKind(study, kind);
    let heading = `*${DESIGN_SECTION_LABELS[kind]}*`;
    if (kind === 'step') {
      const { minutes } = procedureTotal(study);
      heading += ` — ${minutes} min` + (study.targetSessionMinutes ? ` of a ${study.targetSessionMinutes}-min target` : '');
    }
    lines.push(heading);
    lines.push('');
    // A one-item prose section reads better as a paragraph than a bullet.
    if (SINGLETON_KINDS.has(kind) && kind !== 'participants' && chains[0].history.length === 1) {
      const item = chains[0].current;
      if (item.fields.text) lines.push(item.fields.text);
      lines.push(...linkLines(item).map((l) => l.replace(/^ {2}- /, '- ')));
      lines.push('');
      continue;
    }
    chains.forEach(({ current, history }, i) => {
      lines.push(`${kind === 'step' ? `${i + 1}.` : '-'} ${summary(current)}`);
      lines.push(...linkLines(current));
      appendRevisionHistory(lines, history, summary, (_d, next) =>
        next ? study.decisions.find((d) => d.designItemId === next.id && d.rationale)?.rationale ?? null : null,
      );
    });
    lines.push('');
  }
}

function appendRevisionHistory<T>(
  lines: string[],
  history: T[],
  text: (item: T) => string,
  rationaleForStep: (item: T, next: T | undefined) => string | null,
): void {
  if (history.length < 2) return;

  lines.push(`  - *History — ${history.length - 1} earlier version${history.length === 2 ? '' : 's'}:*`);
  for (let i = 0; i < history.length - 1; i++) {
    lines.push(`    - v${i + 1}: ${text(history[i])}`);
    const rationale = rationaleForStep(history[i], history[i + 1]);
    if (rationale) lines.push(`      - *Changed because:* ${rationale}`);
  }
  lines.push(`    - v${history.length}: ${text(history[history.length - 1])} *(current)*`);
}

export function exportQuestionAsMarkdown(
  question: FlatQuestion,
  userData: Project
): string {
  const lines: string[] = [];
  const qData = userData.questions[question.id];
  const allQuestions = flattenThemes(liveThemes(userData));

  lines.push(`# ${question.q}`);
  lines.push('');
  lines.push(`*Theme: ${question.themeLabel}*`);
  lines.push(`*Tags: ${question.tags.join(', ')}*`);
  if (qData) {
    lines.push(`*Status: ${formatStatus(qData.status)}*`);
  }
  lines.push('');

  lines.push('## Why This Matters');
  lines.push('');
  lines.push(question.why);
  lines.push('');

  lines.push('## Practical Implication');
  lines.push('');
  lines.push(question.appImplication);
  lines.push('');

  // Suggested search phrases
  if (qData?.searchPhrases?.length) {
    lines.push('## Suggested Searches');
    lines.push('');
    lines.push(qData.searchPhrases.map((p) => `\`${p}\``).join(' · '));
    lines.push('');
  }

  lines.push('## Sources');
  lines.push('');
  for (const s of question.sources) {
    if (s.doi) {
      lines.push(`- ${s.text} ([DOI](https://doi.org/${s.doi}))`);
    } else {
      lines.push(`- ${s.text}`);
    }
  }
  if (qData?.userSources.length) {
    lines.push('');
    lines.push('### Added During Research');
    for (const s of qData.userSources) {
      const link = s.doi ? `([DOI](https://doi.org/${s.doi}))` : s.url ? `([Link](${s.url}))` : '';
      lines.push(`- ${s.text} ${link}`.trim());
      if (s.notes) lines.push(`  - *${s.notes}*`);
    }
  }
  lines.push('');

  // Linked articles (full detail)
  const linkedArticles = userData.library.filter((a) => a.linkedQuestions.includes(question.id));
  if (linkedArticles.length > 0) {
    lines.push('## Linked Articles');
    lines.push('');
    for (const article of linkedArticles) {
      appendArticleMarkdown(lines, article, allQuestions);
    }
  }

  if (qData?.notes.length) {
    lines.push('## Research Notes');
    lines.push('');
    for (const note of qData.notes) {
      const date = new Date(note.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      lines.push(`### ${date}`);
      lines.push('');
      lines.push(note.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  return lines.join('\n');
}

function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    not_started: 'Not Started',
    exploring: 'Exploring',
    has_findings: 'Has Findings',
    concluded: 'Concluded',
  };
  return labels[status] || status;
}

function formatArticleStatus(status: string): string {
  const labels: Record<string, string> = {
    'to-read': 'To Read',
    reading: 'Reading',
    done: 'Done',
  };
  return labels[status] || status;
}