/** Picked items as removable chips, plus a select to add one more. */
export default function LinkPicker({
  id,
  label,
  candidates,
  value,
  onChange,
}: {
  id: string;
  label: string;
  candidates: { id: string; label: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const remaining = candidates.filter((c) => !value.includes(c.id));
  const clip = (t: string) => (t.length > 70 ? `${t.slice(0, 70)}…` : t);

  return (
    <div>
      <label className="detail-label" htmlFor={id}>
        {label}
      </label>
      {value.length > 0 && (
        <div className="design-chips">
          {value.map((v) => (
            <span key={v} className="design-chip">
              {clip(byId.get(v)?.label ?? 'No longer exists')}
              <button
                type="button"
                className="design-chip-remove"
                aria-label={`Remove ${byId.get(v)?.label ?? 'link'}`}
                onClick={() => onChange(value.filter((x) => x !== v))}
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          ))}
        </div>
      )}
      {remaining.length > 0 ? (
        <select
          id={id}
          className="status-select study-question-select"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="">Add…</option>
          {remaining.map((c) => (
            <option key={c.id} value={c.id}>
              {clip(c.label)}
            </option>
          ))}
        </select>
      ) : (
        candidates.length === 0 && <p className="linked-article-hint">Nothing to link yet.</p>
      )}
    </div>
  );
}
