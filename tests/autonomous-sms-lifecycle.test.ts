import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/frontend/App.vue', () => ({ default: { template: '<div>受控界面</div>' } }));
vi.mock('../src/frontend/story-phone', () => ({ createStoryPhoneLink: vi.fn() }));
import { mountShell, type ShellHandle } from '../src/frontend/lifecycle';
import { createTavernBridge } from '../src/runtime/bridge';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { stageAutonomousSms } from '../src/runtime/autonomous-sms';
import { saveStoryApiSettings } from '../src/runtime/story-api';
import type { Bridge, GeneratedStory } from '../src/frontend/types';

function reserved() {
  let state = reduceState(enableProtagonists(createInitialState()), { type: 'switch_protagonist', target: 'emma' });
  state.contacts = state.contacts.filter(c => c.id === 'majo-yuki');
  return stageAutonomousSms(state, reduceState(state, { type: 'wait', minutes: 120 }), () => 0);
}
const handles: ShellHandle[] = [];
afterEach(() => {
  for (const h of handles.splice(0)) h.dispose();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  localStorage.clear(); sessionStorage.clear(); document.body.innerHTML = '';
});
function shell() {
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  vi.useFakeTimers();
  let saved = reserved(), session = 'one', fail = false;
  const id = saved.autonomousSms!.pending!.id;
  const generate = vi.fn<Bridge['generate']>(async () => ({ text: '', phoneMessages: [], autonomousSmsText: '今天看到一只很像你的猫。' }));
  const save = vi.fn<Bridge['save']>(state => { if (fail) throw Error('磁盘保存失败'); saved = parseState(state); });
  const cancel = vi.fn();
  const bridge: Bridge = { kind: 'demo', label: '受控测试', session: () => session, load: () => parseState(saved), save,
    onSessionChange: () => () => {}, generate, cancel, dispose: () => {} };
  const h = mountShell(window, window, bridge, () => {}); handles.push(h);
  return { h, id, generate, save, cancel, state: () => saved, fail: () => { fail = true; }, switchChat: () => { session = 'two'; } };
}
function deferred() {
  let resolve!: (reply: GeneratedStory) => void;
  const promise = new Promise<GeneratedStory>(r => { resolve = r; });
  return { promise, resolve };
}

describe('autonomous SMS lifecycle', () => {
  it('delivers without confirmation only after a successful save, then survives reload without replay', async () => {
    const x = shell(); await vi.advanceTimersByTimeAsync(1200);
    expect(x.generate).toHaveBeenCalledExactlyOnceWith('', expect.anything(), { kind: 'autonomous_sms', ticketId: x.id });
    expect(x.state().phone.at(-1)).toMatchObject({ id: x.id, read: false });
    expect(x.h.model.state).toEqual(x.state());
    x.h.dispose();
    const bridge: Bridge = { kind: 'demo', label: 'reload', session: () => 'one', load: () => parseState(x.state()), save: x.save,
      onSessionChange: () => () => {}, generate: x.generate, cancel: () => {}, dispose: () => {} };
    handles.push(mountShell(window, window, bridge, () => {}));
    await vi.advanceTimersByTimeAsync(4800);
    expect(x.generate).toHaveBeenCalledTimes(1);
  });
  it('does not publish half a delivery or repeatedly bill the model when saves keep failing', async () => {
    const x = shell(), before = JSON.stringify(x.state()); x.fail();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await vi.advanceTimersByTimeAsync(6000);
    expect(x.generate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(x.state())).toBe(before);
    expect(x.h.model.state).toEqual(JSON.parse(before));
  });
  it('consumes a provider failure silently and does not retry on every timer tick', async () => {
    const x = shell(); x.generate.mockRejectedValueOnce(Error('模型离线'));
    await vi.advanceTimersByTimeAsync(6000);
    expect(x.generate).toHaveBeenCalledTimes(1);
    expect(x.state().autonomousSms!.pending).toBeNull();
    expect(x.state().phone.some(m => m.id === x.id)).toBe(false);
    expect(x.h.model.notice).toBe('');
  });
  for (const boundary of ['chat', 'viewpoint', 'hidden', 'time'] as const) {
    it(`discards a late result across ${boundary} changes`, async () => {
      const x = shell(), task = deferred(); x.generate.mockReturnValueOnce(task.promise);
      await vi.advanceTimersByTimeAsync(1200);
      if (boundary === 'chat') x.switchChat();
      if (boundary === 'viewpoint') x.h.actions.dispatch({ type: 'switch_protagonist', target: 'renako' });
      if (boundary === 'time') x.h.actions.dispatch({ type: 'wait', minutes: 5 });
      if (boundary === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        expect(x.cancel).toHaveBeenCalled();
      }
      const saves = x.save.mock.calls.length;
      task.resolve({ text: '', phoneMessages: [], autonomousSmsText: '不该写入的迟到消息' });
      await vi.advanceTimersByTimeAsync(0);
      expect(x.save).toHaveBeenCalledTimes(saves);
      expect(x.state().protagonists!.npcPhone?.messages.some(m => m.id === x.id) ?? false).toBe(false);
      expect(x.h.model.busy).toBe(false);
    });
  }
  it('allows foreground story generation to preempt SMS without clearing its busy state', async () => {
    const x = shell(), sms = deferred(), story = deferred();
    x.generate.mockReturnValueOnce(sms.promise).mockReturnValueOnce(story.promise);
    await vi.advanceTimersByTimeAsync(1200);
    const job = x.h.actions.send('继续阅读。');
    expect(x.h.model.busy).toBe(true);
    sms.resolve({ text: '', phoneMessages: [], autonomousSmsText: '被抢占的短信' });
    await vi.advanceTimersByTimeAsync(0);
    expect(x.h.model.busy).toBe(true);
    story.resolve({ text: '风吹过窗前。', phoneMessages: [] }); await job;
    expect(x.h.model.busy).toBe(false);
    expect(x.state().story.at(-1)?.text).toBe('风吹过窗前。');
    await vi.advanceTimersByTimeAsync(2400);
    expect(x.generate).toHaveBeenCalledTimes(2);
  });
});

describe('autonomous SMS transport', () => {
  function bridge(state = reserved()) {
    const generate = vi.fn(async (_config: unknown) => `<autonomous_sms>${JSON.stringify({ id: state.autonomousSms!.pending!.id, text: null })}</autonomous_sms>`);
    const host = { parent: { SillyTavern: { getContext: () => ({ characterId: 0, characters: [{ avatar: 'test.png' }], chatId: 'one', mainApi: 'openai' }) } },
      getVariables: () => ({ unread_city: state }), replaceVariables: vi.fn(), eventOn: vi.fn(), eventRemoveListener: vi.fn(),
      stopGenerationById: vi.fn(), tavern_events: { CHAT_CHANGED: 'chat_changed' }, generate };
    return { api: createTavernBridge(host as unknown as Window)!, generate, state };
  }
  it('uses the actual Tavern bridge with no chat history or narrative envelope', async () => {
    const x = bridge(), id = x.state.autonomousSms!.pending!.id;
    const reply = await x.api.generate('', x.state, { kind: 'autonomous_sms', ticketId: id });
    const prompt = x.generate.mock.calls[0]![0] as any;
    expect(prompt.max_chat_history).toBe(0);
    expect(prompt.user_input).toContain('consider_unsolicited_sms');
    expect(prompt.user_input).not.toContain('worldContinuity');
    expect(prompt.injects[0].content).not.toContain('【最高优先级·强制故事标签】');
    expect(reply).toEqual({ text: '', phoneMessages: [], autonomousSmsText: null });
    x.api.dispose();
  });
  it.each(['chat', 'responses'] as const)('reuses the configured custom %s API without falling through to Tavern', async format => {
    const x = bridge(), id = x.state.autonomousSms!.pending!.id;
    saveStoryApiSettings({ mode: 'custom', endpoint: 'https://example.com/v1', model: 'user-chosen-model', format, preset: '现有风格设置' });
    const text = `<autonomous_sms>${JSON.stringify({ id, text: '只走用户配置的接口。' })}</autonomous_sms>`;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(format === 'chat' ? { choices: [{ message: { content: text } }] } : { output_text: text })));
    vi.stubGlobal('fetch', fetchMock);
    const reply = await x.api.generate('', x.state, { kind: 'autonomous_sms', ticketId: id });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('user-chosen-model');
    expect(fetchMock.mock.calls[0]![0]).toBe(`https://example.com/v1/${format === 'chat' ? 'chat/completions' : 'responses'}`);
    expect(x.generate).not.toHaveBeenCalled();
    expect(reply.autonomousSmsText).toBe('只走用户配置的接口。');
    x.api.dispose();
  });
});
