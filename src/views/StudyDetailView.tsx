import { useState, useMemo } from 'react';
import type {
  View,
  Study,
  Hypothesis,
  Decision,
  StudyStatus,
  Provenance,
  Project,
  DesignItem,
  DesignItemFields,
  DesignItemKind,
  VariableRole,
  ConnectionNodeType,
} from '../types';
import { provenanceOptions, provenanceLabel } from '../data/provenance';
import { useUserData } from '../hooks/useUserData';
import Icon from '../components/common/Icon';
import EmptyState from '../components/common/EmptyState';
import MarkdownPreview from '../components/common/MarkdownPreview';
import ConfirmDelete from '../components/common/ConfirmDelete';
import LinkPicker from '../components/common/LinkPicker';
import { ConnectionList, ConnectForm } from '../components/connections/Connections';
import { studyStatusOptions } from '../data/study-status';
import { buildChains } from '../lib/revision-chains';
import {
  DESIGN_ITEM_KINDS,
  DESIGN_ITEM_NOUNS,
  DESIGN_SECTION_LABELS,
  SINGLETON_KINDS,
  VARIABLE_ROLES,
  chainsOfKind,
  currentHypothesisId,
  designChains,
  designItemLabel,
  effectiveStatus,
  fillableFields,
  openDecisionsOn,
  sectionStatus,
  linksFrom,
  normalizeDesignFields,
  procedureTotal,
  studyGaps,
  type Gap,
} from '../../api/_design-items';

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
    settleDecision,
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

      {/* Gaps — advice only, collapsed, and absent when there are none. */}
      <GapsPanel study={study} />

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
        onAdd={(decision, rationale, alternativesRejected, open, provenance, hypothesisId, designItemId) =>
          addDecision(studyId, {
            decision,
            rationale,
            alternativesRejected,
            status: open ? 'open' : 'settled',
            provenance,
            hypothesisId,
            designItemId,
          })
        }
        onSettle={(id, rationale) => settleDecision(studyId, id, { rationale })}
        onSupersede={(id, decision, rationale, alternativesRejected) =>
          supersedeDecision(studyId, id, decision, rationale, alternativesRejected)
        }
        onEdit={(id, patch) => updateDecision(studyId, id, patch)}
        onDelete={(id) => deleteDecision(studyId, id)}
      />

      {/* 5. Design */}
      <DesignSection study={study} onNavigate={onNavigate} />

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

// ---------- Gaps ----------

/** Where a gap points. A section with nothing in it isn't rendered, so it falls back to the Design area. */
function gapElementId(gap: Gap): string {
  switch (gap.target.type) {
    case 'hypothesis':
      return `hypothesis-${gap.target.id}`;
    case 'design_item':
      return `design-item-${gap.target.id}`;
    case 'section':
      return `design-section-${gap.target.kind}`;
  }
}

function jumpTo(gap: Gap): void {
  const el = document.getElementById(gapElementId(gap)) ?? document.getElementById('study-design');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
  // A static outline for a moment, so the eye lands on the right card.
  el.classList.add('gap-target');
  window.setTimeout(() => el.classList.remove('gap-target'), 2000);
}

/**
 * The quiet "Gaps" panel: what the design doesn't connect yet. Advice only —
 * nothing here blocks a save — so it is collapsed by default and absent when
 * there is nothing to say.
 */
function GapsPanel({ study }: { study: Study }) {
  const { activeProject } = useUserData();
  const gaps = useMemo(() => studyGaps(study, activeProject), [study, activeProject]);
  if (gaps.length === 0) return null;

  return (
    <details className="study-collapsed-group study-gaps">
      <summary className="study-collapsed-summary">
        <Icon name="chevron-right" size={12} />
        {gaps.length} gap{gaps.length === 1 ? '' : 's'} in the design
      </summary>
      <ul className="study-gaps-list">
        {gaps.map((gap) => (
          <li key={gap.key}>
            <button type="button" className="study-gap" onClick={() => jumpTo(gap)}>
              {gap.message}
            </button>
          </li>
        ))}
      </ul>
    </details>
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
    <div className="hypothesis-row" id={`hypothesis-${hypothesis.id}`} tabIndex={-1}>
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

      <ConnectionList
        itemId={[hypothesis.id, ...history.map((h) => h.id)]}
        onNavigate={onNavigate}
      />

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
        <ConnectForm itemType="hypothesis" itemId={hypothesis.id} />
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
  onEdit,
  onDelete,
}: {
  study: Study;
  onAdd: (
    decision: string,
    rationale: string | null,
    alternativesRejected: string | null,
    open: boolean,
    provenance: Provenance | undefined,
    hypothesisId: string | null,
    designItemId: string | null
  ) => void;
  onSettle: (id: string, rationale?: string) => void;
  onSupersede: (id: string, decision: string, rationale?: string, alternativesRejected?: string) => void;
  onEdit: (id: string, patch: DecisionPatch) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [rationale, setRationale] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [open, setOpen] = useState(true);
  const [provenance, setProvenance] = useState<Provenance | undefined>(undefined);
  const [hypothesisId, setHypothesisId] = useState('');
  const [designItemId, setDesignItemId] = useState('');

  const chains = useMemo(() => buildChains(study.decisions), [study.decisions]);
  const currentDesignItems = useMemo(
    () => designChains(study.designItems ?? []).map((c) => c.current),
    [study.designItems]
  );
  const openChains = chains.filter((c) => c.current.status === 'open');
  const settledChains = chains.filter((c) => c.current.status !== 'open');
  const currentHypotheses = useMemo(
    () => buildChains(study.hypotheses).map((c) => c.current),
    [study.hypotheses]
  );

  const resetForm = () => {
    setText('');
    setRationale('');
    setAlternatives('');
    setOpen(true);
    setProvenance(undefined);
    setHypothesisId('');
    setDesignItemId('');
    setAdding(false);
  };

  const add = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(
      trimmed,
      rationale.trim() || null,
      alternatives.trim() || null,
      open,
      provenance,
      hypothesisId || null,
      designItemId || null
    );
    resetForm();
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
          {currentHypotheses.length > 0 && (
            <>
              <label className="detail-label" htmlFor="new-decision-hypothesis">
                Hypothesis it concerns (optional)
              </label>
              <select
                id="new-decision-hypothesis"
                className="status-select study-question-select"
                value={hypothesisId}
                onChange={(e) => setHypothesisId(e.target.value)}
              >
                <option value="">The study at large</option>
                {currentHypotheses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {hypothesisOptionLabel(h)}
                  </option>
                ))}
              </select>
            </>
          )}
          {currentDesignItems.length > 0 && (
            <>
              <label className="detail-label" htmlFor="new-decision-design-item">
                Design item it decides (optional)
              </label>
              <DesignItemSelect
                id="new-decision-design-item"
                items={currentDesignItems}
                value={designItemId}
                onChange={setDesignItemId}
              />
            </>
          )}
          <div className="study-inline-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={add}
              disabled={!text.trim()}
            >
              Add
            </button>
            <button type="button" className="btn btn-sm" onClick={resetForm}>
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
              study={study}
              onSettle={onSettle}
              onSupersede={onSupersede}
              onEdit={(patch) => onEdit(current.id, patch)}
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
              study={study}
              onSupersede={onSupersede}
              onEdit={(patch) => onEdit(current.id, patch)}
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

type DecisionPatch = Partial<
  Pick<Decision, 'decision' | 'rationale' | 'alternativesRejected' | 'status' | 'hypothesisId' | 'provenance'>
> & { designItemId?: string | null };

/** Picks the design item a decision is about, or none. */
function DesignItemSelect({
  id,
  items,
  value,
  onChange,
}: {
  id: string;
  items: DesignItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select id={id} className="status-select study-question-select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No design item</option>
      {items.map((d) => {
        const label = designItemLabel(d);
        return (
          <option key={d.id} value={d.id}>
            {(label.length > 70 ? `${label.slice(0, 70)}…` : label) + (d.supersededBy ? ' (earlier version)' : '')}
          </option>
        );
      })}
    </select>
  );
}

/** "H1 — Readers with higher ADHD trait scores…" for pickers and the row's link line. */
const hypothesisOptionLabel = (h: Hypothesis): string => {
  const text = h.statement.length > 60 ? `${h.statement.slice(0, 60)}...` : h.statement;
  return h.label ? `${h.label} — ${text}` : text;
};

function DecisionRow({
  decision,
  history,
  study,
  onSettle,
  onSupersede,
  onEdit,
  onDelete,
}: {
  decision: Decision;
  history: Decision[];
  study: Study;
  onSettle?: (id: string, rationale?: string) => void;
  onSupersede: (id: string, decision: string, rationale?: string, alternativesRejected?: string) => void;
  onEdit: (patch: DecisionPatch) => void;
  onDelete: () => void;
}) {
  const [settling, setSettling] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rationale, setRationale] = useState('');
  const [replacement, setReplacement] = useState(decision.decision);
  const [replacementAlternatives, setReplacementAlternatives] = useState('');

  const [editText, setEditText] = useState('');
  const [editRationale, setEditRationale] = useState('');
  const [editAlternatives, setEditAlternatives] = useState('');
  const [editStatus, setEditStatus] = useState<'open' | 'settled'>('open');
  const [editHypothesisId, setEditHypothesisId] = useState('');
  const [editDesignItemId, setEditDesignItemId] = useState('');
  const [editProvenance, setEditProvenance] = useState<Provenance | undefined>(undefined);

  const priorVersions = history.length - 1;
  const linkedItem = decision.designItemId
    ? (study.designItems ?? []).find((d) => d.id === decision.designItemId)
    : undefined;
  const designItemChoices = useMemo(() => {
    const current = designChains(study.designItems ?? []).map((c) => c.current);
    return linkedItem && !current.some((d) => d.id === linkedItem.id) ? [...current, linkedItem] : current;
  }, [study.designItems, linkedItem]);
  const linkedHypothesis = decision.hypothesisId
    ? study.hypotheses.find((h) => h.id === decision.hypothesisId)
    : undefined;

  // The picker offers each hypothesis's current version, plus whatever version
  // this decision already points at — a revision rationale is filed against a
  // specific version, and the select must be able to show it.
  const hypothesisChoices = useMemo(() => {
    const current = buildChains(study.hypotheses).map((c) => c.current);
    return linkedHypothesis && !current.some((h) => h.id === linkedHypothesis.id)
      ? [...current, linkedHypothesis]
      : current;
  }, [study.hypotheses, linkedHypothesis]);

  const startEditing = () => {
    setEditText(decision.decision);
    setEditRationale(decision.rationale ?? '');
    setEditAlternatives(decision.alternativesRejected ?? '');
    setEditStatus(decision.status === 'open' ? 'open' : 'settled');
    setEditHypothesisId(decision.hypothesisId ?? '');
    setEditDesignItemId(decision.designItemId ?? '');
    setEditProvenance(decision.provenance);
    setSettling(false);
    setReversing(false);
    setEditing(true);
  };

  const saveEdit = () => {
    const text = editText.trim();
    if (!text) return;
    // Only what changed goes in the patch, so an untouched save writes nothing.
    const patch: DecisionPatch = {};
    if (text !== decision.decision) patch.decision = text;
    if ((editRationale.trim() || null) !== decision.rationale) patch.rationale = editRationale.trim() || null;
    if ((editAlternatives.trim() || null) !== decision.alternativesRejected) {
      patch.alternativesRejected = editAlternatives.trim() || null;
    }
    // A superseded decision keeps that status — it is part of a chain, and
    // only a reversal moves a decision into it.
    if (decision.status !== 'superseded' && editStatus !== decision.status) patch.status = editStatus;
    if ((editHypothesisId || null) !== decision.hypothesisId) patch.hypothesisId = editHypothesisId || null;
    if ((editDesignItemId || null) !== (decision.designItemId ?? null)) patch.designItemId = editDesignItemId || null;
    if (editProvenance !== decision.provenance) patch.provenance = editProvenance;
    if (Object.keys(patch).length > 0) onEdit(patch);
    setEditing(false);
  };

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

      {decision.hypothesisId && (
        <p className="decision-alternatives">
          <span className="decision-field-label">Hypothesis:</span>{' '}
          {linkedHypothesis ? hypothesisOptionLabel(linkedHypothesis) : 'no longer in this study'}
        </p>
      )}

      {decision.designItemId && (
        <p className="decision-alternatives">
          <span className="decision-field-label">About:</span>{' '}
          {linkedItem
            ? designItemLabel(linkedItem) + (linkedItem.supersededBy ? ' (earlier version)' : '')
            : 'no longer in this study'}
        </p>
      )}

      {decision.provenance && (
        <span className="provenance-label">Origin: {provenanceLabel(decision.provenance)}</span>
      )}

      <div className="decision-actions">
        {!editing && (
          <button type="button" className="btn btn-sm btn-labelled" onClick={startEditing}>
            <Icon name="edit" size={12} /> Edit
          </button>
        )}
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
              setReplacementAlternatives('');
              setEditing(false);
              setReversing(true);
            }}
          >
            <Icon name="orbit" size={12} /> Reverse
          </button>
        )}
        <ConfirmDelete label="decision" onConfirm={onDelete} compact />
      </div>

      {editing && (
        <div className="study-inline-form">
          <p className="hypothesis-revise-note">
            Fixing wording, filling in the reasoning, or reopening? Edit — nothing is added to the
            history. Changed course? Use Reverse, which keeps this decision on the record.
          </p>
          <label className="detail-label" htmlFor={`edit-decision-${decision.id}`}>
            Decision
          </label>
          <textarea
            id={`edit-decision-${decision.id}`}
            className="text-input"
            rows={2}
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <label className="detail-label" htmlFor={`edit-decision-why-${decision.id}`}>
            Why
          </label>
          <textarea
            id={`edit-decision-why-${decision.id}`}
            className="text-input"
            rows={2}
            value={editRationale}
            onChange={(e) => setEditRationale(e.target.value)}
          />
          <label className="detail-label" htmlFor={`edit-decision-alt-${decision.id}`}>
            What you did not choose
          </label>
          <textarea
            id={`edit-decision-alt-${decision.id}`}
            className="text-input"
            rows={2}
            value={editAlternatives}
            onChange={(e) => setEditAlternatives(e.target.value)}
          />
          <div className="hypothesis-edit-fields">
            {decision.status !== 'superseded' && (
              <div>
                <label className="detail-label" htmlFor={`edit-decision-status-${decision.id}`}>
                  Status
                </label>
                <select
                  id={`edit-decision-status-${decision.id}`}
                  className="status-select"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'open' | 'settled')}
                >
                  <option value="open">Open</option>
                  <option value="settled">Settled</option>
                </select>
              </div>
            )}
            <div>
              <label className="detail-label" htmlFor={`edit-decision-provenance-${decision.id}`}>
                Originated with
              </label>
              <ProvenanceSelect
                id={`edit-decision-provenance-${decision.id}`}
                label="Decision originated with"
                value={editProvenance}
                onChange={setEditProvenance}
              />
            </div>
          </div>
          <label className="detail-label" htmlFor={`edit-decision-hypothesis-${decision.id}`}>
            Hypothesis it concerns
          </label>
          <select
            id={`edit-decision-hypothesis-${decision.id}`}
            className="status-select study-question-select"
            value={editHypothesisId}
            onChange={(e) => setEditHypothesisId(e.target.value)}
          >
            <option value="">The study at large</option>
            {hypothesisChoices.map((h) => (
              <option key={h.id} value={h.id}>
                {hypothesisOptionLabel(h)}
              </option>
            ))}
          </select>
          {designItemChoices.length > 0 && (
            <>
              <label className="detail-label" htmlFor={`edit-decision-item-${decision.id}`}>
                Design item it decides
              </label>
              <DesignItemSelect
                id={`edit-decision-item-${decision.id}`}
                items={designItemChoices}
                value={editDesignItemId}
                onChange={setEditDesignItemId}
              />
            </>
          )}
          <div className="study-inline-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={saveEdit}
              disabled={!editText.trim()}
            >
              Save
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
          <label className="detail-label" htmlFor={`reverse-alt-${decision.id}`}>
            What you are moving away from (optional)
          </label>
          <textarea
            id={`reverse-alt-${decision.id}`}
            className="text-input"
            rows={2}
            value={replacementAlternatives}
            placeholder={`Leave blank to record "${
              decision.decision.length > 50 ? `${decision.decision.slice(0, 50)}…` : decision.decision
            }"`}
            onChange={(e) => setReplacementAlternatives(e.target.value)}
          />
          <div className="study-inline-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!replacement.trim() || replacement.trim() === decision.decision}
              onClick={() => {
                onSupersede(
                  decision.id,
                  replacement.trim(),
                  rationale.trim() || undefined,
                  replacementAlternatives.trim() || undefined
                );
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
//
// The design is one card per section (Framework … Analysis), each item edited
// on its own. Sections with nothing in them collapse into the "Add to the
// design" row. Links between items, hypotheses and Library sources are
// Connections from the item (api/_design-items.ts).

type FieldInput = 'text' | 'textarea' | 'number' | 'role';

const FORM_FIELDS: Record<
  DesignItemKind,
  { key: keyof DesignItemFields; label: string; input: FieldInput; placeholder?: string }[]
> = {
  framework: [
    { key: 'text', label: 'Framework', input: 'textarea', placeholder: 'The theory the study rests on, and why it predicts what you expect' },
  ],
  participants: [
    { key: 'population', label: 'Population', input: 'text', placeholder: 'e.g. UD undergraduates' },
    { key: 'proficiency', label: 'Proficiency range', input: 'text', placeholder: 'e.g. A1–A2 Romanian' },
    { key: 'languages', label: 'Languages', input: 'text', placeholder: 'e.g. English L1, Romanian L2' },
    { key: 'inclusion', label: 'Inclusion criteria', input: 'textarea' },
    { key: 'exclusion', label: 'Exclusion criteria', input: 'textarea' },
    { key: 'targetN', label: 'Target N', input: 'number' },
    { key: 'text', label: 'Notes', input: 'textarea' },
  ],
  material: [
    { key: 'name', label: 'Name', input: 'text', placeholder: 'e.g. L2 cue list' },
    { key: 'text', label: 'Description', input: 'textarea', placeholder: 'How many, what level, how they were chosen' },
  ],
  measure: [
    { key: 'name', label: 'Instrument', input: 'text', placeholder: 'e.g. Lexical decision task' },
    { key: 'measures', label: 'What it measures', input: 'text' },
    { key: 'scoring', label: 'Scoring', input: 'textarea' },
    { key: 'text', label: 'Notes', input: 'textarea' },
  ],
  step: [
    { key: 'name', label: 'Step', input: 'text', placeholder: 'e.g. Consent and background questionnaire' },
    { key: 'minutes', label: 'Minutes', input: 'number' },
    { key: 'text', label: 'Notes', input: 'textarea' },
  ],
  variable: [
    { key: 'name', label: 'Name', input: 'text', placeholder: 'e.g. Reaction time' },
    { key: 'role', label: 'Role', input: 'role' },
    { key: 'text', label: 'Notes', input: 'textarea' },
  ],
  cleaning: [
    { key: 'text', label: 'Response cleaning', input: 'textarea', placeholder: 'What gets dropped or trimmed, and the cut-offs' },
  ],
  analysis: [
    { key: 'text', label: 'Analysis plan', input: 'textarea', placeholder: 'The model, and what result would support each hypothesis' },
  ],
};

/** Kinds whose items are identified by a name, so a name is required to save. */
const NAMED_KINDS = new Set<DesignItemKind>(['material', 'measure', 'step', 'variable']);

interface LinkSlot {
  toType: ConnectionNodeType;
  label: string;
  /** For design_item slots: which kind of item it may point at. */
  targetKind?: DesignItemKind;
}

const LINK_SLOTS: Record<DesignItemKind, LinkSlot[]> = {
  framework: [{ toType: 'article', label: 'Key sources' }],
  participants: [],
  material: [{ toType: 'article', label: 'Sources' }],
  measure: [{ toType: 'article', label: 'Sources' }],
  step: [],
  variable: [
    { toType: 'design_item', label: 'Produced by', targetKind: 'measure' },
    { toType: 'hypothesis', label: 'Tests' },
  ],
  cleaning: [{ toType: 'design_item', label: 'Applies to', targetKind: 'measure' }],
  analysis: [{ toType: 'hypothesis', label: 'Tests' }],
};

const ROLE_LABELS: Record<VariableRole, string> = {
  predictor: 'Predictor',
  outcome: 'Outcome',
  moderator: 'Moderator',
  covariate: 'Covariate',
};

interface LinkTarget {
  id: string;
  label: string;
  /** Where clicking it goes; absent for items on this same page. */
  view?: View;
}

/** What a slot could point at, in this study's project. */
function slotCandidates(slot: LinkSlot, study: Study, project: Project): LinkTarget[] {
  switch (slot.toType) {
    case 'article':
      return project.library.map((a) => ({
        id: a.id,
        label: a.year ? `${a.title} (${a.year})` : a.title,
        view: { name: 'article-detail', articleId: a.id },
      }));
    case 'hypothesis':
      return buildChains(study.hypotheses)
        .filter((c) => c.current.status !== 'superseded')
        .map(({ current: h }) => ({ id: h.id, label: h.label ? `${h.label}: ${h.statement}` : h.statement }));
    case 'design_item':
      return chainsOfKind(study, slot.targetKind ?? 'measure').map(({ current }) => ({
        id: current.id,
        label: current.fields.name ?? designItemLabel(current),
      }));
    default:
      return [];
  }
}

/**
 * The item's current links in a slot, resolved to things that still exist. A
 * hypothesis link reads through to its newest version, so a variable linked to
 * H1 keeps showing H1 after H1 is revised.
 */
function slotLinks(item: DesignItem, slot: LinkSlot, study: Study, project: Project): LinkTarget[] {
  const candidates = new Map(slotCandidates(slot, study, project).map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: LinkTarget[] = [];
  for (const c of linksFrom(project, item.id, slot.toType)) {
    const id = slot.toType === 'hypothesis' ? currentHypothesisId(study, c.toId) : c.toId;
    const target = candidates.get(id);
    if (!target || seen.has(id)) continue;
    seen.add(id);
    out.push(target);
  }
  return out;
}

/** One line per version, for the history timeline. */
function summarizeItem(item: DesignItem): string {
  const f = item.fields;
  const parts = FORM_FIELDS[item.kind]
    .map(({ key, label }) => {
      const v = f[key];
      if (v === undefined) return null;
      if (key === 'name' || (key === 'text' && !NAMED_KINDS.has(item.kind))) return String(v);
      if (key === 'role') return ROLE_LABELS[v as VariableRole];
      if (key === 'minutes') return `${v} min`;
      return `${label}: ${v}`;
    })
    .filter(Boolean);
  return parts.join(' · ') || DESIGN_ITEM_NOUNS[item.kind];
}

function DesignSection({ study, onNavigate }: { study: Study; onNavigate: (view: View) => void }) {
  const { activeProject } = useUserData();
  const [adding, setAdding] = useState<DesignItemKind | null>(null);

  const liveKinds = new Set((study.designItems ?? []).map((i) => i.kind));
  const shown = DESIGN_ITEM_KINDS.filter((k) => liveKinds.has(k) || adding === k);
  const addable = DESIGN_ITEM_KINDS.filter((k) => !liveKinds.has(k) && adding !== k);

  return (
    <section className="study-section" id="study-design" tabIndex={-1}>
      <div className="study-section-header">
        <h2 className="study-section-title">Design</h2>
      </div>

      {shown.map((kind) => (
        <DesignKindCard
          key={kind}
          kind={kind}
          study={study}
          project={activeProject}
          startAdding={adding === kind}
          onAddDone={() => setAdding(null)}
          onNavigate={onNavigate}
        />
      ))}

      {shown.length === 0 && (
        <p className="study-section-empty">
          Nothing structured yet. Add the sections one at a time; empty ones stay out of the way.
        </p>
      )}

      {addable.length > 0 && (
        <div className="design-add-row">
          <span className="design-add-label">Add to the design:</span>
          {addable.map((kind) => (
            <button key={kind} type="button" className="btn btn-sm" onClick={() => setAdding(kind)}>
              <Icon name="plus" size={12} /> {DESIGN_SECTION_LABELS[kind]}
            </button>
          ))}
        </div>
      )}

      {study.design && (
        <details className="study-collapsed-group design-archived" open={shown.length === 0}>
          <summary className="study-collapsed-summary">
            <Icon name="chevron-right" size={12} />
            Original design notes (archived)
          </summary>
          <p className="hypothesis-revise-note">
            The single block of text from before the design was split into sections. Kept as it was,
            read-only.
          </p>
          <MarkdownPreview content={study.design} />
        </details>
      )}
    </section>
  );
}

function DesignKindCard({
  kind,
  study,
  project,
  startAdding,
  onAddDone,
  onNavigate,
}: {
  kind: DesignItemKind;
  study: Study;
  project: Project;
  startAdding: boolean;
  onAddDone: () => void;
  onNavigate: (view: View) => void;
}) {
  const { addDesignItem, setDesignItemLinks } = useUserData();
  const [adding, setAdding] = useState(false);
  const chains = chainsOfKind(study, kind);
  const singleton = SINGLETON_KINDS.has(kind);
  const formOpen = adding || (startAdding && chains.length === 0);

  const closeForm = () => {
    setAdding(false);
    onAddDone();
  };

  const add = (fields: DesignItemFields, links: Map<ConnectionNodeType, string[]>, provenance?: Provenance) => {
    const id = addDesignItem(study.id, kind, fields, { provenance });
    for (const [toType, ids] of links) if (ids.length > 0) setDesignItemLinks(id, toType, ids);
    closeForm();
  };

  return (
    <div className="design-kind" id={`design-section-${kind}`} tabIndex={-1}>
      <div className="design-kind-header">
        <h3 className="design-kind-title">
          {DESIGN_SECTION_LABELS[kind]}
          {!singleton && <span className="study-section-count">{chains.length}</span>}
          {chains.length > 0 && <DesignStatus status={sectionStatus(study, kind)} />}
        </h3>
        {kind === 'step' && <ProcedureTotal study={study} />}
      </div>

      {kind === 'variable' && chains.length > 0 && (
        <VariablesTable study={study} project={project} />
      )}

      {chains.map(({ current, history }, i) => (
        <DesignItemRow
          key={current.id}
          item={current}
          history={history}
          index={kind === 'step' ? i + 1 : undefined}
          study={study}
          project={project}
          onNavigate={onNavigate}
          compact={kind === 'variable'}
        />
      ))}

      {formOpen ? (
        <DesignItemForm
          kind={kind}
          study={study}
          project={project}
          mode="add"
          onSave={add}
          onCancel={closeForm}
        />
      ) : (
        !singleton || chains.length === 0 ? (
          <button type="button" className="btn btn-sm btn-labelled design-add-item" onClick={() => setAdding(true)}>
            <Icon name="plus" size={12} /> Add {DESIGN_ITEM_NOUNS[kind].toLowerCase()}
          </button>
        ) : null
      )}
    </div>
  );
}

/** Total of the steps' minutes against the study's target, with the target editable in place. */
function ProcedureTotal({ study }: { study: Study }) {
  const { setTargetSessionMinutes } = useUserData();
  const { minutes, unTimed } = procedureTotal(study);
  const target = study.targetSessionMinutes;
  const [draft, setDraft] = useState(target !== undefined ? String(target) : '');
  const over = target !== undefined && minutes > target;

  const commit = () => {
    const n = Number(draft);
    const next = draft.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : n;
    if (next !== (target ?? null)) setTargetSessionMinutes(study.id, next);
    setDraft(next === null ? '' : String(next));
  };

  return (
    <div className={`design-total${over ? ' design-total-over' : ''}`}>
      <span>
        Total {minutes} min
        {over && ` — ${Math.round((minutes - target!) * 10) / 10} over`}
        {unTimed > 0 && ` (${unTimed} step${unTimed === 1 ? '' : 's'} not timed)`}
      </span>
      <label className="design-total-target">
        target
        <input
          type="number"
          min={1}
          inputMode="decimal"
          className="text-input design-number-input"
          aria-label="Target session length in minutes"
          value={draft}
          placeholder="—"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        min
      </label>
    </div>
  );
}

/** Name · role · measure · hypotheses, one row per variable. Editing happens on the rows below. */
function VariablesTable({ study, project }: { study: Study; project: Project }) {
  const [measureSlot, hypothesisSlot] = LINK_SLOTS.variable;
  return (
    <div className="design-table-wrap">
      <table className="design-table">
        <thead>
          <tr>
            <th scope="col">Variable</th>
            <th scope="col">Role</th>
            <th scope="col">Measure</th>
            <th scope="col">Tests</th>
          </tr>
        </thead>
        <tbody>
          {chainsOfKind(study, 'variable').map(({ current: v }) => {
            const measures = slotLinks(v, measureSlot, study, project);
            const tests = slotLinks(v, hypothesisSlot, study, project);
            return (
              <tr key={v.id}>
                <td>{v.fields.name ?? '—'}</td>
                <td>{v.fields.role ? ROLE_LABELS[v.fields.role] : <span className="design-missing">not set</span>}</td>
                <td>{measures.length > 0 ? measures.map((m) => m.label).join(', ') : <span className="design-missing">none</span>}</td>
                <td>
                  {tests.length > 0
                    ? tests.map((h) => h.label.split(':')[0]).join(', ')
                    : <span className="design-missing">none</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DesignItemRow({
  item,
  history,
  index,
  study,
  project,
  onNavigate,
  compact = false,
}: {
  item: DesignItem;
  history: DesignItem[];
  /** Step number, for procedure steps. */
  index?: number;
  study: Study;
  project: Project;
  onNavigate: (view: View) => void;
  /** Variables: the table above already shows the fields, so the row shows only the name. */
  compact?: boolean;
}) {
  const { updateDesignItem, reviseDesignItem, deleteDesignItem, setDesignItemLinks, addDecision } = useUserData();
  const [mode, setMode] = useState<'view' | 'edit' | 'revise' | 'ask'>('view');
  const [question, setQuestion] = useState('');
  const priorVersions = history.length - 1;
  const slots = LINK_SLOTS[item.kind];
  const openHere = openDecisionsOn(study, item.id);
  const status = effectiveStatus(study, item);
  const noun = DESIGN_ITEM_NOUNS[item.kind].toLowerCase();

  const saveEdit = (fields: DesignItemFields, links: Map<ConnectionNodeType, string[]>, provenance?: Provenance) => {
    updateDesignItem(study.id, item.id, { fields, provenance });
    for (const slot of slots) {
      const before = slotLinks(item, slot, study, project).map((t) => t.id).sort();
      const after = [...(links.get(slot.toType) ?? [])].sort();
      if (before.join() !== after.join()) setDesignItemLinks(item.id, slot.toType, after);
    }
    setMode('view');
  };

  const saveRevision = (fields: DesignItemFields, _links: Map<ConnectionNodeType, string[]>, _p?: Provenance, rationale?: string) => {
    reviseDesignItem(study.id, item.id, fields, rationale);
    setMode('view');
  };

  const f = item.fields;
  return (
    <div className={`hypothesis-row design-item design-item-${status}`} id={`design-item-${item.id}`} tabIndex={-1}>
      {mode !== 'edit' && mode !== 'revise' && (
        <>
          <div className="design-item-head">
            <div className="design-item-body">
              {compact ? (
                <p className="design-item-name">{f.name ?? DESIGN_ITEM_NOUNS[item.kind]}</p>
              ) : (
                <DesignItemFieldsView item={item} index={index} />
              )}
            </div>
            {/* An open decision keeps the item open — the toggle is locked
                until it is settled, which is the point of attaching it. */}
            {openHere.length > 0 ? (
              <span title="Settle its open decision to settle this">
                <DesignStatus status="open" />
              </span>
            ) : (
              <button
                type="button"
                className="design-status-toggle"
                onClick={() => updateDesignItem(study.id, item.id, { status: status === 'settled' ? 'open' : 'settled' })}
                aria-label={status === 'settled' ? `Settled — mark this ${noun} open again` : `Open — mark this ${noun} settled`}
                title={status === 'settled' ? 'Mark open again' : 'Mark settled'}
              >
                <DesignStatus status={status} />
              </button>
            )}
          </div>

          {openHere.map((d) => (
            <OpenDecisionOnItem key={d.id} decision={d} item={item} study={study} />
          ))}

          {!compact &&
            slots.map((slot) => {
              const links = slotLinks(item, slot, study, project);
              if (links.length === 0) return null;
              return (
                <div key={slot.toType} className="hypothesis-question design-links">
                  <span>{slot.label}:</span>
                  <span className="design-link-list">
                    {links.map((t) =>
                      t.view ? (
                        <button
                          key={t.id}
                          type="button"
                          className="hypothesis-question-link"
                          onClick={() => onNavigate(t.view!)}
                        >
                          {t.label}
                        </button>
                      ) : (
                        <span key={t.id} className="design-link-static">{t.label}</span>
                      )
                    )}
                  </span>
                </div>
              );
            })}

          {item.provenance && (
            <span className="provenance-label">Origin: {provenanceLabel(item.provenance)}</span>
          )}

          <div className="hypothesis-actions">
            <button type="button" className="btn btn-sm btn-labelled" onClick={() => setMode('edit')}>
              <Icon name="edit" size={12} /> Edit
            </button>
            <button type="button" className="btn btn-sm btn-labelled" onClick={() => setMode('revise')}>
              <Icon name="orbit" size={12} /> Revise (new version)
            </button>
            {mode !== 'ask' && (
              <button type="button" className="btn btn-sm btn-labelled" onClick={() => setMode('ask')}>
                <Icon name="zap" size={12} /> Add open question
              </button>
            )}
            <ConfirmDelete
              label={DESIGN_ITEM_NOUNS[item.kind].toLowerCase()}
              onConfirm={() => deleteDesignItem(study.id, item.id)}
              compact
              detail={
                priorVersions > 0
                  ? `All ${history.length} versions and its links go with it. To change the wording, use Edit instead.`
                  : undefined
              }
            />
          </div>
          {mode === 'ask' && (
            <div className="study-inline-form hypothesis-revise">
              <label className="detail-label" htmlFor={`ask-${item.id}`}>
                What is still undecided about this {noun}?
              </label>
              <textarea
                id={`ask-${item.id}`}
                className="text-input"
                rows={2}
                autoFocus
                value={question}
                placeholder="e.g. How many cues — 20 or 30?"
                onChange={(e) => setQuestion(e.target.value)}
              />
              <p className="hypothesis-revise-note">
                It is added to Decisions as open, and keeps this {noun} marked open until it is settled.
              </p>
              <div className="study-inline-form-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!question.trim()}
                  onClick={() => {
                    addDecision(study.id, { decision: question.trim(), status: 'open', designItemId: item.id });
                    setQuestion('');
                    setMode('view');
                  }}
                >
                  Add
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setMode('view')}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'edit' && (
        <DesignItemForm
          kind={item.kind}
          study={study}
          project={project}
          mode="edit"
          item={item}
          onSave={saveEdit}
          onCancel={() => setMode('view')}
        />
      )}

      {mode === 'revise' && (
        <DesignItemForm
          kind={item.kind}
          study={study}
          project={project}
          mode="revise"
          item={item}
          onSave={saveRevision}
          onCancel={() => setMode('view')}
        />
      )}

      {mode === 'view' && priorVersions > 0 && (
        <details className="chain-details">
          <summary className="chain-summary">
            <Icon name="chevron-right" size={12} />
            History — {priorVersions} earlier version{priorVersions === 1 ? '' : 's'}
          </summary>
          <Chain
            entries={history.map((h, i) => ({
              key: h.id,
              version: i + 1,
              text: summarizeItem(h),
              isCurrent: h.id === item.id,
              // reviseDesignItem files the reason against the NEW version, so
              // the step out of this one reads off the next — the hypothesis rule.
              rationale:
                study.decisions.find((d) => d.designItemId === history[i + 1]?.id && d.rationale)?.rationale ??
                null,
            }))}
          />
        </details>
      )}
    </div>
  );
}

/** 🟢 settled / 🟡 open, as a dot and a word — the app uses no emoji. */
function DesignStatus({ status }: { status: 'open' | 'settled' }) {
  return (
    <span className={`design-status design-status-${status}`}>
      <span className="design-status-dot" aria-hidden="true" />
      {status === 'settled' ? 'Settled' : 'Open'}
    </span>
  );
}

/**
 * An open decision shown inside the item it is about, with its own Settle.
 * Settling can write what was chosen into one of the item's fields — the cue
 * count into the cue list — and settles the item once nothing else is open.
 */
function OpenDecisionOnItem({ decision, item, study }: { decision: Decision; item: DesignItem; study: Study }) {
  const { settleDecision } = useUserData();
  const [settling, setSettling] = useState(false);
  const [outcome, setOutcome] = useState(decision.decision);
  const [why, setWhy] = useState('');
  const [fill, setFill] = useState('');
  const fillable = FORM_FIELDS[item.kind].filter(({ key }) => fillableFields(item.kind).includes(key));
  const numeric = fill === 'minutes' || fill === 'targetN';
  const badNumber = numeric && !(Number.isFinite(Number(outcome.trim())) && outcome.trim() !== '' && Number(outcome) >= 0);
  const others = openDecisionsOn(study, item.id).length - 1;

  return (
    <div className="design-open-decision">
      <p className="design-open-decision-text">
        <Icon name="zap" size={12} /> <span className="decision-field-label">Open:</span> {decision.decision}
      </p>
      {!settling ? (
        <button
          type="button"
          className="btn btn-sm btn-labelled"
          onClick={() => {
            setOutcome(decision.decision);
            setSettling(true);
          }}
        >
          <Icon name="check" size={12} /> Settle this
        </button>
      ) : (
        <div className="study-inline-form">
          <label className="detail-label" htmlFor={`settle-out-${decision.id}`}>
            What did you decide?
          </label>
          <textarea
            id={`settle-out-${decision.id}`}
            className="text-input"
            rows={2}
            autoFocus
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
          <label className="detail-label" htmlFor={`settle-why-${decision.id}`}>
            Why (optional)
          </label>
          <textarea
            id={`settle-why-${decision.id}`}
            className="text-input"
            rows={2}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
          {fillable.length > 0 && (
            <>
              <label className="detail-label" htmlFor={`settle-fill-${decision.id}`}>
                Write it into the {DESIGN_ITEM_NOUNS[item.kind].toLowerCase()}
              </label>
              <select
                id={`settle-fill-${decision.id}`}
                className="status-select"
                value={fill}
                onChange={(e) => setFill(e.target.value)}
              >
                <option value="">Don't change the {DESIGN_ITEM_NOUNS[item.kind].toLowerCase()}</option>
                {fillable.map(({ key, label }) => (
                  <option key={key} value={key}>
                    Replace {label.toLowerCase()}
                  </option>
                ))}
              </select>
              {badNumber && <p className="linked-article-hint">That field takes a number.</p>}
            </>
          )}
          <p className="hypothesis-revise-note">
            {others > 0
              ? `${others} more open question${others === 1 ? '' : 's'} on this keep it open.`
              : `This marks the ${DESIGN_ITEM_NOUNS[item.kind].toLowerCase()} settled too.`}
          </p>
          <div className="study-inline-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!outcome.trim() || badNumber}
              onClick={() => {
                settleDecision(study.id, decision.id, {
                  decision: outcome.trim(),
                  rationale: why.trim() || undefined,
                  fillField: (fill || undefined) as keyof DesignItemFields | undefined,
                });
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
    </div>
  );
}

/** The item's fields, laid out by kind. Long-form fields render as markdown. */
function DesignItemFieldsView({ item, index }: { item: DesignItem; index?: number }) {
  const f = item.fields;
  const spec = FORM_FIELDS[item.kind];

  if (!NAMED_KINDS.has(item.kind) && item.kind !== 'participants') {
    return f.text ? <MarkdownPreview content={f.text} /> : <p className="study-section-empty">Empty.</p>;
  }

  const rows = spec.filter(({ key }) => key !== 'name' && f[key] !== undefined && !(item.kind === 'step' && key === 'minutes'));
  return (
    <>
      {f.name !== undefined && (
        <p className="design-item-name">
          {index !== undefined && <span className="hypothesis-label">{index}.</span>} {f.name}
          {item.kind === 'step' && f.minutes !== undefined && <span className="design-minutes">{f.minutes} min</span>}
        </p>
      )}
      {rows.length > 0 && (
        <dl className="design-fields">
          {rows.map(({ key, label, input }) => (
            <div key={key} className="design-field">
              <dt>{label}</dt>
              <dd>
                {input === 'textarea' ? (
                  <MarkdownPreview content={String(f[key])} />
                ) : key === 'role' ? (
                  ROLE_LABELS[f.role!]
                ) : (
                  String(f[key])
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

/** Add, edit (in place, no history) or revise (new version, says why). */
function DesignItemForm({
  kind,
  study,
  project,
  mode,
  item,
  onSave,
  onCancel,
}: {
  kind: DesignItemKind;
  study: Study;
  project: Project;
  mode: 'add' | 'edit' | 'revise';
  item?: DesignItem;
  onSave: (
    fields: DesignItemFields,
    links: Map<ConnectionNodeType, string[]>,
    provenance?: Provenance,
    rationale?: string
  ) => void;
  onCancel: () => void;
}) {
  const spec = FORM_FIELDS[kind];
  const slots = mode === 'revise' ? [] : LINK_SLOTS[kind];
  const idBase = `design-${item?.id ?? kind}-${mode}`;

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.map(({ key }) => [key, item?.fields[key] !== undefined ? String(item.fields[key]) : '']))
  );
  const [links, setLinks] = useState<Map<ConnectionNodeType, string[]>>(
    () =>
      new Map(
        LINK_SLOTS[kind].map((slot) => [
          slot.toType,
          item ? slotLinks(item, slot, study, project).map((t) => t.id) : [],
        ])
      )
  );
  const [provenance, setProvenance] = useState<Provenance | undefined>(item?.provenance);
  const [rationale, setRationale] = useState('');

  const fields = useMemo(() => {
    const raw: Record<string, unknown> = {};
    for (const { key, input } of spec) {
      const v = values[key] ?? '';
      if (input === 'number') {
        const n = Number(v);
        if (v.trim() !== '' && Number.isFinite(n)) raw[key] = n;
      } else if (v.trim() !== '') {
        raw[key] = v;
      }
    }
    return normalizeDesignFields(kind, raw);
  }, [values, spec, kind]);

  const hasContent = Object.keys(fields).length > 0 && (!NAMED_KINDS.has(kind) || !!fields.name);
  const unchanged = mode === 'revise' && item && JSON.stringify(fields) === JSON.stringify(normalizeDesignFields(kind, item.fields));
  const canSave = hasContent && !unchanged && (mode !== 'revise' || rationale.trim() !== '');

  return (
    <div className="study-inline-form hypothesis-revise">
      {mode === 'edit' && (
        <p className="hypothesis-revise-note">
          Correcting or filling in? Edit — nothing is added to the history. Changed your mind about the
          design itself? Use Revise instead.
        </p>
      )}
      {mode === 'revise' && (
        <p className="hypothesis-revise-note">
          Revising keeps this version as history rather than overwriting it. Its links move to the new
          version. Say why, and the reason is recorded alongside the change.
        </p>
      )}

      {spec.map(({ key, label, input, placeholder }) => {
        const id = `${idBase}-${key}`;
        return (
          <div key={key}>
            <label className="detail-label" htmlFor={id}>
              {label}
            </label>
            {input === 'textarea' ? (
              <textarea
                id={id}
                className="text-input"
                rows={key === 'text' && spec.length === 1 ? 6 : 2}
                value={values[key]}
                placeholder={placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            ) : input === 'role' ? (
              <select
                id={id}
                className="status-select"
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              >
                <option value="">Role not set</option>
                {VARIABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                className={`text-input${input === 'number' ? ' design-number-input' : ''}`}
                type={input === 'number' ? 'number' : 'text'}
                min={input === 'number' ? 0 : undefined}
                inputMode={input === 'number' ? 'decimal' : undefined}
                value={values[key]}
                placeholder={placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            )}
          </div>
        );
      })}

      {slots.map((slot) => (
        <LinkPicker
          key={slot.toType}
          id={`${idBase}-link-${slot.toType}`}
          label={slot.label}
          candidates={slotCandidates(slot, study, project)}
          value={links.get(slot.toType) ?? []}
          onChange={(ids) => setLinks((m) => new Map(m).set(slot.toType, ids))}
        />
      ))}

      {mode !== 'revise' && (
        <>
          <label className="detail-label" htmlFor={`${idBase}-provenance`}>
            Originated with
          </label>
          <ProvenanceSelect
            id={`${idBase}-provenance`}
            label="Originated with"
            value={provenance}
            onChange={setProvenance}
          />
        </>
      )}

      {mode === 'revise' && (
        <>
          <label className="detail-label" htmlFor={`${idBase}-why`}>
            Why it changed
          </label>
          <textarea
            id={`${idBase}-why`}
            className="text-input"
            rows={2}
            value={rationale}
            placeholder="e.g. the pilot ran 12 minutes long"
            onChange={(e) => setRationale(e.target.value)}
          />
        </>
      )}

      <div className="study-inline-form-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!canSave}
          onClick={() => onSave(fields, links, provenance, rationale.trim() || undefined)}
        >
          {mode === 'revise' ? 'Save revision' : 'Save'}
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
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
