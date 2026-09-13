import { useState } from 'react';
import { useUserData } from '../../hooks/useUserData';
import {
  findMetadataMatch,
  fillEmptyFields,
  UNVERIFIED_METADATA_TAG,
  type ArticleMetadata,
} from '../../../api/_enrich';
import Icon from '../common/Icon';

const parseAuthors = (text: string): string[] =>
  text
    .split('\n')
    .map((a) => a.trim())
    .filter(Boolean);

const blankToNull = (s: string): string | null => (s.trim() ? s.trim() : null);

const PROVIDER_NAME = { openalex: 'OpenAlex', crossref: 'Crossref' } as const;

/**
 * Adds a paper that search can't reach — a book chapter, an older paper, a
 * textbook — by hand.
 *
 * Before this, the only way into the Library was saving a search result. It
 * runs the same OpenAlex/Crossref lookup journal_add_article uses (api/_enrich),
 * so a manual add can't become a way around the metadata cleanup: a confident
 * match fills only the fields left empty, and no match saves exactly what was
 * typed, tagged unverified-metadata.
 */
export default function ManualAddArticle(): React.ReactElement {
  const { addToLibrary } = useUserData();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('');
  const [doi, setDoi] = useState('');
  const [journal, setJournal] = useState('');
  const [url, setUrl] = useState('');
  const [abstract, setAbstract] = useState('');

  const parsedYear = year.trim() === '' ? null : Number.parseInt(year, 10);
  const yearInvalid = parsedYear !== null && (!Number.isFinite(parsedYear) || parsedYear < 0);

  const reset = () => {
    setTitle('');
    setAuthors('');
    setYear('');
    setDoi('');
    setJournal('');
    setUrl('');
    setAbstract('');
  };

  const submit = async () => {
    if (!title.trim() || yearInvalid || busy) return;
    setBusy(true);

    const given: ArticleMetadata = {
      authors: parseAuthors(authors),
      year: parsedYear,
      journal: blankToNull(journal),
      doi: blankToNull(doi),
      url: blankToNull(url),
      abstract: blankToNull(abstract),
      isOpenAccess: false,
    };

    // findMetadataMatch never throws — an unreachable provider becomes a note
    // and a miss, and the article still saves as typed.
    const { match } = await findMetadataMatch({ title: title.trim(), authors: given.authors, doi: given.doi });
    const { metadata, filled } = match
      ? fillEmptyFields(given, match, false)
      : { metadata: given, filled: [] as Array<keyof ArticleMetadata> };

    addToLibrary({
      title: title.trim(),
      ...metadata,
      status: 'to-read',
      source: match ? match.provider : 'manual',
      tags: match ? [] : [UNVERIFIED_METADATA_TAG],
    });

    setReport(
      match
        ? `Added. Matched in ${PROVIDER_NAME[match.provider]}` +
            (filled.length > 0 ? ` — filled ${filled.join(', ')}.` : ' — nothing needed filling.')
        : `Added as typed. No confident match in OpenAlex or Crossref, so it is tagged ${UNVERIFIED_METADATA_TAG}.`
    );
    reset();
    setBusy(false);
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="manual-add-article">
        <button
          type="button"
          className="btn btn-sm btn-labelled"
          onClick={() => {
            setReport(null);
            setOpen(true);
          }}
        >
          <Icon name="plus" size={13} /> Add an article by hand
        </button>
        {report && <p className="library-result-count">{report}</p>}
      </div>
    );
  }

  return (
    <div className="study-inline-form manual-add-article">
      <p className="hypothesis-revise-note">
        For papers search can't find. Fill in what you know — it gets looked up in OpenAlex and
        Crossref, and only the fields you leave empty are filled in.
      </p>

      <label className="detail-label" htmlFor="manual-article-title">
        Title
      </label>
      <input
        id="manual-article-title"
        className="text-input"
        type="text"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="detail-label" htmlFor="manual-article-authors">
        Authors (one per line) — the lead author confirms the match
      </label>
      <textarea
        id="manual-article-authors"
        className="text-input"
        rows={2}
        value={authors}
        onChange={(e) => setAuthors(e.target.value)}
      />

      <div className="hypothesis-edit-fields">
        <div>
          <label className="detail-label" htmlFor="manual-article-year">
            Year
          </label>
          <input
            id="manual-article-year"
            className="text-input study-label-input"
            type="text"
            inputMode="numeric"
            value={year}
            aria-invalid={yearInvalid}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div>
          <label className="detail-label" htmlFor="manual-article-doi">
            DOI (if it has one)
          </label>
          <input
            id="manual-article-doi"
            className="text-input"
            type="text"
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
          />
        </div>
      </div>

      <label className="detail-label" htmlFor="manual-article-journal">
        Journal or venue
      </label>
      <input
        id="manual-article-journal"
        className="text-input"
        type="text"
        value={journal}
        onChange={(e) => setJournal(e.target.value)}
      />

      <label className="detail-label" htmlFor="manual-article-url">
        URL
      </label>
      <input
        id="manual-article-url"
        className="text-input"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />

      <label className="detail-label" htmlFor="manual-article-abstract">
        Abstract — the paper's own, or a neutral summary. Your reading of it goes in Notes.
      </label>
      <textarea
        id="manual-article-abstract"
        className="text-input"
        rows={4}
        value={abstract}
        onChange={(e) => setAbstract(e.target.value)}
      />

      <div className="study-inline-form-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void submit()}
          disabled={!title.trim() || yearInvalid || busy}
        >
          {busy ? 'Looking it up…' : 'Add to library'}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
