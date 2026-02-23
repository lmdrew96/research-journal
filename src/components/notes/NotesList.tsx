import type { ResearchNote } from '../../types';
import NoteCard from './NoteCard';
import NoteEditor from './NoteEditor';
import EmptyState from '../common/EmptyState';

interface NotesListProps {
  notes: ResearchNote[];
  questionId: string;
  onAdd: (content: string) => void;
  onUpdate: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
}

export default function NotesList({
  notes,
  questionId,
  onAdd,
  onUpdate,
  onDelete,
}: NotesListProps) {
  return (
    <div>
      <NoteEditor questionId={questionId} onSave={onAdd} />

      <div style={{ marginTop: 16 }}>
        {notes.length === 0 ? (
          <EmptyState
            icon="&#x1F4DD;"
            text="No notes yet. Start writing to capture your research findings and thoughts."
          />
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              questionId={questionId}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
