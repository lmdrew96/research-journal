import { useState } from 'react';
import { researchThemes, getAllQuestions } from '../../data/research-themes';
import NoteEditor from '../notes/NoteEditor';

interface JournalEditorProps {
  onSave: (entry: {
    content: string;
    questionId: string | null;
    themeId: string | null;
    tags: string[];
  }) => void;
}

export default function JournalEditor({ onSave }: JournalEditorProps) {
  const [linkedQuestion, setLinkedQuestion] = useState('');
  const [linkedTheme, setLinkedTheme] = useState('');

  const allQuestions = getAllQuestions();

  const handleSave = (content: string) => {
    onSave({
      content,
      questionId: linkedQuestion || null,
      themeId: linkedTheme || null,
      tags: [],
    });
    setLinkedQuestion('');
    setLinkedTheme('');
  };

  return (
    <div>
      <div className="journal-editor-links">
        <select
          value={linkedTheme}
          onChange={(e) => setLinkedTheme(e.target.value)}
        >
          <option value="">Link to theme (optional)</option>
          {researchThemes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.icon} {t.theme}
            </option>
          ))}
        </select>

        <select
          value={linkedQuestion}
          onChange={(e) => setLinkedQuestion(e.target.value)}
        >
          <option value="">Link to question (optional)</option>
          {allQuestions.map((q) => (
            <option key={q.id} value={q.id}>
              {q.q.slice(0, 60)}...
            </option>
          ))}
        </select>
      </div>

      <NoteEditor
        questionId="journal-new"
        onSave={handleSave}
        label="New Journal Entry"
      />
    </div>
  );
}
