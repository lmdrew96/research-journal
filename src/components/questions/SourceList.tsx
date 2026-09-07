import { useState } from 'react';
import type { Source } from '../../types';
import { useUserData } from '../../hooks/useUserData';
import Icon from '../common/Icon';
import ConfirmDelete from '../common/ConfirmDelete';

interface SourceListProps {
  questionId: string;
  originalSources: Source[];
  themeColor: string;
}

export default function SourceList({ questionId, originalSources, themeColor }: SourceListProps) {
  const { getQuestionData, addSource, deleteSource } = useUserData();
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState('');
  const [doi, setDoi] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

  const qData = getQuestionData(questionId);

  const handleAdd = () => {
    if (!text.trim()) return;
    addSource(questionId, {
      text: text.trim(),
      doi: doi.trim() || null,
      url: url.trim() || null,
      notes: notes.trim(),
    });
    setText('');
    setDoi('');
    setUrl('');
    setNotes('');
    setShowForm(false);
  };

  return (
    <div>
      <div className="detail-label" style={{ color: 'var(--text-dim)' }}>
        Sources
      </div>

      {originalSources.map((s, i) => (
        <div key={i} className="source-item">
          {s.doi ? (
            <span>
              <Icon name="file-text" size={12} /> {s.text} {' \u2014 '}
              <a
                href={`https://doi.org/${s.doi}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                DOI
              </a>
            </span>
          ) : (
            <span><Icon name="lightbulb" size={12} /> {s.text}</span>
          )}
        </div>
      ))}

      {qData.userSources.length > 0 && (
        <>
          <div
            className="detail-label"
            style={{ color: themeColor, marginTop: 14 }}
          >
            Added During Research
          </div>
          {qData.userSources.map((s) => (
            <div key={s.id} className="source-item" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ flex: 1 }}>
                <Icon name="search" size={12} /> {s.text}
                {s.doi && (
                  <>
                    {' \u2014 '}
                    <a
                      href={`https://doi.org/${s.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      DOI
                    </a>
                  </>
                )}
                {s.url && !s.doi && (
                  <>
                    {' \u2014 '}
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      Link
                    </a>
                  </>
                )}
                {s.notes && (
                  <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 2 }}>
                    {s.notes}
                  </div>
                )}
              </span>
              <ConfirmDelete
                label="source"
                compact
                onConfirm={() => deleteSource(questionId, s.id)}
              />
            </div>
          ))}
        </>
      )}

      {showForm ? (
        <div className="add-source-form">
          <input
            aria-label="Citation text"
            placeholder="Citation text (e.g., Author (Year) \u2014 Journal)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <input
            aria-label="DOI"
            placeholder="DOI (optional, e.g., 10.1111/lang.12401)"
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
          />
          <input
            aria-label="URL"
            placeholder="URL (optional, if no DOI)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <textarea
            aria-label="Why this source is relevant"
            placeholder="Why is this source relevant? (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-sm" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button className="btn btn-sm btn-primary" onClick={handleAdd}>
              Add Source
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => setShowForm(true)}
        >
          + Add Source
        </button>
      )}
    </div>
  );
}
