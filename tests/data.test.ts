// Checks that the mission data, sprite sheet and code agree with each other.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import missionsJson from '../public/resources/data/missions.json';
import factsJson from '../public/resources/data/nasa_facts.json';
import characters from '../src/assets/sprites/characters.json';
import sprites from '../src/assets/sprites/sprites.json';
import { TOOLS } from '../src/config';
import { STATE_CHECKS } from '../src/systems/MissionManager';

const missions = missionsJson.missions;
const spriteNames = new Set([...Object.keys(sprites.frames), ...Object.keys(characters.frames), 'roof']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
  });
}
const source = sourceFiles('src')
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

describe('missions', () => {
  it('has the six training missions in order', () => {
    expect(missions.map((m) => m.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('gives every step exactly one way to complete it', () => {
    for (const m of missions)
      for (const o of m.objectives) {
        const ways = [o.event, o.state].filter(Boolean);
        expect(ways, `mission ${m.id} step ${o.id}`).toHaveLength(1);
      }
  });

  it('only uses state checks that exist', () => {
    for (const m of missions)
      for (const o of m.objectives)
        if (o.state) expect(STATE_CHECKS, `mission ${m.id} step ${o.id}`).toHaveProperty(o.state);
  });

  it('only waits for events the game actually sends', () => {
    for (const m of missions)
      for (const o of m.objectives)
        if (o.event)
          expect(source.includes(`emit('${o.event}'`), `nothing emits '${o.event}' (mission ${m.id})`).toBe(true);
  });

  it('has a patch sprite and a known fact for every mission', () => {
    const factIds = new Set(factsJson.facts.map((f) => f.id));
    for (const m of missions) {
      expect(spriteNames.has(m.patch), m.patch).toBe(true);
      if (m.fact) expect(factIds.has(m.fact), m.fact).toBe(true);
    }
  });

  it('keeps briefing lines short enough for young readers', () => {
    for (const m of missions)
      for (const line of [...m.briefing, ...m.complete])
        expect(line.text.split(/\s+/).length, line.text).toBeLessThanOrEqual(20);
  });
});

describe('tools', () => {
  it('unlock in the same order as the tool bar', () => {
    const order = TOOLS.map((t) => t.unlock);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('all have an icon in the sprite sheet', () => {
    for (const t of TOOLS) expect(spriteNames.has(t.icon), t.icon).toBe(true);
  });
});

describe('sprite sheet', () => {
  it('contains every sprite the code asks for by name', () => {
    const used = new Set([...source.matchAll(/'((?:icon|ui|cs)_[a-z0-9_]+)'/g)].map((m) => m[1]));
    const missing = [...used].filter((n) => !spriteNames.has(n));
    expect(missing).toEqual([]);
  });

  it('has frames that fit inside the sheets', () => {
    for (const [name, [x, y, w, h]] of Object.entries(sprites.frames)) {
      expect(x >= 0 && y >= 0 && w > 0 && h > 0, name).toBe(true);
      expect(x + w, name).toBeLessThanOrEqual(512);
    }
  });
});
