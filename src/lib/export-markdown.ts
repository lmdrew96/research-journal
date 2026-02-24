import type { AppUserData, FlatQuestion, LibraryArticle, ResearchTheme } from '../types';

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

export function exportAllAsMarkdown(userData: AppUserData): string {
  const lines: string[] = [];
  lines.push('# Research Journal');
  lines.push('');
  lines.push(`Exported: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push('');

  const allQuestions = flattenThemes(userData.themes);

  for (const theme of userData.themes) {
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
      lines.push(`> ${ex.quote}`);
      if (ex.comment) {
        lines.push(`> — *${ex.comment}*`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
}

export function exportQuestionAsMarkdown(
  question: FlatQuestion,
  userData: AppUserData
): string {
  const lines: string[] = [];
  const qData = userData.questions[question.id];
  const allQuestions = flattenThemes(userData.themes);

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
    'key-source': 'Key Source',
  };
  return labels[status] || status;
}