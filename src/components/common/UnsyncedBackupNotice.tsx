import { useState } from 'react';
import { useUserData } from '../../hooks/useUserData';
import { loadUnsyncedBackupRaw } from '../../lib/storage';
import Icon from './Icon';

/**
 * Shown when a reload found unsent changes from a previous session that the
 * server refused after it had moved on. The app used the server copy and kept
 * the local one as a backup (see useUserData's load path). This only offers the
 * backup for download — it is never applied automatically, because merging it
 * by hand is the only way to be sure nothing newer gets overwritten.
 */
export default function UnsyncedBackupNotice() {
  const { unsyncedBackupAt, dismissUnsyncedBackup } = useUserData();
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!unsyncedBackupAt) return null;

  const savedOn = new Date(unsyncedBackupAt);
  const when = savedOn.getTime() > 0 ? ` (saved ${savedOn.toLocaleString()})` : '';

  const download = () => {
    const raw = loadUnsyncedBackupRaw();
    if (!raw) {
      setError('The backup could not be read from this browser.');
      return;
    }
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `threadnotes-unsynced-backup-${savedOn.toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setError(null);
  };

  const dismiss = () => {
    // Dismissing deletes the only copy, so ask first unless it was just saved.
    if (!downloaded && !window.confirm('Delete the backup without downloading it? This cannot be undone.')) {
      return;
    }
    dismissUnsyncedBackup();
  };

  return (
    <div className="sync-warning" role="status">
      <span className="sync-warning-icon" aria-hidden="true">
        <Icon name="alert-triangle" size={15} />
      </span>
      <div className="sync-warning-body">
        <strong className="sync-warning-title">
          Some changes from your last session couldn't be synced
        </strong>
        <p className="sync-warning-text">
          They were made on this device while something else was also saving, and could not be
          combined safely. You're seeing the server's copy. Your earlier version is kept as a
          backup{when} — download it to compare by hand.
        </p>
        {error && (
          <p className="sync-warning-text" role="alert">
            {error}
          </p>
        )}
        <div className="sync-warning-actions">
          <button className="sync-warning-retry" onClick={download}>
            Download backup
          </button>
          <button className="sync-warning-retry" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
