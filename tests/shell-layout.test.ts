import { afterEach, describe, expect, it } from 'vitest';
import {
  bindShellLayout, clampLayout, layoutStorageKey, parseLayout, resizeFromTop,
  type LayoutRect,
} from '../src/frontend/shell-layout';

afterEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
});

describe('custom shell HUD geometry', () => {
  it('keeps desktop/mobile and scene/novel layout preferences isolated', () => {
    const keys = [
      layoutStorageKey(false, 'scene'),
      layoutStorageKey(false, 'novel'),
      layoutStorageKey(true, 'scene'),
      layoutStorageKey(true, 'novel'),
    ];
    expect(new Set(keys).size).toBe(4);
  });

  it('rejects malformed or unsupported layout storage without throwing', () => {
    expect(parseLayout('{broken')).toEqual({});
    expect(parseLayout('{"reading":{"x":-1,"y":0,"w":0.5,"h":0.2}}')).toEqual({});
    expect(parseLayout('{"reading":{"x":0.1,"y":0.2,"w":0.5,"h":0.3},"prototype":{"x":0,"y":0,"w":0,"h":0}}'))
      .toHaveProperty('reading', { x: 0.1, y: 0.2, w: 0.5, h: 0.3 });
  });

  it('clamps moved and resized HUD controls within screen boundaries', () => {
    const rect = clampLayout({ left: 900, top: -40, width: 600, height: 940 }, 390, 844, 190, 150);
    expect(rect.left).toBeGreaterThanOrEqual(4);
    expect(rect.top).toBeGreaterThanOrEqual(4);
    expect(rect.left + rect.width).toBeLessThanOrEqual(390 - 4);
    expect(rect.top + rect.height).toBeLessThanOrEqual(844 - 4);
  });

  it('dragging the reading top grip preserves its bottom edge while resizing', () => {
    const before: LayoutRect = { left: 12, top: 540, width: 366, height: 220 };
    const shorter = resizeFromTop(before, 60, 390, 844);
    expect(shorter.height).toBe(160);
    expect(shorter.top + shorter.height).toBe(760);
    const taller = resizeFromTop(before, -100, 390, 844);
    expect(taller.height).toBe(320);
    expect(taller.top + taller.height).toBe(760);
    const minimal = resizeFromTop(before, 300, 390, 844);
    expect(minimal.height).toBeGreaterThanOrEqual(150);
  });

  it('clamps customized mobile windows above the visible bottom navigation dock', () => {
    const shell = document.createElement('div');
    shell.className = 'uc-shell';
    Object.defineProperty(shell, 'clientWidth', { value: 390 });
    Object.defineProperty(shell, 'clientHeight', { value: 844 });
    shell.getBoundingClientRect = () => new DOMRect(0, 0, 390, 844);
    const dock = document.createElement('nav');
    dock.className = 'tool-dock';
    dock.getBoundingClientRect = () => new DOMRect(40, 754, 310, 70);
    const panel = document.createElement('section');
    panel.className = 'floating-window';
    panel.dataset.window = 'location';
    panel.getBoundingClientRect = () => new DOMRect(
      Number.parseFloat(panel.style.left) || 12,
      Number.parseFloat(panel.style.top) || 100,
      Number.parseFloat(panel.style.width) || 360,
      Number.parseFloat(panel.style.height) || 550,
    );
    shell.append(dock, panel);
    document.body.append(shell);
    const lease = bindShellLayout(shell);
    lease.place(panel, { left: 12, top: 650, width: 366, height: 255 });
    const top = Number.parseFloat(panel.style.top);
    const height = Number.parseFloat(panel.style.height);
    expect(top + height).toBeLessThanOrEqual(754 - 8);
    lease.dispose();
  });

  it('saves the placement locally; reveals handles only in edit mode; reset removes saved geometry', () => {
    const shell = document.createElement('div');
    shell.className = 'uc-shell';
    shell.dataset.presentationMode = 'novel';
    Object.defineProperty(shell, 'clientWidth', { configurable: true, value: 390 });
    Object.defineProperty(shell, 'clientHeight', { configurable: true, value: 844 });
    shell.getBoundingClientRect = () => new DOMRect(0, 0, 390, 844);
    const reading = document.createElement('section');
    reading.className = 'reading-layer';
    reading.getBoundingClientRect = () => new DOMRect(
      Number.parseFloat(reading.style.left) || 12,
      Number.parseFloat(reading.style.top) || 540,
      Number.parseFloat(reading.style.width) || 366,
      Number.parseFloat(reading.style.height) || 220,
    );
    shell.append(reading);
    document.body.append(shell);

    const lease = bindShellLayout(shell);
    expect(reading.querySelector('.uc-layout-handle')).toBeNull();
    lease.setEditing(true);
    expect(reading.querySelectorAll('.uc-layout-handle')).toHaveLength(2);
    lease.place(reading, { left: 12, top: 570, width: 366, height: 190 });
    lease.save(reading);

    const key = layoutStorageKey(true, 'novel');
    expect(JSON.parse(window.localStorage.getItem(key) || '{}').reading).toBeDefined();
    lease.setEditing(false);
    expect(reading.querySelector('.uc-layout-handle')).toBeNull();
    lease.reset();
    expect(window.localStorage.getItem(key)).toBeNull();
    lease.dispose();
    expect(reading.hasAttribute('data-layout-part')).toBe(false);
  });
});
