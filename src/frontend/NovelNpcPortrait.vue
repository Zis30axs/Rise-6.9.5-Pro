<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { novelNpcAtlases } from './novel-npc-atlases';
import { resolveNovelNpcEmotion } from './novel-npc-emotions';
import type { NovelNpcPortraitId } from './novel-npc-portraits';
import { downtownArtPack } from './generated/downtown-art';
import { getAnonArt, getMutsumiArt, getNagasakiMotherArt, getRaanaArt, getSakikoArt, getTakiArt, getTomoriArt, type DowntownArtPack } from './downtown-art-runtime';
import { isAnonSpeaker } from './anon-art-policy';
import { isMutsumiSpeaker } from './mutsumi-art-policy';
import { isRaanaSpeaker } from './raana-art-policy';
import { isTakiSpeaker } from './taki-art-policy';
import { isTomoriSpeaker } from './tomori-art-policy';
import { isNagasakiMotherSpeaker } from './nagasaki-mother-art-policy';
import { isSakikoSpeaker, resolveSakikoOutfit, type SakikoOutfitMode } from './sakiko-art-policy';
import { resolveSakikoUniformPortrait } from './sakiko-uniform-art';
import { resolveMajoExpressionPortrait } from './majo-art';
import { resolveWatanareExpressionPortrait } from './watanare-art';
import { resolveFengjinExpressionPortrait } from './fengjin-art';
import { resolveMarinaExpressionPortrait } from './marina-art';
import { resolveUikaExpressionPortrait } from './uika-art';
import { resolveUmiriExpressionPortrait } from './umiri-art';
import { resolveNyamuExpressionPortrait } from './nyamu-art';

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
const isTaki = computed(() => isTakiSpeaker(props.speaker));
const isTomori = computed(() => isTomoriSpeaker(props.speaker));
const isNagasakiMother = computed(() => isNagasakiMotherSpeaker(props.speaker));
const majoPortrait = computed(() => resolveMajoExpressionPortrait(props.speaker, emotion.value) ?? resolveWatanareExpressionPortrait(props.speaker, emotion.value) ?? resolveFengjinExpressionPortrait(props.speaker, emotion.value) ?? resolveUikaExpressionPortrait(props.speaker, props.emotion) ?? resolveUmiriExpressionPortrait(props.speaker, props.emotion) ?? resolveNyamuExpressionPortrait(props.speaker, props.emotion) ?? resolveMarinaExpressionPortrait(props.speaker, emotion.value));
const selected = computed(() => {
  if (isSakiko.value && resolveSakikoOutfit(props.outfit, props.locationId) !== 'home') {
    return resolveSakikoUniformPortrait(props.emotion);
  }
  return getSakikoArt(props.artPack ?? downtownArtPack, {
    speaker: props.speaker, expression: props.emotion, locationId: props.locationId, outfit: props.outfit,
  });
});
const mutsumiSelected = computed(() => getMutsumiArt(props.artPack ?? downtownArtPack, {
  speaker: props.speaker, expression: props.emotion,
}));
const anonSelected = computed(() => getAnonArt(props.artPack ?? downtownArtPack, {
  speaker: props.speaker, expression: props.emotion,
}));
const raanaSelected = computed(() => getRaanaArt(props.artPack ?? downtownArtPack, {
  speaker: props.speaker, expression: props.emotion,
}));
const takiSelected = computed(() => getTakiArt(props.artPack ?? downtownArtPack, {
  speaker: props.speaker, expression: props.emotion,
}));
const tomoriSelected = computed(() => getTomoriArt(props.artPack ?? downtownArtPack, {
  speaker: props.speaker, expression: props.emotion,
}));
const nagasakiMotherSelected = computed(() => getNagasakiMotherArt(props.artPack ?? downtownArtPack, {
  speaker: props.speaker, expression: props.emotion,
}));
const failedId = ref('');
watch(() => selected.value?.src ?? mutsumiSelected.value?.src ?? anonSelected.value?.src ?? raanaSelected.value?.src ?? takiSelected.value?.src ?? tomoriSelected.value?.src ?? nagasakiMotherSelected.value?.src, () => { failedId.value = ''; });
const sakiko = computed(() => selected.value && selected.value.id !== failedId.value ? selected.value : null);
const mutsumi = computed(() => !sakiko.value && mutsumiSelected.value && mutsumiSelected.value.id !== failedId.value ? mutsumiSelected.value : null);
const anon = computed(() => !sakiko.value && !mutsumi.value && anonSelected.value && anonSelected.value.id !== failedId.value ? anonSelected.value : null);
const raana = computed(() => !sakiko.value && !mutsumi.value && !anon.value && raanaSelected.value && raanaSelected.value.id !== failedId.value ? raanaSelected.value : null);
const taki = computed(() => !sakiko.value && !mutsumi.value && !anon.value && !raana.value && takiSelected.value && takiSelected.value.id !== failedId.value ? takiSelected.value : null);
const tomori = computed(() => !sakiko.value && !mutsumi.value && !anon.value && !raana.value && !taki.value && tomoriSelected.value && tomoriSelected.value.id !== failedId.value ? tomoriSelected.value : null);
const nagasakiMother = computed(() => !sakiko.value && !mutsumi.value && !anon.value && !raana.value && !taki.value && !tomori.value && nagasakiMotherSelected.value && nagasakiMotherSelected.value.id !== failedId.value ? nagasakiMotherSelected.value : null);
const atlas = computed(() => !isSakiko.value && !isMutsumi.value && !isAnon.value && !isRaana.value && !isTaki.value && !isTomori.value && !isNagasakiMother.value && props.portraitId && Object.hasOwn(novelNpcAtlases, props.portraitId)
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
    : raanaSelected.value?.src === source ? raanaSelected.value
    : takiSelected.value?.src === source ? takiSelected.value
    : tomoriSelected.value?.src === source ? tomoriSelected.value
    : nagasakiMotherSelected.value?.src === source ? nagasakiMotherSelected.value : null;
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
  <div v-else-if="taki" class="novel-npc-portrait" :class="{ 'is-muted': !active, 'is-dimmed': dimmed }"
    data-npc-portrait="taki" :data-npc-speaker="speaker" :data-npc-emotion="taki.expression"
    :data-taki-outfit="taki.outfit" :data-taki-pose="taki.pose" :data-taki-sprite="taki.id" aria-hidden="true">
    <img :key="taki.id" class="novel-npc-portrait__sprite" :src="taki.src"
      :width="taki.width" :height="taki.height" alt="" draggable="false" @error="imageFailed">
  </div>
  <div v-else-if="tomori" class="novel-npc-portrait" :class="{ 'is-muted': !active, 'is-dimmed': dimmed }"
    data-npc-portrait="tomori" :data-npc-speaker="speaker" :data-npc-emotion="tomori.expression"
    :data-tomori-outfit="tomori.outfit" :data-tomori-pose="tomori.pose" :data-tomori-sprite="tomori.id" aria-hidden="true">
    <img :key="tomori.id" class="novel-npc-portrait__sprite" :src="tomori.src"
      :width="tomori.width" :height="tomori.height" alt="" draggable="false" @error="imageFailed">
  </div>
  <div v-else-if="nagasakiMother" class="novel-npc-portrait" :class="{ 'is-muted': !active, 'is-dimmed': dimmed }"
    data-npc-portrait="nagasaki-mother" :data-npc-speaker="speaker" :data-npc-emotion="nagasakiMother.expression"
    :data-nagasaki-mother-outfit="nagasakiMother.outfit" :data-nagasaki-mother-pose="nagasakiMother.pose" :data-nagasaki-mother-sprite="nagasakiMother.id" aria-hidden="true">
    <img :key="nagasakiMother.id" class="novel-npc-portrait__sprite" :src="nagasakiMother.src"
      :width="nagasakiMother.width" :height="nagasakiMother.height" alt="" draggable="false" @error="imageFailed">
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
