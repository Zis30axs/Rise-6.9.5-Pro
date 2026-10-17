import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bridge, GeneratedStory } from '../src/frontend/types';
import { createInitialState } from '../src/runtime/model';

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
afterEach(() => { handle?.dispose(); handle = undefined; component.fail = false; document.body.innerHTML = ''; document.body.style.cssText = ''; delete (window as Window & { STiPhoniePanelHost?: unknown }).STiPhoniePanelHost; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
  return { bridge, change: () => { current = 'b'; change?.(); }, finish: (text: string) => finish?.({ text, phoneMessages: [] }) };
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

describe('Immersive Shell 生命周期', () => {
  it('退出恢复滚动、焦点，且原生聊天节点保持原样', async () => {
    const native = document.createElement('input'); document.body.append(native); native.focus();
    document.body.style.setProperty('overflow', 'scroll');
    const { bridge } = fixture(); const onExit = vi.fn();
    handle = mountShell(window, window, bridge, onExit);
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.querySelector('[data-unread-city-rescue]')).not.toBeNull();
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

  it('独立恢复按钮与 Esc 均可退出，且不覆盖其他扩展的新样式', () => {
    const { bridge } = fixture(); handle = mountShell(window, window, bridge, vi.fn());
    document.body.style.setProperty('overflow', 'auto');
    document.querySelector<HTMLButtonElement>('[data-unread-city-rescue]')!.click();
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
