import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { phoneModels, phoneContour, frontPose, rotatePhone, zoomPhone, fitPhoneScale } from '../src/frontend/phone-spatial-model';
import { spatialPhoneLease } from '../src/frontend/phone-spatial';
import type { PhoneLease } from '../src/frontend/phone-runtime';

let lease: PhoneLease | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({matches: true}));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { lease?.release(); lease = undefined; document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const anchor = document.createElement('div'); document.body.append(anchor);
  anchor.getBoundingClientRect = () => ({width: 400, height: 800, left: 0, top: 0, right: 400, bottom: 800, x: 0, y: 0, toJSON(){}});
  const panel = document.createElement('div'); panel.id = 'sttts-panel'; document.body.append(panel);
  const frame = document.createElement('iframe'); panel.append(frame);
  const source = {release: vi.fn(), sync: vi.fn(), focus: vi.fn()};
  lease = spatialPhoneLease(source, window, anchor, 'emma');
  return {anchor, panel, frame, source, doc: frame.contentDocument!};
}
function pointer(target: Document | HTMLElement, type: string, x: number, y: number) {
  const event = new MouseEvent(type, {bubbles:true, cancelable:true, screenX:x, screenY:y, button:0});
  Object.assign(event, {pointerType:'mouse', pointerId:1}); target.dispatchEvent(event); return event;
}
function touch(target: Document, type: string, points: [number, number][]) {
  const event = new Event(type, {bubbles:true,cancelable:true});
  Object.assign(event, {touches:points.map(([screenX,screenY],identifier)=>({screenX,screenY,identifier}))});
  target.dispatchEvent(event); return event;
}
describe('spatial phone presentation', () => {
  it('keeps four distinct hulls, camera layouts and case designs', () => {
    expect(new Set(Object.values(phoneModels).map(p=>p.width))).toHaveProperty('size',4);
    expect(new Set(Object.values(phoneModels).map(p=>JSON.stringify(p.cameras)))).toHaveProperty('size',4);
    for (const p of Object.values(phoneModels)) expect(phoneContour(p.width,p.height,p.radius).every(q=>q.length>0&&Number.isFinite(q.angle))).toBe(true);
  });
  it('bounds zoom and pitch, wraps yaw and fits oblique hulls', () => {
    expect(zoomPhone(frontPose(),Infinity)).toEqual(frontPose());
    expect(zoomPhone(frontPose(),100).zoom).toBe(1.8);
    expect(zoomPhone(frontPose(),.01).zoom).toBe(.6);
    expect(rotatePhone(frontPose(),10000,10000).pitch).toBe(-65);
    expect(Math.abs(rotatePhone(frontPose(),10000,0).yaw)).toBeLessThanOrEqual(180);
    const angled = fitPhoneScale(408,866,23,{yaw:90,pitch:65,zoom:1.8},200,400,1.8);
    expect(angled).toBeGreaterThan(0); expect(angled).toBeLessThan(.5);
  });
  it('a normal drag remains scrolling; long press rotates and suppresses its click', () => {
    const {doc,panel} = setup();
    pointer(doc,'pointerdown',100,100); pointer(doc,'pointermove',100,130); vi.advanceTimersByTime(500);
    expect(panel.dataset.phoneYaw).toBe('0.00');
    pointer(doc,'pointerdown',100,100); vi.advanceTimersByTime(460);
    expect(pointer(doc,'pointermove',200,120).defaultPrevented).toBe(true);
    vi.advanceTimersByTime(20); expect(Number(panel.dataset.phoneYaw)).toBe(65);
    pointer(doc,'pointerup',200,120);
    const click=new MouseEvent('click',{bubbles:true,cancelable:true}); doc.dispatchEvent(click); expect(click.defaultPrevented).toBe(true);
    vi.advanceTimersByTime(600);
    const next=new MouseEvent('click',{bubbles:true,cancelable:true}); doc.dispatchEvent(next); expect(next.defaultPrevented).toBe(false);
  });
  it('two touches zoom without activating an app; cancellation retires the gesture', () => {
    const {doc,panel} = setup();
    expect(touch(doc,'touchstart',[[100,100],[200,100]]).defaultPrevented).toBe(true);
    expect(touch(doc,'touchmove',[[80,100],[220,100]]).defaultPrevented).toBe(true);
    vi.advanceTimersByTime(20); expect(Number(panel.dataset.phoneZoom)).toBeCloseTo(1.4,3);
    expect(touch(doc,'touchend',[]).defaultPrevented).toBe(true);
    const click=new MouseEvent('click',{bubbles:true,cancelable:true}); doc.dispatchEvent(click); expect(click.defaultPrevented).toBe(true);
  });
  it('leaves text selection alone, retains the iframe, and cleans up on close', () => {
    const {anchor,panel,frame,source,doc} = setup();
    const input = doc.createElement('input'); doc.body.append(input);
    pointer(input,'pointerdown',10,10); vi.advanceTimersByTime(500);
    expect(panel.dataset.phoneGesture).toBe('idle');
    anchor.dispatchEvent(new CustomEvent('unread-city-phone-view',{detail:'back'}));
    expect(panel.dataset.phoneYaw).toBe('180.00'); expect(frame.inert).toBe(true);
    anchor.dispatchEvent(new CustomEvent('unread-city-phone-view',{detail:'front'}));
    expect(panel.dataset.phoneYaw).toBe('0.00'); expect(frame.inert).toBe(false);
    lease!.release();
    expect(source.release).toHaveBeenCalledTimes(1);
    expect(frame.parentElement).toBe(panel);
    expect(panel.querySelector('.uc-phone-solid')).toBeNull();
    expect(doc.documentElement.dataset.ucSpatialScreen).toBeUndefined();
  });
});
