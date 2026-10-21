import { describe, expect, it } from 'vitest';
import { commitStoryTurn, createInitialState, parseState, applyStoryActions } from '../src/runtime/model';
import { enableProtagonists, gameMinute } from '../src/runtime/protagonist-world';
import { applyWeeklySummary, createWeeklyMemory, parseWeeklyMemory, recordWeeklyEvidence,
  recordWeeklyStory, settleWeeklyMemory, weeklyMemoryContext } from '../src/runtime/weekly-memory';
import { parseGeneratedStory } from '../src/runtime/story-protocol';

const dual = () => enableProtagonists(createInitialState());

describe('omniscient 7-game-day story memory', () => {
  it('migrates pre-archive 1.12 saves at current in-game time', () => {
    const state = dual(); delete state.protagonists!.weeklyMemory;
    const restored = parseState(state);
    expect(restored.protagonists!.weeklyMemory).toEqual(createWeeklyMemory(gameMinute(state)));
    expect(restored.protagonists!.weeklyMemory!.closed).toEqual([]);
  });

  it('closes a single joint world week, retaining evidence from both perspectives', () => {
    const state = dual(); const at = gameMinute(state);
    recordWeeklyEvidence(state, 'soyo', { id: 'soyo-secret', at, text: '素世有尚未公开的个人计划。' });
    recordWeeklyEvidence(state, 'sakiko', { id: 'sakiko-secret', at, text: '祥子藏着另一封信。' });
    state.clock = { day: 8, hour: 0, minute: 0 };
    settleWeeklyMemory(state);
    const pending = weeklyMemoryContext(state).pending!;
    expect(pending.week).toBe(1);
    expect(pending.evidence).toHaveLength(2);
    expect(pending.evidence.map(x => x.owner)).toContain('soyo');
    expect(pending.evidence.map(x => x.owner)).toContain('sakiko');
    expect(weeklyMemoryContext(state).summaries).toHaveLength(0);
    applyWeeklySummary(state, { week: 1, text: '素世打算秘密行动；与此同时，祥子保留一封信。两件事尚未彼此公开。' });
    expect(weeklyMemoryContext(state).summaries).toHaveLength(1);
    expect(weeklyMemoryContext(state).pending).toBeNull();
    expect(state.protagonists!.weeklyMemory!.closed[0].evidence).toEqual([]);
    expect(state.protagonists!.weeklyMemory!.closed[0].sources).toContain('soyo:soyo-secret');
    expect(parseWeeklyMemory(state.protagonists!.weeklyMemory, state.clock)).toEqual(state.protagonists!.weeklyMemory);
  });

  it('returns one omniscient block independent of the currently controlled protagonist', () => {
    const state = dual(); const at = gameMinute(state);
    recordWeeklyEvidence(state, 'soyo', { id: 'one', at, text: '素世做了一件事。' });
    recordWeeklyEvidence(state, 'sakiko', { id: 'two', at, text: '祥子做了另一件事。' });
    state.clock = { day: 8, hour: 0, minute: 0 }; settleWeeklyMemory(state);
    const before = weeklyMemoryContext(state);
    state.protagonists!.accounts.active = 'sakiko';
    expect(weeklyMemoryContext(state)).toEqual(before);
  });

  it('validates week and object shape before any story commit', () => {
    const state = dual();const at = gameMinute(state);
    recordWeeklyEvidence(state, 'soyo', { id: 'source', at, text: '一项确认的经历。' });
    state.clock = { day: 8, hour: 0, minute: 0 }; settleWeeklyMemory(state);
    expect(parseGeneratedStory('<story>继续。</story><weekly_summary>{"week":1,"text":"世界中的一周过去了。"}</weekly_summary>', state).weeklySummary?.week).toBe(1);
    expect(() => parseGeneratedStory('<story>继续。</story><weekly_summary>{"week":2,"text":"错误周次"}</weekly_summary>', state)).toThrow(/七日摘要/);
    expect(() => parseGeneratedStory('<story>继续。</story><weekly_summary>{"week":1,"text":"好","balance":999}</weekly_summary>', state)).toThrow(/七日摘要/);
  });

  it('keeps two authors in one timeline and ignores repeated source IDs', () => {
    const state = dual(); const at = gameMinute(state);
    recordWeeklyEvidence(state, 'soyo', { id: 'same-id', at, text: '素世的记录' });
    recordWeeklyEvidence(state, 'sakiko', { id: 'same-id', at, text: '祥子的记录' });
    recordWeeklyEvidence(state, 'soyo', { id: 'same-id', at, text: '重复事件' });
    expect(state.protagonists!.weeklyMemory!.entries).toHaveLength(2);
    expect(state.protagonists!.weeklyMemory!.entries.map(e => e.text)).not.toContain('重复事件');
  });

  it('checks atomic story commit for LLM-generated global weekly summary', () => {
    const state = dual(); const at = gameMinute(state);
    recordWeeklyEvidence(state, 'soyo', { id: 'hello', at, text: '素世记录了日常。' });
    const advanced = applyStoryActions(state, [{ type: 'rest', kind: 'wait', minutes: 7 * 1440 }], 'advance-week');
    const snapshot = structuredClone(advanced);
    const after = commitStoryTurn(advanced, '继续。', {
      text: '她抬头看见了新的日出。', phoneMessages: [],
      weeklySummary: { week: 1, text: '过去的一周里，素世留下了一份日常记录。' },
    }, { userId: 'weekly-user', assistantId: 'weekly-assistant' }, 0);
    expect(weeklyMemoryContext(after).summaries[0].week).toBe(1);
    expect(advanced).toEqual(snapshot);
    expect(parseState(after)).toEqual(after);
  });

  it('rejects duplicate weekly summary alteration and malformed persistence', () => {
    const state = dual();const at = gameMinute(state);
    recordWeeklyStory(state, 'soyo', 'a', '|素世|平静|我要整理好这封信。|');
    state.clock = { day: 8, hour: 0, minute: 0 };settleWeeklyMemory(state);
    applyWeeklySummary(state, { week: 1, text: '一周总结。' });
    expect(() => applyWeeklySummary(state, { week: 1, text: '篡改的一周总结' })).toThrow(/冲突/);
    const malformed = structuredClone(state.protagonists!.weeklyMemory!);
    malformed.closed[0].summary = 'x'.repeat(1801);
    expect(() => parseWeeklyMemory(malformed, state.clock)).toThrow(/七日记忆/);
  });
});
