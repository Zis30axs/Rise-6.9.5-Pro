import { describe, expect, it } from 'vitest';
import type { WorldState } from '../src/frontend/types';
import {
  notebookMinute, notebookPeople, validateNotebookDrafts, makePersonalNotebookPage,
} from '../src/runtime/notebook';

const state = { contacts: [], clock: { day: 3, hour: 9, minute: 15 } } as unknown as WorldState;

describe('人物手账安全约束', () => {
  it('列出主角和世界书人物，稳定 ID 不重复', () => {
    const people = notebookPeople(state);
    expect(people.find(p => p.id === 'soyo')?.name).toBeTruthy();
    expect(people.find(p => p.id === 'bang-anon')?.name).toBeTruthy();
    expect(new Set(people.map(p => p.id)).size).toBe(people.length);
  });
  it('仅接收已知人物的合法模型手账', () => {
    expect(validateNotebookDrafts([{ personId: 'bang-anon', title: '今日', text: '去看演出了。' }], state)).toHaveLength(1);
    expect(() => validateNotebookDrafts([{ personId: 'unknown-private', title: '谎言', text: '秘密' }], state)).toThrow();
    expect(() => validateNotebookDrafts(Array.from({ length: 3 }, () => ({ personId: 'soyo', title: '一', text: '二' })), state)).toThrow();
    expect(() => validateNotebookDrafts([{ personId: 'soyo', title: '一', text: '二', wallet: 10 }], state)).toThrow();
  });
  it('非当前主角只能被添加旁观备注，不冒充本人手账', () => {
    expect(notebookMinute(state)).toBe((3 - 1) * 1440 + 9 * 60 + 15);
    expect(makePersonalNotebookPage(state, 'soyo', '日常', '今日天气不错').kind).toBe('character');
    expect(makePersonalNotebookPage(state, 'bang-anon', '注记', '她似乎有点开心').kind).toBe('observer');
  });
});
