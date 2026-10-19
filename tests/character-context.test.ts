import { describe, expect, it } from 'vitest';
import { buildCharacterIntroductionContext, CHARACTER_CONTEXT_LIMITS } from '../src/runtime/character-context';
import { createInitialState, reduceState } from '../src/runtime/model';
import { getScenePeople } from '../src/runtime/scene-context';
import { createTavernBridge } from '../src/runtime/bridge';

describe('character introduction evidence', () => {
  it('selects only this person and its adjacent conversational turn, retaining old names after confirmation', () => {
    const state = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'library' });
    const person = getScenePeople(state.scene!)[0];
    state.story = [
      { id: 'unrelated-u', role: 'user', text: 'UNRELATED_MARKER：商场的折扣如何？' },
      { id: 'unrelated-a', role: 'assistant', text: 'UNRELATED_REPLY：商场还有很多商铺。' },
      { id: 'met-u', role: 'user', text: `我向${person.name}询问借阅。`, participantIds: [person.id] },
      { id: 'met-a', role: 'assistant', text: `|${person.name}|开心|我正在准备读书会。|`, participantIds: [person.id] },
    ];
    const context = buildCharacterIntroductionContext(state, { sourcePersonId: person.id, name: '已确认新名字', portraitId: 'claude', summary: '' });
    expect(context.relatedTurns).toHaveLength(2);
    expect(JSON.stringify(context)).toContain('读书会'); expect(JSON.stringify(context)).not.toContain('UNRELATED');
    expect(context.character.priorName).toBe(person.name);
  });
  it('bounds tokens and retains the character mention inside a long turn', () => {
    const state = createInitialState();
    state.story = Array.from({ length: 20 }, (_, index) => ({ id: `target-${index}`, role: 'assistant' as const, text: '无关文字'.repeat(300) + '林同学提到了读书会。' + '后续'.repeat(300), participantIds: ['lin'] }));
    const context = buildCharacterIntroductionContext(state, { id: 'lin', name: '林同学', portraitId: 'deepseek', summary: '喜欢阅读。' });
    expect(context.relatedTurns.length).toBeLessThanOrEqual(CHARACTER_CONTEXT_LIMITS.turns);
    expect(context.relatedTurns.reduce((total, entry) => total + entry.text.length, 0)).toBeLessThanOrEqual(CHARACTER_CONTEXT_LIMITS.totalCharacters);
    expect(context.relatedTurns.at(-1)?.text).toContain('读书会');
  });
  it('keeps no-evidence characters explicit instead of borrowing unrelated history', () => {
    const state = createInitialState();
    const context = buildCharacterIntroductionContext(state, { name: '新认识的人', portraitId: 'xiaoyang', summary: '' });
    expect(context.relatedTurns).toEqual([]); expect(context.evidence).toContain('没有找到');
  });
  it('uses a compact dedicated introduction protocol and rejects gameplay side effects', async () => {
    let config: { user_input: string; injects: { content: string }[] } | undefined;
    let response = JSON.stringify({ story: '林同学正在准备一场读书会，交流时表现得热心。', phone_messages: [] });
    const context = { characterId: 0, chatId: 'a', mainApi: 'openai', characters: [{ avatar: 'card.png' }] };
    const host = { parent: { SillyTavern: { getContext: () => context } }, tavern_events: { CHAT_CHANGED: 'changed' },
      getVariables: () => ({}), replaceVariables() { throw Error('不得写入'); }, eventOn() {}, eventRemoveListener() {}, stopGenerationById: () => true,
      generate: async (value: typeof config) => { config = value; return response; } };
    const bridge = createTavernBridge(host as unknown as Window)!;
    const state = createInitialState();
    state.story.push({ id: 'target', role: 'assistant', text: '|林同学|开心|我正在准备读书会。|', participantIds: ['lin'] });
    const options = { kind: 'contact_introduction' as const, contact: { id: 'lin', name: '林同学', portraitId: 'claude' as const, sourcePersonId: null, summary: '' } };
    const before = structuredClone(state);
    await expect(bridge.generate('生成简介', state, options)).resolves.toMatchObject({ text: expect.stringContaining('读书会') });
    const summary = JSON.parse(config!.user_input.split('\n')[1]);
    expect(summary.relatedTurns).toHaveLength(1); expect(summary).not.toHaveProperty('actionCatalog');
    expect(config!.injects[0].content).toContain('玩家已经点击');
    response = JSON.stringify({ story: '介绍', phone_messages: [], world_actions: [{ type: 'rest', kind: 'sleep', minutes: 600 }] });
    await expect(bridge.generate('生成简介', state, options)).rejects.toThrow('人物简介格式无效');
    expect(state).toEqual(before); bridge.dispose();
  });
});
