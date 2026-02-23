import type { AppUserData, FlatQuestion } from '../types';
import { researchThemes, getAllQuestions, getQuestionId } from '../data/research-themes';

export function exportAllAsMarkdown(userData: AppUserData): string {
  const lines: string[] = [];
  lines.push('# ChaosLimba Research Journal');
  lines.push('');
  lines.push(`Exported: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push('');

  for (const theme of researchThemes) {
    lines.push(`## ${theme.icon} ${theme.theme}`);
    lines.push('');
    lines.push(`*${theme.description}*`);
    lines.push('');

    for (let qi = 0; qi < theme.questions.length; qi++) {
      const q = theme.questions[qi];
      const qId = getQuestionId(theme.id, qi);
      const qData = userData.questions[qId];

      lines.push(`### Q${qi + 1}: ${q.q}`);
      lines.push('');

      if (qData) {
        lines.push(`**Status:** ${formatStatus(qData.status)}`);
        lines.push('');
      }

      lines.push(`**Why it matters:** ${q.why}`);
      lines.push('');
      lines.push(`**ChaosLimba implication:** ${q.appImplication}`);
      lines.push('');

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

export function exportQuestionAsMarkdown(
  question: FlatQuestion,
  userData: AppUserData
): string {
  const lines: string[] = [];
  const qData = userData.questions[question.id];

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

  lines.push('## ChaosLimba Implication');
  lines.push('');
  lines.push(question.appImplication);
  lines.push('');

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
