<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ShellActions, ShellModel } from './types';
import { activeProtagonist } from '../runtime/protagonist-world';
import { advisorDecisionAdjustments } from '../runtime/npc-traits';
import {
  DECISION_CATALOG, FOCUS_CATALOG, SPIRIT_CATALOG,
  checkCondition, createGameStrategyState,
  type DecisionDefinition, type StrategyEffect,
} from '../runtime/strategy';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const actor = computed(() => activeProtagonist(props.model.state));
const minute = computed(() => (props.model.state.clock.day - 1) * 1440 + props.model.state.clock.hour * 60 + props.model.state.clock.minute);
const state = computed(() => props.model.state.protagonists?.strategy ?? createGameStrategyState(minute.value));
const profile = computed(() => state.value.people[actor.value]);
const playerEnergy = computed(() => props.model.state.player.energy);

const allDecisions = computed(() => DECISION_CATALOG.filter(row => row.owner === actor.value));
const selectedCategory = ref<string>('全部');
const openDecisionId = ref<string | null>(null);

const categories = computed(() => {
  const unique = new Set<string>(['全部']);
  for (const item of allDecisions.value) {
    if (item.category) unique.add(item.category);
  }
  return [...unique];
});

const filteredDecisions = computed(() =>
  selectedCategory.value === '全部'
    ? allDecisions.value
    : allDecisions.value.filter(row => row.category === selectedCategory.value),
);

const decisionHistory = computed(() =>
  state.value.history
    .filter(row => row.owner === actor.value && row.kind === 'decision')
    .slice(-8)
    .reverse(),
);

const feedback = ref('');
let serial = 0;

watch(actor, () => {
  selectedCategory.value = '全部';
  openDecisionId.value = null;
  feedback.value = '';
});

function effectiveCost(decision: DecisionDefinition): number {
  return advisorDecisionAdjustments(props.model.state, actor.value, decision).energyCost;
}

function conditionMet(decision: DecisionDefinition): boolean {
  return checkCondition(decision.available, { state: state.value, owner: actor.value });
}

function cooldownRemainingMinutes(decision: DecisionDefinition): number {
  const last = profile.value.decisionUsedAt[decision.id];
  if (last === undefined) return 0;
  if (!decision.cooldownMinutes) return Number.POSITIVE_INFINITY;
  return Math.max(0, decision.cooldownMinutes - (minute.value - last));
}

function hasEnoughEnergy(decision: DecisionDefinition): boolean {
  return playerEnergy.value >= effectiveCost(decision);
}

function decisionAvailable(decision: DecisionDefinition): boolean {
  return profile.value.controller === 'manual'
    && conditionMet(decision)
    && cooldownRemainingMinutes(decision) === 0
    && hasEnoughEnergy(decision);
}

function blockedReason(decision: DecisionDefinition): string {
  if (!conditionMet(decision)) {
    const cond = decision.available;
    if ('completed' in cond) {
      const focusTitle = FOCUS_CATALOG.find(f => f.id === cond.completed)?.title ?? cond.completed;
      return `需「${focusTitle}」`;
    }
    return '条件未满足';
  }
  const rem = cooldownRemainingMinutes(decision);
  if (rem === Number.POSITIVE_INFINITY) return '已完成';
  if (rem > 0) return `${Math.ceil(rem / 60)} 小时后`;
  if (!hasEnoughEnergy(decision)) return '精力不足';
  return '暂不可用';
}

function effectLabel(effect: StrategyEffect): { text: string; neg?: boolean; neu?: boolean } {
  if (effect.type === 'add_stat') {
    const statNames: Record<string, string> = {
      soyo_resolve: '决心',
      sakiko_resolve: '决心',
      emma_trust: '信赖',
      renako_confidence: '自信',
    };
    return {
      text: `${statNames[effect.key] ?? effect.key} ${effect.amount >= 0 ? '+' : '−'}${Math.abs(effect.amount)}`,
      neg: effect.amount < 0,
    };
  }
  if (effect.type === 'set_flag') return { text: '推进阶段', neu: true };
  if (effect.type === 'add_spirit') return { text: SPIRIT_CATALOG.find(s => s.id === effect.id)?.title ?? effect.id, neu: true };
  return { text: '平复动摇', neu: true };
}

function decisionTitleById(id: string): string {
  return DECISION_CATALOG.find(row => row.id === id)?.title ?? id;
}

function decisionSvgKind(decision: DecisionDefinition): 'music' | 'calm' | 'plan' | 'memory' {
  if (decision.instrumentDelta || decision.category === '基础训练') return 'music';
  if (decision.category === '身心调适' || decision.category === '人际关怀') return 'calm';
  if (decision.category === '心境抉择') return 'memory';
  return 'plan';
}

function toggleDetail(id: string) {
  openDecisionId.value = openDecisionId.value === id ? null : id;
}

function executeDecision(decision: DecisionDefinition) {
  if (props.model.busy) return;
  feedback.value = '';
  const cost = effectiveCost(decision);
  const previous = props.model.state.protagonists?.revision ?? -1;
  try {
    props.actions.dispatch({
      type: 'strategy',
      requestId: `decision-ui:${Date.now().toString(36)}:${++serial}`,
      command: { type: 'choose_decision', owner: actor.value, decisionId: decision.id },
    });
    feedback.value = !props.model.notice && (props.model.state.protagonists?.revision ?? -1) > previous
      ? `${decision.title}${cost ? ` · 精力 −${cost}` : ''}`
      : props.model.notice || '操作未完成。';
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '操作未完成。';
  }
}

function enableManualControl() {
  if (props.model.busy) return;
  props.actions.dispatch({
    type: 'strategy',
    requestId: `decision-manual:${Date.now().toString(36)}:${++serial}`,
    command: { type: 'set_control', owner: actor.value, controller: 'manual', includeInPrompt: profile.value.includeInPrompt },
  });
}
</script>

<template>
  <section class="decisions-panel" data-testid="decisions-panel" aria-label="日常决议">
    <div v-if="profile.controller === 'auto'" class="dec-self-banner">
      <span>当前由她自己决定方向</span>
      <button type="button" :disabled="model.busy" @click="enableManualControl">改为由我选择</button>
    </div>

    <p v-if="feedback" role="status" class="dec-feedback">{{ feedback }}</p>

    <!-- Category Filter Chips -->
    <nav class="dec-chips" aria-label="决议分类筛选">
      <button
        v-for="cat in categories"
        :key="cat"
        type="button"
        class="dec-chip"
        :class="{ on: selectedCategory === cat }"
        @click="selectedCategory = cat"
      >
        {{ cat }}
      </button>
    </nav>

    <!-- Compact 1-line Decision Rows -->
    <div class="dec-list">
      <article
        v-for="decision in filteredDecisions"
        :key="decision.id"
        class="dec"
        :class="{
          off: !decisionAvailable(decision),
          open: openDecisionId === decision.id,
        }"
        :data-decision-id="decision.id"
      >
        <div class="dec-row" role="button" tabindex="0" :aria-expanded="openDecisionId === decision.id" @click="toggleDetail(decision.id)" @keydown.enter.prevent="toggleDetail(decision.id)" @keydown.space.prevent="toggleDetail(decision.id)">
          <div class="dec-ic" :data-kind="decisionSvgKind(decision)" aria-hidden="true">
            <svg v-if="decisionSvgKind(decision) === 'music'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <svg v-else-if="decisionSvgKind(decision) === 'calm'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
              <path d="M3 8h14v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Z" />
              <path d="M6 2v3M10 2v3M14 2v3" />
            </svg>
            <svg v-else-if="decisionSvgKind(decision) === 'memory'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 3h6a2 2 0 0 1 2 2v16l-5-3-5 3V5a2 2 0 0 1 2-2Z" />
            </svg>
          </div>

          <div class="dec-main">
            <div class="dec-t">{{ decision.title }}</div>
            <div class="dec-fx">
              <span v-for="(eff, idx) in decision.effects" :key="idx" class="dec-tag" :class="{ neg: effectLabel(eff).neg, neu: effectLabel(eff).neu }">
                {{ effectLabel(eff).text }}
              </span>
              <span v-if="decision.instrumentDelta" class="dec-tag">乐器 +{{ decision.instrumentDelta }}</span>
              <span v-if="decision.moraleDelta" class="dec-tag" :class="{ neg: decision.moraleDelta < 0 }">精神 {{ decision.moraleDelta > 0 ? '+' : '−' }}{{ Math.abs(decision.moraleDelta) }}</span>
              <span v-if="decision.stressDelta" class="dec-tag" :class="{ neg: decision.stressDelta > 0 }">压力 {{ decision.stressDelta > 0 ? '+' : '−' }}{{ Math.abs(decision.stressDelta) }}</span>
            </div>
          </div>

          <button
            v-if="decisionAvailable(decision)"
            type="button"
            class="dec-go tno-exec-btn"
            :disabled="model.busy"
            :aria-label="`执行决议：${decision.title}`"
            @click.stop="executeDecision(decision)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" /></svg>
            {{ effectiveCost(decision) }}
          </button>
          <div v-else class="dec-why">{{ profile.controller === 'auto' ? '她决定中' : blockedReason(decision) }}</div>
        </div>

        <div class="dec-more">
          <p v-if="decision.summary">{{ decision.summary }}</p>
          <div class="dec-meta">
            {{ decision.category ?? '日常' }} · {{ decision.cooldownMinutes ? `冷却 ${Math.round(decision.cooldownMinutes / 60)} 小时` : '单次决议' }}
          </div>
        </div>
      </article>
    </div>

    <p class="dec-hint">点开一条可看说明；执行后进入冷却，时间随剧情推进。</p>

    <details v-if="decisionHistory.length" class="dec-log">
      <summary>最近记录（{{ decisionHistory.length }}）</summary>
      <div class="dec-log-list">
        <p v-for="entry in decisionHistory" :key="entry.id">
          第 {{ Math.floor(entry.at / 1440) + 1 }} 天 {{ String(Math.floor((entry.at % 1440) / 60)).padStart(2, '0') }}:{{ String(entry.at % 60).padStart(2, '0') }} · {{ decisionTitleById(entry.subject) }}
        </p>
      </div>
    </details>
  </section>
</template>
