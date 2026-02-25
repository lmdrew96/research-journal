export default function DemoBanner() {
  return (
    <div className="demo-banner">
      <span className="demo-banner-text">
        You're viewing a demo of Research Journal
      </span>
      <span className="demo-banner-links">
        <a
          href="https://github.com/lmdrew96"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <span className="demo-banner-sep" aria-hidden="true">/</span>
        <a
          href="https://adhdesigns.dev"
          target="_blank"
          rel="noopener noreferrer"
        >
          Portfolio
        </a>
      </span>
    </div>
  );
}