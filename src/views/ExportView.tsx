import { useState, useRef } from 'react';
import { useUserData } from '../hooks/useUserData';
import { exportAsJson, importFromJson } from '../lib/storage';
import { exportAllAsMarkdown, exportQuestionAsMarkdown } from '../lib/export-markdown';

/**
 * Export and backup. Rarely needed, so it lives at the foot of Settings rather
 * than in the nav; `/export` routes there.
 */
export default function ExportView() {
  const { data, activeProject, importData, getAllQuestions } = useUserData();
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allQuestions = getAllQuestions();

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleJsonExport = () => {
    const json = exportAsJson(data);
    const date = new Date().toISOString().split('T')[0];
    downloadFile(json, `research-journal-backup-${date}.json`, 'application/json');
  };

  const handleJsonImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const parsed = importFromJson(text);
      if (parsed) {
        setImporting(true);
        setImportStatus('Syncing to database...');
        const success = await importData(parsed);
        setImporting(false);
        setImportStatus(
          success
            ? 'Import successful! All data synced — safe to refresh.'
            : 'Restored locally, but sync failed. Try refreshing to retry.'
        );
      } else {
        setImportStatus('Invalid file format. Please use a valid backup JSON.');
      }
      setTimeout(() => setImportStatus(null), 6000);
    };
    reader.readAsText(file);

    // Reset so the same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMarkdownExport = () => {
    const md = exportAllAsMarkdown(activeProject);
    const date = new Date().toISOString().split('T')[0];
    downloadFile(md, `research-journal-${date}.md`, 'text/markdown');
  };

  const handleSingleExport = () => {
    if (!selectedQuestion) return;
    const question = allQuestions.find((q) => q.id === selectedQuestion);
    if (!question) return;
    const md = exportQuestionAsMarkdown(question, activeProject);
    downloadFile(
      md,
      `research-${question.id}.md`,
      'text/markdown'
    );
  };

  return (
    <div className="settings-section" id="export">
      <h2 className="settings-section-title">Export &amp; Backup</h2>
      <p className="settings-description">
        Export what you have written and back up your data.
      </p>

      {/* JSON Backup */}
      <div className="export-card">
        <h2 className="export-card-title">Full Backup (JSON)</h2>
        <div className="export-card-desc">
          Download all your data — every project — as a JSON file. You can restore from this backup at any time.
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleJsonExport}>
            Download Backup
          </button>
          <div className="file-input-wrapper">
            <button className="btn" disabled={importing}>
              {importing ? 'Restoring...' : 'Restore from Backup'}
            </button>
            <input
              aria-label="Restore from backup file"
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleJsonImport}
              disabled={importing}
            />
          </div>
          {importStatus && (
            <span
              role="status"
              aria-live="polite"
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-sans)',
                color: importing
                  ? 'var(--text-muted)'
                  : importStatus.includes('successful')
                  ? 'var(--color-success)'
                  : 'var(--color-danger)',
              }}
            >
              {importStatus}
            </span>
          )}
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            fontFamily: 'var(--font-sans)',
            color: 'var(--text-ghost)',
          }}
        >
          Last modified: {new Date(data.lastModified).toLocaleString()}
        </div>
      </div>

      {/* Markdown Export */}
      <div className="export-card">
        <h2 className="export-card-title">Export {activeProject.name} as Markdown</h2>
        <div className="export-card-desc">
          Export this project as a single markdown document — threads, notes,
          sources, excerpts, AI summaries, studies (with their full revision
          history), and thoughts.
        </div>
        <button className="btn btn-primary" onClick={handleMarkdownExport}>
          Export Markdown
        </button>
      </div>

      {/* Single Thread Export */}
      <div className="export-card">
        <h2 className="export-card-title">Single Thread Export</h2>
        <div className="export-card-desc">
          Export one thread from {activeProject.name} with all its context, references, linked sources, and notes.
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            aria-label="Thread to export"
            className="status-select"
            style={{ flex: '1 1 200px', maxWidth: 400, minWidth: 0 }}
            value={selectedQuestion}
            onChange={(e) => setSelectedQuestion(e.target.value)}
          >
            <option value="">Select a thread...</option>
            {allQuestions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.q.slice(0, 70)}...
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={handleSingleExport}
            disabled={!selectedQuestion}
            style={{ opacity: selectedQuestion ? 1 : 0.5 }}
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
