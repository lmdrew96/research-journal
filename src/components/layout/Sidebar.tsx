import { useState } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import type { View } from '../../types';
import { useUserData } from '../../hooks/useUserData';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../common/Icon';

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const statusLabels: { key: string; label: string; color: string }[] = [
  { key: 'not_started', label: 'Not started', color: 'var(--status-not-started)' },
  { key: 'exploring', label: 'Exploring', color: 'var(--status-exploring)' },
  { key: 'has_findings', label: 'Has findings', color: 'var(--status-has-findings)' },
  { key: 'concluded', label: 'Concluded', color: 'var(--status-concluded)' },
];

const themeIcons: Record<string, string> = {
  system: 'monitor',
  light: 'sun',
  dark: 'moon',
};

const themeLabels: Record<string, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const syncLabels: Record<string, string> = {
  saved: 'Synced',
  saving: 'Saving...',
  error: 'Sync error',
  offline: 'Offline',
};

export default function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const { statusCounts, totalNotes, data, activeProject, themes, journal, library, switchProject, syncStatus } = useUserData();
  const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
  const { preference, cycle } = useTheme();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const navItems: { icon: string; label: string; view: View; badge?: string }[] = [
    {
      icon: 'home',
      label: 'Dashboard',
      view: { name: 'dashboard' },
    },
    {
      icon: 'clipboard',
      label: 'Questions',
      view: { name: 'questions' },
      badge: String(themes.reduce((sum, t) => sum + t.questions.length, 0)),
    },
    {
      icon: 'notebook',
      label: 'Journal',
      view: { name: 'journal' },
      badge: journal.length > 0 ? String(journal.length) : undefined,
    },
    {
      icon: 'book-open',
      label: 'Library',
      view: { name: 'library' },
      badge: library.length > 0 ? String(library.length) : undefined,
    },
    {
      icon: 'search',
      label: 'Search',
      view: { name: 'search' },
    },
    {
      icon: 'package',
      label: 'Export',
      view: { name: 'export' },
    },
  ];

  const handleSwitchProject = (projectId: string) => {
    switchProject(projectId);
    setProjectMenuOpen(false);
    onNavigate({ name: 'dashboard' });
  };

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-title">ThreadNotes</div>
      </div>

      {/* Project switcher */}
      <div className="project-switcher">
        <button
          className="project-switcher-trigger"
          onClick={() => setProjectMenuOpen((o) => !o)}
          aria-expanded={projectMenuOpen}
        >
          <span
            className="project-switcher-dot"
            style={{ background: activeProject.color }}
          />
          <span className="project-switcher-name">{activeProject.name}</span>
          <span className="project-switcher-chevron">
            <Icon name={projectMenuOpen ? 'chevron-up' : 'chevron-down'} size={12} />
          </span>
        </button>

        {projectMenuOpen && (
          <div className="project-switcher-menu">
            {data.projects.map((project) => (
              <button
                key={project.id}
                className={`project-switcher-item ${project.id === data.activeProjectId ? 'active' : ''}`}
                onClick={() => handleSwitchProject(project.id)}
              >
                <span
                  className="project-switcher-dot"
                  style={{ background: project.color }}
                />
                <span className="project-switcher-item-name">{project.name}</span>
                {project.id === data.activeProjectId && (
                  <Icon name="check" size={12} />
                )}
              </button>
            ))}
            <div className="project-switcher-divider" />
            <button
              className="project-switcher-manage"
              onClick={() => {
                setProjectMenuOpen(false);
                onNavigate({ name: 'manage-projects' });
              }}
            >
              <Icon name="settings" size={13} />
              Manage projects
            </button>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`sidebar-nav-item ${currentView.name === item.view.name ? 'active' : ''}`}
            onClick={() => onNavigate(item.view)}
          >
            <span className="sidebar-nav-icon">
              <Icon name={item.icon} size={15} />
            </span>
            {item.label}
            {item.badge && (
              <span className="sidebar-nav-badge">{item.badge}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Progress</div>
        {statusLabels.map((s) => (
          <div key={s.key} className="sidebar-status-row">
            <span
              className="sidebar-status-dot"
              style={{ background: s.color }}
            />
            {s.label}
            <span className="sidebar-status-count">
              {statusCounts[s.key as keyof typeof statusCounts]}
            </span>
          </div>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Stats</div>
        <div className="sidebar-status-row">
          Notes written
          <span className="sidebar-status-count">{totalNotes}</span>
        </div>
        <div className="sidebar-status-row">
          Journal entries
          <span className="sidebar-status-count">{journal.length}</span>
        </div>
        <div className="sidebar-status-row">
          Articles saved
          <span className="sidebar-status-count">{library.length}</span>
        </div>
      </div>

      <div className="sidebar-footer">
        {isProduction && (
          <div className="sync-indicator">
            <span className={`sync-dot ${syncStatus}`} />
            {syncLabels[syncStatus]}
          </div>
        )}
        <button className="theme-toggle" onClick={cycle} title={`Theme: ${themeLabels[preference]}`}>
          <span className="theme-toggle-icon">
            <Icon name={themeIcons[preference]} size={14} />
          </span>
          <span className="theme-toggle-label">{themeLabels[preference]}</span>
        </button>
        <button
          className={`sidebar-nav-item ${currentView.name === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate({ name: 'settings' })}
        >
          <span className="sidebar-nav-icon">
            <Icon name="settings" size={15} />
          </span>
          Settings
        </button>
        <button
          className={`sidebar-nav-item ${currentView.name === 'accounts' ? 'active' : ''}`}
          onClick={() => onNavigate({ name: 'accounts' })}
        >
          <span className="sidebar-nav-icon">
            <Icon name="user" size={15} />
          </span>
          Account
        </button>
        {user && (
          <div className="sidebar-user">
            <span className="sidebar-user-email">
              {user.primaryEmailAddress?.emailAddress}
            </span>
            <button
              className="sidebar-signout"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
