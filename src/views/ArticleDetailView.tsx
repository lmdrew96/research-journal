import { useState } from 'react';
import type { View, ArticleStatus } from '../types';
import { useUserData } from '../hooks/useUserData';
import { getAllQuestions } from '../data/research-themes';
import Icon from '../components/common/Icon';

interface ArticleDetailViewProps {
  articleId: string;
  onNavigate: (view: View) => void;
}

const statusOptions: { value: ArticleStatus; label: string }[] = [
  { value: 'to-read', label: 'To Read' },
  { value: 'reading', label: 'Reading' },
  { value: 'done', label: 'Done' },
  { value: 'key-source', label: 'Key Source' },
];

export default function ArticleDetailView({
  articleId,
  onNavigate,
}: ArticleDetailViewProps) {
  const {
    getArticle,
    updateArticleStatus,
    updateArticleNotes,
    deleteArticle,
    addExcerpt,
    deleteExcerpt,
    linkQuestion,
    unlinkQuestion,
  } = useUserData();

  const article = getArticle(articleId);

  if (!article) {
    return (
      <div className="main-inner">
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="book-open" size={32} /></div>
          <p className="empty-state-text">Article not found.</p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => onNavigate({ name: 'library' })}
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  const metaParts: string[] = [];
  if (article.year) metaParts.push(String(article.year));
  if (article.journal) metaParts.push(article.journal);

  return (
    <div className="main-inner">
      <button
        className="back-btn"
        onClick={() => onNavigate({ name: 'library' })}
      >
        <Icon name="arrow-left" size={14} /> Library
      </button>

      <div className="article-header">
        <h1 className="article-title">{article.title}</h1>

        {article.authors.length > 0 && (
          <div className="article-authors">{article.authors.join(', ')}</div>
        )}

        {metaParts.length > 0 && (
          <div className="article-meta">{metaParts.join(' \u00B7 ')}</div>
        )}

        <div className="article-header-actions">
          <select
            className="status-select"
            value={article.status}
            onChange={(e) =>
              updateArticleStatus(articleId, e.target.value as ArticleStatus)
            }
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {article.doi && (
            <a
              className="btn btn-sm"
              href={`https://doi.org/${article.doi}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              DOI
            </a>
          )}

          <DeleteButton
            onDelete={() => {
              deleteArticle(articleId);
              onNavigate({ name: 'library' });
            }}
          />
        </div>
      </div>

      <div className="detail-layout">
        {/* Left column — Article */}
        <div>
          <div className="detail-column-title">Article</div>

          {article.abstract && (
            <div className="detail-section">
              <div className="detail-label">Abstract</div>
              <div className="detail-text">{article.abstract}</div>
            </div>
          )}

          <div className="detail-section">
            <div className="detail-label">
              Excerpts ({article.excerpts.length})
            </div>
            <ExcerptSection
              articleId={articleId}
              excerpts={article.excerpts}
              onAdd={addExcerpt}
              onDelete={deleteExcerpt}
            />
          </div>
        </div>

        {/* Right column — Research */}
        <div>
          <div className="detail-column-title">Research</div>

          <div className="detail-section">
            <div className="detail-label">Notes</div>
            <NotesEditor
              articleId={articleId}
              notes={article.notes}
              onSave={updateArticleNotes}
            />
          </div>

          <div className="detail-section">
            <div className="detail-label">
              Linked Questions ({article.linkedQuestions.length})
            </div>
            <LinkedQuestionsSection
              articleId={articleId}
              linkedQuestions={article.linkedQuestions}
              onLink={linkQuestion}
              onUnlink={unlinkQuestion}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Delete Button ----------

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="delete-confirm">
        <span className="delete-confirm-text">Delete this article?</span>
        <button className="btn btn-sm btn-danger" onClick={onDelete}>
          Yes, delete
        </button>
        <button className="btn btn-sm" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      className="btn btn-sm btn-danger"
      onClick={() => setConfirming(true)}
    >
      Delete
    </button>
  );
}

// ---------- Notes Editor ----------

function NotesEditor({
  articleId,
  notes,
  onSave,
}: {
  articleId: string;
  notes: string;
  onSave: (articleId: string, notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes);

  const handleSave = () => {
    onSave(articleId, draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(notes);
    setEditing(false);
  };

  if (!editing && !notes) {
    return (
      <button
        className="btn btn-sm"
        onClick={() => {
          setDraft('');
          setEditing(true);
        }}
      >
        Add notes
      </button>
    );
  }

  if (!editing) {
    return (
      <div className="article-notes-display" onClick={() => {
        setDraft(notes);
        setEditing(true);
      }}>
        <div className="article-notes-text">{notes}</div>
        <div className="article-notes-hint">Click to edit</div>
      </div>
    );
  }

  return (
    <div className="article-notes-editor">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Your notes on this article..."
        autoFocus
      />
      <div className="article-notes-actions">
        <button className="btn btn-sm btn-primary" onClick={handleSave}>
          Save
        </button>
        <button className="btn btn-sm" onClick={handleCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------- Excerpt Section ----------

function ExcerptSection({
  articleId,
  excerpts,
  onAdd,
  onDelete,
}: {
  articleId: string;
  excerpts: { id: string; quote: string; comment: string; createdAt: string }[];
  onAdd: (articleId: string, quote: string, comment: string) => void;
  onDelete: (articleId: string, excerptId: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [quote, setQuote] = useState('');
  const [comment, setComment] = useState('');

  const handleAdd = () => {
    if (!quote.trim()) return;
    onAdd(articleId, quote.trim(), comment.trim());
    setQuote('');
    setComment('');
    setShowForm(false);
  };

  return (
    <div>
      {excerpts.map((ex) => (
        <div key={ex.id} className="excerpt-card">
          <div className="excerpt-quote">{ex.quote}</div>
          {ex.comment && <div className="excerpt-comment">{ex.comment}</div>}
          <div className="excerpt-card-footer">
            <span className="excerpt-date">
              {new Date(ex.createdAt).toLocaleDateString()}
            </span>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => onDelete(articleId, ex.id)}
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      {!showForm ? (
        <button
          className="btn btn-sm"
          onClick={() => setShowForm(true)}
          style={{ marginTop: excerpts.length > 0 ? 8 : 0 }}
        >
          Add excerpt
        </button>
      ) : (
        <div className="excerpt-form">
          <textarea
            className="excerpt-form-quote"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="Paste a quote from the paper..."
            autoFocus
          />
          <textarea
            className="excerpt-form-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Your comment (optional)..."
          />
          <div className="excerpt-form-actions">
            <button
              className="btn btn-sm btn-primary"
              onClick={handleAdd}
              disabled={!quote.trim()}
            >
              Save Excerpt
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setShowForm(false);
                setQuote('');
                setComment('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Linked Questions Section ----------

function LinkedQuestionsSection({
  articleId,
  linkedQuestions,
  onLink,
  onUnlink,
  onNavigate,
}: {
  articleId: string;
  linkedQuestions: string[];
  onLink: (articleId: string, questionId: string) => void;
  onUnlink: (articleId: string, questionId: string) => void;
  onNavigate: (view: View) => void;
}) {
  const allQuestions = getAllQuestions();
  const available = allQuestions.filter(
    (q) => !linkedQuestions.includes(q.id)
  );

  const handleLink = (questionId: string) => {
    if (questionId) onLink(articleId, questionId);
  };

  return (
    <div>
      {linkedQuestions.map((qId) => {
        const q = allQuestions.find((q) => q.id === qId);
        if (!q) return null;
        return (
          <div key={qId} className="linked-question-item">
            <button
              className="linked-question-text"
              onClick={() =>
                onNavigate({ name: 'question-detail', questionId: qId })
              }
            >
              <span
                className="linked-question-dot"
                style={{ background: q.themeColor }}
              />
              {q.q}
            </button>
            <button
              className="btn btn-sm btn-icon"
              onClick={() => onUnlink(articleId, qId)}
              title="Unlink"
            >
              {'\u00D7'}
            </button>
          </div>
        );
      })}

      {available.length > 0 && (
        <select
          className="status-select linked-question-select"
          value=""
          onChange={(e) => handleLink(e.target.value)}
        >
          <option value="" disabled>
            Link a question...
          </option>
          {available.map((q) => (
            <option key={q.id} value={q.id}>
              {q.q.length > 60 ? q.q.slice(0, 60) + '...' : q.q}
            </option>
          ))}
        </select>
      )}

      {linkedQuestions.length === 0 && available.length > 0 && (
        <div className="linked-question-hint">
          Link this article to your research questions to keep everything connected.
        </div>
      )}
    </div>
  );
}