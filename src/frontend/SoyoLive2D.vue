<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { isSoyoSpeaker, resolveSoyoEmotion } from './live2d-soyo-assets';
import type { SoyoPortrait } from './live2d-soyo-runtime';

const props = withDefaults(defineProps<{ emotion: string; speaker: string; active?: boolean; dimmed?: boolean }>(), { active: true });
const host = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const status = ref<'loading' | 'ready' | 'error'>('loading');
const displayedEmotion = ref('平静');
const present = computed(() => isSoyoSpeaker(props.speaker));
let portrait: SoyoPortrait | undefined;
let observer: ResizeObserver | undefined;
let dead = false;
let updateSequence = 0;
const loading = new AbortController();

function resize() {
  const bounds = host.value?.getBoundingClientRect();
  if (bounds) portrait?.resize(bounds.width, bounds.height);
}
function activity() {
  portrait?.setActive(props.active && present.value && !document.hidden);
}
async function expression() {
  if (!portrait || dead) return;
  const sequence = ++updateSequence;
  const emotion = props.speaker === '旁白' || !props.speaker ? '平静' : resolveSoyoEmotion(props.emotion);
  try {
    await portrait.setEmotion(emotion);
    if (!dead && sequence === updateSequence) displayedEmotion.value = emotion;
  } catch { if (!dead) status.value = 'error'; }
}
watch(() => [props.emotion, props.speaker], () => { activity(); void expression(); });
watch(() => props.active, activity);
onMounted(async () => {
  try {
    const { createSoyoPortrait } = await import('./live2d-soyo-runtime');
    if (dead || !canvas.value) return;
    const ready = await createSoyoPortrait(canvas.value, loading.signal);
    if (dead) { ready.destroy(); return; }
    portrait = ready;
    observer = new ResizeObserver(resize); observer.observe(host.value!);
    document.addEventListener('visibilitychange', activity);
    resize(); await expression();
    if (dead) return;
    status.value = 'ready'; activity();
  } catch { if (!dead) status.value = 'error'; }
});
onBeforeUnmount(() => {
  dead = true; updateSequence++;
  loading.abort();
  observer?.disconnect();
  document.removeEventListener('visibilitychange', activity);
  portrait?.destroy(); portrait = undefined;
});
</script>

<template>
  <div ref="host" class="soyo-live2d" :class="{ 'is-muted': !present || !active, 'is-dimmed': dimmed }" :data-live2d-status="status"
    :data-live2d-emotion="displayedEmotion" :data-live2d-speaker-visible="present" aria-hidden="true">
    <canvas ref="canvas" class="soyo-live2d-canvas" />
    <span v-if="status === 'error'" class="soyo-live2d-error">立绘暂时未能显示</span>
  </div>
</template>
