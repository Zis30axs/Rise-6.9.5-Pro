<script setup lang="ts">
import { nextTick, ref } from 'vue';
import type { ShellActions, ShellModel } from './types';
import MetropolisApp from './metropolis/MetropolisApp.vue';
import WorldMapJourney from './WorldMapJourney.vue';

const props = withDefaults(defineProps<{
  model: ShellModel;
  actions: ShellActions;
  novelMode?: boolean;
  refreshToken?: number;
}>(), { novelMode: false });
const emit = defineEmits<{ travelled: [] }>();
const journey = ref(false);
const host = ref<HTMLElement | null>(null);
const backButton = ref<HTMLButtonElement | null>(null);

async function openJourney() {
  journey.value = true;
  await nextTick();
  backButton.value?.focus({ preventScroll: true });
}
async function returnToCity() {
  journey.value = false;
  await nextTick();
  const destination = host.value?.querySelector<HTMLButtonElement>('[data-metropolis-journey]') ?? host.value;
  destination?.focus({ preventScroll: true });
}
</script>

<template>
  <section ref="host" class="uc-metropolis-host" :class="{ 'uc-metropolis-host--journey': journey }" :data-map-view="journey ? 'journey' : 'panorama'" tabindex="-1" aria-label="城市全景与行程">
    <MetropolisApp v-if="!journey" embedded @journey="openJourney" />
    <div v-else class="uc-metropolis-host__journey">
      <div class="uc-metropolis-host__toolbar">
        <button ref="backButton" class="uc-metropolis-host__back" type="button" @click="returnToCity"><span aria-hidden="true">←</span> 返回城市全景</button>
      </div>
      <WorldMapJourney v-bind="props" @travelled="emit('travelled')" />
    </div>
  </section>
</template>
