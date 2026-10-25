<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import LocalMapGeometry from './LocalMapGeometry.vue';
import { protagonistNames } from '../runtime/protagonist-world';
import { getCampusInterior } from '../runtime/campus-interiors';
import { getNovelBackground, novelBackgroundPhase } from './novel-backgrounds';
import { getDowntownArtBackground, nearToyokawaEntrance } from './downtown-art-runtime';
import { downtownArtPack } from './generated/downtown-art';
import { PROTAGONIST_SWITCH_TIMING as timing, switchEase, type ProtagonistSwitchLease, type ProtagonistSwitchPhase } from './protagonist-switch';
import type { SwitchSceneHandle } from './switch-camera';

const props = defineProps<{ lease: ProtagonistSwitchLease; novelMode: boolean; hour: number; scene?: SwitchSceneHandle }>();
const emit = defineEmits<{ finished: []; exit: [] }>();
const root = ref<HTMLElement>();
const phase = ref<ProtagonistSwitchPhase>('ascent'), progress = ref(0);
const size = ref({ width: 1, height: 1 });
const committed = ref(false);
let win: Window & typeof globalThis, doc: Document, shell: HTMLElement | undefined;
let frame = 0, disposed = false, skipping = false;
let pendingFrame: ((completed: boolean) => void) | undefined;
let observer: ResizeObserver | undefined;
let warmedImage: HTMLImageElement | undefined, imageReady = !props.novelMode;
let media: MediaQueryList | undefined;
const source = props.lease.source.mapAnchor, target = props.lease.target.mapAnchor;
const targetName = protagonistNames[props.lease.target.protagonist];
const mapOpacity = computed(() => phase.value === 'ascent' ? switchEase((progress.value - .2) / .6)
  : phase.value === 'descent' ? 1 - switchEase((progress.value - .35) / .65)
  : phase.value === 'fade' ? 1 - progress.value : 1);
const cameraView = computed(() => {
  const t = switchEase(progress.value);
  const center = phase.value === 'ascent' ? source : phase.value === 'traverse'
    ? { x: source.x + (target.x - source.x) * t, z: source.z + (target.z - source.z) * t } : committed.value ? target : source;
  const zoom = phase.value === 'ascent' ? 6 - 4.2 * t : phase.value === 'descent' ? 1.8 + 4.2 * t : 1.8;
  return { center, zoom, overhead: 1 };
});

function cancelFrame() {
  if (frame) win.cancelAnimationFrame(frame);
  frame = 0;
  const complete = pendingFrame; pendingFrame = undefined; complete?.(false);
}
function animate(duration: number, update: (fraction: number) => void) {
  return new Promise<boolean>(resolve => {
    const started = win.performance.now(); let last = -Infinity;
    pendingFrame = resolve;
    const tick = (now: number) => {
      frame = 0;
      if (disposed || doc.hidden) { pendingFrame = undefined; resolve(false); return; }
      const t = Math.min(1, (now - started) / duration);
      if (t === 1 || now - last >= 30) { last = now; update(t); }
      if (pendingFrame !== resolve) return;
      if (t === 1) { pendingFrame = undefined; resolve(true); }
      else frame = win.requestAnimationFrame(tick);
    };
    update(0); if (pendingFrame === resolve) frame = win.requestAnimationFrame(tick);
  });
}
function showFrame(next: ProtagonistSwitchPhase, t: number) {
  phase.value = next; progress.value = t;
  if (shell) {
    shell.dataset.protagonistSwitchPhase = next;
    const lift = next === 'ascent' ? switchEase(t) : next === 'descent' ? 1 - switchEase(t) : next === 'fade' ? 0 : 1;
    shell.style.setProperty('--uc-switch-scale', String(1 - .18 * lift));
    shell.style.setProperty('--uc-switch-portrait-opacity', String(1 - Math.min(1, lift * 3)));
  }
  if (!props.novelMode) {
    if (next === 'ascent' && !props.lease.source.interior) props.scene?.setSwitchCamera(t);
    if (next === 'descent') props.scene?.setSwitchCamera(props.lease.target.interior ? 0 : 1 - t);
  }
}
function cleanup() {
  if (disposed) return;
  disposed = true; cancelFrame(); observer?.disconnect();
  media?.removeEventListener('change', motionChanged);
  if (warmedImage) { warmedImage.onload = null; warmedImage.onerror = null; warmedImage = undefined; }
  props.scene?.clearSwitchCamera(); props.lease.release();
  if (shell) {
    delete shell.dataset.protagonistSwitchPhase;
    shell.style.removeProperty('--uc-switch-scale'); shell.style.removeProperty('--uc-switch-portrait-opacity');
  }
}
function finish() { cleanup(); emit('finished'); }
function saveSwitch() {
  if (committed.value) return true;
  const saved = props.lease.commit(); committed.value = saved;
  return saved;
}
async function skip() {
  if (disposed || skipping) return;
  skipping = true; cancelFrame();
  saveSwitch();
  await nextTick();
  props.scene?.clearSwitchCamera();
  await animate(timing.fade, t => showFrame('fade', t));
  finish();
}
function motionChanged(event: MediaQueryListEvent) { if (event.matches) void skip(); }
function warmBackground() {
  if (!props.novelMode) return;
  const endpoint = props.lease.target;
  const image = warmedImage = new win.Image();
  const background = getDowntownArtBackground(downtownArtPack, { locationId: endpoint.locationId, phase: novelBackgroundPhase(props.hour),
    atHouseEntrance: endpoint.locationId === 'downtown' && nearToyokawaEntrance(endpoint.scene, getCampusInterior('toyokawa-house')?.entrance) })
    ?? getNovelBackground(endpoint.locationId, props.hour);
  image.onload = () => { void (image.decode?.() ?? Promise.resolve()).catch(() => {}).then(() => { imageReady = true; }); };
  image.onerror = () => { imageReady = true; };
  image.src = background.src;
}
async function run() {
  try {
    if (media?.matches) { await skip(); return; }
    if (!await animate(timing.ascent, t => showFrame('ascent', t))) return;
    if (!await animate(timing.traverse, t => showFrame('traverse', t))) return;
    if (!saveSwitch()) { props.scene?.clearSwitchCamera(); await animate(timing.fade, t => showFrame('fade', t)); return; }
    showFrame('waiting', 0);
    await nextTick();
    // Draw the incoming scene at altitude before exposing any of its pixels.
    if (!props.novelMode) props.scene?.setSwitchCamera(props.lease.target.interior ? 0 : 1);
    const ready = () => props.novelMode ? imageReady : props.scene?.presentationReady() ?? false;
    if (!ready()) {
      const complete = await animate(timing.readyTimeout, t => { if (ready()) { const done = pendingFrame; pendingFrame = undefined; if (frame) win.cancelAnimationFrame(frame); frame = 0; done?.(true); } });
      if (!complete || disposed) return;
    }
    await animate(timing.descent, t => showFrame('descent', t));
  } finally { if (!skipping && !disposed) finish(); }
}
onMounted(() => {
  if (!root.value) return;
  doc = root.value.ownerDocument; win = doc.defaultView as Window & typeof globalThis;
  shell = root.value.closest<HTMLElement>('.uc-shell') ?? undefined;
  const resize = () => { if (root.value) size.value = { width: root.value.clientWidth, height: root.value.clientHeight }; };
  resize(); if (win.ResizeObserver) { observer = new win.ResizeObserver(resize); observer.observe(root.value); }
  media = win.matchMedia('(prefers-reduced-motion: reduce)'); media.addEventListener('change', motionChanged);
  warmBackground(); void run();
});
onBeforeUnmount(cleanup);
defineExpose({ skip });
</script>

<template>
  <section ref="root" class="protagonist-switch-overlay" :class="{ 'is-night': hour < 6 || hour >= 20 }" data-protagonist-switch :data-switch-phase="phase" :data-switch-progress="progress.toFixed(3)" :data-switch-from="lease.source.protagonist" :data-switch-to="lease.target.protagonist" :data-switch-committed="committed" aria-label="角色切换">
    <div class="protagonist-switch-map world-map" :style="{ opacity: mapOpacity }">
      <LocalMapGeometry :width="size.width" :height="size.height" scope="city" :camera-view="cameraView" />
      <div class="protagonist-switch-reticle" aria-hidden="true"><i/><i/><i/></div>
    </div>
    <div class="protagonist-switch-caption" role="status" aria-live="polite"><small>视角切换</small><strong>{{ targetName }}</strong></div>
    <div class="protagonist-switch-actions"><button type="button" aria-label="切换动画中恢复酒馆" @click="emit('exit')">恢复酒馆</button><button type="button" data-switch-skip @click="skip">跳过 <kbd>Esc</kbd></button></div>
  </section>
</template>
