import { useState } from 'react';
import type { JournalEntry as JournalEntryType } from '../../types';
import { useUserData } from '../../hooks/useUserData';
import MarkdownPreview from '../common/MarkdownPreview';
import NoteEditor from '../notes/NoteEditor';

interface JournalEntryProps {
  entry: JournalEntryType;
  onUpdate: (entryId: string, content: string) => void;
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

  if (editing) {
    return (
      <div className="journal-entry-card">
        <NoteEditor
          questionId={'journal-edit-' + entry.id}
          initialContent={entry.content}
          label="Edit Entry"
          onSave={(content) => {
            onUpdate(entry.id, content);
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
            onClick={() => setEditing(true)}
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

      {(linkedQuestion || linkedTheme) && (
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
        </div>
      )}

      <div className="note-card-content">
        <MarkdownPreview content={entry.content} />
      </div>
    </div>
  );
}
