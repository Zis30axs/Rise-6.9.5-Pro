import { describe, expect, it } from 'vitest';
import type { WorldState } from '../src/frontend/types';
import {
  notebookMinute, notebookPeople, validateNotebookDrafts, makePersonalNotebookPage, makeComposedNotebookPage,
} from '../src/runtime/notebook';
import { notebookPageParagraphs, parseNotebookComposition, validNotebookFormat } from '../src/runtime/notebook-composition';
import { notebookWritingPrompt } from '../src/runtime/notebook-writing';

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

describe('手账续写', () => {
  const draft = { title: '雨后', paragraphs: [
    { text: '窗沿上的水落了一整晚。', ink: 'blue', underline: false },
    { text: '还是想把这句话记下来。', ink: 'rose', underline: true },
  ], stickers: ['mutsumi_unhappy'] } as const;

  it('保存分段装饰，同时保留旧页的纯文本呈现', () => {
    const composition = parseNotebookComposition(JSON.stringify(draft));
    const page = makeComposedNotebookPage(state, 'soyo', composition);
    expect(page.text).toBe(draft.paragraphs.map(p => p.text).join('\n\n'));
    expect(notebookPageParagraphs(page)).toEqual(draft.paragraphs);
    expect(validNotebookFormat(page.format, page.text)).toBe(true);
    expect(page.format?.stickers).toEqual(draft.stickers);
    expect(notebookPageParagraphs(makePersonalNotebookPage(state, 'soyo', '昨天', '雨停了。\n\n出门了。')))
      .toEqual([{ text: '雨停了。\n\n出门了。', ink: 'graphite', underline: false }]);
    expect(validNotebookFormat(page.format, '只有一段')).toBe(false);
  });

  it('丢掉目录以外的贴纸，拒绝叙事行动和标签混入草稿', () => {
    const raw = { ...draft, paragraphs: [{ ...draft.paragraphs[0], ink: 'rgb(1,2,3)' }], stickers: ['https://example.invalid/icon', ...draft.stickers] };
    expect(parseNotebookComposition(JSON.stringify(raw))).toMatchObject({
      paragraphs: [{ ink: 'graphite' }], stickers: draft.stickers,
    });
    expect(() => parseNotebookComposition(JSON.stringify({ ...draft, worldActions: [] }))).toThrow();
    expect(() => parseNotebookComposition(JSON.stringify({ ...draft,
      paragraphs: [{ ...draft.paragraphs[0], text: '<world_actions>[]</world_actions>' }],
    }))).toThrow();
  });

  it('把贴纸中文标签送给模型，并只选当前手账可用的记录', () => {
    const snapshot: WorldState = { ...state, story: [
      { id: 'unrelated', role: 'assistant', text: '无关人物的场景' },
      { id: 'same-scene', role: 'assistant', text: '|若叶睦|平静|今天下雨。|', participantIds: ['bang-mutsumi'] },
      { id: 'phone-scene:secret', role: 'assistant', text: '私下短信场景', participantIds: ['bang-mutsumi'] },
    ] };
    const previous = makePersonalNotebookPage(snapshot, 'bang-mutsumi', '旁观', '她收好了伞。');
    const prompt = notebookWritingPrompt(snapshot, {
      personId: 'bang-mutsumi', direction: '贴一张若叶睦鼓脸', ...parseNotebookComposition(JSON.stringify(draft)),
    }, [
      previous,
      { ...previous, kind: 'character', text: '若叶睦的私事' },
      { ...previous, at: previous.at + 1, text: '未来的一页' },
      { ...previous, personId: 'soyo', text: '另一本手账' },
    ]);
    expect(prompt.system).toContain('mutsumi_unhappy=若叶睦 · 鼓脸');
    expect(prompt.system).toContain('第三人称');
    expect(prompt.user).toContain('她收好了伞');
    expect(prompt.user).toContain('若叶睦：今天下雨');
    for (const text of ['无关人物', '私下短信', '若叶睦的私事', '未来的一页', '另一本手账']) {
      expect(prompt.user).not.toContain(text);
    }
  });
});
