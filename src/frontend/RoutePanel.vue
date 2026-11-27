<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import FocusTreePanel from './FocusTreePanel.vue';
import DecisionsPanel from './DecisionsPanel.vue';
import { formatGameNumber } from './format-game-number';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { advisorDecisionAdjustments } from '../runtime/npc-traits';
import { DECISION_CATALOG, checkCondition, createGameStrategyState } from '../runtime/strategy';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{
  model: ShellModel;
  actions: ShellActions;
  initialTab?: 'focus' | 'decisions';
}>();
const emit = defineEmits<{ close: [] }>();

const tab = ref<'focus' | 'decisions'>(props.initialTab ?? 'focus');
watch(() => props.initialTab, next => { if (next) tab.value = next; });

const actor = computed(() => activeProtagonist(props.model.state));
const minute = computed(() => (props.model.state.clock.day - 1) * 1440 + props.model.state.clock.hour * 60 + props.model.state.clock.minute);
const strategy = computed(() => props.model.state.protagonists?.strategy ?? createGameStrategyState(minute.value));

const readyDecisionCount = computed(() => {
  const profile = strategy.value.people[actor.value];
  if (profile.controller !== 'manual') return 0;
  return DECISION_CATALOG.filter(d => {
    if (d.owner !== actor.value) return false;
    const cost = advisorDecisionAdjustments(props.model.state, actor.value, d).energyCost;
    if (props.model.state.player.energy < cost) return false;
    if (!checkCondition(d.available, { state: strategy.value, owner: actor.value })) return false;
    const last = profile.decisionUsedAt[d.id];
    if (last === undefined) return true;
    return !!d.cooldownMinutes && minute.value - last >= d.cooldownMinutes;
  }).length;
});
</script>

<template>
  <section class="uc-route-view" data-route-panel aria-label="路线">
    <header class="pn-head">
      <h2>路线</h2>
      <span class="pn-sub">{{ protagonistNames[actor] }}接下来的方向</span>
      <div class="pn-sp"></div>
      <span class="chip-energy" title="当前精力">
        <svg class="uc-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" stroke="none" /></svg>
        <span>{{ formatGameNumber(model.state.player.energy) }}</span>
      </span>
      <button type="button" class="pn-close" aria-label="关闭路线窗口" @click="emit('close')">×</button>
    </header>

    <nav class="pn-seg" role="tablist" aria-label="路线分页">
      <button type="button" role="tab" :aria-selected="tab === 'focus'" :class="{ on: tab === 'focus' }" data-route-tab="focus" @click="tab = 'focus'">
        国策
      </button>
      <button type="button" role="tab" :aria-selected="tab === 'decisions'" :class="{ on: tab === 'decisions' }" data-route-tab="decisions" @click="tab = 'decisions'">
        决议
        <i v-if="readyDecisionCount" class="pn-cnt">{{ readyDecisionCount }}</i>
      </button>
    </nav>

    <div class="pn-body">
      <FocusTreePanel v-if="tab === 'focus'" :model="model" :actions="actions" />
      <DecisionsPanel v-else :model="model" :actions="actions" />
    </div>
  </section>
</template>
