// Register context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-to-journal',
    title: 'Save to Research Journal',
    contexts: ['selection'],
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-to-journal') return;

  // Extract academic metadata from the current tab while we have activeTab access.
  // This must happen before openPopup() — activeTab is only valid during this event.
  let extracted = { doi: null, authors: [], year: null, journal: null, extractedTitle: null };
  if (tab?.id) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          function getMeta(selectors) {
            for (const sel of selectors) {
              const el = document.querySelector(sel);
              if (el) return el.getAttribute('content') || null;
            }
            return null;
          }
          function getAllMeta(selector) {
            return Array.from(document.querySelectorAll(selector))
              .map(el => el.getAttribute('content'))
              .filter(Boolean);
          }

          // DOI: URL first, then meta tags
          let doi = null;
          const doiUrlMatch = location.href.match(/doi\.org\/(10\.[^?#\s]+)/);
          if (doiUrlMatch) {
            doi = doiUrlMatch[1];
          } else {
            const doiMeta = getMeta([
              'meta[name="citation_doi"]',
              'meta[name="dc.identifier"]',
            ]);
            if (doiMeta) {
              const m = doiMeta.match(/(10\.[^?#\s]+)/);
              doi = m ? m[1] : doiMeta;
            }
          }

          // Authors: collect all citation_author tags
          let authors = getAllMeta('meta[name="citation_author"]');
          if (authors.length === 0) {
            authors = getAllMeta('meta[name="dc.creator"]');
          }

          // Year: extract 4-digit year from date strings
          let year = null;
          const dateMeta = getMeta([
            'meta[name="citation_date"]',
            'meta[name="citation_publication_date"]',
            'meta[name="dc.date"]',
          ]);
          if (dateMeta) {
            const m = dateMeta.match(/(\d{4})/);
            year = m ? parseInt(m[1], 10) : null;
          }

          // Journal
          const journal = getMeta([
            'meta[name="citation_journal_title"]',
            'meta[name="citation_publisher"]',
          ]);

          // Better title from meta
          const extractedTitle = getMeta([
            'meta[name="citation_title"]',
            'meta[property="og:title"]',
          ]);

          return { doi, authors, year, journal, extractedTitle };
        },
      });
      if (results?.[0]?.result) {
        extracted = results[0].result;
      }
    } catch {
      // Extraction failed — non-academic page or CSP restriction.
      // pendingCapture will still save with title + URL only.
    }
  }

  await chrome.storage.local.set({
    pendingCapture: {
      quote: info.selectionText || '',
      pageTitle: extracted.extractedTitle || tab?.title || '',
      pageUrl: tab?.url || '',
      timestamp: new Date().toISOString(),
      doi: extracted.doi,
      authors: extracted.authors,
      year: extracted.year,
      journal: extracted.journal,
    },
  });

  chrome.action.openPopup();
});
