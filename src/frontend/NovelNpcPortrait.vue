<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { novelNpcAtlases } from './novel-npc-atlases';
import { resolveNovelNpcEmotion } from './novel-npc-emotions';
import type { NovelNpcPortraitId } from './novel-npc-portraits';
import { downtownArtPack } from './generated/downtown-art';
import { getSakikoArt, type DowntownArtPack } from './downtown-art-runtime';
import { isSakikoSpeaker, type SakikoOutfitMode } from './sakiko-art-policy';
import { resolveMajoExpressionPortrait } from './majo-art';

const props = withDefaults(defineProps<{
  portraitId: NovelNpcPortraitId | null; speaker: string; emotion: string; active?: boolean;
  locationId?: string; outfit?: SakikoOutfitMode; artPack?: DowntownArtPack;
}>(), { active: true, locationId: '', outfit: 'auto' });
const clipId = useId();
const emotion = computed(() => resolveNovelNpcEmotion(props.emotion));
const isSakiko = computed(() => isSakikoSpeaker(props.speaker));
const majoPortrait = computed(() => resolveMajoExpressionPortrait(props.speaker, emotion.value));
const selected = computed(() => getSakikoArt(props.artPack ?? downtownArtPack, {
  speaker: props.speaker, expression: props.emotion, locationId: props.locationId, outfit: props.outfit,
}));
const failedId = ref('');
watch(() => selected.value?.src, () => { failedId.value = ''; });
const sakiko = computed(() => selected.value && selected.value.id !== failedId.value ? selected.value : null);
const atlas = computed(() => !isSakiko.value && props.portraitId && Object.hasOwn(novelNpcAtlases, props.portraitId)
  ? novelNpcAtlases[props.portraitId] : null);
const frame = computed(() => atlas.value?.frames[emotion.value] ?? null);
const viewBox = computed(() => {
  const current = frame.value;
  return current ? `${current.x} ${current.y} ${current.width} ${current.height}` : '';
});
function imageFailed(event: Event) {
  const source = (event.target as HTMLImageElement | null)?.getAttribute('src');
  if (selected.value && source === selected.value.src) failedId.value = selected.value.id;
}
</script>

<template>
  <div v-if="majoPortrait" class="novel-npc-portrait" :class="{ 'is-muted': !active }"
    data-npc-portrait="majo" :data-npc-speaker="speaker" :data-npc-emotion="emotion"
    :data-majo-portrait="majoPortrait.personId" aria-hidden="true">
    <img :key="majoPortrait.src" class="novel-npc-portrait__sprite" :src="majoPortrait.src"
      width="1024" height="1536" alt="" draggable="false">
  </div>
  <div v-else-if="sakiko" class="novel-npc-portrait" :class="{ 'is-muted': !active }"
    data-npc-portrait="sakiko" :data-npc-speaker="speaker" :data-npc-emotion="sakiko.expression"
    :data-sakiko-outfit="sakiko.outfit" :data-sakiko-sprite="sakiko.id" aria-hidden="true">
    <img :key="sakiko.id" class="novel-npc-portrait__sprite" :src="sakiko.src"
      :width="sakiko.width" :height="sakiko.height" alt="" draggable="false" @error="imageFailed">
  </div>
  <div v-else-if="portraitId && atlas && frame" class="novel-npc-portrait" :class="{ 'is-muted': !active }"
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
