import { describe, expect, it } from 'vitest';
import type { StoryGenerationOptions } from '../src/frontend/types';
import { bandStoryMemoryPrompt } from '../src/runtime/band-story-memory';
import { createInitialState, reduceState } from '../src/runtime/model';
import { narrativeContext } from '../src/runtime/protagonist-narrative';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';

const episodeNumbers = (prompt: string) =>
  Array.from(prompt.matchAll(/^第(\d+)集 · /gm), match => Number(match[1]));

describe('shared band story memory', () => {
  const detailed = bandStoryMemoryPrompt('soyo', [], '看窗外。');
  const brief = bandStoryMemoryPrompt('emma', [], '看窗外。');

  it('uses the same two complete series for both band protagonists and includes each episode once', () => {
    const expected = Array.from({ length: 13 }, (_, index) => index + 1);
    expect(episodeNumbers(detailed)).toEqual([...expected, ...expected]);
    expect(bandStoryMemoryPrompt('sakiko', [{ id: 'soyo' }], '和素世聊聊。')).toBe(detailed);
    expect(bandStoryMemoryPrompt('soyo', [{ id: 'sakiko' }], '和祥子聊聊。')).toBe(detailed);
    expect(detailed).not.toContain('邦邦前史 ·');
  });

  it('uses the existing short summaries for unrelated turns', () => {
    expect(brief.match(/^邦邦前史 · /gm)).toHaveLength(3);
    expect(episodeNumbers(brief)).toEqual([]);
    expect(brief.length).toBeLessThan(detailed.length / 4);
    expect(bandStoryMemoryPrompt('renako', [], '继续。')).toBe(brief);
    expect(bandStoryMemoryPrompt('emma', [{ id: 'renako' }], '她还记得那次演出吗？')).toBe(brief);
    expect(bandStoryMemoryPrompt('emma', [], '听一首 MyGO 的歌。')).toBe(brief);
    expect(bandStoryMemoryPrompt('emma', [], '查找 asoyo123。')).toBe(brief);
  });

  it.each(['给长崎素世发条消息。', '问祥子今晚有空吗。', '想起 ＳＯＹＯ。', '和 Sakiko 联系。'])(
    'expands remotely for an explicit reference in the current action (%s)',
    input => {
      expect(bandStoryMemoryPrompt('emma', [], input)).toBe(detailed);
    },
  );

  it('uses saved same-room presence and returns to brief after separation', () => {
    let state = enableProtagonists(createInitialState());
    state = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    state = reduceState(state, { type: 'novel_travel', locationId: 'dorm-room' });
    expect(state.interior?.roomId).toBe('dorm-room');

    const soyo = personState(state, 'soyo');
    const sakiko = personState(state, 'sakiko');
    for (const person of [soyo, sakiko]) {
      person.locationId = state.locationId;
      person.scene = structuredClone(state.scene);
      person.interior = structuredClone(state.interior);
    }
    const currentPrompt = () => {
      const { owner, counterpartsInScene } = narrativeContext(state);
      return bandStoryMemoryPrompt(owner, counterpartsInScene, '继续。');
    };
    expect(currentPrompt()).toBe(detailed);
    soyo.interior = { ...soyo.interior!, roomId: 'toyokawa-house' };
    expect(currentPrompt()).toBe(detailed);
    sakiko.interior = { ...sakiko.interior!, roomId: 'toyokawa-house' };
    expect(currentPrompt()).toBe(brief);
  });

  it('includes story interactions and omits specialist generation tasks', () => {
    expect(bandStoryMemoryPrompt('emma', [], '和素世聊聊。', 'interaction_event')).toBe(detailed);
    const specialistKinds: StoryGenerationOptions['kind'][] = [
      'autonomous_sms', 'phone_reply', 'npc_phone_reply', 'band_invitation_reply',
      'contact_introduction', 'notebook_compose',
    ];
    for (const kind of specialistKinds) {
      expect(bandStoryMemoryPrompt('soyo', [], '祥子', kind)).toBe('');
    }
  });
});
