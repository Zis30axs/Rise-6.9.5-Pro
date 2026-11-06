import { describe, expect, it } from 'vitest';
import { promptTopicHints } from '../src/runtime/prompt-pruning';
import { omniscientContinuityContext } from '../src/runtime/protagonist-narrative';
import { createInitialState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';

describe('Lite narrative prompt context budget', () => {
  it('recognizes phone discussion without expanding phone history on ordinary dialogue', () => {
    expect(promptTopicHints('查看素世发来的短信').phone).toBe(true);
    expect(promptTopicHints('给祥子打电话').phone).toBe(true);
    expect(promptTopicHints('继续在咖啡厅聊天').phone).toBe(false);
    expect(promptTopicHints('去便利店买饮料').shopping).toBe(true);
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
    const focused = omniscientContinuityContext(state, new Set(['sakiko']));
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
