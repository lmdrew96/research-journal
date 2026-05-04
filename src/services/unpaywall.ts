const MAILTO = 'lmdrew@udel.edu';

export interface UnpaywallResult {
  isOA: boolean;
  pdfUrl: string | null;
  landingUrl: string | null;
  hostType: 'publisher' | 'repository' | null;
  license: string | null;
}

interface UnpaywallApiResponse {
  is_oa: boolean;
  best_oa_location: {
    url_for_pdf: string | null;
    url: string | null;
    host_type: 'publisher' | 'repository' | null;
    license: string | null;
  } | null;
}

function normalizeDoi(doi: string): string {
  return doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim();
}

export async function fetchOAVersion(doi: string): Promise<UnpaywallResult | null> {
  const cleanDoi = normalizeDoi(doi);
  if (!cleanDoi) return null;

  try {
    const url = `https://api.unpaywall.org/v2/${encodeURIComponent(cleanDoi)}?email=${encodeURIComponent(MAILTO)}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as UnpaywallApiResponse;
    const best = data.best_oa_location;

    return {
      isOA: !!data.is_oa,
      pdfUrl: best?.url_for_pdf ?? null,
      landingUrl: best?.url ?? null,
      hostType: best?.host_type ?? null,
      license: best?.license ?? null,
    };
  } catch {
    return null;
  }
}

export function bestUnpaywallUrl(result: UnpaywallResult | null): string | null {
  if (!result || !result.isOA) return null;
  return result.pdfUrl || result.landingUrl;
}
