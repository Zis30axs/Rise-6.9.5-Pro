import { describe, expect, it } from 'vitest';
import { createInitialState, parseState } from '../src/runtime/model';
import { editStoryEntry } from '../src/runtime/story-editor';

describe('saved story editing', () => {
  it('updates the requested story body without replaying game effects or dropping scene metadata', () => {
    const base = createInitialState();
    const story = [
      { id: 'player-1', role: 'user' as const, text: '去咖啡馆。' },
      { id: 'reply-1', role: 'assistant' as const, text: '旧剧情。', participantIds: ['protagonist-sakiko'] },
    ];
    const before = parseState({ ...base, clock: { day: 3, hour: 19, minute: 42 }, story });
    const original = JSON.stringify(before);
    const edited = editStoryEntry(before, 'reply-1', '旧剧情。', '已纠正的剧情。');
    expect(edited.story[1]).toMatchObject({ id: 'reply-1', text: '已纠正的剧情。', participantIds: ['protagonist-sakiko'] });
    expect(edited.story[0]).toBe(before.story[0]);
    expect(edited.clock).toEqual(before.clock);
    expect(edited.player).toEqual(before.player);
    expect(edited.inventory).toEqual(before.inventory);
    expect(JSON.stringify(before)).toBe(original);
    expect(parseState(edited).story[1]?.text).toBe('已纠正的剧情。');
  });

  it('also supports a player action without regenerating its reply', () => {
    const base = createInitialState();
    const rows = [
      { id: 'player-1', role: 'user' as const, text: '原指令' },
      { id: 'reply-1', role: 'assistant' as const, text: '原回复' },
    ];
    const state = { ...base, story: rows };
    const edited = editStoryEntry(state, 'player-1', '原指令', '更正后的行动');
    expect(edited.story.map(row => row.text)).toEqual(['更正后的行动', '原回复']);
    expect(edited.story[1]).toBe(state.story[1]);
  });

  it('rejects empty, stale, oversized and unknown edits', () => {
    const state = { ...createInitialState(), story: [{ id: 'a', role: 'assistant' as const, text: '原文' }] };
    expect(() => editStoryEntry(state, 'a', '错的旧文', '新文')).toThrow('重新打开编辑器');
    expect(() => editStoryEntry(state, 'a', '原文', '   ')).toThrow('不能为空');
    expect(() => editStoryEntry(state, 'a', '原文', 'a'.repeat(6001))).toThrow('6000');
    expect(() => editStoryEntry(state, 'missing', '原文', '新文')).toThrow('不存在');
    expect(editStoryEntry(state, 'a', '原文', '原文')).toBe(state);
    const input = { ...state, story: [{ id: 'a', role: 'user' as const, text: '原文' }] };
    expect(() => editStoryEntry(input, 'a', '原文', 'a'.repeat(2001))).toThrow('2000');
  });

  it('retains separately stored offscreen beats and continuation when editing the main reply', () => {
    const base = createInitialState();
    const state = { ...base, story: [{ id: 'side-1', role: 'assistant' as const, text: '旧正文', 
      otherSideBeats: [{ protagonists: ['sakiko' as const], text: '远处的祥子。' }], returnStory: '回到主线。' }] };
    const edited = editStoryEntry(state, 'side-1', '旧正文', '新正文');
    expect(edited.story[0]?.otherSideBeats).toBe(state.story[0]?.otherSideBeats);
    expect(edited.story[0]?.returnStory).toBe('回到主线。');
  });
});
