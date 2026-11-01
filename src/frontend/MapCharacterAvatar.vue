<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { mapAvatarInitials, mapSpriteObjectPosition, resolveMapCharacterAvatar, type MapAvatarIdentity } from './map-character-avatar';

const props = defineProps<MapAvatarIdentity>();
const avatar = computed(() => resolveMapCharacterAvatar(props));
const failedSources = ref<string[]>([]);
watch(() => avatar.value?.src, () => { failedSources.value = []; });
const active = computed(() => {
  const selected = avatar.value;
  if (!selected) return null;
  if (!failedSources.value.includes(selected.src)) return selected;
  // If a cropped SVG cannot render (for example in an older WebKit decoder),
  // use that same person's original image. Track BOTH failures to avoid an
  // endless image-error loop between the cropped icon and the full-body art.
  if (selected.kind !== 'headshot' || props.protagonistId === 'soyo') return null;
  const fallback = resolveMapCharacterAvatar(props, true);
  return fallback && !failedSources.value.includes(fallback.src) ? fallback : null;
});
function markFailed(src: string) {
  if (!failedSources.value.includes(src)) failedSources.value = [...failedSources.value, src];
}
const atlasBox = computed(() => active.value?.kind === 'atlas'
  ? `${active.value.x} ${active.value.y} ${active.value.width} ${Math.min(active.value.height, active.value.width)}` : '');
</script>

<template>
  <span class="cms-avatar-face" :data-map-avatar-kind="active?.kind ?? 'initials'" aria-hidden="true">
    <img v-if="active?.kind === 'sprite' || active?.kind === 'headshot'" :src="active.src" :class="{ 'cms-avatar-headshot': active?.kind === 'headshot' || protagonistId === 'soyo' }" :style="active.kind === 'sprite' ? { objectPosition: mapSpriteObjectPosition(props) } : undefined" :data-avatar-crop="active.kind === 'sprite' ? mapSpriteObjectPosition(props) : undefined" alt="" draggable="false" @error="markFailed(active.src)" />
    <svg v-else-if="active?.kind === 'atlas'" :viewBox="atlasBox" preserveAspectRatio="xMidYMin meet">
      <image :href="active.src" :width="active.atlasWidth" :height="active.atlasHeight" />
    </svg>
    <span v-else class="cms-avatar-initials">{{ mapAvatarInitials(name) }}</span>
  </span>
</template>
