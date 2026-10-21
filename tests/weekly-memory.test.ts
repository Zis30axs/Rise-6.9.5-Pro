import { describe, expect, it } from 'vitest';
import { commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, gameMinute } from '../src/runtime/protagonist-world';
import {
  captureNewJournalEvidence, createWeeklyMemory, parseWeeklyMemory, recordWeeklyEvidence,
  recordWeeklyStory, settleWeeklyMemory, weeklyMemoryContext,
} from '../src/runtime/weekly-memory';

function dual() { return enableProtagonists(createInitialState()); }

describe('seven-game-day personal memory', () => {
  it('migrates an existing 1.12 save at its current clock without inventing old events', () => {
    const state = dual();
    delete state.protagonists!.weeklyMemory;
    state.journal.push({ id: 'an-old-private-event', at: '第 1 天 17:00', text: '一条已存在的旧记录' });
    const migrated = parseState(state);
    expect(migrated.protagonists!.weeklyMemory).toEqual(createWeeklyMemory(gameMinute(state)));
    expect(migrated.journal.some(e => e.id === 'an-old-private-event')).toBe(true);
    expect(weeklyMemoryContext(migrated, 'soyo')).toEqual([]);
  });

  it('closes a week at day 8; sources are bounded, ordered and strictly owner-only', () => {
    const state = dual();
    const start = gameMinute(state);
    recordWeeklyEvidence(state, 'soyo', { id: 'shared:test-witness', at: start, text: '素世听到一段已经发生的交流。' });
    recordWeeklyEvidence(state, 'soyo', { id: 'private:soyo', at: start, text: '素世选择保留一封信。' });
    recordWeeklyEvidence(state, 'sakiko', { id: 'private:sakiko', at: start, text: '祥子保留自己的私人笔记。' });
    state.clock = { day: 8, hour: 0, minute: 0 };
    settleWeeklyMemory(state);
    const soyo = weeklyMemoryContext(state, 'soyo');
    const sakiko = weeklyMemoryContext(state, 'sakiko');
    expect(soyo).toHaveLength(1);
    expect(sakiko).toHaveLength(1);
    expect(soyo[0].week).toBe(1);
    expect(soyo[0].text).toContain('素世选择保留');
    expect(soyo[0].text).not.toContain('祥子保留');
    expect(sakiko[0].text).not.toContain('素世选择保留');
    const own = state.protagonists!.weeklyMemory!.people.soyo;
    expect(own.entries).toHaveLength(0);
    expect(own.closed[0].sources).toContain('private:soyo');
    const once = structuredClone(state.protagonists!.weeklyMemory);
    settleWeeklyMemory(state);
    recordWeeklyEvidence(state, 'soyo', { id: 'private:soyo', at: start, text: '过期重放' });
    expect(state.protagonists!.weeklyMemory).toEqual(once);
    expect(parseWeeklyMemory(state.protagonists!.weeklyMemory, state.clock)).toEqual(once);
  });

  it('extracts story evidence without treating narration as a state patch', () => {
    const state = dual();
    recordWeeklyStory(state, 'soyo', 'turn-test', '|素世|平静|我会保存这张纸条。|');
    const first = state.protagonists!.weeklyMemory!.people.soyo.entries;
    expect(first).toHaveLength(1);
    expect(first[0].text).toBe('素世说：“我会保存这张纸条。”');
    recordWeeklyStory(state, 'soyo', 'turn-test', '重复提交应被忽略');
    expect(state.protagonists!.weeklyMemory!.people.soyo.entries).toEqual(first);
  });

  it('keeps a source-backed daily quota without losing the first day to busy days', () => {
    const state = dual();
    state.clock = { day: 1, hour: 18, minute: 0 };
    for (let n = 0; n < 30; n++) {
      recordWeeklyEvidence(state, 'soyo', { id: 'routine:' + n, at: 1040 + n, text: '日常整理第' + n + '次' });
    }
    const rows = state.protagonists!.weeklyMemory!.people.soyo.entries;
    expect(rows.length).toBeLessThanOrEqual(7);
    expect(new Set(rows.map(e => e.id)).size).toBe(rows.length);
    state.clock = { day: 8, hour: 0, minute: 0 };
    settleWeeklyMemory(state);
    expect(weeklyMemoryContext(state, 'soyo')[0].text.length).toBeLessThanOrEqual(1800);
  });

  it('records only new journals by evidence ID; doesn't copy the other role after a switch', () => {
    let state = dual();
    const before = structuredClone(state);
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    state.journal.push({ id: 'sakiko:new', at: '第 1 天 17:20', text: '祥子写下了自己的安排。' });
    captureNewJournalEvidence(before, state);
    const one = state.protagonists!.weeklyMemory!.people.sakiko.entries;
    expect(one.map(e => e.id)).toContain('sakiko:new');
    expect(state.protagonists!.weeklyMemory!.people.soyo.entries.some(e => e.id === 'sakiko:new')).toBe(false);
    captureNewJournalEvidence(before, state);
    expect(state.protagonists!.weeklyMemory!.people.sakiko.entries).toEqual(one);
  });

  it('commits narrative evidence in the same validated world save, preserving old state', () => {
    const first = dual();
    const prior = structuredClone(first);
    const after = commitStoryTurn(first, '走到窗前看看。', {
      text: '你看见校园里亮起的灯。', phoneMessages: [],
    }, { userId: 'weekly-user', assistantId: 'weekly-assistant' }, 0);
    expect(after.protagonists!.weeklyMemory!.people.soyo.entries.some(e => e.id === 'story:weekly-assistant')).toBe(true);
    expect(first).toEqual(prior);
    expect(parseState(after)).toEqual(after);
  });

  it('rejects inconsistent persisted source IDs and oversize summaries', () => {
    const state = dual();
    const start = gameMinute(state);
    const raw = createWeeklyMemory(start);
    raw.people.soyo.entries = [
      { id: 'duplicate', at: start, text: '一段记录' },
      { id: 'duplicate', at: start, text: '另一段记录' },
    ];
    expect(() => parseWeeklyMemory(raw, state.clock)).toThrow(/七日记忆/);
    raw.people.soyo.entries = [];
    raw.people.soyo.openWeek = 2;
    raw.people.soyo.closed = [{ week: 1, sources: ['saved'], text: 'x'.repeat(1801) }];
    state.clock = { day: 8, hour: 0, minute: 0 };
    expect(() => parseWeeklyMemory(raw, state.clock)).toThrow(/七日记忆/);
  });
});
