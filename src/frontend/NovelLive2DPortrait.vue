<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { live2dContext } from './live2d-context';
import {
  createLive2dPortraitCache,
  live2dPortraitCacheKey,
  type Live2dCachedInstance,
} from './live2d-portrait-cache';
import { live2dPack } from '../runtime/live2d-pack';
import { live2dIdentity } from '../runtime/live2d-identity';
import { chooseLive2dOutfit, confirmLive2dOutfit } from '../runtime/live2d-wardrobe';
import type { SoyoPortrait } from './live2d-soyo-runtime';

const props = withDefaults(defineProps<{ speaker: string; emotion: string; active?: boolean; dimmed?: boolean; refreshToken?: number }>(), { active: true, refreshToken: 0 });
const context = inject(live2dContext, undefined);
const injectedCache = inject(live2dPortraitCacheKey, undefined);
const localCache = injectedCache ? undefined : createLive2dPortraitCache();
const cache = injectedCache ?? localCache!;
const revision = ref(0), host = ref<HTMLElement>();
const phase = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const loadedKey = ref(''), failedKey = ref('');
const packStatus = computed(() => { void revision.value; return live2dPack()?.status(); });
const selection = computed(() => {
  const value = context?.(), person = live2dIdentity(props.speaker), status = packStatus.value;
  if (!value?.enabled || !person || !status?.enabled) return null;
  const selected = chooseLive2dOutfit(value.session, value.state, person, status);
  return selected && value.session ? { ...selected, session: value.session, person, status } : null;
});
// A new weather/time trigger may confirm the same outfit. It does not require
// another model decode or GPU context. Resource revisions still invalidate it.
const selectionKey = computed(() => {
  const selected = selection.value;
  return selected ? JSON.stringify([selected.session, selected.person, selected.outfit.id,
    selected.status.pack, selected.status.generation, props.refreshToken]) : '';
});
const ready = computed(() => phase.value === 'ready' && loadedKey.value === selectionKey.value);
const fallback = computed(() => !packStatus.value?.hydrating &&
  (!selection.value || failedKey.value === selectionKey.value));
let portrait: SoyoPortrait | undefined, canvasEl: HTMLCanvasElement | undefined;
let appliedEmotion: string | undefined;
let abort: AbortController | undefined, observer: ResizeObserver | undefined;
let unconfirm: (() => void) | undefined, unsubscribe: (() => void) | undefined;
let unregisterOwner: (() => void) | undefined;
let loadedMeta: { pack: string; generation: number; refreshToken: number } | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let epoch = 0, emotionSequence = 0, dead = false;

function syncCanvasDisplay() {
  if (canvasEl) canvasEl.style.display = ready.value ? '' : 'none';
}
function clearActiveOwner() {
  unregisterOwner?.();
  unregisterOwner = undefined;
}
function registerActiveOwner(key: string) {
  clearActiveOwner();
  unregisterOwner = cache.registerOwner(key, {
    isActive: () => !dead && props.active && !document.hidden && ready.value,
    yieldPortrait: detachForTransfer,
  });
}
function canParkLoaded() {
  const status = packStatus.value;
  return Boolean(
    !cache.disposed
    && !document.hidden
    && portrait
    && canvasEl
    && phase.value === 'ready'
    && loadedKey.value
    && loadedMeta
    && status?.enabled
    && status.pack === loadedMeta.pack
    && status.generation === loadedMeta.generation
    && props.refreshToken === loadedMeta.refreshToken,
  );
}
function detachForTransfer(): Live2dCachedInstance | null {
  if (dead || (props.active && !document.hidden) || !canParkLoaded() || !portrait || !canvasEl) return null;
  const handed: Live2dCachedInstance = {
    portrait,
    canvas: canvasEl,
    ...(appliedEmotion !== undefined ? { emotion: appliedEmotion } : {}),
  };
  epoch++; emotionSequence++;
  clearTimeout(idleTimer); idleTimer = undefined;
  unconfirm?.(); unconfirm = undefined;
  clearActiveOwner();
  canvasEl.removeEventListener('webglcontextlost', lost, true);
  handed.portrait.setActive(false);
  handed.canvas.style.display = 'none';
  handed.canvas.remove();
  portrait = undefined; canvasEl = undefined; appliedEmotion = undefined;
  loadedKey.value = ''; loadedMeta = undefined; phase.value = 'idle';
  return handed;
}
function release(forceDestroy = false) {
  const parkable = !forceDestroy && canParkLoaded();
  const parkKey = loadedKey.value;
  const activePortrait = portrait;
  const activeCanvas = canvasEl;
  const parkEmotion = appliedEmotion;

  epoch++; emotionSequence++; phase.value = 'idle'; loadedKey.value = ''; loadedMeta = undefined; appliedEmotion = undefined;
  clearTimeout(idleTimer); idleTimer = undefined;
  unconfirm?.(); unconfirm = undefined;
  clearActiveOwner();
  activeCanvas?.removeEventListener('webglcontextlost', lost, true);
  abort?.abort(); abort = undefined;
  portrait = undefined; canvasEl = undefined;

  if (parkable && activePortrait && activeCanvas && cache.park({
    key: parkKey,
    portrait: activePortrait,
    canvas: activeCanvas,
    ...(parkEmotion !== undefined ? { emotion: parkEmotion } : {}),
  })) {
    return;
  }
  activeCanvas?.remove();
  activePortrait?.destroy();
}
function fail() {
  const key = selectionKey.value || loadedKey.value;
  if (key) cache.invalidate(key);
  release(true);
  failedKey.value = key;
  phase.value = 'error';
}
function lost(event: Event) { event.preventDefault(); event.stopImmediatePropagation(); fail(); }
function resize() { const box = host.value?.getBoundingClientRect(); if (box) portrait?.resize(box.width, box.height); }
async function emotion(initial = false) {
  if (!portrait || dead || (!initial && (!selectionKey.value || loadedKey.value !== selectionKey.value))) return;
  const target = props.emotion;
  if (appliedEmotion === target) return;
  const request = epoch, sequence = ++emotionSequence;
  appliedEmotion = undefined;
  try {
    await portrait.setEmotion(target);
    if (!dead && request === epoch && sequence === emotionSequence) appliedEmotion = target;
  }
  catch { if (request === epoch && sequence === emotionSequence) fail(); }
}
function confirm() {
  unconfirm?.(); unconfirm = undefined;
  const selected = selection.value;
  if (ready.value && props.active && !document.hidden && selected) {
    unconfirm = confirmLive2dOutfit(selected.session, selected.person, selected.choice, selected.status);
  }
}
function activity() {
  clearTimeout(idleTimer); idleTimer = undefined;
  if (dead || document.hidden) {
    release(true);
    if (document.hidden) localCache?.clear();
    return;
  }
  portrait?.setActive(props.active && ready.value);
  syncCanvasDisplay();
  confirm();
  if (props.active) {
    if (phase.value === 'idle') void load();
    else if (ready.value) { resize(); void emotion(); }
  } else if (portrait || abort) {
    // Briefly opening a panel pauses the current model; long absence releases it.
    idleTimer = setTimeout(() => release(true), 30_000);
  }
}
async function adoptCached(
  cached: Live2dCachedInstance,
  selected: NonNullable<typeof selection.value>,
  key: string,
  request: number,
) {
  if (!host.value) return;
  cached.canvas.className = 'soyo-live2d-canvas';
  host.value.appendChild(cached.canvas);
  canvasEl = cached.canvas;
  canvasEl.addEventListener('webglcontextlost', lost, true);
  portrait = cached.portrait;
  loadedMeta = { pack: selected.status.pack, generation: selected.status.generation, refreshToken: props.refreshToken };
  appliedEmotion = cached.emotion;
  loadedKey.value = key; phase.value = 'ready';
  resize();
  if (appliedEmotion !== props.emotion) {
    cached.canvas.style.display = 'none';
    await emotion(true);
    if (dead || request !== epoch) return;
  }
  syncCanvasDisplay();
  registerActiveOwner(key);
  activity();
  await nextTick(); if (!dead && request === epoch) resize();
}
async function load() {
  release(false); failedKey.value = '';
  const selected = selection.value, key = selectionKey.value;
  if (dead || document.hidden || !props.active || !selected) return;
  const request = epoch;
  if (host.value) {
    const immediate = cache.acquire(key);
    if (immediate) {
      try { await adoptCached(immediate, selected, key, request); return; }
      catch (error) {
        if (!dead && request === epoch) { fail(); console.warn('[UnreadCity Live2D] portrait fallback', error); }
        return;
      }
    }
  }
  phase.value = 'loading';
  let source: Awaited<ReturnType<typeof import('./live2d-ensemble-assets').createEnsembleSource>>;
  let transferred = false;
  try {
    await nextTick();
    if (dead || request !== epoch || !host.value) return;

    const cached = cache.acquire(key);
    if (cached) {
      await adoptCached(cached, selected, key, request);
      return;
    }

    const controller = new AbortController(); abort = controller;
    const nextCanvas = document.createElement('canvas');
    nextCanvas.className = 'soyo-live2d-canvas';
    nextCanvas.style.display = 'none';
    host.value.appendChild(nextCanvas);
    canvasEl = nextCanvas;

    const { createEnsembleSource } = await import('./live2d-ensemble-assets');
    source = await createEnsembleSource(selected.outfit, controller.signal);
    if (dead || request !== epoch || canvasEl !== nextCanvas) { source?.lease.release(); nextCanvas.remove(); return; }
    const { createSoyoPortrait } = await import('./live2d-soyo-runtime');
    if (dead || request !== epoch || canvasEl !== nextCanvas) { source?.lease.release(); nextCanvas.remove(); return; }
    nextCanvas.addEventListener('webglcontextlost', lost, true);
    transferred = true;
    const result = await createSoyoPortrait(nextCanvas, controller.signal, source);
    if (dead || request !== epoch || canvasEl !== nextCanvas) { nextCanvas.remove(); result.destroy(); return; }
    portrait = result;
    loadedMeta = { pack: selected.status.pack, generation: selected.status.generation, refreshToken: props.refreshToken };
    resize(); await emotion(true);
    if (dead || request !== epoch) return;
    loadedKey.value = key; phase.value = 'ready';
    registerActiveOwner(key);
    activity();
    await nextTick(); if (!dead && request === epoch) resize();
  } catch (error) {
    if (!transferred) source?.lease.release();
    if (!dead && request === epoch) { fail(); console.warn('[UnreadCity Live2D] portrait fallback', error); }
  }
}
watch(selectionKey, () => void load(), { flush: 'post' });
watch(packStatus, (next, prev) => {
  if (!next?.enabled || (prev && (next.pack !== prev.pack || next.generation !== prev.generation))) {
    localCache?.clear();
  }
});
watch(selection, confirm, { flush: 'post' });
watch(() => props.active, activity, { flush: 'post' });
watch(() => props.emotion, () => void emotion(), { flush: 'post' });
watch(ready, syncCanvasDisplay, { flush: 'post' });
watch(host, node => {
  observer?.disconnect();
  if (node) {
    observer?.observe(node);
    if (canvasEl && canvasEl.parentElement !== node) node.appendChild(canvasEl);
  }
});
onMounted(() => {
  unsubscribe = live2dPack()?.subscribe(() => revision.value++);
  observer = new ResizeObserver(resize); if (host.value) observer.observe(host.value);
  document.addEventListener('visibilitychange', activity); void load();
});
onBeforeUnmount(() => {
  dead = true;
  localCache?.dispose();
  release(false);
  unsubscribe?.(); observer?.disconnect();
  document.removeEventListener('visibilitychange', activity);
});
</script>
<template>
  <div v-if="selection" ref="host" class="soyo-live2d" :class="{ 'is-dimmed': dimmed, 'is-muted': !active }" aria-hidden="true"
    :data-live2d-person="selection.person" :data-live2d-outfit="selection.outfit.id" :data-live2d-status="ready ? 'ready' : phase" />
  <slot v-if="fallback" />
</template>
