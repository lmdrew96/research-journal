import { useEffect, useState } from 'react';

/**
 * useAppVersion — tells a stale tab that a newer ThreadNotes has deployed.
 *
 * Vendored from ControlledChaos (src/lib/useAppVersion.ts), which is the
 * canonical copy. Two deliberate differences, both from ThreadNotes being a
 * Vite PWA whose service worker precaches the app:
 *
 * - The version comes from `__APP_VERSION__` (vite.config.ts `define`), and
 *   /api/version reports the deployment's own.
 * - applyUpdate cannot just reload. The workbox worker serves the page from
 *   its precache, so a plain reload comes back with the OLD bundle while the
 *   new worker installs in the background — which is how a tab kept showing
 *   raw <scp> tags from a search fix that had already shipped. It asks the
 *   worker to update, waits for the new one to take control (it uses
 *   skipWaiting + clientsClaim), and reloads after that.
 *
 * Never reloads on its own. Half-written notes and open forms live in this
 * app; a refresh mid-thought is exactly what makes a tool untrustworthy.
 */

const POLL_MS = 5 * 60_000;
const DISMISS_KEY = 'tn-update-toast-dismissed';
/** Upper bound on waiting for the new worker; reload regardless after this. */
const ACTIVATE_TIMEOUT_MS = 5_000;

function isDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    // Storage blocked — show the notice rather than suppress it entirely.
    return false;
  }
}

/** Resolves once a new service worker controls the page, or after the timeout. */
async function activateNewWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  await registration.update();
  if (!registration.installing && !registration.waiting) return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ACTIVATE_TIMEOUT_MS);
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

export function useAppVersion(): {
  updateReady: boolean;
  applying: boolean;
  applyUpdate: () => void;
  dismiss: () => void;
} {
  const [updateReady, setUpdateReady] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || updateReady) return;
    const current = __APP_VERSION__;
    if (!current || current === 'dev') return;

    let cancelled = false;

    const check = async () => {
      if (document.visibilityState !== 'visible' || isDismissed()) return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (!cancelled && version && version !== 'dev' && version !== current) {
          setUpdateReady(true);
        }
      } catch {
        // Offline or transient. A failed version check interrupts nobody.
      }
    };

    const onCheck = () => void check();

    void check();
    const id = setInterval(onCheck, POLL_MS);
    // The highest-value trigger: a tab left open for days catches the update
    // the moment it is looked at again, instead of waiting out the interval.
    document.addEventListener('visibilitychange', onCheck);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onCheck);
    };
  }, [updateReady]);

  return {
    updateReady,
    applying,
    applyUpdate: () => {
      setApplying(true);
      activateNewWorker()
        .catch(() => {
          // A failed update still gets the reload — the worst case is one
          // more stale load, not a stuck button.
        })
        .finally(() => window.location.reload());
    },
    dismiss: () => {
      try {
        sessionStorage.setItem(DISMISS_KEY, '1');
      } catch {
        // Non-fatal: the toast still hides for this mount.
      }
      setUpdateReady(false);
    },
  };
}
