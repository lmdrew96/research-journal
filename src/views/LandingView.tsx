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
          Track research questions, annotate papers, write journal entries, and
          find literature — all in one place.
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
