import { useMemo } from 'react';
import type { View, ArticleStatus } from '../types';
import { useUserData } from '../hooks/useUserData';
import Icon from '../components/common/Icon';

interface DashboardViewProps {
  onNavigate: (view: View) => void;
}

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

export default function DashboardView({ onNavigate }: DashboardViewProps) {
  const { data, statusCounts, totalNotes, getAllQuestions } = useUserData();
  const allQuestions = getAllQuestions();

  const stats = useMemo(() => {
    const totalExcerpts = data.library.reduce((sum, a) => sum + a.excerpts.length, 0);
    const totalSummaries = data.library.filter((a) => a.aiSummary).length;
    const totalLinks = data.library.reduce((sum, a) => sum + a.linkedQuestions.length, 0);
    const oaCount = data.library.filter((a) => a.isOpenAccess).length;

    const articleStatusCounts: Record<ArticleStatus, number> = {
      'to-read': 0,
      reading: 0,
      done: 0,
      'key-source': 0,
    };
    for (const a of data.library) {
      articleStatusCounts[a.status]++;
    }

    return { totalExcerpts, totalSummaries, totalLinks, oaCount, articleStatusCounts };
  }, [data]);

  // Recent activity: last 5 modified articles
  const recentArticles = useMemo(() => {
    return [...data.library]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5);
  }, [data.library]);

  // Recent journal entries
  const recentJournal = useMemo(() => {
    return data.journal.slice(0, 3);
  }, [data.journal]);

  // Starred questions
  const starredQuestions = useMemo(() => {
    return allQuestions.filter((q) => data.questions[q.id]?.starred);
  }, [allQuestions, data.questions]);

  // Questions with most linked articles
  const activeQuestions = useMemo(() => {
    return allQuestions
      .map((q) => ({
        ...q,
        articleCount: data.library.filter((a) => a.linkedQuestions.includes(q.id)).length,
        status: data.questions[q.id]?.status || 'not_started',
      }))
      .filter((q) => q.articleCount > 0 || q.status !== 'not_started')
      .sort((a, b) => b.articleCount - a.articleCount)
      .slice(0, 5);
  }, [allQuestions, data]);

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">Overview</div>
        <h1 className="view-header-title">Dashboard</h1>
        <p className="view-header-subtitle">
          Your research at a glance.
        </p>
      </div>

      {/* Stats grid */}
      <div className="dashboard-stats">
        <button className="dashboard-stat" onClick={() => onNavigate({ name: 'library' })}>
          <div className="dashboard-stat-value">{data.library.length}</div>
          <div className="dashboard-stat-label">Articles saved</div>
        </button>
        <button className="dashboard-stat" onClick={() => onNavigate({ name: 'questions' })}>
          <div className="dashboard-stat-value">{totalNotes}</div>
          <div className="dashboard-stat-label">Notes written</div>
        </button>
        <button className="dashboard-stat" onClick={() => onNavigate({ name: 'library' })}>
          <div className="dashboard-stat-value">{stats.totalExcerpts}</div>
          <div className="dashboard-stat-label">Excerpts</div>
        </button>
        <button className="dashboard-stat" onClick={() => onNavigate({ name: 'journal' })}>
          <div className="dashboard-stat-value">{data.journal.length}</div>
          <div className="dashboard-stat-label">Journal entries</div>
        </button>
      </div>

      <div className="dashboard-layout">
        {/* Left column */}
        <div>
          {/* Reading progress */}
          {data.library.length > 0 && (
            <div className="dashboard-section">
              <div className="dashboard-section-title">Reading Progress</div>
              <div className="dashboard-progress-bars">
                {(['to-read', 'reading', 'done', 'key-source'] as ArticleStatus[]).map((status) => {
                  const count = stats.articleStatusCounts[status];
                  const pct = data.library.length > 0
                    ? Math.round((count / data.library.length) * 100)
                    : 0;
                  return (
                    <div key={status} className="dashboard-progress-row">
                      <div className="dashboard-progress-label">
                        <span
                          className="dashboard-progress-dot"
                          style={{ background: statusColors[status] }}
                        />
                        {statusLabels[status]}
                      </div>
                      <div className="dashboard-progress-bar">
                        <div
                          className="dashboard-progress-fill"
                          style={{
                            width: `${pct}%`,
                            background: statusColors[status],
                          }}
                        />
                      </div>
                      <div className="dashboard-progress-count">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent articles */}
          {recentArticles.length > 0 && (
            <div className="dashboard-section">
              <div className="dashboard-section-title">Recently Updated Articles</div>
              {recentArticles.map((article) => (
                <button
                  key={article.id}
                  className="dashboard-item"
                  onClick={() => onNavigate({ name: 'article-detail', articleId: article.id })}
                >
                  <div className="dashboard-item-title">{article.title}</div>
                  <div className="dashboard-item-meta">
                    <span
                      className="dashboard-progress-dot"
                      style={{ background: statusColors[article.status] }}
                    />
                    {statusLabels[article.status]}
                    {article.isOpenAccess && <span className="oa-badge">OA</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div>
          {/* Research themes */}
          <div className="dashboard-section">
            <div className="dashboard-section-title">Research Themes</div>
            {data.themes.map((theme) => {
              const qCount = theme.questions.length;
              const activeCount = theme.questions.filter((q) => {
                const status = data.questions[q.id]?.status || 'not_started';
                return status !== 'not_started';
              }).length;
              return (
                <button
                  key={theme.id}
                  className="dashboard-item"
                  onClick={() => onNavigate({ name: 'questions' })}
                >
                  <div className="dashboard-item-title">
                    <span style={{ color: theme.color }}>
                      <Icon name={theme.icon} size={14} />
                    </span>
                    {theme.theme}
                  </div>
                  <div className="dashboard-item-meta">
                    {activeCount}/{qCount} questions active
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active questions */}
          {activeQuestions.length > 0 && (
            <div className="dashboard-section">
              <div className="dashboard-section-title">Active Questions</div>
              {activeQuestions.map((q) => (
                <button
                  key={q.id}
                  className="dashboard-item"
                  onClick={() => onNavigate({ name: 'question-detail', questionId: q.id })}
                >
                  <div className="dashboard-item-title">
                    <span
                      className="dashboard-progress-dot"
                      style={{ background: q.themeColor }}
                    />
                    {q.q.length > 70 ? q.q.slice(0, 70) + '...' : q.q}
                  </div>
                  <div className="dashboard-item-meta">
                    {q.articleCount} article{q.articleCount !== 1 ? 's' : ''} linked
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Recent journal */}
          {recentJournal.length > 0 && (
            <div className="dashboard-section">
              <div className="dashboard-section-title">Recent Journal</div>
              {recentJournal.map((entry) => (
                <button
                  key={entry.id}
                  className="dashboard-item"
                  onClick={() => onNavigate({ name: 'journal' })}
                >
                  <div className="dashboard-item-title">
                    {entry.content.length > 80
                      ? entry.content.slice(0, 80) + '...'
                      : entry.content}
                  </div>
                  <div className="dashboard-item-meta">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Empty state for brand new users */}
      {data.library.length === 0 && data.journal.length === 0 && totalNotes === 0 && (
        <div className="dashboard-empty">
          <div className="dashboard-empty-text">
            Your research journey starts here. Search for papers, save them to your library, and link them to your research questions.
          </div>
          <div className="dashboard-empty-actions">
            <button
              className="btn btn-primary"
              onClick={() => onNavigate({ name: 'search' })}
            >
              Find Papers
            </button>
            <button
              className="btn btn-sm"
              onClick={() => onNavigate({ name: 'questions' })}
            >
              View Questions
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
