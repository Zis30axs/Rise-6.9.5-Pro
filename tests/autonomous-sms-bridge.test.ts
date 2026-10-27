import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTavernBridge } from '../src/runtime/bridge';
import { createInitialState, reduceState } from '../src/runtime/model';
import { enableProtagonists, gameMinute, personState } from '../src/runtime/protagonist-world';

function reservedState() {
  const state = reduceState(enableProtagonists(createInitialState()), { type: 'switch_protagonist', target: 'emma' });
  const at = gameMinute(state);
  state.autonomousSms = {
    version: 1, nextAt: at + 90, history: [],
    pending: { id: `auto:emma:${at}`, owner: 'emma', at, kind: 'npc', peerId: 'majo-yuki' },
  };
  return state;
}

function helper(includeRaw = true) {
  let chatId = 'chat-a';
  let changed: (() => void) | undefined;
  const generate = vi.fn(async (_config: unknown) => '<story>窗外很安静。</story><phone_messages>[]</phone_messages>');
  const generateRaw = vi.fn(async (_config: unknown) => '<autonomous_sms>{"id":"unused","text":null}</autonomous_sms>');
  const stopGenerationById = vi.fn(() => true);
  const script = {
    parent: { SillyTavern: { getContext: () => ({
      characterId: 0, characters: { 0: { avatar: 'unread-city.png' } }, chatId, mainApi: 'openai',
    }) } },
    getVariables: () => ({}), replaceVariables: vi.fn(),
    eventOn: (_event: string, callback: () => void) => { changed = callback; },
    eventRemoveListener: vi.fn(), tavern_events: { CHAT_CHANGED: 'chat_changed' },
    generate, stopGenerationById, ...(includeRaw ? { generateRaw } : {}),
  } as unknown as Window;
  const bridge = createTavernBridge(script)!;
  expect(bridge).toBeTruthy();
  return { bridge, generate, generateRaw, stopGenerationById,
    switchChat: () => { chatId = 'chat-b'; changed!(); } };
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('autonomous SMS transport privacy', () => {
  it('uses explicit raw prompts and excludes private state, inherited lore and history', async () => {
    const state = reservedState(), id = state.autonomousSms!.pending!.id;
    state.journal.push({ id: 'recipient-secret', at: '第 1 天 08:00', text: 'RECIPIENT_PRIVATE_JOURNAL' });
    personState(state, 'renako').journal.push({ id: 'other-secret', at: '第 1 天 08:00', text: 'OTHER_PRIVATE_JOURNAL' });
    const h = helper();
    h.generateRaw.mockResolvedValue(`<autonomous_sms>${JSON.stringify({ id, text: '晚点回来一起吃饭吧。' })}</autonomous_sms>`);
    const reply = await h.bridge.generate('', state, { kind: 'autonomous_sms', ticketId: id });
    expect(reply).toMatchObject({ text: '', phoneMessages: [], autonomousSmsText: '晚点回来一起吃饭吧。' });
    expect(h.generate).not.toHaveBeenCalled();
    const config = h.generateRaw.mock.calls[0]![0] as unknown as {
      ordered_prompts: { role: string; content: string }[];
      overrides: unknown; max_chat_history: number;
    };
    expect(config.ordered_prompts.map(row => row.role)).toEqual(['system', 'user']);
    expect(config.max_chat_history).toBe(0);
    expect(config.overrides).toEqual({ chat_history: { with_depth_entries: false, author_note: '', prompts: [] } });
    const payload = JSON.stringify(config);
    expect(payload).not.toContain('RECIPIENT_PRIVATE_JOURNAL');
    expect(payload).not.toContain('OTHER_PRIVATE_JOURNAL');
    expect(payload).not.toContain('weeklyMemory');
    expect(config.ordered_prompts[0]!.content).toContain('独立运行的私人短信子任务');
    h.bridge.dispose();
  });

  it('skips the task when isolated generation is unavailable, while retaining normal narrative generation', async () => {
    const state = reservedState(), h = helper(false);
    await expect(h.bridge.generate('', state, { kind: 'autonomous_sms', ticketId: state.autonomousSms!.pending!.id }))
      .rejects.toThrow('隔离生成接口');
    expect(h.generate).not.toHaveBeenCalled();
    expect((await h.bridge.generate('看看窗外。', state)).text).toBe('窗外很安静。');
    expect(h.generate).toHaveBeenCalledTimes(1);
    h.bridge.dispose();
  });

  it('rejects stale tickets before registering a cancellable request', async () => {
    const state = reservedState(), h = helper();
    await expect(h.bridge.generate('', state, { kind: 'autonomous_sms', ticketId: 'auto:emma:0' }))
      .rejects.toThrow('已过期');
    expect(h.generateRaw).not.toHaveBeenCalled();
    expect((await h.bridge.generate('看看窗外。', state)).text).toBe('窗外很安静。');
    // No abandoned SMS cancellation is waiting behind the later main request.
    expect(h.stopGenerationById).not.toHaveBeenCalled();
    h.bridge.dispose();
  });

  it.each(['chat', 'responses'] as const)('sends custom %s API tasks without the narrative preset and does not change saved settings', async format => {
    const state = reservedState(), id = state.autonomousSms!.pending!.id, h = helper(false);
    const settings = { mode: 'custom', format, endpoint: 'https://model.example/v1', model: 'test', preset: 'PRIVATE_NARRATIVE_PRESET' };
    localStorage.setItem('unread-city:story-api:v1', JSON.stringify(settings));
    const responseText = `<autonomous_sms>${JSON.stringify({ id, text: null })}</autonomous_sms>`;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(format === 'chat'
      ? { choices: [{ message: { content: responseText } }] }
      : { output_text: responseText }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await h.bridge.generate('', state, { kind: 'autonomous_sms', ticketId: id })).autonomousSmsText).toBeNull();
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.generateRaw).not.toHaveBeenCalled();
    const request = fetchMock.mock.calls[0]![1] as unknown as RequestInit;
    expect(fetchMock.mock.calls[0]![0]).toBe(`https://model.example/v1/${format === 'chat' ? 'chat/completions' : 'responses'}`);
    expect(request.body).not.toContain(settings.preset);
    expect(JSON.parse(localStorage.getItem('unread-city:story-api:v1')!)).toEqual(settings);
    h.bridge.dispose();
  });

  it('rejects a late isolated completion and cancels its own generation on chat switch', async () => {
    const state = reservedState(), id = state.autonomousSms!.pending!.id, h = helper();
    let complete!: (value: string) => void;
    h.generateRaw.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const response = h.bridge.generate('', state, { kind: 'autonomous_sms', ticketId: id });
    const rejected = expect(response).rejects.toMatchObject({ name: 'AbortError' });
    h.switchChat();
    complete(`<autonomous_sms>${JSON.stringify({ id, text: '迟到短信' })}</autonomous_sms>`);
    await rejected;
    expect(h.stopGenerationById).toHaveBeenCalledTimes(1);
    expect(h.generate).not.toHaveBeenCalled();
    h.bridge.dispose();
  });

  it('times out an unresponsive SMS generation and permits later narrative requests', async () => {
    vi.useFakeTimers();
    const state = reservedState(), id = state.autonomousSms!.pending!.id, h = helper();
    h.generateRaw.mockImplementation(() => new Promise(() => {}));
    const response = h.bridge.generate('', state, { kind: 'autonomous_sms', ticketId: id });
    const rejected = expect(response).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(h.stopGenerationById).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(h.stopGenerationById).toHaveBeenCalledTimes(1);
    const rawRequest = h.generateRaw.mock.calls[0]![0] as { generation_id: string };
    expect(h.stopGenerationById).toHaveBeenCalledWith(rawRequest.generation_id);
    expect((await h.bridge.generate('看看窗外。', state)).text).toBe('窗外很安静。');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.stopGenerationById).toHaveBeenCalledTimes(1);
    h.bridge.dispose();
  });

  it('clears the old SMS timeout when a main generation preempts it', async () => {
    vi.useFakeTimers();
    const state = reservedState(), id = state.autonomousSms!.pending!.id, h = helper();
    h.generateRaw.mockImplementation(() => new Promise(() => {}));
    const sms = h.bridge.generate('', state, { kind: 'autonomous_sms', ticketId: id });
    const rejected = expect(sms).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(60_000);
    let completeMain!: (value: string) => void;
    h.generate.mockImplementation(() => new Promise(resolve => { completeMain = resolve; }));
    const main = h.bridge.generate('看看窗外。', state);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(h.stopGenerationById).toHaveBeenCalledTimes(1);
    completeMain('<story>窗外很安静。</story><phone_messages>[]</phone_messages>');
    expect((await main).text).toBe('窗外很安静。');
    h.bridge.dispose();
  });
});
