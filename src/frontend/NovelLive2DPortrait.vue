<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { live2dContext } from './live2d-context';
import { live2dPack } from '../runtime/live2d-pack';
import { live2dIdentity } from '../runtime/live2d-identity';
import { chooseLive2dOutfit, confirmLive2dOutfit } from '../runtime/live2d-wardrobe';
import type { SoyoPortrait } from './live2d-soyo-runtime';

const props = withDefaults(defineProps<{ speaker: string; emotion: string; active?: boolean; dimmed?: boolean; refreshToken?: number }>(), { active: true, refreshToken: 0 });
const context = inject(live2dContext, undefined);
const revision = ref(0), canvasGeneration = ref(0), host = ref<HTMLElement>(), canvas = ref<HTMLCanvasElement>();
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
const fallback = computed(() => props.active && !packStatus.value?.hydrating &&
  (!selection.value || failedKey.value === selectionKey.value));
let portrait: SoyoPortrait | undefined, abort: AbortController | undefined, observer: ResizeObserver | undefined;
let unconfirm: (() => void) | undefined, unsubscribe: (() => void) | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let epoch = 0, emotionSequence = 0, dead = false;

function release() {
  epoch++; emotionSequence++; phase.value = 'idle'; loadedKey.value = '';
  clearTimeout(idleTimer); idleTimer = undefined;
  unconfirm?.(); unconfirm = undefined;
  canvas.value?.removeEventListener('webglcontextlost', lost, true);
  abort?.abort(); abort = undefined; portrait?.destroy(); portrait = undefined;
}
function fail() { const key = selectionKey.value; release(); failedKey.value = key; phase.value = 'error'; }
function lost(event: Event) { event.preventDefault(); event.stopImmediatePropagation(); fail(); }
function resize() { const box = host.value?.getBoundingClientRect(); if (box) portrait?.resize(box.width, box.height); }
async function emotion() {
  const request = epoch, sequence = ++emotionSequence;
  try { await portrait?.setEmotion(props.emotion); }
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
  if (dead || document.hidden) { release(); return; }
  portrait?.setActive(props.active && ready.value);
  confirm();
  if (props.active) {
    if (phase.value === 'idle') void load();
    else if (ready.value) { resize(); void emotion(); }
  } else if (portrait || abort) {
    // Briefly opening a panel pauses the current model; long absence releases it.
    idleTimer = setTimeout(release, 30_000);
  }
}
async function load() {
  release(); failedKey.value = '';
  const selected = selection.value, key = selectionKey.value;
  if (dead || document.hidden || !props.active || !selected) return;
  const request = epoch, controller = new AbortController(); abort = controller;
  phase.value = 'loading'; canvasGeneration.value++;
  let source: Awaited<ReturnType<typeof import('./live2d-ensemble-assets').createEnsembleSource>>;
  let transferred = false;
  try {
    await nextTick(); if (dead || request !== epoch || !canvas.value) return;
    const { createEnsembleSource } = await import('./live2d-ensemble-assets');
    source = await createEnsembleSource(selected.outfit, controller.signal);
    if (dead || request !== epoch) { source?.lease.release(); return; }
    const { createSoyoPortrait } = await import('./live2d-soyo-runtime');
    if (dead || request !== epoch || !canvas.value) { source?.lease.release(); return; }
    canvas.value.addEventListener('webglcontextlost', lost, true);
    transferred = true;
    const result = await createSoyoPortrait(canvas.value, controller.signal, source);
    if (dead || request !== epoch) { result.destroy(); return; }
    portrait = result; resize(); await emotion();
    if (dead || request !== epoch) return;
    loadedKey.value = key; phase.value = 'ready'; activity();
    await nextTick(); if (!dead && request === epoch) resize();
  } catch (error) {
    if (!transferred) source?.lease.release();
    if (!dead && request === epoch) { fail(); console.warn('[UnreadCity Live2D] portrait fallback', error); }
  }
}
watch(selectionKey, () => void load(), { flush: 'post' });
watch(selection, confirm, { flush: 'post' });
watch(() => props.active, activity);
watch(() => props.emotion, () => void emotion());
watch(host, node => { observer?.disconnect(); if (node) observer?.observe(node); });
onMounted(() => {
  unsubscribe = live2dPack()?.subscribe(() => revision.value++);
  observer = new ResizeObserver(resize); if (host.value) observer.observe(host.value);
  document.addEventListener('visibilitychange', activity); void load();
});
onBeforeUnmount(() => {
  dead = true; release(); unsubscribe?.(); observer?.disconnect();
  document.removeEventListener('visibilitychange', activity);
});
</script>
<template>
  <div v-if="selection" ref="host" class="soyo-live2d" :class="{ 'is-dimmed': dimmed, 'is-muted': !active }" aria-hidden="true"
    :data-live2d-person="selection.person" :data-live2d-outfit="selection.outfit.id" :data-live2d-status="ready ? 'ready' : phase">
    <canvas :key="canvasGeneration" ref="canvas" v-show="ready" class="soyo-live2d-canvas" />
  </div>
  <slot v-if="fallback" />
</template>
