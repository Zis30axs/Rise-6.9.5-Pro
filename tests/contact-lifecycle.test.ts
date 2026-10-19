import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bridge, ContactProfileDraft, GeneratedStory, WorldState } from '../src/frontend/types';
import type { PhonePanelHost, PhoneRuntime } from '../src/frontend/phone-runtime';
import type { StoryPhoneHost, StoryPhoneSnapshot } from '../src/frontend/story-phone';
import { createInitialState, parseState } from '../src/runtime/model';

vi.mock('../src/frontend/App.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({ props: ['actions'], setup: props => () => h('div', [
    h('button', { onClick: props.actions.exit }, '退出'), h('div', { 'data-contact-phone-anchor': '' }),
  ]) }) };
});
import { mountShell, type ShellHandle } from '../src/frontend/lifecycle';

let handle: ShellHandle | undefined;
afterEach(() => {
  handle?.dispose(); handle = undefined;
  document.body.innerHTML = ''; document.body.style.cssText = '';
  delete (window as Window & { STiPhonieStoryHost?: StoryPhoneHost }).STiPhonieStoryHost;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

const draft: ContactProfileDraft = { id: 'lin', name: '林知夏', portraitId: 'deepseek', summary: '喜欢读书，常在图书馆整理笔记。', sourcePersonId: null };
function fixture() {
  vi.stubGlobal('crypto', webcrypto);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  let chatId = 'profile-chat-a';
  let sessionId = '';
  let onChange: (() => void) | undefined;
  let finish: ((reply: GeneratedStory) => void) | undefined;
  let binding: Parameters<StoryPhoneHost['bind']>[0] | undefined;
  const stored = new Map<string, WorldState>();
  const receipt = (): StoryPhoneSnapshot => ({ sessionId, unreadTotal: 0, receipts: [], contacts: [] });
  const lease = {
    sync: vi.fn(async () => receipt()), snapshot: vi.fn(async () => receipt()),
    subscribe: vi.fn(() => vi.fn()), openContact: vi.fn(async () => {}), openContactEditor: vi.fn(async () => {}), release: vi.fn(),
  };
  const phone: StoryPhoneHost = { bind: vi.fn(async data => { binding = data; sessionId = data.sessionId; return lease; }) };
  (window as Window & { STiPhonieStoryHost?: StoryPhoneHost }).STiPhonieStoryHost = phone;
  const panel: PhonePanelHost = { mount: vi.fn(() => ({ release: vi.fn(), sync: vi.fn(), focus: vi.fn() })) };
  const runtime: PhoneRuntime = { available: () => panel, ensure: vi.fn(async () => panel), source: () => 'embedded', dispose: vi.fn(async () => {}) };
  const bridge: Bridge = {
    kind: 'tavern', label: 'contact fixture', session: () => JSON.stringify(['contact-profiles.png', chatId]),
    load: () => parseState(stored.get(chatId) ?? createInitialState()),
    save: vi.fn(state => { stored.set(chatId, parseState(state)); }),
    onSessionChange(callback) { onChange = callback; return vi.fn(); },
    generate: vi.fn(() => new Promise<GeneratedStory>(resolve => { finish = resolve; })),
    cancel: vi.fn(), dispose: vi.fn(),
  };
  return {
    bridge, runtime, phone, panel, lease, stored,
    callbacks: () => binding!,
    finish(reply: GeneratedStory) { finish?.(reply); },
    switchChat(id = 'profile-chat-b') { chatId = id; onChange?.(); },
    open() {
      const root = document.querySelector('[data-unread-city-root]')!;
      handle!.actions.openPhone(root.shadowRoot!.querySelector<HTMLElement>('[data-contact-phone-anchor]')!);
    },
  };
}
async function mounted() {
  const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn(), f.runtime);
  await vi.waitFor(() => expect(handle!.model.phoneLinkStatus).toBe('ready'));
  vi.mocked(f.bridge.save).mockClear();
  return f;
}

describe('phone-confirmed character lifecycle', () => {
  it('saves the world profile and event before publishing it to the phone callback', async () => {
    const f = await mounted(); f.open();
    const before = parseState(handle!.model.state);
    vi.mocked(f.bridge.save).mockImplementationOnce(next => {
      expect(handle!.model.state).toEqual(before);
      expect(next.contacts[0]).toMatchObject({ name: draft.name, portraitId: draft.portraitId, summary: draft.summary, isMain: true });
      expect(next.story.at(-1)?.participantIds).toEqual(['lin']);
      f.stored.set('profile-chat-a', parseState(next));
    });
    const saved = await f.callbacks().onContactSave!(draft);
    expect(saved).toMatchObject({ id: 'lin', name: draft.name, portraitId: draft.portraitId, summary: draft.summary, isMain: true });
    expect(handle!.model.state).toEqual(f.stored.get('profile-chat-a'));
    expect(handle!.model.state.contacts[0].affinity).toBe(before.contacts[0].affinity);
    expect(handle!.model.state.phone).toEqual(before.phone);
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
    expect(f.bridge.generate).not.toHaveBeenCalled();
    expect(handle!.model.interaction).toBeNull();
  });

  it('does not publish a character or history when persistence fails, and retries once without losing old data', async () => {
    const f = await mounted(); f.open();
    const before = parseState(handle!.model.state);
    vi.mocked(f.bridge.save).mockImplementationOnce(() => { throw new Error('人物保存失败'); });
    await expect(f.callbacks().onContactSave!(draft)).rejects.toThrow('人物保存失败');
    expect(handle!.model.state).toEqual(before); expect(f.stored.get('profile-chat-a')).toEqual(before);
    expect(f.bridge.generate).not.toHaveBeenCalled();
    const saved = await f.callbacks().onContactSave!(draft);
    expect(saved.name).toBe(draft.name);
    expect(handle!.model.state.story).toHaveLength(before.story.length + 1);
    expect(handle!.model.state.journal).toHaveLength(before.journal.length + 1);
  });

  it('generates an intro only after the explicit open-phone callback and returns editable text without saving', async () => {
    const f = await mounted();
    expect(f.bridge.generate).not.toHaveBeenCalled();
    await expect(f.callbacks().onGenerateIntroduction!(draft)).rejects.toThrow(/手机人物编辑页/);
    expect(f.bridge.generate).not.toHaveBeenCalled();
    f.open();
    const before = parseState(handle!.model.state);
    const pending = f.callbacks().onGenerateIntroduction!(draft);
    expect(handle!.model.busy).toBe(true);
    expect(f.bridge.generate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(f.bridge.generate).mock.calls[0][2]).toEqual({ kind: 'contact_introduction', contact: draft });
    f.finish({ text: '林知夏喜欢在图书馆整理课堂笔记，说话温和而认真。', phoneMessages: [] });
    await expect(pending).resolves.toBe('林知夏喜欢在图书馆整理课堂笔记，说话温和而认真。');
    expect(f.bridge.save).not.toHaveBeenCalled();
    expect(handle!.model.state).toEqual(before); expect(f.stored.get('profile-chat-a')).toEqual(before);
    expect(handle!.model.busy).toBe(false);
  });

  it.each(['close', 'switch', 'exit'] as const)('discards a late introduction after %s', async action => {
    const f = await mounted(); f.open();
    const before = parseState(handle!.model.state);
    const pending = f.callbacks().onGenerateIntroduction!(draft);
    const rejected = expect(pending).rejects.toThrow(/关闭|切换/);
    if (action === 'close') handle!.actions.closePhone();
    else if (action === 'switch') f.switchChat();
    else handle!.dispose();
    f.finish({ text: '不应回填到新的编辑页。', phoneMessages: [] });
    await rejected;
    expect(f.bridge.save).not.toHaveBeenCalled();
    expect(f.stored.get('profile-chat-a')).toEqual(before);
    expect(f.stored.has('profile-chat-b')).toBe(false);
    expect(f.bridge.cancel).toHaveBeenCalled();
    expect(handle!.model.state).toEqual(before);
    if (action === 'close') expect(handle!.model.busy).toBe(false);
  });

  it('rejects hidden or stale phone profile saves and does not invoke generation', async () => {
    const f = await mounted(); f.open(); handle!.actions.closePhone();
    const before = parseState(handle!.model.state);
    await expect(f.callbacks().onContactSave!(draft)).rejects.toThrow(/当前无法保存|手机/);
    expect(f.bridge.save).not.toHaveBeenCalled(); expect(handle!.model.state).toEqual(before);
    f.switchChat();
    await expect(f.callbacks().onContactSave!(draft)).rejects.toThrow(/聊天已切换/);
    expect(f.bridge.save).not.toHaveBeenCalled(); expect(f.bridge.generate).not.toHaveBeenCalled();
  });

  it('rejects invalid profile drafts before persistence or model access', async () => {
    const f = await mounted(); f.open();
    for (const raw of [{ ...draft, portraitId: 'unknown' }, { ...draft, name: '名'.repeat(41) }, { ...draft, ignored: true }]) {
      await expect(f.callbacks().onContactSave!(raw as ContactProfileDraft)).rejects.toThrow(/人物档案无效/);
      await expect(f.callbacks().onGenerateIntroduction!(raw as ContactProfileDraft)).rejects.toThrow(/人物档案无效/);
    }
    expect(f.bridge.save).not.toHaveBeenCalled(); expect(f.bridge.generate).not.toHaveBeenCalled();
  });
});
