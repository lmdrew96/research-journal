import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { CORE_API_KEY_STORAGE } from '../services/providers/core';

interface ApiKey {
  id: string;
  name: string;
  created_at: string;
}

const REQUEST_SCHEMA = `POST /api/excerpts
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

// Single excerpt
{
  "quote": "string (required)",
  "articleTitle": "string (required)",
  "comment": "string (optional)",
  "articleDoi": "string (optional)",
  "articleUrl": "string (optional)"
}

// Batch (array of up to 50)
[{ "quote": "...", "articleTitle": "...", ... }, ...]`;

export default function SettingsView() {
  const { getToken } = useAuth();
  const { user } = useUser();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    const token = await getToken();
    try {
      const res = await fetch('/api/keys', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys);
      }
    } finally {
      setKeysLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  async function generateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim() || generating) return;
    setGenerating(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedToken(data.token);
        setNewKeyName('');
        loadKeys();
      }
    } finally {
      setGenerating(false);
    }
  }

  async function revokeKey(id: string) {
    setRevoking(id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/keys?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
      }
    } finally {
      setRevoking(null);
    }
  }

  async function copyToken() {
    if (!generatedToken) return;
    await navigator.clipboard.writeText(generatedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyEndpointUrl() {
    await navigator.clipboard.writeText(window.location.origin + '/api/excerpts');
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">Settings</div>
        <h1 className="view-header-title">Account &amp; Integrations</h1>
      </div>

      {/* Account */}
      <div className="settings-section">
        <h2 className="settings-section-title">Account</h2>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-label">Email</span>
            <span className="settings-value">
              {user?.primaryEmailAddress?.emailAddress ?? '—'}
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-label">User ID</span>
            <span className="settings-value settings-value--mono">{user?.id ?? '—'}</span>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="settings-section">
        <h2 className="settings-section-title">API Keys</h2>
        <p className="settings-description">
          Generate a key to connect external tools (like ThreadBrain) to your journal.
          Each key is shown only once — copy it before leaving this page.
        </p>

        {/* Generated token — show once */}
        {generatedToken && (
          <div className="settings-token-reveal">
            <div className="settings-token-label">
              Your new API key — copy it now, you won't see it again.
            </div>
            <div className="settings-token-row">
              <code className="settings-token-value">{generatedToken}</code>
              <button className="settings-token-copy" onClick={copyToken}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              className="settings-token-dismiss"
              onClick={() => setGeneratedToken(null)}
            >
              I've saved it, dismiss
            </button>
          </div>
        )}

        {/* Existing keys */}
        {keysLoading ? (
          <div className="settings-loading">Loading keys…</div>
        ) : keys.length > 0 ? (
          <div className="settings-key-list">
            {keys.map((key) => (
              <div key={key.id} className="settings-key-row">
                <div className="settings-key-info">
                  <span className="settings-key-name">{key.name}</span>
                  <span className="settings-key-date">
                    Created {new Date(key.created_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="settings-key-revoke"
                  onClick={() => revokeKey(key.id)}
                  disabled={revoking === key.id}
                >
                  {revoking === key.id ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          !generatedToken && (
            <p className="settings-empty">No API keys yet.</p>
          )
        )}

        {/* Generate new key */}
        <form className="settings-key-form" onSubmit={generateKey}>
          <input
            type="text"
            className="settings-key-input"
            placeholder="Key name (e.g. ThreadBrain)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            disabled={generating}
          />
          <button
            type="submit"
            className="settings-key-generate"
            disabled={!newKeyName.trim() || generating}
          >
            {generating ? 'Generating…' : 'Generate key'}
          </button>
        </form>
      </div>

      {/* CORE Search */}
      <div className="settings-section">
        <h2 className="settings-section-title">CORE Search</h2>
        <p className="settings-description">
          CORE is an optional third search provider that indexes the full text of 200M+ open-access papers.
          Get a free API key at{' '}
          <a href="https://core.ac.uk/services/api" target="_blank" rel="noopener noreferrer">
            core.ac.uk/services/api
          </a>
          . The key is stored locally in your browser.
        </p>
        <CoreApiKeySection />
      </div>

      {/* API Reference */}
      <div className="settings-section">
        <h2 className="settings-section-title">API Reference</h2>
        <p className="settings-description">
          POST excerpts programmatically from any tool using your API key.
        </p>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-label">Endpoint</span>
            <div className="settings-token-row">
              <code className="settings-token-value">
                {window.location.origin}/api/excerpts
              </code>
              <button className="settings-token-copy" onClick={copyEndpointUrl}>
                {urlCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="settings-row settings-row--block">
            <span className="settings-label">Request schema</span>
            <pre className="settings-code-block">{REQUEST_SCHEMA}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoreApiKeySection() {
  const [stored, setStored] = useState<string | null>(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem(CORE_API_KEY_STORAGE) : null
  );
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    localStorage.setItem(CORE_API_KEY_STORAGE, trimmed);
    setStored(trimmed);
    setDraft('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    localStorage.removeItem(CORE_API_KEY_STORAGE);
    setStored(null);
  };

  const masked = stored ? `${stored.slice(0, 4)}…${stored.slice(-4)}` : null;

  return (
    <div className="settings-card">
      {stored ? (
        <div className="settings-row">
          <span className="settings-label">CORE API key</span>
          <div className="settings-token-row">
            <code className="settings-token-value">{masked}</code>
            <button className="settings-key-revoke" onClick={handleClear}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="settings-key-form">
          <input
            type="password"
            className="settings-key-input"
            placeholder="Paste your CORE API key"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            className="settings-key-generate"
            disabled={!draft.trim()}
            onClick={handleSave}
          >
            {saved ? 'Saved!' : 'Save key'}
          </button>
        </div>
      )}
    </div>
  );
}
