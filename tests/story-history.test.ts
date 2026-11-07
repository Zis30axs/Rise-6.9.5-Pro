import { describe, expect, it } from 'vitest';
import { retainStoryHistory, STORY_RECORD_LIMIT, STORY_REPLY_LIMIT } from '../src/runtime/story-history';
import type { WorldState } from '../src/frontend/types';

type Entry = WorldState['story'][number];
const user = (round: number): Entry => ({
  id: `round-${round}-user`, role: 'user', text: `玩家第 ${round} 轮输入`,
});
const reply = (round: number): Entry => ({
  id: `round-${round}-reply`, role: 'assistant', text: `模型第 ${round} 轮回复`,
});

describe('per-protagonist story reply retention', () => {
  it('keeps the latest 60 complete LLM replies and their matching player inputs', () => {
    const opening: Entry = { id: 'soyo-opening', role: 'assistant', text: '素世的开场白' };
    const rows = [opening, ...Array.from({ length: 64 }, (_, i) => [user(i + 1), reply(i + 1)]).flat()];
    const snapshot = JSON.stringify(rows);
    const retained = retainStoryHistory(rows);
    expect(STORY_REPLY_LIMIT).toBe(60);
    expect(retained).toHaveLength(121);
    expect(retained[0]).toBe(opening);
    expect(retained[1]?.id).toBe('round-5-user');
    expect(retained[2]?.id).toBe('round-5-reply');
    expect(retained.at(-2)?.id).toBe('round-64-user');
    expect(retained.at(-1)?.id).toBe('round-64-reply');
    expect(retained.filter(row => row.role === 'user')).toHaveLength(60);
    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(retainStoryHistory(retained)).toEqual(retained);
  });

  it('does not count scripted beats or off-screen episodes toward the 60 LLM turns', () => {
    const rows: Entry[] = [{ id: 'emma-opening', role: 'assistant', text: '艾玛的开场白' }];
    for (let i = 1; i <= 63; i++) {
      rows.push(user(i), reply(i));
      rows.push({ id: `event-${i}`, role: 'assistant', text: '离屏事件' });
    }
    const retained = retainStoryHistory(rows);
    expect(retained.length).toBeLessThanOrEqual(STORY_RECORD_LIMIT);
    expect(retained[0]?.id).toBe('emma-opening');
    expect(retained.filter(entry => entry.id.endsWith('-reply'))).toHaveLength(60);
    expect(retained.filter(entry => entry.id.endsWith('-user'))).toHaveLength(60);
    expect(retained.find(entry => entry.id === 'round-4-user')).toBeDefined();
    expect(retained.find(entry => entry.id === 'round-3-user')).toBeUndefined();
    expect(retained.filter(entry => entry.id.startsWith('event-'))).toHaveLength(59);
  });

  it('does not invent a model reply for an incomplete user message', () => {
    const rows = [user(1), reply(1), user(2)];
    expect(retainStoryHistory(rows)).toEqual(rows);
  });
});
