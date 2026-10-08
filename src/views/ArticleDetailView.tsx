import { useState, useMemo, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { View, ArticleStatus, Excerpt } from '../types';
import { useUserData } from '../hooks/useUserData';
import { generateSummary } from '../services/aiSummary';
import { findRelevantSections, openPdf, uploadPdf, type SectionFinding } from '../services/pdf';
import Icon from '../components/common/Icon';
import TagPill from '../components/common/TagPill';
import ArticleMetadataForm from '../components/library/ArticleMetadataForm';
import { ScholarResultCard } from './SearchView';
import {
  fetchCitedBy,
  fetchReferences,
  openAlexIdOfPaper,
  resolveOpenAlexWorkId,
  type CitedBySort,
  type ScholarPaper,
} from '../../api/_scholar';
import { tagColors } from '../data/tag-colors';
import ReactMarkdown from 'react-markdown';

interface ArticleDetailViewProps {
  articleId: string;
  onNavigate: (view: View) => void;
}

const statusOptions: { value: ArticleStatus; label: string }[] = [
  { value: 'to-read', label: 'To Read' },
  { value: 'reading', label: 'Reading' },
  { value: 'done', label: 'Done' },
];

export default function ArticleDetailView({
  articleId,
  onNavigate,
}: ArticleDetailViewProps) {
  const {
    getArticle,
    updateArticleStatus,
    updateArticleNotes,
    updateArticleTags,
    updateAiSummary,
    deleteArticle,
    addExcerpt,
    deleteExcerpt,
    linkQuestion,
    unlinkQuestion,
    checkOpenAccess,
    updateArticle,
    setKeySource,
    visibleProjects,
    switchProject,
  } = useUserData();

  const article = getArticle(articleId);
  const [editingMetadata, setEditingMetadata] = useState(false);

  // A link to an article in another project (a bookmark, or a link back from
  // Marginalia) opens it by switching to that project.
  const homeProjectId = article
    ? null
    : visibleProjects.find((p) => p.library.some((a) => a.id === articleId))?.id ?? null;
  useEffect(() => {
    if (homeProjectId) switchProject(homeProjectId);
  }, [homeProjectId, switchProject]);

  // The switch lands on the next render.
  if (!article && homeProjectId) return null;

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
    <div className="main-inner main-inner-wide">
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
            aria-label="Article status"
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

          {/* A judgement about the paper, not a reading stage — so it sits
              beside the status select instead of inside it. */}
          <button
            type="button"
            className={`btn btn-sm btn-labelled${article.keySource ? ' btn-primary' : ''}`}
            aria-pressed={article.keySource === true}
            onClick={() => setKeySource(articleId, !article.keySource)}
          >
            <Icon name={article.keySource ? 'star-filled' : 'star'} size={13} />
            Key source
          </button>

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

          {article.isOpenAccess && <span className="oa-badge">Open Access</span>}

          {article.unpaywallUrl && (
            <a
              className="btn btn-sm btn-free-pdf"
              href={article.unpaywallUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Free open-access version, found via OpenAlex"
            >
              Free version
            </a>
          )}

          {/* Offered until a check has run. An article badged Open Access but
              never checked still gets the button, because the badge alone has
              no link behind it. */}
          {article.doi && !article.unpaywallUrl && !(article.isOpenAccess && article.unpaywallCheckedAt) && (
            <FindFreeVersionButton
              articleId={articleId}
              doi={article.doi}
              alreadyChecked={!!article.unpaywallCheckedAt}
              onCheck={checkOpenAccess}
            />
          )}

          <ArticlePdfButtons
            pdfKey={article.pdfKey}
            onAttach={(key) => updateArticle(articleId, { pdfKey: key })}
          />

          {!editingMetadata && (
            <button
              type="button"
              className="btn btn-sm btn-labelled"
              onClick={() => setEditingMetadata(true)}
            >
              <Icon name="edit" size={13} />
              Edit details
            </button>
          )}

          <button
            type="button"
            className="btn btn-sm btn-danger btn-labelled"
            onClick={() => {
              deleteArticle(articleId);
              onNavigate({ name: 'library' });
            }}
          >
            <Icon name="trash" size={13} />
            Delete article
          </button>
        </div>

        {editingMetadata && (
          <ArticleMetadataForm
            article={article}
            onSave={(patch) => updateArticle(articleId, patch)}
            onCancel={() => setEditingMetadata(false)}
          />
        )}
      </div>

      <div className="detail-layout">
        {/* Left column — Article */}
        <div>
          <h2 className="detail-column-title">Article</h2>

          {article.abstract && (
            <div className="detail-section">
              <div className="detail-label">Abstract</div>
              <div className="detail-text">{article.abstract}</div>
            </div>
          )}

          <div className="detail-section">
            <AiSummarySection
              article={article}
              onSaveSummary={(summary, foundAbstract) => {
                if (foundAbstract) updateArticle(articleId, { abstract: foundAbstract });
                updateAiSummary(articleId, summary, 'abstract');
              }}
            />
          </div>

          <div className="detail-section">
            <FindSectionsSection
              article={article}
              onAppendNotes={(text) =>
                updateArticleNotes(articleId, article.notes ? `${article.notes}\n\n${text}` : text)
              }
            />
          </div>

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

          <div className="detail-section">
            <CitationTrailSection
              article={article}
              onResolvedId={(openAlexId) => updateArticle(articleId, { openAlexId })}
            />
          </div>
        </div>

        {/* Right column — Research */}
        <div>
          <h2 className="detail-column-title">Research</h2>

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
              Tags ({article.tags.length})
            </div>
            <TagsSection
              article={article}
              onUpdateTags={(tags) => updateArticleTags(articleId, tags)}
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

// ---------- Find Free Version Button ----------

function FindFreeVersionButton({
  articleId,
  doi,
  alreadyChecked,
  onCheck,
}: {
  articleId: string;
  doi: string;
  alreadyChecked: boolean;
  onCheck: (articleId: string, doi: string) => Promise<string | null>;
}) {
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(alreadyChecked);

  const handleClick = async () => {
    setLoading(true);
    const url = await onCheck(articleId, doi);
    setLoading(false);
    if (!url) setNotFound(true);
  };

  if (notFound) {
    return (
      <span className="article-meta" title="Unpaywall has no free version on file for this DOI">
        No free version found
      </span>
    );
  }

  return (
    <button className="btn btn-sm" onClick={handleClick} disabled={loading}>
      {loading ? 'Checking…' : 'Find free version'}
    </button>
  );
}

// ---------- Delete Button ----------


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
      <div
        className="article-notes-display"
        role="button"
        tabIndex={0}
        aria-label="Edit article notes"
        onClick={() => {
          setDraft(notes);
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDraft(notes);
            setEditing(true);
          }
        }}
      >
        <div className="article-notes-text">{notes}</div>
        <div className="article-notes-hint">Click to edit</div>
      </div>
    );
  }

  return (
    <div className="article-notes-editor">
      <textarea
        aria-label="Article notes"
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
  excerpts: Excerpt[];
  onAdd: (articleId: string, quote: string, comment: string, page?: number) => void;
  onDelete: (articleId: string, excerptId: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [quote, setQuote] = useState('');
  const [comment, setComment] = useState('');
  const [page, setPage] = useState('');

  // A page is a positive whole number or nothing — "12" saves, "xii" or "0" don't.
  const parsedPage = /^\d+$/.test(page.trim()) && Number(page) > 0 ? Number(page) : undefined;
  const pageInvalid = page.trim() !== '' && parsedPage === undefined;

  const reset = () => {
    setQuote('');
    setComment('');
    setPage('');
  };

  const handleAdd = () => {
    if (!quote.trim() || pageInvalid) return;
    onAdd(articleId, quote.trim(), comment.trim(), parsedPage);
    reset();
    setShowForm(false);
  };

  return (
    <div>
      {excerpts.map((ex) => (
        <div key={ex.id} className="excerpt-card">
          <div className="excerpt-quote">{ex.quote}</div>
          {ex.comment && <div className="excerpt-comment">{ex.comment}</div>}
          <div className="excerpt-card-footer">
            {ex.source && ex.source !== 'manual' && (
              <span className="excerpt-source">
                {ex.source === 'api' ? 'via API' : 'via Clipper'}
              </span>
            )}
            <span className="excerpt-date">
              {ex.page !== undefined && `p. ${ex.page} · `}
              {new Date(ex.createdAt).toLocaleDateString()}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-danger btn-labelled"
              onClick={() => onDelete(articleId, ex.id)}
              aria-label="Delete excerpt"
            >
              <Icon name="trash" size={13} />
              Delete
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
            aria-label="Excerpt quote"
            className="excerpt-form-quote"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="Paste a quote from the paper..."
            autoFocus
          />
          <textarea
            aria-label="Excerpt comment"
            className="excerpt-form-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Your comment (optional)..."
          />
          <input
            aria-label="Page (optional)"
            aria-invalid={pageInvalid}
            className="excerpt-form-page"
            inputMode="numeric"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder="Page (optional)"
          />
          {pageInvalid && (
            <div className="ai-summary-error" role="alert">
              Page must be a whole number, like 12.
            </div>
          )}
          <div className="excerpt-form-actions">
            <button
              className="btn btn-sm btn-primary"
              onClick={handleAdd}
              disabled={!quote.trim() || pageInvalid}
            >
              Save Excerpt
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setShowForm(false);
                reset();
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
  const { getAllQuestions, activeProject } = useUserData();
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
              className="btn btn-sm btn-labelled"
              onClick={() => onUnlink(articleId, qId)}
              aria-label={`Unlink question: ${q.q}`}
            >
              {'\u00D7'}
              Unlink
            </button>
          </div>
        );
      })}

      {available.length > 0 && (
        <select
          aria-label="Link a question to this article"
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
          Link this article to {activeProject.name}'s questions to keep everything connected.
        </div>
      )}
    </div>
  );
}

// ---------- Tags Section ----------

function TagsSection({
  article,
  onUpdateTags,
}: {
  article: import('../types').LibraryArticle;
  onUpdateTags: (tags: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { library } = useUserData();

  // Collect all tags already used across the library + predefined tag colors
  const allKnownTags = useMemo(() => {
    const fromLibrary = new Set(library.flatMap((a) => a.tags));
    const fromColors = new Set(Object.keys(tagColors));
    const combined = new Set([...fromLibrary, ...fromColors]);
    // Remove tags already on this article
    for (const t of article.tags) combined.delete(t);
    return Array.from(combined).sort();
  }, [library, article.tags]);

  const filtered = useMemo(() => {
    if (!input.trim()) return allKnownTags.slice(0, 12);
    const q = input.toLowerCase();
    return allKnownTags.filter((t) => t.toLowerCase().includes(q)).slice(0, 12);
  }, [allKnownTags, input]);

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || article.tags.includes(normalized)) return;
    onUpdateTags([...article.tags, normalized]);
    setInput('');
    setShowSuggestions(false);
  };

  const removeTag = (tag: string) => {
    onUpdateTags(article.tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (input.trim()) addTag(input);
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="tags-section">
      {article.tags.length > 0 && (
        <div className="tags-list">
          {article.tags.map((tag) => (
            <span key={tag} className="tag-removable">
              <TagPill tag={tag} />
              <button
                className="tag-remove-btn"
                onClick={() => removeTag(tag)}
                aria-label={`Remove tag: ${tag}`}
              >
                {'\u00D7'}
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="tag-input-wrapper">
        <input
          aria-label="Add a tag"
          className="tag-input"
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // Delay to allow click on suggestion
            setTimeout(() => setShowSuggestions(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Add a tag..."
        />

        {showSuggestions && filtered.length > 0 && (
          <div className="tag-suggestions">
            {filtered.map((tag) => (
              <button
                key={tag}
                className="tag-suggestion-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(tag);
                }}
              >
                <TagPill tag={tag} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- PDF ----------

/**
 * Open / attach / replace the article's uploaded PDF. Uploading goes straight
 * to storage; only the returned key is saved on the article.
 */
function ArticlePdfButtons({
  pdfKey,
  onAttach,
}: {
  pdfKey: string | undefined;
  onAttach: (key: string) => void;
}) {
  const { getToken } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attach = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      onAttach(await uploadPdf(file, await getToken()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const open = async () => {
    if (!pdfKey) return;
    setError(null);
    try {
      await openPdf(pdfKey, await getToken());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the PDF.');
    }
  };

  return (
    <>
      {pdfKey && (
        <button type="button" className="btn btn-sm btn-labelled" onClick={() => void open()}>
          <Icon name="file-text" size={13} />
          Open PDF
        </button>
      )}
      <button
        type="button"
        className="btn btn-sm btn-labelled"
        disabled={uploading}
        onClick={() => fileInput.current?.click()}
      >
        <Icon name="file-text" size={13} />
        {uploading ? 'Uploading…' : pdfKey ? 'Replace PDF' : 'Attach PDF'}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void attach(file);
        }}
      />
      {error && <span className="ai-summary-error" role="alert">{error}</span>}
    </>
  );
}

// ---------- AI Summary Section ----------

function AiSummarySection({
  article,
  onSaveSummary,
}: {
  article: import('../types').LibraryArticle;
  onSaveSummary: (summary: string, foundAbstract: string | null) => void;
}) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getAllQuestions } = useUserData();

  const allQuestions = getAllQuestions();
  const linkedQuestions = article.linkedQuestions
    .map((qId) => {
      const q = allQuestions.find((q) => q.id === qId);
      return q ? { id: q.id, text: q.q } : null;
    })
    .filter(Boolean) as { id: string; text: string }[];

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const { summary, foundAbstract } = await generateSummary(article, linkedQuestions, await getToken());
      onSaveSummary(summary, foundAbstract);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="detail-label">
        <Icon name="cpu" size={12} /> AI Summary
      </div>

      {article.aiSummary ? (
        <div className="ai-summary">
          {article.aiSummarySource ? (
            <div className="ai-summary-hint ai-summary-source">
              From the {article.aiSummarySource === 'full-text' ? 'full text' : 'abstract'}
            </div>
          ) : (
            <div className="ai-summary-error ai-summary-source" role="note">
              Source unknown — this summary may have been written from the title alone and can
              state findings the paper doesn't. Regenerate to rebuild it from the abstract.
            </div>
          )}
          <div className="ai-summary-text markdown-preview">
            <ReactMarkdown>{article.aiSummary}</ReactMarkdown>
          </div>
          <button
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Regenerating...' : 'Regenerate'}
          </button>
        </div>
      ) : (
        <div className="ai-summary-empty">
          {loading ? (
            <div className="ai-summary-loading" role="status" aria-live="polite">
              <span className="ai-summary-spinner" />
              Generating summary...
            </div>
          ) : (
            <>
              <button className="btn btn-sm btn-summarize" onClick={handleGenerate}>
                Summarize this article
              </button>
              {!article.abstract && (
                <div className="ai-summary-hint">
                  No abstract yet — one will be looked up by DOI. Without an abstract, no summary is generated.
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* Outside the branches: a failed Regenerate must say so too, not leave
          the old summary looking current. */}
      {error && <div className="ai-summary-error ai-summary-failed" role="alert">{error}</div>}
    </div>
  );
}

// ---------- One Section, Not the Paper ----------

/**
 * Points at the 1–3 parts of the full text that bear on one linked question,
 * so reading a key source takes minutes instead of an evening. Reads the
 * uploaded PDF if there is one, else the free version; says plainly when
 * there is no full text to read.
 */
function FindSectionsSection({
  article,
  onAppendNotes,
}: {
  article: import('../types').LibraryArticle;
  onAppendNotes: (text: string) => void;
}) {
  const { getToken } = useAuth();
  const { getAllQuestions } = useUserData();
  const linked = getAllQuestions().filter((q) => article.linkedQuestions.includes(q.id));
  const [questionId, setQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ finding: SectionFinding; question: string } | null>(null);
  const [appended, setAppended] = useState(false);

  const question = linked.find((q) => q.id === questionId) ?? linked[0];
  const source = article.pdfKey
    ? { key: article.pdfKey }
    : article.unpaywallUrl
      ? { pdfUrl: article.unpaywallUrl }
      : null;
  const sourceLabel = article.pdfKey ? 'your uploaded PDF' : 'the free version';

  const handleFind = async () => {
    if (!source || !question) return;
    setLoading(true);
    setError(null);
    setAppended(false);
    try {
      const finding = await findRelevantSections(source, { q: question.q, why: question.why }, await getToken());
      setResult({ finding, question: question.q });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read the full text.');
    } finally {
      setLoading(false);
    }
  };

  // Article notes display as plain text, so the summary is plain text too.
  const handleAppend = () => {
    if (!result) return;
    const lines = result.finding.sections.map((sec) => {
      const where = [sec.heading, sec.pages ? `pp. ${sec.pages}` : null].filter(Boolean).join(', ');
      return `• ${where || 'Passage'} — starts "${sec.opening}…" — ${sec.why}`;
    });
    onAppendNotes(`Read for "${result.question}" (from ${sourceLabel}):\n${lines.join('\n')}`);
    setAppended(true);
  };

  return (
    <div>
      <div className="detail-label">
        <Icon name="book-open" size={12} /> One section, not the paper
      </div>

      {linked.length === 0 ? (
        <div className="linked-article-hint">
          Link this article to a question to find the part of it that answers that question.
        </div>
      ) : !source ? (
        <div className="linked-article-hint">
          No full text available for this paper — attach a PDF{article.doi ? ' or use Find free version' : ''} to use
          this. Until then, the abstract is what there is to go on (AI Summary above).
        </div>
      ) : (
        <>
          {linked.length > 1 && (
            <select
              aria-label="Question to read for"
              className="linked-article-select"
              value={question?.id ?? ''}
              onChange={(e) => {
                setQuestionId(e.target.value);
                setResult(null);
              }}
            >
              {linked.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.q}
                </option>
              ))}
            </select>
          )}
          {linked.length === 1 && <div className="linked-article-hint">For: {question?.q}</div>}

          {loading ? (
            <div className="ai-summary-loading" role="status" aria-live="polite">
              <span className="ai-summary-spinner" />
              Reading the full text...
            </div>
          ) : (
            <button className="btn btn-sm btn-summarize" style={{ marginTop: 8 }} onClick={handleFind}>
              {result ? 'Find again' : 'Find the sections to read'}
            </button>
          )}
        </>
      )}

      {result && !loading && (
        <div className="ai-summary" style={{ marginTop: 10 }}>
          <div className="ai-summary-hint ai-summary-source">From the full text ({sourceLabel})</div>
          {result.finding.sections.length === 0 ? (
            <div className="linked-article-hint">
              {result.finding.note ?? 'No part of this paper bears directly on that question.'}
            </div>
          ) : (
            <>
              {result.finding.sections.map((sec, i) => (
                <div key={i} className="excerpt-card">
                  <div className="section-pick-where">
                    {sec.heading ?? 'Passage'}
                    {sec.pages && <span className="excerpt-date"> · pp. {sec.pages}</span>}
                  </div>
                  <div className="excerpt-quote">Starts: “{sec.opening}…”</div>
                  <div className="excerpt-comment">{sec.why}</div>
                </div>
              ))}
              <button className="btn btn-sm" onClick={handleAppend} disabled={appended}>
                {appended ? 'Added to notes' : 'Add to article notes'}
              </button>
            </>
          )}
        </div>
      )}
      {error && <div className="ai-summary-error ai-summary-failed" role="alert">{error}</div>}
    </div>
  );
}

// ---------- Citation Trail ----------

type TrailDirection = 'references' | 'cited_by';

const TRAIL_PAGE = 10;
const TRAIL_MAX = 50;

/**
 * What this article cites and what cites it, from OpenAlex. Nothing is fetched
 * until asked — opening an article should not cost a network round trip.
 */
function CitationTrailSection({
  article,
  onResolvedId,
}: {
  article: import('../types').LibraryArticle;
  onResolvedId: (openAlexId: string) => void;
}) {
  const { library, addToLibrary, isInLibrary } = useUserData();
  const [direction, setDirection] = useState<TrailDirection | null>(null);
  const [sort, setSort] = useState<CitedBySort>('citations');
  const [limit, setLimit] = useState(TRAIL_PAGE);
  const [papers, setPapers] = useState<ScholarPaper[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (dir: TrailDirection, nextSort: CitedBySort, nextLimit: number) => {
    setDirection(dir);
    setSort(nextSort);
    setLimit(nextLimit);
    setLoading(true);
    setError(null);
    try {
      const workId = await resolveOpenAlexWorkId(article);
      if (!workId) {
        setPapers([]);
        setTotal(0);
        setError(
          "OpenAlex doesn't know this article (no OpenAlex id, and no DOI it recognizes), so its citation trail isn't available.",
        );
        return;
      }
      // Remember an id resolved from the DOI, so the next trail skips the lookup.
      if (!article.openAlexId) onResolvedId(workId);
      const result =
        dir === 'references'
          ? await fetchReferences(workId, nextLimit)
          : await fetchCitedBy(workId, nextLimit, nextSort);
      setPapers(result.papers);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? `OpenAlex lookup failed: ${err.message}` : 'OpenAlex lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  const inLibrary = (paper: ScholarPaper): boolean => {
    const oa = openAlexIdOfPaper(paper);
    return (
      isInLibrary(paper.externalIds?.DOI || null, paper.title) ||
      (oa !== null && library.some((a) => a.openAlexId === oa))
    );
  };

  const save = (paper: ScholarPaper) => {
    const openAlexId = openAlexIdOfPaper(paper);
    addToLibrary({
      title: paper.title,
      authors: paper.authors.map((a) => a.name),
      year: paper.year,
      journal: paper.journal?.name || null,
      doi: paper.externalIds?.DOI || null,
      url: paper.url,
      abstract: paper.abstract,
      status: 'to-read',
      isOpenAccess: paper.isOpenAccess,
      source: 'openalex',
      ...(openAlexId ? { openAlexId } : {}),
    });
  };

  // References can't grow past the 100 OpenAlex resolves in one batch.
  const reachable = direction === 'references' ? Math.min(total, 100) : total;
  const canLoadMore = !loading && !error && papers.length < reachable && limit < TRAIL_MAX;

  return (
    <div>
      <div className="detail-label">
        <Icon name="orbit" size={12} /> Citation trail
      </div>

      <div className="scholar-provider-toggle" role="group" aria-label="Citation direction">
        <button
          type="button"
          aria-pressed={direction === 'references'}
          className={`scholar-provider-btn ${direction === 'references' ? 'active' : ''}`}
          onClick={() => load('references', sort, TRAIL_PAGE)}
        >
          References
        </button>
        <button
          type="button"
          aria-pressed={direction === 'cited_by'}
          className={`scholar-provider-btn ${direction === 'cited_by' ? 'active' : ''}`}
          onClick={() => load('cited_by', sort, TRAIL_PAGE)}
        >
          Cited by
        </button>
      </div>

      {direction === 'cited_by' && (
        <div className="scholar-provider-toggle" role="group" aria-label="Cited-by order">
          <button
            type="button"
            aria-pressed={sort === 'citations'}
            className={`scholar-provider-btn ${sort === 'citations' ? 'active' : ''}`}
            onClick={() => load('cited_by', 'citations', TRAIL_PAGE)}
          >
            Most cited
          </button>
          <button
            type="button"
            aria-pressed={sort === 'year'}
            className={`scholar-provider-btn ${sort === 'year' ? 'active' : ''}`}
            onClick={() => load('cited_by', 'year', TRAIL_PAGE)}
          >
            Newest
          </button>
        </div>
      )}

      <div role="status" aria-live="polite">
        {loading && (
          <div className="scholar-loading">
            <div className="scholar-loading-dot" />
            Walking the citation trail...
          </div>
        )}
        {!loading && direction && !error && (
          <div className="scholar-result-count">
            {papers.length === 0
              ? direction === 'references'
                ? 'OpenAlex lists no references for this article.'
                : 'Nothing in OpenAlex cites this article yet.'
              : `Showing ${papers.length} of ${total.toLocaleString()} ${
                  direction === 'references' ? 'references, most-cited first' : 'citing works'
                }`}
          </div>
        )}
      </div>

      {error && (
        <div className="scholar-error" role="alert">
          {error}
        </div>
      )}

      {!loading &&
        papers.map((paper) => (
          <ScholarResultCard
            key={paper.paperId}
            paper={paper}
            saved={inLibrary(paper)}
            onSave={() => save(paper)}
          />
        ))}

      {canLoadMore && direction && (
        <div className="scholar-load-more">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => load(direction, sort, Math.min(limit + TRAIL_PAGE, TRAIL_MAX))}
          >
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
