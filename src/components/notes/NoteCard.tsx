import { useState } from 'react';
import type { ResearchNote } from '../../types';
import MarkdownPreview from '../common/MarkdownPreview';
import Icon from '../common/Icon';
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
            className="btn btn-sm btn-labelled"
            onClick={() => setEditing(true)}
            aria-label="Edit note"
          >
            <Icon name="edit" size={13} />
            Edit
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger btn-labelled"
            onClick={() => onDelete(note.id)}
            aria-label="Delete note"
          >
            <Icon name="trash" size={13} />
            Delete
          </button>
        </div>
      </div>
      <div className="note-card-content">
        <MarkdownPreview content={note.content} />
      </div>
    </div>
  );
}
