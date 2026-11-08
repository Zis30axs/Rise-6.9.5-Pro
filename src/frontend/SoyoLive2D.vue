<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { isSoyoSpeaker, resolveSoyoEmotion } from './live2d-soyo-assets';
import type { SoyoPortrait } from './live2d-soyo-runtime';

const props = withDefaults(defineProps<{ emotion: string; speaker: string; active?: boolean; dimmed?: boolean; refreshToken?: number }>(), { active: true, refreshToken: 0 });
const host = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const canvasGeneration = ref(0);
const displayedEmotion = ref('平静');
const present = computed(() => isSoyoSpeaker(props.speaker));
let portrait: SoyoPortrait | undefined;
let observer: ResizeObserver | undefined;
let dead = false;
let updateSequence = 0;
let loading: AbortController | undefined;
let epoch = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const visible = () => props.active && present.value && !document.hidden;

function release() {
  epoch++; updateSequence++;
  clearTimeout(idleTimer); idleTimer = undefined;
  // Stop intentional context destruction from being handled as a new failure.
  canvas.value?.removeEventListener('webglcontextlost', contextLost, true);
  loading?.abort(); loading = undefined;
  portrait?.destroy(); portrait = undefined;
  status.value = 'idle';
  if (canvas.value) { canvas.value.width = 1; canvas.value.height = 1; }
}
function contextLost(event: Event) {
  event.preventDefault(); event.stopImmediatePropagation();
  if (event.target !== canvas.value) return;
  release(); status.value = 'error';
}
function refresh() { release(); return load(); }

function resize() {
  const bounds = host.value?.getBoundingClientRect();
  if (bounds) portrait?.resize(bounds.width, bounds.height);
}
function activity() {
  if (dead) return;
  clearTimeout(idleTimer); idleTimer = undefined;
  portrait?.setActive(visible());
  if (visible()) { if (status.value === 'idle') void load(); }
  else if (portrait || loading) {
    // A short dialogue turn can reuse the portrait. A covered/hidden stage does
    // not hold large textures indefinitely alongside the map or paired stage.
    if (document.hidden || !props.active) release();
    else idleTimer = setTimeout(release, 15_000);
  }
}
async function expression() {
  if (!portrait || dead) return;
  const sequence = ++updateSequence;
  const emotion = props.speaker === '旁白' || !props.speaker ? '平静' : resolveSoyoEmotion(props.emotion);
  try {
    await portrait.setEmotion(emotion);
    if (!dead && sequence === updateSequence) displayedEmotion.value = emotion;
  } catch { if (!dead && sequence === updateSequence) { release(); status.value = 'error'; } }
}
watch(() => [props.emotion, props.speaker], () => { activity(); if (visible()) void expression(); });
watch(() => props.active, activity);
watch(() => props.refreshToken, () => { void refresh(); });
async function load() {
  if (dead || !visible() || !host.value || portrait || status.value === 'loading') return;
  const request = ++epoch;
  const controller = new AbortController(); loading = controller;
  status.value = 'loading'; canvasGeneration.value++;
  try {
    await nextTick();
    const { createSoyoPortrait } = await import('./live2d-soyo-runtime');
    if (dead || request !== epoch || !canvas.value) return;
    canvas.value.addEventListener('webglcontextlost', contextLost, true);
    const ready = await createSoyoPortrait(canvas.value, controller.signal);
    if (dead || request !== epoch) { ready.destroy(); return; }
    portrait = ready;
    resize(); await expression();
    if (dead || request !== epoch) return;
    status.value = 'ready'; activity();
  } catch { if (!dead && request === epoch) { release(); status.value = 'error'; } }
}
onMounted(() => {
  observer = new ResizeObserver(resize); observer.observe(host.value!);
  document.addEventListener('visibilitychange', activity);
  activity();
});
onBeforeUnmount(() => {
  dead = true; release();
  observer?.disconnect();
  document.removeEventListener('visibilitychange', activity);
});
</script>

<template>
  <div ref="host" class="soyo-live2d" :class="{ 'is-muted': !present || !active, 'is-dimmed': dimmed }" :data-live2d-status="status"
    :data-live2d-emotion="displayedEmotion" :data-live2d-speaker-visible="present" aria-hidden="true">
    <canvas :key="canvasGeneration" ref="canvas" v-show="status === 'ready'" class="soyo-live2d-canvas" />
    <span v-if="status === 'error'" class="soyo-live2d-error">立绘暂时未能显示</span>
  </div>
</template>
