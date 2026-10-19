<script setup lang="ts">
import { computed, useId } from 'vue';
import { novelNpcAtlases } from './novel-npc-atlases';
import { resolveNovelNpcEmotion } from './novel-npc-emotions';
import type { NovelNpcPortraitId } from './novel-npc-portraits';

const props = withDefaults(defineProps<{ portraitId: NovelNpcPortraitId | null; speaker: string; emotion: string; active?: boolean }>(), { active: true });
const clipId = useId();
const emotion = computed(() => resolveNovelNpcEmotion(props.emotion));
const atlas = computed(() => props.portraitId && Object.hasOwn(novelNpcAtlases, props.portraitId)
  ? novelNpcAtlases[props.portraitId] : null);
const frame = computed(() => atlas.value?.frames[emotion.value] ?? null);
const viewBox = computed(() => {
  const current = frame.value;
  return current ? `${current.x} ${current.y} ${current.width} ${current.height}` : '';
});
</script>

<template>
  <div v-if="portraitId && atlas && frame" class="novel-npc-portrait" :class="{ 'is-muted': !active }"
    :data-npc-portrait="portraitId" :data-npc-speaker="speaker" :data-npc-emotion="emotion" aria-hidden="true">
    <svg :viewBox="viewBox" preserveAspectRatio="xMidYMin meet" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath :id="clipId" clipPathUnits="userSpaceOnUse">
          <rect :x="frame.x" :y="frame.y" :width="frame.width" :height="frame.height" />
        </clipPath>
      </defs>
      <image :href="atlas.source" :width="atlas.width" :height="atlas.height" :clip-path="`url(#${clipId})`" />
    </svg>
  </div>
</template>
