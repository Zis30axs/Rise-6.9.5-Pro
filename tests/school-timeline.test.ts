import { describe, expect, it } from 'vitest';
import { createTavernBridge } from '../src/runtime/bridge';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { gameDateISO, registrationNotice } from '../src/runtime/game-calendar';
import { residentById } from '../src/runtime/npc-cast';

describe('school timeline compatibility', () => {
  it('scopes the real generation prompt without completing registration or rewriting saved history', async () => {
    let request: { user_input: string; injects: { content: string }[] } | undefined;
    const context = { characterId: 0, chatId: 'school-timeline', mainApi: 'openai', characters: [{ avatar: 'card.png' }] };
    const host = { parent: { SillyTavern: { getContext: () => context } },
      tavern_events: { CHAT_CHANGED: 'changed' }, getVariables: () => ({}),
      replaceVariables() { throw Error('generation must not write saves'); },
      eventOn() {}, eventRemoveListener() {}, stopGenerationById: () => true,
      generate: async (config: typeof request) => {
        request = config;
        return '<story>她重新看了一眼报到通知。</story><phone_messages>[]</phone_messages>';
      } };
    const bridge = createTavernBridge(host as unknown as Window)!;
    try {
      let state = enableProtagonists(createInitialState());
      for (const target of ['soyo', 'sakiko', 'emma'] as const) {
        state = reduceState(state, { type: 'switch_protagonist', target });
        state = reduceState(state, { type: 'choose_academics', majorId: 'music' });
        state.story.push({ id: `saved-${target}`, role: 'assistant', text: `${target}此前已经保存的校园经历。` });
        const saved = JSON.stringify(state);
        await bridge.generate('看看报到通知', state);
        const system = request!.injects[0].content;
        expect(system).toContain('三主角校园线');
        expect(system).toContain('不代表所有配角同校或同年级');
        expect(system).toContain('正式学籍尚未确认');
        expect(system).toContain('不补写毕业、转学或已完成报到');
        expect(request!.user_input).toContain(`${target}此前已经保存的校园经历。`);
        expect(state.academics?.majorId).toBe('music');
        expect(JSON.stringify(state)).toBe(saved);
        expect(parseState(JSON.parse(saved))).toEqual(state);
        expect(gameDateISO(state.clock.day)).toBe('2025-08-28');
        expect(registrationNotice(state.clock.day)).toContain('还有 4 天');
      }
      expect(personState(state, 'soyo').story.some(row => row.id === 'saved-soyo')).toBe(true);
    } finally { bridge.dispose(); }
  });

  it('gives Emma the coordinated profile through the existing resident lookup without altering her home or identity', () => {
    const emma = residentById('majo-emma')!;
    expect(emma.profile).toContain('2025年9月1日');
    expect(emma.profile).toContain('正式学籍尚未确认');
    expect(emma.home).toBe('emma-yuki-home');
    expect(residentById('majo-yuki')!.home).toBe(emma.home);
  });
});
