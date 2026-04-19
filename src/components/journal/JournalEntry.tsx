import { useState } from 'react';
import type { JournalEntry as JournalEntryType } from '../../types';
import { useUserData } from '../../hooks/useUserData';
import MarkdownPreview from '../common/MarkdownPreview';
import NoteEditor from '../notes/NoteEditor';
import TagPill from '../common/TagPill';

interface JournalEntryProps {
  entry: JournalEntryType;
  onUpdate: (entryId: string, updates: { content?: string; tags?: string[] }) => void;
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
  const { getQuestionById, getThemeById } = useUserData();

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
        <div className="journal-editor-links" style={{ marginBottom: 10 }}>
          <input
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
            const updates: { content?: string; tags?: string[] } = { content };
            if (tagsChanged) updates.tags = parsedTags;
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
            className="btn btn-icon btn-sm"
            onClick={startEdit}
            title="Edit"
          >
            &#x270E;
          </button>
          <button
            className="btn btn-icon btn-sm btn-danger"
            onClick={() => onDelete(entry.id)}
            title="Delete"
          >
            &#x2715;
          </button>
        </div>
      </div>

      {(linkedQuestion || linkedTheme || entry.tags.length > 0) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {linkedTheme && (
            <span
              className="tag-pill"
              style={{
                background: linkedTheme.color + '20',
                color: linkedTheme.color,
              }}
            >
              {linkedTheme.icon} {linkedTheme.theme}
            </span>
          )}
          {linkedQuestion && (
            <button
              className="journal-entry-link"
              style={{
                background: linkedQuestion.themeColor + '15',
                color: linkedQuestion.themeColor,
              }}
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
