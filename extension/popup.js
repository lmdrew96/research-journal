const STORAGE_KEY = 'research-journal-data';
const APP_URLS = [
  'http://localhost:5173',
  'https://*.vercel.app',
];

// ── Helpers ──

function createId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let id = '';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  for (let i = 0; i < 12; i++) id += chars[bytes[i] % 64];
  return id;
}

function now() {
  return new Date().toISOString();
}

function normalizeQuote(q) {
  return q.toLowerCase().replace(/\s+/g, ' ').trim();
}

function getActiveLibrary(data) {
  if (Array.isArray(data?.projects)) {
    const proj = data.projects.find(p => p.id === data.activeProjectId) ?? data.projects[0];
    if (proj) return proj.library;
  }
  return Array.isArray(data?.library) ? data.library : [];
}

async function queueExcerpt(cap) {
  const stored = await chrome.storage.local.get('queuedExcerpts');
  const queue = Array.isArray(stored.queuedExcerpts) ? stored.queuedExcerpts : [];
  if (queue.length < 50) {
    queue.push({ quote: cap.quote, pageTitle: cap.pageTitle, pageUrl: cap.pageUrl, timestamp: cap.timestamp || now() });
  }
  await chrome.storage.local.set({ queuedExcerpts: queue });
}

async function drainQueue(tabId) {
  const stored = await chrome.storage.local.get('queuedExcerpts');
  const queue = stored.queuedExcerpts;
  if (!Array.isArray(queue) || queue.length === 0) return 0;

  const freshData = await readAppData(tabId);
  if (!freshData) return 0;

  let drained = 0;
  const lib = getActiveLibrary(freshData);
  for (const item of queue) {
    const ts = item.timestamp || now();
    const norm = normalizeQuote(item.quote);
    const alreadySaved = lib.some(a => a.excerpts.some(e => normalizeQuote(e.quote) === norm));
    if (!alreadySaved) {
      lib.unshift({
        id: createId(), title: item.pageTitle || 'Untitled', authors: [], year: null,
        journal: null, doi: null, url: item.pageUrl || null, abstract: null, notes: '',
        excerpts: [{ id: createId(), quote: item.quote, comment: '', createdAt: ts }],
        linkedQuestions: [], status: 'to-read', tags: [], aiSummary: null,
        savedAt: ts, updatedAt: ts,
      });
      drained++;
    }
  }

  if (drained > 0) {
    freshData.lastModified = now();
    await writeAppData(tabId, freshData);
  }
  await chrome.storage.local.remove('queuedExcerpts');
  return drained;
}

// Find the Research Journal tab (checks localhost and production)
async function findAppTab() {
  for (const url of APP_URLS) {
    const tabs = await chrome.tabs.query({ url: url + '/*' });
    if (tabs[0]) return tabs[0];
  }
  return null;
}

// Execute a function in the app tab's context
async function execInAppTab(tabId, func, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  return results[0]?.result;
}

// ── Read app data ──

async function readAppData(tabId) {
  return execInAppTab(tabId, (key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, [STORAGE_KEY]);
}

// ── Write app data ──

async function writeAppData(tabId, data) {
  return execInAppTab(tabId, (key, json) => {
    localStorage.setItem(key, json);
    // Dispatch a custom event so the React app can detect the change
    window.dispatchEvent(new StorageEvent('storage', {
      key,
      newValue: json,
      storageArea: localStorage,
    }));
    return true;
  }, [STORAGE_KEY, JSON.stringify(data)]);
}

// ── UI State ──

let capture = null;
let appTab = null;
let appData = null;
let mode = 'new'; // 'new' or 'existing'

const dom = {
  noCapture: () => document.getElementById('no-capture'),
  captureForm: () => document.getElementById('capture-form'),
  noApp: () => document.getElementById('no-app'),
  quote: () => document.getElementById('quote'),
  comment: () => document.getElementById('comment'),
  pageTitle: () => document.getElementById('page-title'),
  pageUrl: () => document.getElementById('page-url'),
  btnNew: () => document.getElementById('btn-new'),
  btnExisting: () => document.getElementById('btn-existing'),
  newInfo: () => document.getElementById('new-article-info'),
  existingPicker: () => document.getElementById('existing-article-picker'),
  articleSelect: () => document.getElementById('article-select'),
  saveBtn: () => document.getElementById('save-btn'),
  status: () => document.getElementById('status'),
  queueBanner: () => document.getElementById('queue-banner'),
};

function showStatus(text, type) {
  const el = dom.status();
  el.textContent = text;
  el.className = 'status ' + type;
}

// ── Initialize ──

document.addEventListener('DOMContentLoaded', async () => {
  // Read pending capture
  const stored = await chrome.storage.local.get('pendingCapture');
  capture = stored.pendingCapture;

  if (!capture || !capture.quote) {
    dom.noCapture().style.display = 'block';
    return;
  }

  // Find app tab
  appTab = await findAppTab();
  if (!appTab) {
    // Queue the capture so it saves automatically next time the clipper opens with the app running
    if (capture) await queueExcerpt(capture);
    await chrome.storage.local.remove('pendingCapture');
    dom.noApp().style.display = 'block';
    return;
  }

  // Drain any queued excerpts now that the app is open
  const drained = await drainQueue(appTab.id);
  if (drained > 0) {
    dom.queueBanner().textContent = `${drained} queued excerpt(s) were saved.`;
    dom.queueBanner().style.display = 'block';
  }

  // Read app data for article list
  try {
    appData = await readAppData(appTab.id);
  } catch {
    dom.noApp().style.display = 'block';
    return;
  }

  // Populate UI
  dom.quote().textContent = capture.quote;
  dom.pageTitle().textContent = capture.pageTitle;
  dom.pageUrl().textContent = capture.pageUrl;

  // Populate article dropdown
  const activeLib = getActiveLibrary(appData);
  if (activeLib.length > 0) {
    const select = dom.articleSelect();
    select.innerHTML = '<option value="">Select an article...</option>';
    for (const article of activeLib) {
      const opt = document.createElement('option');
      opt.value = article.id;
      const year = article.year ? ` (${article.year})` : '';
      opt.textContent = article.title + year;
      select.appendChild(opt);
    }
  }

  // Show form
  dom.captureForm().style.display = 'block';

  // Toggle handlers
  dom.btnNew().addEventListener('click', () => {
    mode = 'new';
    dom.btnNew().classList.add('active');
    dom.btnExisting().classList.remove('active');
    dom.newInfo().style.display = 'block';
    dom.existingPicker().style.display = 'none';
  });

  dom.btnExisting().addEventListener('click', () => {
    mode = 'existing';
    dom.btnExisting().classList.add('active');
    dom.btnNew().classList.remove('active');
    dom.newInfo().style.display = 'none';
    dom.existingPicker().style.display = 'block';
  });

  // Save handler
  dom.saveBtn().addEventListener('click', handleSave);
});

// ── Save ──

async function handleSave() {
  dom.saveBtn().disabled = true;
  dom.saveBtn().textContent = 'Saving...';

  try {
    const comment = dom.comment().value.trim();
    const ts = now();
    const excerpt = {
      id: createId(),
      quote: capture.quote,
      comment,
      createdAt: ts,
    };

    // Re-read fresh data to avoid overwrites
    const freshData = await readAppData(appTab.id);
    if (!freshData) throw new Error('Could not read app data');

    const lib = getActiveLibrary(freshData);
    if (mode === 'new') {
      const article = {
        id: createId(),
        title: capture.pageTitle || 'Untitled',
        authors: Array.isArray(capture.authors) ? capture.authors : [],
        year: typeof capture.year === 'number' ? capture.year : null,
        journal: capture.journal || null,
        doi: capture.doi || null,
        url: capture.pageUrl || null,
        abstract: null,
        notes: '',
        excerpts: [excerpt],
        linkedQuestions: [],
        status: 'to-read',
        tags: [],
        aiSummary: null,
        savedAt: ts,
        updatedAt: ts,
      };
      lib.unshift(article);
    } else {
      const articleId = dom.articleSelect().value;
      if (!articleId) {
        showStatus('Select an article first.', 'error');
        dom.saveBtn().disabled = false;
        dom.saveBtn().textContent = 'Save Excerpt';
        return;
      }
      const article = lib.find((a) => a.id === articleId);
      if (!article) throw new Error('Article not found');
      const isDuplicate = article.excerpts.some(
        e => normalizeQuote(e.quote) === normalizeQuote(capture.quote)
      );
      if (isDuplicate) {
        showStatus('Already saved to this article.', 'error');
        dom.saveBtn().disabled = false;
        dom.saveBtn().textContent = 'Save Excerpt';
        return;
      }
      article.excerpts.push(excerpt);
      article.updatedAt = ts;
    }

    freshData.lastModified = ts;
    await writeAppData(appTab.id, freshData);

    // Clear pending capture
    await chrome.storage.local.remove('pendingCapture');

    showStatus('Saved!', 'success');
    dom.saveBtn().textContent = 'Saved';

    // Auto-close after a moment
    setTimeout(() => window.close(), 800);
  } catch (err) {
    showStatus(err.message || 'Failed to save.', 'error');
    dom.saveBtn().disabled = false;
    dom.saveBtn().textContent = 'Save Excerpt';
  }
}