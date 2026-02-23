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
  const [content, setContent] = useState(initialContent);
  const [showPreview, setShowPreview] = useState(false);

  // Load draft on mount
  useEffect(() => {
    if (!initialContent) {
      const draft = loadDraft(questionId);
      if (draft) setContent(draft);
    }
  }, [questionId, initialContent]);

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
