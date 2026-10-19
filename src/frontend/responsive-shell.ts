import { mountShell as mountCoreShell, type ShellHandle } from './lifecycle';
import { bindShellViewport } from './shell-viewport';
import viewportCss from './viewport-layout.css?inline';
export type { ShellHandle } from './lifecycle';

/** Keep viewport ownership tied to the exact lifetime of this mounted Shell. */
export function mountShell(...args: Parameters<typeof mountCoreShell>): ShellHandle {
  const [hostWindow, ownerWindow, bridge, onExit, phoneRuntime] = args;
  let stopViewport: (() => void) | undefined;
  let viewportStyle: HTMLStyleElement | undefined;
  const cleanup = () => { stopViewport?.(); stopViewport = undefined; viewportStyle?.remove(); };
  const handle = mountCoreShell(hostWindow, ownerWindow, bridge, reason => {
    cleanup();
    onExit(reason);
  }, phoneRuntime);
  try {
    const root = hostWindow.document.querySelector<HTMLElement>('[data-unread-city-root]');
    const rescue = hostWindow.document.querySelector<HTMLButtonElement>('[data-unread-city-rescue]');
    if (!root?.shadowRoot || !rescue) throw new Error('沉浸界面视口初始化失败。');
    viewportStyle = hostWindow.document.createElement('style');
    viewportStyle.dataset.unreadCityViewport = '';
    viewportStyle.textContent = viewportCss;
    root.shadowRoot.append(viewportStyle);
    stopViewport = bindShellViewport(hostWindow, root, rescue);
    return handle;
  } catch (error) {
    cleanup();
    handle.dispose('视口初始化失败，已恢复原生界面。');
    throw error;
  }
}
