import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../src/runtime/model';
import { createStoryPhoneLink, type StoryPhoneHost, type StoryPhoneSnapshot } from '../src/frontend/story-phone';

afterEach(() => {
  delete (window as Window & { STiPhonieStoryHost?: unknown }).STiPhonieStoryHost;
  vi.unstubAllGlobals();
});

function fixture() {
  vi.stubGlobal('crypto', webcrypto);
  let state = createInitialState();
  let live = true;
  let listener: ((data: StoryPhoneSnapshot) => void) | undefined;
  let sessionId = '';
  const snapshot = (receipts: string[] = []): StoryPhoneSnapshot => ({ sessionId, receipts, unreadTotal: 2 - receipts.length, contacts: [] });
  const lease = {
    sync: vi.fn(async () => snapshot()), snapshot: vi.fn(async () => snapshot()),
    subscribe: vi.fn((callback: (data: StoryPhoneSnapshot) => void) => { listener = callback; return vi.fn(); }),
    openContact: vi.fn(async () => {}), release: vi.fn(),
  };
  const api: StoryPhoneHost = { bind: vi.fn(async options => { sessionId = options.sessionId; return lease; }) };
  (window as Window & { STiPhonieStoryHost?: StoryPhoneHost }).STiPhonieStoryHost = api;
  const options = {
    hostWindow: window, session: JSON.stringify(['card-a.png', 'chat-a']),
    ensurePhone: vi.fn(async () => {}), isCurrent: () => live,
    state: () => structuredClone(state), accept: vi.fn(), status: vi.fn(),
  };
  return { options, api, lease, snapshot, replace: (next: typeof state) => { state = next; }, retire: () => { live = false; }, emit: (data: StoryPhoneSnapshot) => listener?.(data) };
}

describe('剧情手机投递与回执边界', () => {
  it('retains a full legacy introduction in the world while adapting the phone editor to 500 characters', async () => {
    const f = fixture(); const state = createInitialState();
    state.contacts[0].summary = '旧介绍'.repeat(600);
    const fullSummary = state.contacts[0].summary;
    f.replace(state); const link = createStoryPhoneLink(f.options);
    await link.sync();
    const binding = vi.mocked(f.api.bind).mock.calls[0][0];
    expect(binding.contacts[0].summary).toBe(fullSummary.slice(0, 500));
    expect(binding.contacts[0].description).toContain(fullSummary);
    expect(f.options.state().contacts[0].summary).toBe(fullSummary);
    expect(f.lease.sync).toHaveBeenCalledWith(expect.objectContaining({ contacts: expect.arrayContaining([expect.objectContaining({ summary: fullSummary.slice(0, 500) })]) }));
    link.dispose();
  });
  it('后台连接使用聊天身份摘要，不按名字绑定，固定事件编号交给手机去重', async () => {
    const f = fixture(); const link = createStoryPhoneLink(f.options);
    await link.sync(); await link.sync();
    expect(f.api.bind).toHaveBeenCalledTimes(1);
    expect(f.api.bind).toHaveBeenCalledWith(expect.objectContaining({ sessionId: expect.stringMatching(/^[a-f0-9]{64}$/), chatId: 'chat-a' }));
    expect(f.lease.sync.mock.calls).toHaveLength(2);
    expect(f.lease.sync).toHaveBeenLastCalledWith(expect.objectContaining({ messages: expect.arrayContaining([expect.objectContaining({ id: 'phone-lin', npcId: 'lin' })]) }));
    link.dispose(); expect(f.lease.release).toHaveBeenCalledTimes(1);
  });

  it('并行请求排成一条队列，上一批等待期间新消息不会遗漏', async () => {
    const f = fixture(); let finish!: (snapshot: StoryPhoneSnapshot) => void;
    f.lease.sync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const link = createStoryPhoneLink(f.options); const first = link.sync();
    await vi.waitFor(() => expect(f.lease.sync).toHaveBeenCalledTimes(1));
    const next = createInitialState(); next.phone.push({ id: 'new-event', npcId: 'lin', text: '新剧情消息', read: false, at: '第 1 天 17:21' });
    f.replace(next); const second = link.sync(); finish(f.snapshot()); await Promise.all([first, second]);
    expect(f.lease.sync).toHaveBeenCalledTimes(2);
    expect(f.lease.sync).toHaveBeenLastCalledWith(expect.objectContaining({ messages: expect.arrayContaining([expect.objectContaining({ id: 'new-event' })]) }));
    link.dispose();
  });

  it('切换聊天后的迟到投递和回执均不能触发世界写入', async () => {
    const f = fixture(); const link = createStoryPhoneLink(f.options); await link.sync();
    f.options.accept.mockClear(); f.retire(); f.emit(f.snapshot(['phone-lin']));
    await link.sync(); expect(f.options.accept).not.toHaveBeenCalled();
    expect(f.lease.sync).toHaveBeenCalledTimes(1); link.dispose();
  });

  it('绑定尚未完成即退出会释放迟到的lease，不订阅、不投递', async () => {
    const f = fixture(); let finish!: (value: typeof f.lease) => void;
    vi.mocked(f.api.bind).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const link = createStoryPhoneLink(f.options); const pending = link.sync();
    await vi.waitFor(() => expect(f.api.bind).toHaveBeenCalledTimes(1)); link.dispose();
    finish(f.lease); await expect(pending).rejects.toThrow('聊天已切换');
    expect(f.lease.release).toHaveBeenCalledTimes(1); expect(f.lease.sync).not.toHaveBeenCalled();
  });

  it('旧扩展缺少联动接口时明确报错，保留消息供重试', async () => {
    const f = fixture(); delete (window as Window & { STiPhonieStoryHost?: unknown }).STiPhonieStoryHost;
    const link = createStoryPhoneLink(f.options);
    await expect(link.sync()).rejects.toThrow('当前手机尚不支持剧情联动');
    expect(f.options.accept).not.toHaveBeenCalled(); expect(f.options.state().phone).toHaveLength(2);
    (window as Window & { STiPhonieStoryHost?: StoryPhoneHost }).STiPhonieStoryHost = f.api;
    await link.sync(); expect(f.lease.sync).toHaveBeenCalledTimes(1); link.dispose();
  });

  it('窗口收起后完成的联系人请求不重新打开手机', async () => {
    const f = fixture(); const link = createStoryPhoneLink(f.options);
    await link.openContact('lin', () => false); expect(f.lease.openContact).not.toHaveBeenCalled();
    await link.openContact('lin', () => true); expect(f.lease.openContact).toHaveBeenCalledWith('lin'); link.dispose();
  });
});
