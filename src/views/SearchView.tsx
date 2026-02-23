import type { View } from '../types';
import { useSearch } from '../hooks/useSearch';

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
  const { query, search, results } = useSearch();

  const handleResultClick = (result: (typeof results)[0]) => {
    if (result.questionId) {
      onNavigate({ name: 'question-detail', questionId: result.questionId });
    } else if (result.type === 'journal') {
      onNavigate({ name: 'journal' });
    }
  };

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">Find</div>
        <h1 className="view-header-title">Search</h1>
        <p className="view-header-subtitle">
          Search across questions, notes, journal entries, and sources.
        </p>
      </div>

      <div className="search-input-container">
        <span className="search-icon">{'\uD83D\uDD0D'}</span>
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
            fontFamily: 'var(--font-mono)',
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
          <div className="empty-state-icon">{'\uD83D\uDD0D'}</div>
          <p className="empty-state-text">
            No results for "{query}". Try different keywords or check your spelling.
          </p>
        </div>
      )}
    </div>
  );
}
