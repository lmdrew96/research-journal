import type { JournalEntry } from '../../types';
import JournalEntryCard from './JournalEntry';
import EmptyState from '../common/EmptyState';

interface JournalTimelineProps {
  entries: JournalEntry[];
  onUpdate: (entryId: string, content: string) => void;
  onDelete: (entryId: string) => void;
  onNavigateToQuestion?: (questionId: string) => void;
}

export default function JournalTimeline({
  entries,
  onUpdate,
  onDelete,
  onNavigateToQuestion,
}: JournalTimelineProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="&#x1F4D3;"
        text="No journal entries yet. Use the journal to capture thoughts that span multiple questions or reflect on your research direction."
      />
    );
  }

  return (
    <div>
      {entries.map((entry) => (
        <JournalEntryCard
          key={entry.id}
          entry={entry}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onNavigateToQuestion={onNavigateToQuestion}
        />
      ))}
    </div>
  );
}
