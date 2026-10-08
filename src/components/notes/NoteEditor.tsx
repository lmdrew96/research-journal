import { useState, useEffect } from 'react';
import MarkdownPreview from '../common/MarkdownPreview';
import { saveDraft, loadDraft, clearDraft } from '../../lib/storage';

interface NoteEditorProps {
  questionId: string;
  initialContent?: string;
  onSave: (content: string) => void;
  onCancel?: () => void;
  label?: string;
}

export default function NoteEditor({
  questionId,
  initialContent = '',
  onSave,
  onCancel,
  label = 'New Note',
}: NoteEditorProps) {
  // A new note starts from the question's saved draft, if there is one.
  const startingContent = () => initialContent || loadDraft(questionId) || '';
  const [content, setContent] = useState(startingContent);
  const [showPreview, setShowPreview] = useState(false);

  // Moving to another question while mounted (e.g. via a related question)
  // swaps in that question's draft — otherwise the text typed for one question
  // would be autosaved as the other's draft.
  const [draftFor, setDraftFor] = useState(questionId);
  if (draftFor !== questionId) {
    setDraftFor(questionId);
    setContent(startingContent());
  }

  // Auto-save draft
  useEffect(() => {
    if (!initialContent && content) {
      saveDraft(questionId, content);
    }
  }, [content, questionId, initialContent]);

  const handleSave = () => {
    if (!content.trim()) return;
    onSave(content.trim());
    setContent('');
    clearDraft(questionId);
    setShowPreview(false);
  };

  const handleCancel = () => {
    setContent('');
    clearDraft(questionId);
    setShowPreview(false);
    onCancel?.();
  };

  return (
    <div className="note-editor">
      <div className="note-editor-toolbar">
        <span className="note-editor-toolbar-label">{label}</span>
        <button
          className={`note-editor-toggle ${showPreview ? 'active' : ''}`}
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {showPreview ? (
        <div className="note-editor-preview">
          {content.trim() ? (
            <MarkdownPreview content={content} />
          ) : (
            <span style={{ color: 'var(--text-ghost)', fontStyle: 'italic' }}>
              Nothing to preview
            </span>
          )}
        </div>
      ) : (
        <textarea
          aria-label="Research note"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your research notes in markdown..."
        />
      )}

      <div className="note-editor-actions">
        {(content || onCancel) && (
          <button className="btn btn-sm" onClick={handleCancel}>
            Cancel
          </button>
        )}
        <button
          className="btn btn-sm btn-primary"
          onClick={handleSave}
          disabled={!content.trim()}
          style={{ opacity: content.trim() ? 1 : 0.5 }}
        >
          Save Note
        </button>
      </div>
    </div>
  );
}
