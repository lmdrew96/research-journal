import type { View } from '../types';

interface LandingViewProps {
  onNavigate: (view: View) => void;
}

export default function LandingView({ onNavigate }: LandingViewProps) {
  return (
    <div className="landing-page">
      <div className="landing-content">
        <div className="landing-wordmark">ThreadNotes</div>

        <h1 className="landing-headline">
          A research command center<br />for serious questions.
        </h1>

        <p className="landing-sub">
          Save sources, keep what you think about them labeled by who it came
          from, and follow the threads that run across them.
        </p>

        <div className="landing-actions">
          <button
            className="landing-btn-primary"
            onClick={() => onNavigate({ name: 'dashboard' })}
          >
            Go to dashboard
          </button>
          <a href="/demo" className="landing-btn-secondary">
            View demo
          </a>
        </div>
      </div>

      <footer className="landing-footer">
        Built by Nae Drew
      </footer>
    </div>
  );
}
