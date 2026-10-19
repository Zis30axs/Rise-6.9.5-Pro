/** DOM-only layout lease. No chat, model, inventory or world-state access. */
export interface ShellViewportLease { refresh(): void; dispose(): void }
export interface ShellViewport { left: number; top: number; width: number; height: number }

const positive = (value: number | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

export function readShellViewport(win: Window): ShellViewport {
  const visual = win.visualViewport;
  const width = positive(win.innerWidth, positive(win.document.documentElement.clientWidth, 1));
  const height = positive(win.innerHeight, positive(win.document.documentElement.clientHeight, 1));
  // Keep browser pinch-zoom available instead of reflowing the entire UI while zoomed.
  const unzoomed = !visual || !Number.isFinite(visual.scale) || Math.abs(visual.scale - 1) < 0.01;
  return {
    left: unzoomed && Number.isFinite(visual?.offsetLeft) ? Math.max(0, visual!.offsetLeft) : 0,
    top: unzoomed && Number.isFinite(visual?.offsetTop) ? Math.max(0, visual!.offsetTop) : 0,
    width: Math.floor(unzoomed ? Math.min(width, positive(visual?.width, width)) : width),
    height: Math.floor(unzoomed ? Math.min(height, positive(visual?.height, height)) : height),
  };
}

/** Attach after mountShell; dispose in that shell's onExit callback, including failures. */
export function bindShellViewport(win: Window, css: string): ShellViewportLease {
  const doc = win.document;
  const root = doc.querySelector<HTMLElement>('[data-unread-city-root]');
  const rescue = doc.querySelector<HTMLButtonElement>('[data-unread-city-rescue]');
  const shadow = root?.shadowRoot;
  if (!root || !rescue || !shadow) throw new Error('沉浸界面布局节点缺失，已停止挂载。');
  const runtime = win as Window & typeof globalThis;
  const originalRootStyle = root.getAttribute('style');
  const originalRescueStyle = rescue.getAttribute('style');
  const layoutStyle = doc.createElement('style');
  layoutStyle.textContent = css;
  const rescueStyle = doc.createElement('style');
  rescueStyle.textContent = `
    [data-uc-viewport-rescue] {
      position:fixed!important; margin:0!important; box-sizing:border-box!important;
      top:var(--uc-rescue-top,12px)!important; left:var(--uc-rescue-left,12px)!important;
      right:auto!important; bottom:auto!important; min-height:44px!important;
      max-width:calc(100vw - 24px); white-space:nowrap;
    }
  `;
  // Important stylesheet coordinates win over the legacy lifecycle resize handler.
  // The rescue button remains a native DOM control, independent of Vue/shadow DOM.
  rescue.setAttribute('data-uc-viewport-rescue', '');
  root.setAttribute('data-uc-viewport', '');
  shadow.append(layoutStyle);
  doc.head.append(rescueStyle);
  const safeProbe = doc.createElement('div');
  safeProbe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;box-sizing:content-box;padding:var(--uc-safe-top,0px) var(--uc-safe-right,0px) var(--uc-safe-bottom,0px) var(--uc-safe-left,0px);';
  shadow.append(safeProbe);
  let dead = false;
  let frame: number | undefined;
  let observedDock: Element | null = null;
  let resizeObserver: ResizeObserver | undefined;
  let mutationObserver: MutationObserver | undefined;
  const visual = win.visualViewport;
  const px = (value: number) => `${Math.round(value * 100) / 100}px`;
  const set = (element: HTMLElement, key: string, value: string) => {
    if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
  };

  function refresh() {
    if (dead || !root!.isConnected || !rescue!.isConnected) return;
    const viewport = readShellViewport(win);
    const mobile = viewport.width <= 760;
    set(root!, 'position', 'fixed');
    set(root!, 'right', 'auto'); set(root!, 'bottom', 'auto'); set(root!, 'margin', '0px');
    set(root!, 'width', px(viewport.width)); set(root!, 'height', px(viewport.height));
    set(root!, 'left', px(viewport.left)); set(root!, 'top', px(viewport.top));
    // A transformed html/body can establish a fixed-position containing block.
    // Correct its translation without changing any native host style or scroll.
    const rect = root!.getBoundingClientRect();
    set(root!, 'left', px(viewport.left + viewport.left - rect.left));
    set(root!, 'top', px(viewport.top + viewport.top - rect.top));
    set(root!, '--uc-viewport-height', px(viewport.height));
    set(root!, '--uc-viewport-width', px(viewport.width));
    root!.setAttribute('data-uc-short', mobile && viewport.height < 470 ? 'true' : 'false');
    const safe = win.getComputedStyle(safeProbe);
    const topInset = parseFloat(safe.paddingTop) || 0;
    const rightInset = parseFloat(safe.paddingRight) || 0;
    const bottomInset = parseFloat(safe.paddingBottom) || 0;
    const dock = shadow!.querySelector<HTMLElement>('.tool-dock');
    if (dock !== observedDock) {
      if (observedDock) resizeObserver?.unobserve(observedDock);
      observedDock = dock;
      if (dock) resizeObserver?.observe(dock);
    }
    const dockHeight = dock?.getBoundingClientRect().height;
    if (dockHeight && mobile) set(root!, '--uc-dock-height', px(Math.ceil(dockHeight)));
    // First measure the rescue's own containing-block translation.
    set(rescue!, '--uc-rescue-left', '0px'); set(rescue!, '--uc-rescue-top', '0px');
    const button = rescue!.getBoundingClientRect();
    const desiredLeft = viewport.left + Math.max(8, viewport.width - Math.max(12, rightInset) - button.width);
    const desiredTop = viewport.top + (mobile ? topInset + 12 : Math.max(8, viewport.height - Math.max(12, bottomInset) - button.height));
    set(rescue!, '--uc-rescue-left', px(desiredLeft - button.left));
    set(rescue!, '--uc-rescue-top', px(desiredTop - button.top));
    set(root!, '--uc-rescue-space', px(button.width + 20));
  }
  function schedule() {
    if (dead || frame !== undefined) return;
    frame = win.requestAnimationFrame(() => { frame = undefined; refresh(); });
  }
  function dispose() {
    if (dead) return;
    dead = true;
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    win.removeEventListener('resize', schedule);
    visual?.removeEventListener('resize', schedule);
    visual?.removeEventListener('scroll', schedule);
    resizeObserver?.disconnect(); mutationObserver?.disconnect();
    layoutStyle.remove(); rescueStyle.remove(); safeProbe.remove();
    root!.removeAttribute('data-uc-viewport'); root!.removeAttribute('data-uc-short');
    rescue!.removeAttribute('data-uc-viewport-rescue');
    // Both elements are shell-owned and normally already detached by onExit.
    if (originalRootStyle === null) root!.removeAttribute('style'); else root!.setAttribute('style', originalRootStyle);
    if (originalRescueStyle === null) rescue!.removeAttribute('style'); else rescue!.setAttribute('style', originalRescueStyle);
  }
  try {
    if (typeof runtime.ResizeObserver === 'function') {
      resizeObserver = new runtime.ResizeObserver(schedule);
      resizeObserver.observe(rescue);
    }
    mutationObserver = new runtime.MutationObserver(schedule);
    mutationObserver.observe(shadow, { childList: true, subtree: true });
    win.addEventListener('resize', schedule);
    visual?.addEventListener('resize', schedule); visual?.addEventListener('scroll', schedule);
    refresh();
    return { refresh, dispose };
  } catch (error) { dispose(); throw error; }
}
