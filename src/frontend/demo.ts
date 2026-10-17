import type { Bridge, WorldState } from './types';
import { createInitialState, parseState } from '../runtime/model';

/** Explicit preview host. Never selected implicitly inside a Tavern iframe. */
export function createDemoHost() {
  const saves = new Map<string, WorldState>();
  const listeners = new Set<() => void>();
  let current = 'demo-a';
  let failNext = false;

  function switchChat(id: string) {
    if (id !== 'demo-a' && id !== 'demo-b') return;
    if (current === id) return;
    current = id;
    for (const listener of [...listeners]) listener();
  }

  function createBridge(): Bridge {
    const bound = current;
    let epoch = 0;
    let disposed = false;
    const subscriptions = new Set<() => void>();
    const assertCurrent = () => {
      if (disposed || bound !== current) throw new Error('聊天已切换，请重新进入。');
    };
    return {
      kind: 'demo', label: '本地演示 · 未连接模型',
      session: () => current,
      load() { assertCurrent(); return parseState(saves.get(bound) ?? createInitialState()); },
      save(state) { assertCurrent(); saves.set(bound, parseState(state)); },
      onSessionChange(callback) {
        const listener = () => { epoch++; callback(); };
        listeners.add(listener); subscriptions.add(listener);
        return () => { listeners.delete(listener); subscriptions.delete(listener); };
      },
      async generate(text, state) {
        assertCurrent();
        const request = ++epoch;
        const shouldFail = failNext; failNext = false;
        await new Promise(resolve => window.setTimeout(resolve, 650));
        assertCurrent();
        if (request !== epoch) throw new Error('本次生成已取消。');
        if (shouldFail) throw new Error('演示：模拟连接失败。进度没有丢失，可以重试。');
        const time = `${String(state.clock.hour).padStart(2, '0')}:${String(state.clock.minute).padStart(2, '0')}`;
        return {
          text: `【演示回应 / 未调用模型】${time}，窗外的风把纸页翻过一角。你选择了“${text.slice(0, 160)}”。这段文字仅用于验证交互流程；连接酒馆后将由当前配置的 Chat Completion 模型回应。`,
          phoneMessages: [],
        };
      },
      cancel() { epoch++; },
      dispose() {
        disposed = true; epoch++;
        for (const listener of subscriptions) listeners.delete(listener);
        subscriptions.clear();
      },
    };
  }
  return { createBridge, switchChat, current: () => current, failNext: () => { failNext = true; } };
}
