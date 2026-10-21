import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bridge, GeneratedStory } from '../src/frontend/types';
import { acknowledgePhoneRead, applyStoryActions, createInitialState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { recordWeeklyStory, weeklyMemoryContext } from '../src/runtime/weekly-memory';

const component = vi.hoisted(() => ({ fail: false }));
vi.mock('../src/frontend/App.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({
    props: ['actions'],
    setup(props) {
      if (component.fail) throw new Error('模拟 Vue 启动失败');
      return () => h('button', { onClick: props.actions.exit }, '退出');
    },
  }) };
});
import { mountShell, type ShellHandle } from '../src/frontend/lifecycle';

let handle: ShellHandle | undefined;
afterEach(() => { handle?.dispose(); handle = undefined; component.fail = false; document.body.innerHTML = ''; document.body.style.cssText = ''; delete (window as Window & { STiPhoniePanelHost?: unknown }).STiPhoniePanelHost; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture() {
  let current = 'a';
  let change: (() => void) | undefined;
  let finish: ((text: GeneratedStory) => void) | undefined;
  const bridge: Bridge = {
    kind: 'demo', label: '测试', session: () => current,
    load: () => createInitialState(), save: vi.fn(),
    onSessionChange(callback) { change = callback; return vi.fn(); },
    generate: () => new Promise(resolve => { finish = resolve; }),
    cancel: vi.fn(), dispose: vi.fn(),
  };
  return { bridge, change: () => { current = 'b'; change?.(); }, finish: (text: string) => finish?.({ text, phoneMessages: [] }), finishReply: (reply: GeneratedStory) => finish?.(reply) };
}

function phoneFixture() {
  const leases: { release: ReturnType<typeof vi.fn>; sync: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> }[] = [];
  const callbacks: (() => void)[] = [];
  const api = { mount: vi.fn((_anchor: HTMLElement, options: { onClose(): void }) => {
    callbacks.push(options.onClose);
    const lease = { release: vi.fn(), sync: vi.fn(), focus: vi.fn() };
    leases.push(lease); return lease;
  }) };
  (window as Window & { STiPhoniePanelHost?: unknown }).STiPhoniePanelHost = api;
  const anchor = () => {
    const element = document.createElement('div');
    document.querySelector('[data-unread-city-root]')!.shadowRoot!.append(element);
    return element;
  };
  return { api, leases, callbacks, anchor };
}

describe('interaction progress and event choices', () => {
  function mountInteraction(roll = .2) {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const f = fixture();
    handle = mountShell(window, window, f.bridge, vi.fn());
    const random = vi.spyOn(Math, 'random').mockReturnValue(roll);
    return { ...f, random, handle: handle! };
  }

  it.each([0, .799999])('roll %s pauses at 75%% without saving; No commits the original once and never calls the model', async roll => {
    const f = mountInteraction(roll);
    f.bridge.generate = vi.fn();
    const before = JSON.stringify(f.handle.model.state);
    const pending = f.handle.actions.interact!({ type: 'wait', minutes: 30 });
    expect(f.handle.model.busy).toBe(true);
    expect(f.handle.model.interaction).toMatchObject({ phase: 'progress', progress: 0 });
    await vi.advanceTimersByTimeAsync(600);
    expect(f.handle.model.interaction!.progress).toBeGreaterThan(0);
    expect(f.handle.model.interaction!.progress).toBeLessThan(75);
    expect(JSON.stringify(f.handle.model.state)).toBe(before);
    await vi.advanceTimersByTimeAsync(600);
    expect(f.handle.model.interaction).toMatchObject({ phase: 'choice', progress: 75 });
    expect(f.bridge.save).not.toHaveBeenCalled();
    await f.handle.actions.resolveInteraction!(false);
    expect(await pending).toBe(true);
    expect(f.handle.model.state.clock).toEqual({ day: 1, hour: 17, minute: 50 });
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
    expect(f.bridge.generate).not.toHaveBeenCalled();
    expect(f.handle.model.busy).toBe(false);
    expect(f.handle.model.interaction).toBeNull();
    expect(f.random).toHaveBeenCalledTimes(1);
  });

  it.each([.8, .999999])('roll %s completes normally at the exact 80%% boundary', async roll => {
    const f = mountInteraction(roll);
    const pending = f.handle.actions.interact!({ type: 'wait', minutes: 15 });
    await vi.advanceTimersByTimeAsync(1200);
    expect(await pending).toBe(true);
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
    expect(f.handle.model.interaction).toBeNull();
    expect(f.handle.model.state.clock.minute).toBe(35);
  });

  it('prepares a random rest once; save failure and retry preserve the sampled duration', async () => {
    const f = mountInteraction();
    f.handle.actions.dispatch({ type: 'novel_travel', locationId: 'dorm-room' });
    f.handle.actions.dispatch({ type: 'novel_approach', interactionId: 'dorm-rest' });
    vi.mocked(f.bridge.save).mockClear();
    f.random.mockReset().mockReturnValueOnce(.99).mockReturnValueOnce(.2);
    const before = JSON.stringify(f.handle.model.state);
    const pending = f.handle.actions.interact!({ type: 'interior_rest', optionId: 'dorm-rest-short' });
    await vi.advanceTimersByTimeAsync(1200);
    expect(f.random).toHaveBeenCalledTimes(2);
    vi.mocked(f.bridge.save).mockImplementationOnce(() => { throw new Error('保存失败'); });
    await f.handle.actions.resolveInteraction!(false);
    expect(JSON.stringify(f.handle.model.state)).toBe(before);
    expect(f.handle.model.interaction).toMatchObject({ phase: 'error', error: '保存失败' });
    await f.handle.actions.resolveInteraction!(false);
    expect(await pending).toBe(true);
    expect(f.handle.model.state.interior!.lastRest!.minutes).toBe(30);
    expect(f.random).toHaveBeenCalledTimes(2);
    expect(f.bridge.save).toHaveBeenCalledTimes(2);
  });

  it('Yes commits original activity, event effects, story and phone together after one successful save', async () => {
    const f = mountInteraction();
    const before = JSON.stringify(f.handle.model.state);
    const generate = vi.fn(f.bridge.generate);
    f.bridge.generate = generate;
    const pending = f.handle.actions.interact!({ type: 'wait', minutes: 15 });
    await vi.advanceTimersByTimeAsync(1200);
    const resolving = f.handle.actions.resolveInteraction!(true);
    expect(f.handle.model.interaction!.phase).toBe('generating');
    expect(generate.mock.calls[0][1].clock).toEqual({ day: 1, hour: 17, minute: 35 });
    expect(generate.mock.calls[0][2]).toMatchObject({ kind: 'interaction_event', interaction: { action: { type: 'wait', minutes: 15 } } });
    expect(JSON.stringify(f.handle.model.state)).toBe(before);
    f.finishReply({ text: '帮同学捡回飞走的便笺，你们因此熟悉了些。', phoneMessages: [{ npcId: 'lin', text: '刚才多谢啦。' }], worldActions: [{ type: 'relationship', npcId: 'lin', delta: 4, reason: '帮忙捡回便笺' }] });
    await resolving;
    expect(await pending).toBe(true);
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
    expect(f.handle.model.state.clock.minute).toBe(35);
    expect(f.handle.model.state.contacts.find(item => item.id === 'lin')!.affinity).toBe(createInitialState().contacts.find(item => item.id === 'lin')!.affinity + 4);
    expect(f.handle.model.state.phone.filter(item => item.text === '刚才多谢啦。')).toHaveLength(1);
    expect(f.handle.model.state.story.at(-1)!.text).toContain('便笺');
  });

  it('caches a valid event through save failure; retry does not regenerate or apply the original twice', async () => {
    const f = mountInteraction();
    const generate = vi.fn(async () => ({ text: '一阵凉风让你精神一振。', phoneMessages: [], worldActions: [{ type: 'relationship' as const, npcId: 'lin', delta: 2, reason: '一起闲谈' }] }));
    f.bridge.generate = generate;
    const before = JSON.stringify(f.handle.model.state);
    const pending = f.handle.actions.interact!({ type: 'wait', minutes: 15 });
    await vi.advanceTimersByTimeAsync(1200);
    vi.mocked(f.bridge.save).mockImplementationOnce(() => { throw new Error('写入失败'); });
    await f.handle.actions.resolveInteraction!(true);
    expect(JSON.stringify(f.handle.model.state)).toBe(before);
    expect(f.handle.model.interaction!.phase).toBe('error');
    await f.handle.actions.resolveInteraction!(true);
    expect(await pending).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(f.bridge.save).toHaveBeenCalledTimes(2);
    expect(f.handle.model.state.clock.minute).toBe(35);
    expect(f.handle.model.state.story.filter(item => item.role === 'assistant' && item.text.includes('凉风'))).toHaveLength(1);
  });

  it('rejects decorative events without effects and can normally finish after a model failure', async () => {
    const f = mountInteraction();
    f.bridge.generate = vi.fn(async () => ({ text: '似乎发生了什么。', phoneMessages: [] }));
    const before = JSON.stringify(f.handle.model.state);
    const pending = f.handle.actions.interact!({ type: 'wait', minutes: 15 });
    await vi.advanceTimersByTimeAsync(1200);
    await f.handle.actions.resolveInteraction!(true);
    expect(f.handle.model.interaction).toMatchObject({ phase: 'error' });
    expect(f.handle.model.notice).toContain('实际影响');
    expect(JSON.stringify(f.handle.model.state)).toBe(before);
    expect(f.bridge.save).not.toHaveBeenCalled();
    await f.handle.actions.resolveInteraction!(false);
    expect(await pending).toBe(true);
    expect(f.handle.model.state.story).toEqual(createInitialState().story);
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
  });

  it('merges phone read receipts received during the held activity', async () => {
    const f = mountInteraction();
    const pending = f.handle.actions.interact!({ type: 'wait', minutes: 15 });
    await vi.advanceTimersByTimeAsync(1200);
    f.handle.model.state = acknowledgePhoneRead(f.handle.model.state, [f.handle.model.state.phone[0].id]);
    await f.handle.actions.resolveInteraction!(false);
    expect(await pending).toBe(true);
    expect(f.handle.model.state.phone[0].read).toBe(true);
    expect(f.handle.model.state.clock.minute).toBe(35);
  });

  it('cancellation, backgrounding and a chat switch discard private state and late model replies', async () => {
    const f = mountInteraction();
    const before = JSON.stringify(f.handle.model.state);
    const canceled = f.handle.actions.interact!({ type: 'wait', minutes: 15 });
    f.handle.actions.cancelInteraction!();
    expect(await canceled).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.bridge.save).not.toHaveBeenCalled();
    const background = f.handle.actions.interact!({ type: 'wait', minutes: 15 });
    vi.mocked(Object.getOwnPropertyDescriptor(document, 'hidden')!.get!).mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(await background).toBe(false);
    vi.mocked(Object.getOwnPropertyDescriptor(document, 'hidden')!.get!).mockReturnValue(false);
    const pending = f.handle.actions.interact!({ type: 'wait', minutes: 15 });
    await vi.advanceTimersByTimeAsync(1200);
    const resolving = f.handle.actions.resolveInteraction!(true);
    f.change();
    expect(await pending).toBe(false);
    f.finishReply({ text: '迟到事件', phoneMessages: [], worldActions: [{ type: 'rest', kind: 'rest', minutes: 60 }] });
    await resolving;
    expect(JSON.stringify(f.handle.model.state)).toBe(before);
    expect(f.bridge.save).not.toHaveBeenCalled();
  });

  it('invalid actions do not roll; duplicate clicks, background ticks and ordinary dialogue cannot start an extra event', async () => {
    const f = mountInteraction();
    expect(await f.handle.actions.interact!({ type: 'location_service', serviceId: 'drink-coffee' })).toBe(false);
    expect(f.random).not.toHaveBeenCalled();
    const pending = f.handle.actions.interact!({ type: 'wait', minutes: 15 });
    expect(await f.handle.actions.interact!({ type: 'wait', minutes: 15 })).toBe(false);
    f.handle.actions.dispatch({ type: 'wait', minutes: 15 });
    await f.handle.actions.send('闲聊');
    await vi.advanceTimersByTimeAsync(6000);
    expect(f.bridge.save).not.toHaveBeenCalled();
    expect(f.random).toHaveBeenCalledTimes(1);
    f.handle.actions.cancelInteraction!();
    expect(await pending).toBe(false);
    const ordinary = f.handle.actions.send('闲聊');
    f.finish('只是普通对话。'); await ordinary;
    expect(f.random).toHaveBeenCalledTimes(1);
    expect(f.handle.model.interaction).toBeNull();
  });
});

describe('Immersive Shell 生命周期', () => {
  function weeklyFixture() {
    const initial = enableProtagonists(createInitialState());
    recordWeeklyStory(initial, 'soyo', 'saved-week', '素世保存了一段日常经历。');
    const state = applyStoryActions(initial, [{ type: 'rest', kind: 'wait', minutes: 7 * 1440 }], 'close-week');
    const f = fixture();
    f.bridge.load = () => state;
    handle = mountShell(window, window, f.bridge, vi.fn());
    return f;
  }

  it('retains pending weekly evidence after invalid output and save failure, then retries atomically', async () => {
    const f = weeklyFixture();
    const before = JSON.stringify(handle!.model.state);
    const evidence = structuredClone(weeklyMemoryContext(handle!.model.state).pending);
    expect(evidence?.week).toBe(1);
    const invalid = handle!.actions.send('继续这一周的生活');
    f.finishReply({ text: '继续。', phoneMessages: [], weeklySummary: { week: 2, text: '错误周次。' } });
    await invalid;
    expect(JSON.stringify(handle!.model.state)).toBe(before);
    expect(f.bridge.save).not.toHaveBeenCalled();
    const reply: GeneratedStory = { text: '新一周开始了。', phoneMessages: [], weeklySummary: { week: 1, text: '两人的一周已被整理，秘密仍未彼此公开。' } };
    vi.mocked(f.bridge.save).mockImplementationOnce(() => { throw new Error('周报保存失败'); });
    const failed = handle!.actions.send('继续这一周的生活'); f.finishReply(reply); await failed;
    expect(handle!.model.notice).toBe('周报保存失败');
    expect(JSON.stringify(handle!.model.state)).toBe(before);
    expect(weeklyMemoryContext(handle!.model.state).pending).toEqual(evidence);
    const retried = handle!.actions.send('继续这一周的生活'); f.finishReply(reply); await retried;
    expect(weeklyMemoryContext(handle!.model.state).pending).toBeNull();
    expect(weeklyMemoryContext(handle!.model.state).summaries).toEqual([{ week: 1, text: reply.weeklySummary!.text }]);
    expect(handle!.model.state.story.filter(row => row.text === reply.text)).toHaveLength(1);
    expect(f.bridge.save).toHaveBeenCalledTimes(2);
  });

  it('discards a late weekly summary after a chat switch without consuming its evidence', async () => {
    const f = weeklyFixture();
    const before = JSON.stringify(handle!.model.state);
    const pending = handle!.actions.send('继续');
    f.change();
    f.finishReply({ text: '迟到的正文。', phoneMessages: [], weeklySummary: { week: 1, text: '迟到的摘要。' } });
    await pending;
    expect(JSON.stringify(handle!.model.state)).toBe(before);
    expect(f.bridge.save).not.toHaveBeenCalled();
    expect(f.bridge.cancel).toHaveBeenCalled();
  });

  it('model sleep, narrative and phone commit together only after save; retry and refresh do not duplicate the action', async () => {
    const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn());
    const before = JSON.stringify(handle.model.state);
    const reply: GeneratedStory = { text: '睡了十小时后醒来，手机收到新消息。', phoneMessages: [{ npcId: 'lin', text: '醒了联系我。' }], worldActions: [{ type: 'rest', kind: 'sleep', minutes: 600 }] };
    vi.mocked(f.bridge.save).mockImplementationOnce(() => { throw new Error('模拟写入失败'); });
    const failed = handle.actions.send('睡了10小时'); f.finishReply(reply); await failed;
    expect(JSON.stringify(handle.model.state)).toBe(before); expect(handle.model.notice).toBe('模拟写入失败');
    const retried = handle.actions.send('睡了10小时'); f.finishReply(reply); await retried;
    expect(handle.model.state.clock).toEqual({ day: 2, hour: 3, minute: 20 });
    expect(handle.model.state.phone.filter(item => item.text === '醒了联系我。')).toHaveLength(1);
    expect(handle.model.state.story.filter(item => item.text === reply.text)).toHaveLength(1);
    const accepted = JSON.parse(JSON.stringify(handle.model.state));
    f.bridge.load = () => accepted;
    const saves = vi.mocked(f.bridge.save).mock.calls.length;
    handle.dispose(); handle = mountShell(window, window, f.bridge, vi.fn());
    expect(handle.model.state).toEqual(accepted); expect(f.bridge.save).toHaveBeenCalledTimes(saves);
  });
  it('rejects partial model actions and discards actionable replies after a chat switch', async () => {
    const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn());
    const before = JSON.stringify(handle.model.state);
    const invalid = handle.actions.send('睡一小时并喝水');
    f.finishReply({ text: '睡醒喝了汽水。', phoneMessages: [], worldActions: [{ type: 'rest', kind: 'sleep', minutes: 60 }, { type: 'use', itemId: 'drink-basic' }] });
    await invalid;
    expect(JSON.stringify(handle.model.state)).toBe(before); expect(f.bridge.save).not.toHaveBeenCalled();
    const late = handle.actions.send('睡10小时');
    f.change(); f.finishReply({ text: '醒了。', phoneMessages: [], worldActions: [{ type: 'rest', kind: 'sleep', minutes: 600 }] }); await late;
    expect(JSON.stringify(handle.model.state)).toBe(before); expect(f.bridge.save).not.toHaveBeenCalled();
  });
  it('专业选择与学习先保存再发布；写入失败不确认选科、不增加学习进度或扣资源', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn());
    const initial = JSON.stringify(handle.model.state);
    vi.mocked(f.bridge.save).mockImplementationOnce(() => { throw new Error('学业存档写入失败'); });
    handle.actions.dispatch({ type: 'choose_academics', majorId: 'computer-science' });
    expect(JSON.stringify(handle.model.state)).toBe(initial);
    expect(handle.model.notice).toBe('学业存档写入失败');
    handle.actions.dispatch({ type: 'choose_academics', majorId: 'computer-science' });
    expect(handle.model.state.academics).toMatchObject({ subjects: [{ subjectId: 'cs-programming', points: 0 }, { subjectId: 'cs-algorithms', points: 0 }, { subjectId: 'cs-networks', points: 0 }], lastGain: null });
    handle.actions.dispatch({ type: 'novel_travel', locationId: 'classroom' });
    handle.actions.dispatch({ type: 'novel_approach', interactionId: 'classroom-notes' });
    const beforeStudy = JSON.stringify(handle.model.state);
    vi.mocked(f.bridge.save).mockImplementationOnce(() => { throw new Error('学习存档写入失败'); });
    handle.actions.dispatch({ type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' });
    expect(JSON.stringify(handle.model.state)).toBe(beforeStudy);
    expect(handle.model.notice).toBe('学习存档写入失败');
    handle.actions.dispatch({ type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' });
    expect(handle.model.state.academics).toMatchObject({ subjects: [{ subjectId: 'cs-programming', points: 15 }, { subjectId: 'cs-algorithms', points: 0 }, { subjectId: 'cs-networks', points: 0 }], lastGain: { points: 15, totalPoints: 15 } });
    expect(handle.model.notice).toBe('');
  });
  it('跨科阅读保存失败不扣资源或加科，成功后重进不重复抽样', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn());
    handle.actions.dispatch({ type: 'choose_academics', majorId: 'computer-science' });
    handle.actions.dispatch({ type: 'novel_travel', locationId: 'bookshop' });
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(.3);
    const before = JSON.stringify(handle.model.state);
    vi.mocked(f.bridge.save).mockImplementationOnce(() => { throw new Error('跨科保存失败'); });
    handle.actions.dispatch({ type: 'read_subject', subjectId: 'music-theory', optionId: 'study-short' });
    expect(JSON.stringify(handle.model.state)).toBe(before); expect(handle.model.notice).toBe('跨科保存失败');
    expect(random).toHaveBeenCalledTimes(2);
    random.mockReset().mockReturnValueOnce(0).mockReturnValueOnce(0);
    handle.actions.dispatch({ type: 'read_subject', subjectId: 'music-theory', optionId: 'study-short' });
    expect(handle.model.state.academics!.lastGain).toMatchObject({ outcome: 'inspiration', points: 22.5, channel: 'bookshop' });
    expect(random).toHaveBeenCalledTimes(2);
    const accepted = handle.model.state;
    const saves = vi.mocked(f.bridge.save).mock.calls.length;
    f.bridge.load = () => JSON.parse(JSON.stringify(accepted));
    handle.dispose(); handle = mountShell(window, window, f.bridge, vi.fn());
    expect(handle.model.state).toEqual(accepted);
    expect(f.bridge.save).toHaveBeenCalledTimes(saves);
  });
  it('小说地图出行一次保存，保存失败全量回滚；后台、忙碌和退出后不执行', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const f = fixture();
    handle = mountShell(window, window, f.bridge, vi.fn());
    const initial = JSON.stringify(handle.model.state);
    vi.mocked(f.bridge.save).mockImplementationOnce(() => { throw new Error('暂时无法写入存档'); });
    handle.actions.dispatch({ type: 'novel_travel', locationId: 'home' });
    expect(JSON.stringify(handle.model.state)).toBe(initial);
    expect(handle.model.notice).toBe('暂时无法写入存档');
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
    hidden.mockReturnValue(true);
    handle.actions.dispatch({ type: 'novel_travel', locationId: 'home' });
    hidden.mockReturnValue(false);
    const pending = handle.actions.send('看看附近');
    handle.actions.dispatch({ type: 'novel_travel', locationId: 'home' });
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
    f.finish('仍站在校园南门。'); await pending;
    vi.mocked(f.bridge.save).mockClear();
    handle.actions.dispatch({ type: 'novel_travel', locationId: 'home' });
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
    expect(handle.model.state.locationId).toBe('home');
    expect(handle.model.state.transit.sequence).toBe(1);
    expect(handle.model.notice).toBe('');
    const beforeExit = JSON.stringify(handle.model.state);
    handle.dispose();
    handle.actions.dispatch({ type: 'novel_travel', locationId: 'commercial' });
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(handle.model.state)).toBe(beforeExit);
  });

  it('空中随机事件先保存再呈现，等待期间不反复写存档或推进剧情时间', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const f = fixture(); f.bridge.generate = vi.fn(f.bridge.generate);
    handle = mountShell(window, window, f.bridge, vi.fn());
    const clock = { ...handle.model.state.clock };
    const initialPlayer = { ...handle.model.state.player };
    vi.advanceTimersByTime(5000);
    expect(handle.model.state.airTraffic.sequence).toBe(0);
    expect(handle.model.state.airTraffic.nextAmbientAt).toBeGreaterThan(Date.now());
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
    vi.mocked(f.bridge.save).mockImplementation(next => {
      expect(next.airTraffic.sequence).toBe(1);
      expect(handle!.model.state.airTraffic.sequence).toBe(0);
    });
    vi.setSystemTime(handle.model.state.airTraffic.nextAmbientAt);
    vi.advanceTimersByTime(5000);
    expect(handle.model.state.airTraffic.sequence).toBe(1);
    expect(handle.model.state.airTraffic.lastFlight?.source).toBe('ambient');
    vi.advanceTimersByTime(60000);
    expect(f.bridge.save).toHaveBeenCalledTimes(2);
    expect(handle.model.state.clock).toEqual(clock);
    expect(handle.model.state.player).toEqual(initialPlayer);
    expect(f.bridge.generate).not.toHaveBeenCalled();
  });

  it('后台和生成过程中暂停空中调度，退出后清理计时器', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn());
    vi.advanceTimersByTime(10000);
    expect(f.bridge.save).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    const pending = handle.actions.send('看向天空');
    vi.advanceTimersByTime(10000);
    expect(f.bridge.save).not.toHaveBeenCalled();
    f.finish('树梢之上是安静的天空。'); await pending;
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
    handle.dispose();
    vi.advanceTimersByTime(400000);
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
  });

  it('空中事件保存失败不呈现飞机，旧聊天的定时回调不能写新聊天', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const f = fixture();
    f.bridge.save = vi.fn(() => { throw new Error('模拟存档写入失败'); });
    handle = mountShell(window, window, f.bridge, vi.fn());
    const before = JSON.stringify(handle.model.state);
    vi.advanceTimersByTime(5000);
    expect(JSON.stringify(handle.model.state)).toBe(before);
    expect(handle.model.notice).toBe('模拟存档写入失败');
    f.change(); vi.advanceTimersByTime(400000);
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
  });

  it.each(['string', 'foreign-error', 'serialized-error'] as const)('生成失败保留 %s 原因，不保存半轮剧情且能解除忙碌', async kind => {
    const frame = document.createElement('iframe'); document.body.append(frame);
    const foreignError = new (frame.contentWindow as unknown as { Error: ErrorConstructor }).Error('模型服务暂不可用，请检查连接。');
    const failure = kind === 'string' ? '模型服务暂不可用，请检查连接。' : kind === 'foreign-error' ? foreignError : { message: '模型服务暂不可用，请检查连接。' };
    if (kind === 'foreign-error') expect(failure instanceof Error).toBe(false);
    const { bridge } = fixture(); bridge.generate = async () => { throw failure; };
    handle = mountShell(window, window, bridge, vi.fn());
    const initial = JSON.stringify(handle.model.state);
    await handle.actions.send('看看周围');
    expect(handle.model.notice).toBe('模型服务暂不可用，请检查连接。');
    expect(handle.model.busy).toBe(false);
    expect(JSON.stringify(handle.model.state)).toBe(initial);
    expect(bridge.save).not.toHaveBeenCalled();
  });

  it('退出恢复滚动、焦点，且原生聊天节点保持原样', async () => {
    const native = document.createElement('input'); document.body.append(native); native.focus();
    document.body.style.setProperty('overflow', 'scroll');
    const { bridge } = fixture(); const onExit = vi.fn();
    handle = mountShell(window, window, bridge, onExit);
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.querySelector('[data-unread-city-rescue]')).toBeNull();
    expect(document.querySelector('[data-unread-city-root]')).not.toBeNull();
    handle.dispose(); handle.dispose();
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.activeElement).toBe(native);
    expect(native.isConnected).toBe(true);
    expect(document.querySelector('[data-unread-city-root]')).toBeNull();
    expect(bridge.dispose).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('切换聊天后丢弃生成中的迟到回应，不提交旧状态', async () => {
    const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn());
    const pending = handle.actions.send('去窗边看看');
    expect(handle.model.busy).toBe(true);
    f.change(); f.finish('不应写入任何聊天'); await pending;
    expect(f.bridge.save).not.toHaveBeenCalled();
    expect(f.bridge.cancel).toHaveBeenCalled();
    expect(document.querySelector('[data-unread-city-root]')).toBeNull();
  });

  it('读取存档失败时不会接管原生 UI 或覆盖存档', () => {
    const { bridge } = fixture(); bridge.load = () => { throw new Error('存档损坏'); };
    expect(() => mountShell(window, window, bridge, vi.fn())).toThrow('存档损坏');
    expect(document.body.style.overflow).toBe('');
    expect(document.querySelector('[data-unread-city-root]')).toBeNull();
    expect(bridge.save).not.toHaveBeenCalled();
  });

  it('无独立恢复按钮，切换聊天和 Esc 都能退出且不覆盖其他扩展的新样式', () => {
    const { bridge } = fixture(); handle = mountShell(window, window, bridge, vi.fn());
    expect(document.querySelector('[data-unread-city-rescue]')).toBeNull();
    document.body.style.setProperty('overflow', 'auto');
    handle.actions.switchChat();
    expect(document.body.style.overflow).toBe('auto');
    handle = mountShell(window, window, fixture().bridge, vi.fn());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[data-unread-city-root]')).toBeNull();
  });

  it('失去挂载节点时自动清理并恢复', async () => {
    const { bridge } = fixture(); handle = mountShell(window, window, bridge, vi.fn());
    document.querySelector('[data-unread-city-root]')!.remove();
    await Promise.resolve();
    expect(document.querySelector('[data-unread-city-rescue]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(bridge.dispose).toHaveBeenCalledTimes(1);
  });

  it('Vue 同步启动故障完整恢复，随后仍能重新挂载', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    component.fail = true;
    expect(() => mountShell(window, window, fixture().bridge, vi.fn())).toThrow(/启动失败/);
    expect(document.querySelector('[data-unread-city-root]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    component.fail = false;
    handle = mountShell(window, window, fixture().bridge, vi.fn());
    expect(document.querySelectorAll('[data-unread-city-root]')).toHaveLength(1);
  });

  it('局域网 HTTP 不提供 randomUUID 时仍可保存叙事', async () => {
    vi.stubGlobal('crypto', {});
    const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn());
    const pending = handle.actions.send('手机局域网访问');
    f.finish('无需安全上下文也可完成'); await pending;
    expect(f.bridge.save).toHaveBeenCalledTimes(1);
    expect(handle.model.state.story.at(-1)?.text).toBe('无需安全上下文也可完成');
    expect(new Set(handle.model.state.story.map(entry => entry.id)).size).toBe(handle.model.state.story.length);
    expect(handle.model.notice).toBe('');
  });

  it('手机嵌入时保留 Shell 和世界会话，收起只释放手机', () => {
    const phone = phoneFixture();
    const { bridge } = fixture(); handle = mountShell(window, window, bridge, vi.fn());
    expect(handle.model.externalPhoneAvailable).toBe(true);
    handle.actions.openPhone(phone.anchor());
    expect(handle.model.externalPhoneOpen).toBe(true);
    expect(document.querySelectorAll('[data-unread-city-root]')).toHaveLength(1);
    expect(document.body.style.overflow).toBe('hidden');
    expect(bridge.dispose).not.toHaveBeenCalled();
    expect(phone.leases[0].focus).toHaveBeenCalledTimes(1);
    handle.actions.closePhone();
    expect(phone.leases[0].release).toHaveBeenCalledTimes(1);
    expect(handle.model.externalPhoneOpen).toBe(false);
    expect(bridge.dispose).not.toHaveBeenCalled();
  });

  it('手机入口不存在时保持当前界面并给出提示', () => {
    handle = mountShell(window, window, fixture().bridge, vi.fn());
    handle.actions.openPhone();
    expect(handle.model.notice).toContain('小手机尚未连接');
    expect(document.querySelectorAll('[data-unread-city-root]')).toHaveLength(1);
  });

  it('Esc 先收起手机，再退出 Shell', () => {
    const phone = phoneFixture(); handle = mountShell(window, window, fixture().bridge, vi.fn());
    handle.actions.openPhone(phone.anchor());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(handle.model.externalPhoneOpen).toBe(false);
    expect(document.querySelectorAll('[data-unread-city-root]')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[data-unread-city-root]')).toBeNull();
    expect(phone.leases[0].release).toHaveBeenCalledTimes(1);
  });

  it('Esc 依次释放真实手机、关闭当前浮窗或专注阅读，最后恢复原生界面', () => {
    const phone = phoneFixture(); handle = mountShell(window, window, fixture().bridge, vi.fn());
    const dismiss = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    handle.actions.setDismissHandler?.(dismiss);
    handle.actions.openPhone(phone.anchor());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(phone.leases[0].release).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
    expect(document.querySelector('[data-unread-city-root]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-unread-city-root]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dismiss).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-unread-city-root]')).toBeNull();
  });

  it('重复打开复用同一挂载，旧手机关闭回调不能关闭新挂载', () => {
    const phone = phoneFixture(); handle = mountShell(window, window, fixture().bridge, vi.fn());
    const anchor = phone.anchor(); handle.actions.openPhone(anchor); handle.actions.openPhone(anchor);
    expect(phone.api.mount).toHaveBeenCalledTimes(1);
    expect(phone.leases[0].sync).toHaveBeenCalledTimes(1);
    handle.actions.closePhone(); handle.actions.openPhone(anchor);
    phone.callbacks[0]();
    expect(handle.model.externalPhoneOpen).toBe(true);
    expect(phone.leases[1].release).not.toHaveBeenCalled();
    phone.callbacks[1]();
    expect(handle.model.externalPhoneOpen).toBe(false);
    expect(document.querySelectorAll('[data-unread-city-root]')).toHaveLength(1);
  });

  it('聊天切换及插件卸载都清理手机，且原生输入不会取得后台焦点', async () => {
    const native = document.createElement('input'); document.body.append(native);
    const phone = phoneFixture(); const f = fixture(); handle = mountShell(window, window, f.bridge, vi.fn());
    handle.actions.openPhone(phone.anchor());
    native.focus(); expect(document.activeElement).not.toBe(native);
    delete (window as Window & { STiPhoniePanelHost?: unknown }).STiPhoniePanelHost;
    document.body.append(document.createElement('div')); await Promise.resolve();
    expect(phone.leases[0].release).toHaveBeenCalledTimes(1);
    expect(handle.model.externalPhoneAvailable).toBe(false);
    expect(handle.model.externalPhoneOpen).toBe(false);
    (window as Window & { STiPhoniePanelHost?: unknown }).STiPhoniePanelHost = phone.api;
    handle.actions.openPhone(phone.anchor()); f.change();
    expect(phone.leases[1].release).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-unread-city-root]')).toBeNull();
  });

  it('拒绝错误的挂载区域，手机启动故障不影响退出', () => {
    const phone = phoneFixture(); handle = mountShell(window, window, fixture().bridge, vi.fn());
    handle.actions.openPhone(document.createElement('div'));
    expect(phone.api.mount).not.toHaveBeenCalled();
    phone.api.mount.mockImplementation(() => { throw new Error('模拟手机启动失败'); });
    handle.actions.openPhone(phone.anchor());
    expect(handle.model.notice).toBe('模拟手机启动失败');
    expect(handle.model.externalPhoneOpen).toBe(false);
    handle.actions.exit();
    expect(document.querySelector('[data-unread-city-root]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});
