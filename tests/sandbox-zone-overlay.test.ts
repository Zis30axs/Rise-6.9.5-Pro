import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createApp, nextTick } from 'vue';
import BeijingSandbox from '../src/frontend/BeijingSandbox.vue';
import beijingAtlas from '../assets/beijing-sandbox/sandbox.json';
import californiaAtlas from '../assets/california-sandbox/sandbox.json';
import { beijingConnections } from '../src/runtime/beijing';
import {
  computePointsBoundingRect,
  computeRectOutlineFromScreenCorners,
} from '../src/frontend/sandbox-zone-overlay';
import { mountCaliforniaMap } from '../src/frontend/california-sandbox-renderer.js';

function stub2DCanvas(el: HTMLCanvasElement, rectWidth = 760, rectHeight = 560) {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: rectWidth, bottom: rectHeight, width: rectWidth, height: rectHeight, x: 0, y: 0, toJSON() {} }) as DOMRect;
  const orig = el.getContext.bind(el);
  el.getContext = ((type: string) => (type === '2d' ? ctx : type === 'webgl' ? null : orig(type))) as typeof el.getContext;
}

describe('shared sandbox zone overlay styling & geometry', () => {
  it('computes padded bounding rects and culled wireframe corner paths', () => {
    const rect = computePointsBoundingRect([{ x: -10, z: 4 }, { x: 14, z: -8 }], 10, 6)!;
    expect(rect).toMatchObject({ minX: -16, maxX: 20, minZ: -14, maxZ: 10, cx: 2, cz: -2 });
    const zone = computeRectOutlineFromScreenCorners(
      'zone-1',
      'area:test',
      'district',
      [{ x: 100, y: 100 }, { x: 240, y: 100 }, { x: 240, y: 200 }, { x: 100, y: 200 }],
      800,
      600,
      { selected: true },
    )!;
    expect(zone.points).toBe('100.0,100.0 240.0,100.0 240.0,200.0 100.0,200.0');
    expect(zone.corners).toHaveLength(4);
    expect(zone.selected).toBe(true);

    const css = readFileSync('src/frontend/sandbox-zone-overlay.css', 'utf8');
    expect(css).toContain('background: transparent !important');
    expect(css).toContain('[data-sandbox-theme="dark"]');
    expect(css).toContain('.sandbox-outline-poly');
    expect(css).toContain('.sandbox-outline-corner');
  });

  it('gives BeijingSandbox Tokyo-style outlined areas and floating district/place typography', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(BeijingSandbox, {
      locationId: 'beijing-forbidden-city',
      routes: beijingConnections('beijing-forbidden-city'),
      clock: { hour: 10, minute: 0 },
      quote: () => ({ blockedReason: null, minutes: 20, fare: 4, alreadyThere: false }),
    });
    const prevRaf = window.requestAnimationFrame;
    const prevWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const prevHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 760; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 480; } });
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(16);
      return 1;
    }) as typeof window.requestAnimationFrame;
    try {
      app.mount(host);
      await nextTick();
      const stage = host.querySelector('.bj-stage') as HTMLElement;
      expect(stage.dataset.sandboxTheme).toBe('light');
      const lightingBtn = [...host.querySelectorAll('.bj-tools button')].find(b => b.textContent?.includes('光照')) as HTMLButtonElement;
      lightingBtn.click();
      await nextTick();
      lightingBtn.click();
      await nextTick();
      expect(stage.dataset.sandboxTheme).toBe('dark');

      const outlines = stage.querySelectorAll('.bj-outlines.sandbox-outlines .sandbox-outline-zone');
      expect(outlines.length).toBeGreaterThanOrEqual(beijingAtlas.focusAreas.length);
      expect(stage.querySelectorAll('.sandbox-outline-corner').length).toBeGreaterThan(10);
      const districts = [...stage.querySelectorAll<HTMLButtonElement>('[data-bj-district]')];
      expect(districts.some(d => d.textContent?.includes('老城胡同'))).toBe(true);
      expect(districts.every(d => d.classList.contains('sandbox-pin') && d.classList.contains('sandbox-district-pin'))).toBe(true);
      expect(stage.querySelector('.bj-pin.sandbox-pin.sandbox-place-pin')).not.toBeNull();
    } finally {
      if (prevWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', prevWidth);
      else delete (HTMLElement.prototype as { clientWidth?: unknown }).clientWidth;
      if (prevHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', prevHeight);
      else delete (HTMLElement.prototype as { clientHeight?: unknown }).clientHeight;
      window.requestAnimationFrame = prevRaf;
      app.unmount();
      host.remove();
    }
  });

  it('gives California renderer Tokyo-style district wireframe boxes, corner brackets, and floating names', () => {
    const host = document.createElement('div');
    host.style.width = '780px';
    host.style.height = '580px';
    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 780, bottom: 580, width: 780, height: 580, x: 0, y: 0, toJSON() {} }) as DOMRect;
    document.body.append(host);
    const origCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: ElementCreationOptions) => {
      const el = origCreate(tag, options);
      if (tag === 'canvas') stub2DCanvas(el as HTMLCanvasElement, 780, 580);
      return el;
    }) as typeof document.createElement);
    const prevRaf = window.requestAnimationFrame;
    const prevCancel = window.cancelAnimationFrame;
    const prevRo = window.ResizeObserver;
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(16);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = () => {};

    let handle: ReturnType<typeof mountCaliforniaMap> | undefined;
    try {
      handle = mountCaliforniaMap(
        host,
        californiaAtlas,
        'data:model/gltf-binary;base64,invalid',
        { locationId: 'sfo-airport', selectedId: 'sfo-airport' },
      );
      const pinsLayer = host.querySelector('.pins') as HTMLElement;
      expect(pinsLayer.dataset.sandboxTheme).toBe('dark');

      handle.setScope('state');
      const stateOutlines = pinsLayer.querySelectorAll('.ca-outlines.sandbox-outlines .sandbox-outline-zone');
      expect(stateOutlines.length).toBeGreaterThanOrEqual(californiaAtlas.districts.length);
      expect(pinsLayer.querySelectorAll('.sandbox-outline-corner').length).toBeGreaterThanOrEqual(californiaAtlas.districts.length * 4);

      const visibleDistricts = [...pinsLayer.querySelectorAll<HTMLButtonElement>('[data-ca-district]')].filter(el => !el.hidden);
      expect(visibleDistricts.length).toBeGreaterThanOrEqual(6);
      expect(visibleDistricts.some(el => el.textContent?.includes('内华达山脉'))).toBe(true);
      expect(visibleDistricts.some(el => el.textContent?.includes('莫哈韦沙漠'))).toBe(true);
      expect(visibleDistricts.every(el => el.classList.contains('sandbox-pin') && el.classList.contains('sandbox-district-pin'))).toBe(true);

      const bayBtn = visibleDistricts.find(el => el.dataset.caDistrict === 'bay-area')!;
      bayBtn.click();
      expect(pinsLayer.querySelector('[data-location="california-openai"]')).not.toBeNull();
      const bayOutlines = pinsLayer.querySelectorAll('.ca-outlines.sandbox-outlines .sandbox-outline-zone');
      expect(bayOutlines.length).toBeGreaterThanOrEqual(1);
    } finally {
      handle?.destroy();
      createSpy.mockRestore();
      window.requestAnimationFrame = prevRaf;
      window.cancelAnimationFrame = prevCancel;
      window.ResizeObserver = prevRo;
      host.remove();
    }
  });
});
