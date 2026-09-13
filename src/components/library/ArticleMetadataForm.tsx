import { useState } from 'react';
import type { LibraryArticle } from '../../types';

export type ArticleMetadataPatch = Partial<
  Pick<LibraryArticle, 'title' | 'authors' | 'year' | 'journal' | 'doi' | 'url' | 'abstract' | 'isOpenAccess'>
>;

interface ArticleMetadataFormProps {
  article: LibraryArticle;
  onSave: (patch: ArticleMetadataPatch) => void;
  onCancel: () => void;
}

/** One author per line, because "Last, First" names already contain the comma. */
const parseAuthors = (text: string): string[] =>
  text
    .split('\n')
    .map((a) => a.trim())
    .filter(Boolean);

const blankToNull = (s: string): string | null => (s.trim() ? s.trim() : null);

/**
 * Edits an article's bibliographic metadata in place.
 *
 * The MCP's journal_update_article could always change these; the app could
 * only show them. Only changed fields are saved, so opening the form and
 * saving without edits writes nothing.
 */
export default function ArticleMetadataForm({
  article,
  onSave,
  onCancel,
}: ArticleMetadataFormProps): React.ReactElement {
  const [title, setTitle] = useState(article.title);
  const [authors, setAuthors] = useState(article.authors.join('\n'));
  const [year, setYear] = useState(article.year ? String(article.year) : '');
  const [journal, setJournal] = useState(article.journal ?? '');
  const [doi, setDoi] = useState(article.doi ?? '');
  const [url, setUrl] = useState(article.url ?? '');
  const [abstract, setAbstract] = useState(article.abstract ?? '');
  const [isOpenAccess, setIsOpenAccess] = useState(article.isOpenAccess);

  const parsedYear = year.trim() === '' ? null : Number.parseInt(year, 10);
  const yearInvalid = parsedYear !== null && (!Number.isFinite(parsedYear) || parsedYear < 0);

  const save = () => {
    if (!title.trim() || yearInvalid) return;
    const patch: ArticleMetadataPatch = {};
    if (title.trim() !== article.title) patch.title = title.trim();
    const nextAuthors = parseAuthors(authors);
    if (nextAuthors.join('\n') !== article.authors.join('\n')) patch.authors = nextAuthors;
    if (parsedYear !== article.year) patch.year = parsedYear;
    if (blankToNull(journal) !== article.journal) patch.journal = blankToNull(journal);
    if (blankToNull(doi) !== article.doi) patch.doi = blankToNull(doi);
    if (blankToNull(url) !== article.url) patch.url = blankToNull(url);
    if (blankToNull(abstract) !== article.abstract) patch.abstract = blankToNull(abstract);
    if (isOpenAccess !== article.isOpenAccess) patch.isOpenAccess = isOpenAccess;
    if (Object.keys(patch).length > 0) onSave(patch);
    onCancel();
  };

  const id = (field: string) => `article-meta-${field}-${article.id}`;

  return (
    <div className="study-inline-form">
      <label className="detail-label" htmlFor={id('title')}>
        Title
      </label>
      <input
        id={id('title')}
        className="text-input"
        type="text"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="detail-label" htmlFor={id('authors')}>
        Authors (one per line)
      </label>
      <textarea
        id={id('authors')}
        className="text-input"
        rows={3}
        value={authors}
        onChange={(e) => setAuthors(e.target.value)}
      />

      <div className="hypothesis-edit-fields">
        <div>
          <label className="detail-label" htmlFor={id('year')}>
            Year
          </label>
          <input
            id={id('year')}
            className="text-input study-label-input"
            type="text"
            inputMode="numeric"
            value={year}
            aria-invalid={yearInvalid}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div>
          <label className="detail-label" htmlFor={id('doi')}>
            DOI
          </label>
          <input
            id={id('doi')}
            className="text-input"
            type="text"
            value={doi}
            placeholder="10.1234/…"
            onChange={(e) => setDoi(e.target.value)}
          />
        </div>
      </div>

      <label className="detail-label" htmlFor={id('journal')}>
        Journal or venue
      </label>
      <input
        id={id('journal')}
        className="text-input"
        type="text"
        value={journal}
        onChange={(e) => setJournal(e.target.value)}
      />

      <label className="detail-label" htmlFor={id('url')}>
        URL
      </label>
      <input
        id={id('url')}
        className="text-input"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />

      <label className="detail-label" htmlFor={id('abstract')}>
        Abstract — the paper's own, or a neutral summary. Your reading of it goes in Notes.
      </label>
      <textarea
        id={id('abstract')}
        className="text-input"
        rows={5}
        value={abstract}
        onChange={(e) => setAbstract(e.target.value)}
      />

      <label className="study-checkbox">
        <input
          type="checkbox"
          checked={isOpenAccess}
          onChange={(e) => setIsOpenAccess(e.target.checked)}
        />
        Open access
      </label>

      <div className="study-inline-form-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={!title.trim() || yearInvalid}
        >
          Save
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
