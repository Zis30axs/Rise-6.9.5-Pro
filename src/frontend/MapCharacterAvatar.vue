<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { mapAvatarInitials, resolveMapCharacterAvatar, type MapAvatarIdentity } from './map-character-avatar';

const props = defineProps<MapAvatarIdentity>();
const avatar = computed(() => resolveMapCharacterAvatar(props));
const failedSrc = ref('');
watch(() => avatar.value?.src, () => { failedSrc.value = ''; });
const active = computed(() => avatar.value?.src !== failedSrc.value ? avatar.value : null);
const atlasBox = computed(() => active.value?.kind === 'atlas'
  ? `${active.value.x} ${active.value.y} ${active.value.width} ${Math.min(active.value.height, active.value.width)}` : '');
</script>

<template>
  <span class="cms-avatar-face" :data-map-avatar-kind="active?.kind ?? 'initials'" aria-hidden="true">
    <img v-if="active?.kind === 'sprite'" :src="active.src" :class="{ 'cms-avatar-headshot': protagonistId === 'soyo' }" alt="" draggable="false" @error="failedSrc = active.src" />
    <svg v-else-if="active?.kind === 'atlas'" :viewBox="atlasBox" preserveAspectRatio="xMidYMin meet">
      <image :href="active.src" :width="active.atlasWidth" :height="active.atlasHeight" />
    </svg>
    <span v-else class="cms-avatar-initials">{{ mapAvatarInitials(name) }}</span>
  </span>
</template>
