import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { readableTextVars } from '../lib/tag-color';
import type { View, QuestionStatus, ArticleStatus, FlatQuestion, ConnectionNodeType } from '../types';
import { useUserData } from '../hooks/useUserData';
import { provenanceLabel } from '../data/provenance';
import { generateSearchPhrases } from '../services/aiSearchPhrases';
import { askThePile, type PileSynthesis } from '../services/askThePile';
import ReactMarkdown from 'react-markdown';
import StarToggle from '../components/common/StarToggle';
import TagPill from '../components/common/TagPill';
import SourceList from '../components/questions/SourceList';
import NotesList from '../components/notes/NotesList';
import MarkdownPreview from '../components/common/MarkdownPreview';
import Icon from '../components/common/Icon';
import Connections, { ConnectionList } from '../components/connections/Connections';

interface QuestionDetailViewProps {
  questionId: string;
  onNavigate: (view: View) => void;
}

export default function QuestionDetailView({
  questionId,
  onNavigate,
}: QuestionDetailViewProps) {
  const {
    getQuestionById, getQuestionData, setStatus, toggleStar, addNote, updateNote, deleteNote,
    getArticlesForQuestion, linkQuestion, unlinkQuestion, updateSearchPhrases, library,
    getAllQuestions, relateQuestions, unrelateQuestions,
  } = useUserData();
  const question = getQuestionById(questionId);

  if (!question) {
    return (
      <div className="main-inner">
        <p style={{ color: 'var(--text-dim)' }}>Question not found.</p>
      </div>
    );
  }

  const qData = getQuestionData(questionId);

  // Links are stored as ids on both sides. Resolve them here and drop any that
  // no longer point at a live question — a link into a soft-deleted theme
  // should read as absent, not as a broken row.
  const related = (question.relatedQuestions ?? []).flatMap((id) => {
    const q = getQuestionById(id);
    return q ? [q] : [];
  });

  return (
    <div className="main-inner main-inner-wide">
      <button
        className="back-btn"
        onClick={() => onNavigate({ name: 'questions' })}
        style={{ marginTop: 24 }}
      >
        <Icon name="arrow-left" size={14} /> Back to Questions
      </button>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <StarToggle
            active={qData.starred}
            onClick={(e) => {
              e.stopPropagation();
              toggleStar(questionId);
            }}
          />
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 400,
                color: 'var(--text-heading)',
                lineHeight: 1.4,
                marginBottom: 12,
              }}
            >
              {question.q}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {question.tags.map((tag) => (
                  <TagPill key={tag} tag={tag} />
                ))}
              </div>
              <select
                aria-label="Question status"
                className="status-select"
                value={qData.status}
                onChange={(e) =>
                  setStatus(questionId, e.target.value as QuestionStatus)
                }
              >
                <option value="not_started">Not started</option>
                <option value="exploring">Exploring</option>
                <option value="has_findings">Has findings</option>
                <option value="concluded">Concluded</option>
              </select>
              {question.provenance && (
                <span className="provenance-label">
                  Origin: {provenanceLabel(question.provenance)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="detail-layout">
        {/* Left column: reference material */}
        <div>
          <h2 className="detail-column-title">Reference</h2>

          <div className="detail-section">
            <div className="detail-label" style={readableTextVars(question.themeColor) as React.CSSProperties}>
              Why This Matters
            </div>
            <p className="detail-text">{question.why}</p>
          </div>

          <div className="detail-section">
            <div className="detail-label detail-label-success">
              &rarr; Practical Implication
            </div>
            <p className="detail-text implication-text">
              {question.appImplication}
            </p>
          </div>

          <div className="detail-section">
            <SuggestedSearches
              question={question}
              phrases={qData.searchPhrases || []}
              onSave={(phrases) => updateSearchPhrases(questionId, phrases)}
              onSearch={(phrase) => onNavigate({ name: 'search', initialQuery: phrase })}
              themeColor={question.themeColor}
            />
          </div>

          <div className="detail-section">
            <SourceList
              questionId={questionId}
              originalSources={question.sources}
              themeColor={question.themeColor}
            />
          </div>

          <ConnectedExcerptsSection
            questionId={questionId}
            onNavigate={onNavigate}
            themeColor={question.themeColor}
          />

          <div className="detail-section">
            <LinkedArticlesSection
              questionId={questionId}
              onNavigate={onNavigate}
              getArticlesForQuestion={getArticlesForQuestion}
              linkQuestion={linkQuestion}
              unlinkQuestion={unlinkQuestion}
              allArticles={library}
              themeColor={question.themeColor}
            />
          </div>

          <div className="detail-section">
            <AskThePileSection
              question={question}
              linked={getArticlesForQuestion(questionId)}
              onSaveNote={(content) => addNote(questionId, content)}
              themeColor={question.themeColor}
            />
          </div>

          <div className="detail-section">
            <RelatedQuestionsSection
              questionId={questionId}
              related={related}
              allQuestions={getAllQuestions()}
              onNavigate={onNavigate}
              relateQuestions={relateQuestions}
              unrelateQuestions={unrelateQuestions}
              themeColor={question.themeColor}
            />
          </div>

          <div className="detail-section">
            <div className="detail-label" style={readableTextVars(question.themeColor) as React.CSSProperties}>
              Connections
            </div>
            {/* Excerpts have their own block above the linked articles. */}
            <Connections
              itemType="question"
              itemId={questionId}
              onNavigate={onNavigate}
              excludeTypes={EXCERPT_ONLY}
            />
          </div>
        </div>

        {/* Right column: research notes */}
        <div>
          <h2 className="detail-column-title">
            Research Notes ({qData.notes.length})
          </h2>
          <NotesList
            notes={qData.notes}
            questionId={questionId}
            onAdd={(content) => addNote(questionId, content)}
            onUpdate={(noteId, content) => updateNote(questionId, noteId, content)}
            onDelete={(noteId) => deleteNote(questionId, noteId)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Linked Articles Section ──

const statusColors: Record<ArticleStatus, string> = {
  'to-read': 'var(--text-ghost)',
  reading: 'var(--theme-ai-tech)',
  done: 'var(--color-success)',
};

const statusLabels: Record<ArticleStatus, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  done: 'Done',
};

function LinkedArticlesSection({
  questionId,
  onNavigate,
  getArticlesForQuestion,
  linkQuestion,
  unlinkQuestion,
  allArticles,
  themeColor,
}: {
  questionId: string;
  onNavigate: (view: View) => void;
  getArticlesForQuestion: (qId: string) => import('../types').LibraryArticle[];
  linkQuestion: (articleId: string, questionId: string) => void;
  unlinkQuestion: (articleId: string, questionId: string) => void;
  allArticles: import('../types').LibraryArticle[];
  themeColor: string;
}) {
  const [showSelect, setShowSelect] = useState(false);
  const linked = getArticlesForQuestion(questionId);
  const unlinked = allArticles.filter(
    (a) => !a.linkedQuestions.includes(questionId)
  );

  return (
    <div>
      <div className="detail-label" style={readableTextVars(themeColor) as React.CSSProperties}>
        <Icon name="book-open" size={12} /> Linked Articles ({linked.length})
      </div>

      {linked.length === 0 && !showSelect && (
        <div className="linked-article-hint">
          No articles linked yet. Save papers from Search and link them here.
        </div>
      )}

      {linked.map((article) => (
        <div key={article.id} className="linked-article-group">
          <div className="linked-article-item">
            <button
              className="linked-article-title"
              onClick={() =>
                onNavigate({ name: 'article-detail', articleId: article.id })
              }
            >
              <span
                className="linked-article-dot"
                style={{ background: statusColors[article.status] }}
              />
              <span>
                {article.title}
                <span className="linked-article-meta">
                  {article.authors.slice(0, 2).join(', ')}
                  {article.authors.length > 2 ? ' et al.' : ''}
                  {article.year ? ` (${article.year})` : ''}
                  {' \u00B7 '}
                  {statusLabels[article.status]}
                  {article.keySource && ' \u00B7 Key Source'}
                </span>
              </span>
            </button>
            <button
              className="btn btn-sm btn-labelled"
              onClick={() => unlinkQuestion(article.id, questionId)}
              aria-label={`Unlink article: ${article.title}`}
              style={{ flexShrink: 0 }}
            >
              {'×'}
              Unlink
            </button>
          </div>
          {article.excerpts.length > 0 && (
            <LinkedExcerpts
              articleId={article.id}
              excerpts={article.excerpts}
              onNavigate={onNavigate}
            />
          )}
        </div>
      ))}

      {showSelect ? (
        unlinked.length > 0 ? (
          <select
            aria-label="Link an article to this question"
            className="linked-article-select"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                linkQuestion(e.target.value, questionId);
                setShowSelect(false);
              }
            }}
          >
            <option value="">Select an article to link...</option>
            {unlinked.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
                {a.year ? ` (${a.year})` : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className="linked-article-hint">
            All saved articles are already linked to this question.
          </div>
        )
      ) : (
        allArticles.length > 0 && unlinked.length > 0 && (
          <button
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => setShowSelect(true)}
          >
            + Link Article
          </button>
        )
      )}
    </div>
  );
}

// ── Excerpts connected straight to this question ──

const EXCERPT_ONLY: ConnectionNodeType[] = ['excerpt'];

/**
 * Excerpts Nae connected to this question herself, each with its because.
 * They sit above the linked articles' excerpts: a deliberate connection says
 * more than an excerpt that happens to be in a linked paper.
 */
function ConnectedExcerptsSection({
  questionId,
  onNavigate,
  themeColor,
}: {
  questionId: string;
  onNavigate: (view: View) => void;
  themeColor: string;
}) {
  const { connections } = useUserData();
  const any = connections.some(
    (c) =>
      (c.fromId === questionId && c.toType === 'excerpt') ||
      (c.toId === questionId && c.fromType === 'excerpt')
  );
  if (!any) return null;
  return (
    <div className="detail-section connected-excerpts">
      <div className="detail-label" style={readableTextVars(themeColor) as React.CSSProperties}>
        Connected excerpts
      </div>
      <ConnectionList itemId={questionId} onNavigate={onNavigate} onlyTypes={EXCERPT_ONLY} />
    </div>
  );
}

// ── Excerpts under a linked article ──

// Past this many, the rest wait behind "Show N more" so one heavily
// highlighted paper doesn't push the other linked articles off the screen.
const EXCERPT_PREVIEW_COUNT = 3;

function LinkedExcerpts({
  articleId,
  excerpts,
  onNavigate,
}: {
  articleId: string;
  excerpts: import('../types').Excerpt[];
  onNavigate: (view: View) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? excerpts : excerpts.slice(0, EXCERPT_PREVIEW_COUNT);
  const hidden = excerpts.length - shown.length;

  return (
    <div className="linked-excerpts">
      {shown.map((ex) => (
        <div key={ex.id} className="linked-excerpt">
          <button
            type="button"
            className="linked-excerpt-quote"
            onClick={() => onNavigate({ name: 'article-detail', articleId, excerptId: ex.id })}
            aria-label={`Open this excerpt in the article${ex.page !== undefined ? `, page ${ex.page}` : ''}`}
          >
            {ex.quote}
            {ex.page !== undefined && <span className="linked-excerpt-page"> · p. {ex.page}</span>}
          </button>
          {ex.comment && (
            <div className="linked-excerpt-comment">
              <MarkdownPreview content={ex.comment} />
            </div>
          )}
        </div>
      ))}
      {excerpts.length > EXCERPT_PREVIEW_COUNT && (
        <button
          type="button"
          className="linked-excerpts-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
    </div>
  );
}

// ── Ask the Pile Section ──

const PILE_SOURCE_LABEL = 'Built from abstracts, AI summaries and your excerpts — not full texts.';

function AskThePileSection({
  question,
  linked,
  onSaveNote,
  themeColor,
}: {
  question: FlatQuestion;
  linked: import('../types').LibraryArticle[];
  onSaveNote: (content: string) => void;
  themeColor: string;
}) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PileSynthesis | null>(null);
  const [saved, setSaved] = useState(false);

  const handleAsk = async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      setResult(await askThePile(question, linked, await getToken()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to synthesize the linked papers.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!result) return;
    const date = new Date().toLocaleDateString();
    onSaveNote(`**Ask the pile** (${date}, ${result.used.length} papers) — _${PILE_SOURCE_LABEL}_\n\n${result.text}`);
    setSaved(true);
  };

  return (
    <div>
      <div className="detail-label" style={readableTextVars(themeColor) as React.CSSProperties}>
        <Icon name="cpu" size={12} /> Ask the Pile
      </div>

      {linked.length === 0 ? (
        <div className="linked-article-hint">
          Link papers to this question, then ask what they say about it.
        </div>
      ) : loading ? (
        <div className="ai-summary-loading" role="status" aria-live="polite">
          <span className="ai-summary-spinner" />
          Reading {linked.length} linked paper{linked.length !== 1 ? 's' : ''}...
        </div>
      ) : result ? (
        <div className="ai-summary">
          <div className="ai-summary-hint ai-summary-source">
            {PILE_SOURCE_LABEL} {result.used.length} paper{result.used.length !== 1 ? 's' : ''} used
            {result.skipped.length > 0 &&
              `; left out for having no abstract, summary or excerpt: ${result.skipped.map((a) => a.title).join('; ')}`}
            .
          </div>
          <div className="ai-summary-text markdown-preview">
            <ReactMarkdown>{result.text}</ReactMarkdown>
          </div>
          <div className="pile-actions">
            <button className="btn btn-sm" onClick={handleSave} disabled={saved}>
              {saved ? 'Saved as a note' : 'Save as note'}
            </button>
            <button className="btn btn-sm" onClick={handleAsk}>
              Ask again
            </button>
          </div>
        </div>
      ) : (
        <div className="ai-summary-empty">
          <button className="btn btn-sm btn-summarize" onClick={handleAsk}>
            Ask the pile
          </button>
          <div className="ai-summary-hint">
            {linked.length === 1
              ? 'What does your 1 linked paper say'
              : `What do your ${linked.length} linked papers say`}{' '}
            about this question, and which to read next? {PILE_SOURCE_LABEL}
          </div>
        </div>
      )}
      {error && <div className="ai-summary-error ai-summary-failed" role="alert">{error}</div>}
    </div>
  );
}

// ── Suggested Searches Section ──

function SuggestedSearches({
  question,
  phrases,
  onSave,
  onSearch,
  themeColor,
}: {
  question: import('../types').FlatQuestion;
  phrases: string[];
  onSave: (phrases: string[]) => void;
  onSearch: (phrase: string) => void;
  themeColor: string;
}) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateSearchPhrases(question, await getToken());
      onSave(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate search phrases.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="detail-label" style={readableTextVars(themeColor) as React.CSSProperties}>
        <Icon name="search" size={12} /> Suggested Searches
      </div>

      {phrases.length > 0 ? (
        <>
          <div className="suggested-phrases">
            {phrases.map((phrase, i) => (
              <button
                key={i}
                className="suggested-phrase"
                onClick={() => onSearch(phrase)}
                aria-label={`Search for "${phrase}"`}
              >
                <Icon name="search" size={11} />
                {phrase}
              </button>
            ))}
          </div>
          <button
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Regenerating...' : 'Regenerate'}
          </button>
        </>
      ) : (
        <div>
          {loading ? (
            <div className="ai-summary-loading" role="status" aria-live="polite">
              <span className="ai-summary-spinner" />
              Generating search phrases...
            </div>
          ) : (
            <button className="btn btn-sm btn-summarize" onClick={handleGenerate}>
              Generate search phrases
            </button>
          )}
          {error && <div className="ai-summary-error" role="alert">{error}</div>}
        </div>
      )}
    </div>
  );
}

// ── Related Questions Section ──
//
// Mirrors LinkedArticlesSection, down to the CSS classes: a list of rows that
// navigate, an unlink button per row, and a picker to add one. The link is
// symmetric, so both add and remove are handled by useUserData rather than
// here — this component never touches the other side itself.

function RelatedQuestionsSection({
  questionId,
  related,
  allQuestions,
  onNavigate,
  relateQuestions,
  unrelateQuestions,
  themeColor,
}: {
  questionId: string;
  related: FlatQuestion[];
  allQuestions: FlatQuestion[];
  onNavigate: (view: View) => void;
  relateQuestions: (questionId: string, relatedQuestionId: string) => void;
  unrelateQuestions: (questionId: string, relatedQuestionId: string) => void;
  themeColor: string;
}) {
  const [showSelect, setShowSelect] = useState(false);
  const relatedIds = new Set(related.map((r) => r.id));
  // Everything except this question and the ones already linked.
  const available = allQuestions.filter(
    (q) => q.id !== questionId && !relatedIds.has(q.id)
  );

  return (
    <div>
      <div className="detail-label" style={readableTextVars(themeColor) as React.CSSProperties}>
        <Icon name="orbit" size={12} /> Related Questions ({related.length})
      </div>

      {related.length === 0 && !showSelect && (
        <div className="linked-article-hint">
          Nothing linked yet. Relate questions that are one idea at different
          grain sizes, two directions of one program, or where one is a
          prerequisite for another.
        </div>
      )}

      {related.map((r) => (
        <div key={r.id} className="linked-article-item">
          <button
            className="linked-article-title"
            onClick={() => onNavigate({ name: 'question-detail', questionId: r.id })}
          >
            <span className="linked-article-dot" style={{ background: r.themeColor }} />
            <span>
              {r.q}
              <span className="linked-article-meta">{r.themeLabel}</span>
            </span>
          </button>
          <button
            className="btn btn-icon btn-sm btn-danger"
            onClick={() => unrelateQuestions(questionId, r.id)}
            aria-label={`Unlink related question: ${r.q}`}
            style={{ fontSize: 11, flexShrink: 0 }}
          >
            <Icon name="trash" size={11} />
          </button>
        </div>
      ))}

      {showSelect ? (
        available.length > 0 ? (
          <select
            aria-label="Relate another question to this one"
            className="linked-article-select"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                relateQuestions(questionId, e.target.value);
                setShowSelect(false);
              }
            }}
          >
            <option value="">Select a question to relate...</option>
            {available.map((q) => (
              <option key={q.id} value={q.id}>
                {q.themeLabel} — {q.q.length > 70 ? `${q.q.slice(0, 70)}…` : q.q}
              </option>
            ))}
          </select>
        ) : (
          <div className="linked-article-hint">
            Every other question in this project is already related to this one.
          </div>
        )
      ) : (
        available.length > 0 && (
          <button
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => setShowSelect(true)}
          >
            + Relate Question
          </button>
        )
      )}
    </div>
  );
}
