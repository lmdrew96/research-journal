import { useState } from 'react';
import type { Provenance, Thought, View } from '../../types';
import { useUserData } from '../../hooks/useUserData';
import { provenanceOptions, provenanceLabel } from '../../data/provenance';
import { thoughtsAbout } from '../../../api/_thoughts';
import MarkdownPreview from '../common/MarkdownPreview';
import ConfirmDelete from '../common/ConfirmDelete';
import LinkPicker from '../common/LinkPicker';
import Icon from '../common/Icon';

/**
 * Thoughts on one item — the Reframe's unit: what Nae thinks, mostly harvested
 * from chats with Coru, each labeled with who it came from. The label is the
 * point (it keeps her thesis thinking hers), so it leads every card.
 */

type Target = { articleId?: string; questionId?: string; studyId?: string };

/** Past this many characters a clamped thought folds. */
const CLAMP_CHARS = 600;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Who a thought came from, as a dot and a word. Unrecorded says so, quietly. */
export function OriginBadge({ provenance }: { provenance?: Provenance }) {
  return (
    <span className={`origin-badge origin-${provenance ?? 'unknown'}`}>
      <span className="origin-dot" aria-hidden="true" />
      {provenance ? provenanceLabel(provenance) : 'Origin not recorded'}
    </span>
  );
}

export default function ThoughtsSection({
  target,
  onNavigate,
  emptyText = 'No thoughts here yet. They arrive when you keep them at the end of a chat with Coru, or add one yourself.',
}: {
  target: Target;
  onNavigate: (view: View) => void;
  emptyText?: string;
}) {
  const { activeProject, addThought } = useUserData();
  const [adding, setAdding] = useState(false);
  // Cheap filter; not memoized because `target` is usually an inline object.
  const list = thoughtsAbout(activeProject, target);

  return (
    <div className="thoughts">
      {list.map((t) => (
        <ThoughtCard key={t.id} thought={t} context={target} onNavigate={onNavigate} />
      ))}
      {list.length === 0 && !adding && <p className="thoughts-empty">{emptyText}</p>}

      {adding ? (
        <ThoughtForm
          initial={{
            text: '',
            // Typed here by Nae, so hers unless she says otherwise — and the
            // choice is visible right above Save, not silent.
            provenance: 'nae',
            articleIds: target.articleId ? [target.articleId] : [],
            questionIds: target.questionId ? [target.questionId] : [],
            studyId: target.studyId ?? null,
          }}
          submitLabel="Save thought"
          onSave={(t) => {
            addThought(t);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="btn btn-sm btn-labelled" onClick={() => setAdding(true)}>
          <Icon name="plus" size={12} /> Add a thought
        </button>
      )}
    </div>
  );
}

/** One thought: origin, text, the other things it is about, and its actions. */
export function ThoughtCard({
  thought,
  context = {},
  onNavigate,
  clamp = false,
}: {
  thought: Thought;
  /** The page it's shown on — that link is implied, so it isn't listed. */
  context?: Target;
  onNavigate: (view: View) => void;
  /** Fold a long thought behind "Show all" (What I think, where many stack up). */
  clamp?: boolean;
}) {
  const { activeProject, getAllQuestions, updateThought, deleteThought } = useUserData();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const folded = clamp && !expanded && thought.text.length > CLAMP_CHARS;

  const articles = thought.articleIds
    .filter((id) => id !== context.articleId)
    .map((id) => activeProject.library.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a);
  const questions = thought.questionIds
    .filter((id) => id !== context.questionId)
    .map((id) => getAllQuestions().find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => !!q);
  const study =
    thought.studyId && thought.studyId !== context.studyId
      ? (activeProject.studies ?? []).find((s) => s.id === thought.studyId)
      : undefined;

  if (editing) {
    return (
      <ThoughtForm
        initial={thought}
        submitLabel="Save"
        onSave={(t) => {
          updateThought(thought.id, t);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="thought-card">
      <div className="thought-head">
        <OriginBadge provenance={thought.provenance} />
        <span className="thought-date">{formatDate(thought.createdAt)}</span>
      </div>
      <div className={folded ? 'thought-text-folded' : undefined}>
        <MarkdownPreview content={thought.text} />
      </div>
      {clamp && thought.text.length > CLAMP_CHARS && (
        <button
          type="button"
          className="wit-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show all'}
        </button>
      )}

      {(articles.length > 0 || questions.length > 0 || study) && (
        <div className="thought-links">
          {articles.map((a) => (
            <button
              key={a.id}
              type="button"
              className="hypothesis-question-link"
              onClick={() => onNavigate({ name: 'article-detail', articleId: a.id })}
            >
              {clip(a.title, 60)}
            </button>
          ))}
          {questions.map((q) => (
            <button
              key={q.id}
              type="button"
              className="hypothesis-question-link"
              onClick={() => onNavigate({ name: 'question-detail', questionId: q.id })}
            >
              {clip(q.q, 60)}
            </button>
          ))}
          {study && (
            <button
              type="button"
              className="hypothesis-question-link"
              onClick={() => onNavigate({ name: 'study-detail', studyId: study.id })}
            >
              Study: {clip(study.title, 50)}
            </button>
          )}
        </div>
      )}

      <div className="thought-actions">
        <button type="button" className="btn btn-sm btn-labelled" onClick={() => setEditing(true)}>
          <Icon name="edit" size={12} /> Edit
        </button>
        <ConfirmDelete label="thought" onConfirm={() => deleteThought(thought.id)} compact />
      </div>
    </div>
  );
}

type ThoughtInput = Pick<Thought, 'text' | 'articleIds' | 'questionIds' | 'studyId'> & {
  provenance?: Provenance;
};

/** Add or edit: the text, who it came from, and what it is about. */
function ThoughtForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: ThoughtInput;
  submitLabel: string;
  onSave: (t: ThoughtInput) => void;
  onCancel: () => void;
}) {
  const { activeProject, getAllQuestions } = useUserData();
  const [text, setText] = useState(initial.text);
  const [provenance, setProvenance] = useState<Provenance | undefined>(initial.provenance);
  const [articleIds, setArticleIds] = useState(initial.articleIds);
  const [questionIds, setQuestionIds] = useState(initial.questionIds);
  const [studyId, setStudyId] = useState(initial.studyId ?? '');
  const [idBase] = useState(() => `thought-${Math.random().toString(36).slice(2, 8)}`);

  const articleOptions = activeProject.library.map((a) => ({
    id: a.id,
    label: a.year ? `${a.title} (${a.year})` : a.title,
  }));
  const questionOptions = getAllQuestions().map((q) => ({ id: q.id, label: q.q }));
  const studies = activeProject.studies ?? [];

  return (
    <div className="study-inline-form thought-form">
      <label className="detail-label" htmlFor={`${idBase}-text`}>
        Thought
      </label>
      <textarea
        id={`${idBase}-text`}
        className="text-input"
        rows={4}
        autoFocus
        value={text}
        placeholder="What you think — markdown works"
        onChange={(e) => setText(e.target.value)}
      />

      <label className="detail-label" htmlFor={`${idBase}-origin`}>
        Came from
      </label>
      <select
        id={`${idBase}-origin`}
        className="status-select"
        value={provenance ?? ''}
        onChange={(e) => setProvenance((e.target.value || undefined) as Provenance | undefined)}
      >
        <option value="">Not recorded</option>
        {provenanceOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <LinkPicker
        id={`${idBase}-articles`}
        label="About these sources"
        candidates={articleOptions}
        value={articleIds}
        onChange={setArticleIds}
      />
      <LinkPicker
        id={`${idBase}-questions`}
        label="Part of these threads"
        candidates={questionOptions}
        value={questionIds}
        onChange={setQuestionIds}
      />
      {studies.length > 0 && (
        <>
          <label className="detail-label" htmlFor={`${idBase}-study`}>
            Bears on a study
          </label>
          <select
            id={`${idBase}-study`}
            className="status-select study-question-select"
            value={studyId}
            onChange={(e) => setStudyId(e.target.value)}
          >
            <option value="">No study</option>
            {studies.map((s) => (
              <option key={s.id} value={s.id}>
                {clip(s.title, 60)}
              </option>
            ))}
          </select>
        </>
      )}

      <div className="study-inline-form-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!text.trim()}
          onClick={() => onSave({ text: text.trim(), provenance, articleIds, questionIds, studyId: studyId || null })}
        >
          {submitLabel}
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
