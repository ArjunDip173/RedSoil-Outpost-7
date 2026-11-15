/**
 * Touchscreen mode (phones and tablets).
 *
 * `touch.active` turns on when the device's main pointer is a finger, or as soon as the screen is
 * touched, and off again when a real mouse is clicked. While it is on, the game shows its touch
 * controls and rewrites keyboard/mouse instructions ("press E", "hold the mouse") for touch.
 */
export const touch = { active: false };

/** Is the main pointer a finger (phone, tablet)? */
export function prefersTouch(): boolean {
  try {
    return (
      matchMedia('(pointer: coarse)').matches ||
      (navigator.maxTouchPoints > 0 && !matchMedia('(any-pointer: fine)').matches)
    );
  } catch {
    return false;
  }
}

export function setTouchMode(on: boolean): void {
  if (touch.active === on) return;
  touch.active = on;
  document.body.classList.toggle('touch', on);
}

const RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  [/\b([Pp])ress E\b/g, (_m, p) => `${p === 'P' ? 'Tap' : 'tap'} USE`],
  [/\b([Pp])ress R\b/g, (_m, p) => `${p === 'P' ? 'Tap' : 'tap'} GO HOME`],
  [/\b([Pp])ress Q\b/g, (_m, p) => `${p === 'P' ? 'Tap' : 'tap'} SCAN`],
  [/\b([Pp])ress M\b/g, (_m, p) => `${p === 'P' ? 'Tap' : 'tap'} MAP`],
  [/\b([Pp])ress (?:TAB|Tab)\b/g, (_m, p) => `${p === 'P' ? 'Tap' : 'tap'} WATCH`],
  [/\b([Hh])old SHIFT\b/g, (_m, h) => `${h}old RUN`],
  [/\b([Hh])old the mouse on\b/g, (_m, h) => `${h === 'H' ? 'Touch' : 'touch'} and hold`],
  [/\b([Hh])old the mouse\b/g, (_m, h) => `${h === 'H' ? 'Touch' : 'touch'} and hold`],
  [/\bWASD(?: or (?:the )?arrow keys)?/g, 'the stick on the left'],
  // "click" the mouse → "tap" (but a helmet ring that "clicks" into place still clicks)
  [
    /\b([Cc])lick(s|ed|ing)?\b/g,
    (m, c, end, offset, str) =>
      String(str).slice(Math.max(0, Number(offset) - 3), Number(offset)) === 'it '
        ? m
        : `${c === 'C' ? 'T' : 't'}ap${end === 'ed' ? 'ped' : end === 'ing' ? 'ping' : (end ?? '')}`,
  ],
  [/\s*\/\s*SPACE\b/g, ''],
  [/\s+or press any key\b/g, ''],
  [/\s*\((?:or )?(?:key )?(?:[A-Z]|TAB|ESC)\)/g, ''],
];

/** Rewrites keyboard and mouse instructions for touchscreen players (unchanged otherwise). */
export function forTouch(text: string, on = touch.active): string {
  if (!on) return text;
  let t = text;
  for (const [re, to] of RULES) t = t.replace(re, to as never);
  return t;
}
