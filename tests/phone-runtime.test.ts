import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { nextTick } from 'vue';
import type { Bridge } from '../src/frontend/types';
import { createInitialState } from '../src/runtime/model';

vi.mock('../src/frontend/App.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return { default: defineComponent({ setup: () => () => h('div', '手机生命周期测试') }) };
});

vi.mock('../src/frontend/generated/embedded-phone', () => ({
  embeddedPhoneRuntimeSource: '/* bundled phone test fixture */',
  embeddedPhoneRuntimeMetadata: { name: 'ST-iPhonie', version: 'test' },
}));
import { createPhoneRuntime, type PhoneRuntime, type PhonePanelHost } from '../src/frontend/phone-runtime';
import { mountShell, type ShellHandle } from '../src/frontend/lifecycle';

type Panel = { mount: Mock<PhonePanelHost['mount']> };
type Embedded = { ready: Promise<Panel>; dispose: ReturnType<typeof vi.fn> };
const phoneWindow = window as Window & {
  STiPhoniePanelHost?: Panel;
  __stIphoniePanelBridge?: { connect(): unknown };
  __unreadCityEmbeddedPhoneRuntime?: Embedded;
};
const managers: ReturnType<typeof createPhoneRuntime>[] = [];
const shells: ShellHandle[] = [];
const panel = (): Panel => ({ mount: vi.fn<PhonePanelHost['mount']>(() => ({ release: vi.fn(), sync: vi.fn(), focus: vi.fn() })) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function runtime() {
  const value = createPhoneRuntime(window, window);
  managers.push(value);
  return value;
}
function publish(embedded: Embedded) {
  phoneWindow.__unreadCityEmbeddedPhoneRuntime = embedded;
  embedded.ready = embedded.ready.then(api => {
    if (phoneWindow.__unreadCityEmbeddedPhoneRuntime === embedded) phoneWindow.STiPhoniePanelHost = api;
    return api;
  });
}
let insert: (() => void) | undefined;
let injected: HTMLScriptElement[];
beforeEach(() => {
  injected = [];
  const seen = new WeakSet<Node>();
  const observe = (node: Node) => {
    if (!(node instanceof HTMLScriptElement) || !node.hasAttribute('data-unread-city-embedded-phone') || seen.has(node)) return;
    seen.add(node); injected.push(node); insert?.();
  };
  const appendChild = Node.prototype.appendChild;
  vi.spyOn(Node.prototype, 'appendChild').mockImplementation(function <T extends Node>(this: Node, node: T): T {
    const result = appendChild.call(this, node) as T;
    observe(node); return result;
  });
  const append = Element.prototype.append;
  vi.spyOn(Element.prototype, 'append').mockImplementation(function (this: Element, ...nodes: (Node | string)[]) {
    append.apply(this, nodes);
    for (const node of nodes) if (typeof node !== 'string') observe(node);
  });
});
afterEach(async () => {
  for (const shell of shells.splice(0)) shell.dispose();
  await Promise.all(managers.splice(0).map(manager => manager.dispose()));
  delete phoneWindow.STiPhoniePanelHost;
  delete phoneWindow.__stIphoniePanelBridge;
  delete phoneWindow.__unreadCityEmbeddedPhoneRuntime;
  document.querySelectorAll('[data-unread-city-embedded-phone]').forEach(node => node.remove());
  insert = undefined;
  document.body.innerHTML = '';
  document.body.style.cssText = '';
  vi.restoreAllMocks();
});

describe('内嵌手机运行时的宿主与生命周期', () => {
  it('已安装的旧手机只有后端桥时，不启动第二份并发后台', async () => {
    const oldBridge = { connect: vi.fn() };
    phoneWindow.__stIphoniePanelBridge = oldBridge;
    const manager = runtime();
    await expect(manager.ensure()).rejects.toThrow();
    expect(injected).toHaveLength(0);
    expect(oldBridge.connect).not.toHaveBeenCalled();
    expect(phoneWindow.__stIphoniePanelBridge).toBe(oldBridge);
  });

  it('优先复用现有扩展，不注入第二份手机或卸载扩展', async () => {
    const existing = panel();
    phoneWindow.STiPhoniePanelHost = existing;
    const manager = runtime();
    expect(manager.available()).toBe(existing);
    expect(await manager.ensure()).toBe(existing);
    expect(manager.source()).toBe('extension');
    await manager.dispose();
    expect(injected).toHaveLength(0);
    expect(phoneWindow.STiPhoniePanelHost).toBe(existing);
  });

  it('缺少扩展时只注入一次，等待真实后端就绪再返回', async () => {
    const ready = deferred<Panel>();
    const api = panel();
    const embedded: Embedded = { ready: ready.promise, dispose: vi.fn(async () => {}) };
    insert = () => publish(embedded);
    const manager = runtime();
    expect(manager.available()).toBeNull();
    const first = manager.ensure();
    const second = manager.ensure();
    await vi.waitFor(() => expect(injected).toHaveLength(1));
    ready.resolve(api);
    expect(await first).toBe(api);
    expect(await second).toBe(api);
    expect(manager.available()).toBe(api);
    expect(manager.source()).toBe('embedded');
    await manager.dispose();
    expect(embedded.dispose).toHaveBeenCalledTimes(1);
  });

  it('启动失败可以重试，失败实例被清理且第二次能连接', async () => {
    const failed = deferred<Panel>();
    const first: Embedded = { ready: failed.promise, dispose: vi.fn(async () => {}) };
    const api = panel();
    const second: Embedded = { ready: Promise.resolve(api), dispose: vi.fn(async () => {}) };
    let attempt = 0;
    insert = () => publish(++attempt === 1 ? first : second);
    const manager = runtime();
    const pending = manager.ensure();
    const rejection = expect(pending).rejects.toThrow('模拟手机初始化失败');
    await vi.waitFor(() => expect(injected).toHaveLength(1));
    failed.reject(new Error('模拟手机初始化失败'));
    await rejection;
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(await manager.ensure()).toBe(api);
    expect(injected).toHaveLength(2);
  });

  it('启动途中退出会等待后台关闭，不把迟到的手机重新挂回页面', async () => {
    const ready = deferred<Panel>();
    const closing = deferred<void>();
    const embedded: Embedded = { ready: ready.promise, dispose: vi.fn(() => closing.promise) };
    insert = () => publish(embedded);
    const manager = runtime();
    const pending = manager.ensure();
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(injected).toHaveLength(1));
    let closed = false;
    const disposal = manager.dispose().then(() => { closed = true; });
    ready.resolve(panel());
    await vi.waitFor(() => expect(embedded.dispose).toHaveBeenCalledTimes(1));
    expect(closed).toBe(false);
    closing.resolve();
    await disposal;
    await rejected;
    expect(manager.available()).toBeNull();
    expect(document.querySelector('[data-unread-city-embedded-phone]')).toBeNull();
  });

  it('旧实例异步卸载不会删除新实例的手机宿主', async () => {
    const closing = deferred<void>();
    const oldApi = panel();
    const first: Embedded = { ready: Promise.resolve(oldApi), dispose: vi.fn(() => closing.promise) };
    insert = () => publish(first);
    const oldManager = runtime();
    expect(await oldManager.ensure()).toBe(oldApi);
    const disposal = oldManager.dispose();
    const newApi = panel();
    const replacement: Embedded = { ready: Promise.resolve(newApi), dispose: vi.fn(async () => {}) };
    phoneWindow.__unreadCityEmbeddedPhoneRuntime = replacement;
    phoneWindow.STiPhoniePanelHost = newApi;
    closing.resolve();
    await disposal;
    expect(phoneWindow.__unreadCityEmbeddedPhoneRuntime).toBe(replacement);
    expect(phoneWindow.STiPhoniePanelHost).toBe(newApi);
    expect(replacement.dispose).not.toHaveBeenCalled();
  });

  it('两个使用者等待旧后台卸载后，共用一份新后台并各自释放所有权', async () => {
    const closing = deferred<void>();
    const oldApi = panel();
    const first: Embedded = { ready: Promise.resolve(oldApi), dispose: vi.fn(async () => {
      await closing.promise;
      if (phoneWindow.STiPhoniePanelHost === oldApi) delete phoneWindow.STiPhoniePanelHost;
    }) };
    insert = () => publish(first);
    const oldManager = runtime();
    await oldManager.ensure();
    const disposing = oldManager.dispose();
    const freshApi = panel();
    const fresh: Embedded = { ready: Promise.resolve(freshApi), dispose: vi.fn(async () => {}) };
    insert = () => publish(fresh);
    const a = runtime(), b = runtime();
    const readyA = a.ensure(), readyB = b.ensure();
    closing.resolve();
    await disposing;
    expect(await readyA).toBe(freshApi);
    expect(await readyB).toBe(freshApi);
    expect(injected).toHaveLength(2); // one retired backend plus one replacement
    await a.dispose();
    expect(fresh.dispose).not.toHaveBeenCalled();
    expect(b.available()).toBe(freshApi);
    expect(await b.ensure()).toBe(freshApi);
    await b.dispose();
    expect(fresh.dispose).toHaveBeenCalledTimes(1);
  });
});

function shellFixture(phone: PhoneRuntime) {
  const bridge: Bridge = {
    kind: 'tavern', label: '助手测试', session: () => JSON.stringify(['embedded-phone.png', 'embedded-phone-test']),
    load: () => createInitialState(), save: vi.fn(), onSessionChange: () => vi.fn(),
    generate: vi.fn(async () => { throw new Error('本测试不调用模型'); }),
    cancel: vi.fn(), dispose: vi.fn(),
  };
  const shell = mountShell(window, window, bridge, vi.fn(), phone);
  shells.push(shell);
  const anchor = document.createElement('div');
  document.querySelector('[data-unread-city-root]')!.shadowRoot!.append(anchor);
  return { shell, anchor };
}
function loader(ready: Promise<Panel>): PhoneRuntime {
  return { available: () => null, ensure: vi.fn(() => ready), source: () => 'embedded', dispose: vi.fn(async () => {}) };
}

describe('Shell 异步手机载入', () => {
  it('没有外部扩展也会调用内嵌 ensure，并挂入已连接槽位', async () => {
    const api = panel(), phone = loader(Promise.resolve(api));
    const { shell, anchor } = shellFixture(phone);
    shell.actions.openPhone(anchor);
    // The hidden message link and visible window share the runtime's ensure.
    expect(phone.ensure).toHaveBeenCalledTimes(2);
    await nextTick();
    expect(api.mount).toHaveBeenCalledWith(anchor, expect.objectContaining({ onClose: expect.any(Function) }));
    expect(shell.model.externalPhoneOpen).toBe(true);
    expect(shell.model.phoneSource).toBe('embedded');
  });

  it.each(['close', 'exit'] as const)('载入中 %s 后，迟到的 ready 不会重新打开手机', async action => {
    const ready = deferred<Panel>(), phone = loader(ready.promise), api = panel();
    const { shell, anchor } = shellFixture(phone);
    shell.actions.openPhone(anchor);
    expect(shell.model.phoneStatus).toBe('loading');
    if (action === 'close') shell.actions.closePhone(); else shell.actions.exit();
    ready.resolve(api);
    await nextTick();
    expect(api.mount).not.toHaveBeenCalled();
    expect(shell.model.externalPhoneOpen).toBe(false);
  });

  it('加载错误显示可重试状态，重试成功清除错误', async () => {
    const api = panel(), phone = loader(Promise.resolve(api));
    vi.mocked(phone.ensure).mockRejectedValue(new Error('模拟启动失败'));
    const { shell, anchor } = shellFixture(phone);
    shell.actions.openPhone(anchor);
    await vi.waitFor(() => expect(shell.model.phoneStatus).toBe('error'));
    expect(shell.model.phoneError).toContain('模拟启动失败');
    vi.mocked(phone.ensure).mockResolvedValue(api);
    shell.actions.openPhone(anchor);
    await vi.waitFor(() => expect(shell.model.externalPhoneOpen).toBe(true));
    expect(phone.ensure).toHaveBeenCalledTimes(3);
    expect(shell.model.phoneError).toBe('');
  });
});
