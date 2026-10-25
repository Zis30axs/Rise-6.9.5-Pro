<script setup lang="ts">
import { computed } from 'vue';
import { resolveProtagonistPhonePose } from './protagonist-phone-art';
import type { ProtagonistId } from '../runtime/dual-protagonists';

const props = defineProps<{ protagonist: ProtagonistId; locationId?: string }>();
const pose = computed(() => resolveProtagonistPhonePose(props.protagonist, { locationId: props.locationId }));
</script>

<template>
  <div v-if="pose" class="novel-npc-portrait protagonist-phone-pose" data-protagonist-phone-pose
    :data-pose-protagonist="pose.protagonist" :data-pose-outfit="pose.outfit ?? ''" aria-hidden="true">
    <img :key="pose.src" class="novel-npc-portrait__sprite" :src="pose.src"
      :width="pose.width" :height="pose.height" alt="" draggable="false">
  </div>
</template>
