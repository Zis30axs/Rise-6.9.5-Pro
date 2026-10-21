import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTavernBridge } from '../src/runtime/bridge';
import { createInitialState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import {
  promptTopicHints, pruneVariableEcho, selectPromptJournal, selectPromptPhone,
  selectPromptStory,
} from '../src/runtime/prompt-pruning';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('bounded prompt context and regex variable pruning', () => {
  it('removes only explicit machine-state wrappers, not quotes or free-form dialogue', () => {
    const source = '|素世|平静|我想把变量写在笔记里。|\n'
      + '<unread_city_state>{"unread_city":"SECRET_MACHINE_ECHO"}</unread_city_state>\n'
      + '\x60\x60\x60unread_city_variables\n{"var":"SECOND_ECHO"}\n\x60\x60\x60\n'
      + '正常的故事中还有数字 123 和 JSON {"ordinary":true}。';
    const pruned = pruneVariableEcho(source);
    expect(pruned).toContain('|素世|平静|我想把变量写在笔记里。|');
    expect(pruned).toContain('{"ordinary":true}');
    expect(pruned).not.toMatch(/SECRET_MACHINE_ECHO|SECOND_ECHO/);
    expect(pruneVariableEcho('玩家真的说了 <variables> 这样的字符。')).toContain('<variables>');
  });

  it('keeps the most recent story/phone records bounded and deduplicates journal sources', () => {
    const journal = Array.from({ length: 22 }, (_, i) =>
      ({ id: 'journal:' + i, at: '第 1 天 17:20', text: '一条不会重复的记录 ' + i }));
    const subset = selectPromptJournal(journal, new Set(['journal:21']));
    expect(subset).toHaveLength(7);
    expect(subset.some(e => e.id === 'journal:21')).toBe(false);
    const story = Array.from({ length: 12 }, (_, i) =>
      ({ role: (i % 2 ? 'assistant' : 'user') as 'assistant' | 'user', text: 'A'.repeat(1500) }));
    expect(selectPromptStory(story)).toHaveLength(6);
    expect(selectPromptStory(story).every(s => s.text.length <= 650)).toBe(true);
    const phone = Array.from({ length: 30 }, (_, i) =>
      ({ npcId: 'lin', text: 'M'.repeat(500), read: i < 20, at: '第 1 天 17:20' }));
    expect(selectPromptPhone(phone)).toHaveLength(8);
    expect(selectPromptPhone(phone).every(m => m.text.length <= 280 && !m.read)).toBe(true);
  });

  it('provides only retrieval hints; keywords do not execute actions', () => {
    expect(promptTopicHints('去便利店买饮料').shopping).toBe(true);
    expect(promptTopicHints('读书上课').study).toBe(true);
    expect(promptTopicHints('打开宿舍门').room).toBe(true);
    expect(promptTopicHints('抬头看天')).toEqual({ study: false, shopping: false, room: false });
  });

  it('uses the actual Tavern bridge with compact catalog and single self-contained prompt', async () => {
    const context = {
      characterId: 0, groupId: null, chatId: 'prompt-pruning-test', mainApi: 'openai',
      characters: [{ avatar: 'test.png' }], getCurrentChatId: () => context.chatId,
    };
    const api = {
      parent: { SillyTavern: { getContext: () => context } },
      tavern_events: { CHAT_CHANGED: 'chat_changed' },
      getVariables: vi.fn(() => ({})), replaceVariables: vi.fn(),
      eventOn: vi.fn(), eventRemoveListener: vi.fn(),
      generate: vi.fn(async () => '<story>她看向夜色。</story><phone_messages>[]</phone_messages>'),
      stopGenerationById: vi.fn(() => true),
    };
    const state = enableProtagonists(createInitialState());
    state.journal.push({ id: 'machine:echo', at: '第 1 天 17:20',
      text: '<unread_city_state>SUPER_REPEATED_VAR_SENTINEL</unread_city_state>' });
    for (let i = 0; i < 25; i++) {
      state.phone.push({ id: 'phone-prune-' + i, npcId: 'lin', text: '编号' + i + '：' + '很长的消息'.repeat(150),
        read: i < 15, at: '第 1 天 17:20' });
    }
    const before = structuredClone(state);
    const bridge = createTavernBridge(api as unknown as Window)!;
    try {
      await bridge.generate('抬头看看夜空', state);
      expect(api.generate).toHaveBeenCalledTimes(1);
      const config = api.generate.mock.calls[0][0] as {user_input: string; max_chat_history: number};
      expect(config.max_chat_history).toBe(0);
      const summary = JSON.parse(config.user_input.split('\n')[1]);
      expect(summary.protagonist.id).toBe('soyo');
      expect(summary.narrative.weeklyMemory).toEqual([]);
      expect(summary.recentPhone).toHaveLength(8);
      expect(summary.recentPhone.at(-1).text.length).toBeLessThanOrEqual(280);
      expect(summary.journal.some((j: {text: string}) => j.text.includes('SUPER_REPEATED_VAR_SENTINEL'))).toBe(false);
      expect(summary.actionCatalog.services[0]).not.toHaveProperty('venues');
      expect(summary.actionCatalog.services[0]).not.toHaveProperty('changes');
      expect(summary.actionCatalog.storeItems.every((p: object) => Object.keys(p).length <= 4)).toBe(true);
      expect(summary.actionCatalog.subjects).toEqual([]);
      expect(summary.contacts.every((p: object) => !Object.keys(p).includes('balance'))).toBe(true);
      expect(JSON.stringify(state)).toBe(JSON.stringify(before));
      expect(api.replaceVariables).not.toHaveBeenCalled();
    } finally { bridge.dispose(); }
  });
});
