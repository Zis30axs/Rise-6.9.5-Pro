<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { parseNovelDialogue } from './novel-dialogue';
import { storyDisplayText } from './story-text';

const props = defineProps<{ text: string; viewpoint: string }>();
const emit = defineEmits<{ close: [] }>();
const segments = computed(() => parseNovelDialogue(storyDisplayText(props.text)));
const closeButton = ref<HTMLButtonElement | null>(null);
onMounted(() => closeButton.value?.focus({ preventScroll: true }));
</script>

<template>
  <Teleport to="body">
    <div class="phone-perspective-mask" data-phone-perspective @click.self="emit('close')">
      <section class="phone-perspective-panel" role="dialog" aria-modal="true"
        aria-labelledby="uc-phone-perspective-title" @keydown.esc.stop.prevent="emit('close')">
        <header class="phone-perspective-header">
          <div><small>另一边的故事</small><h2 id="uc-phone-perspective-title">与此同时 · {{ viewpoint }}</h2></div>
          <button ref="closeButton" type="button" data-phone-perspective-close @click="emit('close')">返回短信</button>
        </header>
        <div class="phone-perspective-reader" role="document">
          <template v-for="(segment, index) in segments" :key="index">
            <article v-if="segment.speaker" class="phone-perspective-dialogue">
              <strong>{{ segment.speaker }}</strong><p>{{ segment.text }}</p>
            </article>
            <p v-else class="phone-perspective-narration">{{ segment.text }}</p>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.phone-perspective-mask{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;box-sizing:border-box;padding:max(14px,env(safe-area-inset-top,0px)) max(12px,env(safe-area-inset-right,0px)) max(14px,env(safe-area-inset-bottom,0px)) max(12px,env(safe-area-inset-left,0px));background:#07101dcc;color:#f5efdf}
.phone-perspective-panel{display:flex;flex-direction:column;width:min(780px,100%);max-height:min(88dvh,860px);min-height:0;overflow:hidden;border:1px solid #ddc7a085;border-radius:19px;background:linear-gradient(145deg,#192838,#19232e);box-shadow:0 20px 70px #000a}
.phone-perspective-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;padding:16px 22px;border-bottom:1px solid #e8d4ae38}
.phone-perspective-header small{font-size:11px;letter-spacing:.12em;color:#d4c19f}
.phone-perspective-header h2{margin:5px 0 0;font:clamp(18px,2.8vw,25px)/1.4 "Songti SC","SimSun",serif;color:#fff1d3}
.phone-perspective-header button{min-height:44px;flex:none;padding:8px 13px;border:1px solid #e1cfb26b;border-radius:13px;background:#eedcc516;color:#fff3df;cursor:pointer}
.phone-perspective-header button:focus-visible{outline:2px solid #e5c68f;outline-offset:3px}
.phone-perspective-reader{min-height:0;overflow:auto;overscroll-behavior:contain;padding:22px clamp(17px,5vw,45px) 34px;font:clamp(15px,2.2vw,18px)/1.9 "Songti SC","SimSun",serif;white-space:pre-wrap;overflow-wrap:anywhere}
.phone-perspective-narration{margin:0 0 18px}.phone-perspective-dialogue{margin:16px 0 22px}.phone-perspective-dialogue strong{display:block;margin-bottom:3px;font:600 13px/1.6 system-ui,sans-serif;color:#edd2a1}.phone-perspective-dialogue p{margin:0}
@media(max-width:600px){.phone-perspective-panel{max-height:calc(100dvh - 25px)}.phone-perspective-header{padding:13px 14px}.phone-perspective-header h2{font-size:18px}.phone-perspective-header button{padding:7px 10px;font-size:12px}.phone-perspective-reader{padding:18px 16px 28px;font-size:16px}}
</style>
