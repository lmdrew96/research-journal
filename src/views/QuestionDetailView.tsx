import type { View, QuestionStatus } from '../types';
import { getQuestionById } from '../data/research-themes';
import { useUserData } from '../hooks/useUserData';
import StarToggle from '../components/common/StarToggle';
import TagPill from '../components/common/TagPill';
import StatusBadge from '../components/questions/StatusBadge';
import SourceList from '../components/questions/SourceList';
import NotesList from '../components/notes/NotesList';

interface QuestionDetailViewProps {
  questionId: string;
  onNavigate: (view: View) => void;
}

export default function QuestionDetailView({
  questionId,
  onNavigate,
}: QuestionDetailViewProps) {
  const question = getQuestionById(questionId);
  const { getQuestionData, setStatus, toggleStar, addNote, updateNote, deleteNote } =
    useUserData();

  if (!question) {
    return (
      <div className="main-inner">
        <p style={{ color: 'var(--text-dim)' }}>Question not found.</p>
      </div>
    );
  }

  const qData = getQuestionData(questionId);

  return (
    <div className="main-inner">
      <button
        className="back-btn"
        onClick={() => onNavigate({ name: 'questions' })}
        style={{ marginTop: 24 }}
      >
        &#x2190; Back to Questions
      </button>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <StarToggle
            active={qData.starred}
            onClick={(e) => {
              e.stopPropagation();
              toggleStar(questionId);
            }}
          />
          <div style={{ flex: 1 }}>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 400,
                color: 'var(--text-heading)',
                lineHeight: 1.4,
                marginBottom: 12,
              }}
            >
              {question.q}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {question.tags.map((tag) => (
                  <TagPill key={tag} tag={tag} />
                ))}
              </div>
              <StatusBadge status={qData.status} />
              <select
                className="status-select"
                value={qData.status}
                onChange={(e) =>
                  setStatus(questionId, e.target.value as QuestionStatus)
                }
              >
                <option value="not_started">Not started</option>
                <option value="exploring">Exploring</option>
                <option value="has_findings">Has findings</option>
                <option value="concluded">Concluded</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="detail-layout">
        {/* Left column: reference material */}
        <div>
          <div className="detail-column-title">Reference</div>

          <div className="detail-section">
            <div className="detail-label" style={{ color: question.themeColor }}>
              Why This Matters
            </div>
            <p className="detail-text">{question.why}</p>
          </div>

          <div className="detail-section">
            <div className="detail-label" style={{ color: '#2ECC71' }}>
              &rarr; ChaosLimb&#x103; Implication
            </div>
            <p className="detail-text implication-text">
              {question.appImplication}
            </p>
          </div>

          <div className="detail-section">
            <SourceList
              questionId={questionId}
              originalSources={question.sources}
              themeColor={question.themeColor}
            />
          </div>
        </div>

        {/* Right column: research notes */}
        <div>
          <div className="detail-column-title">
            Research Notes ({qData.notes.length})
          </div>
          <NotesList
            notes={qData.notes}
            questionId={questionId}
            onAdd={(content) => addNote(questionId, content)}
            onUpdate={(noteId, content) => updateNote(questionId, noteId, content)}
            onDelete={(noteId) => deleteNote(questionId, noteId)}
          />
        </div>
      </div>
    </div>
  );
}
