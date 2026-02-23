import { useState } from 'react';
import type { ResearchNote } from '../../types';
import MarkdownPreview from '../common/MarkdownPreview';
import NoteEditor from './NoteEditor';

interface NoteCardProps {
  note: ResearchNote;
  questionId: string;
  onUpdate: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
}

export default function NoteCard({ note, questionId, onUpdate, onDelete }: NoteCardProps) {
  const [editing, setEditing] = useState(false);

  const date = new Date(note.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const wasEdited = note.updatedAt !== note.createdAt;

  if (editing) {
    return (
      <NoteEditor
        questionId={questionId + '-edit-' + note.id}
        initialContent={note.content}
        label="Edit Note"
        onSave={(content) => {
          onUpdate(note.id, content);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="note-card">
      <div className="note-card-header">
        <span className="note-card-date">
          {date}
          {wasEdited && ' (edited)'}
        </span>
        <div className="note-card-actions">
          <button
            className="btn btn-icon btn-sm"
            onClick={() => setEditing(true)}
            title="Edit note"
          >
            &#x270E;
          </button>
          <button
            className="btn btn-icon btn-sm btn-danger"
            onClick={() => onDelete(note.id)}
            title="Delete note"
          >
            &#x2715;
          </button>
        </div>
      </div>
      <div className="note-card-content">
        <MarkdownPreview content={note.content} />
      </div>
    </div>
  );
}
