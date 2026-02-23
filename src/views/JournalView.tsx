import type { View } from '../types';
import { useUserData } from '../hooks/useUserData';
import JournalEditor from '../components/journal/JournalEditor';
import JournalTimeline from '../components/journal/JournalTimeline';

interface JournalViewProps {
  onNavigate: (view: View) => void;
}

export default function JournalView({ onNavigate }: JournalViewProps) {
  const {
    data,
    addJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
  } = useUserData();

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">Reflections</div>
        <h1 className="view-header-title">Research Journal</h1>
        <p className="view-header-subtitle">
          Free-form thoughts, cross-cutting observations, and reflections on your
          research direction.
        </p>
      </div>

      <JournalEditor
        onSave={(entry) => addJournalEntry(entry)}
      />

      <div style={{ marginTop: 24 }}>
        <JournalTimeline
          entries={data.journal}
          onUpdate={updateJournalEntry}
          onDelete={deleteJournalEntry}
          onNavigateToQuestion={(qId) =>
            onNavigate({ name: 'question-detail', questionId: qId })
          }
        />
      </div>
    </div>
  );
}
