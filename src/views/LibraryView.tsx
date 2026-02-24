import { useState, useMemo } from 'react';
import type { View, ArticleStatus, LibraryArticle } from '../types';
import { useUserData } from '../hooks/useUserData';
import Icon from '../components/common/Icon';

interface LibraryViewProps {
  onNavigate: (view: View) => void;
}

type SortOption = 'newest' | 'oldest' | 'year-desc' | 'year-asc' | 'title';

const statusPills: { value: ArticleStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'to-read', label: 'To Read' },
  { value: 'reading', label: 'Reading' },
  { value: 'done', label: 'Done' },
  { value: 'key-source', label: 'Key Source' },
];

const statusOptions: { value: ArticleStatus; label: string }[] = [
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

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest saved' },
  { value: 'oldest', label: 'Oldest saved' },
  { value: 'year-desc', label: 'Year (newest)' },
  { value: 'year-asc', label: 'Year (oldest)' },
  { value: 'title', label: 'Title A\u2013Z' },
];

function sortArticles(articles: LibraryArticle[], sort: SortOption): LibraryArticle[] {
  const sorted = [...articles];
  switch (sort) {
    case 'newest':
      return sorted.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    case 'oldest':
      return sorted.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    case 'year-desc':
      return sorted.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    case 'year-asc':
      return sorted.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return sorted;
  }
}

export default function LibraryView({ onNavigate }: LibraryViewProps) {
  const { data, updateArticleStatus, getAllQuestions } = useUserData();
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | 'all'>('all');
  const [questionFilter, setQuestionFilter] = useState<string>('all');
  const [oaOnly, setOaOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>('newest');
  const [search, setSearch] = useState('');

  const allQuestions = getAllQuestions();

  // Only show questions that are actually linked to at least one article
  const linkedQuestions = useMemo(() => {
    const linkedIds = new Set(data.library.flatMap((a) => a.linkedQuestions));
    return allQuestions.filter((q) => linkedIds.has(q.id));
  }, [data.library, allQuestions]);

  const filtered = useMemo(() => {
    let articles = data.library;
    if (statusFilter !== 'all') {
      articles = articles.filter((a) => a.status === statusFilter);
    }
    if (questionFilter !== 'all') {
      articles = articles.filter((a) => a.linkedQuestions.includes(questionFilter));
    }
    if (oaOnly) {
      articles = articles.filter((a) => a.isOpenAccess);
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
    return sortArticles(articles, sort);
  }, [data.library, statusFilter, questionFilter, oaOnly, search, sort]);

  const hasActiveFilters = statusFilter !== 'all' || questionFilter !== 'all' || oaOnly || search.length >= 2;

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
        <>
          <div className="library-status-pills">
            {statusPills.map((pill) => (
              <button
                key={pill.value}
                className={`library-pill ${statusFilter === pill.value ? 'active' : ''}`}
                onClick={() => setStatusFilter(pill.value)}
              >
                {pill.label}
                {pill.value !== 'all' && (
                  <span className="library-pill-count">
                    {data.library.filter((a) => a.status === pill.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="library-filters">
            <div className="search-input-container library-search">
              <span className="search-icon"><Icon name="search" size={15} /></span>
              <input
                className="search-input"
                type="text"
                placeholder="Filter by title, author, or journal..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {linkedQuestions.length > 0 && (
              <select
                className="status-select"
                value={questionFilter}
                onChange={(e) => setQuestionFilter(e.target.value)}
              >
                <option value="all">All questions</option>
                {linkedQuestions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.q.length > 50 ? q.q.slice(0, 50) + '...' : q.q}
                  </option>
                ))}
              </select>
            )}

            <button
              className={`btn btn-sm btn-oa-filter ${oaOnly ? 'active' : ''}`}
              onClick={() => setOaOnly(!oaOnly)}
            >
              Open Access
            </button>

            <select
              className="status-select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <div className="library-result-count">
              {filtered.length} of {data.library.length} articles
            </div>
          )}
        </>
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
          <div className="empty-state-icon"><Icon name="search" size={32} /></div>
          <p className="empty-state-text">
            No articles match your filters.
          </p>
        </div>
      )}

      {data.library.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="book-open" size={32} /></div>
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

  const notePreview = article.notes
    ? article.notes.length > 120 ? article.notes.slice(0, 120) + '...' : article.notes
    : null;

  const excerptPreview = !notePreview && article.excerpts.length > 0
    ? article.excerpts[0].quote.length > 120
      ? article.excerpts[0].quote.slice(0, 120) + '...'
      : article.excerpts[0].quote
    : null;

  return (
    <div className="library-card" onClick={onOpen}>
      <div className="library-card-header">
        <div className="library-card-title">{article.title}</div>
        {article.isOpenAccess && <span className="oa-badge">Open Access</span>}
      </div>

      {authorStr && <div className="library-card-authors">{authorStr}</div>}

      {metaParts.length > 0 && (
        <div className="library-card-meta">{metaParts.join(' \u00B7 ')}</div>
      )}

      {notePreview && (
        <div className="library-card-preview">
          <Icon name="file-text" size={11} />
          {notePreview}
        </div>
      )}

      {excerptPreview && (
        <div className="library-card-preview library-card-preview-quote">
          {'\u201C'}{excerptPreview}{'\u201D'}
        </div>
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
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {statusLabels[article.status]}
        </div>

        <div className="library-card-indicators">
          {article.aiSummary && (
            <span className="library-card-indicator" title="AI summary available">
              <Icon name="cpu" size={11} />
            </span>
          )}

          {article.notes && (
            <span className="library-card-indicator" title="Has notes">
              <Icon name="file-text" size={11} />
            </span>
          )}

          {article.excerpts.length > 0 && (
            <span className="library-card-indicator" title={`${article.excerpts.length} excerpt${article.excerpts.length !== 1 ? 's' : ''}`}>
              <Icon name="clipboard" size={11} />
              {article.excerpts.length}
            </span>
          )}

          {article.linkedQuestions.length > 0 && (
            <span className="library-card-indicator" title={`${article.linkedQuestions.length} linked question${article.linkedQuestions.length !== 1 ? 's' : ''}`}>
              <Icon name="lightbulb" size={11} />
              {article.linkedQuestions.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}