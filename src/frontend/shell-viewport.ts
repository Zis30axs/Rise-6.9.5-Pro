/** DOM-only viewport lease. Never edits the native Tavern document or the chat. */
export interface ShellViewportLease { refresh(): void; dispose(): void }
export interface ShellViewport { left: number; top: number; width: number; height: number }

const positive = (value: number | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

export function readShellViewport(win: Window): ShellViewport {
  const visual = win.visualViewport;
  const width = positive(win.innerWidth, positive(win.document.documentElement.clientWidth, 1));
  const height = positive(win.innerHeight, positive(win.document.documentElement.clientHeight, 1));
  const unzoomed = !visual || !Number.isFinite(visual.scale) || Math.abs(visual.scale - 1) < 0.01;
  return {
    left: unzoomed && Number.isFinite(visual?.offsetLeft) ? Math.max(0, visual!.offsetLeft) : 0,
    top: unzoomed && Number.isFinite(visual?.offsetTop) ? Math.max(0, visual!.offsetTop) : 0,
    width: Math.floor(unzoomed ? Math.min(width, positive(visual?.width, width)) : width),
    height: Math.floor(unzoomed ? Math.min(height, positive(visual?.height, height)) : height),
  };
}

/** Install viewport constraints on the Shell only. Works without a rescue button. */
export function bindShellViewport(win: Window, css: string): ShellViewportLease {
  const doc = win.document;
  const root = doc.querySelector<HTMLElement>('[data-unread-city-root]');
  const shadow = root?.shadowRoot;
  if (!root || !shadow) throw new Error('沉浸界面布局节点缺失，已停止挂载。');
  const runtime = win as Window & typeof globalThis;
  const originalRootStyle = root.getAttribute('style');
  const style = doc.createElement('style');
  style.textContent = css;
  root.setAttribute('data-uc-viewport', '');
  shadow.append(style);
  const safeProbe = doc.createElement('div');
  safeProbe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;box-sizing:content-box;padding:var(--uc-safe-top,0px) var(--uc-safe-right,0px) var(--uc-safe-bottom,0px) var(--uc-safe-left,0px);';
  shadow.append(safeProbe);
  let disposed = false;
  let frame: number | undefined;
  let observedDock: Element | null = null;
  let resizeObserver: ResizeObserver | undefined;
  let mutationObserver: MutationObserver | undefined;
  const visual = win.visualViewport;
  const px = (value: number) => Math.round(value * 100) / 100 + 'px';
  const set = (element: HTMLElement, key: string, value: string) => {
    if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
  };
  function refresh() {
    if (disposed || !root!.isConnected) return;
    const viewport = readShellViewport(win);
    const mobile = viewport.width <= 760;
    set(root!, 'position', 'fixed');
    set(root!, 'right', 'auto'); set(root!, 'bottom', 'auto'); set(root!, 'margin', '0px');
    set(root!, 'width', px(viewport.width)); set(root!, 'height', px(viewport.height));
    set(root!, 'left', px(viewport.left)); set(root!, 'top', px(viewport.top));
    // A transformed Tavern html/body can change the reference frame of position:fixed.
    const rect = root!.getBoundingClientRect();
    set(root!, 'left', px(viewport.left + viewport.left - rect.left));
    set(root!, 'top', px(viewport.top + viewport.top - rect.top));
    set(root!, '--uc-viewport-height', px(viewport.height));
    set(root!, '--uc-viewport-width', px(viewport.width));
    root!.setAttribute('data-uc-short', mobile && viewport.height < 470 ? 'true' : 'false');
    const safe = win.getComputedStyle(safeProbe);
    const bottomInset = parseFloat(safe.paddingBottom) || 0;
    const dock = shadow!.querySelector<HTMLElement>('.tool-dock');
    if (dock !== observedDock) {
      if (observedDock) resizeObserver?.unobserve(observedDock);
      observedDock = dock;
      if (dock) resizeObserver?.observe(dock);
    }
    const dockHeight = dock?.getBoundingClientRect().height;
    if (dockHeight && mobile) set(root!, '--uc-dock-height', px(Math.ceil(dockHeight)));
    // The toolbar clearance includes the actual measured height and the safe area.
    set(root!, '--uc-dock-bottom', px(Math.max(12, bottomInset)));
  }
  function schedule() {
    if (disposed || frame !== undefined) return;
    frame = win.requestAnimationFrame(() => { frame = undefined; refresh(); });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    win.removeEventListener('resize', schedule);
    visual?.removeEventListener('resize', schedule);
    visual?.removeEventListener('scroll', schedule);
    resizeObserver?.disconnect(); mutationObserver?.disconnect();
    style.remove(); safeProbe.remove();
    root!.removeAttribute('data-uc-viewport'); root!.removeAttribute('data-uc-short');
    if (originalRootStyle === null) root!.removeAttribute('style');
    else root!.setAttribute('style', originalRootStyle);
  }
  try {
    if (typeof runtime.ResizeObserver === 'function') {
      resizeObserver = new runtime.ResizeObserver(schedule);
      resizeObserver.observe(root);
    }
    mutationObserver = new runtime.MutationObserver(schedule);
    mutationObserver.observe(shadow, { childList: true, subtree: false });
    win.addEventListener('resize', schedule);
    visual?.addEventListener('resize', schedule);
    visual?.addEventListener('scroll', schedule);
    refresh();
    return { refresh, dispose };
  } catch (error) { dispose(); throw error; }
}
