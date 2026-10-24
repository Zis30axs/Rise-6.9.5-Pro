import type { ProtagonistId } from '../runtime/dual-protagonists';
import type { PhoneLease } from './phone-runtime';
import { createPhoneSolid, phoneModels, frontPose, rotatePhone, zoomPhone, fitPhoneScale } from './phone-spatial-model';
import css from './phone-spatial.css?inline';

const HOLD_MS = 450, MOVE_SLOP = 8;
const screenCss = `html[data-uc-spatial-screen],html[data-uc-spatial-screen] body{background:transparent!important}
html[data-uc-spatial-screen] body{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
html[data-uc-spatial-screen] :is(input,textarea,[contenteditable=true]){user-select:text;-webkit-user-select:text;-webkit-touch-callout:default}
html[data-uc-spatial-screen] .stage{padding:0!important;width:390px!important;height:844px!important}
html[data-uc-spatial-screen] .stage-bar,html[data-uc-spatial-screen] .power-key{display:none!important}
html[data-uc-spatial-screen] .device{flex:none!important;width:390px!important;height:844px!important;max-width:none!important;padding:0!important;border:0!important;border-radius:38px!important;background:transparent!important;box-shadow:none!important}
html[data-uc-spatial-screen] .screen{border-radius:38px!important}
html[data-uc-spatial-screen] .island{transition:none}
html[data-uc-spatial-screen=soyo] .island{min-width:132px;height:27px;top:0;border-radius:0 0 18px 18px}
html[data-uc-spatial-screen=sakiko] .island:not([data-active]){min-width:13px;width:13px;height:13px;top:15px;padding:0}
html[data-uc-spatial-screen=sakiko] .island:not([data-active]) .camera{width:8px;height:8px;margin:auto}
html[data-uc-spatial-screen=emma] .island:not([data-active]){min-width:84px;height:27px;top:11px}`;

interface Point { id: number; x: number; y: number }
type Command = 'front' | 'back' | 'zoom-in' | 'zoom-out';
const editable = (target: EventTarget | null) => !!(target as Element | null)?.closest?.('input,textarea,select,[contenteditable=true],[data-phone-gesture-ignore]');

/** Decorates the existing presentation lease; never moves/reloads the iframe. */
export function spatialPhoneLease(lease: PhoneLease, win: Window, anchor: HTMLElement, owner: ProtagonistId): PhoneLease {
  const panel = win.document.getElementById('sttts-panel');
  const frame = panel?.querySelector<HTMLIFrameElement>('iframe');
  if (!panel || !frame || frame.parentElement !== panel) return lease;
  const spec = phoneModels[owner], solid = createPhoneSolid(win.document, owner);
  const style = win.document.createElement('style'); style.textContent = css;
  const originalInert = frame.inert;
  let pose = frontPose(), ended = false, raf = 0, hold = 0, clickUntil = 0;
  let mode: 'idle' | 'pending' | 'rotate' | 'pinch' = 'idle';
  let start: Point | undefined, last: Point | undefined, distance = 0;
  let pressed: { element: Element; id: number } | undefined;
  const remove: (() => void)[] = [];
  let removeScreen: (() => void) | undefined;
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let opening: number | undefined = reduced ? undefined : win.performance.now();
  const put = (element: HTMLElement, key: string, value: string) => {
    if (element.style.getPropertyValue(key) !== value || element.style.getPropertyPriority(key) !== 'important') element.style.setProperty(key, value, 'important');
  };
  panel.dataset.ucSpatialPhone = owner;
  panel.append(style, solid);
  const listen = (target: EventTarget, event: string, fn: EventListener, options?: AddEventListenerOptions | boolean, cleanups = remove) => {
    target.addEventListener(event, fn, options); cleanups.push(() => target.removeEventListener(event, fn, options));
  };
  function render() {
    if (ended) return;
    const rect = anchor.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const base = Math.min((rect.width - 16) / spec.width, (rect.height - 16) / spec.height) * .87;
    const scale = fitPhoneScale(spec.width, spec.height, spec.depth, pose, rect.width - 10, rect.height - 10, base * pose.zoom);
    let entry = 1;
    if (opening !== undefined) {
      entry = 1 - Math.pow(1 - Math.min(1, (win.performance.now() - opening) / 460), 3);
      if (entry >= 1) opening = undefined;
      else schedule();
    }
    const transform = `perspective(1800px) scale(${scale * (.6 + .4 * entry)}) rotateX(${pose.pitch + (1 - entry) * 10}deg) rotateY(${pose.yaw - (1 - entry) * 20}deg)`;
    put(solid, 'left', `${rect.width / 2 - spec.width / 2}px`); put(solid, 'top', `${rect.height / 2 - spec.height / 2}px`);
    put(solid, 'transform', transform);
    put(frame!, 'left', `${rect.width / 2 - 195}px`); put(frame!, 'top', `${rect.height / 2 - 422}px`);
    put(frame!, 'transform-origin', '50% 50%'); put(frame!, 'transform', `${transform} translateZ(${spec.depth / 2 + 1}px)`);
    panel!.dataset.phoneYaw = pose.yaw.toFixed(2); panel!.dataset.phonePitch = pose.pitch.toFixed(2); panel!.dataset.phoneZoom = pose.zoom.toFixed(3); panel!.dataset.phoneScale = scale.toFixed(4);
    panel!.dataset.phoneOpening = String(opening !== undefined); panel!.dataset.phoneGesture = mode;
    // Back faces must not leave invisible app controls in the keyboard sequence.
    frame!.inert = Math.cos(pose.yaw * Math.PI / 180) < 0;
  }
  function schedule() { if (!ended && !raf) raf = win.requestAnimationFrame(() => { raf = 0; render(); }); }
  function clearHold() { win.clearTimeout(hold); hold = 0; }
  function cancel() {
    clearHold(); mode = 'idle'; start = last = undefined; distance = 0;
    if (pressed) { try { pressed.element.releasePointerCapture(pressed.id); } catch { /* Pointer may already have ended. */ } pressed = undefined; }
    schedule();
  }
  function begin(point: Point, target: EventTarget | null) {
    clearHold(); start = last = point; mode = 'pending';
    hold = win.setTimeout(() => {
      if (ended || mode !== 'pending') return;
      opening = undefined; mode = 'rotate'; clickUntil = win.performance.now() + 800;
      const element = target as Element | null;
      try { element?.setPointerCapture(point.id); if (element) pressed = { element, id: point.id }; } catch { /* Touch events use their original document. */ }
      schedule();
    }, HOLD_MS);
  }
  function move(point: Point) {
    if (!start || !last) return false;
    if (mode === 'pending' && Math.hypot(point.x - start.x, point.y - start.y) > MOVE_SLOP) { cancel(); return false; }
    if (mode !== 'rotate') return false;
    pose = rotatePhone(pose, point.x - last.x, point.y - last.y); last = point;
    clickUntil = win.performance.now() + 800; schedule(); return true;
  }
  function consume(e: Event) { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); }
  function bindInput(target: HTMLElement | Document, cleanups = remove) {
    listen(target, 'pointerdown', ((e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0 || editable(e.target)) return;
      begin({id: e.pointerId, x: e.screenX, y: e.screenY}, e.target);
    }) as EventListener, true, cleanups);
    listen(target, 'pointermove', ((e: PointerEvent) => {
      if (e.pointerType !== 'touch' && move({id: e.pointerId, x: e.screenX, y: e.screenY})) consume(e);
    }) as EventListener, true, cleanups);
    listen(target, 'pointerup', ((e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (mode === 'rotate') { clickUntil = win.performance.now() + 500; consume(e); }
      cancel();
    }) as EventListener, true, cleanups);
    listen(target, 'pointercancel', ((e: PointerEvent) => { if (e.pointerType !== 'touch') cancel(); }) as EventListener, true, cleanups);
    const points = (e: TouchEvent): Point[] => Array.from(e.touches).map(t => ({id: t.identifier, x: t.screenX, y: t.screenY}));
    const span = (p: Point[]) => Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
    listen(target, 'touchstart', ((e: TouchEvent) => {
      const p = points(e);
      if (p.length >= 2) { clearHold(); opening = undefined; mode = 'pinch'; distance = span(p); clickUntil = win.performance.now() + 800; consume(e); schedule(); }
      else if (p.length === 1 && !editable(e.target)) begin(p[0]!, null);
    }) as EventListener, {capture: true, passive: false}, cleanups);
    listen(target, 'touchmove', ((e: TouchEvent) => {
      const p = points(e);
      if (mode === 'pinch' && p.length >= 2) {
        const next = span(p); if (distance > 0) pose = zoomPhone(pose, next / distance);
        distance = next; consume(e); schedule();
      } else if (p.length === 1 && move(p[0]!)) consume(e);
    }) as EventListener, {capture: true, passive: false}, cleanups);
    listen(target, 'touchend', ((e: TouchEvent) => {
      if (mode === 'rotate' || mode === 'pinch') { clickUntil = win.performance.now() + 500; consume(e); }
      cancel();
    }) as EventListener, {capture: true, passive: false}, cleanups);
    listen(target, 'touchcancel', cancel, true, cleanups);
    listen(target, 'click', (e => { if (win.performance.now() < clickUntil) consume(e); }) as EventListener, true, cleanups);
    listen(target, 'contextmenu', (e => { if (mode === 'rotate') consume(e); }) as EventListener, true, cleanups);
  }
  function bindScreen() {
    removeScreen?.(); removeScreen = undefined;
    try {
      const doc = frame!.contentDocument; if (!doc?.documentElement || !doc.head) return;
      const before = doc.documentElement.getAttribute('data-uc-spatial-screen'), rules = doc.createElement('style');
      rules.textContent = screenCss; doc.head.append(rules); doc.documentElement.dataset.ucSpatialScreen = owner;
      const cleanups: (() => void)[] = []; bindInput(doc, cleanups);
      listen(doc, 'visibilitychange', cancel, false, cleanups);
      removeScreen = () => { cleanups.forEach(fn => fn()); rules.remove(); if (before === null) delete doc.documentElement.dataset.ucSpatialScreen; else doc.documentElement.setAttribute('data-uc-spatial-screen', before); };
    } catch { /* An external cross-origin phone still supports the case and toolbar. */ }
  }
  bindInput(solid); bindScreen(); listen(frame, 'load', bindScreen);
  // Focusing an iframe blurs its parent window without leaving the application.
  listen(win, 'blur', () => { if (!win.document.hasFocus()) cancel(); }); listen(win, 'resize', schedule);
  listen(anchor, 'unread-city-phone-view', ((event: CustomEvent<Command>) => {
    cancel(); opening = undefined;
    if (event.detail === 'front') pose = frontPose();
    else if (event.detail === 'back') pose = {...frontPose(), yaw: 180, pitch: -8};
    else if (event.detail === 'zoom-in') pose = zoomPhone(pose, 1.12);
    else if (event.detail === 'zoom-out') pose = zoomPhone(pose, 1 / 1.12);
    render();
  }) as EventListener);
  const resize = new ResizeObserver(schedule); resize.observe(anchor);
  // Native host sync runs in RAF; reapply before that frame paints to avoid a flat-frame flash.
  const changes = new MutationObserver(render); changes.observe(frame, {attributes: true, attributeFilter: ['style']});
  render();
  return {
    focus: () => lease.focus(),
    sync() { lease.sync(); render(); },
    release() {
      if (ended) return;
      ended = true; cancel(); win.cancelAnimationFrame(raf); resize.disconnect(); changes.disconnect();
      remove.forEach(fn => fn()); removeScreen?.(); style.remove(); solid.remove();
      frame!.inert = originalInert;
      for (const key of ['ucSpatialPhone','phoneYaw','phonePitch','phoneZoom','phoneScale','phoneOpening','phoneGesture']) delete panel!.dataset[key];
      lease.release();
    },
  };
}
