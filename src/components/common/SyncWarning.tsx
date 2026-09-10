import { useState } from 'react';
import { useUserData } from '../../hooks/useUserData';
import Icon from './Icon';

/**
 * Shown when local edits exist that the server has not accepted.
 *
 * Two states reach here, and both used to end in a coloured dot in the sidebar
 * and nothing else:
 *
 * - `conflict`: three rebases in a row lost the race. The edits are on screen
 *   and in localStorage and nothing of anyone else's was overwritten, but
 *   nothing retries until the next mutation happens to schedule a push. A user
 *   who stops typing at that moment is stuck with no way forward and no
 *   explanation.
 * - `offline`: the server is unreachable. Same dead end.
 *
 * Deliberately absent: any "discard my changes" button. The count of unsaved
 * changes is shown, but the app cannot describe what they contain well enough
 * for that to be an informed choice, and getting it wrong destroys work that
 * only exists on this device. Reloading the page is the escape hatch, and it is
 * one the user already understands.
 */
export default function SyncWarning() {
  const { syncStatus, backendStatus, retrySync, unsyncedCount } = useUserData();
  const [retrying, setRetrying] = useState(false);

  // The offline case has its own banner when the backend is flat-out
  // unreachable — no need to say it twice.
  const isConflict = syncStatus === 'conflict';
  const isStuckOffline = syncStatus === 'offline' && backendStatus !== 'unavailable';
  if (!isConflict && !isStuckOffline) return null;

  const onRetry = () => {
    setRetrying(true);
    retrySync();
    // The banner disappears on its own once the push lands; this only stops the
    // button being hammered while a request is in flight.
    setTimeout(() => setRetrying(false), 1500);
  };

  const changes =
    unsyncedCount === 1 ? '1 unsaved change' : `${unsyncedCount} unsaved changes`;

  return (
    <div className="sync-warning" role="alert">
      <span className="sync-warning-icon" aria-hidden="true">
        <Icon name="alert-triangle" size={15} />
      </span>
      <div className="sync-warning-body">
        <strong className="sync-warning-title">
          {isConflict ? 'Your changes are not saved to the server yet' : 'Not saving right now'}
        </strong>
        <p className="sync-warning-text">
          {isConflict ? (
            <>
              Something else — the Claude connector, ThreadBrain, or another tab — kept
              writing while this tab tried to save. Nothing has been lost and nothing of
              theirs was overwritten, but {changes} {unsyncedCount === 1 ? 'is' : 'are'}{' '}
              still only on this device.
            </>
          ) : (
            <>
              The last save did not reach the server. {changes}{' '}
              {unsyncedCount === 1 ? 'is' : 'are'} kept on this device and will be sent
              when it succeeds.
            </>
          )}
        </p>
        <button className="sync-warning-retry" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Try saving again'}
        </button>
      </div>
    </div>
  );
}
