<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { ShellActions, ShellModel } from './types';
import { runInteraction } from './interaction-action';
import MetropolisApp from './metropolis/MetropolisApp.vue';
import MetropolisGamePanel from './metropolis/MetropolisGamePanel.vue';
import { buildGameMapContext } from './metropolis/game-map';
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
const travellingId = ref<string | null>(null);
const travelError = ref('');
const game = computed(() => {
  void props.refreshToken;
  return buildGameMapContext(props.model, { novelMode: props.novelMode });
});

async function travel(locationId: string) {
  if (travellingId.value || props.model.busy || props.model.switchingProtagonist) return;
  const destination = game.value.destinations.find(item => item.id === locationId);
  if (!destination || destination.disabled) return;
  travellingId.value = locationId;
  travelError.value = '';
  try {
    const saved = await runInteraction(props.model, props.actions, { type: destination.actionType, locationId: destination.locationId });
    if (saved && destination.actionType === 'novel_travel') emit('travelled');
    else if (!saved) travelError.value = props.model.notice || '这次出行没有完成，请稍后重试。';
  } catch {
    travelError.value = props.model.notice || '暂时无法出发，请稍后重试。';
  } finally {
    travellingId.value = null;
  }
}

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
    <MetropolisApp v-if="!journey" embedded :game="game" :travelling-id="travellingId" :travel-error="travelError" @journey="openJourney" @travel="travel">
      <template #game-panel="panel">
        <MetropolisGamePanel :context="panel.context" :selected-id="panel.selectedId" :district-id="panel.districtId" :selected-person-id="panel.selectedPersonId" :busy="panel.busy" :travelling-id="panel.travellingId" :error="panel.error" @select="panel.select" @district="panel.district" @person="panel.person" @travel="panel.travel" />
      </template>
    </MetropolisApp>
    <div v-else class="uc-metropolis-host__journey">
      <div class="uc-metropolis-host__toolbar">
        <button ref="backButton" class="uc-metropolis-host__back" type="button" @click="returnToCity"><span aria-hidden="true">←</span> 返回城市全景</button>
      </div>
      <WorldMapJourney v-bind="props" initial-scope="world" geographic-only @city="returnToCity" @travelled="emit('travelled')" />
    </div>
  </section>
</template>
