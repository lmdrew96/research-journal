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

export default function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const { statusCounts, totalNotes, data } = useUserData();
  const { preference, cycle } = useTheme();

  const navItems: { icon: string; label: string; view: View; badge?: string }[] = [
    {
      icon: 'clipboard',
      label: 'Questions',
      view: { name: 'questions' },
      badge: '12',
    },
    {
      icon: 'notebook',
      label: 'Journal',
      view: { name: 'journal' },
      badge: data.journal.length > 0 ? String(data.journal.length) : undefined,
    },
    {
      icon: 'book-open',
      label: 'Library',
      view: { name: 'library' },
      badge: data.library.length > 0 ? String(data.library.length) : undefined,
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

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-label">ChaosLimb&#x103;</div>
        <div className="sidebar-brand-title">Research Journal</div>
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
          <span className="sidebar-status-count">{data.journal.length}</span>
        </div>
        <div className="sidebar-status-row">
          Articles saved
          <span className="sidebar-status-count">{data.library.length}</span>
        </div>
      </div>

      <div className="sidebar-footer">
        <button className="theme-toggle" onClick={cycle} title={`Theme: ${themeLabels[preference]}`}>
          <span className="theme-toggle-icon">
            <Icon name={themeIcons[preference]} size={14} />
          </span>
          <span className="theme-toggle-label">{themeLabels[preference]}</span>
        </button>
      </div>
    </div>
  );
}