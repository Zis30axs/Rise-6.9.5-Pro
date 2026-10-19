/** Geometry only. No model requests, chat writes, native DOM moves or global CSS. */
export interface VisibleViewport { left: number; top: number; width: number; height: number }
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function readVisibleViewport(win: Window): VisibleViewport {
  const visual = win.visualViewport;
  const layoutWidth = positive(win.innerWidth) ? win.innerWidth : win.document.documentElement.clientWidth;
  const layoutHeight = positive(win.innerHeight) ? win.innerHeight : win.document.documentElement.clientHeight;
  return {
    left: positive(visual?.offsetLeft) ? visual!.offsetLeft : 0,
    top: positive(visual?.offsetTop) ? visual!.offsetTop : 0,
    width: Math.max(1, Math.floor(positive(visual?.width) ? Math.min(layoutWidth, visual!.width) : layoutWidth)),
    height: Math.max(1, Math.floor(positive(visual?.height) ? Math.min(layoutHeight, visual!.height) : layoutHeight)),
  };
}

/** Compensate for a translated fixed-position containing block in the host page. */
function positionFixed(element: HTMLElement, left: number, top: number) {
  element.style.left = `${left}px`; element.style.top = `${top}px`;
  element.style.right = 'auto'; element.style.bottom = 'auto';
  const actual = element.getBoundingClientRect();
  if (actual.width > 0 && actual.height > 0) {
    element.style.left = `${left + left - actual.left}px`;
    element.style.top = `${top + top - actual.top}px`;
  }
}

/**
 * Install after mountShell, so its legacy resize handler runs before ours.
 * The emergency button remains outside Vue, in its own reserved footer row.
 */
export function bindShellViewport(win: Window, root: HTMLElement, rescue: HTMLButtonElement): () => void {
  const shadow = root.shadowRoot;
  if (!shadow) throw new Error('沉浸界面的视口容器不可用。');
  const originalRootStyle = root.getAttribute('style');
  const originalRescueStyle = rescue.getAttribute('style');
  const probe = win.document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding-top:var(--uc-safe-top,env(safe-area-inset-top,0px));padding-bottom:var(--uc-safe-bottom,env(safe-area-inset-bottom,0px));padding-left:var(--uc-safe-left,env(safe-area-inset-left,0px));padding-right:var(--uc-safe-right,env(safe-area-inset-right,0px));';
  shadow.append(probe);
  let disposed = false;
  let frame: number | undefined;
  const visual = win.visualViewport;
  const dock = shadow.querySelector<HTMLElement>('.tool-dock');
  const restoreStyle = (element: HTMLElement, value: string | null) => {
    if (value === null) element.removeAttribute('style'); else element.setAttribute('style', value);
  };
  function sync() {
    if (disposed || !root.isConnected || !rescue.isConnected) return;
    const viewport = readVisibleViewport(win);
    const mobile = win.innerWidth <= 760;
    const keyboard = mobile && win.innerHeight - viewport.height > 140;
    const insets = win.getComputedStyle(probe);
    const safeTop = Math.max(0, parseFloat(insets.paddingTop) || 0);
    const safeBottom = keyboard ? 0 : Math.max(0, parseFloat(insets.paddingBottom) || 0);
    const safeLeft = Math.max(0, parseFloat(insets.paddingLeft) || 0);
    const safeRight = Math.max(0, parseFloat(insets.paddingRight) || 0);
    root.dataset.ucKeyboard = String(keyboard);
    root.style.setProperty('--uc-view-height', `${viewport.height}px`);
    root.style.setProperty('--uc-vh', `${viewport.height / 100}px`);
    root.style.setProperty('--uc-safe-top-px', `${safeTop}px`);
    root.style.setProperty('--uc-safe-bottom-px', `${safeBottom}px`);
    root.style.width = `${viewport.width}px`; root.style.height = `${viewport.height}px`;
    positionFixed(root, viewport.left, viewport.top);
    // Keep the original emergency control; only its geometry is changed.
    rescue.style.boxSizing = 'border-box'; rescue.style.margin = '0';
    rescue.style.minHeight = '44px'; rescue.style.minWidth = '84px';
    rescue.style.maxWidth = `${Math.max(84, viewport.width - safeLeft - safeRight - 24)}px`;
    rescue.style.whiteSpace = 'nowrap';
    const button = rescue.getBoundingClientRect();
    const rescueHeight = Math.max(44, Math.ceil(button.height));
    const dockBottom = Math.max(12, safeBottom + 8);
    root.style.setProperty('--uc-dock-bottom', `${dockBottom}px`);
    const dockHeight = keyboard ? 0 : Math.ceil(dock?.getBoundingClientRect().height || 64);
    const belowRescue = keyboard ? 8 : dockBottom + dockHeight + 8;
    const footer = mobile ? belowRescue + rescueHeight + 8 : 25;
    root.style.setProperty('--uc-footer-height', `${footer}px`);
    const left = viewport.left + viewport.width - Math.max(12, safeRight + 8) - Math.max(84, button.width);
    const top = viewport.top + viewport.height - (mobile ? belowRescue : 12) - rescueHeight;
    positionFixed(rescue, left, Math.max(viewport.top + safeTop, top));
  }
  function schedule() {
    if (disposed || frame !== undefined) return;
    frame = win.requestAnimationFrame(() => { frame = undefined; sync(); });
  }
  const Resize = (win as Window & typeof globalThis).ResizeObserver;
  const observer = typeof Resize === 'function' ? new Resize(schedule) : undefined;
  function dispose() {
    if (disposed) return;
    disposed = true;
    win.removeEventListener('resize', sync);
    visual?.removeEventListener('resize', sync);
    visual?.removeEventListener('scroll', schedule);
    observer?.disconnect();
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    probe.remove();
    delete root.dataset.ucKeyboard;
    restoreStyle(root, originalRootStyle);
    restoreStyle(rescue, originalRescueStyle);
  }
  // Register after the old rescue listener. Initialization failure must also
  // release listeners instead of leaving an unowned viewport controller.
  try {
    win.addEventListener('resize', sync);
    visual?.addEventListener('resize', sync);
    visual?.addEventListener('scroll', schedule);
    if (dock) observer?.observe(dock);
    observer?.observe(rescue);
    sync();
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
