/** DOM-only viewport lease. Never edits the native Tavern document or the chat. */
export interface ShellViewportLease { refresh(): void; dispose(): void }
export interface ShellViewport { left: number; top: number; width: number; height: number }

const positive = (value: number | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

// Height breakpoints share the same stable viewport as the Shell and phone.
// Raw max-height media queries would still react to a resized WebView keyboard.
const heightBreakpoints = [450, 580, 620, 650, 670, 840];

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

/** Inspect only the focused DOM chain; never read or copy input contents.
 * The hosted phone stays outside the Shell's shadow tree, in its own iframe. */
function ownsTextFocus(doc: Document, root: HTMLElement): boolean {
  let active = doc.activeElement;
  const phone = doc.querySelector('#sttts-panel.st-iphonie-hosted');
  if (!active || !(active === root || root.contains(active) || phone?.contains(active))) return false;
  for (let depth = 0; active && depth < 12; depth++) {
    if (active.shadowRoot?.activeElement) { active = active.shadowRoot.activeElement; continue; }
    if (active.tagName === 'IFRAME') {
      try { active = (active as HTMLIFrameElement).contentDocument?.activeElement ?? null; continue; }
      catch { return false; }
    }
    if (active.matches('textarea,input')) {
      const input = active as HTMLInputElement | HTMLTextAreaElement;
      return !input.disabled && !input.readOnly && input.inputMode !== 'none' &&
        (active.tagName === 'TEXTAREA' || /^(text|search|email|url|tel|password|number)$/.test(input.type));
    }
    return (active as HTMLElement).isContentEditable;
  }
  return false;
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
  let settled = readShellViewport(win);
  let editingViewport: ShellViewport | undefined;
  let keyboardObserved = false;
  let keyboardLayout = false;
  const insetKeys = ['top', 'right', 'bottom', 'left'] as const;
  let lastInsets = ['0px', '0px', '0px', '0px'];
  let insetStyles: {value:string;priority:string}[] | undefined;
  function layoutViewport(): ShellViewport {
    keyboardLayout = false;
    const current = readShellViewport(win);
    const touch = win.navigator.maxTouchPoints > 0 || win.matchMedia?.('(pointer:coarse)').matches;
    // A real width/orientation change establishes a new layout. Ordinary
    // desktop resizes must continue to work even while a textarea is focused.
    if (!touch || Math.abs(current.width - settled.width) > 1) {
      editingViewport = undefined; keyboardObserved = false;
      return settled = current;
    }
    const editing = ownsTextFocus(doc, root!);
    if (editing && !editingViewport) editingViewport = settled;
    if (editingViewport) {
      const loss = editingViewport.height - current.height;
      // Rotation can finish while the keyboard is still covering the new
      // viewport. Accept its subsequent growth instead of keeping that short
      // intermediate height after the keyboard closes.
      if (loss < -1) {
        editingViewport = undefined; keyboardObserved = false;
        return settled = current;
      }
      keyboardObserved ||= loss > Math.min(100, editingViewport.height * .15);
      // Blur may precede the keyboard's closing animation. Keep the original
      // geometry until the covered area has returned, without forcing blur,
      // changing native viewport metadata or disabling browser zoom.
      if (editing || keyboardObserved && loss > 1) {
        keyboardLayout = true;
        // Offset compensation pins to the *visual* origin during native panning;
        // only the available layout size stays at its pre-keyboard dimensions.
        return {...current, width: editingViewport.width, height: editingViewport.height};
      }
    }
    editingViewport = undefined; keyboardObserved = false;
    return settled = current;
  }
  const px = (value: number) => Math.round(value * 100) / 100 + 'px';
  const set = (element: HTMLElement, key: string, value: string) => {
    if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value);
  };
  function refresh() {
    if (disposed || !root!.isConnected) return;
    const viewport = layoutViewport();
    // Some WebViews also clear the home-indicator inset while their keyboard is
    // open. Keep that from moving the toolbar or resizing the phone slot.
    if (keyboardLayout && !insetStyles) {
      insetStyles = insetKeys.map(edge => ({value:root!.style.getPropertyValue(`--uc-safe-${edge}`),priority:root!.style.getPropertyPriority(`--uc-safe-${edge}`)}));
      insetKeys.forEach((edge,index) => set(root!,`--uc-safe-${edge}`,lastInsets[index]));
    } else if (!keyboardLayout && insetStyles) {
      insetKeys.forEach((edge,index) => {
        const saved=insetStyles![index],key=`--uc-safe-${edge}`;
        if(saved.value)root!.style.setProperty(key,saved.value,saved.priority);else root!.style.removeProperty(key);
      });
      insetStyles=undefined;
    }
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
    root!.setAttribute('data-uc-max-height', heightBreakpoints.filter(height => viewport.height <= height).join(' '));
    const safe = win.getComputedStyle(safeProbe);
    if (!keyboardLayout) lastInsets = [safe.paddingTop,safe.paddingRight,safe.paddingBottom,safe.paddingLeft];
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
    doc.removeEventListener('focusin', schedule, true);
    doc.removeEventListener('focusout', schedule, true);
    visual?.removeEventListener('resize', schedule);
    visual?.removeEventListener('scroll', schedule);
    resizeObserver?.disconnect(); mutationObserver?.disconnect();
    style.remove(); safeProbe.remove();
    root!.removeAttribute('data-uc-viewport'); root!.removeAttribute('data-uc-short'); root!.removeAttribute('data-uc-max-height');
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
    doc.addEventListener('focusin', schedule, true);
    doc.addEventListener('focusout', schedule, true);
    visual?.addEventListener('resize', schedule);
    visual?.addEventListener('scroll', schedule);
    refresh();
    return { refresh, dispose };
  } catch (error) { dispose(); throw error; }
}
