<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getNovelBackground } from './novel-backgrounds';

const props = defineProps<{ locationId: string; hour: number }>();
const background = computed(() => getNovelBackground(props.locationId, props.hour));
const imageFailed = ref(false);
watch(() => background.value.src, () => { imageFailed.value = false; });
</script>

<template>
  <div
    class="novel-backdrop"
    :data-novel-background="locationId"
    :data-background-id="background.id"
    :data-background-phase="background.phase"
    :data-background-image-phase="background.imagePhase"
    :data-background-status="imageFailed ? 'fallback' : 'image'"
    aria-hidden="true"
  >
    <img v-if="!imageFailed" class="novel-backdrop__image" :src="background.src" alt="" draggable="false" @error="imageFailed = true">
    <div class="novel-backdrop__shade" />
  </div>
</template>
