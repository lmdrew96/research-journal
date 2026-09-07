import { useUserData } from '../../hooks/useUserData';
import Icon from './Icon';

/**
 * Shown when /api/* is not answering.
 *
 * The failure this exists for is quiet and alarming: with no backend, the app
 * falls back to localStorage, and on a fresh device that means the seeded
 * default project. Signing in and seeing "My Research" with none of your
 * articles looks exactly like data loss. Say plainly that this is a connection
 * problem and that nothing is being saved, so nobody goes hunting for research
 * that was never gone.
 */
export default function BackendWarning() {
  const { backendStatus, backendReason } = useUserData();

  if (backendStatus !== 'unavailable') return null;

  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return (
    <div className="backend-warning" role="alert">
      <span className="backend-warning-icon" aria-hidden="true">
        <Icon name="alert-triangle" size={15} />
      </span>
      <div className="backend-warning-body">
        <strong className="backend-warning-title">Not connected to the server</strong>
        <p className="backend-warning-text">
          Changes are being kept on this device only, and what you see may not be your
          account's data. Don't assume anything is missing — reconnect before editing.
        </p>
        {isLocalhost && (
          <p className="backend-warning-text">
            Running locally? <code>npm run dev</code> serves the UI only. Use{' '}
            <code>npm run dev:api</code> to run the serverless functions too.
          </p>
        )}
        {backendReason && <p className="backend-warning-reason">{backendReason}</p>}
      </div>
    </div>
  );
}
