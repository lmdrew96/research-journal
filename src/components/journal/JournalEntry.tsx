import { useState } from 'react';
import { tagPalette } from '../../lib/tag-color';
import type { JournalEntry as JournalEntryType } from '../../types';
import { useUserData } from '../../hooks/useUserData';
import MarkdownPreview from '../common/MarkdownPreview';
import NoteEditor from '../notes/NoteEditor';
import TagPill from '../common/TagPill';
import Icon from '../common/Icon';

type EntryUpdates = Partial<Pick<JournalEntryType, 'content' | 'tags' | 'questionId' | 'themeId'>>;

interface JournalEntryProps {
  entry: JournalEntryType;
  onUpdate: (entryId: string, updates: EntryUpdates) => void;
  onDelete: (entryId: string) => void;
  onNavigateToQuestion?: (questionId: string) => void;
}

export default function JournalEntryCard({
  entry,
  onUpdate,
  onDelete,
  onNavigateToQuestion,
}: JournalEntryProps) {
  const [editing, setEditing] = useState(false);
  const [tagsDraft, setTagsDraft] = useState(entry.tags.join(', '));
  const [themeDraft, setThemeDraft] = useState(entry.themeId ?? '');
  const [questionDraft, setQuestionDraft] = useState(entry.questionId ?? '');
  const { getQuestionById, getThemeById, themes, getAllQuestions } = useUserData();

  const date = new Date(entry.createdAt).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const linkedQuestion = entry.questionId
    ? getQuestionById(entry.questionId)
    : null;
  const linkedTheme = entry.themeId ? getThemeById(entry.themeId) : null;

  const startEdit = () => {
    setTagsDraft(entry.tags.join(', '));
    setThemeDraft(entry.themeId ?? '');
    setQuestionDraft(entry.questionId ?? '');
    setEditing(true);
  };

  if (editing) {
    const parsedTags = tagsDraft
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const tagsChanged =
      parsedTags.length !== entry.tags.length ||
      parsedTags.some((t, i) => t !== entry.tags[i]);

    return (
      <div className="journal-entry-card">
        {/* Refiling an entry used to mean deleting and rewriting it — the MCP
            could relink, the app could only edit content and tags. */}
        <div className="journal-editor-links" style={{ marginBottom: 10 }}>
          <select
            aria-label="Link entry to a theme"
            value={themeDraft}
            onChange={(e) => setThemeDraft(e.target.value)}
          >
            <option value="">No theme</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.theme}
              </option>
            ))}
          </select>
          <select
            aria-label="Link entry to a question"
            value={questionDraft}
            onChange={(e) => setQuestionDraft(e.target.value)}
          >
            <option value="">No question</option>
            {getAllQuestions().map((q) => (
              <option key={q.id} value={q.id}>
                {q.q.length > 60 ? `${q.q.slice(0, 60)}...` : q.q}
              </option>
            ))}
          </select>
          <input
            aria-label="Tags, comma-separated"
            type="text"
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            placeholder="Tags (comma-separated)"
          />
        </div>
        <NoteEditor
          questionId={'journal-edit-' + entry.id}
          initialContent={entry.content}
          label="Edit Entry"
          onSave={(content) => {
            const updates: EntryUpdates = { content };
            if (tagsChanged) updates.tags = parsedTags;
            if ((themeDraft || null) !== entry.themeId) updates.themeId = themeDraft || null;
            if ((questionDraft || null) !== entry.questionId) updates.questionId = questionDraft || null;
            onUpdate(entry.id, updates);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="journal-entry-card">
      <div className="journal-entry-header">
        <span className="journal-entry-date">{date}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-sm btn-labelled"
            onClick={startEdit}
            aria-label="Edit journal entry"
          >
            <Icon name="edit" size={13} />
            Edit
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger btn-labelled"
            onClick={() => onDelete(entry.id)}
            aria-label="Delete journal entry"
          >
            <Icon name="trash" size={13} />
            Delete
          </button>
        </div>
      </div>

      {(linkedQuestion || linkedTheme || entry.tags.length > 0) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {linkedTheme && (
            <span
              className="tag-pill"
              style={(({ lightFg, darkFg, lightBg, darkBg }) => ({
                '--tag-fg-light': lightFg,
                '--tag-fg-dark': darkFg,
                '--tag-bg-light': lightBg,
                '--tag-bg-dark': darkBg,
              }))(tagPalette(linkedTheme.color)) as React.CSSProperties}
            >
              {/* The icon field holds an icon NAME. It was rendered as text here,
                  left over from when theme icons were emoji — "orbit Graded
                  Categories". */}
              <Icon name={linkedTheme.icon} size={12} /> {linkedTheme.theme}
            </span>
          )}
          {linkedQuestion && (
            <button
              className="journal-entry-link"
              style={(({ lightFg, darkFg, lightBg, darkBg }) => ({
                '--tag-fg-light': lightFg,
                '--tag-fg-dark': darkFg,
                '--tag-bg-light': lightBg,
                '--tag-bg-dark': darkBg,
              }))(tagPalette(linkedQuestion.themeColor)) as React.CSSProperties}
              onClick={() => onNavigateToQuestion?.(linkedQuestion.id)}
            >
              {linkedQuestion.q.slice(0, 50)}...
            </button>
          )}
          {entry.tags.map((tag) => (
            <TagPill key={tag} tag={tag} />
          ))}
        </div>
      )}

      <div className="note-card-content">
        <MarkdownPreview content={entry.content} />
      </div>
    </div>
  );
}
