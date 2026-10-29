<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getNovelBackground, novelBackgroundPhase } from './novel-backgrounds';
import { getCampusInterior } from '../runtime/campus-interiors';
import { downtownArtPack } from './generated/downtown-art';
import { getDowntownArtBackground, nearToyokawaEntrance, type DowntownArtPack } from './downtown-art-runtime';

const props = defineProps<{ locationId: string; hour: number; scene?: { x: number; z: number } | null; artPack?: DowntownArtPack }>();
const legacy = computed(() => getNovelBackground(props.locationId, props.hour));
const desired = computed(() => getDowntownArtBackground(props.artPack ?? downtownArtPack, {
  locationId: props.locationId, phase: novelBackgroundPhase(props.hour),
  atHouseEntrance: props.locationId === 'downtown' && nearToyokawaEntrance(props.scene, getCampusInterior('toyokawa-house')?.entrance),
}));
const failedSource = ref('');
const imageFailed = ref(false);
const usingArt = computed(() => !!desired.value && desired.value.src !== failedSource.value);
const background = computed(() => usingArt.value ? desired.value! : legacy.value);
watch([() => desired.value?.src, () => legacy.value.src], () => { failedSource.value = ''; imageFailed.value = false; });
function onImageError(event: Event) {
  const source = (event.target as HTMLImageElement | null)?.getAttribute('src');
  // A late error from a previous location must not hide this location's picture.
  if (source !== background.value.src) return;
  if (usingArt.value && desired.value) { failedSource.value = desired.value.src; return; }
  imageFailed.value = true;
}
</script>

<template>
  <div
    class="novel-backdrop"
    :data-novel-background="locationId"
    :data-background-id="background.id"
    :data-background-phase="background.phase"
    :data-background-image-phase="background.imagePhase"
    :data-background-status="imageFailed ? 'fallback' : 'image'"
    :data-background-source="usingArt ? 'downtown-art' : legacy.source"
    aria-hidden="true"
  >
    <img v-if="!imageFailed" :key="background.id" class="novel-backdrop__image" :src="background.src" alt="" draggable="false" @error="onImageError">
    <div class="novel-backdrop__shade" />
  </div>
</template>
