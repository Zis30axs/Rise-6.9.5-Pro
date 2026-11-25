import { describe, expect, it } from 'vitest';
import type { StoryGenerationOptions } from '../src/frontend/types';
import { createInitialState, reduceState } from '../src/runtime/model';
import { narrativeContext } from '../src/runtime/protagonist-narrative';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { storyMemoryPrompt } from '../src/runtime/story-memory';

const bandEpisode = '第1集 · 爱音转入羽丘';
const majoChapter = '第一轮第1章 · 城崎诺亚案';
const watanareEpisode = '第1集 · 天台上的约定';

const episodeNumbers = (text: string) =>
  Array.from(text.matchAll(/^第(\d+)集 · /gm), match => Number(match[1]));

function expanded(prompt: string) {
  return [bandEpisode, majoChapter, watanareEpisode].filter(title => prompt.includes(title));
}

describe('dynamic story memory', () => {
  it.each([
    ['soyo', bandEpisode],
    ['sakiko', bandEpisode],
    ['emma', majoChapter],
    ['renako', watanareEpisode],
  ] as const)('gives %s the detailed version of her own history', (owner, title) => {
    expect(expanded(storyMemoryPrompt(owner, [], '看窗外。'))).toEqual([title]);
  });

  it('uses one shared band history with two complete series', () => {
    const soyo = storyMemoryPrompt('soyo', [], '继续。');
    const sakiko = storyMemoryPrompt('sakiko', [{ id: 'soyo' }], '等素世。');
    const expected = Array.from({ length: 13 }, (_, index) => index + 1);
    expect(sakiko).toBe(soyo);
    expect(episodeNumbers(soyo)).toEqual([...expected, ...expected]);
    expect(soyo).not.toContain('邦邦前史 ·');
  });

  it('keeps Mizuho alive in both the brief history and the detailed band memories', () => {
    for (const owner of ['sakiko', 'emma'] as const) {
      const prompt = storyMemoryPrompt(owner, [], '继续。');
      expect(prompt).toMatch(/瑞穗始终(?:健在|在世)/);
      expect(prompt).toMatch(/定治施压，?没有(?:跟随清告与祥子|随父女)离开/);
      expect(prompt).not.toMatch(/(?:瑞穗|祥子的母亲)(?:病逝|已故|去世)/);
    }
  });

  it('contains the three Majo loops, Tokyo continuation and Watanare volume bridge', () => {
    const emma = storyMemoryPrompt('emma', [], '继续。');
    const renako = storyMemoryPrompt('renako', [], '继续。');
    expect(emma.match(/^(?:第一|第二)轮第\d+章 · /gm)).toHaveLength(9);
    expect(emma).toContain('第三轮 · 最终审判');
    expect(emma).toContain('只有雪仍保有大魔女的魔法');
    expect(episodeNumbers(renako)).toEqual(Array.from({ length: 17 }, (_, index) => index + 1));
    expect(renako.match(/^小说第[5-8]卷 · /gm)).toHaveLength(4);
  });

  it('retains the existing brief entries and omits unrelated details', () => {
    const emma = storyMemoryPrompt('emma', [], '那次演出后来怎样？');
    const soyo = storyMemoryPrompt('soyo', [], '去排练。');
    const renako = storyMemoryPrompt('renako', [], '听一首 MyGO 的歌。');
    expect(emma.match(/^邦邦前史 · /gm)).toHaveLength(3);
    expect(emma).toContain('渡奈前史 ·');
    expect(soyo.match(/^魔裁前史 · /gm)).toHaveLength(2);
    expect(expanded(renako)).toEqual([watanareEpisode]);
    expect(expanded(storyMemoryPrompt('emma', [], '查找 asoyo123 和 renako123。'))).toEqual([majoChapter]);
  });

  it.each([
    ['去找祥子。', bandEpisode],
    ['和 ＳＯＹＯ 通话。', bandEpisode],
    ['给樱羽艾玛发信。', majoChapter],
    ['请 Emma 来。', majoChapter],
  ])('expands a named remote counterpart (%s)', (input, title) => {
    expect(expanded(storyMemoryPrompt('renako', [], input))).toEqual([title, watanareEpisode]);
  });

  it('expands each relevant history only once when several protagonists take part', () => {
    const result = storyMemoryPrompt('emma', [{ id: 'soyo' }, { id: 'sakiko' }],
      '刚遇见玲奈酱，所以请玲奈子一起过来。');
    expect(expanded(result)).toEqual([bandEpisode, majoChapter, watanareEpisode]);
    for (const title of expanded(result)) expect(result.split(title)).toHaveLength(2);
  });

  it('expands a counterpart in the same saved room and returns to brief after separation', () => {
    let state = enableProtagonists(createInitialState());
    state = reduceState(state, { type: 'novel_travel', locationId: 'dorm-room' });
    expect(state.interior?.roomId).toBe('dorm-room');

    const emma = personState(state, 'emma');
    const renako = personState(state, 'renako');
    for (const person of [emma, renako]) {
      person.locationId = state.locationId;
      person.scene = structuredClone(state.scene);
      person.interior = structuredClone(state.interior);
    }
    const currentPrompt = () => {
      const { owner, counterpartsInScene } = narrativeContext(state);
      return storyMemoryPrompt(owner, counterpartsInScene, '继续。');
    };
    expect(expanded(currentPrompt())).toEqual([bandEpisode, majoChapter, watanareEpisode]);
    emma.interior = { ...emma.interior!, roomId: 'toyokawa-house' };
    expect(expanded(currentPrompt())).toEqual([bandEpisode, watanareEpisode]);
    renako.interior = { ...renako.interior!, roomId: 'toyokawa-house' };
    expect(expanded(currentPrompt())).toEqual([bandEpisode]);
  });

  it('includes story interactions and omits specialist generation tasks', () => {
    expect(expanded(storyMemoryPrompt('emma', [], '和甘织玲奈子说话。', 'interaction_event')))
      .toEqual([majoChapter, watanareEpisode]);
    const specialistKinds: StoryGenerationOptions['kind'][] = [
      'autonomous_sms', 'phone_reply', 'npc_phone_reply', 'band_invitation_reply',
      'contact_introduction', 'notebook_compose',
    ];
    for (const kind of specialistKinds) {
      expect(storyMemoryPrompt('emma', [{ id: 'soyo' }], '和玲奈子说话。', kind)).toBe('');
    }
  });
});
