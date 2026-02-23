import { useState, useRef } from 'react';
import { useUserData } from '../hooks/useUserData';
import { exportAsJson, importFromJson } from '../lib/storage';
import { exportAllAsMarkdown, exportQuestionAsMarkdown } from '../lib/export-markdown';
import { getAllQuestions } from '../data/research-themes';

export default function ExportView() {
  const { data, importData } = useUserData();
  const [importStatus, setImportStatus] = useState<string | null>(null);
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
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = importFromJson(text);
      if (parsed) {
        importData(parsed);
        setImportStatus('Import successful! All data restored.');
      } else {
        setImportStatus('Invalid file format. Please use a valid backup JSON.');
      }
      setTimeout(() => setImportStatus(null), 4000);
    };
    reader.readAsText(file);

    // Reset so the same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleMarkdownExport = () => {
    const md = exportAllAsMarkdown(data);
    const date = new Date().toISOString().split('T')[0];
    downloadFile(md, `research-journal-${date}.md`, 'text/markdown');
  };

  const handleSingleExport = () => {
    if (!selectedQuestion) return;
    const question = allQuestions.find((q) => q.id === selectedQuestion);
    if (!question) return;
    const md = exportQuestionAsMarkdown(question, data);
    downloadFile(
      md,
      `research-${question.id}.md`,
      'text/markdown'
    );
  };

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">Data</div>
        <h1 className="view-header-title">Export &amp; Backup</h1>
        <p className="view-header-subtitle">
          Keep your research safe. Export notes and back up your data.
        </p>
      </div>

      {/* JSON Backup */}
      <div className="export-card">
        <div className="export-card-title">Full Backup (JSON)</div>
        <div className="export-card-desc">
          Download all your data as a JSON file. You can restore from this backup
          at any time.
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleJsonExport}>
            Download Backup
          </button>
          <div className="file-input-wrapper">
            <button className="btn">Restore from Backup</button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleJsonImport}
            />
          </div>
          {importStatus && (
            <span
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                color: importStatus.includes('successful')
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
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-ghost)',
          }}
        >
          Last modified: {new Date(data.lastModified).toLocaleString()}
        </div>
      </div>

      {/* Markdown Export */}
      <div className="export-card">
        <div className="export-card-title">All Notes as Markdown</div>
        <div className="export-card-desc">
          Export all your research questions, notes, and journal entries as a
          single markdown document.
        </div>
        <button className="btn btn-primary" onClick={handleMarkdownExport}>
          Export Markdown
        </button>
      </div>

      {/* Single Question Export */}
      <div className="export-card">
        <div className="export-card-title">Single Question Export</div>
        <div className="export-card-desc">
          Export one question with all its context, sources, and notes.
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select
            className="status-select"
            style={{ flex: 1, maxWidth: 400 }}
            value={selectedQuestion}
            onChange={(e) => setSelectedQuestion(e.target.value)}
          >
            <option value="">Select a question...</option>
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
