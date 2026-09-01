import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

const TABS = [
  ['overview', 'Projects'],
  ['contacts', 'Contacts'],
  ['construction', 'Construction Playbook'],
  ['tasks', 'Tasks'],
  ['activity', 'Activity'],
];

export default function TopBar({ view, onNav, saving, onAddTask }) {
  const { profile, logout, isAdmin, canEdit } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const tabs = isAdmin ? [...TABS, ['admin', 'Team']] : TABS;
  const initials = (profile?.name || profile?.email || '?').slice(0, 2).toUpperCase();

  return (
    <div className="topbar">
      <div className="brandmark">
        <Logo />
        <div>
          <h1>Development Pipeline</h1>
          <span className="sub">Site to Store-Opening Tracker</span>
        </div>
      </div>
      <nav className="tabs">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={view === key || (view === 'detail' && key === 'overview') ? 'active' : ''}
            onClick={() => onNav(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {canEdit && (
        <button className="btn small add-task-btn" onClick={() => onAddTask(null)} title="Add a task to any project">
          + Task
        </button>
      )}
      <div className="save-indicator" style={{ color: saving ? 'var(--amber)' : undefined }}>
        {saving ? 'Saving…' : 'Synced'}
      </div>
      <div className="user-menu">
        <button className="user-chip" onClick={() => setMenuOpen((v) => !v)}>
          <span className="avatar">{initials}</span>
          <span className="role-tag">{profile?.role}</span>
        </button>
        {menuOpen && (
          <div className="user-dropdown" onMouseLeave={() => setMenuOpen(false)}>
            <div className="item" style={{ cursor: 'default', color: 'var(--slate)', fontSize: 12 }}>
              {profile?.email}
            </div>
            <div className="divider" />
            <button className="item danger" onClick={logout}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
