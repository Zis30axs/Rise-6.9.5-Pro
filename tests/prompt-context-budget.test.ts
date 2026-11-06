import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { promptTopicHints } from '../src/runtime/prompt-pruning';
import { omniscientContinuityContext } from '../src/runtime/protagonist-narrative';
import { createInitialState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';

describe('Lite narrative prompt context budget', () => {
  it('recognizes indirect shopping requests without requiring buy commands', () => {
    expect(promptTopicHints('去便利店买饮料').shopping).toBe(true);
    expect(promptTopicHints('我渴了，找点喝的').shopping).toBe(true);
    expect(promptTopicHints('这个多少钱？').shopping).toBe(true);
  });



  it('keeps free-form action IDs and SMS evidence when a request uses no topic keyword', () => {
    const bridge = readFileSync('src/runtime/bridge.ts', 'utf8');
    expect(bridge).toContain('storeNameIndex = storeCatalog.map(({ id, name }) => ({ id, name }))');
    expect(bridge).toContain('storeItems: topics.shopping ? minimalStore : storeNameIndex');
    expect(bridge).toContain('rooms: campusInteriors.map(room');
    expect(bridge).toContain('recentSms: storySmsContext(snapshot),');
    expect(bridge).toContain('continuationReference || input.includes(shortName)');
    expect(bridge).not.toContain('storySmsContext(snapshot).slice(');
  });

  it('keeps compact continuity for unrelated protagonists and full evidence for a named protagonist', () => {
    const state = enableProtagonists(createInitialState());
    const sakiko = personState(state, 'sakiko');
    const example = sakiko.story.at(-1)!;
    for (let i = 0; i < 6; i++) {
      sakiko.story.push({ ...example, id: 'prompt-budget-' + i, role: 'assistant',
        text: '祥子整理了自己的计划。'.repeat(120) });
    }
    const before = JSON.stringify(state);
    const compact = omniscientContinuityContext(state, new Set());
    const focused = omniscientContinuityContext(state, new Set(['sakiko' as const]));
    const unchanged = omniscientContinuityContext(state);
    const compactSakiko = compact.find(person => person.id === 'sakiko')!;
    const focusedSakiko = focused.find(person => person.id === 'sakiko')!;
    expect(compactSakiko.recentStory).toHaveLength(1);
    expect(compactSakiko.recentStory[0]!.text.length).toBeLessThanOrEqual(240);
    expect(focusedSakiko.recentStory).toHaveLength(4);
    expect(unchanged.find(person => person.id === 'sakiko')!.recentStory).toHaveLength(4);
    expect(JSON.stringify(state)).toBe(before);
  });
});
