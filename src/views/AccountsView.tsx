import { useUser } from '@clerk/clerk-react';

export default function AccountsView() {
  const { user } = useUser();

  return (
    <div className="main-inner">
      <div className="view-header">
        <div className="view-header-label">Account</div>
        <h1 className="view-header-title">Your Account</h1>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">Profile</h2>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-label">Name</span>
            <span className="settings-value">{user?.fullName ?? '—'}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Email</span>
            <span className="settings-value">
              {user?.primaryEmailAddress?.emailAddress ?? '—'}
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-label">User ID</span>
            <span className="settings-value settings-value--mono">{user?.id ?? '—'}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Joined</span>
            <span className="settings-value">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
