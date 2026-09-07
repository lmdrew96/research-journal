import Icon from './Icon';
import { PURGE_WINDOW_DAYS } from '../../lib/storage';

export interface DeletedItem {
  id: string;
  name: string;
  deletedAt: string;
  /** e.g. "3 questions · 12 articles" — what would come back on restore. */
  detail?: string;
}

interface RecentlyDeletedProps {
  items: DeletedItem[];
  /** Singular noun, e.g. "theme". Used in labels. */
  label: string;
  onRestore: (id: string) => void;
}

/**
 * Formats how long ago something was deleted, and how long is left.
 *
 * Deliberately coarse — the exact minute does not matter, but "expires in 2
 * days" absolutely does, since after that the cascade is genuinely gone.
 */
function describeAge(deletedAt: string): { ago: string; expires: string } {
  const ms = Date.now() - new Date(deletedAt).getTime();
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor(ms / 3_600_000);

  const ago =
    days >= 1 ? `${days} day${days === 1 ? '' : 's'} ago`
      : hours >= 1 ? `${hours} hour${hours === 1 ? '' : 's'} ago`
        : 'just now';

  const left = PURGE_WINDOW_DAYS - days;
  const expires =
    left <= 0 ? 'expires today'
      : `expires in ${left} day${left === 1 ? '' : 's'}`;

  return { ago, expires };
}

/**
 * Recovery surface for soft-deleted themes and projects.
 *
 * Renders nothing when there is nothing to recover, so it stays out of the way
 * in the normal case. The purge window is stated inline rather than buried in
 * docs — an undo that silently stops working is worse than no undo.
 */
export default function RecentlyDeleted({ items, label, onRestore }: RecentlyDeletedProps) {
  if (items.length === 0) return null;

  const sorted = [...items].sort(
    (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
  );

  return (
    <section className="recently-deleted" aria-labelledby={`recently-deleted-${label}`}>
      <h2 className="recently-deleted-title" id={`recently-deleted-${label}`}>
        Recently deleted
      </h2>
      <p className="recently-deleted-note">
        Deleted {label}s can be restored for {PURGE_WINDOW_DAYS} days, then they are
        removed permanently.
      </p>
      <ul className="recently-deleted-list">
        {sorted.map((item) => {
          const { ago, expires } = describeAge(item.deletedAt);
          return (
            <li key={item.id} className="recently-deleted-item">
              <div className="recently-deleted-body">
                <span className="recently-deleted-name">{item.name}</span>
                <span className="recently-deleted-meta">
                  Deleted {ago} · {expires}
                  {item.detail && ` · ${item.detail}`}
                </span>
              </div>
              <button
                className="btn btn-sm btn-labelled"
                onClick={() => onRestore(item.id)}
                aria-label={`Restore ${label}: ${item.name}`}
              >
                <Icon name="arrow-left" size={13} />
                Restore
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
