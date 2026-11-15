/**
 * The controls cheat-sheet shown from the menu and the pause screen.
 */
import { prefersTouch, touch } from '../core/touch';
import { el } from './Dom';

/** The only controls a young player needs. */
const MAIN: [string, string][] = [
  ['W A S D  or  arrows', 'Walk (or drive the rover)'],
  ['E', 'Use the thing you are next to'],
  ['Left mouse (hold)', 'Use your tool: dig, brush, build'],
  ['1 – 8  or  click', 'Pick a tool from the bar at the bottom'],
  ['ESC', 'Menu (pause)'],
];
/** Phones and tablets. */
const TOUCH: [string, string][] = [
  ['Thumb on the left side', 'A joystick appears: drag it to walk or drive'],
  ['Touch and hold a spot', 'Use your tool there: dig, brush, build'],
  ['E · USE button', 'Use the thing you are next to (or tap its yellow label)'],
  ['RUN (hold)', 'Sprint'],
  ['Tap the tool bar', 'Pick a tool'],
  ['Buttons on the right', 'Scan, map, Ask LUNA, watch, menu and more'],
];
/** Shortcuts for the on-screen buttons (bottom-right), plus extras. */
const EXTRA: [string, string][] = [
  ['TAB', 'Hologram watch: battery, air, water, food and more'],
  ['SHIFT (hold)', 'Sprint'],
  ['Q', 'Scan for buried ice'],
  ['M', 'Big map'],
  ['R', 'Rover: drive home by itself'],
  ['B', 'Base Ops (inside the base)'],
  ['L', 'Science Log'],
  ['T', 'Ask LUNA a question'],
];

export function controlsTable(): HTMLElement {
  const wrap = el('div', 'controls');
  const rows = (list: [string, string][]) => {
    for (const [k, v] of list) {
      const r = el('div', 'ctrl-row');
      r.append(el('kbd', '', k), el('span', '', v));
      wrap.appendChild(r);
    }
  };
  const onTouch = touch.active || prefersTouch();
  if (onTouch) {
    wrap.appendChild(el('h3', '', 'ON A PHONE OR TABLET'));
    rows(TOUCH);
  }
  wrap.appendChild(el('h3', '', onTouch ? 'WITH A KEYBOARD AND MOUSE' : 'YOU ONLY NEED THESE'));
  rows(MAIN);
  wrap.appendChild(el('h3', '', 'SHORTCUTS (or use the buttons on screen)'));
  rows(EXTRA);
  wrap.appendChild(el('p', 'muted small', 'Tip: Easy Mode (on by default) makes your suit oxygen last longer. Change it in Settings.'));
  return wrap;
}
