import { useState } from 'react';
import type { View } from '../types';
import { useUserData } from '../hooks/useUserData';
import { createId } from '../lib/ids';
import Icon from '../components/common/Icon';

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

interface ProjectFormState {
  name: string;
  description: string;
  icon: string;
  color: string;
}

const defaultForm = (): ProjectFormState => ({
  name: '',
  description: '',
  icon: 'brain',
  color: '#7B61FF',
});

export default function ManageProjectsView({ onNavigate }: ManageProjectsViewProps) {
  const { data, activeProject, addProject, updateProject, deleteProject, switchProject } = useUserData();

  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<ProjectFormState>(defaultForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProjectFormState>(defaultForm());

  const handleAdd = () => {
    if (!newForm.name.trim()) return;
    addProject({
      name: newForm.name.trim(),
      description: newForm.description.trim(),
      icon: newForm.icon,
      color: newForm.color,
    });
    setNewForm(defaultForm());
    setShowNewForm(false);
    onNavigate({ name: 'dashboard' });
  };

  const startEdit = (projectId: string) => {
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) return;
    setEditingId(projectId);
    setEditForm({
      name: project.name,
      description: project.description,
      icon: project.icon,
      color: project.color,
    });
  };

  const handleUpdate = (projectId: string) => {
    if (!editForm.name.trim()) return;
    updateProject(projectId, {
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      icon: editForm.icon,
      color: editForm.color,
    });
    setEditingId(null);
  };

  const handleDelete = (projectId: string) => {
    if (data.projects.length <= 1) return;
    const project = data.projects.find((p) => p.id === projectId);
    if (!project) return;
    const confirmed = window.confirm(
      `Delete "${project.name}"? This will permanently remove all its themes, questions, library articles, and journal entries.`
    );
    if (!confirmed) return;
    deleteProject(projectId);
  };

  const handleSwitch = (projectId: string) => {
    switchProject(projectId);
    onNavigate({ name: 'dashboard' });
  };

  return (
    <div className="main-inner">
      <div className="view-header">
        <button className="back-btn" onClick={() => onNavigate({ name: 'dashboard' })}>
          <Icon name="arrow-left" size={14} /> Back
        </button>
        <h1 className="view-title">Projects</h1>
        <p className="view-subtitle">
          Each project has its own themes, questions, library, and journal.
        </p>
      </div>

      <div className="manage-themes-list">
        {data.projects.map((project) => {
          const isActive = project.id === activeProject.id;
          const isEditing = editingId === project.id;
          const qCount = project.themes.reduce((s, t) => s + t.questions.length, 0);

          return (
            <div key={project.id} className={`manage-theme-card ${isActive ? 'active-project' : ''}`}>
              {isEditing ? (
                <ProjectForm
                  form={editForm}
                  onChange={setEditForm}
                  onSave={() => handleUpdate(project.id)}
                  onCancel={() => setEditingId(null)}
                  saveLabel="Save"
                />
              ) : (
                <div className="manage-theme-header">
                  <div className="manage-theme-info">
                    <span
                      className="manage-theme-color-dot"
                      style={{ background: project.color }}
                    />
                    <div>
                      <div className="manage-theme-name">
                        <Icon name={project.icon} size={14} />
                        {project.name}
                        {isActive && (
                          <span className="project-active-badge">Active</span>
                        )}
                      </div>
                      {project.description && (
                        <div className="manage-theme-desc">{project.description}</div>
                      )}
                      <div className="manage-theme-meta">
                        {project.themes.length} theme{project.themes.length !== 1 ? 's' : ''} ·{' '}
                        {qCount} question{qCount !== 1 ? 's' : ''} ·{' '}
                        {project.library.length} article{project.library.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="manage-theme-actions">
                    {!isActive && (
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => handleSwitch(project.id)}
                      >
                        Switch to
                      </button>
                    )}
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => startEdit(project.id)}
                    >
                      <Icon name="edit" size={13} />
                    </button>
                    {data.projects.length > 1 && (
                      <button
                        className="btn-ghost btn-sm btn-danger"
                        onClick={() => handleDelete(project.id)}
                        title="Delete project"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showNewForm ? (
        <div className="manage-theme-card">
          <div className="manage-theme-card-title">New Project</div>
          <ProjectForm
            form={newForm}
            onChange={setNewForm}
            onSave={handleAdd}
            onCancel={() => { setShowNewForm(false); setNewForm(defaultForm()); }}
            saveLabel="Create project"
          />
        </div>
      ) : (
        <button
          className="btn-ghost add-theme-btn"
          onClick={() => setShowNewForm(true)}
        >
          <Icon name="plus" size={14} /> New project
        </button>
      )}
    </div>
  );
}

interface ProjectFormProps {
  form: ProjectFormState;
  onChange: (form: ProjectFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}

function ProjectForm({ form, onChange, onSave, onCancel, saveLabel }: ProjectFormProps) {
  return (
    <div className="theme-form">
      <input
        className="theme-form-input"
        placeholder="Project name"
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onSave()}
        autoFocus
      />
      <input
        className="theme-form-input"
        placeholder="Description (optional)"
        value={form.description}
        onChange={(e) => onChange({ ...form, description: e.target.value })}
      />
      <div className="theme-form-row">
        <div className="theme-form-label">Icon</div>
        <div className="theme-icon-picker">
          {iconOptions.map((icon) => (
            <button
              key={icon}
              className={`theme-icon-option ${form.icon === icon ? 'selected' : ''}`}
              onClick={() => onChange({ ...form, icon })}
              title={icon}
            >
              <Icon name={icon} size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className="theme-form-row">
        <div className="theme-form-label">Color</div>
        <div className="theme-color-picker">
          {colorOptions.map((color) => (
            <button
              key={color}
              className={`theme-color-swatch ${form.color === color ? 'selected' : ''}`}
              style={{ background: color }}
              onClick={() => onChange({ ...form, color })}
            />
          ))}
        </div>
      </div>
      <div className="theme-form-actions">
        <button className="btn-primary btn-sm" onClick={onSave} disabled={!form.name.trim()}>
          {saveLabel}
        </button>
        <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}