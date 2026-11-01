/**
 * What a direct load or refresh shows while Clerk works out who is signed in.
 * It used to render nothing, which left a blank dark page for a few seconds.
 */
export default function AppLoading() {
  return (
    <div className="app-loading" role="status" aria-live="polite">
      <div className="ai-summary-spinner" aria-hidden="true" />
      <span>Loading ThreadNotes…</span>
    </div>
  );
}
