// Talks to ThreadNotes over /api/excerpts.
//
// This used to reach into the app's localStorage with chrome.scripting, which
// meant it only worked while a ThreadNotes tab was open — and since the app
// moved to research.adhdesigns.dev, which was never in the tab-match list, it
// meant the clipper never saved at all in production. Captures piled up in a
// local queue that was only drained after a successful tab match, so they were
// never drained, and anything past the 50th was dropped silently.
//
// Going through the API removes the tab requirement entirely and makes the
// server the only writer, so a capture can no longer clobber a concurrent
// write from the app or the MCP.

const DEFAULT_API_BASE = 'https://research.adhdesigns.dev';
const KEY_API_KEY = 'apiKey';
const KEY_API_BASE = 'apiBase';
const KEY_QUEUE = 'queuedExcerpts';
const QUEUE_LIMIT = 50;

// ── Helpers ──

function now() {
  return new Date().toISOString();
}

async function getSettings() {
  const stored = await chrome.storage.local.get([KEY_API_KEY, KEY_API_BASE]);
  return {
    apiKey: stored[KEY_API_KEY] || null,
    apiBase: (stored[KEY_API_BASE] || DEFAULT_API_BASE).replace(/\/+$/, ''),
  };
}

async function apiFetch(path, options = {}) {
  const { apiKey, apiBase } = await getSettings();
  if (!apiKey) throw new Error('No API key configured');
  const res = await fetch(apiBase + path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) throw new Error('API key rejected — generate a new one in Settings.');
  if (res.status === 429) throw new Error('Rate limited. Try again in a few minutes.');
  if (!res.ok) {
    let detail = `Server returned ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch { /* keep the status-code message */ }
    throw new Error(detail);
  }
  return res.json();
}

// ── Queue ──
//
// Only used when a save actually fails. Unlike the old version it never
// discards silently: at the cap it refuses and says so, so a full queue is
// visible instead of quietly eating captures.

async function readQueue() {
  const stored = await chrome.storage.local.get(KEY_QUEUE);
  return Array.isArray(stored[KEY_QUEUE]) ? stored[KEY_QUEUE] : [];
}

async function queueExcerpt(item) {
  const queue = await readQueue();
  if (queue.length >= QUEUE_LIMIT) return false;
  queue.push(item);
  await chrome.storage.local.set({ [KEY_QUEUE]: queue });
  return true;
}

/**
 * Send anything sitting in the queue, including captures stranded by the old
 * tab-based version, whose entries are shaped {quote, pageTitle, pageUrl,
 * timestamp}. Both shapes are accepted so nothing already saved is lost.
 */
async function drainQueue() {
  const queue = await readQueue();
  if (queue.length === 0) return { drained: 0, failed: 0 };

  const payload = queue.map((item) => ({
    quote: item.quote,
    comment: item.comment || '',
    // Legacy entries used pageTitle/pageUrl; current ones use articleTitle/articleUrl.
    articleTitle: item.articleTitle || item.pageTitle || 'Untitled',
    articleUrl: item.articleUrl || item.pageUrl || null,
    articleDoi: item.articleDoi || item.doi || null,
  }));

  try {
    const results = await apiFetch('/api/excerpts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const list = Array.isArray(results) ? results : [results];
    const failed = list.filter((r) => r?.error).length;
    // The server de-duplicates by quote, so re-sending is safe; clear the whole
    // queue on a successful round trip rather than trying to match up indexes.
    await chrome.storage.local.remove(KEY_QUEUE);
    return { drained: list.length - failed, failed };
  } catch {
    // Leave the queue alone — it will be retried next time the popup opens.
    return { drained: 0, failed: 0, offline: true };
  }
}

// ── UI State ──

let capture = null;
let articles = [];
let mode = 'new';

const el = (id) => document.getElementById(id);

function show(id, display = 'block') {
  const node = el(id);
  if (node) node.style.display = display;
}
function hide(id) {
  const node = el(id);
  if (node) node.style.display = 'none';
}

function showStatus(text, type) {
  const node = el('status');
  node.textContent = text;
  node.className = 'status ' + type;
}

function showBanner(text, type = 'success') {
  const node = el('queue-banner');
  node.textContent = text;
  node.className = 'status ' + type;
  node.style.display = 'block';
}

// ── Setup screen ──

async function showSetup(message) {
  const { apiBase } = await getSettings();
  hide('capture-form');
  hide('no-capture');
  show('setup');
  if (message) {
    const note = el('setup-error');
    note.textContent = message;
    note.style.display = 'block';
  }
  el('api-base-input').value = apiBase;

  el('setup-save').addEventListener('click', async () => {
    const key = el('api-key-input').value.trim();
    const base = el('api-base-input').value.trim() || DEFAULT_API_BASE;
    if (!key) {
      el('setup-error').textContent = 'Paste a key first.';
      el('setup-error').style.display = 'block';
      return;
    }
    await chrome.storage.local.set({ [KEY_API_KEY]: key, [KEY_API_BASE]: base });
    el('setup-error').style.display = 'none';
    hide('setup');
    await start();
  });
}

// ── Initialize ──

async function start() {
  const stored = await chrome.storage.local.get('pendingCapture');
  capture = stored.pendingCapture;

  const { apiKey } = await getSettings();
  if (!apiKey) {
    await showSetup(null);
    return;
  }

  // Retry anything stranded — including captures the old tab-based version
  // queued and could never send.
  const { drained, failed, offline } = await drainQueue();
  if (drained > 0) {
    showBanner(
      `${drained} queued excerpt${drained === 1 ? '' : 's'} saved.` +
        (failed > 0 ? ` ${failed} could not be matched to an article.` : ''),
    );
  } else if (offline) {
    const pending = (await readQueue()).length;
    if (pending > 0) showBanner(`${pending} excerpt(s) still waiting to send.`, 'error');
  }

  if (!capture || !capture.quote) {
    show('no-capture');
    return;
  }

  el('quote').textContent = capture.quote;
  el('page-title').textContent = capture.pageTitle || '';
  el('page-url').textContent = capture.pageUrl || '';
  show('capture-form');
  el('save-btn').addEventListener('click', handleSave);

  el('btn-new').addEventListener('click', () => {
    mode = 'new';
    el('btn-new').classList.add('active');
    el('btn-existing').classList.remove('active');
    show('new-article-info');
    hide('existing-article-picker');
  });

  el('btn-existing').addEventListener('click', () => {
    mode = 'existing';
    el('btn-existing').classList.add('active');
    el('btn-new').classList.remove('active');
    hide('new-article-info');
    show('existing-article-picker');
  });

  // The article list is a convenience, not a precondition — a failure here
  // must not block saving to a new article.
  try {
    const data = await apiFetch('/api/excerpts', { method: 'GET' });
    articles = Array.isArray(data.articles) ? data.articles : [];
    const select = el('article-select');
    if (articles.length > 0) {
      select.innerHTML = '<option value="">Select an article...</option>';
      for (const a of articles) {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.title + (a.year ? ` (${a.year})` : '');
        select.appendChild(opt);
      }
    } else {
      select.innerHTML = '<option value="">No articles in this project yet</option>';
    }
    if (data.project?.name) {
      el('project-name').textContent = `Saving to: ${data.project.name}`;
      show('project-name');
    }
  } catch (err) {
    if (String(err.message).includes('API key rejected')) {
      await showSetup(err.message);
      return;
    }
    el('article-select').innerHTML = '<option value="">Could not load articles</option>';
  }
}

document.addEventListener('DOMContentLoaded', start);

// ── Save ──

async function handleSave() {
  const btn = el('save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const payload = {
    quote: capture.quote,
    comment: el('comment').value.trim(),
    articleTitle: capture.pageTitle || 'Untitled',
    articleUrl: capture.pageUrl || null,
    articleDoi: capture.doi || null,
  };

  if (mode === 'existing') {
    const articleId = el('article-select').value;
    if (!articleId) {
      showStatus('Select an article first.', 'error');
      btn.disabled = false;
      btn.textContent = 'Save Excerpt';
      return;
    }
    payload.articleId = articleId;
  }

  try {
    const result = await apiFetch('/api/excerpts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (result?.error) throw new Error(result.error);

    await chrome.storage.local.remove('pendingCapture');
    showStatus(result?.duplicate ? 'Already saved.' : 'Saved!', 'success');
    btn.textContent = result?.duplicate ? 'Already saved' : 'Saved';
    setTimeout(() => window.close(), 800);
  } catch (err) {
    // Hold onto it rather than losing it, and say plainly which happened.
    const queued = await queueExcerpt({ ...payload, timestamp: now() });
    if (queued) {
      await chrome.storage.local.remove('pendingCapture');
      showStatus(`${err.message} — saved locally, will retry.`, 'error');
      btn.textContent = 'Queued';
    } else {
      showStatus(
        `${err.message} — and the local queue is full (${QUEUE_LIMIT}). ` +
          'Open the clipper while online to flush it.',
        'error',
      );
      btn.disabled = false;
      btn.textContent = 'Save Excerpt';
    }
  }
}
