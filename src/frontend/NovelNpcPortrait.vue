<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { novelNpcAtlases } from './novel-npc-atlases';
import { resolveNovelNpcEmotion } from './novel-npc-emotions';
import type { NovelNpcPortraitId } from './novel-npc-portraits';
import { downtownArtPack } from './generated/downtown-art';
import { getAnonArt, getMutsumiArt, getRaanaArt, getSakikoArt, type DowntownArtPack } from './downtown-art-runtime';
import { isAnonSpeaker } from './anon-art-policy';
import { isMutsumiSpeaker } from './mutsumi-art-policy';
import { isRaanaSpeaker } from './raana-art-policy';
import { isSakikoSpeaker, type SakikoOutfitMode } from './sakiko-art-policy';
import { resolveMajoExpressionPortrait } from './majo-art';
import { resolveWatanareExpressionPortrait } from './watanare-art';
import { resolveFengjinExpressionPortrait } from './fengjin-art';

const props = withDefaults(defineProps<{
  portraitId: NovelNpcPortraitId | null; speaker: string; emotion: string; active?: boolean; dimmed?: boolean;
  locationId?: string; outfit?: SakikoOutfitMode; artPack?: DowntownArtPack;
}>(), { active: true, locationId: '', outfit: 'auto' });
const clipId = useId();
const emotion = computed(() => resolveNovelNpcEmotion(props.emotion));
const isSakiko = computed(() => isSakikoSpeaker(props.speaker));
const isMutsumi = computed(() => isMutsumiSpeaker(props.speaker));
const isAnon = computed(() => isAnonSpeaker(props.speaker));
const isRaana = computed(() => isRaanaSpeaker(props.speaker));
const majoPortrait = computed(() => resolveMajoExpressionPortrait(props.speaker, emotion.value) ?? resolveWatanareExpressionPortrait(props.speaker, emotion.value) ?? resolveFengjinExpressionPortrait(props.speaker, emotion.value));
const selected = computed(() => getSakikoArt(props.artPack ?? downtownArtPack, {
  speaker: props.speaker, expression: props.emotion, locationId: props.locationId, outfit: props.outfit,
}));
const mutsumiSelected = computed(() => getMutsumiArt(props.artPack ?? downtownArtPack, {
  speaker: props.speaker, expression: props.emotion,
}));
const anonSelected = computed(() => getAnonArt(props.artPack ?? downtownArtPack, {
  speaker: props.speaker, expression: props.emotion,
}));
const raanaSelected = computed(() => getRaanaArt(props.artPack ?? downtownArtPack, {
  speaker: props.speaker, expression: props.emotion,
}));
const failedId = ref('');
watch(() => selected.value?.src ?? mutsumiSelected.value?.src ?? anonSelected.value?.src ?? raanaSelected.value?.src, () => { failedId.value = ''; });
const sakiko = computed(() => selected.value && selected.value.id !== failedId.value ? selected.value : null);
const mutsumi = computed(() => !sakiko.value && mutsumiSelected.value && mutsumiSelected.value.id !== failedId.value ? mutsumiSelected.value : null);
const anon = computed(() => !sakiko.value && !mutsumi.value && anonSelected.value && anonSelected.value.id !== failedId.value ? anonSelected.value : null);
const raana = computed(() => !sakiko.value && !mutsumi.value && !anon.value && raanaSelected.value && raanaSelected.value.id !== failedId.value ? raanaSelected.value : null);
const atlas = computed(() => !isSakiko.value && !isMutsumi.value && !isAnon.value && !isRaana.value && props.portraitId && Object.hasOwn(novelNpcAtlases, props.portraitId)
  ? novelNpcAtlases[props.portraitId] : null);
const frame = computed(() => atlas.value?.frames[emotion.value] ?? null);
const viewBox = computed(() => {
  const current = frame.value;
  return current ? `${current.x} ${current.y} ${current.width} ${current.height}` : '';
});
function imageFailed(event: Event) {
  const source = (event.target as HTMLImageElement | null)?.getAttribute('src');
  const current = selected.value?.src === source ? selected.value
    : mutsumiSelected.value?.src === source ? mutsumiSelected.value
    : anonSelected.value?.src === source ? anonSelected.value
    : raanaSelected.value?.src === source ? raanaSelected.value : null;
  if (current) failedId.value = current.id;
}
</script>

<template>
  <div v-if="majoPortrait" class="novel-npc-portrait" :class="{ 'is-muted': !active, 'is-dimmed': dimmed }"
    data-npc-portrait="majo" :data-npc-speaker="speaker" :data-npc-emotion="emotion"
    :data-majo-portrait="majoPortrait.personId" :data-majo-exact="majoPortrait.exact" aria-hidden="true">
    <img :key="majoPortrait.src" class="novel-npc-portrait__sprite" :src="majoPortrait.src"
      :width="majoPortrait.width" :height="majoPortrait.height" alt="" draggable="false">
  </div>
  <div v-else-if="sakiko" class="novel-npc-portrait" :class="{ 'is-muted': !active, 'is-dimmed': dimmed }"
    data-npc-portrait="sakiko" :data-npc-speaker="speaker" :data-npc-emotion="sakiko.expression"
    :data-sakiko-outfit="sakiko.outfit" :data-sakiko-sprite="sakiko.id" aria-hidden="true">
    <img :key="sakiko.id" class="novel-npc-portrait__sprite" :src="sakiko.src"
      :width="sakiko.width" :height="sakiko.height" alt="" draggable="false" @error="imageFailed">
  </div>
  <div v-else-if="mutsumi" class="novel-npc-portrait" :class="{ 'is-muted': !active, 'is-dimmed': dimmed }"
    data-npc-portrait="mutsumi" :data-npc-speaker="speaker" :data-npc-emotion="mutsumi.expression"
    :data-mutsumi-outfit="mutsumi.outfit" :data-mutsumi-pose="mutsumi.pose" :data-mutsumi-sprite="mutsumi.id" aria-hidden="true">
    <img :key="mutsumi.id" class="novel-npc-portrait__sprite" :src="mutsumi.src"
      :width="mutsumi.width" :height="mutsumi.height" alt="" draggable="false" @error="imageFailed">
  </div>
  <div v-else-if="anon" class="novel-npc-portrait" :class="{ 'is-muted': !active, 'is-dimmed': dimmed }"
    data-npc-portrait="anon" :data-npc-speaker="speaker" :data-npc-emotion="anon.expression"
    :data-anon-outfit="anon.outfit" :data-anon-pose="anon.pose" :data-anon-sprite="anon.id" aria-hidden="true">
    <img :key="anon.id" class="novel-npc-portrait__sprite" :src="anon.src"
      :width="anon.width" :height="anon.height" alt="" draggable="false" @error="imageFailed">
  </div>
  <div v-else-if="raana" class="novel-npc-portrait" :class="{ 'is-muted': !active, 'is-dimmed': dimmed }"
    data-npc-portrait="raana" :data-npc-speaker="speaker" :data-npc-emotion="raana.expression"
    :data-raana-outfit="raana.outfit" :data-raana-pose="raana.pose" :data-raana-sprite="raana.id" aria-hidden="true">
    <img :key="raana.id" class="novel-npc-portrait__sprite" :src="raana.src"
      :width="raana.width" :height="raana.height" alt="" draggable="false" @error="imageFailed">
  </div>
  <div v-else-if="portraitId && atlas && frame" class="novel-npc-portrait" :class="{ 'is-muted': !active, 'is-dimmed': dimmed }"
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
