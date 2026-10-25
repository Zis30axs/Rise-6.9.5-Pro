import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { spatialPhoneLease } from '../src/frontend/phone-spatial';
import type { PhoneLease } from '../src/frontend/phone-runtime';

// Vitest stubs ?inline CSS, so jsdom computed styles cannot test hit regions.
// Assert the real CSS rules here, while Playwright checks computed style and native touch scrolling.
const caseCss = readFileSync(new URL('../src/frontend/phone-spatial.css', import.meta.url), 'utf8');
const normalFaceCss = caseCss.match(/\.uc-phone-front,\.uc-phone-back\s*\{([^}]*)\}/)?.[1] ?? '';
const rearFaceCss = caseCss.match(/#sttts-panel\[data-uc-spatial-phone\]\[data-phone-back-facing=true\] \.uc-phone-back\s*\{([^}]*)\}/)?.[1] ?? '';
let running: PhoneLease | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({matches: true}));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => {
  running?.release(); running = undefined;
  document.body.replaceChildren();
  vi.useRealTimers(); vi.unstubAllGlobals();
});
function setup() {
  const anchor = document.createElement('div');
  document.body.append(anchor);
  anchor.getBoundingClientRect = () => ({
    width: 390, height: 844, left: 0, top: 0, right: 390, bottom: 844,
    x: 0, y: 0, toJSON() {},
  });
  const panel = document.createElement('div'); panel.id = 'sttts-panel'; document.body.append(panel);
  const frame = document.createElement('iframe'); panel.append(frame);
  const source = {release: vi.fn(), focus: vi.fn(), sync: vi.fn()};
  running = spatialPhoneLease(source, window, anchor, 'emma');
  return {anchor, panel, frame, doc: frame.contentDocument!, source};
}
function touch(doc: Document, kind: string, coords: [number, number][]) {
  const event = new Event(kind, {bubbles: true, cancelable: true});
  Object.defineProperty(event, 'touches', {
    value: coords.map(([screenX, screenY], identifier) => ({identifier, screenX, screenY})),
  });
  doc.dispatchEvent(event);
  return event;
}

describe('3D phone native swipe hit testing', () => {
  it('keeps BOTH visual faces transparent while facing forward', () => {
    const {panel, frame} = setup();
    const front = panel.querySelector<HTMLElement>('.uc-phone-front')!;
    const back = panel.querySelector<HTMLElement>('.uc-phone-back')!;
    expect(panel.dataset.phoneBackFacing).toBe('false');
    expect(front).toBeTruthy(); expect(back).toBeTruthy();
    expect(normalFaceCss).toMatch(/pointer-events\s*:\s*none/);
    expect(normalFaceCss).toMatch(/touch-action\s*:\s*auto/);
    expect(frame.inert).toBe(false);
  });
  it('does not consume ordinary vertical OR horizontal app swipes', () => {
    const {doc, panel} = setup();
    expect(touch(doc, 'touchstart', [[180, 620]]).defaultPrevented).toBe(false);
    expect(touch(doc, 'touchmove', [[180, 510]]).defaultPrevented).toBe(false);
    touch(doc, 'touchend', []);
    expect(touch(doc, 'touchstart', [[290, 300]]).defaultPrevented).toBe(false);
    expect(touch(doc, 'touchmove', [[125, 300]]).defaultPrevented).toBe(false);
    touch(doc, 'touchend', []);
    expect(panel.dataset.phoneYaw).toBe('0.00');
  });
  it('enables dragging only on the visible rear face and restores it on front', () => {
    const {anchor, panel, frame} = setup();
    const back = panel.querySelector<HTMLElement>('.uc-phone-back')!;
    anchor.dispatchEvent(new CustomEvent('unread-city-phone-view', {detail:'back'}));
    expect(panel.dataset.phoneBackFacing).toBe('true');
    expect(back).toBeTruthy();
    expect(rearFaceCss).toMatch(/pointer-events\s*:\s*auto/);
    expect(rearFaceCss).toMatch(/touch-action\s*:\s*none/);
    expect(frame.inert).toBe(true);
    anchor.dispatchEvent(new CustomEvent('unread-city-phone-view', {detail:'front'}));
    expect(panel.dataset.phoneBackFacing).toBe('false');
    expect(normalFaceCss).toMatch(/pointer-events\s*:\s*none/);
    expect(frame.inert).toBe(false);
  });
  it('keeps long-hold rotation and pinch while cleaning up its data attribute', () => {
    const {panel, doc} = setup();
    touch(doc,'touchstart',[[100,100]]);
    vi.advanceTimersByTime(460);
    expect(touch(doc,'touchmove',[[160,105]]).defaultPrevented).toBe(true);
    touch(doc,'touchend',[]);
    expect(touch(doc,'touchstart',[[100,100],[200,100]]).defaultPrevented).toBe(true);
    expect(touch(doc,'touchmove',[[85,100],[215,100]]).defaultPrevented).toBe(true);
    touch(doc,'touchend',[]);
    running!.release(); running = undefined;
    expect(panel.hasAttribute('data-phone-back-facing')).toBe(false);
  });
});
