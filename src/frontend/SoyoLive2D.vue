<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { isSoyoSpeaker, resolveSoyoEmotion } from './live2d-soyo-assets';
import {
  createLive2dPortraitCache,
  live2dPortraitCacheKey,
  type Live2dCachedInstance,
} from './live2d-portrait-cache';
import type { SoyoPortrait } from './live2d-soyo-runtime';

const props = withDefaults(defineProps<{ emotion: string; speaker: string; active?: boolean; dimmed?: boolean; refreshToken?: number }>(), { active: true, refreshToken: 0 });
const injectedCache = inject(live2dPortraitCacheKey, undefined);
const localCache = injectedCache ? undefined : createLive2dPortraitCache();
const cache = injectedCache ?? localCache!;
const host = ref<HTMLElement>();
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const displayedEmotion = ref('平静');
const present = computed(() => isSoyoSpeaker(props.speaker));
let portrait: SoyoPortrait | undefined;
let canvasEl: HTMLCanvasElement | undefined;
let observer: ResizeObserver | undefined;
let dead = false;
let updateSequence = 0;
let loading: AbortController | undefined;
let epoch = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let unregisterOwner: (() => void) | undefined;
let loadedKey = '';
let appliedEmotion: string | undefined;
const visible = () => props.active && present.value && !document.hidden;
const currentCacheKey = () => `bundled-soyo:${props.refreshToken}`;
const targetEmotion = () => (props.speaker === '旁白' || !props.speaker ? '平静' : resolveSoyoEmotion(props.emotion));

function syncCanvasDisplay() {
  if (canvasEl) canvasEl.style.display = status.value === 'ready' ? '' : 'none';
}
function clearActiveOwner() {
  unregisterOwner?.();
  unregisterOwner = undefined;
}
function registerActiveOwner(key: string) {
  clearActiveOwner();
  unregisterOwner = cache.registerOwner(key, {
    isActive: () => !dead && visible() && status.value === 'ready',
    yieldPortrait: detachForTransfer,
  });
}
function canParkLoaded() {
  return Boolean(
    !cache.disposed
    && !document.hidden
    && portrait
    && canvasEl
    && status.value === 'ready'
    && loadedKey
    && loadedKey === currentCacheKey(),
  );
}
function detachForTransfer(): Live2dCachedInstance | null {
  if (dead || visible() || !canParkLoaded() || !portrait || !canvasEl) return null;
  const handed: Live2dCachedInstance = {
    portrait,
    canvas: canvasEl,
    ...(appliedEmotion !== undefined ? { emotion: appliedEmotion } : {}),
  };
  epoch++; updateSequence++;
  clearTimeout(idleTimer); idleTimer = undefined;
  clearActiveOwner();
  canvasEl.removeEventListener('webglcontextlost', contextLost, true);
  handed.portrait.setActive(false);
  handed.canvas.style.display = 'none';
  handed.canvas.remove();
  portrait = undefined; canvasEl = undefined; loadedKey = ''; appliedEmotion = undefined; status.value = 'idle';
  return handed;
}
function release(forceDestroy = false) {
  const parkable = !forceDestroy && canParkLoaded();
  const parkKey = loadedKey;
  const activePortrait = portrait;
  const activeCanvas = canvasEl;
  const parkEmotion = appliedEmotion;

  epoch++; updateSequence++;
  clearTimeout(idleTimer); idleTimer = undefined;
  clearActiveOwner();
  // Stop intentional context destruction from being handled as a new failure.
  activeCanvas?.removeEventListener('webglcontextlost', contextLost, true);
  loading?.abort(); loading = undefined;
  portrait = undefined; canvasEl = undefined; loadedKey = ''; appliedEmotion = undefined; status.value = 'idle';

  if (parkable && activePortrait && activeCanvas && cache.park({
    key: parkKey,
    portrait: activePortrait,
    canvas: activeCanvas,
    ...(parkEmotion !== undefined ? { emotion: parkEmotion } : {}),
  })) {
    return;
  }
  if (activeCanvas) {
    activeCanvas.width = 1; activeCanvas.height = 1;
    activeCanvas.remove();
  }
  activePortrait?.destroy();
}
function contextLost(event: Event) {
  event.preventDefault(); event.stopImmediatePropagation();
  if (event.target !== canvasEl) return;
  cache.invalidate(loadedKey || currentCacheKey());
  release(true); status.value = 'error';
}
function refresh(previousToken?: number) {
  if (typeof previousToken === 'number') cache.invalidate(`bundled-soyo:${previousToken}`);
  release(true);
  return load();
}

function resize() {
  const bounds = host.value?.getBoundingClientRect();
  if (bounds) portrait?.resize(bounds.width, bounds.height);
}
function activity() {
  if (dead) return;
  clearTimeout(idleTimer); idleTimer = undefined;
  if (document.hidden) {
    release(true);
    localCache?.clear();
    return;
  }
  portrait?.setActive(visible() && status.value === 'ready');
  syncCanvasDisplay();
  if (visible()) {
    if (status.value === 'idle') void load();
    else if (status.value === 'ready') resize();
  } else if (portrait) {
    // Brief panels, NPC speaker turns, and paired-stage handoffs keep the fallback
    // portrait warm; prolonged inactivity parks into standby before GPU reclamation.
    idleTimer = setTimeout(() => release(false), 60_000);
  } else if (loading || status.value === 'loading') {
    release(true);
  }
}
async function expression() {
  if (!portrait || dead) return;
  const emotion = targetEmotion();
  if (appliedEmotion === emotion) { displayedEmotion.value = emotion; return; }
  const sequence = ++updateSequence;
  appliedEmotion = undefined;
  try {
    await portrait.setEmotion(emotion);
    if (!dead && sequence === updateSequence) {
      appliedEmotion = emotion;
      displayedEmotion.value = emotion;
    }
  } catch { if (!dead && sequence === updateSequence) { release(true); status.value = 'error'; } }
}
watch(() => [props.emotion, props.speaker], () => { activity(); if (visible()) void expression(); }, { flush: 'post' });
watch(() => props.active, activity, { flush: 'post' });
watch(() => props.refreshToken, (_next, prev) => { void refresh(prev); });
watch(status, syncCanvasDisplay, { flush: 'post' });
async function adoptCached(cached: Live2dCachedInstance, key: string, request: number) {
  if (!host.value) return;
  cached.canvas.className = 'soyo-live2d-canvas';
  host.value.prepend(cached.canvas);
  canvasEl = cached.canvas;
  canvasEl.addEventListener('webglcontextlost', contextLost, true);
  portrait = cached.portrait;
  loadedKey = key;
  appliedEmotion = cached.emotion;
  if (appliedEmotion) displayedEmotion.value = appliedEmotion;
  resize();
  if (appliedEmotion !== targetEmotion()) {
    cached.canvas.style.display = 'none';
    await expression();
    if (dead || request !== epoch) return;
  }
  status.value = 'ready';
  syncCanvasDisplay();
  registerActiveOwner(key);
  activity();
}
async function load() {
  if (dead || !visible() || !host.value || portrait || status.value === 'loading') return;
  const request = ++epoch;
  const key = currentCacheKey();
  const immediate = cache.acquire(key);
  if (immediate) {
    try { await adoptCached(immediate, key, request); return; }
    catch { if (!dead && request === epoch) { cache.invalidate(key); release(true); status.value = 'error'; } return; }
  }
  status.value = 'loading';
  try {
    await nextTick();
    if (dead || request !== epoch || !visible() || !host.value) {
      if (!dead && request === epoch && status.value === 'loading') status.value = 'idle';
      return;
    }

    const cached = cache.acquire(key);
    if (cached) {
      await adoptCached(cached, key, request);
      return;
    }

    const controller = new AbortController(); loading = controller;
    const nextCanvas = document.createElement('canvas');
    nextCanvas.className = 'soyo-live2d-canvas';
    nextCanvas.style.display = 'none';
    host.value.prepend(nextCanvas);
    canvasEl = nextCanvas;

    const { createSoyoPortrait } = await import('./live2d-soyo-runtime');
    if (dead || request !== epoch || !visible() || !host.value || canvasEl !== nextCanvas) { nextCanvas.remove(); return; }
    nextCanvas.addEventListener('webglcontextlost', contextLost, true);
    const ready = await createSoyoPortrait(nextCanvas, controller.signal);
    if (dead || request !== epoch || !visible() || !host.value || canvasEl !== nextCanvas) { nextCanvas.remove(); ready.destroy(); return; }
    portrait = ready;
    loadedKey = key;
    resize(); await expression();
    if (dead || request !== epoch) return;
    status.value = 'ready';
    registerActiveOwner(key);
    activity();
  } catch { if (!dead && request === epoch) { cache.invalidate(key); release(true); status.value = 'error'; } }
}
onMounted(() => {
  observer = new ResizeObserver(resize); observer.observe(host.value!);
  document.addEventListener('visibilitychange', activity);
  activity();
});
onBeforeUnmount(() => {
  dead = true;
  localCache?.dispose();
  release(false);
  observer?.disconnect();
  document.removeEventListener('visibilitychange', activity);
});
</script>

<template>
  <div ref="host" class="soyo-live2d" :class="{ 'is-muted': !present || !active, 'is-dimmed': dimmed }" :data-live2d-status="status"
    :data-live2d-emotion="displayedEmotion" :data-live2d-speaker-visible="present" aria-hidden="true">
    <span v-if="status === 'error'" class="soyo-live2d-error">立绘暂时未能显示</span>
  </div>
</template>
