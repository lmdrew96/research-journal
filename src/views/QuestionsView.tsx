import { useState } from 'react';
import type { View } from '../types';
import { researchThemes, getQuestionId } from '../data/research-themes';
import { tagColors } from '../data/tag-colors';
import { useUserData } from '../hooks/useUserData';
import StarToggle from '../components/common/StarToggle';
import StatusBadge from '../components/questions/StatusBadge';
import Icon from '../components/common/Icon';

interface QuestionsViewProps {
  onNavigate: (view: View) => void;
}

export default function QuestionsView({ onNavigate }: QuestionsViewProps) {
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const { getQuestionData, toggleStar } = useUserData();

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">ChaosLimb&#x103; Research Lab</div>
        <h1 className="view-header-title">Research Questions</h1>
        <p className="view-header-subtitle">
          12 questions across 5 themes &mdash; grounded in current SLA,
          cognitive science, and CALL literature.
        </p>
      </div>

      {researchThemes.map((theme) => {
        const isActive = activeTheme === theme.id;
        const r = parseInt(theme.color.slice(1, 3), 16);
        const g = parseInt(theme.color.slice(3, 5), 16);
        const b = parseInt(theme.color.slice(5, 7), 16);

        return (
          <div
            key={theme.id}
            className={`theme-card ${isActive ? 'active' : ''}`}
            style={{
              '--theme-color': theme.color,
              '--theme-color-alpha': theme.color + '40',
              '--theme-color-bg': `rgba(${r},${g},${b},0.04)`,
            } as React.CSSProperties}
          >
            <button
              className="theme-header"
              onClick={() => setActiveTheme(isActive ? null : theme.id)}
            >
              <span className="theme-icon" style={{ color: theme.color }}><Icon name={theme.icon} size={22} /></span>
              <div className="theme-info">
                <div className="theme-name">{theme.theme}</div>
                <div className="theme-desc">{theme.description}</div>
              </div>
              <span className="theme-count" style={{ color: theme.color }}>
                {theme.questions.length}Q
              </span>
              <span className="theme-chevron"><Icon name="chevron-right" size={16} /></span>
            </button>

            {isActive && (
              <div className="theme-questions">
                {theme.questions.map((q, qi) => {
                  const qId = getQuestionId(theme.id, qi);
                  const isExpanded = expandedQ === qId;
                  const qData = getQuestionData(qId);

                  return (
                    <div
                      key={qi}
                      className={`question-card ${isExpanded ? 'expanded' : ''}`}
                      style={{
                        '--theme-color-alpha-light': theme.color + '30',
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
                            <div className="question-tags">
                              {q.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="tag-pill"
                                  style={{
                                    background: (tagColors[tag] || '#666') + '20',
                                    color: tagColors[tag] || '#999',
                                  }}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                            {qData.status !== 'not_started' && (
                              <StatusBadge status={qData.status} />
                            )}
                            {qData.notes.length > 0 && (
                              <span className="note-count-badge">
                                {qData.notes.length} note{qData.notes.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="question-chevron"><Icon name="chevron-right" size={14} /></span>
                      </div>

                      {isExpanded && (
                        <div className="question-detail">
                          <div className="detail-section">
                            <div className="detail-label" style={{ color: theme.color }}>
                              Why This Matters
                            </div>
                            <p className="detail-text">{q.why}</p>
                          </div>

                          <div className="detail-section">
                            <div className="detail-label" style={{ color: '#2ECC71' }}>
                              &rarr; ChaosLimb&#x103; Implication
                            </div>
                            <p className="detail-text implication-text">
                              {q.appImplication}
                            </p>
                          </div>

                          <div className="detail-section">
                            <div className="detail-label" style={{ color: 'var(--text-dim)' }}>
                              Sources
                            </div>
                            {q.sources.map((s, si) => (
                              <div key={si} className="source-item">
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
                          </div>

                          <button
                            className="open-detail-btn"
                            onClick={() =>
                              onNavigate({
                                name: 'question-detail',
                                questionId: qId,
                              })
                            }
                          >
                            Open Research View &rarr;
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="app-footer">
        Sources from Language Learning, Cognitive Science, TESOL Quarterly, J.
        Computer Assisted Learning, and more
      </div>
    </div>
  );
}
