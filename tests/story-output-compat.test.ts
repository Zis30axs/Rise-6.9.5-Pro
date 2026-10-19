import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitStoryTurn, createInitialState } from '../src/runtime/model';
import { createTavernBridge } from '../src/runtime/bridge';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import {
  loadStoryApiKey, loadStoryApiSettings, normalizeStoryEndpoint,
  requestStoryFromCustomApi, saveStoryApiKey, saveStoryApiSettings,
} from '../src/runtime/story-api';
import type { StoryApiSettings } from '../src/runtime/story-api';

const custom: StoryApiSettings = {
  mode: 'custom', format: 'chat', endpoint: 'https://example.invalid/v1', model: 'test-narrator',
  preset: '以现实主义描写校园场景。',
};

afterEach(() => {
  vi.unstubAllGlobals();
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* jsdom may disable storage */ }
});

describe('tagged story transport', () => {
  it('accepts multiline story, JSON phone actions and legacy JSON through the same validator', () => {
    const before = createInitialState();
    const tagged = [
      '<thinking>无须将这一段解析进剧情。</thinking>',
      '<story>你把纸页翻过来。',
      '|林同学|思考|你看到过这张纸吗？|</story>',
      '<phone_messages>[{"npcId":"lin","text":"我在图书馆。"}]</phone_messages>',
      '<world_actions>[{"type":"relationship","npcId":"lin","delta":1,"reason":"分享了借阅资料"}]</world_actions>',
    ].join('\n');
    const result = parseGeneratedStory(tagged, before);
    expect(result.text).toContain('你把纸页翻过来。\n|林同学|思考|');
    expect(result.phoneMessages).toEqual([{ npcId: 'lin', text: '我在图书馆。' }]);
    expect(result.worldActions).toEqual([{ type: 'relationship', npcId: 'lin', delta: 1, reason: '分享了借阅资料' }]);
    expect(parseGeneratedStory(JSON.stringify({ story: result.text, phone_messages: result.phoneMessages, world_actions: result.worldActions }), before)).toEqual(result);
    const next = commitStoryTurn(before, '看衣柜', result, { userId: 'test-tagged-user', assistantId: 'test-tagged-assistant' });
    expect(next.contacts.find(contact => contact.id === 'lin')!.affinity).toBe(before.contacts.find(contact => contact.id === 'lin')!.affinity + 1);
    expect(before.story.some(entry => entry.id === 'test-tagged-assistant')).toBe(false);
  });

  it('defaults omitted phone tags to [] and accepts a whole Markdown-fenced tagged reply', () => {
    const state = createInitialState();
    expect(parseGeneratedStory('```xml\n<story>窗外有风。</story>\n```', state)).toEqual({ text: '窗外有风。', phoneMessages: [] });
  });

  it('never silently accepts duplicated, incomplete or nested tags', () => {
    const state = createInitialState();
    for (const reply of [
      '<story>甲</story><story>乙</story>',
      '<story>甲</story><world_actions>[{"type":"rest","minutes":15,"kind":"wait"}]',
      '<story><phone_messages>[]</phone_messages>甲</story>',
      '<phone_messages>[]</phone_messages>',
    ]) expect(() => parseGeneratedStory(reply, state)).toThrow(/格式不正确/);
  });

  it('rejects unknown NPCs, arbitrary world patches, and invalid action JSON before committing any state', () => {
    const state = createInitialState();
    const before = JSON.stringify(state);
    for (const reply of [
      '<story>继续</story><phone_messages>[{"npcId":"not-a-contact","text":"伪造消息"}]</phone_messages>',
      '<story>继续</story><world_actions>[{"type":"activity","label":"改余额","minutes":1,"effects":{"balance":999999999}}]</world_actions>',
      '<story>继续</story><world_actions>not-json</world_actions>',
      '<story>继续</story><world_actions>[{"type":"admin_patch","data":{}}]</world_actions>',
    ]) expect(() => parseGeneratedStory(reply, state)).toThrow(/格式不正确|剧情行动无效/);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('independent narrative API', () => {
  it('persists non-secret settings only, with a session-only credential', () => {
    saveStoryApiSettings(custom);
    saveStoryApiKey('test-session-token');
    expect(loadStoryApiSettings()).toEqual(custom);
    expect(loadStoryApiKey()).toBe('test-session-token');
    expect(localStorage.getItem('unread-city:story-api:v1')).not.toContain('test-session-token');
    expect(normalizeStoryEndpoint('https://example.invalid/v1/', 'chat')).toBe('https://example.invalid/v1/chat/completions');
    expect(normalizeStoryEndpoint('https://example.invalid/v1', 'responses')).toBe('https://example.invalid/v1/responses');
    expect(() => normalizeStoryEndpoint('http://example.invalid/v1', 'chat')).toThrow(/HTTPS/);
    expect(() => normalizeStoryEndpoint('https://example.invalid/v1?api_key=secret', 'chat')).toThrow(/查询参数/);
  });

  it('sends a separate Chat Completion request and reads its content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      text: async () => JSON.stringify({ choices: [{ message: { content: '<story>一段新故事。</story><phone_messages>[]</phone_messages>' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    saveStoryApiKey('test-session-token');
    const reply = await requestStoryFromCustomApi(custom, '玩家本轮行动：看向窗外', '系统协议', new AbortController().signal);
    expect(reply).toContain('<story>');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.invalid/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-session-token');
    const request = JSON.parse(init.body);
    expect(request.model).toBe('test-narrator');
    expect(request.messages[0].content).toContain('系统协议');
    expect(request.messages[0].content).toContain('以现实主义描写校园场景。');
    expect(request.messages[1].content).toBe('玩家本轮行动：看向窗外');
  });

  it('supports Responses output_text and actual output blocks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers(),
      text: async () => JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: '<story>回应。</story>' }] }] }),
    }));
    const response = await requestStoryFromCustomApi({ ...custom, format: 'responses' }, '继续', '协议', new AbortController().signal);
    expect(response).toBe('<story>回应。</story>');
  });

  it('routes independently of Tavern mainApi and cancels only its own request', async () => {
    const context = {
      characterId: 0, groupId: null as string | null, chatId: 'chat-a', mainApi: 'kobold',
      characters: [{ avatar: 'unread-city.png' }],
      getCurrentChatId: () => context.chatId,
    };
    const listeners = new Set<() => void>();
    const api = {
      parent: { SillyTavern: { getContext: () => context } },
      tavern_events: { CHAT_CHANGED: 'chat_changed' },
      getVariables: vi.fn(() => ({})), replaceVariables: vi.fn(),
      eventOn: vi.fn((_key: string, callback: () => void) => { listeners.add(callback); }),
      eventRemoveListener: vi.fn((_key: string, callback: () => void) => { listeners.delete(callback); }),
      generate: vi.fn(async () => ''), stopGenerationById: vi.fn(() => true),
    };
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    saveStoryApiSettings(custom);
    const bridge = createTavernBridge(api as unknown as Window)!;
    const state = createInitialState();
    const pending = bridge.generate('查看衣柜', state);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    bridge.cancel();
    await expect(pending).rejects.toThrow(/取消/);
    expect(signal?.aborted).toBe(true);
    expect(api.generate).not.toHaveBeenCalled();
    expect(api.stopGenerationById).not.toHaveBeenCalled();
    expect(api.replaceVariables).not.toHaveBeenCalled();
    bridge.dispose();
  });
});
