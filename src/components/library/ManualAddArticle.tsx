import { useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useUserData } from '../../hooks/useUserData';
import {
  findMetadataMatch,
  openAlexIdField,
  fillEmptyFields,
  normalizeTitle,
  UNVERIFIED_METADATA_TAG,
  type ArticleMetadata,
} from '../../../api/_enrich';
import { lookupCrossrefByDoi, lookupOpenAlexByDoi, normalizeDoi } from '../../../api/_scholar';
import { extractPdfMetadata, uploadPdf } from '../../services/pdf';
import type { LibraryArticle } from '../../types';
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
  const { addToLibrary, updateArticle, library } = useUserData();
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pdfKey, setPdfKey] = useState<string | null>(null);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'uploading' | 'reading'>('idle');
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<LibraryArticle | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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
    setPdfKey(null);
    setPdfNote(null);
    setDuplicate(null);
    setFormError(null);
  };

  /** The title a DOI resolves to (OpenAlex, then Crossref), or null. */
  const titleForDoi = async (d: string): Promise<string | null> => {
    for (const lookup of [lookupOpenAlexByDoi, lookupCrossrefByDoi]) {
      try {
        const paper = await lookup(d);
        if (paper?.title) return paper.title;
      } catch (err) {
        console.warn('[ManualAddArticle] DOI lookup failed:', err);
      }
    }
    return null;
  };

  // Upload first, then read: a failed read still leaves the PDF attached to
  // the form, so nothing Nae picked is lost — she fills the fields herself.
  const handlePdf = async (file: File) => {
    setOpen(true);
    setReport(null);
    setPdfNote(null);
    setDuplicate(null);
    setPdfStatus('uploading');
    try {
      const token = await getToken();
      const key = await uploadPdf(file, token);
      setPdfKey(key);
      setPdfStatus('reading');
      try {
        const md = await extractPdfMetadata(key, token);
        if (md.title) setTitle(md.title);
        if (md.authors.length > 0) setAuthors(md.authors.join('\n'));
        if (md.year) setYear(String(md.year));
        if (md.doi) setDoi(md.doi);
        if (md.journal) setJournal(md.journal);
        if (md.abstract) setAbstract(md.abstract);
        setPdfNote(
          'Filled in from the PDF. Check every field before adding — it is looked up in OpenAlex and Crossref too, which fills what the PDF left blank.'
        );
        const titleKey = md.title ? normalizeTitle(md.title) : null;
        const match = library.find(
          (a) =>
            (md.doi && a.doi && a.doi.toLowerCase() === md.doi.toLowerCase()) ||
            (titleKey && normalizeTitle(a.title) === titleKey)
        );
        setDuplicate(match ?? null);
      } catch (err) {
        setPdfNote(
          `PDF attached, but its details couldn't be read (${err instanceof Error ? err.message : String(err)}). Fill in the form yourself.`
        );
      }
    } catch (err) {
      setPdfNote(err instanceof Error ? err.message : String(err));
    } finally {
      setPdfStatus('idle');
    }
  };

  const attachToDuplicate = () => {
    if (!duplicate || !pdfKey) return;
    updateArticle(duplicate.id, { pdfKey });
    const name = duplicate.title;
    reset();
    setOpen(false);
    setReport(`PDF attached to “${name}”, already in your library.`);
  };

  const pdfPicker = (
    <input
      ref={fileInput}
      type="file"
      accept="application/pdf,.pdf"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void handlePdf(file);
      }}
    />
  );

  const submit = async () => {
    if ((!title.trim() && !doi.trim()) || yearInvalid || busy) return;
    setBusy(true);
    setFormError(null);

    // A DOI alone is enough: it is looked up for the title, and the match
    // below then confirms it and fills the rest.
    const givenDoi = doi.trim() ? normalizeDoi(doi) : null;
    if (givenDoi) {
      const existing = library.find((a) => a.doi && normalizeDoi(a.doi).toLowerCase() === givenDoi.toLowerCase());
      if (existing) {
        setFormError(`“${existing.title}” is already in your library with that DOI.`);
        setBusy(false);
        return;
      }
    }
    let finalTitle = title.trim();
    if (!finalTitle && givenDoi) {
      const found = await titleForDoi(givenDoi);
      if (!found) {
        setFormError("No paper found for that DOI in OpenAlex or Crossref. Check it, or type the title.");
        setBusy(false);
        return;
      }
      finalTitle = found;
    }

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
    const { match } = await findMetadataMatch({ title: finalTitle, authors: given.authors, doi: given.doi });
    const { metadata, filled } = match
      ? fillEmptyFields(given, match, false)
      : { metadata: given, filled: [] as Array<keyof ArticleMetadata> };

    addToLibrary({
      title: finalTitle,
      ...metadata,
      ...(pdfKey ? { pdfKey } : {}),
      status: 'to-read',
      source: match ? match.provider : 'manual',
      ...openAlexIdField(match),
      tags: match ? [] : [UNVERIFIED_METADATA_TAG],
    });

    setReport(
      (match
        ? `Added. Matched in ${PROVIDER_NAME[match.provider]}` +
            (filled.length > 0 ? ` — filled ${filled.join(', ')}.` : ' — nothing needed filling.')
        : `Added as typed. No confident match in OpenAlex or Crossref, so it is tagged ${UNVERIFIED_METADATA_TAG}.`) +
        (pdfKey ? ' PDF attached.' : '')
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
          <Icon name="plus" size={13} /> Add by DOI or by hand
        </button>
        <button type="button" className="btn btn-sm btn-labelled" onClick={() => fileInput.current?.click()}>
          <Icon name="file-text" size={13} /> Add from a PDF
        </button>
        {pdfPicker}
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

      {pdfPicker}
      <div className="manual-add-pdf">
        {pdfStatus === 'uploading' ? (
          <span className="ai-summary-loading" role="status" aria-live="polite">
            <span className="ai-summary-spinner" /> Uploading the PDF…
          </span>
        ) : pdfStatus === 'reading' ? (
          <span className="ai-summary-loading" role="status" aria-live="polite">
            <span className="ai-summary-spinner" /> Reading the PDF — this takes about 15 seconds…
          </span>
        ) : (
          <button type="button" className="btn btn-sm btn-labelled" onClick={() => fileInput.current?.click()}>
            <Icon name="file-text" size={13} /> {pdfKey ? 'Replace the PDF' : 'Start from a PDF'}
          </button>
        )}
        {pdfKey && pdfStatus === 'idle' && <span className="ai-summary-hint">PDF attached</span>}
      </div>
      {pdfNote && <p className="hypothesis-revise-note">{pdfNote}</p>}
      {duplicate && (
        <div className="manual-add-duplicate" role="note">
          This looks like “{duplicate.title}”, already in your library.{' '}
          <button type="button" className="btn btn-sm" onClick={attachToDuplicate}>
            {duplicate.pdfKey ? 'Replace its PDF with this one' : 'Attach this PDF to it instead'}
          </button>
        </div>
      )}

      <label className="detail-label" htmlFor="manual-article-title">
        Title — or leave it empty and give just the DOI
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

      {formError && (
        <div className="ai-summary-error" role="alert">
          {formError}
        </div>
      )}
      <div className="study-inline-form-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void submit()}
          disabled={(!title.trim() && !doi.trim()) || yearInvalid || busy || pdfStatus !== 'idle'}
        >
          {busy ? 'Looking it up…' : 'Add to library'}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy || pdfStatus !== 'idle'}
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
