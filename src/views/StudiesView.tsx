import { useState } from 'react';
import type { View, Study } from '../types';
import { useUserData } from '../hooks/useUserData';
import Icon from '../components/common/Icon';
import EmptyState from '../components/common/EmptyState';
import StudyStatusBadge from '../components/studies/StudyStatusBadge';

interface StudiesViewProps {
  onNavigate: (view: View) => void;
}

export default function StudiesView({ onNavigate }: StudiesViewProps) {
  const { studies, addStudy, activeProject } = useUserData();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const id = addStudy({ title: trimmed });
    setTitle('');
    setCreating(false);
    // Straight into the new study — the next thing anyone wants is to start
    // filling it in, not to look at a list with one more row on it.
    onNavigate({ name: 'study-detail', studyId: id });
  };

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">Research</div>
        <h1 className="view-header-title">Studies</h1>
        <p className="view-header-subtitle">
          {studies.length === 0
            ? 'Research you are designing yourself'
            : `${studies.length} stud${studies.length === 1 ? 'y' : 'ies'}`}
        </p>
      </div>

      {studies.length > 0 && !creating && (
        <div className="studies-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={13} /> New study
          </button>
        </div>
      )}

      {creating && (
        <div className="study-create">
          <label className="detail-label" htmlFor="new-study-title">
            Study title
          </label>
          <input
            id="new-study-title"
            className="text-input"
            type="text"
            autoFocus
            value={title}
            placeholder="What are you investigating?"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') create();
              if (e.key === 'Escape') {
                setCreating(false);
                setTitle('');
              }
            }}
          />
          <div className="study-create-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={create}
              disabled={!title.trim()}
            >
              Create study
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setCreating(false);
                setTitle('');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {studies.map((study) => (
        <StudyCard
          key={study.id}
          study={study}
          onOpen={() => onNavigate({ name: 'study-detail', studyId: study.id })}
        />
      ))}

      {studies.length === 0 && !creating && (
        <EmptyState
          icon="orbit"
          text={`${activeProject.name} has no studies yet. A study is research you are designing yourself — it holds your hypotheses, your design decisions, and the reasoning behind both. The library holds what other people wrote; this holds what you are doing.`}
          action={{ label: 'New study', onClick: () => setCreating(true) }}
        />
      )}
    </div>
  );
}

// ---------- Study Card ----------

function StudyCard({ study, onOpen }: { study: Study; onOpen: () => void }) {
  const activeHypotheses = study.hypotheses.filter((h) => h.status === 'active').length;
  const openDecisions = study.decisions.filter((d) => d.status === 'open').length;

  return (
    <div className="study-card" onClick={onOpen}>
      <div className="study-card-header">
        <button type="button" className="study-card-title" onClick={onOpen}>
          {study.title}
        </button>
        <StudyStatusBadge status={study.status} />
      </div>

      {study.description && <div className="study-card-description">{study.description}</div>}

      <div className="study-card-counts">
        <span className="study-count">
          <Icon name="lightbulb" size={12} />
          {activeHypotheses} active hypothes{activeHypotheses === 1 ? 'is' : 'es'}
        </span>

        {/* The number that should draw the eye. Informational, not alarming —
            this is a working list, not an error state. */}
        {openDecisions > 0 && (
          <span className="study-count study-count-open">
            <Icon name="zap" size={12} />
            {openDecisions} open decision{openDecisions === 1 ? '' : 's'}
          </span>
        )}

        {study.linkedQuestions.length > 0 && (
          <span className="study-count">
            <Icon name="clipboard" size={12} />
            {study.linkedQuestions.length} question
            {study.linkedQuestions.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
}
