import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bridge, GeneratedStory, WorldState } from '../src/frontend/types';
import { commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { createTavernBridge } from '../src/runtime/bridge';
import { enableProtagonists, otherProtagonist, personState } from '../src/runtime/protagonist-world';
import type { ProtagonistId } from '../src/runtime/dual-protagonists';
import { backgroundLifeSummary } from '../src/runtime/background-life';
import { narrativeContext, protagonistRecap } from '../src/runtime/protagonist-narrative';

vi.mock('../src/frontend/App.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({ props: ['actions'], setup: () => () => h('div', '叙事生命周期测试') }) };
});
import { mountShell, type ShellHandle } from '../src/frontend/lifecycle';

let shell: ShellHandle | undefined;
afterEach(() => {
  shell?.dispose(); shell = undefined;
  document.body.innerHTML = '';
  document.body.style.cssText = '';
  localStorage.clear(); sessionStorage.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function dual(): WorldState {
  const state = enableProtagonists(createInitialState());
  state.journal.push({ id: 'soyo-private', at: '第 1 天 17:20', text: 'SOYO_PRIVATE_ONLY：夹在笔记中的私人计划。' });
  state.protagonists!.inactive.journal.push({ id: 'sakiko-private', at: '第 1 天 17:20', text: 'SAKIKO_PRIVATE_ONLY：尚未告诉他人的练习安排。' });
  return state;
}

function together(): WorldState {
  const state = reduceState(dual(), { type: 'walk', x: 0, z: 29, yaw: 0, seed: 'narrative-test' });
  // Keep all personal resources; only author the fixture's common physical position.
  const other = state.protagonists!.inactive;
  other.locationId = state.locationId;
  other.scene = structuredClone(state.scene);
  other.interior = structuredClone(state.interior);
  return parseState(state);
}

function narrator() {
  const context = {
    characterId: 0, groupId: null, chatId: 'dual-narrative-a', mainApi: 'openai',
    characters: [{ avatar: 'dual-narrative.png' }], getCurrentChatId: () => context.chatId,
  };
  const api = {
    parent: { SillyTavern: { getContext: () => context } },
    tavern_events: { CHAT_CHANGED: 'chat_changed' },
    getVariables: vi.fn(() => ({})), replaceVariables: vi.fn(),
    eventOn: vi.fn(), eventRemoveListener: vi.fn(),
    generate: vi.fn(async (_config: Record<string, unknown>) => '<story>你接着翻阅自己的记录。</story><phone_messages>[]</phone_messages>'),
    stopGenerationById: vi.fn(() => true),
  };
  return { api, bridge: createTavernBridge(api as unknown as Window)! };
}

describe('personal narrative inputs and common experiences', () => {
  it.each(['soyo', 'sakiko'] as const)('the actual %s prompt contains her own records and excludes the other private history', async owner => {
    let state = dual();
    state = reduceState(state, { type: 'switch_protagonist', target: otherProtagonist(owner) });
    state = reduceState(state, { type: 'wait', minutes: 90 });
    state = reduceState(state, { type: 'switch_protagonist', target: owner });
    const before = structuredClone(state);
    const { api, bridge } = narrator();
    try {
      await bridge.generate('接着我的经历继续。', state);
      expect(api.generate).toHaveBeenCalledTimes(1);
      const config = api.generate.mock.calls[0][0];
      const prompt = String(config.user_input);
      expect(prompt).toContain(owner === 'soyo' ? 'SOYO_PRIVATE_ONLY' : 'SAKIKO_PRIVATE_ONLY');
      expect(prompt).not.toContain(owner === 'soyo' ? 'SAKIKO_PRIVATE_ONLY' : 'SOYO_PRIVATE_ONLY');
      const summary = JSON.parse(prompt.split('\n')[1]);
      expect(summary.protagonist.id).toBe(owner);
      expect(summary.narrative.owner).toBe(owner);
      const source = backgroundLifeSummary(state, owner);
      expect(summary.narrative.recentLife.every((entry: { id: string; text: string }) => source.some(event => event.id === entry.id && event.text.startsWith(entry.text)))).toBe(true);
      expect(summary.narrative.recentLife.length).toBeGreaterThan(0);
      expect(summary.narrative.recentLife.length).toBeLessThanOrEqual(6);
      expect(state).toEqual(before);
      expect(api.replaceVariables).not.toHaveBeenCalled();
    } finally { bridge.dispose(); }
  });

  it('keeps long personal recaps bounded without exposing the other background metadata', () => {
    const state = dual();
    for (const owner of ['soyo', 'sakiko'] as const) {
      state.protagonists!.backgroundLife!.people[owner].events = Array.from({ length: 12 }, (_, index) => ({
        id: `bg:${owner}:bounded:${index}`, at: 1020 + index, kind: 'routine', text: `${owner}：${'本人已保存的日常经历。'.repeat(35)}`,
      }));
    }
    const before = structuredClone(state);
    const context = narrativeContext(state);
    expect(context.owner).toBe('soyo');
    expect(context.recentLife.length).toBeGreaterThan(0);
    expect(context.recentLife.length).toBeLessThanOrEqual(6);
    expect(context.recentLife.every(entry => entry.text.length <= 240 && entry.id.startsWith('bg:soyo:'))).toBe(true);
    expect(JSON.stringify(context)).not.toContain('sakiko：');
    expect(JSON.stringify(context)).not.toContain('cursor');
    expect(state).toEqual(before);
  });

  it('shows a saved automatic message only once when background life and sender evidence share its source', () => {
    let state = reduceState(dual(), { type: 'wait', minutes: 60 });
    const message = state.phone.find(entry => entry.npcId === 'protagonist-sakiko')!;
    expect(message).toBeDefined();
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    const context = narrativeContext(state);
    expect(JSON.stringify(context).split(message.text)).toHaveLength(2);
    expect(protagonistRecap(state).filter(entry => entry.text.includes(message.text))).toHaveLength(1);
  });

  it.each(['soyo', 'sakiko'] as const)('a common conversation from %s leaves shared speech but not private narration with the other protagonist', owner => {
    let state = together();
    state = reduceState(state, { type: 'switch_protagonist', target: owner });
    const reply: GeneratedStory = { text: 'PRIVATE_INNER_MONOLOGUE：这件事暂时不能告诉她。\n|素世|平静|乐谱已经放在桌边了。|\n|祥子|平静|我会记得带上。|', phoneMessages: [] };
    const ids = { userId: `shared-${owner}-user`, assistantId: `shared-${owner}-assistant` };
    const after = commitStoryTurn(state, '与她讨论乐谱。', reply, ids, 0);
    const witness = personState(after, otherProtagonist(owner));
    const journal = witness.journal.map(entry => entry.text).join('\n');
    expect(journal).toContain('乐谱已经放在桌边了。');
    expect(journal).toContain('我会记得带上。');
    expect(journal).not.toContain('PRIVATE_INNER_MONOLOGUE');
    expect(witness.story.some(entry => entry.text.includes('PRIVATE_INNER_MONOLOGUE'))).toBe(false);
    expect(commitStoryTurn(after, '与她讨论乐谱。', reply, ids, 0)).toEqual(after);
  });

  it('does not share a mentioned voice with a protagonist in a different place', () => {
    const state = dual();
    const reply: GeneratedStory = { text: '你回忆起先前的交谈。\n|祥子|平静|REMOTE_RECALLED_DIALOGUE|', phoneMessages: [] };
    const after = commitStoryTurn(state, '想起之前的话。', reply, { userId: 'remote-user', assistantId: 'remote-assistant' }, 0);
    expect(personState(after, 'sakiko').journal).toEqual(personState(state, 'sakiko').journal);
    expect(personState(after, 'sakiko').story).toEqual(personState(state, 'sakiko').story);
  });

  it('preserves the receipts of retained story turns when shared dialogue fills the personal journal', () => {
    const firstReply: GeneratedStory = { text: '你在原地等了十五分钟。', phoneMessages: [], worldActions: [{ type: 'rest', kind: 'wait', minutes: 15 }] };
    const firstIds = { userId: 'protected-user', assistantId: 'protected-assistant' };
    const state = commitStoryTurn(together(), '原地等十五分钟。', firstReply, firstIds, 0);
    const receipt = state.journal.find(entry => entry.id.startsWith('protected-assistant:wa:'));
    expect(receipt).toBeDefined();
    while (state.journal.length < 100) state.journal.push({ id: `old-note-${state.journal.length}`, at: '第 1 天 17:35', text: '较早的个人手记。' });
    const reply: GeneratedStory = { text: '|素世|平静|这是今天需要带上的东西。|', phoneMessages: [] };
    const after = commitStoryTurn(state, '把准备说给她听。', reply, { userId: 'new-shared-user', assistantId: 'new-shared-assistant' }, 0);
    expect(after.journal).toHaveLength(100);
    expect(after.journal.find(entry => entry.id === receipt!.id)).toEqual(receipt);
    expect(after.journal.some(entry => entry.id === 'shared:new-shared-assistant')).toBe(true);
    expect(commitStoryTurn(after, '原地等十五分钟。', firstReply, firstIds, 0)).toEqual(after);
  });

  it('records a generated cross-protagonist message for its real sender as well as its recipient', () => {
    let state = dual();
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    state = reduceState(state, { type: 'phone_app', owner: 'sakiko', requestId: 'start-correspondence', command: { type: 'send_message', text: '先联系一下。' } });
    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    const reply: GeneratedStory = { text: '手机收到了祥子的消息。', phoneMessages: [{ npcId: 'protagonist-sakiko', text: '同一条已保存的跨主角消息。' }] };
    const ids = { userId: 'message-user', assistantId: 'message-assistant' };
    const after = commitStoryTurn(state, '看看新消息。', reply, ids, 0);
    expect(after.phone.filter(message => message.text === reply.phoneMessages[0].text)).toHaveLength(1);
    const sender = personState(after, 'sakiko');
    expect(sender.journal.some(entry => entry.text.includes(reply.phoneMessages[0].text))).toBe(true);
    expect(sender.story.some(entry => entry.text.includes(reply.text))).toBe(false);
    expect(commitStoryTurn(after, '看看新消息。', reply, ids, 0)).toEqual(after);
  });

  it('shares no secret records just because the player switches viewpoints repeatedly', () => {
    let state = dual();
    const original = structuredClone(state);
    for (let index = 0; index < 3; index++) {
      state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
      state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    }
    expect(state.story).toEqual(original.story);
    expect(state.journal).toEqual(original.journal);
    expect(state.protagonists!.inactive.story).toEqual(original.protagonists!.inactive.story);
    expect(state.protagonists!.inactive.journal).toEqual(original.protagonists!.inactive.journal);
    expect(state.clock).toEqual(original.clock);
  });
});

describe('narrative consequences remain transactional', () => {
  function mount(initial = dual()) {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    let resolve: ((result: GeneratedStory) => void) | undefined;
    let current = 'a';
    let changed: (() => void) | undefined;
    const bridge: Bridge = {
      kind: 'demo', label: '双主角生命周期', session: () => current,
      load: () => structuredClone(initial), save: vi.fn(),
      onSessionChange(callback) { changed = callback; return vi.fn(); },
      generate: vi.fn(() => new Promise<GeneratedStory>(finish => { resolve = finish; })),
      cancel: vi.fn(), dispose: vi.fn(),
    };
    shell = mountShell(window, window, bridge, vi.fn());
    return { bridge, shell, finish: (reply: GeneratedStory) => resolve?.(reply), change: () => { current = 'b'; changed?.(); } };
  }
  const elapsedReply: GeneratedStory = { text: '仅在保存成功后出现的叙事。', phoneMessages: [], worldActions: [{ type: 'rest', kind: 'wait', minutes: 60 }] };

  it('a failed save leaves both stories, both phones and the background cursor untouched', async () => {
    const f = mount();
    const before = JSON.parse(JSON.stringify(f.shell.model.state));
    vi.mocked(f.bridge.save).mockImplementation(() => { throw new Error('存档写入失败'); });
    const pending = f.shell.actions.send('等待一小时。');
    f.finish(elapsedReply);
    await pending;
    expect(f.shell.model.state).toEqual(before);
    expect(f.shell.model.notice).toContain('存档写入失败');
    expect(f.shell.model.busy).toBe(false);
    expect(f.bridge.generate).toHaveBeenCalledTimes(1);
  });

  it.each(['soyo', 'sakiko'] as const)('switching away from %s cancels a held reply before it can advance either life', async owner => {
    const initial = reduceState(dual(), { type: 'switch_protagonist', target: owner });
    const f = mount(initial);
    const pending = f.shell.actions.send('等待一小时。');
    f.shell.actions.dispatch({ type: 'switch_protagonist', target: otherProtagonist(owner) });
    const afterSwitch = JSON.parse(JSON.stringify(f.shell.model.state));
    const saves = vi.mocked(f.bridge.save).mock.calls.length;
    f.finish(elapsedReply);
    await pending;
    expect(f.shell.model.state).toEqual(afterSwitch);
    expect(f.shell.model.state.clock).toEqual(initial.clock);
    expect(f.bridge.save).toHaveBeenCalledTimes(saves);
    expect(f.bridge.cancel).toHaveBeenCalled();
  });

  it('a late reply after changing chats cannot save background activity into the new chat', async () => {
    const f = mount();
    const pending = f.shell.actions.send('等待一小时。');
    f.change();
    f.finish(elapsedReply);
    await pending;
    expect(f.bridge.save).not.toHaveBeenCalled();
    expect(f.bridge.cancel).toHaveBeenCalled();
  });
});
