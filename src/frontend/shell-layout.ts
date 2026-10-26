/**
 * Per-device, per-presentation HUD layout editor.
 * Only UI geometry is stored; no character, chat, phone data or script is serialized.
 */
export interface LayoutRect { left: number; top: number; width: number; height: number }
type SavedRect = { x: number; y: number; w: number; h: number };
type LayoutMap = Record<string, SavedRect>;
type LayoutAction = 'move' | 'resize' | 'reading-height';
type PointerDrag = {
  pointerId: number;
  handle: HTMLElement;
  part: HTMLElement;
  key: string;
  startX: number;
  startY: number;
  rect: LayoutRect;
  action: LayoutAction;
};
export interface ShellLayoutLease {
  setEditing(active: boolean): void;
  reset(): void;
  place(element: HTMLElement, rect: LayoutRect): void;
  save(element: HTMLElement): void;
  dispose(): void;
}

const PREFIX = 'unread-city-shell-layout-v1';
const MIN_EDGE = 4;
const RESIZE_MIN = 44;
const PORTRAIT_SIZE_REPAIR = 'portrait-stage-scale-20261026';
const EDITABLE = [
  '.world-chrome',
  '.presentation-switch',
  '.tool-dock',
  '.reading-layer',
  '.floating-window',
  '.novel-npc-portrait',
  '.soyo-live2d',
  '.walk-launcher',
  '.encounter-caption:not(.encounter-caption-inline)',
  '.resume-reading',
  '.campus-entrance',
  '.notice',
  '.bed-rest-receipt',
].join(',');

const CSS_PROPERTIES = [
  'position', 'left', 'top', 'right', 'bottom', 'width', 'height',
  'min-width', 'min-height', 'max-width', 'max-height', 'transform', 'margin',
] as const;

export function layoutStorageKey(mobile: boolean, presentation: string): string {
  return PREFIX + ':' + (mobile ? 'mobile' : 'desktop') + ':' +
    (presentation === 'novel' ? 'novel' : 'scene');
}

export function clampLayout(rect: LayoutRect, viewWidth: number, viewHeight: number, minWidth = RESIZE_MIN, minHeight = RESIZE_MIN): LayoutRect {
  const w = Math.max(1, viewWidth - MIN_EDGE * 2);
  const h = Math.max(1, viewHeight - MIN_EDGE * 2);
  const width = Math.min(w, Math.max(Math.min(w, minWidth), Number.isFinite(rect.width) ? rect.width : minWidth));
  const height = Math.min(h, Math.max(Math.min(h, minHeight), Number.isFinite(rect.height) ? rect.height : minHeight));
  return {
    left: Math.min(Math.max(MIN_EDGE, Number.isFinite(rect.left) ? rect.left : MIN_EDGE), Math.max(MIN_EDGE, viewWidth - width - MIN_EDGE)),
    top: Math.min(Math.max(MIN_EDGE, Number.isFinite(rect.top) ? rect.top : MIN_EDGE), Math.max(MIN_EDGE, viewHeight - height - MIN_EDGE)),
    width, height,
  };
}

export function resizeFromTop(start: LayoutRect, deltaY: number, viewWidth: number, viewHeight: number, minHeight = 150): LayoutRect {
  const end = start.top + start.height;
  const top = Math.max(MIN_EDGE, Math.min(start.top + deltaY, end - Math.min(minHeight, viewHeight - MIN_EDGE * 2)));
  return clampLayout({
    left: start.left, top, width: start.width, height: end - top,
  }, viewWidth, viewHeight, 120, minHeight);
}

export function parseLayout(value: string | null): LayoutMap {
  if (!value || value.length > 30000) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const output: LayoutMap = {};
    for (const [key, raw] of Object.entries(parsed)) {
      if (!/^[a-z0-9:-]{1,48}$/.test(key) || !raw || typeof raw !== 'object') continue;
      const fields = raw as Partial<SavedRect>;
      if ([fields.x, fields.y, fields.w, fields.h].every(num => typeof num === 'number' && Number.isFinite(num) && num >= 0 && num <= 1)) {
        output[key] = { x: fields.x!, y: fields.y!, w: fields.w!, h: fields.h! };
      }
    }
    return output;
  } catch {
    return {};
  }
}

/**
 * One-time migration: old novel portraits can be saved as small floating thumbnails.
 * Drop only that outdated portrait rectangle; preserve all other user-arranged HUD.
 * The migration marker lets users deliberately resize the portrait afterward.
 */
export function repairLegacyPortraitRect(layout: LayoutMap, mobile: boolean): LayoutMap {
  const portrait = layout.portrait;
  if (!portrait || portrait.h >= (mobile ? 0.50 : 0.65)) return layout;
  const repaired = { ...layout };
  delete repaired.portrait;
  return repaired;
}

function partKey(part: HTMLElement): string {
  if (part.classList.contains('world-chrome')) return 'header';
  if (part.classList.contains('presentation-switch')) return 'mode';
  if (part.classList.contains('tool-dock')) return 'dock';
  if (part.classList.contains('reading-layer')) return part.classList.contains('reading-expanded') ? 'reading-expanded' : 'reading';
  if (part.classList.contains('floating-window')) return 'panel-' + (part.dataset.window ?? 'other').replace(/[^a-z0-9-]/g, '') + (part.classList.contains('phone-window') && part.closest('.uc-shell[data-phone-expanded="true"]') ? '-expanded' : '');
  if (part.classList.contains('novel-npc-portrait')) return 'portrait';
  if (part.classList.contains('soyo-live2d')) return 'soyo-live2d';
  if (part.classList.contains('walk-launcher')) return 'walk';
  if (part.classList.contains('encounter-caption')) return 'encounter';
  if (part.classList.contains('resume-reading')) return 'resume';
  if (part.classList.contains('campus-entrance')) {
    if (part.hasAttribute('data-transit-entry')) return 'entrance-transit';
    if (part.hasAttribute('data-store-entry')) return 'entrance-store';
    if (part.hasAttribute('data-book-reading-entry')) return 'entrance-books';
    return 'entrance';
  }
  if (part.classList.contains('notice')) return 'notice';
  return 'receipt';
}

function minimum(part: HTMLElement): { width: number; height: number } {
  if (part.classList.contains('reading-layer')) return { width: 160, height: 150 };
  if (part.classList.contains('floating-window')) return { width: 190, height: 185 };
  if (part.classList.contains('tool-dock')) return { width: 200, height: 52 };
  if (part.classList.contains('novel-npc-portrait') || part.classList.contains('soyo-live2d')) return { width: 120, height: 150 };
  if (part.classList.contains('world-chrome')) return { width: 230, height: 56 };
  return { width: RESIZE_MIN, height: RESIZE_MIN };
}

function confinement(shell: HTMLElement, part: HTMLElement): { width: number; height: number } {
  const width = shell.clientWidth;
  let height = shell.clientHeight;
  if (width <= 760 && (part.classList.contains('floating-window') || part.classList.contains('reading-layer'))) {
    const dock = shell.querySelector<HTMLElement>('.tool-dock');
    const edge = dock?.getBoundingClientRect().top;
    const origin = shell.getBoundingClientRect().top;
    if (edge !== undefined && Number.isFinite(edge) && edge - origin > 100) {
      height = Math.min(height, edge - origin - 8);
    }
  }
  return { width, height };
}

function viewportRect(shell: HTMLElement, target: HTMLElement): LayoutRect {
  const a = shell.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  return { left: b.left - a.left, top: b.top - a.top, width: b.width, height: b.height };
}

export function bindShellLayout(shell: HTMLElement, onGeometryChange?: () => void): ShellLayoutLease {
  const win = shell.ownerDocument.defaultView;
  if (!win) throw new Error('HUD viewport is unavailable');
  let editing = false;
  let disposed = false;
  let drag: PointerDrag | undefined;
  let lastScope = '';
  let lastWidth = 0;
  let lastHeight = 0;
  let scheduled = 0;
  const seen = new WeakMap<HTMLElement, string>();
  const cache = new Map<string, LayoutMap>();
  const originalStyles = new WeakMap<HTMLElement, Record<string, { value: string; priority: string }>>();
  const knownParts = new Set<HTMLElement>();
  const nodeHandles = new WeakMap<HTMLElement, HTMLElement[]>();

  const scope = () => layoutStorageKey(shell.clientWidth <= 760, shell.dataset.presentationMode ?? 'scene');
  function load(key: string): LayoutMap {
    if (!cache.has(key)) {
      let layout: LayoutMap = {};
      try {
        layout = parseLayout(win!.localStorage.getItem(key));
        if (key === layoutStorageKey(true, 'novel') || key === layoutStorageKey(false, 'novel')) {
          const marker = key + ':' + PORTRAIT_SIZE_REPAIR;
          if (win!.localStorage.getItem(marker) !== '1') {
            const repaired = repairLegacyPortraitRect(layout, key === layoutStorageKey(true, 'novel'));
            if (repaired !== layout) {
              layout = repaired;
              win!.localStorage.setItem(key, JSON.stringify(layout));
            }
            win!.localStorage.setItem(marker, '1');
          }
        }
      } catch { /* Storage may be disabled; keep any in-memory repair. */ }
      cache.set(key, layout);
    }
    return cache.get(key)!;
  }
  function save(key: string, value: LayoutMap) {
    cache.set(key, value);
    try { win!.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode/storage disabled */ }
  }
  function snapshotStyle(element: HTMLElement) {
    if (originalStyles.has(element)) return;
    const record: Record<string, { value: string; priority: string }> = {};
    for (const property of CSS_PROPERTIES) record[property] = {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    };
    originalStyles.set(element, record);
  }
  function clearGeometry(element: HTMLElement) {
    const styles = originalStyles.get(element);
    if (!styles) return;
    for (const property of CSS_PROPERTIES) {
      const previous = styles[property];
      if (previous.value) element.style.setProperty(property, previous.value, previous.priority);
      else element.style.removeProperty(property);
    }
    originalStyles.delete(element);
  }
  function setGeometry(element: HTMLElement, rect: LayoutRect) {
    snapshotStyle(element);
    const style = element.style;
    const props: Record<string, string> = {
      position: 'absolute',
      left: rect.left.toFixed(1) + 'px',
      top: rect.top.toFixed(1) + 'px',
      width: rect.width.toFixed(1) + 'px',
      height: rect.height.toFixed(1) + 'px',
      right: 'auto', bottom: 'auto', transform: 'none', margin: '0px',
      'max-height': 'none', 'max-width': 'none', 'min-height': '0px', 'min-width': '0px',
    };
    for (const [name, value] of Object.entries(props)) {
      if (style.getPropertyValue(name) !== value || style.getPropertyPriority(name) !== 'important') {
        style.setProperty(name, value, 'important');
      }
    }
  }
  function addHandles(element: HTMLElement) {
    if (nodeHandles.has(element)) return;
    const handles: HTMLElement[] = [];
    const key = partKey(element);
    for (const action of ['move', 'resize'] as const) {
      const control = shell.ownerDocument.createElement('button');
      control.type = 'button';
      control.className = 'uc-layout-handle uc-layout-' + action;
      control.dataset.layoutHandle = action;
      control.setAttribute('aria-label', (action === 'move' ? '移动' : '调整大小') + key);
      control.title = action === 'move' ? '拖动调整位置' : '拖动调整宽高';
      control.textContent = action === 'move' ? '⠿' : '↘';
      element.append(control);
      handles.push(control);
    }
    nodeHandles.set(element, handles);
  }
  function removeHandles(element: HTMLElement) {
    for (const handle of nodeHandles.get(element) ?? []) handle.remove();
    nodeHandles.delete(element);
  }
  function discover() {
    if (disposed) return;
    const key = scope();
    const width = shell.clientWidth, height = shell.clientHeight;
    const changed = key !== lastScope || width !== lastWidth || height !== lastHeight;
    if (changed) { lastScope = key; lastWidth = width; lastHeight = height; }
    for (const element of Array.from(shell.querySelectorAll<HTMLElement>(EDITABLE))) {
      if (element.closest('[data-layout-part]') && !element.hasAttribute('data-layout-part')) continue;
      const part = partKey(element);
      element.dataset.layoutPart = part;
      knownParts.add(element);
      if (editing) addHandles(element); else removeHandles(element);
      const identity = key + ':' + part;
      if (changed || seen.get(element) !== identity) {
        clearGeometry(element);
        const saved = load(key)[part];
        if (saved && width > 0 && height > 0) {
          const min = minimum(element);
          const bounds = confinement(shell, element);
          setGeometry(element, clampLayout({
            left: saved.x * width, top: saved.y * height,
            width: saved.w * width, height: saved.h * height,
          }, bounds.width, bounds.height, min.width, min.height));
        }
        seen.set(element, identity);
      }
    }
    for (const element of knownParts) {
      if (!element.isConnected) { knownParts.delete(element); nodeHandles.delete(element); }
    }
  }
  function schedule() {
    if (disposed || scheduled) return;
    scheduled = win!.requestAnimationFrame(() => { scheduled = 0; discover(); });
  }
  function persist(part: HTMLElement, key: string) {
    const width = shell.clientWidth, height = shell.clientHeight;
    if (width <= 0 || height <= 0) return;
    const rect = viewportRect(shell, part), name = scope();
    const data = { ...load(name) };
    data[key] = {
      x: Math.max(0, Math.min(1, rect.left / width)),
      y: Math.max(0, Math.min(1, rect.top / height)),
      w: Math.max(0, Math.min(1, rect.width / width)),
      h: Math.max(0, Math.min(1, rect.height / height)),
    };
    save(name, data);
  }
  function pointerDown(event: PointerEvent) {
    const handle = (event.target as Element | null)?.closest<HTMLElement>('[data-layout-handle]');
    if (!handle || event.button !== 0) return;
    const action = handle.dataset.layoutHandle as LayoutAction;
    if (!editing && action !== 'reading-height') return;
    const part = handle.closest<HTMLElement>('[data-layout-part]');
    if (!part || !shell.contains(part) || (action === 'reading-height' && !part.classList.contains('reading-layer'))) return;
    drag = {
      pointerId: event.pointerId, handle, part, key: partKey(part), action,
      startX: event.clientX, startY: event.clientY, rect: viewportRect(shell, part),
    };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }
  function pointerMove(event: PointerEvent) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const min = minimum(drag.part), { width, height } = confinement(shell, drag.part);
    let rect: LayoutRect;
    if (drag.action === 'reading-height') {
      rect = resizeFromTop(drag.rect, dy, width, height, min.height);
    } else if (drag.action === 'move') {
      rect = clampLayout({ ...drag.rect, left: drag.rect.left + dx, top: drag.rect.top + dy }, width, height, min.width, min.height);
    } else {
      rect = clampLayout({ ...drag.rect, width: drag.rect.width + dx, height: drag.rect.height + dy }, width, height, min.width, min.height);
    }
    setGeometry(drag.part, rect);
    onGeometryChange?.();
    event.preventDefault();
  }
  function pointerUp(event: PointerEvent) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = drag;
    drag = undefined;
    persist(current.part, current.key);
    if (current.handle.hasPointerCapture(event.pointerId)) current.handle.releasePointerCapture(event.pointerId);
    onGeometryChange?.();
    event.stopPropagation();
  }
  const observer = new (win as Window & typeof globalThis).MutationObserver(mutations => {
    // Canvas and phone content changes are not HUD layout changes.
    if (mutations.some(m => m.target === shell ||
      (m.type === 'childList' && (m.target === shell || (m.target instanceof (win as Window & typeof globalThis).HTMLElement && m.target.hasAttribute('data-layout-part')))) ||
      (m.type === 'attributes' && m.target instanceof (win as Window & typeof globalThis).HTMLElement && m.target.hasAttribute('data-layout-part')))) schedule();
  });
  shell.addEventListener('pointerdown', pointerDown, true);
  shell.addEventListener('pointermove', pointerMove, true);
  shell.addEventListener('pointerup', pointerUp, true);
  shell.addEventListener('pointercancel', pointerUp, true);
  win.addEventListener('resize', schedule);
  observer.observe(shell, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'data-presentation-mode', 'data-phone-expanded'] });
  discover();
  return {
    place(element, rect) {
      if (disposed || !shell.contains(element)) return;
      const min = minimum(element);
      const bounds = confinement(shell, element);
      setGeometry(element, clampLayout(rect, bounds.width, bounds.height, min.width, min.height));
      onGeometryChange?.();
    },
    save(element) {
      if (!disposed && shell.contains(element)) persist(element, partKey(element));
    },
    setEditing(value) {
      editing = value;
      shell.dataset.layoutEdit = value ? 'true' : 'false';
      discover();
    },
    reset() {
      for (const mobile of [false, true]) for (const mode of ['novel', 'scene']) {
        const key = layoutStorageKey(mobile, mode);
        cache.delete(key);
        try { win!.localStorage.removeItem(key); } catch { /* storage unavailable */ }
      }
      for (const element of knownParts) {
        clearGeometry(element);
        seen.delete(element);
      }
      discover();
      onGeometryChange?.();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (scheduled) win!.cancelAnimationFrame(scheduled);
      observer.disconnect();
      win!.removeEventListener('resize', schedule);
      shell.removeEventListener('pointerdown', pointerDown, true);
      shell.removeEventListener('pointermove', pointerMove, true);
      shell.removeEventListener('pointerup', pointerUp, true);
      shell.removeEventListener('pointercancel', pointerUp, true);
      for (const element of knownParts) { removeHandles(element); clearGeometry(element); element.removeAttribute('data-layout-part'); }
      shell.removeAttribute('data-layout-edit');
    },
  };
}
