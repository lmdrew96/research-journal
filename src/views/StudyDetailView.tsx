import { useState, useMemo } from 'react';
import type { View, Study, Hypothesis, Decision, StudyStatus } from '../types';
import { useUserData } from '../hooks/useUserData';
import Icon from '../components/common/Icon';
import EmptyState from '../components/common/EmptyState';
import MarkdownPreview from '../components/common/MarkdownPreview';
import ConfirmDelete from '../components/common/ConfirmDelete';
import StudyStatusBadge from '../components/studies/StudyStatusBadge';
import { studyStatusOptions } from '../data/study-status';

interface StudyDetailViewProps {
  studyId: string;
  onNavigate: (view: View) => void;
}

/**
 * Orders a set of hypotheses or decisions into revision chains.
 *
 * Pointers run forward (v1.supersededBy = v2.id), so a chain's head is the row
 * nothing else points at. Returns one entry per chain: the newest row, which is
 * what gets listed, plus its full history oldest → newest.
 *
 * The `seen` guard means a cycle truncates rather than hanging — the schema
 * permits one and a bad write could create one.
 */
function buildChains<T extends { id: string; supersededBy: string | null }>(
  items: T[]
): { current: T; history: T[] }[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const pointedAt = new Set(items.map((i) => i.supersededBy).filter((id): id is string => !!id));

  return items
    .filter((i) => !pointedAt.has(i.id))
    .map((head) => {
      const history: T[] = [head];
      const seen = new Set([head.id]);
      let cursor = head;
      while (cursor.supersededBy) {
        const next = byId.get(cursor.supersededBy);
        if (!next || seen.has(next.id)) break;
        history.push(next);
        seen.add(next.id);
        cursor = next;
      }
      return { current: history[history.length - 1], history };
    });
}

export default function StudyDetailView({ studyId, onNavigate }: StudyDetailViewProps) {
  const {
    getStudy,
    updateStudy,
    deleteStudy,
    linkStudyQuestion,
    unlinkStudyQuestion,
    addHypothesis,
    supersedeHypothesis,
    updateHypothesis,
    deleteHypothesis,
    addDecision,
    updateDecision,
    supersedeDecision,
    deleteDecision,
    getAllQuestions,
  } = useUserData();

  const study = getStudy(studyId);
  const allQuestions = getAllQuestions();

  if (!study) {
    return (
      <div className="main-inner">
        <button className="back-btn" onClick={() => onNavigate({ name: 'studies' })}>
          <Icon name="arrow-left" size={14} /> Studies
        </button>
        <EmptyState
          icon="orbit"
          text="That study is not in this project. It may have been deleted, or it may belong to another project."
          action={{ label: 'Back to studies', onClick: () => onNavigate({ name: 'studies' }) }}
        />
      </div>
    );
  }

  return (
    <div className="main-inner">
      <button className="back-btn" onClick={() => onNavigate({ name: 'studies' })}>
        <Icon name="arrow-left" size={14} /> Studies
      </button>

      {/* 1. Header */}
      <StudyHeader
        study={study}
        onUpdate={(patch) => updateStudy(studyId, patch)}
        onDelete={() => {
          deleteStudy(studyId);
          onNavigate({ name: 'studies' });
        }}
      />

      {/* 2. Hypotheses */}
      <HypothesesSection
        study={study}
        onAdd={(statement, label) => addHypothesis(studyId, { statement, label })}
        onSupersede={(id, statement, rationale) =>
          supersedeHypothesis(studyId, id, statement, rationale)
        }
        onRetire={(id) => updateHypothesis(studyId, id, { status: 'retired' })}
        onReactivate={(id) => updateHypothesis(studyId, id, { status: 'active' })}
        onDelete={(id) => deleteHypothesis(studyId, id)}
      />

      {/* 3 + 4. Decisions — open first, settled below and collapsed */}
      <DecisionsSection
        study={study}
        onAdd={(decision, rationale, alternativesRejected, open) =>
          addDecision(studyId, {
            decision,
            rationale,
            alternativesRejected,
            status: open ? 'open' : 'settled',
          })
        }
        onSettle={(id, rationale) =>
          updateDecision(studyId, id, { status: 'settled', ...(rationale ? { rationale } : {}) })
        }
        onSupersede={(id, decision, rationale) => supersedeDecision(studyId, id, decision, rationale)}
        onDelete={(id) => deleteDecision(studyId, id)}
      />

      {/* 5. Design */}
      <DesignSection study={study} onSave={(design) => updateStudy(studyId, { design })} />

      {/* 6. Linked questions */}
      <LinkedQuestionsSection
        study={study}
        allQuestions={allQuestions}
        onLink={(qid) => linkStudyQuestion(studyId, qid)}
        onUnlink={(qid) => unlinkStudyQuestion(studyId, qid)}
        onNavigate={onNavigate}
      />
    </div>
  );
}

// ---------- 1. Header ----------

function StudyHeader({
  study,
  onUpdate,
  onDelete,
}: {
  study: Study;
  onUpdate: (patch: { title?: string; description?: string; status?: StudyStatus }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(study.title);
  const [description, setDescription] = useState(study.description);

  const save = () => {
    const trimmed = title.trim();
    if (trimmed) onUpdate({ title: trimmed, description: description.trim() });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="study-header study-header-editing">
        <label className="detail-label" htmlFor="study-title">
          Title
        </label>
        <input
          id="study-title"
          className="text-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="detail-label" htmlFor="study-description">
          Short framing
        </label>
        <textarea
          id="study-description"
          className="text-input study-description-input"
          rows={2}
          value={description}
          placeholder="One or two sentences on what this study is for."
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="study-header-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>
            Save
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setTitle(study.title);
              setDescription(study.description);
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="study-header">
      <h1 className="study-title">{study.title}</h1>
      {study.description && <p className="study-description">{study.description}</p>}

      <div className="study-header-actions">
        <StudyStatusBadge status={study.status} />

        <select
          aria-label="Study status"
          className="status-select"
          value={study.status}
          onChange={(e) => onUpdate({ status: e.target.value as StudyStatus })}
        >
          {studyStatusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button type="button" className="btn btn-sm btn-labelled" onClick={() => setEditing(true)}>
          <Icon name="edit" size={13} /> Edit
        </button>

        {/* Deleting a study takes its hypotheses and decisions with it, which
            is the cascade rule that earns a confirm step here. */}
        <ConfirmDelete label="study" onConfirm={onDelete} />
      </div>
    </div>
  );
}

// ---------- 2. Hypotheses ----------

function HypothesesSection({
  study,
  onAdd,
  onSupersede,
  onRetire,
  onReactivate,
  onDelete,
}: {
  study: Study;
  onAdd: (statement: string, label: string | null) => void;
  onSupersede: (id: string, statement: string, rationale?: string) => void;
  onRetire: (id: string) => void;
  onReactivate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [statement, setStatement] = useState('');
  const [label, setLabel] = useState('');

  const chains = useMemo(() => buildChains(study.hypotheses), [study.hypotheses]);
  const live = chains.filter((c) => c.current.status !== 'retired');
  const retired = chains.filter((c) => c.current.status === 'retired');

  const add = () => {
    const trimmed = statement.trim();
    if (!trimmed) return;
    onAdd(trimmed, label.trim() || null);
    setStatement('');
    setLabel('');
    setAdding(false);
  };

  return (
    <section className="study-section">
      <div className="study-section-header">
        <h2 className="study-section-title">
          Hypotheses <span className="study-section-count">{live.length}</span>
        </h2>
        {!adding && (
          <button type="button" className="btn btn-sm btn-labelled" onClick={() => setAdding(true)}>
            <Icon name="plus" size={13} /> Add hypothesis
          </button>
        )}
      </div>

      {adding && (
        <div className="study-inline-form">
          <label className="detail-label" htmlFor="new-hypothesis-label">
            Label (optional)
          </label>
          <input
            id="new-hypothesis-label"
            className="text-input study-label-input"
            type="text"
            value={label}
            placeholder="H1"
            onChange={(e) => setLabel(e.target.value)}
          />
          <label className="detail-label" htmlFor="new-hypothesis-statement">
            Hypothesis
          </label>
          <textarea
            id="new-hypothesis-statement"
            className="text-input"
            rows={3}
            autoFocus
            value={statement}
            placeholder="What you expect to find, and under what conditions."
            onChange={(e) => setStatement(e.target.value)}
          />
          <div className="study-inline-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={add}
              disabled={!statement.trim()}
            >
              Add
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setAdding(false);
                setStatement('');
                setLabel('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {live.map(({ current, history }) => (
        <HypothesisRow
          key={current.id}
          hypothesis={current}
          history={history}
          study={study}
          onSupersede={onSupersede}
          onRetire={() => onRetire(current.id)}
          onDelete={() => onDelete(current.id)}
        />
      ))}

      {retired.length > 0 && (
        <details className="study-collapsed-group">
          <summary className="study-collapsed-summary">
            <Icon name="chevron-right" size={12} />
            {retired.length} retired hypothes{retired.length === 1 ? 'is' : 'es'}
          </summary>
          {retired.map(({ current, history }) => (
            <HypothesisRow
              key={current.id}
              hypothesis={current}
              history={history}
              study={study}
              onSupersede={onSupersede}
              onReactivate={() => onReactivate(current.id)}
              onDelete={() => onDelete(current.id)}
            />
          ))}
        </details>
      )}

      {study.hypotheses.length === 0 && !adding && (
        <p className="study-section-empty">
          No hypotheses yet. A hypothesis is what you expect to find — revising one later keeps its
          history, so it is worth writing down before you are sure.
        </p>
      )}
    </section>
  );
}

function HypothesisRow({
  hypothesis,
  history,
  study,
  onSupersede,
  onRetire,
  onReactivate,
  onDelete,
}: {
  hypothesis: Hypothesis;
  history: Hypothesis[];
  study: Study;
  onSupersede: (id: string, statement: string, rationale?: string) => void;
  onRetire?: () => void;
  onReactivate?: () => void;
  onDelete: () => void;
}) {
  const [revising, setRevising] = useState(false);
  const [statement, setStatement] = useState(hypothesis.statement);
  const [rationale, setRationale] = useState('');

  const priorVersions = history.length - 1;

  const submit = () => {
    const trimmed = statement.trim();
    if (!trimmed || trimmed === hypothesis.statement) return;
    onSupersede(hypothesis.id, trimmed, rationale.trim() || undefined);
    setRationale('');
    setRevising(false);
  };

  return (
    <div className="hypothesis-row">
      <div className="hypothesis-main">
        {hypothesis.label && <span className="hypothesis-label">{hypothesis.label}</span>}
        <p className="hypothesis-statement">{hypothesis.statement}</p>
      </div>

      {hypothesis.status === 'retired' && (
        <span className="hypothesis-retired-flag">Retired</span>
      )}

      <div className="hypothesis-actions">
        {!revising && (
          <button
            type="button"
            className="btn btn-sm btn-labelled"
            onClick={() => {
              setStatement(hypothesis.statement);
              setRevising(true);
            }}
          >
            <Icon name="edit" size={12} /> Revise
          </button>
        )}
        {onRetire && (
          <button type="button" className="btn btn-sm" onClick={onRetire}>
            Retire
          </button>
        )}
        {onReactivate && (
          <button type="button" className="btn btn-sm" onClick={onReactivate}>
            Make active
          </button>
        )}
        <ConfirmDelete label="hypothesis" onConfirm={onDelete} compact />
      </div>

      {revising && (
        <div className="study-inline-form hypothesis-revise">
          <p className="hypothesis-revise-note">
            Revising keeps the old wording as history rather than overwriting it. Say why, and the
            reason is recorded alongside the change.
          </p>
          <label className="detail-label" htmlFor={`revise-${hypothesis.id}`}>
            Revised hypothesis
          </label>
          <textarea
            id={`revise-${hypothesis.id}`}
            className="text-input"
            rows={3}
            autoFocus
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
          />
          <label className="detail-label" htmlFor={`why-${hypothesis.id}`}>
            Why it changed (optional)
          </label>
          <textarea
            id={`why-${hypothesis.id}`}
            className="text-input"
            rows={2}
            value={rationale}
            placeholder="e.g. claims a behaviour; the instrument measures a product"
            onChange={(e) => setRationale(e.target.value)}
          />
          <div className="study-inline-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={submit}
              disabled={!statement.trim() || statement.trim() === hypothesis.statement}
            >
              Save revision
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setRevising(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Collapsed by default. Five versions inline is noise; on demand it is
          the most valuable thing on the page. */}
      {priorVersions > 0 && (
        <details className="chain-details">
          <summary className="chain-summary">
            <Icon name="chevron-right" size={12} />
            History — {priorVersions} earlier version{priorVersions === 1 ? '' : 's'}
          </summary>
          <Chain
            entries={history.map((h, i) => ({
              key: h.id,
              version: i + 1,
              text: h.statement,
              isCurrent: h.id === hypothesis.id,
              // supersedeHypothesis files the rationale against the NEW
              // hypothesis, not the one being replaced — so the reason for the
              // step out of this version reads off the version after it. Each
              // entry's rationale renders in the gap below it.
              rationale:
                study.decisions.find(
                  (d) => d.hypothesisId === history[i + 1]?.id && d.rationale,
                )?.rationale ?? null,
            }))}
          />
        </details>
      )}
    </div>
  );
}

// ---------- Chain rendering ----------

/**
 * The revision timeline, oldest → newest.
 *
 * The rationale sits between two versions rather than inside either, because
 * that is what it describes: the step, not the state. Rendered inline as text —
 * a tooltip would hide the part that carries the reasoning.
 */
function Chain({
  entries,
}: {
  entries: { key: string; version: number; text: string; isCurrent: boolean; rationale: string | null }[];
}) {
  return (
    <ol className="chain">
      {entries.map((entry, i) => (
        <li key={entry.key} className="chain-entry">
          <div className="chain-version">
            <span className="chain-version-number">v{entry.version}</span>
            {entry.isCurrent && <span className="chain-current-flag">current</span>}
          </div>
          <p className={`chain-text${entry.isCurrent ? ' chain-text-current' : ''}`}>{entry.text}</p>

          {i < entries.length - 1 && (
            <div className="chain-step">
              <span className="chain-arrow" aria-hidden="true">
                <Icon name="chevron-down" size={12} />
              </span>
              <span className="chain-rationale">
                {entry.rationale ?? 'Revised — no reason was recorded.'}
              </span>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

// ---------- 3 + 4. Decisions ----------

function DecisionsSection({
  study,
  onAdd,
  onSettle,
  onSupersede,
  onDelete,
}: {
  study: Study;
  onAdd: (
    decision: string,
    rationale: string | null,
    alternativesRejected: string | null,
    open: boolean
  ) => void;
  onSettle: (id: string, rationale?: string) => void;
  onSupersede: (id: string, decision: string, rationale?: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [rationale, setRationale] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [open, setOpen] = useState(true);

  const chains = useMemo(() => buildChains(study.decisions), [study.decisions]);
  const openChains = chains.filter((c) => c.current.status === 'open');
  const settledChains = chains.filter((c) => c.current.status !== 'open');

  const add = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed, rationale.trim() || null, alternatives.trim() || null, open);
    setText('');
    setRationale('');
    setAlternatives('');
    setOpen(true);
    setAdding(false);
  };

  return (
    <section className="study-section">
      <div className="study-section-header">
        <h2 className="study-section-title">
          Decisions <span className="study-section-count">{chains.length}</span>
        </h2>
        {!adding && (
          <button type="button" className="btn btn-sm btn-labelled" onClick={() => setAdding(true)}>
            <Icon name="plus" size={13} /> Add decision
          </button>
        )}
      </div>

      {adding && (
        <div className="study-inline-form">
          <label className="detail-label" htmlFor="new-decision">
            Decision
          </label>
          <textarea
            id="new-decision"
            className="text-input"
            rows={2}
            autoFocus
            value={text}
            placeholder="What was chosen — or, if still open, what you have to choose between."
            onChange={(e) => setText(e.target.value)}
          />
          <label className="detail-label" htmlFor="new-decision-why">
            Why (optional)
          </label>
          <textarea
            id="new-decision-why"
            className="text-input"
            rows={2}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
          <label className="detail-label" htmlFor="new-decision-alternatives">
            What you did not choose (optional)
          </label>
          <textarea
            id="new-decision-alternatives"
            className="text-input"
            rows={2}
            value={alternatives}
            onChange={(e) => setAlternatives(e.target.value)}
          />
          <label className="study-checkbox">
            <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
            Still open — I have not settled this yet
          </label>
          <div className="study-inline-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={add}
              disabled={!text.trim()}
            >
              Add
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setAdding(false);
                setText('');
                setRationale('');
                setAlternatives('');
                setOpen(true);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* 3. Open decisions — pulled to the top. Informational styling, not a
          warning: this is what is next, not what is wrong. */}
      {openChains.length > 0 && (
        <div className="decisions-open">
          <div className="decisions-open-label">
            <Icon name="zap" size={12} />
            Not settled yet — {openChains.length}
          </div>
          {openChains.map(({ current, history }) => (
            <DecisionRow
              key={current.id}
              decision={current}
              history={history}
              onSettle={onSettle}
              onSupersede={onSupersede}
              onDelete={() => onDelete(current.id)}
            />
          ))}
        </div>
      )}

      {settledChains.length > 0 && (
        <details className="study-collapsed-group">
          <summary className="study-collapsed-summary">
            <Icon name="chevron-right" size={12} />
            {settledChains.length} settled decision{settledChains.length === 1 ? '' : 's'}
          </summary>
          {settledChains.map(({ current, history }) => (
            <DecisionRow
              key={current.id}
              decision={current}
              history={history}
              onSupersede={onSupersede}
              onDelete={() => onDelete(current.id)}
            />
          ))}
        </details>
      )}

      {study.decisions.length === 0 && !adding && (
        <p className="study-section-empty">
          No decisions yet. Record what you chose and why — an open decision is also worth writing
          down, since it becomes the list of what is still undecided.
        </p>
      )}
    </section>
  );
}

function DecisionRow({
  decision,
  history,
  onSettle,
  onSupersede,
  onDelete,
}: {
  decision: Decision;
  history: Decision[];
  onSettle?: (id: string, rationale?: string) => void;
  onSupersede: (id: string, decision: string, rationale?: string) => void;
  onDelete: () => void;
}) {
  const [settling, setSettling] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [rationale, setRationale] = useState('');
  const [replacement, setReplacement] = useState(decision.decision);

  const priorVersions = history.length - 1;

  return (
    <div className={`decision-row${decision.status === 'open' ? ' decision-row-open' : ''}`}>
      <p className="decision-text">{decision.decision}</p>

      {decision.rationale && (
        <p className="decision-rationale">
          <span className="decision-field-label">Why:</span> {decision.rationale}
        </p>
      )}

      {decision.alternativesRejected && (
        <p className="decision-alternatives">
          <span className="decision-field-label">Not chosen:</span> {decision.alternativesRejected}
        </p>
      )}

      <div className="decision-actions">
        {onSettle && !settling && (
          <button type="button" className="btn btn-sm btn-labelled" onClick={() => setSettling(true)}>
            <Icon name="check" size={12} /> Settle this
          </button>
        )}
        {!reversing && decision.status !== 'open' && (
          <button
            type="button"
            className="btn btn-sm btn-labelled"
            onClick={() => {
              setReplacement(decision.decision);
              setReversing(true);
            }}
          >
            <Icon name="edit" size={12} /> Reverse
          </button>
        )}
        <ConfirmDelete label="decision" onConfirm={onDelete} compact />
      </div>

      {settling && onSettle && (
        <div className="study-inline-form">
          <label className="detail-label" htmlFor={`settle-${decision.id}`}>
            What did you decide, and why?
          </label>
          <textarea
            id={`settle-${decision.id}`}
            className="text-input"
            rows={2}
            autoFocus
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
          <div className="study-inline-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                onSettle(decision.id, rationale.trim() || undefined);
                setRationale('');
                setSettling(false);
              }}
            >
              Mark settled
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setSettling(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {reversing && (
        <div className="study-inline-form">
          <p className="hypothesis-revise-note">
            Reversing keeps this decision on the record as what you moved away from.
          </p>
          <label className="detail-label" htmlFor={`reverse-${decision.id}`}>
            What you are deciding instead
          </label>
          <textarea
            id={`reverse-${decision.id}`}
            className="text-input"
            rows={2}
            autoFocus
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
          <label className="detail-label" htmlFor={`reverse-why-${decision.id}`}>
            Why it changed (optional)
          </label>
          <textarea
            id={`reverse-why-${decision.id}`}
            className="text-input"
            rows={2}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
          <div className="study-inline-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!replacement.trim() || replacement.trim() === decision.decision}
              onClick={() => {
                onSupersede(decision.id, replacement.trim(), rationale.trim() || undefined);
                setRationale('');
                setReversing(false);
              }}
            >
              Save reversal
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setReversing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {priorVersions > 0 && (
        <details className="chain-details">
          <summary className="chain-summary">
            <Icon name="chevron-right" size={12} />
            History — {priorVersions} earlier version{priorVersions === 1 ? '' : 's'}
          </summary>
          <Chain
            entries={history.map((d, i) => ({
              key: d.id,
              version: i + 1,
              text: d.decision,
              isCurrent: d.id === decision.id,
              // A superseding decision carries the reason it replaced the one
              // before it, so the rationale for a step reads off the NEXT row.
              rationale: history[i + 1]?.rationale ?? null,
            }))}
          />
        </details>
      )}
    </div>
  );
}

// ---------- 5. Design ----------

function DesignSection({ study, onSave }: { study: Study; onSave: (design: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(study.design);

  return (
    <section className="study-section">
      <div className="study-section-header">
        <h2 className="study-section-title">Design</h2>
        {!editing && (
          <button
            type="button"
            className="btn btn-sm btn-labelled"
            onClick={() => {
              setDraft(study.design);
              setEditing(true);
            }}
          >
            <Icon name="edit" size={13} /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="study-inline-form">
          <label className="detail-label" htmlFor="study-design">
            Variables, instruments and analysis plan (markdown)
          </label>
          <textarea
            id="study-design"
            className="text-input study-design-input"
            rows={14}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="study-inline-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                onSave(draft);
                setEditing(false);
              }}
            >
              Save
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : study.design ? (
        <MarkdownPreview content={study.design} />
      ) : (
        <p className="study-section-empty">
          Nothing here yet. Variables, instruments and the analysis plan live here as prose.
        </p>
      )}
    </section>
  );
}

// ---------- 6. Linked questions ----------

function LinkedQuestionsSection({
  study,
  allQuestions,
  onLink,
  onUnlink,
  onNavigate,
}: {
  study: Study;
  allQuestions: { id: string; q: string; themeLabel: string }[];
  onLink: (questionId: string) => void;
  onUnlink: (questionId: string) => void;
  onNavigate: (view: View) => void;
}) {
  const linked = allQuestions.filter((q) => study.linkedQuestions.includes(q.id));
  const unlinked = allQuestions.filter((q) => !study.linkedQuestions.includes(q.id));

  return (
    <section className="study-section">
      <h2 className="study-section-title">
        Linked questions <span className="study-section-count">{linked.length}</span>
      </h2>

      {linked.map((q) => (
        <div key={q.id} className="study-linked-question">
          <button
            type="button"
            className="study-linked-question-text"
            onClick={() => onNavigate({ name: 'question-detail', questionId: q.id })}
          >
            {q.q}
          </button>
          <span className="study-linked-question-theme">{q.themeLabel}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onUnlink(q.id)}
            aria-label={`Unlink question: ${q.q}`}
          >
            Unlink
          </button>
        </div>
      ))}

      {linked.length === 0 && (
        <p className="study-section-empty">
          Not linked to any question yet. Linking one makes this study show up next to the
          literature on the same question.
        </p>
      )}

      {unlinked.length > 0 && (
        <select
          aria-label="Link a research question"
          className="status-select study-link-select"
          value=""
          onChange={(e) => {
            if (e.target.value) onLink(e.target.value);
          }}
        >
          <option value="">Link a question...</option>
          {unlinked.map((q) => (
            <option key={q.id} value={q.id}>
              {q.q.length > 60 ? `${q.q.slice(0, 60)}...` : q.q}
            </option>
          ))}
        </select>
      )}
    </section>
  );
}
