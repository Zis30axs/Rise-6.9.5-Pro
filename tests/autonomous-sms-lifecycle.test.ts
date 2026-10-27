import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/frontend/App.vue', () => ({ default: { template: '<div>受控界面</div>' } }));
vi.mock('../src/frontend/story-phone', () => ({ createStoryPhoneLink: vi.fn() }));
import { mountShell } from '../src/frontend/lifecycle';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { stageAutonomousSms } from '../src/runtime/autonomous-sms';
import type { Bridge, GeneratedStory, WorldState } from '../src/frontend/types';

function reserved() {
  const before = reduceState(enableProtagonists(createInitialState()), { type: 'switch_protagonist', target: 'emma' });
  return stageAutonomousSms(before, reduceState(before, { type: 'wait', minutes: 120 }), () => 0);
}
const handles: { dispose(reason?: string): void }[] = [];
afterEach(() => {
  for (const handle of handles.splice(0)) handle.dispose();
  vi.restoreAllMocks(); vi.useRealTimers(); document.body.innerHTML = '';
});
function shell(initial: WorldState = reserved()) {
  vi.useFakeTimers();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  let saved = parseState(initial), session = 'one', failSave = false;
  const generate = vi.fn<Bridge['generate']>(async () => ({ text: '', phoneMessages: [], autonomousSmsText: '晚一点一起喝茶吗？' }));
  const save = vi.fn<Bridge['save']>(state => {
    if (failSave) throw new Error('受控保存失败');
    saved = parseState(state);
  });
  const cancel = vi.fn();
  const bridge: Bridge = {
    kind: 'tavern', label: '受控本地测试', session: () => session, load: () => parseState(saved), save,
    generate, cancel, onSessionChange: () => () => {}, dispose: () => {},
  };
  const handle = mountShell(window, window, bridge, () => {}); handles.push(handle);
  return { handle, generate, save, cancel, state: () => saved, failSave: (value: boolean) => { failSave = value; },
    changeSession: () => { session = 'two'; } };
}
const tick = () => vi.advanceTimersByTimeAsync(1200);
function deferred() {
  let resolve!: (value: GeneratedStory) => void;
  const promise = new Promise<GeneratedStory>(done => { resolve = done; });
  return { promise, resolve };
}

describe('automatic SMS lifecycle transactions', () => {
  it('automatically resumes a saved reservation without requiring a click or marking the UI busy', async () => {
    const x = shell(), id = x.state().autonomousSms!.pending!.id;
    await tick();
    expect(x.generate).toHaveBeenCalledTimes(1);
    expect(x.generate.mock.calls[0]![2]).toEqual({ kind: 'autonomous_sms', ticketId: id });
    expect(x.state().phone.at(-1)).toMatchObject({ id, read: false, text: '晚一点一起喝茶吗？' });
    expect(x.state().protagonists!.npcPhone!.messages.at(-1)).toMatchObject({ id, replyTo: null });
    expect(x.handle.model.busy).toBe(false);
    await tick(); expect(x.generate).toHaveBeenCalledTimes(1);
    x.handle.dispose();
    const reloaded = shell(x.state());
    await tick(); expect(reloaded.generate).not.toHaveBeenCalled();
  });

  it('retains one complete result through failed writes and retries persistence without another model call', async () => {
    const x = shell(), original = parseState(x.state()); x.failSave(true);
    await tick(); await tick();
    expect(x.generate).toHaveBeenCalledTimes(1);
    expect(x.handle.model.state).toEqual(original);
    expect(x.state()).toEqual(original);
    x.failSave(false); await tick();
    expect(x.generate).toHaveBeenCalledTimes(1);
    const id = original.autonomousSms!.pending!.id;
    expect(x.state().phone.filter(row => row.id === id)).toHaveLength(1);
    expect(x.state().protagonists!.npcPhone!.messages.filter(row => row.id === id)).toHaveLength(1);
    expect(x.state().protagonists!.devices.emma.notifications.filter(row => row.id === `message:${id}`)).toHaveLength(1);
    expect(x.state().autonomousSms!.pending).toBeNull();
  });

  it('settles failed or malformed background generation silently without repeated calls', async () => {
    const x = shell(); x.generate.mockRejectedValueOnce(new Error('受控模型失败'));
    await tick(); await tick();
    expect(x.generate).toHaveBeenCalledTimes(1);
    expect(x.state().autonomousSms!.pending).toBeNull();
    expect(x.handle.model.notice).toBe('');
    const invalid = shell(); invalid.generate.mockResolvedValueOnce({ text: '伪造主线正文', phoneMessages: [], autonomousSmsText: '不应送达' });
    await tick();
    expect(invalid.state().phone.some(row => row.text === '不应送达')).toBe(false);
    expect(invalid.state().story.some(row => row.text === '伪造主线正文')).toBe(false);
    expect(invalid.state().autonomousSms!.pending).toBeNull();
  });

  it('drops late responses after a chat switch or shell disposal', async () => {
    const x = shell(), job = deferred(); x.generate.mockReturnValueOnce(job.promise);
    await tick(); x.changeSession();
    job.resolve({ text: '', phoneMessages: [], autonomousSmsText: '旧聊天迟到消息' });
    await Promise.resolve(); await Promise.resolve();
    expect(x.save).not.toHaveBeenCalled();
    const y = shell(), other = deferred(); y.generate.mockReturnValueOnce(other.promise);
    await tick(); y.handle.dispose();
    other.resolve({ text: '', phoneMessages: [], autonomousSmsText: '退出后迟到消息' });
    await Promise.resolve(); await Promise.resolve();
    expect(y.save).not.toHaveBeenCalled();
  });

  it('drops an in-flight result after game time advances, preserving the newer action', async () => {
    const x = shell(), job = deferred(), id = x.state().autonomousSms!.pending!.id;
    x.generate.mockReturnValueOnce(job.promise); await tick();
    x.handle.actions.dispatch({ type: 'wait', minutes: 5 });
    const advanced = parseState(x.state());
    job.resolve({ text: '', phoneMessages: [], autonomousSmsText: '过时消息' });
    await Promise.resolve(); await Promise.resolve();
    expect(x.state()).toEqual(advanced);
    expect(x.state().phone.some(row => row.id === id)).toBe(false);
  });

  it('allows a foreground story to preempt the background result without overwriting the story', async () => {
    const x = shell(), job = deferred(); x.generate.mockReturnValueOnce(job.promise);
    await tick(); x.generate.mockResolvedValueOnce({ text: '这一轮主线已经保存。', phoneMessages: [] });
    await x.handle.actions.send('继续观察');
    job.resolve({ text: '', phoneMessages: [], autonomousSmsText: '被抢占的背景消息' });
    await Promise.resolve(); await Promise.resolve();
    expect(x.state().story.at(-1)?.text).toBe('这一轮主线已经保存。');
    expect(x.state().phone.some(row => row.text === '被抢占的背景消息')).toBe(false);
  });

  it('retires an expired reservation restored from disk without calling the model', async () => {
    const stale = reduceState(reserved(), { type: 'wait', minutes: 5 });
    const x = shell(stale);
    await tick();
    expect(x.generate).not.toHaveBeenCalled();
    expect(x.state().autonomousSms!.pending).toBeNull();
    expect(x.state().clock).toEqual(stale.clock);
    await tick(); expect(x.generate).not.toHaveBeenCalled();
  });

  it('drops hidden-page results and resumes the saved reservation only when visible', async () => {
    const x = shell(), job = deferred(); x.generate.mockReturnValueOnce(job.promise);
    await tick();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(x.cancel).toHaveBeenCalled();
    job.resolve({ text: '', phoneMessages: [], autonomousSmsText: '隐藏后迟到消息' });
    await Promise.resolve(); await Promise.resolve();
    await tick(); expect(x.generate).toHaveBeenCalledTimes(1);
    expect(x.save).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await tick(); expect(x.generate).toHaveBeenCalledTimes(2);
    expect(x.state().phone.some(row => row.text === '隐藏后迟到消息')).toBe(false);
  });

  it('keeps ordinary NPC replies manual through shell polling', async () => {
    const initial = reserved(); initial.autonomousSms!.pending = null;
    const x = shell(initial), api = (window as any).__unreadCityWorldPhone;
    const view = api.read();
    await api.act({ binding: view.binding, revision: view.revision, requestId: 'manual-only', owner: 'emma',
      command: { type: 'send_npc_message', npcId: 'majo-yuki', text: '晚点聊吗？' } });
    await tick(); await tick();
    expect(x.generate).not.toHaveBeenCalled();
    expect(x.state().protagonists!.npcPhone!.messages.at(-1)).toMatchObject({ direction: 'outgoing', status: 'pending' });
    x.generate.mockResolvedValueOnce({ text: '晚点有空。', phoneMessages: [] });
    await api.retryReply('npc:manual-only');
    expect(x.generate).toHaveBeenCalledTimes(1);
    expect(x.generate.mock.calls[0]![2]).toEqual({ kind: 'npc_phone_reply', messageId: 'npc:manual-only' });
  });


  it('retires an unsent reservation when the player manually contacts the same NPC', async () => {
    const x = shell(), task = x.state().autonomousSms!.pending!, api = (window as any).__unreadCityWorldPhone;
    expect(task.kind).toBe('npc');
    const view = api.read();
    await api.act({ binding: view.binding, revision: view.revision, requestId: 'preempt-reservation', owner: 'emma',
      command: { type: 'send_npc_message', npcId: task.peerId, text: '这次由我先联系你。' } });
    await tick();
    expect(x.generate).not.toHaveBeenCalled();
    expect(x.state().autonomousSms!.pending).toBeNull();
    expect(x.state().protagonists!.npcPhone!.messages.at(-1)).toMatchObject({ direction: 'outgoing', status: 'pending', text: '这次由我先联系你。' });
  });

});
