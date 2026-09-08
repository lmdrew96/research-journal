/**
 * Contrast-safe tag colours.
 *
 * `tagColors` is a hand-picked palette of saturated hues. Used raw it fails
 * WCAG AA badly: measured against the real surfaces, 14 of the 19 distinct
 * colours fall below 4.5:1 in light mode and 8 do in dark. The WCAG pass in
 * dbaf438 tuned the `--*` design tokens and never reached these, because they
 * are applied inline from a data file rather than through CSS.
 *
 * Rather than hand-editing 19 colours twice, each is nudged along its own
 * lightness axis — hue and saturation untouched, so a tag stays recognisably
 * the same colour — until it clears 4.5:1 against the surface it will actually
 * be drawn on. That surface is the pill's own translucent background composited
 * over the card, not the card alone, which is what makes the guarantee real
 * rather than approximate.
 */

/** Alpha of the pill's background tint. Must match TAG_BG_ALPHA usage below. */
const TAG_BG_ALPHA = 0.125;

/** Worst-case (lightest) dark surface a pill sits on — --bg-elevated. */
const DARK_SURFACE = '#0d1525';
/** Lightest light surface — --bg-card. */
const LIGHT_SURFACE = '#ffffff';

const AA_NORMAL = 4.5;

type RGB = [number, number, number];

const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

const rgbToHex = ([r, g, b]: RGB): string =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

const channelLuminance = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = ([r, g, b]: RGB): number =>
  0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);

export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/** Flattens a translucent colour over an opaque one. */
const composite = (fg: string, alpha: number, bg: string): string => {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return rgbToHex([0, 1, 2].map((i) => f[i] * alpha + b[i] * (1 - alpha)) as RGB);
};

const rgbToHsl = ([r, g, b]: RGB): [number, number, number] => {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
};

const hslToRgb = (h: number, s: number, l: number): RGB => {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
};

/**
 * Walks `hex` lighter (dark themes) or darker (light themes) in 1% lightness
 * steps until it clears AA against the composited pill background, keeping hue
 * and saturation. Returns the closest it got if the hue simply cannot reach the
 * target — better a maximally-adjusted colour than a thrown error.
 */
const toReadable = (hex: string, surface: string, lighten: boolean): string => {
  const [h, s, l0] = rgbToHsl(hexToRgb(hex));
  let best = hex;
  let bestRatio = 0;
  for (let step = 0; step <= 100; step++) {
    const l = Math.max(0, Math.min(1, l0 + (lighten ? step : -step) / 100));
    const candidate = rgbToHex(hslToRgb(h, s, l));
    // The pill background is the tag colour at low alpha over the surface, so
    // that composite — not the bare surface — is what the text sits on.
    const bg = composite(candidate, TAG_BG_ALPHA, surface);
    const ratio = contrastRatio(candidate, bg);
    if (ratio > bestRatio) { bestRatio = ratio; best = candidate; }
    if (ratio >= AA_NORMAL) return candidate;
    if (l === 0 || l === 1) break;
  }
  return best;
};

export interface TagPalette {
  lightFg: string;
  darkFg: string;
  lightBg: string;
  darkBg: string;
}

const cache = new Map<string, TagPalette>();

/** Per-theme, AA-clearing foreground and matching tint for one tag colour. */
export function tagPalette(hex: string): TagPalette {
  const hit = cache.get(hex);
  if (hit) return hit;

  const lightFg = toReadable(hex, LIGHT_SURFACE, false);
  const darkFg = toReadable(hex, DARK_SURFACE, true);
  const palette: TagPalette = {
    lightFg,
    darkFg,
    lightBg: composite(lightFg, TAG_BG_ALPHA, LIGHT_SURFACE),
    darkBg: composite(darkFg, TAG_BG_ALPHA, DARK_SURFACE),
  };
  cache.set(hex, palette);
  return palette;
}

/**
 * AA-clearing foreground pair for an arbitrary user-chosen colour used as TEXT
 * (theme headers, counts). Reuses the tag calibration: those targets clear 4.5:1
 * against a tint over the surface, and the tint is strictly closer to the text
 * than the bare surface is, so the same value clears AA on the plain card too.
 */
export function readableTextVars(hex: string): Record<string, string> {
  const { lightFg, darkFg } = tagPalette(hex);
  return { '--fg-light': lightFg, '--fg-dark': darkFg };
}
