<script setup lang="ts">
import { defineAsyncComponent, inject, watch } from 'vue';
import FlatMap from './flat-map/FlatMap.vue';
import { mapMode } from './flat-map/preference';
import { sandboxCacheKey } from './sandbox-cache';
import type { ShellModel, ShellActions } from './types';
import style from './flat-map/map.css?inline';

const props = defineProps<{
  model: ShellModel;
  actions: ShellActions;
  novelMode?: boolean;
  tokyoOnly?: boolean;
  refreshToken?: number;
  closable?: boolean;
}>();
const emit = defineEmits<{ travelled: []; close: []; transit: [] }>();
const WorldMap = defineAsyncComponent(() => import('./WorldMap.vue').then(m => m.default));
const cache = inject(sandboxCacheKey, undefined);
// The old component parks its scene during unmount. Clear it after Vue swaps branches.
watch(mapMode, v => { if (v === '2d') cache?.clear(); }, { flush: 'post' });
</script>
<template>
  <section class="uc-map-view" :data-map-view="mapMode">
    <component :is="'style'">{{ style }}</component>
    <FlatMap
      v-if="mapMode === '2d'"
      v-bind="props"
      @travelled="emit('travelled')"
      @close="emit('close')"
      @transit="emit('transit')"
    />
    <WorldMap
      v-else
      v-bind="props"
      @travelled="emit('travelled')"
      @close="emit('close')"
      @transit="emit('transit')"
    />
  </section>
</template>
