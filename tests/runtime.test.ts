import { describe, expect, it, vi } from 'vitest';
import { acknowledgePhoneRead, commitStoryTurn, createInitialState, getRouteOutlook, parseState, reduceState, STATE_LIMITS } from '../src/runtime/model';
import { createTavernBridge } from '../src/runtime/bridge';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import type { WorldAction } from '../src/frontend/types';
import { getScenePeople } from '../src/runtime/scene-context';

describe('deterministic prototype state', () => {
  it('validates nested data and refuses damaged or unsupported saves', () => {
    const original = createInitialState();
    expect(parseState(original)).toEqual(original);
    expect(parseState(original)).not.toBe(original);
    const damaged: unknown[] = [
      null, {}, { ...original, schema_version: '2.0.0' },
      { ...original, clock: { day: 1, hour: 24, minute: 0 } },
      { ...original, player: { energy: NaN, balance: 1 } },
      { ...original, player: { energy: 100, balance: -1 } },
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
    expect(() => reduceState({ ...before, player: { energy: 4, balance: 0 } }, { type: 'travel', locationId: 'library' })).toThrow(/精力不足/);
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
      expect(after.player).toEqual({ ...before.player, energy: before.player.energy - 5 });
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

  it('accepts a complete JSON envelope or whole fenced JSON, and rejects prose scraping', () => {
    const state = createInitialState();
    const expected = { text: '手机亮起，林同学发来了一条新消息。', phoneMessages: [{ npcId: 'lin', text: '我还在图书馆。' }] };
    expect(parseGeneratedStory(envelope(), state)).toEqual(expected);
    expect(parseGeneratedStory(['', '```json', envelope(), '```', ''].join('\n'), state)).toEqual(expected);
    expect(() => parseGeneratedStory('林同学发来一条消息：“我还在图书馆。”', state)).toThrow(/完整 JSON/);
    expect(() => parseGeneratedStory(`说明\n${envelope()}`, state)).toThrow(/完整 JSON/);
    expect(() => parseGeneratedStory(`\`\`\`json\n${envelope()}\n\`\`\`\n补充说明`, state)).toThrow(/完整 JSON/);
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
    expect(after.schema_version).toBe('1.6.0');
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
    expect(system).toContain('只由前端按钮的程序规则结算');
    expect(system).toContain('自由输入本身不推进游戏时间或改变精力');
    expect(system).toContain('不在正文中跳过时段、声称活动已经完成');
    expect(system).toContain('床铺选择休息时长、室内物件进行学习或整理、地图选择前往');
    expect(system).toContain('不重复结算、不重抽时长');
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
