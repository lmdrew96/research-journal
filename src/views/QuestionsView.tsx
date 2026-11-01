import { useState, useCallback } from 'react';
import type { View } from '../types';
import { useUserData } from '../hooks/useUserData';
import StarToggle from '../components/common/StarToggle';
import StatusBadge from '../components/questions/StatusBadge';
import Icon from '../components/common/Icon';
import { readableTextVars } from '../lib/tag-color';
import TagPill from '../components/common/TagPill';

interface QuestionsViewProps {
  onNavigate: (view: View) => void;
  initialThemeId?: string;
}

export default function QuestionsView({ onNavigate, initialThemeId }: QuestionsViewProps) {
  const { themes, thoughts, getAllQuestions, getQuestionData, getArticlesForQuestion, toggleStar, viewState, setViewState } = useUserData();
  // Themes are a label on threads now, not a page of their own: one flat list,
  // narrowed by label. A theme link from elsewhere arrives as the filter.
  const [labelFilter, setLabelFilter] = useState<string | null>(initialThemeId ?? null);
  // Remembered per project, so returning to Threads reopens what you had
  // open instead of collapsing everything back down.
  const [expandedQ, setExpandedQRaw] = useState<string | null>(
    () => viewState.expandedQuestion ?? null
  );
  const setExpandedQ = useCallback(
    (next: string | null) => {
      setExpandedQRaw(next);
      setViewState({ expandedQuestion: next });
    },
    [setViewState]
  );

  const allThreads = getAllQuestions();
  const threads = labelFilter ? allThreads.filter((q) => q.themeId === labelFilter) : allThreads;

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">Research Lab</div>
        <h1 className="view-header-title">Threads</h1>
        <p className="view-header-subtitle">
          {allThreads.length} thread{allThreads.length !== 1 ? 's' : ''}: ideas that run across your sources and fill up as you keep thoughts.
        </p>
        <button
          className="btn btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => onNavigate({ name: 'manage-themes' })}
        >
          <Icon name="settings" size={13} /> Edit threads &amp; labels
        </button>
      </div>

      {themes.length > 1 && (
        <div className="library-status-pills" role="group" aria-label="Filter threads by label">
          <button
            type="button"
            className={`library-pill ${labelFilter === null ? 'active' : ''}`}
            aria-pressed={labelFilter === null}
            onClick={() => setLabelFilter(null)}
          >
            All
            <span className="library-pill-count">{allThreads.length}</span>
          </button>
          {themes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`library-pill ${labelFilter === theme.id ? 'active' : ''}`}
              aria-pressed={labelFilter === theme.id}
              onClick={() => setLabelFilter(labelFilter === theme.id ? null : theme.id)}
            >
              <span className="thread-label-dot" style={{ background: theme.color }} aria-hidden="true" />
              {theme.theme}
              <span className="library-pill-count">{theme.questions.length}</span>
            </button>
          ))}
        </div>
      )}

      {threads.length === 0 && (
        <p className="thoughts-empty">
          {allThreads.length === 0
            ? 'No threads yet. Add one from Edit threads & labels.'
            : 'No threads carry this label.'}
        </p>
      )}

      <div className="thread-list">
        {threads.map((q) => {
          const qId = q.id;
          const isExpanded = expandedQ === qId;
          const qData = getQuestionData(qId);
          const linkedArticles = getArticlesForQuestion(qId);
          const thoughtCount = thoughts.filter((t) => t.questionIds.includes(qId)).length;
          const labelVars = readableTextVars(q.themeColor) as React.CSSProperties;

          return (
            <div
              key={qId}
              className={`question-card ${isExpanded ? 'expanded' : ''}`}
              style={{
                '--theme-color-alpha-light': q.themeColor + '30',
              } as React.CSSProperties}
            >
              <div
                className="question-header"
                onClick={() => setExpandedQ(isExpanded ? null : qId)}
              >
                <StarToggle
                  active={qData.starred}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStar(qId);
                  }}
                />
                <div className="question-text">
                  <p>{q.q}</p>
                  <div className="question-meta">
                    {/* Theme colours are user-chosen, so the dot takes the raw
                        colour and the word takes the calibrated text pair. */}
                    <span className="thread-label" style={labelVars}>
                      <span className="thread-label-dot" style={{ background: q.themeColor }} aria-hidden="true" />
                      {q.themeLabel}
                    </span>
                    <div className="question-tags">
                      {q.tags.map((tag) => (
                        <TagPill key={tag} tag={tag} />
                      ))}
                    </div>
                    {qData.status !== 'not_started' && (
                      <StatusBadge status={qData.status} />
                    )}
                    {thoughtCount > 0 && (
                      <span className="note-count-badge">
                        {thoughtCount} thought{thoughtCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {linkedArticles.length > 0 && (
                      <span className="note-count-badge">
                        {linkedArticles.length} source{linkedArticles.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {qData.notes.length > 0 && (
                      <span className="note-count-badge">
                        {qData.notes.length} note{qData.notes.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="question-chevron"
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} thread: ${q.q}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedQ(isExpanded ? null : qId);
                  }}
                >
                  <Icon name="chevron-right" size={14} />
                </button>
              </div>

              {isExpanded && (
                <div className="question-detail">
                  {q.why && (
                    <div className="detail-section">
                      <div className="detail-label" style={labelVars}>
                        Why This Matters
                      </div>
                      <p className="detail-text">{q.why}</p>
                    </div>
                  )}

                  {q.appImplication && (
                    <div className="detail-section">
                      <div className="detail-label detail-label-success">
                        &rarr; Practical Implication
                      </div>
                      <p className="detail-text implication-text">
                        {q.appImplication}
                      </p>
                    </div>
                  )}

                  {/* Sources linked to this thread, which is usually what
                      "sources" means in practice. The reference list below is
                      the thread's own notes on where to look, hidden when empty. */}
                  {linkedArticles.length > 0 && (
                    <div className="detail-section">
                      <div className="detail-label" style={{ color: 'var(--text-dim)' }}>
                        Linked sources
                      </div>
                      {linkedArticles.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="source-item source-item-article"
                          onClick={() => onNavigate({ name: 'article-detail', articleId: a.id })}
                        >
                          <Icon name="book-open" size={12} /> {a.title}
                          {a.year ? ` (${a.year})` : ''}
                        </button>
                      ))}
                    </div>
                  )}

                  {q.sources.length > 0 && (
                    <div className="detail-section">
                      <div className="detail-label" style={{ color: 'var(--text-dim)' }}>
                        References
                      </div>
                      {q.sources.map((src, si) => (
                        <div key={si} className="source-item">
                          {src.doi ? (
                            <span>
                              <Icon name="file-text" size={12} /> {src.text} {' \u2014 '}
                              <a
                                href={`https://doi.org/${src.doi}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                DOI
                              </a>
                            </span>
                          ) : (
                            <span><Icon name="lightbulb" size={12} /> {src.text}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    className="open-detail-btn"
                    onClick={() =>
                      onNavigate({
                        name: 'question-detail',
                        questionId: qId,
                      })
                    }
                  >
                    Open thread &rarr;
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
