import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  applyTokyoCanvasResolution, nativeTokyoCanvasResolution,
} from '../src/frontend/tokyo-sandbox-resolution';

describe('Tokyo GLB native rendering resolution', () => {
  it.each([
    { css: [480, 320], dpr: 1, expected: [480, 320] },
    { css: [480, 320], dpr: 2, expected: [960, 640] },
    { css: [390, 350], dpr: 3, expected: [1170, 1050] },
    { css: [320.2, 250.1], dpr: 2, expected: [642, 502] },
  ])('preserves the full backing resolution for DPR $dpr', ({ css, dpr, expected }) => {
    const resolution = nativeTokyoCanvasResolution(css[0], css[1], dpr);
    expect([
      Math.floor(resolution.width * resolution.pixelRatio),
      Math.floor(resolution.height * resolution.pixelRatio),
    ]).toEqual(expected);
  });

  it('never renders below 1 CSS pixel per backing pixel when DPR is invalid or below 1', () => {
    expect(nativeTokyoCanvasResolution(390, 200, .75).pixelRatio).toBe(1);
    expect(nativeTokyoCanvasResolution(390, 200, NaN).pixelRatio).toBe(1);
    expect(nativeTokyoCanvasResolution(390, 200, undefined).pixelRatio).toBe(1);
  });

  it('does not reduce canvas resolution or reset the buffer on camera zoom and flight', () => {
    const renderer = { setPixelRatio: vi.fn(), setSize: vi.fn() };
    const original = nativeTokyoCanvasResolution(480, 320, 2.5);
    let current = applyTokyoCanvasResolution(renderer, original);
    for (const zoom of [.65, 1, 1.4, 3, 12, 1]) {
      // Zoom only changes the camera; the canvas keeps its native resolution.
      void zoom;
      current = applyTokyoCanvasResolution(renderer, nativeTokyoCanvasResolution(480, 320, 2.5), current);
    }
    expect(renderer.setPixelRatio).toHaveBeenCalledExactlyOnceWith(2.5);
    expect(renderer.setSize).toHaveBeenCalledExactlyOnceWith(480, 320, false);
    current = applyTokyoCanvasResolution(renderer, nativeTokyoCanvasResolution(600, 320, 2.5), current);
    expect(renderer.setSize).toHaveBeenCalledTimes(2);
    current = applyTokyoCanvasResolution(renderer, nativeTokyoCanvasResolution(600, 320, 3), current);
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(3);
  });

  it('keeps the map canvas independent of 3D camera zoom and CSS stage scaling', () => {
    const map = readFileSync('src/frontend/CitySandboxScene.vue', 'utf8');
    const world = readFileSync('src/frontend/WorldMap.vue', 'utf8');
    expect(map).toContain('nativeTokyoCanvasResolution(');
    expect(map).toContain('applyTokyoCanvasResolution(');
    expect(map).not.toContain('Math.min(1.4, window.devicePixelRatio');
    expect(world).toContain('<div class="wm-stage">');
    expect(world).not.toContain('class="wm-stage" :style="transform"');
  });
});
