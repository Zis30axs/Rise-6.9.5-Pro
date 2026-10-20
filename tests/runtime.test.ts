import { describe, expect, it, vi } from 'vitest';
import { acknowledgePhoneRead, commitStoryTurn, createInitialState, getRouteOutlook, parseState, reduceState, STATE_LIMITS } from '../src/runtime/model';
import { createTavernBridge } from '../src/runtime/bridge';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import { saveStoryApiSettings, saveStoryApiKey } from '../src/runtime/story-api';
import type { WorldAction } from '../src/frontend/types';
import { getScenePeople } from '../src/runtime/scene-context';
import { withAcademicSelection } from './legacy-state';

describe('deterministic prototype state', () => {
  it('validates nested data and refuses damaged or unsupported saves', () => {
    const original = createInitialState();
    expect(parseState(original)).toEqual(original);
    expect(parseState(original)).not.toBe(original);
    const damaged: unknown[] = [
      null, {}, { ...original, schema_version: '2.0.0' },
      { ...original, clock: { day: 1, hour: 24, minute: 0 } },
      { ...original, player: { ...original.player, energy: NaN, balance: 1 } },
      { ...original, player: { ...original.player, energy: 100, balance: -1 } },
      { ...original, phone: [{ ...original.phone[0], read: 'false' }] },
      { ...original, phone: [{ ...original.phone[0], npcId: 'missing' }] },
      { ...original, contacts: [original.contacts[0], original.contacts[0]] },
      { ...original, schedule: [{ ...original.schedule[0], time: '99:99' }] },
      { ...original, journal: 'not an array' },
      { ...original, story: [{ id: 'x', role: 'system', text: 'injected' }] },
      { ...original, unexpected: 'do not merge me' },
    ];
    for (const value of damaged) expect(() => parseState(value)).toThrow(/存档格式无效/);
    expect(() => parseState(JSON.parse(JSON.stringify(original).replace('"schema_version":', '"__proto__":{},"schema_version":')))).toThrow(/存档格式无效/);
  });

  it('moves to a known place with an exact cost and leaves the input untouched', () => {
    const before = createInitialState();
    const after = reduceState(before, { type: 'travel', locationId: 'library' });
    expect(after.clock).toEqual({ day: 1, hour: 17, minute: 35 });
    expect(after.player.energy).toBe(75);
    expect(after.locationId).toBe('library');
    expect(before.locationId).toBe('gate');
    expect(before.player.energy).toBe(80);
    expect(reduceState(after, { type: 'travel', locationId: 'library' })).toEqual(after);
    expect(() => reduceState(before, { type: 'travel', locationId: 'unknown' })).toThrow(/不存在/);
    expect(() => reduceState({ ...before, player: { ...before.player, energy: 4, balance: 0 } }, { type: 'travel', locationId: 'library' })).toThrow(/精力不足/);
  });

  it('keeps route previews stable across repeated openings and save restoration', () => {
    const before = createInitialState();
    const snapshot = JSON.stringify(before);
    const preview = getRouteOutlook(before, 'cafe');
    for (let opening = 0; opening < 5; opening++) expect(getRouteOutlook(before, 'cafe')).toEqual(preview);
    expect(getRouteOutlook(parseState(JSON.parse(snapshot)), 'cafe')).toEqual(preview);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(getRouteOutlook(before, 'gate')).toEqual({ extraMinutes: 0, event: null });
    expect(getRouteOutlook(before, 'library')).toEqual({ extraMinutes: 0, event: null });
    const arrived = reduceState(before, { type: 'travel', locationId: 'library' });
    expect(getRouteOutlook(arrived, 'gate')).toEqual({ extraMinutes: 0, event: null });
    expect(reduceState(arrived, { type: 'travel', locationId: 'gate' }).clock).toEqual({ day: 1, hour: 17, minute: 50 });
  });

  it('applies traffic and special route costs exactly as previewed, without extra state effects', () => {
    const found = new Set<string>();
    const absoluteMinutes = (clock: { day: number; hour: number; minute: number }) => clock.day * 1440 + clock.hour * 60 + clock.minute;
    for (let seed = 0; seed < 240 && found.size < 2; seed++) {
      const before = createInitialState();
      before.clock = { day: 2 + Math.floor(seed / 60), hour: 23, minute: seed % 60 };
      const outlook = getRouteOutlook(before, 'cafe');
      if (!outlook.event || found.has(outlook.event.kind)) continue;
      found.add(outlook.event.kind);
      const snapshot = JSON.stringify(before);
      // Extra UI fields cannot set travel time; the reducer computes its own outlook.
      const action = { type: 'travel' as const, locationId: 'cafe', extraMinutes: 999, minutes: 999 };
      const after = reduceState(before, action);
      expect(absoluteMinutes(after.clock) - absoluteMinutes(before.clock)).toBe(15 + outlook.extraMinutes);
      expect(after.player).toEqual({ ...before.player, energy: before.player.energy - 5, foodEnergy: before.player.foodEnergy - (15 + outlook.extraMinutes) * 2, satiety: before.player.satiety - (Math.floor(absoluteMinutes(after.clock) / 15) - Math.floor(absoluteMinutes(before.clock) / 15)) });
      expect(after.locationId).toBe('cafe');
      expect(after.journal).toHaveLength(before.journal.length + 1);
      expect(after.journal.at(-1)?.text).toContain(outlook.event.title);
      expect(after.journal.at(-1)?.text).toContain(`耗时 ${15 + outlook.extraMinutes} 分钟`);
      expect(after.journal.at(-1)?.text).toContain(`额外停留 ${outlook.extraMinutes} 分钟`);
      expect(after.contacts).toEqual(before.contacts);
      expect(after.phone).toEqual(before.phone);
      expect(after.schedule).toEqual(before.schedule);
      expect(after.story).toEqual(before.story);
      expect(JSON.stringify(before)).toBe(snapshot);
      if (outlook.event.kind === 'traffic') expect([10, 15]).toContain(outlook.extraMinutes);
      else expect(outlook.extraMinutes).toBe(5);
    }
    expect(found).toEqual(new Set(['traffic', 'special']));
  });

  it('rejects invalid routes and exhausted travel before applying any route event', () => {
    const before = createInitialState();
    before.player.energy = 4;
    const snapshot = JSON.stringify(before);
    expect(() => reduceState(before, { type: 'travel', locationId: 'missing' })).toThrow(/不存在/);
    expect(() => reduceState(before, { type: 'travel', locationId: 'cafe' })).toThrow(/精力不足/);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(reduceState(before, { type: 'travel', locationId: 'gate' })).toEqual(before);
    expect(getRouteOutlook(before, 'missing')).toEqual({ extraMinutes: 0, event: null });
  });

  it('rolls over midnight and validates wait minutes without mutating failed actions', () => {
    const before = createInitialState();
    before.clock = { day: 9, hour: 23, minute: 50 };
    const after = reduceState(before, { type: 'wait', minutes: 30 });
    expect(after.clock).toEqual({ day: 10, hour: 0, minute: 20 });
    expect(after.player.energy).toBe(84);
    expect(before.clock).toEqual({ day: 9, hour: 23, minute: 50 });
    for (const minutes of [0, -1, 121, 1.5, NaN, Infinity, '30']) {
      expect(() => reduceState(before, { type: 'wait', minutes } as WorldAction)).toThrow(/整数分钟/);
    }
    expect(() => reduceState(before, { type: 'arbitrary' } as unknown as WorldAction)).toThrow(/不支持/);
  });

  it('marks a phone message once and enforces schedule location and time', () => {
    const initial = createInitialState();
    const read = reduceState(initial, { type: 'read_phone', id: 'phone-lin' });
    expect(read.phone[0].read).toBe(true);
    expect(initial.phone[0].read).toBe(false);
    expect(reduceState(read, { type: 'read_phone', id: 'phone-lin' })).toEqual(read);
    expect(() => reduceState(initial, { type: 'complete_schedule', id: 'library-notes' })).toThrow(/地点/);
    const early = { ...initial, locationId: 'library' };
    expect(() => reduceState(early, { type: 'complete_schedule', id: 'library-notes' })).toThrow(/时间/);
    const arrived = reduceState(initial, { type: 'travel', locationId: 'library' });
    const complete = reduceState(arrived, { type: 'complete_schedule', id: 'library-notes' });
    expect(complete.schedule[0].done).toBe(true);
    expect(complete.player).toEqual(arrived.player);
    expect(reduceState(complete, { type: 'complete_schedule', id: 'library-notes' })).toEqual(complete);
  });

  it('bounds journal growth and rejects oversized story rather than truncating saves', () => {
    let state = createInitialState();
    for (let i = 0; i < 130; i++) state = reduceState(state, { type: 'wait', minutes: 1 });
    expect(state.journal).toHaveLength(STATE_LIMITS.journal);
    expect(new Set(state.journal.map(item => item.id)).size).toBe(STATE_LIMITS.journal);
    expect(parseState(state)).toEqual(state);
    expect(() => parseState({ ...state, story: Array.from({ length: STATE_LIMITS.story + 1 }, (_, i) => ({ id: `s-${i}`, role: 'user', text: 'a' })) })).toThrow(/story/);
  });
});

describe('validated story and phone transaction', () => {
  const envelope = (story = '手机亮起，林同学发来了一条新消息。') => JSON.stringify({ story, phone_messages: [{ npcId: 'lin', text: '我还在图书馆。' }] });
  const ids = { userId: 'turn-1-user', assistantId: 'turn-1-assistant' };

  it('accepts legacy JSON or tagged stories while rejecting unstructured prose', () => {
    const state = createInitialState();
    const expected = { text: '手机亮起，林同学发来了一条新消息。', phoneMessages: [{ npcId: 'lin', text: '我还在图书馆。' }] };
    expect(parseGeneratedStory(envelope(), state)).toEqual(expected);
    expect(parseGeneratedStory(['', '```json', envelope(), '```', ''].join('\n'), state)).toEqual(expected);
    const tagged = [
      '<story>', '手机亮起，林同学发来了一条新消息。', '</story>',
      '<phone_messages>[{"npcId":"lin","text":"我还在图书馆。"}]</phone_messages>',
    ].join('\n');
    expect(parseGeneratedStory(tagged, state)).toEqual(expected);
    expect(parseGeneratedStory('无关的前置说明\n' + tagged + '\n无关的后置说明', state)).toEqual(expected);
    expect(parseGeneratedStory('<story>风把纸页翻了个角。</story>', state)).toEqual({ text: '风把纸页翻了个角。', phoneMessages: [] });
    expect(() => parseGeneratedStory('林同学发来一条消息：“我还在图书馆。”', state)).toThrow(/JSON|标签块/);
    expect(() => parseGeneratedStory('说明\n' + envelope(), state)).toThrow(/JSON|标签块/);
    expect(() => parseGeneratedStory('```json\n' + envelope() + '\n```\n补充说明', state)).toThrow(/JSON|标签块/);
    for (const bad of [
      '<story>故事</story><story>重复</story>',
      '<story>故事</story><phone_messages>[]</phone_messages><phone_messages>[]</phone_messages>',
      '<story>故事</story><world_actions>[{not-json}]</world_actions>',
      '<story>故事<phone_messages>[]</phone_messages>',
      '<story>故事</story><world_actions>[{"type":"travel","locationId":"unknown"}]</world_actions>',
      '<story>故事</story><phone_messages>[{"npcId":"unknown","text":"假消息"}]</phone_messages>',
    ]) expect(() => parseGeneratedStory(bad, state)).toThrow(/格式不正确|剧情行动无效/);
  });

  it('reconstructs a strict allowlist and refuses unknown NPCs, arbitrary fields and unbounded payloads', () => {
    const state = createInitialState();
    const invalid = [
      {}, { story: '正文', phone_messages: [], player: { balance: 100000 } },
      { story: '正文', phone_messages: [], player: { energy: 100 } },
      { story: '正文', phone_messages: [], clock: { day: 2, hour: 8, minute: 0 } },
      { story: '正文', phone_messages: [{ npcId: 'missing', text: '消息' }] },
      { story: '正文', phone_messages: [{ npcId: 'lin', text: '消息', read: true }] },
      { story: '正文', phone_messages: [{ npcId: 'lin', text: '消息', id: 'forged' }] },
      { story: '正文', phone_messages: [{ npcId: 'lin', text: '消息', at: '昨天' }] },
      { story: '正文', phone_messages: [{ npcId: 'lin', text: '文'.repeat(STATE_LIMITS.messageText + 1) }] },
      { story: '正文', phone_messages: Array.from({ length: 9 }, () => ({ npcId: 'lin', text: '消息' })) },
      { story: '文'.repeat(STATE_LIMITS.storyText + 1), phone_messages: [] },
      { story: ' ', phone_messages: [] }, { story: '正文', phone_messages: null },
      { story: '正文', phone_messages: [{ npcId: 'lin', text: '\u0000' }] },
    ];
    for (const item of invalid) expect(() => parseGeneratedStory(JSON.stringify(item), state)).toThrow(/均未写入/);
    expect(() => parseGeneratedStory('{"story":"正文","phone_messages":[],"__proto__":{"polluted":true}}', state)).toThrow(/均未写入/);
    expect(() => parseGeneratedStory(' '.repeat(STATE_LIMITS.protocolText + 1), state)).toThrow(/过长/);
    expect(parseGeneratedStory(JSON.stringify({ story: '无人发来消息。', phone_messages: [] }), state).phoneMessages).toEqual([]);
  });

  it('parses JSON longer than the old prose limit without cutting off phone events', () => {
    const state = createInitialState();
    const response = JSON.stringify({ story: '文'.repeat(STATE_LIMITS.storyText), phone_messages: Array.from({ length: 8 }, () => ({ npcId: 'lin', text: '信'.repeat(STATE_LIMITS.messageText) })) });
    expect(response.length).toBeGreaterThan(STATE_LIMITS.storyText);
    const parsed = parseGeneratedStory(response, state);
    expect(parsed.text).toHaveLength(STATE_LIMITS.storyText);
    expect(parsed.phoneMessages).toHaveLength(8);
    expect(parsed.phoneMessages[7].text).toHaveLength(STATE_LIMITS.messageText);
  });

  it('commits story and stable incoming IDs together while preserving old 1.0 saves and existing receipts', () => {
    const before = createInitialState();
    before.phone[0].text = '【演示消息】旧版 1.0 存档。';
    const oldSave = JSON.stringify(before);
    expect(JSON.stringify(parseState(JSON.parse(oldSave)))).toBe(oldSave);
    const latest = acknowledgePhoneRead(before, ['phone-lin']);
    const reply = parseGeneratedStory(envelope(), before);
    const after = commitStoryTurn(latest, ' 等消息 ', reply, ids);
    expect(after.schema_version).toBe('1.11.0');
    expect(after.phone[0].read).toBe(true);
    expect(after.phone.at(-1)).toEqual({ id: 'turn-1-assistant:phone:0', npcId: 'lin', text: '我还在图书馆。', read: false, at: '第 1 天 17:20' });
    expect(after.story.slice(-2)).toEqual([{ id: ids.userId, role: 'user', text: '等消息' }, { id: ids.assistantId, role: 'assistant', text: reply.text }]);
    expect(JSON.stringify(before)).toBe(oldSave);
    expect(after.clock).toEqual(before.clock);
    expect(after.player).toEqual(before.player);
    expect(commitStoryTurn(after, '等消息', reply, ids)).toEqual(after);
    const read = acknowledgePhoneRead(after, ['turn-1-assistant:phone:0']);
    expect(commitStoryTurn(read, '等消息', reply, ids)).toEqual(read);
  });

  it('leaves both story and phone unchanged on invalid events or ID collisions', () => {
    const before = createInitialState();
    const snapshot = JSON.stringify(before);
    const reply = parseGeneratedStory(envelope(), before);
    expect(() => commitStoryTurn(before, '行动', { text: '正文', phoneMessages: [{ npcId: 'missing', text: '消息' }] }, ids)).toThrow(/联系人/);
    expect(() => commitStoryTurn(before, '行动', reply, { userId: 'same', assistantId: 'same' })).toThrow(/ID 无效/);
    expect(() => commitStoryTurn(before, '行动', reply, { userId: 'opening', assistantId: 'new' })).toThrow(/ID 冲突/);
    expect(() => commitStoryTurn(before, '行动', reply, { userId: 'valid', assistantId: 'a'.repeat(101) })).toThrow(/ID 无效/);
    const after = commitStoryTurn(before, '行动', reply, ids);
    expect(() => commitStoryTurn(after, '行动', { ...reply, phoneMessages: [] }, ids)).toThrow(/ID 冲突/);
    expect(() => commitStoryTurn(after, '不同输入', reply, ids)).toThrow(/ID 冲突/);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('trims only the oldest already-read queue items and rejects a full unread queue atomically', () => {
    const before = createInitialState();
    before.phone = Array.from({ length: STATE_LIMITS.phone }, (_, index) => ({ id: `old-${index}`, npcId: 'lin', text: `消息 ${index}`, read: index === 0 || index === 5, at: '第 1 天 17:00' }));
    const reply = parseGeneratedStory(envelope(), before);
    const after = commitStoryTurn(before, '看手机', reply, ids);
    expect(after.phone).toHaveLength(STATE_LIMITS.phone);
    expect(after.phone.some(message => message.id === 'old-0')).toBe(false);
    expect(after.phone.some(message => message.id === 'old-5')).toBe(true);
    expect(after.phone.filter(message => !message.read)).toHaveLength(199);
    const full = { ...before, phone: before.phone.map(message => ({ ...message, read: false })) };
    const snapshot = JSON.stringify(full);
    expect(() => commitStoryTurn(full, '看手机', reply, ids)).toThrow(/先阅读/);
    expect(JSON.stringify(full)).toBe(snapshot);
    expect(commitStoryTurn(full, '看风景', { text: '风吹过树叶。', phoneMessages: [] }, ids).phone).toEqual(full.phone);
  });

  it('applies only known receipts once without advancing time or inventing messages', () => {
    const before = createInitialState();
    const after = acknowledgePhoneRead(before, ['phone-lin', 'phone-lin', 'unknown-chat-message']);
    expect(after.phone.map(message => message.read)).toEqual([true, false]);
    expect(before.phone.map(message => message.read)).toEqual([false, false]);
    expect(acknowledgePhoneRead(after, ['phone-lin'])).toEqual(after);
    expect(after.journal).toEqual(before.journal);
    expect(after.clock).toEqual(before.clock);
    expect(() => acknowledgePhoneRead(before, Array.from({ length: STATE_LIMITS.phone + 1 }, () => 'x'))).toThrow(/回执无效/);
  });
});

function mockHost() {
  const context = {
    characterId: 0, groupId: null as string | null, chatId: 'chat-a',
    characters: [{ avatar: 'unread-city.png' }, { avatar: 'another.png' }], mainApi: 'openai',
    getCurrentChatId: () => context.chatId,
  };
  const storage = new Map<string, Record<string, unknown>>();
  const listeners = new Set<() => void>();
  const key = () => JSON.stringify([context.characters[context.characterId].avatar, context.chatId]);
  const api = {
    parent: { SillyTavern: { getContext: () => context } },
    tavern_events: { CHAT_CHANGED: 'chat_id_changed' },
    getVariables: vi.fn((_option: { type: 'chat' }) => storage.get(key()) ?? {}),
    replaceVariables: vi.fn((variables: Record<string, unknown>, _option: { type: 'chat' }) => { storage.set(key(), variables); }),
    eventOn: vi.fn((_event: string, callback: () => void) => { listeners.add(callback); }),
    eventRemoveListener: vi.fn((_event: string, callback: () => void) => { listeners.delete(callback); }),
    generate: vi.fn(async (_config: Record<string, unknown>) => JSON.stringify({ story: '一段场景叙事。', phone_messages: [] }) as unknown),
    stopGenerationById: vi.fn((_id: string) => true),
  };
  const switchChat = (chatId: string) => { context.chatId = chatId; for (const listener of [...listeners]) listener(); };
  return { context, storage, listeners, key, api, switchChat, window: api as unknown as Window };
}

describe('chat-owned Tavern-Helper bridge', () => {
  it('runs independent card generation without calling the host Tavern model', async () => {
    const mock = mockHost();
    const settings = { mode: 'custom' as const, format: 'chat' as const, endpoint: 'https://models.example/v1',
      model: 'scene-only', preset: '侧重细节' };
    saveStoryApiSettings(settings);
    saveStoryApiKey('only-in-tab');
    mock.context.mainApi = 'legacy-non-chat-mode';
    const fetchMock = vi.fn(async () => ({
      ok: true, status: 200, headers: { get: () => null },
      text: async () => JSON.stringify({ choices: [{ message: { content: '<story>独立剧情。</story><phone_messages>[]</phone_messages>' } }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const bridge = createTavernBridge(mock.window)!;
    try {
      const reply = await bridge.generate('继续观察', createInitialState());
      expect(reply.text).toBe('独立剧情。');
      expect(mock.api.generate).not.toHaveBeenCalled();
      expect(mock.api.replaceVariables).not.toHaveBeenCalled();
      const args = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
      expect(args.messages[0].content).toContain('world_actions');
      expect(args.messages[0].content).toContain('侧重细节');
      expect(args.messages[1].content).toContain('继续观察');
    } finally {
      bridge.dispose();
      vi.unstubAllGlobals();
      saveStoryApiKey('');
      localStorage.removeItem('unread-city:story-api:v1');
    }
  });
  it('cancels only independent requests when its chat changes', async () => {
    const mock = mockHost();
    saveStoryApiSettings({ mode: 'custom', format: 'chat', endpoint: 'https://models.example/v1',
      model: 'scene-only', preset: '' });
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const bridge = createTavernBridge(mock.window)!;
    try {
      const inFlight = bridge.generate('继续观察', createInitialState());
      mock.switchChat('chat-b');
      await expect(inFlight).rejects.toThrow(/取消|聊天/);
      expect(mock.api.stopGenerationById).not.toHaveBeenCalled();
      expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    } finally {
      bridge.dispose();
      vi.unstubAllGlobals();
      localStorage.removeItem('unread-city:story-api:v1');
    }
  });

  it('requests a consented event against the prepared interaction without promoting its data into system instructions', async () => {
    const mock = mockHost(); const bridge = createTavernBridge(mock.window)!;
    const state = reduceState(reduceState(createInitialState(), { type: 'novel_travel', locationId: 'cafe' }), { type: 'location_service', serviceId: 'drink-coffee' });
    const before = JSON.stringify(state);
    const world_actions = [{ type: 'relationship', npcId: 'lin', delta: 2, reason: '帮忙找回遗落的笔记' }];
    mock.api.generate.mockResolvedValue(JSON.stringify({ story: '在露台捡到林同学落下的笔记，物归原主。', phone_messages: [], world_actions }));
    const reply = await bridge.generate('继续探索异常。', state, { kind: 'interaction_event', interaction: { label: 'DATA_ONLY_EVENT_MARKER', action: { type: 'location_service', serviceId: 'drink-coffee' } } });
    expect(reply.worldActions).toEqual(world_actions);
    const config = mock.api.generate.mock.calls.at(-1)![0];
    const context = JSON.parse((config.user_input as string).split('\n')[1]!);
    expect(context.preparedInteraction).toEqual({ label: 'DATA_ONLY_EVENT_MARKER', action: { type: 'location_service', serviceId: 'drink-coffee' } });
    expect(context.clock).toEqual(state.clock); expect(context.player.balance).toBe(state.player.balance);
    const protocol = (config.injects as { content: string }[])[0].content;
    expect(protocol).toContain('不要再次购买、食用、旅行、睡眠、学习');
    expect(protocol).toContain('必须包含至少一项有实际效果');
    expect(protocol).not.toContain('DATA_ONLY_EVENT_MARKER');
    expect(JSON.stringify(state)).toBe(before); expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    bridge.dispose();
  });
  it('requires event effects only for consented events and keeps ordinary conversation compatible', async () => {
    const mock = mockHost(); const bridge = createTavernBridge(mock.window)!;
    const state = createInitialState();
    await expect(bridge.generate('继续探索异常。', state, { kind: 'interaction_event', interaction: { label: '休息', action: { type: 'wait', minutes: 15 } } })).rejects.toThrow(/缺少实际影响/);
    await expect(bridge.generate('看看周围。', state)).resolves.toMatchObject({ phoneMessages: [] });
    expect(mock.api.replaceVariables).not.toHaveBeenCalled(); bridge.dispose();
  });
  it('provides actionable catalogs and accepts ordered natural-language actions without modifying the snapshot', async () => {
    const mock = mockHost(); const bridge = createTavernBridge(mock.window)!;
    const state = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'dorm' });
    const before = JSON.stringify(state);
    const actions = [{ type: 'travel', locationId: 'dorm-room' }, { type: 'rest', kind: 'sleep', minutes: 600 }];
    mock.api.generate.mockResolvedValue(JSON.stringify({ story: '回到宿舍，十小时后醒来。', phone_messages: [], world_actions: actions }));
    const reply = await bridge.generate('回宿舍睡10小时', state);
    expect(reply.worldActions).toEqual(actions);
    const summary = JSON.parse((mock.api.generate.mock.calls.at(-1)![0].user_input as string).split('\n')[1]!);
    expect(summary.actionCatalog.destinations).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'dorm-room' }), expect.objectContaining({ id: 'convenience' })]));
    expect(summary.actionCatalog.adjacentLocations[0]).toMatchObject({ id: 'dorm-room', kind: 'enter' });
    expect(summary.actionCatalog.storeItems.length).toBeGreaterThan(0);
    expect(summary.actionCatalog.services).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'drink-coffee', locationIds: ['cafe', 'street-cafe'] })]));
    expect(summary.actionCatalog.services.find((service: { id: string }) => service.id === 'drink-coffee').takeawayItem.id).toBe('takeaway-drink-coffee');
    expect(summary.actionCatalog.packagingFeePerItem).toBe(2);
    expect(summary.actionCatalog.subjects).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'cs-programming' })]));
    expect(summary.schedule).toEqual(state.schedule);
    expect(JSON.stringify(state)).toBe(before);
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    bridge.dispose();
  });
  it('checks sky events against the scene after requested travel without speculative execution', async () => {
    const mock = mockHost(); const bridge = createTavernBridge(mock.window)!;
    const state = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'dorm-room' });
    mock.api.generate.mockResolvedValue(JSON.stringify({ story: '走出宿舍，看见高空客机。', phone_messages: [], world_actions: [{ type: 'travel', locationId: 'dorm' }], world_events: [{ type: 'airliner_pass' }] }));
    const reply = await bridge.generate('走出去看天空', state);
    const next = commitStoryTurn(state, '走出去看天空', reply, { userId: 'leave-user', assistantId: 'leave-assistant' });
    expect(next.interior).toBeNull(); expect(next.airTraffic.sequence).toBe(1);
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    bridge.dispose();
  });
  it('passes only saved academic choices and committed gains to narrative generation without awarding progress', async () => {
    const mock = mockHost(); const bridge = createTavernBridge(mock.window)!;
    const initial = createInitialState();
    await bridge.generate('我想学习', initial);
    let config = mock.api.generate.mock.calls.at(-1)![0];
    expect(JSON.parse((config.user_input as string).split('\n')[1]!).academics).toBeNull();
    const selected = withAcademicSelection(initial);
    await bridge.generate('看看学习目标', selected);
    config = mock.api.generate.mock.calls.at(-1)![0];
    expect(JSON.parse((config.user_input as string).split('\n')[1]!).academics).toMatchObject({ majorId: 'computer-science', major: '计算机', totalPoints: 0, subjects: [{ subjectId: 'cs-programming', subject: '程序设计', points: 0, goal: '理解变量、条件与循环' }, { subjectId: 'cs-algorithms', points: 0 }, { subjectId: 'cs-networks', points: 0 }], lastGain: null });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const desk = reduceState(reduceState(selected, { type: 'novel_travel', locationId: 'classroom' }), { type: 'novel_approach', interactionId: 'classroom-notes' });
    const studied = reduceState(desk, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' });
    const saved = JSON.stringify(studied);
    await bridge.generate('继续故事', studied);
    config = mock.api.generate.mock.calls.at(-1)![0];
    expect(JSON.parse((config.user_input as string).split('\n')[1]!).academics).toMatchObject({ totalPoints: 15, subjects: [{ subjectId: 'cs-programming', points: 15, remaining: 105 }, { subjectId: 'cs-algorithms', points: 0 }, { subjectId: 'cs-networks', points: 0 }], lastGain: { points: 15, totalPoints: 15, outcome: 'normal', channel: 'classroom', interactionId: 'classroom-notes' } });
    expect(JSON.parse((config.user_input as string).split('\n')[1]!).academics.timetable).toHaveLength(6);
    expect((config.injects as { content: string }[])[0].content).toContain('不重复奖励');
    expect((config.injects as { content: string }[])[0].content).toContain('各有独立学习点');
    expect((config.injects as { content: string }[])[0].content).toContain('不重抽');
    expect(JSON.stringify(studied)).toBe(saved); expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    random.mockRestore(); bridge.dispose();
  });
  it('provides actual cafe hours and local services even at midnight without sending every intent to the convenience store', async () => {
    const mock = mockHost(); const bridge = createTavernBridge(mock.window)!;
    const state = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'cafe' });
    state.clock = { day: 2, hour: 0, minute: 20 };
    const before = JSON.stringify(state);
    await bridge.generate('喝杯咖啡吧', state);
    let config = mock.api.generate.mock.calls.at(-1)![0];
    let summary = JSON.parse((config.user_input as string).split('\n')[1]!);
    expect(summary.venue).toMatchObject({ locationId: 'cafe', isOpen: false, hoursLabel: '08:00–22:00', minutesUntilOpen: 460 });
    expect(summary.locationServices).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'drink-coffee', available: false, blockedReason: expect.any(String) })]));
    expect(summary.scene.outdoors).toBe(true);
    expect(summary.serviceAlternatives).toEqual(expect.arrayContaining([expect.objectContaining({ locationId: 'street-cafe', isOpen: true })]));
    const instructions = (config.injects as { content: string }[])[0].content;
    expect(instructions).not.toContain('购买仅通过便利店');
    expect(instructions).toContain('此地服务');
    expect(instructions).toContain('营业时间');
    expect(JSON.stringify(state)).toBe(before);
    state.clock = { day: 2, hour: 10, minute: 0 };
    await bridge.generate('喝杯咖啡吧', state);
    config = mock.api.generate.mock.calls.at(-1)![0];
    summary = JSON.parse((config.user_input as string).split('\n')[1]!);
    expect(summary.venue.isOpen).toBe(true);
    expect(summary.locationServices).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'drink-coffee', available: true, blockedReason: null })]));
    bridge.dispose();
  });

  it('exposes inventory, store and needs as settled facts without buying or spending during generation', async () => {
    const mock = mockHost(); const bridge = createTavernBridge(mock.window)!;
    const state = reduceState({ ...createInitialState(), locationId: 'convenience' }, { type: 'buy_item', itemId: 'cigarette-standard', quantity: 1 });
    const before = JSON.stringify(state);
    await bridge.generate('看看货架', state);
    const config = mock.api.generate.mock.calls.at(-1)![0];
    const summary = JSON.parse((config.user_input as string).split('\n')[1]!);
    expect(summary.player).toMatchObject({ balance: 278, health: 90, stress: 25, satiety: 70, foodEnergy: 1200 });
    expect(summary.inventory).toEqual([expect.objectContaining({ itemId: 'cigarette-standard', name: '夜渡香烟', brand: '夜渡', quantity: 20, unit: '支' })]);
    expect(summary.store.available).toBe(true); expect(summary.store.items).toHaveLength(12);
    expect(JSON.stringify(state)).toBe(before);
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    bridge.dispose();
  });
  it('includes current and historical air traffic, permits occasional passes, and refuses cooldown violations', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
    const mock = mockHost();
    const bridge = createTavernBridge(mock.window)!;
    try {
      const state = createInitialState();
      mock.api.generate.mockResolvedValue(JSON.stringify({ story: '一架远处的客机在高空经过。', phone_messages: [], world_events: [{ type: 'airliner_pass' }] }));
      const reply = await bridge.generate('看看天空', state);
      expect(reply.worldEvents).toEqual([{ type: 'airliner_pass' }]);
      let config = mock.api.generate.mock.calls.at(-1)![0];
      let summary = JSON.parse((config.user_input as string).split('\n')[1]!) as Record<string, unknown>;
      expect(summary.airTraffic).toMatchObject({ count: 0, active: null, lastFlight: null, canTriggerPass: true });
      expect((config.injects as { content: string }[])[0].content).toContain('本轮空中事件未在冷却');
      const active = commitStoryTurn(state, '看看天空', reply, { userId: 'sky-user', assistantId: 'sky-assistant' });
      await expect(bridge.generate('继续看', active)).rejects.toThrow(/冷却.*均未写入/);
      config = mock.api.generate.mock.calls.at(-1)![0];
      summary = JSON.parse((config.user_input as string).split('\n')[1]!) as Record<string, unknown>;
      expect(summary.airTraffic).toMatchObject({ count: 1, active: { id: 'sky-assistant:airliner', kind: 'airliner', altitude: '高空' }, canTriggerPass: false, cooldownSeconds: 180 });
      expect((config.injects as { content: string }[])[0].content).toContain('禁止提出 airliner_pass');
      mock.api.generate.mockResolvedValue(JSON.stringify({ story: '客机继续从远处的高空经过。', phone_messages: [], world_events: [] }));
      await expect(bridge.generate('继续看', active)).resolves.toMatchObject({ worldEvents: [] });
      clock.mockReturnValue(1_790_000_040_000);
      await bridge.generate('现在呢', active);
      config = mock.api.generate.mock.calls.at(-1)![0];
      summary = JSON.parse((config.user_input as string).split('\n')[1]!) as Record<string, unknown>;
      expect(summary.airTraffic).toMatchObject({ count: 1, active: null, lastFlight: { id: 'sky-assistant:airliner' }, canTriggerPass: false });
      expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    } finally {
      bridge.dispose();
      clock.mockRestore();
    }
  });

  it('requires all capabilities and a current solo chat', () => {
    expect(createTavernBridge({} as Window)).toBeNull();
    const mock = mockHost();
    mock.context.groupId = 'group';
    expect(createTavernBridge(mock.window)).toBeNull();
    mock.context.groupId = null;
    mock.context.chatId = '';
    expect(createTavernBridge(mock.window)).toBeNull();
  });

  it('keeps saves isolated by avatar/chat and preserves unrelated variables', () => {
    const mock = mockHost();
    mock.storage.set(mock.key(), { other_extension: { safe: true } });
    const bridgeA = createTavernBridge(mock.window)!;
    const a = reduceState(bridgeA.load(), { type: 'travel', locationId: 'library' });
    bridgeA.save(a);
    expect(mock.api.replaceVariables).toHaveBeenLastCalledWith(expect.objectContaining({ other_extension: { safe: true } }), { type: 'chat' });
    a.player.energy = 0;
    expect(bridgeA.load().player.energy).toBe(75);
    const keyA = mock.key();
    mock.switchChat('chat-b');
    expect(() => bridgeA.save(createInitialState())).toThrow(/聊天已切换/);
    const bridgeB = createTavernBridge(mock.window)!;
    expect(bridgeB.load().locationId).toBe('gate');
    bridgeB.save(reduceState(bridgeB.load(), { type: 'travel', locationId: 'cafe' }));
    expect((mock.storage.get(keyA)?.unread_city as { locationId: string }).locationId).toBe('library');
    mock.context.characterId = 1;
    expect(() => bridgeB.save(createInitialState())).toThrow(/聊天已切换/);
    const bridgeC = createTavernBridge(mock.window)!;
    expect(bridgeC.load().locationId).toBe('gate');
    mock.context.characterId = 0; mock.context.chatId = 'chat-a';
    // Returning to the old key must not revive an instance retired by CHAT_CHANGED.
    expect(() => bridgeA.save(createInitialState())).toThrow(/聊天已切换/);
    bridgeA.dispose(); bridgeB.dispose(); bridgeC.dispose();
  });

  it('preserves corrupted saves even when another component writes corruption after load', () => {
    const mock = mockHost();
    const bridge = createTavernBridge(mock.window)!;
    bridge.load();
    const corrupt = { schema_version: 'old', story: [] };
    mock.storage.set(mock.key(), { unread_city: corrupt, other: 7 });
    expect(() => bridge.load()).toThrow(/原存档已保留/);
    expect(() => bridge.save(createInitialState())).toThrow(/原存档已保留/);
    expect(mock.storage.get(mock.key())?.unread_city).toBe(corrupt);
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it('rechecks ownership after reading variables and immediately before replacement', () => {
    const mock = mockHost();
    const bridge = createTavernBridge(mock.window)!;
    mock.api.getVariables.mockImplementationOnce(() => {
      mock.context.chatId = 'chat-changed-during-read';
      return {};
    });
    expect(() => bridge.save(createInitialState())).toThrow(/聊天已切换/);
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it('drops late generation after chat change and stops only its own request', async () => {
    const mock = mockHost();
    let resolve!: (value: unknown) => void;
    mock.api.generate.mockImplementation(() => new Promise<unknown>(done => { resolve = done; }));
    const bridge = createTavernBridge(mock.window)!;
    const callback = vi.fn();
    const unsubscribe = bridge.onSessionChange(callback);
    const result = bridge.generate('看向公告栏', bridge.load());
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    const config = mock.api.generate.mock.calls[0][0];
    expect(config.generation_id).toMatch(/^unread-city:/);
    expect(config.user_input).toContain('看向公告栏');
    expect(config.max_chat_history).toBe(0);
    mock.switchChat('chat-b');
    resolve('这是旧聊天迟到的回复。');
    await rejected;
    expect(callback).toHaveBeenCalledOnce();
    expect(mock.api.stopGenerationById).toHaveBeenCalledExactlyOnceWith(config.generation_id);
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    unsubscribe(); bridge.dispose();
    expect(mock.listeners.size).toBe(0);
  });

  it('cancels even if transport settles late, permits a new request and removes its listener', async () => {
    const mock = mockHost();
    let resolve!: (value: unknown) => void;
    mock.api.generate.mockImplementationOnce(() => new Promise<unknown>(done => { resolve = done; }));
    const bridge = createTavernBridge(mock.window)!;
    const first = bridge.generate('等等', bridge.load());
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    bridge.cancel();
    await rejected;
    expect(await bridge.generate('/echo 普通文本，不执行命令', bridge.load())).toEqual({ text: '一段场景叙事。', phoneMessages: [] });
    resolve('取消请求的迟到文本');
    expect(mock.api.stopGenerationById).toHaveBeenCalledOnce();
    expect(mock.api.generate.mock.calls[1][0].generation_id).not.toBe(mock.api.generate.mock.calls[0][0].generation_id);
    const registered = mock.api.eventOn.mock.calls[0];
    bridge.dispose(); bridge.dispose();
    expect(mock.api.eventRemoveListener).toHaveBeenCalledExactlyOnceWith(...registered);
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    expect(bridge.session()).toBeNull();
    expect(() => bridge.save(createInitialState())).toThrow(/已关闭/);
  });

  it('detects a switched context before its CHAT_CHANGED event and avoids writing', async () => {
    const mock = mockHost();
    let resolve!: (value: unknown) => void;
    mock.api.generate.mockImplementation(() => new Promise<unknown>(done => { resolve = done; }));
    const bridge = createTavernBridge(mock.window)!;
    const result = bridge.generate('停在这里', bridge.load());
    mock.context.chatId = 'switched-without-event';
    resolve('旧状态不再有效');
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(() => bridge.save(createInitialState())).toThrow(/聊天已切换/);
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it('rejects oversized or invalid structured replies and fails clearly when Chat Completion is not selected', async () => {
    const mock = mockHost();
    mock.api.generate.mockResolvedValue(JSON.stringify({ story: '文'.repeat(8000), phone_messages: [] }));
    const bridge = createTavernBridge(mock.window)!;
    await expect(bridge.generate('行动', bridge.load())).rejects.toThrow(/均未写入/);
    mock.api.generate.mockResolvedValue(JSON.stringify({ story: '手机亮了。', phone_messages: [{ npcId: 'missing', text: '消息' }] }));
    await expect(bridge.generate('行动', bridge.load())).rejects.toThrow(/联系人/);
    mock.api.generate.mockResolvedValue('<legacy-scene>{"paragraphs":["旧世界书规定的格式"]}</legacy-scene>');
    await expect(bridge.generate('行动', bridge.load())).rejects.toThrow(/完整 JSON/);
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    mock.context.mainApi = 'textgenerationwebui';
    await expect(bridge.generate('行动', bridge.load())).rejects.toThrow(/Chat Completion/);
    bridge.dispose();
  });

  it('passes a request-local system protocol without promoting player or saved text or overriding the connection', async () => {
    const mock = mockHost();
    const bridge = createTavernBridge(mock.window)!;
    const state = bridge.load();
    state.story.push({ id: 'older-format', role: 'assistant', text: '<legacy-scene>HISTORY_ONLY_MARKER</legacy-scene>' });
    const input = 'PLAYER_ONLY_MARKER：我看向门口。';
    await bridge.generate(input, state);

    const config = mock.api.generate.mock.calls[0][0];
    expect(config.injects).toEqual([{
      role: 'system', position: 'in_chat', depth: 0, should_scan: false, content: expect.any(String),
    }]);
    const system = (config.injects as { content: string }[])[0].content;
    expect(system).toContain('必填 story 和 phone_messages，可选 world_events');
    expect(system).toContain('旧输出格式的要求不适用于本轮');
    expect(system).toContain('world_actions');
    expect(system).toContain('不再要求玩家先点按钮');
    expect(system).toContain('余额、背包数量');
    expect(system).toContain('购买不自动吃掉');
    expect(system).toContain('rest 的600分钟');
    expect(system).toContain('不受按钮的时长档位限制');
    expect(system).toContain('只是询问、假设、否定或回顾已有记录时不执行');
    expect(system).not.toContain('只由前端按钮');
    expect(system).toContain('赠送不增加玩家饱腹或精力');
    expect(system).toContain('不重复结算、不重抽时长');
    expect(system).toContain('|charac|emot|says|');
    expect(system).toContain('|素世|开心|今天天气真好|');
    expect(system).toContain('不改变外层标签协议');
    expect(system).toContain('表情与动画由前端白名单映射');
    expect(system).not.toContain('PLAYER_ONLY_MARKER');
    expect(system).not.toContain('HISTORY_ONLY_MARKER');
    expect(config.user_input).toContain(input);
    expect(config.user_input).toContain('<legacy-scene>HISTORY_ONLY_MARKER</legacy-scene>');
    expect(config).toMatchObject({ should_stream: false, should_silence: true, max_chat_history: 0 });
    expect(config).not.toHaveProperty('custom_api');
    expect(config).not.toHaveProperty('preset_name');
    expect(config).not.toHaveProperty('json_schema');
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it('includes NPC IDs and recent read receipts in generation context without assuming a message every turn', async () => {
    const mock = mockHost();
    const bridge = createTavernBridge(mock.window)!;
    const state = acknowledgePhoneRead(bridge.load(), ['phone-lin']);
    mock.api.generate.mockResolvedValue(JSON.stringify({ story: '林同学发来消息。', phone_messages: [{ npcId: 'lin', text: '图书馆见。' }] }));
    expect(await bridge.generate('看看手机', state)).toEqual({ text: '林同学发来消息。', phoneMessages: [{ npcId: 'lin', text: '图书馆见。' }] });
    const config = mock.api.generate.mock.calls[0][0];
    const prompt = config.user_input as string;
    expect((config.injects as { content: string }[])[0].content).toContain('没有新消息时返回空数组');
    expect(prompt).toContain('"recentPhone":');
    expect(prompt).toContain('"npcId":"lin"');
    expect(prompt).toContain('"read":true');
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it('sends the latest outdoor scene and chosen pedestrian to the model while keeping phone IDs strict', async () => {
    const mock = mockHost();
    const bridge = createTavernBridge(mock.window)!;
    let state = reduceState(bridge.load(), { type: 'walk', x: -22, z: 56.5, yaw: 0.6, seed: 'prompt-person' });
    const person = getScenePeople(state.scene!).find(person => Math.hypot(person.x + 22, person.z - 56.5) < 6)!;
    state = reduceState(state, { type: 'encounter', personId: person.id });
    state.story.push({ id: 'old-room', role: 'assistant', text: '旧故事：你坐在图书馆阅览室。' });
    await bridge.generate('我向眼前的人问好。', state);
    const config = mock.api.generate.mock.calls[0][0];
    const prompt = config.user_input as string;
    const summary = JSON.parse(prompt.split('\n')[1]!) as Record<string, unknown>;
    expect(summary.location).toBe('bookshop');
    expect(summary.scene).toMatchObject({ label: '街角书店', outdoors: true, position: { x: -22, z: 56.5 }, encounter: { id: person.id, name: person.name, identity: person.identity, tags: person.tags } });
    expect(prompt).toContain('尚未进入店内');
    expect(prompt).toContain('nearbyLandmarks');
    expect(prompt).toContain('nearbyPeople');
    const system = (config.injects as { content: string }[])[0].content;
    expect(system).toContain('覆盖旧正文中的地点');
    expect(system).toContain('不自动交换联系方式');
    expect(system).toContain('当面对话');
    mock.api.generate.mockResolvedValue(JSON.stringify({ story: `${person.name}向你点头。`, phone_messages: [{ npcId: person.id, text: '你好。' }] }));
    await expect(bridge.generate('继续交谈', state)).rejects.toThrow(/联系人/);
    expect(mock.api.replaceVariables).not.toHaveBeenCalled();
    bridge.dispose();
  });
});
