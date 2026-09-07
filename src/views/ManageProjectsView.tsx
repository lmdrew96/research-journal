import { useState } from 'react';
import type { View } from '../types';
import { useUserData } from '../hooks/useUserData';
import Icon from '../components/common/Icon';
import ConfirmDelete from '../components/common/ConfirmDelete';
import RecentlyDeleted from '../components/common/RecentlyDeleted';

interface ManageProjectsViewProps {
  onNavigate: (view: View) => void;
}

const iconOptions = [
  'brain', 'book-open', 'clipboard', 'notebook', 'search',
  'zap', 'orbit', 'flame', 'cpu', 'lightbulb', 'star',
];

const colorOptions = [
  '#7B61FF', '#E85D3A', '#2ECC71', '#F39C12', '#3498DB',
  '#E74C3C', '#9B59B6', '#1ABC9C', '#E67E22', '#2980B9',
];

export default function ManageProjectsView({ onNavigate }: ManageProjectsViewProps) {
  const { activeProject, addProject, updateProject, deleteProject, switchProject,
    visibleProjects, deletedProjects, restoreProject } = useUserData();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const handleAdd = (values: { name: string; description: string; icon: string; color: string }) => {
    addProject(values);
    setShowNewForm(false);
    onNavigate({ name: 'dashboard' });
  };

  const handleUpdate = (projectId: string, values: { name: string; description: string; icon: string; color: string }) => {
    updateProject(projectId, values);
    setEditingId(null);
  };

  const handleDelete = (projectId: string) => {
    deleteProject(projectId);
  };

  const handleSwitch = (projectId: string) => {
    switchProject(projectId);
    onNavigate({ name: 'dashboard' });
  };

  return (
    <div className="main-inner">
      <button
        className="back-btn"
        onClick={() => onNavigate({ name: 'dashboard' })}
        style={{ marginTop: 24 }}
      >
        <Icon name="arrow-left" size={14} /> Back to Dashboard
      </button>

      <div className="view-header">
        <div className="view-header-label">Workspace</div>
        <h1 className="view-header-title">Projects</h1>
        <p className="view-header-subtitle">
          Each project has its own themes, questions, library, and journal.
        </p>
      </div>

      <button
        className="btn btn-primary"
        style={{ marginBottom: 24 }}
        onClick={() => { setShowNewForm(true); setEditingId(null); }}
      >
        <Icon name="plus" size={14} /> New Project
      </button>

      {showNewForm && (
        <ProjectForm
          onSave={handleAdd}
          onCancel={() => setShowNewForm(false)}
          saveLabel="Create project"
        />
      )}

      {visibleProjects.map((project) => {
        const isActive = project.id === activeProject.id;
        const isEditing = editingId === project.id;
        // Soft-deleted themes still sit in the array; they must not be counted.
        const liveThemes = project.themes.filter((t) => !t.deletedAt);
        const qCount = liveThemes.reduce((s, t) => s + t.questions.length, 0);

        return (
          <div key={project.id} className="manage-theme-card">
            {/* Card header — always visible */}
            <div className="manage-theme-header" style={{ cursor: 'default' }}>
              <span className="manage-theme-icon" style={{ color: project.color }}>
                <Icon name={project.icon} size={20} />
              </span>
              <div className="manage-theme-info">
                <div className="manage-theme-name">
                  {project.name}
                  {isActive && <span className="project-active-badge">Active</span>}
                </div>
                {project.description && (
                  <div className="manage-theme-meta" style={{ marginTop: 1 }}>
                    {project.description}
                  </div>
                )}
                <div className="manage-theme-meta">
                  {liveThemes.length} theme{liveThemes.length !== 1 ? 's' : ''} ·{' '}
                  {qCount} question{qCount !== 1 ? 's' : ''} ·{' '}
                  {project.library.length} article{project.library.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="manage-theme-actions" onClick={(e) => e.stopPropagation()}>
                {!isActive && (
                  <button
                    className="btn btn-sm"
                    onClick={() => handleSwitch(project.id)}
                    aria-label={`Switch to project: ${project.name}`}
                  >
                    Switch to
                  </button>
                )}
                <button
                  className="btn btn-sm btn-labelled"
                  aria-label={`Edit project: ${project.name}`}
                  onClick={() => setEditingId(isEditing ? null : project.id)}
                >
                  <Icon name="edit" size={13} />
                  Edit
                </button>
                {/* Projects take everything inside them, so this keeps its
                    confirmation even though undo now covers it. */}
                {visibleProjects.length > 1 && (
                  <ConfirmDelete
                    label="project"
                    compact
                    onConfirm={() => handleDelete(project.id)}
                  />
                )}
              </div>
            </div>

            {/* Inline edit form */}
            {isEditing && (
              <div style={{ padding: '0 16px 16px' }}>
                <ProjectForm
                  initial={{
                    name: project.name,
                    description: project.description,
                    icon: project.icon,
                    color: project.color,
                  }}
                  onSave={(values) => handleUpdate(project.id, values)}
                  onCancel={() => setEditingId(null)}
                  saveLabel="Save changes"
                />
              </div>
            )}
          </div>
        );
      })}

      <RecentlyDeleted
        label="project"
        items={deletedProjects.map((p) => {
          const liveThemes = p.themes.filter((t) => !t.deletedAt);
          const qCount = liveThemes.reduce((s, t) => s + t.questions.length, 0);
          return {
            id: p.id,
            name: p.name,
            deletedAt: p.deletedAt!,
            detail: `${qCount} question${qCount === 1 ? '' : 's'} · ${p.library.length} article${p.library.length === 1 ? '' : 's'}`,
          };
        })}
        onRestore={restoreProject}
      />
    </div>
  );
}

// ── Project Form ──

function ProjectForm({
  initial,
  onSave,
  onCancel,
  saveLabel = 'Create project',
}: {
  initial?: { name: string; description: string; icon: string; color: string };
  onSave: (values: { name: string; description: string; icon: string; color: string }) => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? iconOptions[0]);
  const [color, setColor] = useState(initial?.color ?? colorOptions[0]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim(), icon, color });
  };

  return (
    <div className="manage-form">
      {/* Live preview */}
      <div className="project-form-preview">
        <span style={{ color }}>
          <Icon name={icon} size={18} />
        </span>
        <span className="project-form-preview-name">
          {name || 'Project name'}
        </span>
      </div>

      <div className="manage-form-row">
        <label className="manage-form-label">Name</label>
        <input
          aria-label="Project Name"
          className="manage-form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="e.g., Thesis Research"
          autoFocus
        />
      </div>

      <div className="manage-form-row">
        <label className="manage-form-label">Description</label>
        <input
          aria-label="Project Description"
          className="manage-form-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this project about? (optional)"
        />
      </div>

      <div className="manage-form-row">
        <label className="manage-form-label">Color</label>
        <div className="manage-color-options">
          {colorOptions.map((c) => (
            <button
              key={c}
              type="button"
              className={`manage-color-swatch ${color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-pressed={color === c}
              aria-label={`Color ${c}`}
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
              type="button"
              className={`manage-icon-option ${icon === ic ? 'active' : ''}`}
              onClick={() => setIcon(ic)}
              style={{ color: icon === ic ? color : undefined }}
              aria-pressed={icon === ic}
              aria-label={`Icon: ${ic}`}
            >
              <Icon name={ic} size={18} />
            </button>
          ))}
        </div>
      </div>

      <div className="manage-form-actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSubmit}
          disabled={!name.trim()}
        >
          {saveLabel}
        </button>
        <button className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
