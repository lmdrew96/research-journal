import type { ScholarPaper, SearchProviderOptions, SearchResult } from '../scholarSearch';
import { decodeEntities } from './entities';

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

interface CrossrefLink {
  URL: string;
  'content-type'?: string;
}

interface CrossrefWork {
  DOI: string;
  title?: string[];
  author?: CrossrefAuthor[];
  issued?: { 'date-parts'?: number[][] };
  'container-title'?: string[];
  abstract?: string;
  'is-referenced-by-count'?: number;
  URL?: string;
  link?: CrossrefLink[];
}

interface CrossrefResponse {
  message: {
    'total-results': number;
    items: CrossrefWork[];
  };
}

const FIELDS =
  'DOI,title,author,issued,container-title,abstract,is-referenced-by-count,URL,link';

const MAILTO = 'lmdrew@udel.edu';

function stripJats(html: string): string {
  const noTags = html
    .replace(/<jats:[^>]+>/g, '')
    .replace(/<\/jats:[^>]+>/g, '')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(noTags).replace(/\s+/g, ' ').trim();
}

function authorName(a: CrossrefAuthor): string {
  if (a.name) return decodeEntities(a.name);
  return decodeEntities([a.given, a.family].filter(Boolean).join(' ').trim());
}

function pdfLink(links: CrossrefLink[] | undefined): string | null {
  if (!links) return null;
  const pdf = links.find((l) => l['content-type'] === 'application/pdf');
  return pdf?.URL || null;
}

function toScholarPaper(work: CrossrefWork): ScholarPaper {
  const year = work.issued?.['date-parts']?.[0]?.[0] ?? null;
  const journal = work['container-title']?.[0] ? decodeEntities(work['container-title'][0]) : null;
  const pdf = pdfLink(work.link);
  return {
    paperId: work.DOI,
    title: work.title?.[0] ? decodeEntities(work.title[0]) : 'Untitled',
    authors: (work.author || []).map((a) => ({ name: authorName(a) })).filter((a) => a.name),
    year,
    journal: journal ? { name: journal } : null,
    abstract: work.abstract ? stripJats(work.abstract) : null,
    externalIds: { DOI: work.DOI },
    url: work.URL || `https://doi.org/${work.DOI}`,
    citationCount: work['is-referenced-by-count'] || 0,
    isOpenAccess: !!pdf,
    oaUrl: pdf,
  };
}

export async function searchCrossref(
  query: string,
  options: SearchProviderOptions
): Promise<SearchResult> {
  const { limit, page } = options;
  const offset = (page - 1) * limit;

  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: String(limit),
    offset: String(offset),
    select: FIELDS,
    mailto: MAILTO,
  });

  const res = await fetch(`https://api.crossref.org/works?${params}`);

  if (!res.ok) {
    throw new Error(`Search failed (${res.status}). Try again.`);
  }

  const json: CrossrefResponse = await res.json();

  return {
    papers: json.message.items.map(toScholarPaper),
    total: json.message['total-results'] || 0,
  };
}
