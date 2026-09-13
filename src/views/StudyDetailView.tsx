import { useState, useMemo } from 'react';
import type { View, Study, Hypothesis, Decision, StudyStatus, Provenance } from '../types';
import { provenanceOptions, provenanceLabel } from '../data/provenance';
import { useUserData } from '../hooks/useUserData';
import Icon from '../components/common/Icon';
import EmptyState from '../components/common/EmptyState';
import MarkdownPreview from '../components/common/MarkdownPreview';
import ConfirmDelete from '../components/common/ConfirmDelete';
import StudyStatusBadge from '../components/studies/StudyStatusBadge';
import { studyStatusOptions } from '../data/study-status';
import { buildChains } from '../lib/revision-chains';

interface StudyDetailViewProps {
  studyId: string;
  onNavigate: (view: View) => void;
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
    moveHypothesis,
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
        onAdd={(statement, label, questionId, provenance) =>
          addHypothesis(studyId, { statement, label, questionId, provenance })
        }
        onSupersede={(id, statement, rationale) =>
          supersedeHypothesis(studyId, id, statement, rationale)
        }
        onEdit={(id, patch) => updateHypothesis(studyId, id, patch)}
        onMove={(id, targetId) => moveHypothesis(studyId, id, targetId)}
        onRetire={(id) => updateHypothesis(studyId, id, { status: 'retired' })}
        onReactivate={(id) => updateHypothesis(studyId, id, { status: 'active' })}
        onDelete={(id) => deleteHypothesis(studyId, id)}
        allQuestions={allQuestions}
        onNavigate={onNavigate}
      />

      {/* 3 + 4. Decisions — open first, settled below and collapsed */}
      <DecisionsSection
        study={study}
        onAdd={(decision, rationale, alternativesRejected, open, provenance) =>
          addDecision(studyId, {
            decision,
            rationale,
            alternativesRejected,
            status: open ? 'open' : 'settled',
            provenance,
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
  onUpdate: (patch: {
    title?: string;
    description?: string;
    status?: StudyStatus;
    provenance?: Provenance;
  }) => void;
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

        <ProvenanceSelect
          id="study-provenance"
          label="Study originated with"
          value={study.provenance}
          onChange={(provenance) => onUpdate({ provenance })}
        />

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

type HypothesisPatch = Partial<
  Pick<Hypothesis, 'statement' | 'label' | 'status' | 'questionId' | 'provenance'>
>;

interface QuestionOption {
  id: string;
  q: string;
  themeLabel: string;
}

function HypothesesSection({
  study,
  onAdd,
  onSupersede,
  onEdit,
  onMove,
  onRetire,
  onReactivate,
  onDelete,
  allQuestions,
  onNavigate,
}: {
  study: Study;
  onAdd: (
    statement: string,
    label: string | null,
    questionId: string | null,
    provenance: Provenance | undefined
  ) => void;
  onSupersede: (id: string, statement: string, rationale?: string) => void;
  onEdit: (id: string, patch: HypothesisPatch) => void;
  onMove: (id: string, targetId: string) => void;
  onRetire: (id: string) => void;
  onReactivate: (id: string) => void;
  onDelete: (id: string) => void;
  allQuestions: QuestionOption[];
  onNavigate: (view: View) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [statement, setStatement] = useState('');
  const [label, setLabel] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [provenance, setProvenance] = useState<Provenance | undefined>(undefined);

  const chains = useMemo(() => buildChains(study.hypotheses), [study.hypotheses]);
  const live = chains.filter((c) => c.current.status !== 'retired');
  const retired = chains.filter((c) => c.current.status === 'retired');

  const resetForm = () => {
    setStatement('');
    setLabel('');
    setQuestionId('');
    setProvenance(undefined);
    setAdding(false);
  };

  const add = () => {
    const trimmed = statement.trim();
    if (!trimmed) return;
    onAdd(trimmed, label.trim() || null, questionId || null, provenance);
    resetForm();
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
          <label className="detail-label" htmlFor="new-hypothesis-question">
            Research question (optional)
          </label>
          <QuestionPicker
            id="new-hypothesis-question"
            value={questionId}
            onChange={setQuestionId}
            study={study}
            allQuestions={allQuestions}
          />
          <label className="detail-label" htmlFor="new-hypothesis-provenance">
            Originated with (optional)
          </label>
          <ProvenanceSelect
            id="new-hypothesis-provenance"
            label="Hypothesis originated with"
            value={provenance}
            onChange={setProvenance}
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
            <button type="button" className="btn btn-sm" onClick={resetForm}>
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
          siblings={live.map((c) => c.current)}
          study={study}
          allQuestions={allQuestions}
          onSupersede={onSupersede}
          onEdit={(patch) => onEdit(current.id, patch)}
          onMove={(targetId) => onMove(current.id, targetId)}
          onRetire={() => onRetire(current.id)}
          onDelete={() => onDelete(current.id)}
          onNavigate={onNavigate}
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
              siblings={retired.map((c) => c.current)}
              study={study}
              allQuestions={allQuestions}
              onSupersede={onSupersede}
              onEdit={(patch) => onEdit(current.id, patch)}
              onMove={(targetId) => onMove(current.id, targetId)}
              onReactivate={() => onReactivate(current.id)}
              onDelete={() => onDelete(current.id)}
              onNavigate={onNavigate}
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
  siblings,
  study,
  allQuestions,
  onSupersede,
  onEdit,
  onMove,
  onRetire,
  onReactivate,
  onDelete,
  onNavigate,
}: {
  hypothesis: Hypothesis;
  history: Hypothesis[];
  /** Current rows of the chains listed alongside this one, in display order. */
  siblings: Hypothesis[];
  study: Study;
  allQuestions: QuestionOption[];
  onSupersede: (id: string, statement: string, rationale?: string) => void;
  onEdit: (patch: HypothesisPatch) => void;
  onMove: (targetId: string) => void;
  onRetire?: () => void;
  onReactivate?: () => void;
  onDelete: () => void;
  onNavigate: (view: View) => void;
}) {
  const [revising, setRevising] = useState(false);
  const [editing, setEditing] = useState(false);
  const [statement, setStatement] = useState(hypothesis.statement);
  const [rationale, setRationale] = useState('');

  const [editLabel, setEditLabel] = useState('');
  const [editStatement, setEditStatement] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'retired'>('active');
  const [editPosition, setEditPosition] = useState(0);
  const [editQuestionId, setEditQuestionId] = useState('');
  const [editProvenance, setEditProvenance] = useState<Provenance | undefined>(undefined);

  const priorVersions = history.length - 1;
  const position = siblings.findIndex((h) => h.id === hypothesis.id);
  const linkedQuestion = hypothesis.questionId
    ? allQuestions.find((q) => q.id === hypothesis.questionId)
    : undefined;
  // Deleting clears every decision pointer at this row — including the
  // rationales a revision filed against it — so the confirm names the count.
  const pointingDecisions = study.decisions.filter((d) => d.hypothesisId === hypothesis.id).length;

  const submit = () => {
    const trimmed = statement.trim();
    if (!trimmed || trimmed === hypothesis.statement) return;
    onSupersede(hypothesis.id, trimmed, rationale.trim() || undefined);
    setRationale('');
    setRevising(false);
  };

  const startEditing = () => {
    setEditLabel(hypothesis.label ?? '');
    setEditStatement(hypothesis.statement);
    setEditStatus(hypothesis.status === 'retired' ? 'retired' : 'active');
    setEditPosition(Math.max(position, 0));
    setEditQuestionId(hypothesis.questionId ?? '');
    setEditProvenance(hypothesis.provenance);
    setRevising(false);
    setEditing(true);
  };

  const saveEdit = () => {
    const trimmed = editStatement.trim();
    if (!trimmed) return;

    // Only changed fields go in the patch, so an untouched save writes nothing.
    const patch: HypothesisPatch = {};
    const label = editLabel.trim() || null;
    if (label !== hypothesis.label) patch.label = label;
    if (trimmed !== hypothesis.statement) patch.statement = trimmed;
    if (editStatus !== hypothesis.status) patch.status = editStatus;
    const questionId = editQuestionId || null;
    if (questionId !== hypothesis.questionId) patch.questionId = questionId;
    // undefined is a real value here: it clears a recorded provenance.
    if (editProvenance !== hypothesis.provenance) patch.provenance = editProvenance;
    if (Object.keys(patch).length > 0) onEdit(patch);

    if (position >= 0 && editPosition !== position && siblings[editPosition]) {
      onMove(siblings[editPosition].id);
    }
    setEditing(false);
  };

  return (
    <div className="hypothesis-row">
      <div className="hypothesis-main">
        {hypothesis.label && <span className="hypothesis-label">{hypothesis.label}</span>}
        <p className="hypothesis-statement">{hypothesis.statement}</p>
      </div>

      {hypothesis.questionId && (
        <div className="hypothesis-question">
          <span>Question:</span>
          {linkedQuestion ? (
            <button
              type="button"
              className="hypothesis-question-link"
              onClick={() => onNavigate({ name: 'question-detail', questionId: linkedQuestion.id })}
            >
              {linkedQuestion.q}
            </button>
          ) : (
            <span className="hypothesis-question-missing">no longer in this project</span>
          )}
        </div>
      )}

      {hypothesis.provenance && (
        <span className="provenance-label">Origin: {provenanceLabel(hypothesis.provenance)}</span>
      )}

      {hypothesis.status === 'retired' && (
        <span className="hypothesis-retired-flag">Retired</span>
      )}

      <div className="hypothesis-actions">
        {!editing && (
          <button type="button" className="btn btn-sm btn-labelled" onClick={startEditing}>
            <Icon name="edit" size={12} /> Edit
          </button>
        )}
        {!revising && (
          <button
            type="button"
            className="btn btn-sm btn-labelled"
            onClick={() => {
              setStatement(hypothesis.statement);
              setEditing(false);
              setRevising(true);
            }}
          >
            <Icon name="orbit" size={12} /> Revise (new version)
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
        <ConfirmDelete
          label="hypothesis"
          onConfirm={onDelete}
          compact
          detail={
            pointingDecisions > 0
              ? `${pointingDecisions} decision${pointingDecisions === 1 ? '' : 's'} point${pointingDecisions === 1 ? 's' : ''} at it and will be detached. To fix a label or wording, use Edit instead.`
              : undefined
          }
        />
      </div>

      {editing && (
        <div className="study-inline-form hypothesis-revise">
          <p className="hypothesis-revise-note">
            Correcting wording, relabelling or refiling? Edit — nothing is added to the history.
            Changed your mind about the claim itself? Use Revise instead.
          </p>
          <div className="hypothesis-edit-fields">
            <div>
              <label className="detail-label" htmlFor={`edit-label-${hypothesis.id}`}>
                Label
              </label>
              <input
                id={`edit-label-${hypothesis.id}`}
                className="text-input study-label-input"
                type="text"
                value={editLabel}
                placeholder="H1"
                onChange={(e) => setEditLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="detail-label" htmlFor={`edit-status-${hypothesis.id}`}>
                Status
              </label>
              <select
                id={`edit-status-${hypothesis.id}`}
                className="status-select"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as 'active' | 'retired')}
              >
                <option value="active">Active</option>
                <option value="retired">Retired</option>
              </select>
            </div>
            {siblings.length > 1 && position >= 0 && (
              <div>
                <label className="detail-label" htmlFor={`edit-position-${hypothesis.id}`}>
                  Position
                </label>
                <select
                  id={`edit-position-${hypothesis.id}`}
                  className="status-select"
                  value={editPosition}
                  onChange={(e) => setEditPosition(Number(e.target.value))}
                >
                  {siblings.map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1} of {siblings.length}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <label className="detail-label" htmlFor={`edit-statement-${hypothesis.id}`}>
            Hypothesis
          </label>
          <textarea
            id={`edit-statement-${hypothesis.id}`}
            className="text-input"
            rows={3}
            autoFocus
            value={editStatement}
            onChange={(e) => setEditStatement(e.target.value)}
          />
          <label className="detail-label" htmlFor={`edit-question-${hypothesis.id}`}>
            Research question
          </label>
          <QuestionPicker
            id={`edit-question-${hypothesis.id}`}
            value={editQuestionId}
            onChange={setEditQuestionId}
            study={study}
            allQuestions={allQuestions}
          />
          <label className="detail-label" htmlFor={`edit-provenance-${hypothesis.id}`}>
            Originated with
          </label>
          <ProvenanceSelect
            id={`edit-provenance-${hypothesis.id}`}
            label="Hypothesis originated with"
            value={editProvenance}
            onChange={setEditProvenance}
          />
          <div className="study-inline-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={saveEdit}
              disabled={!editStatement.trim()}
            >
              Save
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
            Why it changed
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
            {/* The rationale is what makes a revision chain readable, so a
                revision without one is an Edit in disguise. */}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={submit}
              disabled={
                !statement.trim() || statement.trim() === hypothesis.statement || !rationale.trim()
              }
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

/**
 * Who an idea originated with. "Not recorded" is the first option and the
 * resting state — most entries have none, and that should look normal.
 */
function ProvenanceSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  /** Accessible name; the select sits in dense rows without a visible label. */
  label: string;
  value: Provenance | undefined;
  onChange: (value: Provenance | undefined) => void;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      className="status-select"
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || undefined) as Provenance | undefined)}
    >
      <option value="">Origin not recorded</option>
      {provenanceOptions.map((o) => (
        <option key={o.value} value={o.value}>
          Origin: {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Picks the research question a hypothesis operationalizes, or none.
 *
 * The study's own linked questions come first because they are the likely
 * answer, but every question in the project is offered: study↔question and
 * hypothesis↔question links are not required to agree.
 */
function QuestionPicker({
  id,
  value,
  onChange,
  study,
  allQuestions,
}: {
  id: string;
  value: string;
  onChange: (questionId: string) => void;
  study: Study;
  allQuestions: QuestionOption[];
}) {
  const inStudy = allQuestions.filter((q) => study.linkedQuestions.includes(q.id));
  const others = allQuestions.filter((q) => !study.linkedQuestions.includes(q.id));
  const option = (q: QuestionOption) => (
    <option key={q.id} value={q.id}>
      {q.q.length > 60 ? `${q.q.slice(0, 60)}...` : q.q}
    </option>
  );

  return (
    <select
      id={id}
      className="status-select study-question-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">No linked question</option>
      {inStudy.length > 0 && <optgroup label="Linked to this study">{inStudy.map(option)}</optgroup>}
      {others.length > 0 && (
        <optgroup label={inStudy.length > 0 ? 'Other questions in this project' : 'Questions in this project'}>
          {others.map(option)}
        </optgroup>
      )}
    </select>
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
    open: boolean,
    provenance: Provenance | undefined
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
  const [provenance, setProvenance] = useState<Provenance | undefined>(undefined);

  const chains = useMemo(() => buildChains(study.decisions), [study.decisions]);
  const openChains = chains.filter((c) => c.current.status === 'open');
  const settledChains = chains.filter((c) => c.current.status !== 'open');

  const add = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed, rationale.trim() || null, alternatives.trim() || null, open, provenance);
    setText('');
    setRationale('');
    setAlternatives('');
    setOpen(true);
    setProvenance(undefined);
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
          <label className="detail-label" htmlFor="new-decision-provenance">
            Originated with (optional)
          </label>
          <ProvenanceSelect
            id="new-decision-provenance"
            label="Decision originated with"
            value={provenance}
            onChange={setProvenance}
          />
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
                setProvenance(undefined);
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

      {decision.provenance && (
        <span className="provenance-label">Origin: {provenanceLabel(decision.provenance)}</span>
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
