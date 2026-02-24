import { useState } from 'react';
import type { View, ResearchQuestion } from '../types';
import { useUserData } from '../hooks/useUserData';
import { createId } from '../lib/ids';
import Icon from '../components/common/Icon';

interface ManageThemesViewProps {
  onNavigate: (view: View) => void;
}

const iconOptions = [
  'zap', 'orbit', 'brain', 'flame', 'cpu', 'book-open',
  'search', 'lightbulb', 'star', 'clipboard', 'notebook',
];

const colorOptions = [
  '#E85D3A', '#7B61FF', '#2ECC71', '#F39C12', '#3498DB',
  '#E74C3C', '#9B59B6', '#1ABC9C', '#E67E22', '#2980B9',
];

export default function ManageThemesView({ onNavigate }: ManageThemesViewProps) {
  const {
    data, addTheme, updateTheme, deleteTheme,
    addQuestion, updateQuestion, deleteQuestion,
  } = useUserData();

  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const [showNewTheme, setShowNewTheme] = useState(false);
  const [editingTheme, setEditingTheme] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [addingQuestionTo, setAddingQuestionTo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="main-inner">
      <button
        className="back-btn"
        onClick={() => onNavigate({ name: 'questions' })}
        style={{ marginTop: 24 }}
      >
        &#x2190; Back to Questions
      </button>

      <div className="view-header">
        <div className="view-header-label">Customize</div>
        <h1 className="view-header-title">Manage Themes</h1>
        <p className="view-header-subtitle">
          Create, edit, and organize your research themes and questions.
        </p>
      </div>

      <button
        className="btn btn-primary"
        style={{ marginBottom: 24 }}
        onClick={() => setShowNewTheme(true)}
      >
        <Icon name="plus" size={14} /> Add Theme
      </button>

      {showNewTheme && (
        <ThemeForm
          onSave={(theme) => {
            addTheme({
              id: createId(),
              theme: theme.name,
              color: theme.color,
              icon: theme.icon,
              description: theme.description,
            });
            setShowNewTheme(false);
          }}
          onCancel={() => setShowNewTheme(false)}
        />
      )}

      {data.themes.map((theme) => {
        const isExpanded = expandedTheme === theme.id;

        return (
          <div key={theme.id} className="manage-theme-card">
            <div
              className="manage-theme-header"
              onClick={() => setExpandedTheme(isExpanded ? null : theme.id)}
            >
              <span className="manage-theme-icon" style={{ color: theme.color }}>
                <Icon name={theme.icon} size={20} />
              </span>
              <div className="manage-theme-info">
                <div className="manage-theme-name">{theme.theme}</div>
                <div className="manage-theme-meta">
                  {theme.questions.length} question{theme.questions.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="manage-theme-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn btn-sm btn-icon"
                  title="Edit theme"
                  onClick={() => setEditingTheme(editingTheme === theme.id ? null : theme.id)}
                >
                  <Icon name="edit" size={13} />
                </button>
                {confirmDelete === theme.id ? (
                  <span className="delete-confirm">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        deleteTheme(theme.id);
                        setConfirmDelete(null);
                      }}
                    >
                      Delete
                    </button>
                    <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    className="btn btn-sm btn-icon btn-danger"
                    title="Delete theme"
                    onClick={() => setConfirmDelete(theme.id)}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </div>
              <span className="theme-chevron">
                <Icon name="chevron-right" size={16} />
              </span>
            </div>

            {editingTheme === theme.id && (
              <div style={{ padding: '0 16px 16px' }}>
                <ThemeForm
                  initial={{
                    name: theme.theme,
                    color: theme.color,
                    icon: theme.icon,
                    description: theme.description,
                  }}
                  onSave={(updates) => {
                    updateTheme(theme.id, {
                      theme: updates.name,
                      color: updates.color,
                      icon: updates.icon,
                      description: updates.description,
                    });
                    setEditingTheme(null);
                  }}
                  onCancel={() => setEditingTheme(null)}
                  saveLabel="Update Theme"
                />
              </div>
            )}

            {isExpanded && (
              <div className="manage-theme-questions">
                {theme.questions.map((q) => (
                  <div key={q.id} className="manage-question-item">
                    {editingQuestion === q.id ? (
                      <QuestionForm
                        initial={q}
                        onSave={(updates) => {
                          updateQuestion(theme.id, q.id, updates);
                          setEditingQuestion(null);
                        }}
                        onCancel={() => setEditingQuestion(null)}
                        saveLabel="Update Question"
                      />
                    ) : (
                      <>
                        <div className="manage-question-text">
                          {q.q}
                          {q.tags.length > 0 && (
                            <div className="manage-question-tags">
                              {q.tags.map((t) => (
                                <span key={t} className="manage-tag">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="manage-question-actions">
                          <button
                            className="btn btn-sm btn-icon"
                            onClick={() => setEditingQuestion(q.id)}
                            title="Edit"
                          >
                            <Icon name="edit" size={12} />
                          </button>
                          <button
                            className="btn btn-sm btn-icon btn-danger"
                            onClick={() => deleteQuestion(theme.id, q.id)}
                            title="Delete"
                          >
                            <Icon name="trash" size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {addingQuestionTo === theme.id ? (
                  <div className="manage-question-item">
                    <QuestionForm
                      onSave={(q) => {
                        addQuestion(theme.id, q);
                        setAddingQuestionTo(null);
                      }}
                      onCancel={() => setAddingQuestionTo(null)}
                    />
                  </div>
                ) : (
                  <button
                    className="btn btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => setAddingQuestionTo(theme.id)}
                  >
                    <Icon name="plus" size={12} /> Add Question
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {data.themes.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="clipboard" size={32} /></div>
          <p className="empty-state-text">
            No themes yet. Create your first research theme to get started.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Theme Form ──

function ThemeForm({
  initial,
  onSave,
  onCancel,
  saveLabel = 'Create Theme',
}: {
  initial?: { name: string; color: string; icon: string; description: string };
  onSave: (data: { name: string; color: string; icon: string; description: string }) => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || colorOptions[0]);
  const [icon, setIcon] = useState(initial?.icon || iconOptions[0]);
  const [description, setDescription] = useState(initial?.description || '');

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), color, icon, description: description.trim() });
  };

  return (
    <div className="manage-form">
      <div className="manage-form-row">
        <label className="manage-form-label">Name</label>
        <input
          className="manage-form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Error-Driven Learning"
          autoFocus
        />
      </div>
      <div className="manage-form-row">
        <label className="manage-form-label">Description</label>
        <input
          className="manage-form-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of the theme..."
        />
      </div>
      <div className="manage-form-row">
        <label className="manage-form-label">Color</label>
        <div className="manage-color-options">
          {colorOptions.map((c) => (
            <button
              key={c}
              className={`manage-color-swatch ${color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      <div className="manage-form-row">
        <label className="manage-form-label">Icon</label>
        <div className="manage-icon-options">
          {iconOptions.map((ic) => (
            <button
              key={ic}
              className={`manage-icon-option ${icon === ic ? 'active' : ''}`}
              onClick={() => setIcon(ic)}
              style={{ color: icon === ic ? color : undefined }}
            >
              <Icon name={ic} size={18} />
            </button>
          ))}
        </div>
      </div>
      <div className="manage-form-actions">
        <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={!name.trim()}>
          {saveLabel}
        </button>
        <button className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Question Form ──

function QuestionForm({
  initial,
  onSave,
  onCancel,
  saveLabel = 'Add Question',
}: {
  initial?: ResearchQuestion;
  onSave: (data: Omit<ResearchQuestion, 'id'>) => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const [q, setQ] = useState(initial?.q || '');
  const [why, setWhy] = useState(initial?.why || '');
  const [appImplication, setAppImplication] = useState(initial?.appImplication || '');
  const [tagsStr, setTagsStr] = useState(initial?.tags.join(', ') || '');

  const handleSubmit = () => {
    if (!q.trim()) return;
    onSave({
      q: q.trim(),
      why: why.trim(),
      appImplication: appImplication.trim(),
      tags: tagsStr.split(',').map((t) => t.trim()).filter(Boolean),
      sources: initial?.sources || [],
    });
  };

  return (
    <div className="manage-form">
      <div className="manage-form-row">
        <label className="manage-form-label">Question</label>
        <textarea
          className="manage-form-textarea"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Your research question..."
          autoFocus
        />
      </div>
      <div className="manage-form-row">
        <label className="manage-form-label">Why it matters</label>
        <textarea
          className="manage-form-textarea"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Why this question is important..."
        />
      </div>
      <div className="manage-form-row">
        <label className="manage-form-label">Practical implication</label>
        <textarea
          className="manage-form-textarea"
          value={appImplication}
          onChange={(e) => setAppImplication(e.target.value)}
          placeholder="How this could be applied..."
        />
      </div>
      <div className="manage-form-row">
        <label className="manage-form-label">Tags (comma-separated)</label>
        <input
          className="manage-form-input"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          placeholder="e.g., feedback design, interlanguage, CALL"
        />
      </div>
      <div className="manage-form-actions">
        <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={!q.trim()}>
          {saveLabel}
        </button>
        <button className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
