import { useState } from 'react';
import type { View } from '../types';
import type { ScholarPaper } from '../services/scholarSearch';
import { useSearch } from '../hooks/useSearch';
import { useUserData } from '../hooks/useUserData';
import { searchScholar } from '../services/scholarSearch';
import Icon from '../components/common/Icon';

interface SearchViewProps {
  onNavigate: (view: View) => void;
}

const typeColors: Record<string, string> = {
  question: 'var(--theme-nonlinear)',
  note: 'var(--theme-cognitive)',
  journal: 'var(--theme-affect)',
  source: 'var(--theme-ai-tech)',
};

export default function SearchView({ onNavigate }: SearchViewProps) {
  const [activeTab, setActiveTab] = useState<'local' | 'scholar'>('local');

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">Find</div>
        <h1 className="view-header-title">Search</h1>
        <p className="view-header-subtitle">
          {activeTab === 'local'
            ? 'Search across questions, notes, journal entries, and sources.'
            : 'Search peer-reviewed academic literature.'}
        </p>
      </div>

      <div className="search-tabs">
        <button
          className={`search-tab ${activeTab === 'local' ? 'active' : ''}`}
          onClick={() => setActiveTab('local')}
        >
          My Notes
        </button>
        <button
          className={`search-tab ${activeTab === 'scholar' ? 'active' : ''}`}
          onClick={() => setActiveTab('scholar')}
        >
          Find Papers
        </button>
      </div>

      {activeTab === 'local' ? (
        <LocalSearchTab onNavigate={onNavigate} />
      ) : (
        <ScholarSearchTab />
      )}
    </div>
  );
}

// ---------- Local Search Tab (existing behavior) ----------

function LocalSearchTab({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { query, search, results } = useSearch();

  const handleResultClick = (result: (typeof results)[0]) => {
    if (result.questionId) {
      onNavigate({ name: 'question-detail', questionId: result.questionId });
    } else if (result.type === 'journal') {
      onNavigate({ name: 'journal' });
    }
  };

  return (
    <>
      <div className="search-input-container">
        <span className="search-icon"><Icon name="search" size={15} /></span>
        <input
          className="search-input"
          type="text"
          placeholder="Search your research..."
          value={query}
          onChange={(e) => search(e.target.value)}
          autoFocus
        />
      </div>

      {query.length >= 2 && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-ghost)',
            marginBottom: 16,
          }}
        >
          {results.length} result{results.length !== 1 ? 's' : ''}
        </div>
      )}

      {results.map((result, i) => (
        <div
          key={i}
          className="search-result"
          onClick={() => handleResultClick(result)}
        >
          <div
            className="search-result-type"
            style={{ color: typeColors[result.type] || 'var(--text-dim)' }}
          >
            {result.type}
          </div>
          <div className="search-result-title">{result.title}</div>
          <div className="search-result-excerpt">{result.excerpt}</div>
        </div>
      ))}

      {query.length >= 2 && results.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="search" size={32} /></div>
          <p className="empty-state-text">
            No results for "{query}". Try different keywords or check your
            spelling.
          </p>
        </div>
      )}
    </>
  );
}

// ---------- Scholar Search Tab ----------

function ScholarSearchTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScholarPaper[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [openAccessOnly, setOpenAccessOnly] = useState(false);

  const { addToLibrary, isInLibrary } = useUserData();

  const handleSearch = async (oaOverride?: boolean) => {
    const trimmed = query.trim();
    if (trimmed.length < 3) return;

    const oa = oaOverride ?? openAccessOnly;

    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    setPage(1);

    try {
      const data = await searchScholar(trimmed, { openAccessOnly: oa });
      setResults(data.papers);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Try again.');
      setResults([]);
      setTotal(0);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLoadMore = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 3) return;

    const nextPage = page + 1;
    setIsLoadingMore(true);
    setError(null);

    try {
      const data = await searchScholar(trimmed, {
        page: nextPage,
        openAccessOnly,
      });
      setResults((prev) => [...prev, ...data.papers]);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more results.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleToggleOA = () => {
    const next = !openAccessOnly;
    setOpenAccessOnly(next);
    if (hasSearched) {
      handleSearch(next);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSave = (paper: ScholarPaper) => {
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
    });
  };

  return (
    <>
      <div className="search-input-container">
        <span className="search-icon"><Icon name="search" size={15} /></span>
        <input
          className="search-input"
          type="text"
          placeholder="Search peer-reviewed literature..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>

      <div className="scholar-search-bar">
        <div className="scholar-search-hint">
          Press Enter to search academic literature
        </div>
        <button
          className={`btn btn-sm btn-oa-filter ${openAccessOnly ? 'active' : ''}`}
          onClick={handleToggleOA}
        >
          Open Access only
        </button>
      </div>

      {isSearching && (
        <div className="scholar-loading">
          <div className="scholar-loading-dot" />
          Searching academic literature...
        </div>
      )}

      {error && (
        <div className="scholar-error">
          {error}
        </div>
      )}

      {!isSearching && hasSearched && results.length > 0 && (
        <div className="scholar-result-count">
          Showing {results.length} of {total.toLocaleString()} results
        </div>
      )}

      {!isSearching &&
        results.map((paper) => {
          const doi = paper.externalIds?.DOI || null;
          const saved = isInLibrary(doi, paper.title);

          return (
            <ScholarResultCard
              key={paper.paperId}
              paper={paper}
              saved={saved}
              onSave={() => handleSave(paper)}
            />
          );
        })}

      {!isSearching && results.length > 0 && results.length < total && (
        <div className="scholar-load-more">
          <button
            className="btn btn-sm"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? 'Loading...' : 'Load more results'}
          </button>
        </div>
      )}

      {isLoadingMore && (
        <div className="scholar-loading">
          <div className="scholar-loading-dot" />
          Loading more results...
        </div>
      )}

      {!isSearching && hasSearched && results.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="book-open" size={32} /></div>
          <p className="empty-state-text">
            No papers found for "{query}". Try broader keywords or a different
            phrasing.
          </p>
        </div>
      )}
    </>
  );
}

// ---------- Scholar Result Card ----------

function ScholarResultCard({
  paper,
  saved,
  onSave,
}: {
  paper: ScholarPaper;
  saved: boolean;
  onSave: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const doi = paper.externalIds?.DOI || null;

  const authors = paper.authors.map((a) => a.name);
  const authorStr =
    authors.length > 4
      ? `${authors.slice(0, 3).join(', ')} + ${authors.length - 3} more`
      : authors.join(', ');

  const abstract = paper.abstract || '';
  const showExpand = abstract.length > 200;
  const displayAbstract =
    expanded || !showExpand ? abstract : abstract.slice(0, 200) + '...';

  const metaParts: string[] = [];
  if (paper.year) metaParts.push(String(paper.year));
  if (paper.journal?.name) metaParts.push(paper.journal.name);
  if (paper.citationCount > 0)
    metaParts.push(
      `${paper.citationCount} citation${paper.citationCount !== 1 ? 's' : ''}`
    );

  return (
    <div className="scholar-result">
      <div className="scholar-result-title">
        {paper.url ? (
          <a href={paper.url} target="_blank" rel="noopener noreferrer">
            {paper.title}
          </a>
        ) : (
          paper.title
        )}
      </div>

      {authorStr && <div className="scholar-result-authors">{authorStr}</div>}

      {metaParts.length > 0 && (
        <div className="scholar-result-meta">
          {metaParts.join(' · ')}
          {paper.isOpenAccess && <span className="oa-badge">Open Access</span>}
        </div>
      )}

      {abstract && (
        <div className="scholar-result-abstract">
          {displayAbstract}
          {showExpand && (
            <button
              className="scholar-expand-btn"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      <div className="scholar-result-actions">
        <button
          className={`btn btn-sm btn-save ${saved ? 'saved' : ''}`}
          onClick={onSave}
          disabled={saved}
        >
          {saved ? 'Saved' : 'Save to Library'}
        </button>
        {doi && (
          <a
            className="scholar-doi-link"
            href={`https://doi.org/${doi}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            DOI
          </a>
        )}
        {paper.oaUrl && (
          <a
            className="scholar-doi-link"
            href={paper.oaUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            PDF
          </a>
        )}
      </div>
    </div>
  );
}
