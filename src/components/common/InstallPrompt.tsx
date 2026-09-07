import { useState, useEffect } from 'react';
import Icon from './Icon';

/**
 * Not in lib.dom yet — Chromium-only, and the spec is still a draft.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'threadnotes-install-dismissed';

const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS Safari doesn't implement display-mode, and types this as unknown
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

export default function InstallPrompt(): React.ReactElement | null {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      // Private browsing or blocked storage — treat as not dismissed.
      dismissed = false;
    }
    if (dismissed) return;

    const onPrompt = (e: Event) => {
      // Chrome shows its own mini-infobar unless the event is cancelled.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = (): void => {
    setVisible(false);
    setDeferred(null);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Nothing to do — it'll just offer again next session.
    }
  };

  const install = async (): Promise<void> => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event is single-use either way, so drop it.
    setDeferred(null);
    setVisible(false);
    if (outcome === 'dismissed') {
      try {
        localStorage.setItem(DISMISSED_KEY, '1');
      } catch {
        // As above.
      }
    }
  };

  if (!visible) return null;

  return (
    <div className="install-prompt" role="region" aria-label="Install ThreadNotes">
      <Icon name="package" size={18} className="install-prompt-icon" />
      <div className="install-prompt-text">
        <strong>Install ThreadNotes</strong>
        <span>Open it from your home screen and read your library offline.</span>
      </div>
      <div className="install-prompt-actions">
        <button type="button" className="btn btn-primary" onClick={install}>
          Install
        </button>
        <button type="button" className="btn" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
