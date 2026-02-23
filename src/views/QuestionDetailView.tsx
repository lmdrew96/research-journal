import { useState } from 'react';
import type { View, QuestionStatus, ArticleStatus } from '../types';
import { getQuestionById } from '../data/research-themes';
import { useUserData } from '../hooks/useUserData';
import StarToggle from '../components/common/StarToggle';
import TagPill from '../components/common/TagPill';
import StatusBadge from '../components/questions/StatusBadge';
import SourceList from '../components/questions/SourceList';
import NotesList from '../components/notes/NotesList';
import Icon from '../components/common/Icon';

interface QuestionDetailViewProps {
  questionId: string;
  onNavigate: (view: View) => void;
}

export default function QuestionDetailView({
  questionId,
  onNavigate,
}: QuestionDetailViewProps) {
  const question = getQuestionById(questionId);
  const {
    getQuestionData, setStatus, toggleStar, addNote, updateNote, deleteNote,
    getArticlesForQuestion, linkQuestion, unlinkQuestion, data,
  } = useUserData();

  if (!question) {
    return (
      <div className="main-inner">
        <p style={{ color: 'var(--text-dim)' }}>Question not found.</p>
      </div>
    );
  }

  const qData = getQuestionData(questionId);

  return (
    <div className="main-inner">
      <button
        className="back-btn"
        onClick={() => onNavigate({ name: 'questions' })}
        style={{ marginTop: 24 }}
      >
        &#x2190; Back to Questions
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
            <h2
              style={{
                fontSize: 20,
                fontWeight: 400,
                color: 'var(--text-heading)',
                lineHeight: 1.4,
                marginBottom: 12,
              }}
            >
              {question.q}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {question.tags.map((tag) => (
                  <TagPill key={tag} tag={tag} />
                ))}
              </div>
              <StatusBadge status={qData.status} />
              <select
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
            </div>
          </div>
        </div>
      </div>

      <div className="detail-layout">
        {/* Left column: reference material */}
        <div>
          <div className="detail-column-title">Reference</div>

          <div className="detail-section">
            <div className="detail-label" style={{ color: question.themeColor }}>
              Why This Matters
            </div>
            <p className="detail-text">{question.why}</p>
          </div>

          <div className="detail-section">
            <div className="detail-label" style={{ color: '#2ECC71' }}>
              &rarr; ChaosLimb&#x103; Implication
            </div>
            <p className="detail-text implication-text">
              {question.appImplication}
            </p>
          </div>

          <div className="detail-section">
            <SourceList
              questionId={questionId}
              originalSources={question.sources}
              themeColor={question.themeColor}
            />
          </div>

          <div className="detail-section">
            <LinkedArticlesSection
              questionId={questionId}
              onNavigate={onNavigate}
              getArticlesForQuestion={getArticlesForQuestion}
              linkQuestion={linkQuestion}
              unlinkQuestion={unlinkQuestion}
              allArticles={data.library}
              themeColor={question.themeColor}
            />
          </div>
        </div>

        {/* Right column: research notes */}
        <div>
          <div className="detail-column-title">
            Research Notes ({qData.notes.length})
          </div>
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
  'key-source': 'var(--theme-affect)',
};

const statusLabels: Record<ArticleStatus, string> = {
  'to-read': 'To Read',
  reading: 'Reading',
  done: 'Done',
  'key-source': 'Key Source',
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
      <div className="detail-label" style={{ color: themeColor }}>
        <Icon name="book-open" size={12} /> Linked Articles ({linked.length})
      </div>

      {linked.length === 0 && !showSelect && (
        <div className="linked-article-hint">
          No articles linked yet. Save papers from Search and link them here.
        </div>
      )}

      {linked.map((article) => (
        <div key={article.id} className="linked-article-item">
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
              </span>
            </span>
          </button>
          <button
            className="btn btn-icon btn-sm btn-danger"
            onClick={() => unlinkQuestion(article.id, questionId)}
            title="Unlink article"
            style={{ fontSize: 11, flexShrink: 0 }}
          >
            &#x2715;
          </button>
        </div>
      ))}

      {showSelect ? (
        unlinked.length > 0 ? (
          <select
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
