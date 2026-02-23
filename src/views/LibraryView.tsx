import { useState, useMemo } from 'react';
import type { View, ArticleStatus, LibraryArticle } from '../types';
import { useUserData } from '../hooks/useUserData';

interface LibraryViewProps {
  onNavigate: (view: View) => void;
}

const statusOptions: { value: ArticleStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'to-read', label: 'To Read' },
  { value: 'reading', label: 'Reading' },
  { value: 'done', label: 'Done' },
  { value: 'key-source', label: 'Key Source' },
];

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

export default function LibraryView({ onNavigate }: LibraryViewProps) {
  const { data, updateArticleStatus } = useUserData();
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let articles = data.library;
    if (statusFilter !== 'all') {
      articles = articles.filter((a) => a.status === statusFilter);
    }
    if (search.trim().length >= 2) {
      const q = search.toLowerCase();
      articles = articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.authors.some((auth) => auth.toLowerCase().includes(q)) ||
          (a.journal && a.journal.toLowerCase().includes(q))
      );
    }
    return articles;
  }, [data.library, statusFilter, search]);

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">Collection</div>
        <h1 className="view-header-title">Library</h1>
        <p className="view-header-subtitle">
          {data.library.length} article{data.library.length !== 1 ? 's' : ''} saved
        </p>
      </div>

      {data.library.length > 0 && (
        <div className="library-filters">
          <select
            className="status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ArticleStatus | 'all')}
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="search-input-container library-search">
            <span className="search-icon">{'\uD83D\uDD0D'}</span>
            <input
              className="search-input"
              type="text"
              placeholder="Filter by title, author, or journal..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {filtered.map((article) => (
        <LibraryCard
          key={article.id}
          article={article}
          onOpen={() => onNavigate({ name: 'article-detail', articleId: article.id })}
          onStatusChange={(status) => updateArticleStatus(article.id, status)}
        />
      ))}

      {data.library.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">{'\uD83D\uDD0D'}</div>
          <p className="empty-state-text">
            No articles match your filters.
          </p>
        </div>
      )}

      {data.library.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">{'\uD83D\uDCDA'}</div>
          <p className="empty-state-text">
            Your library is empty. Go to Search and use "Find Papers" to discover
            and save peer-reviewed articles.
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => onNavigate({ name: 'search' })}
          >
            Find Papers
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Library Card ----------

function LibraryCard({
  article,
  onOpen,
  onStatusChange,
}: {
  article: LibraryArticle;
  onOpen: () => void;
  onStatusChange: (status: ArticleStatus) => void;
}) {
  const authors = article.authors;
  const authorStr =
    authors.length > 3
      ? `${authors.slice(0, 3).join(', ')} + ${authors.length - 3} more`
      : authors.join(', ');

  const metaParts: string[] = [];
  if (article.year) metaParts.push(String(article.year));
  if (article.journal) metaParts.push(article.journal);

  return (
    <div className="library-card" onClick={onOpen}>
      <div className="library-card-title">{article.title}</div>

      {authorStr && <div className="library-card-authors">{authorStr}</div>}

      {metaParts.length > 0 && (
        <div className="library-card-meta">{metaParts.join(' \u00B7 ')}</div>
      )}

      <div className="library-card-footer">
        <div
          className="article-status-badge"
          style={{ color: statusColors[article.status] }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="article-status-dot" style={{ background: statusColors[article.status] }} />
          <select
            className="article-status-select"
            value={article.status}
            onChange={(e) => onStatusChange(e.target.value as ArticleStatus)}
          >
            {statusOptions
              .filter((o) => o.value !== 'all')
              .map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
          </select>
          {statusLabels[article.status]}
        </div>

        {article.linkedQuestions.length > 0 && (
          <span className="library-card-links">
            {article.linkedQuestions.length} linked
          </span>
        )}

        {article.excerpts.length > 0 && (
          <span className="library-card-links">
            {article.excerpts.length} excerpt{article.excerpts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}