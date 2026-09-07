import type {
  AppUserData,
  DensityPreference,
  MotionPreference,
  ProjectViewState,
  UserPreferences,
} from '../types';

/**
 * Defaults reproduce the app's behaviour before these controls existed:
 * comfortable spacing and whatever the OS says about motion. Nobody's app
 * changes under them without opting in.
 */
export const DEFAULT_PREFERENCES: UserPreferences = {
  density: 'comfortable',
  motion: 'auto',
};

export const DENSITY_OPTIONS: { value: DensityPreference; label: string; hint: string }[] = [
  { value: 'compact', label: 'Compact', hint: 'Tighter spacing, more on screen at once' },
  { value: 'comfortable', label: 'Comfortable', hint: 'The default balance' },
  { value: 'spacious', label: 'Spacious', hint: 'More breathing room between elements' },
];

export const MOTION_OPTIONS: { value: MotionPreference; label: string; hint: string }[] = [
  { value: 'auto', label: 'Match system', hint: 'Follow your OS reduced-motion setting' },
  { value: 'full', label: 'Full', hint: 'Animations and transitions on' },
  { value: 'reduced', label: 'Reduced', hint: 'Minimise animation in this app only' },
];

export function resolvePreferences(data: AppUserData): UserPreferences {
  return { ...DEFAULT_PREFERENCES, ...(data.preferences ?? {}) };
}

export function resolveViewState(
  data: AppUserData,
  projectId: string,
): ProjectViewState {
  return data.viewState?.[projectId] ?? {};
}

/**
 * Reflect preferences onto the root element so the whole change lives in CSS.
 * Mirrors how `data-theme` already works.
 *
 * `motion: 'auto'` writes no attribute at all, leaving the existing
 * prefers-reduced-motion media query in sole charge — which is what "match
 * system" means, and keeps the default byte-identical to today's behaviour.
 */
export function applyPreferences(prefs: UserPreferences): void {
  const root = document.documentElement;
  root.setAttribute('data-density', prefs.density);
  if (prefs.motion === 'auto') {
    root.removeAttribute('data-motion');
  } else {
    root.setAttribute('data-motion', prefs.motion);
  }
}
