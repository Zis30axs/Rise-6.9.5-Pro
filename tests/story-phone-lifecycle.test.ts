import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bridge, GeneratedStory, WorldState } from '../src/frontend/types';
import type { PhonePanelHost, PhoneRuntime } from '../src/frontend/phone-runtime';
import type { StoryPhoneHost, StoryPhoneSnapshot } from '../src/frontend/story-phone';
import { createInitialState, parseState } from '../src/runtime/model';

vi.mock('../src/frontend/App.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({
    props: ['actions'],
    setup: props => () => h('button', { onClick: props.actions.exit }, '退出'),
  }) };
});
import { mountShell, type ShellHandle } from '../src/frontend/lifecycle';

let handle: ShellHandle | undefined;
afterEach(() => {
  handle?.dispose(); handle = undefined;
  document.body.innerHTML = ''; document.body.style.cssText = '';
  delete (window as Window & { STiPhonieStoryHost?: StoryPhoneHost }).STiPhonieStoryHost;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function fixture() {
  vi.stubGlobal('crypto', webcrypto);
  let chatId = 'chat-a';
  let sessionId = '';
  let onChange: (() => void) | undefined;
  let finish: ((reply: GeneratedStory) => void) | undefined;
  let listener: ((snapshot: StoryPhoneSnapshot) => void) | undefined;
  let messages = createInitialState().phone;
  const readIds = new Set<string>();
  const stored = new Map<string, WorldState>();
  const receipt = (): StoryPhoneSnapshot => ({
    sessionId,
    unreadTotal: messages.filter(item => !readIds.has(item.id)).length,
    contacts: createInitialState().contacts.map(contact => ({
      npcId: contact.id, name: contact.name, threadId: `thread:${contact.id}`,
      unread: messages.filter(item => item.npcId === contact.id && !readIds.has(item.id)).length,
    })),
    receipts: [...readIds],
  });
  const lease = {
    sync: vi.fn(async (data: { messages: WorldState['phone'] }) => {
      messages = data.messages.map(item => ({ ...item }));
      for (const item of messages) if (item.read) readIds.add(item.id);
      return receipt();
    }),
    snapshot: vi.fn(async () => receipt()),
    subscribe: vi.fn((callback: (snapshot: StoryPhoneSnapshot) => void) => { listener = callback; return vi.fn(); }),
    openContact: vi.fn(async () => {}), release: vi.fn(),
  };
  const phone: StoryPhoneHost = { bind: vi.fn(async options => { sessionId = options.sessionId; return lease; }) };
  (window as Window & { STiPhonieStoryHost?: StoryPhoneHost }).STiPhonieStoryHost = phone;
  const panel: PhonePanelHost = { mount: vi.fn(() => ({ release: vi.fn(), sync: vi.fn(), focus: vi.fn() })) };
  const runtime: PhoneRuntime = { available: () => panel, ensure: vi.fn(async () => panel), source: () => 'embedded', dispose: vi.fn(async () => {}) };
  const bridge: Bridge = {
    kind: 'tavern', label: 'fixture', session: () => JSON.stringify(['story-phone.png', chatId]),
    load: () => parseState(stored.get(chatId) ?? createInitialState()),
    save: vi.fn(state => { stored.set(chatId, parseState(state)); }),
    onSessionChange(callback) { onChange = callback; return vi.fn(); },
    generate: vi.fn(() => new Promise<GeneratedStory>(resolve => { finish = resolve; })),
    cancel: vi.fn(), dispose: vi.fn(),
  };
  return {
    bridge, runtime, phone, lease, stored,
    emitRead(id: string) { readIds.add(id); listener?.(receipt()); },
    finish(reply: GeneratedStory) { finish?.(reply); },
    switchChat(id: string) { chatId = id; onChange?.(); },
  };
}

describe('剧情消息与手机回执的 Shell 提交边界', () => {
  it('生成期间保存的手机已读回执不会被随后提交的回复覆盖', async () => {
    const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn(), f.runtime);
    await vi.waitFor(() => expect(handle!.model.phoneLinkStatus).toBe('ready'));
    expect(f.lease.sync).toHaveBeenCalledTimes(1);
    const pending = handle.actions.send('等一条新消息');
    expect(handle.model.busy).toBe(true);
    f.emitRead('phone-lin');
    expect(f.stored.get('chat-a')!.phone.find(item => item.id === 'phone-lin')!.read).toBe(true);
    f.finish({ text: '周同学发来一条消息。', phoneMessages: [{ npcId: 'zhou', text: '已经到咖啡店了。' }] });
    await pending;
    await vi.waitFor(() => expect(f.lease.sync).toHaveBeenCalledTimes(2));
    const saved = f.stored.get('chat-a')!;
    expect(saved.phone.find(item => item.id === 'phone-lin')!.read).toBe(true);
    expect(saved.phone.at(-1)).toMatchObject({ npcId: 'zhou', text: '已经到咖啡店了。', read: false });
    expect(saved.story.at(-1)?.text).toBe('周同学发来一条消息。');
    expect(f.lease.sync.mock.calls.at(-1)![0].messages.find(item => item.id === 'phone-lin')!.read).toBe(true);
    expect(handle.model.state).toEqual(saved);
    expect(handle.model.busy).toBe(false);
  });

  it('世界保存失败时不投递本轮手机消息，已保存内容和未读不变', async () => {
    const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn(), f.runtime);
    await vi.waitFor(() => expect(handle!.model.phoneLinkStatus).toBe('ready'));
    const before = parseState(f.stored.get('chat-a'));
    vi.mocked(f.bridge.save).mockImplementationOnce(() => { throw new Error('模拟写入失败'); });
    const pending = handle.actions.send('等消息');
    f.finish({ text: '林同学发来了消息。', phoneMessages: [{ npcId: 'lin', text: '不应送达的消息。' }] });
    await pending;
    expect(f.lease.sync).toHaveBeenCalledTimes(1);
    expect(f.stored.get('chat-a')).toEqual(before);
    expect(handle.model.state).toEqual(before);
    expect(handle.model.phoneUnread).toBe(2);
    expect(handle.model.notice).toBe('模拟写入失败');
  });

  it('初始世界保存失败时也不创建手机投递，显式重试才连接', async () => {
    const f = fixture(); vi.mocked(f.bridge.save).mockImplementationOnce(() => { throw new Error('模拟首次保存失败'); });
    handle = mountShell(window, window, f.bridge, vi.fn(), f.runtime);
    expect(handle.model.phoneLinkStatus).toBe('error');
    expect(f.runtime.ensure).not.toHaveBeenCalled();
    expect(f.phone.bind).not.toHaveBeenCalled();
    expect(f.lease.sync).not.toHaveBeenCalled();
    handle.actions.retryPhoneSync();
    await vi.waitFor(() => expect(handle!.model.phoneLinkStatus).toBe('ready'));
    expect(f.stored.get('chat-a')).toEqual(handle.model.state);
    expect(f.lease.sync).toHaveBeenCalledTimes(1);
  });

  it('退出并切换聊天后，旧手机订阅的迟到回执不能写入新聊天', async () => {
    const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn(), f.runtime);
    await vi.waitFor(() => expect(handle!.model.phoneLinkStatus).toBe('ready'));
    const before = parseState(f.stored.get('chat-a'));
    const savedCalls = vi.mocked(f.bridge.save).mock.calls.length;
    handle.dispose(); f.switchChat('chat-b'); f.emitRead('phone-lin');
    await Promise.resolve();
    expect(f.bridge.save).toHaveBeenCalledTimes(savedCalls);
    expect(f.stored.get('chat-a')).toEqual(before);
    expect(f.stored.has('chat-b')).toBe(false);
    expect(f.lease.release).toHaveBeenCalledTimes(1);
  });
});
