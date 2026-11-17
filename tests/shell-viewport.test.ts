import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindShellLayout, layoutStorageKey } from '../src/frontend/shell-layout';
import { bindShellViewport } from '../src/frontend/shell-viewport';

const reading = { x: 0.05, y: 0.46, w: 0.9, h: 0.38 };
const mode = { x: 0.03, y: 0.12, w: 0.6, h: 0.05 };

function mount(width: number, height: number) {
  const visual = Object.assign(new EventTarget(), { width, height, scale: 1, offsetLeft: 0, offsetTop: 0 });
  const resizeCallbacks = new Map<Element, Set<() => void>>();
  const notifySizeChange = (target: Element) => {
    for (const callback of resizeCallbacks.get(target) ?? []) callback();
  };
  class ResizeObserverStub {
    private targets = new Set<Element>();
    constructor(private callback: () => void) {}
    observe(target: Element) {
      this.targets.add(target);
      const callbacks = resizeCallbacks.get(target) ?? new Set();
      callbacks.add(this.callback);
      resizeCallbacks.set(target, callbacks);
    }
    unobserve(target: Element) {
      this.targets.delete(target);
      resizeCallbacks.get(target)?.delete(this.callback);
    }
    disconnect() {
      for (const target of this.targets) this.unobserve(target);
    }
  }
  let frameId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const runFrame = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  };
  vi.stubGlobal('visualViewport', visual);
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));

  const root = document.createElement('div');
  root.dataset.unreadCityRoot = '';
  const shadow = root.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<main class="uc-shell" data-presentation-mode="novel">
    <nav class="presentation-switch"></nav>
    <section class="reading-layer"><textarea></textarea></section>
  </main>`;
  document.body.append(root);
  const shell = shadow.querySelector<HTMLElement>('.uc-shell')!;
  // jsdom does not calculate CSS layout. The real shell fills its host.
  Object.defineProperties(shell, {
    clientWidth: { get: () => parseFloat(root.style.width) || window.innerWidth },
    clientHeight: { get: () => parseFloat(root.style.height) || window.innerHeight },
  });
  const key = layoutStorageKey(width <= 760, 'novel');
  const saved = JSON.stringify({ reading, mode });
  localStorage.setItem(key, saved);
  const layout = bindShellLayout(shell);
  const viewport = bindShellViewport(window, '');
  return {
    key, saved, root, runFrame,
    reader: shadow.querySelector<HTMLElement>('.reading-layer')!,
    switcher: shadow.querySelector<HTMLElement>('.presentation-switch')!,
    input: shadow.querySelector('textarea')!,
    resizeVisualViewport(height: number) {
      visual.height = height;
      visual.dispatchEvent(new Event('resize'));
      runFrame();
      notifySizeChange(root);
      notifySizeChange(shell);
      runFrame();
    },
    dispose() { viewport.dispose(); layout.dispose(); },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

describe('novel shell layout', () => {
  it('restores the saved positions after the software keyboard closes with only a visual viewport event', () => {
    const shell = mount(390, 844);
    try {
      shell.input.focus();
      shell.input.value = '未发送的草稿';
      expect(shell.reader.style.top).toBe('388.2px');
      expect(shell.switcher.style.top).toBe('101.3px');

      for (const height of [520, 455]) {
        shell.resizeVisualViewport(height);
        // Some clients also emit a window resize while the keyboard is open.
        window.dispatchEvent(new Event('resize'));
        shell.runFrame();
        expect(shell.reader.style.top).toBe(`${(reading.y * height).toFixed(1)}px`);

        shell.resizeVisualViewport(844);
        expect(shell.root.style.height).toBe('844px');
        expect(shell.reader.style.top).toBe('388.2px');
        expect(shell.switcher.style.top).toBe('101.3px');
        expect(shell.input.getRootNode()).toHaveProperty('activeElement', shell.input);
        expect(shell.input.value).toBe('未发送的草稿');
      }
      expect(localStorage.getItem(shell.key)).toBe(shell.saved);
    } finally {
      shell.dispose();
    }
  });

  it('applies the restored geometry on a regular desktop window resize', () => {
    const shell = mount(1280, 800);
    try {
      expect(shell.reader.style.top).toBe('368px');
      vi.stubGlobal('innerHeight', 700);
      window.dispatchEvent(new Event('resize'));
      shell.resizeVisualViewport(700);
      expect(shell.root.style.height).toBe('700px');
      expect(shell.reader.style.top).toBe('322px');
    } finally {
      shell.dispose();
    }
  });
});
