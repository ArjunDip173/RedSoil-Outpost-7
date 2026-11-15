// Keyboard and mouse instructions are rewritten for phones and tablets.
import { describe, expect, it } from 'vitest';
import missionsJson from '../public/resources/data/missions.json';
import { TOOLS } from '../src/config';
import { forTouch } from '../src/core/touch';

const t = (s: string) => forTouch(s, true);

describe('touch wording', () => {
  it('leaves text alone with a keyboard and mouse', () => {
    expect(forTouch('Stand next to a dusty panel and press E to brush it clean.', false)).toBe(
      'Stand next to a dusty panel and press E to brush it clean.',
    );
  });

  it('turns keys into on-screen buttons', () => {
    expect(t('Stand next to a dusty panel and press E to brush it clean.')).toBe(
      'Stand next to a dusty panel and tap USE to brush it clean.',
    );
    expect(t('ROVER BATTERY LOW! Press R to auto-drive home')).toBe(
      'ROVER BATTERY LOW! Tap GO HOME to auto-drive home',
    );
    expect(t('MAP · press M to close')).toBe('MAP · tap MAP to close');
    expect(t('Hold SHIFT to sprint')).toBe('Hold RUN to sprint');
    expect(t('go outside and press the SCAN button (or Q) so buried ice glows blue')).toBe(
      'go outside and press the SCAN button so buried ice glows blue',
    );
  });

  it('turns the mouse into fingers', () => {
    expect(t('Hold the mouse on rocks or glowing blue ice to dig')).toBe(
      'Touch and hold rocks or glowing blue ice to dig',
    );
    expect(t('Click a tile to pile up dirt')).toBe('Tap a tile to pile up dirt');
    expect(t('▼ click / SPACE')).toBe('▼ tap');
    expect(t('✔ click / SPACE to continue')).toBe('✔ tap to continue');
    expect(t('Click or press any key to skip')).toBe('Tap to skip');
    expect(t('Walk with WASD or the arrow keys.')).toBe('Walk with the stick on the left.');
  });

  it('keeps a helmet ring that clicks into place', () => {
    expect(t('Click to twist the helmet ring until it clicks.')).toBe('Tap to twist the helmet ring until it clicks.');
  });

  it('leaves no mouse or key words in the tool tips and mission text', () => {
    const texts = [...TOOLS.map((x) => x.hint), JSON.stringify(missionsJson)];
    for (const s of texts) expect(t(s)).not.toMatch(/\b(click|mouse|WASD|press E|press R)\b/i);
  });
});

describe('USE button label', () => {
  it('says what tapping it will do, briefly', async () => {
    const { shortLabel } = await import('../src/ui/TouchControls');
    expect(shortLabel('Science Station: open SCIENCE LOG')).toBe('OPEN SCIENCE LOG');
    expect(shortLabel('Airlock: Go outside (spacewalk)')).toBe('GO OUTSIDE');
    expect(shortLabel('Ice Melter: 3 ice waiting · 30 L water')).toBe('ICE MELTER');
    expect(shortLabel('Old robotic lander: read the plaque')).toBe('READ THE PLAQUE');
    expect(shortLabel('Drive the rover · battery 80% · trunk 4')).toBe('DRIVE THE ROVER');
    expect(shortLabel('Brush solar panel (40% dusty)')).toBe('BRUSH SOLAR PANEL');
    expect(shortLabel('Hop out (unloads trunk to base)')).toBe('HOP OUT');
  });
});
