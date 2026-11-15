// LUNA's offline answers (used when there is no internet) and answer clean-up.
import { describe, expect, it } from 'vitest';
import factsJson from '../public/resources/data/nasa_facts.json';
import { DEFAULT_SETTINGS } from '../src/core/StorageManager';
import { cleanAnswer, LunaAI } from '../src/systems/LunaAI';
import type { FactsData } from '../src/types';

const luna = new LunaAI({ ...DEFAULT_SETTINGS, aiEnabled: false }, factsJson as unknown as FactsData);
const ctx = {
  mission: 'Mission 3: Ice, Ice, Mars-y',
  objective: 'Mine 10 ice chunks',
  status: '',
  location: 'outside',
};

describe('offline LUNA', () => {
  it('says hello back', () => {
    expect(luna.offline('Hii').text).toMatch(/hi|hello/i);
  });

  it('answers chit-chat', () => {
    expect(luna.offline('How are you?').text).toMatch(/circuits|great/i);
    expect(luna.offline('tell me a joke').text.length).toBeGreaterThan(10);
  });

  it('knows the next step', () => {
    expect(luna.offline('what should I do now?', undefined, ctx as never).text).toContain('Mine 10 ice chunks');
  });

  it('explains how to get water', () => {
    expect(luna.offline('How do I get water?').text).toMatch(/ice/i);
  });

  it('points to the water valve in Base Ops', () => {
    expect(luna.offline('where is the water valve').text).toMatch(/Base Ops/);
  });

  it('has a friendly answer for anything else', () => {
    expect(luna.offline('qwertyuiop').text).toMatch(/not sure/i);
  });
});

describe('cleanAnswer', () => {
  it('removes markdown so answers fit the speech bubble', () => {
    expect(cleanAnswer('**Mars** is _red_ because of [rust](http://x).')).not.toMatch(/\*|_|\[|\(http/);
  });
});

describe('AI server address', () => {
  it('treats our old and new servers as official, but keeps a teacher’s own server', async () => {
    const { isOfficialAiUrl } = await import('../src/config');
    expect(isOfficialAiUrl('https://luna-ai-342869744683.asia-southeast1.run.app')).toBe(true);
    expect(isOfficialAiUrl('https://luna-ai.sideloaders.workers.dev/')).toBe(true);
    expect(isOfficialAiUrl('http://localhost:4000')).toBe(false);
    expect(isOfficialAiUrl('https://my-school-ai.example.org')).toBe(false);
    expect(isOfficialAiUrl('not a url')).toBe(false);
  });
});
