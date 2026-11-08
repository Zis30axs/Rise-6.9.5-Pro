<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ShellActions, ShellModel } from './types';
import { formatGameNumber } from './format-game-number';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { instrumentSkill, INSTRUMENT_SKILL_CAP } from '../runtime/livehouse-visit';
import {
  DECISION_CATALOG, FOCUS_CATALOG, SPIRIT_CATALOG,
  checkCondition, createStrategyState,
  type DecisionDefinition, type StrategyEffect,
} from '../runtime/strategy';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const actor = computed(() => activeProtagonist(props.model.state));
const minute = computed(() => (props.model.state.clock.day - 1) * 1440 + props.model.state.clock.hour * 60 + props.model.state.clock.minute);
const clockText = computed(() => `D${props.model.state.clock.day} · ${String(props.model.state.clock.hour).padStart(2, '0')}:${String(props.model.state.clock.minute).padStart(2, '0')}`);
const state = computed(() => props.model.state.protagonists?.strategy ?? createStrategyState(minute.value));
const profile = computed(() => state.value.people[actor.value]);
const playerEnergy = computed(() => props.model.state.player.energy);
const playerMorale = computed(() => props.model.state.player.morale);
const playerStress = computed(() => props.model.state.player.stress);
const currentInstrument = computed(() => instrumentSkill(props.model.state));

const primaryStatMeta = computed(() => {
  if (actor.value === 'soyo') return { key: 'soyo_resolve', label: '素世决心' };
  if (actor.value === 'sakiko') return { key: 'sakiko_resolve', label: '祥子决心' };
  if (actor.value === 'emma') return { key: 'emma_trust', label: '艾玛信赖' };
  return { key: 'renako_confidence', label: '玲奈子自信' };
});
const primaryStatValue = computed(() => state.value.stats[primaryStatMeta.value.key] ?? 0);

const allDecisions = computed(() => DECISION_CATALOG.filter(row => row.owner === actor.value));
const selectedCategory = ref<string>('全部');
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
    : allDecisions.value.filter(row => row.category === selectedCategory.value)
);

const decisionHistory = computed(() =>
  state.value.history
    .filter(row => row.owner === actor.value && row.kind === 'decision')
    .slice(-8)
    .reverse()
);

const feedback = ref('');
let serial = 0;

watch(actor, () => {
  selectedCategory.value = '全部';
  feedback.value = '';
});

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
  return playerEnergy.value >= (decision.energyCost ?? 0);
}

function decisionAvailable(decision: DecisionDefinition): boolean {
  return profile.value.controller === 'manual'
    && conditionMet(decision)
    && cooldownRemainingMinutes(decision) === 0
    && hasEnoughEnergy(decision);
}

function prerequisiteText(decision: DecisionDefinition): string {
  const cond = decision.available;
  if ('always' in cond && cond.always) return '随时可执行';
  if ('completed' in cond) {
    const focusTitle = FOCUS_CATALOG.find(f => f.id === cond.completed)?.title ?? cond.completed;
    return `需完成国策：${focusTitle}`;
  }
  return conditionMet(decision) ? '前置条件已满足' : '前置条件尚未满足';
}

function decisionStatusLabel(decision: DecisionDefinition): string {
  if (profile.value.controller === 'auto') return 'AI 托管中（请先接管人物）';
  if (!conditionMet(decision)) return prerequisiteText(decision);
  const rem = cooldownRemainingMinutes(decision);
  if (rem === Number.POSITIVE_INFINITY) return '已完成';
  if (rem > 0) return `冷却中 · 还需 ${Math.ceil(rem / 60)} 游戏小时`;
  if (!hasEnoughEnergy(decision)) return `精力不足（需 ${decision.energyCost} 精力）`;
  return '可立即执行';
}

function effectLabel(effect: StrategyEffect): string {
  if (effect.type === 'add_stat') {
    const statNames: Record<string, string> = {
      soyo_resolve: '素世决心',
      sakiko_resolve: '祥子决心',
      emma_trust: '艾玛信赖',
      renako_confidence: '玲奈子自信',
    };
    return `${statNames[effect.key] ?? effect.key} ${effect.amount >= 0 ? '+' : ''}${effect.amount}`;
  }
  if (effect.type === 'set_flag') return '推进关键阶段路线';
  if (effect.type === 'add_spirit') return `获得精神状态：${SPIRIT_CATALOG.find(s => s.id === effect.id)?.title ?? effect.id}`;
  return '平复动摇状态';
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

function executeDecision(decision: DecisionDefinition) {
  if (props.model.busy) return;
  feedback.value = '';
  const previous = props.model.state.protagonists?.revision ?? -1;
  try {
    props.actions.dispatch({
      type: 'strategy',
      requestId: `decision-ui:${Date.now().toString(36)}:${++serial}`,
      command: { type: 'choose_decision', owner: actor.value, decisionId: decision.id },
    });
    feedback.value = !props.model.notice && (props.model.state.protagonists?.revision ?? -1) > previous
      ? `已执行决议「${decision.title}」${decision.energyCost ? `，消耗 ${decision.energyCost} 点精力` : ''}。`
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
  <section class="decisions-panel tno-decisions-screen" data-testid="decisions-panel" aria-label="个人决议与精力行动">
    <div class="tno-crt-lines" aria-hidden="true"></div>

    <!-- Top TNO Executive Decisions Header -->
    <header class="tno-decisions-header">
      <div class="tno-decisions-brand">
        <div class="tno-decisions-seal" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 3l7 7-4 4-7-7 4-4Z" />
            <path d="M11 8l-8 8v3h3l8-8" />
            <path d="M3 21h18" />
          </svg>
        </div>
        <div>
          <small class="tno-kicker">EXECUTIVE DECISIONS &amp; ENERGY TOKENS // 个人决议终端 · {{ clockText }}</small>
          <h2>{{ protagonistNames[actor] }} · 个人决议</h2>
          <p>以当前人物的精力作为行动代币，随时执行日常训练、心境调适与筹备决议。</p>
        </div>
      </div>

      <div v-if="profile.controller === 'auto'" class="tno-auto-warning">
        <span>当前处于 AI 托管模式</span>
        <button type="button" :disabled="model.busy" @click="enableManualControl">切换为手动控制</button>
      </div>
    </header>

    <!-- Energy Token & Telemetry Bar -->
    <section class="tno-energy-bank" aria-label="精力代币与角色状态">
      <div class="tno-energy-main">
        <div class="tno-energy-title-row">
          <span class="tno-token-label">
            <svg class="tno-bolt-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" />
            </svg>
            可用精力代币（ENERGY RESERVE）
          </span>
          <strong class="tno-energy-number" data-testid="decision-energy-value">{{ formatGameNumber(playerEnergy) }} <small>/ 100</small></strong>
        </div>
        <div class="tno-energy-bar" role="progressbar" aria-label="当前可用精力" :aria-valuenow="Math.round(playerEnergy)" aria-valuemin="0" aria-valuemax="100">
          <span :style="{ width: Math.min(100, Math.max(0, playerEnergy)) + '%' }"></span>
        </div>
      </div>

      <div class="tno-energy-side-stats">
        <div class="tno-mini-stat">
          <small>{{ primaryStatMeta.label }}</small>
          <strong>{{ primaryStatValue }}</strong>
        </div>
        <div class="tno-mini-stat">
          <small>乐器熟练度</small>
          <strong>{{ currentInstrument }} / {{ INSTRUMENT_SKILL_CAP }}</strong>
        </div>
        <div class="tno-mini-stat">
          <small>精神 / 压力</small>
          <strong>{{ formatGameNumber(playerMorale) }} / {{ formatGameNumber(playerStress) }}</strong>
        </div>
      </div>
    </section>

    <p v-if="feedback" role="status" class="tno-decision-feedback">{{ feedback }}</p>

    <!-- Category Filter Strip -->
    <nav class="tno-decision-categories" aria-label="决议分类筛选">
      <button
        v-for="cat in categories"
        :key="cat"
        type="button"
        :class="{ active: selectedCategory === cat }"
        @click="selectedCategory = cat"
      >
        {{ cat }}
      </button>
    </nav>

    <!-- Decisions Dossier Grid -->
    <div class="tno-decision-dossier-grid">
      <article
        v-for="decision in filteredDecisions"
        :key="decision.id"
        class="tno-decision-dossier"
        :class="{
          ready: decisionAvailable(decision),
          'no-energy': !hasEnoughEnergy(decision),
          cooldown: cooldownRemainingMinutes(decision) > 0,
        }"
        :data-decision-id="decision.id"
      >
        <div class="tno-dossier-top">
          <div class="tno-dossier-icon" :data-kind="decisionSvgKind(decision)" aria-hidden="true">
            <!-- Music / Instrument SVG (e.g. Soyo Bass Practice) -->
            <svg v-if="decisionSvgKind(decision) === 'music'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <!-- Calm / Tea / Walk SVG -->
            <svg v-else-if="decisionSvgKind(decision) === 'calm'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
              <path d="M3 8h14v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Z" />
              <path d="M6 2v3M10 2v3M14 2v3" />
            </svg>
            <!-- Memory / Reflection SVG -->
            <svg v-else-if="decisionSvgKind(decision) === 'memory'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            <!-- Plan / Notes SVG -->
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 3h6a2 2 0 0 1 2 2v16l-5-3-5 3V5a2 2 0 0 1 2-2Z" />
            </svg>
          </div>

          <div class="tno-dossier-heading">
            <div class="tno-dossier-title-row">
              <h3>{{ decision.title }}</h3>
              <span class="tno-cost-token" :class="{ insufficient: !hasEnoughEnergy(decision) }">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" />
                </svg>
                {{ decision.energyCost ?? 0 }} 精力
              </span>
            </div>
            <div class="tno-dossier-sub">
              <span class="tno-cat-tag">{{ decision.category ?? '个人决议' }}</span>
              <span class="tno-status-text">{{ decisionStatusLabel(decision) }}</span>
            </div>
          </div>
        </div>

        <p v-if="decision.summary" class="tno-dossier-summary">{{ decision.summary }}</p>

        <div class="tno-dossier-effects">
          <span v-for="(eff, idx) in decision.effects" :key="idx" class="tno-effect-badge">{{ effectLabel(eff) }}</span>
          <span v-if="decision.instrumentDelta" class="tno-effect-badge instrument">乐器熟练度 +{{ decision.instrumentDelta }}</span>
          <span v-if="decision.moraleDelta" class="tno-effect-badge morale">精神 {{ decision.moraleDelta > 0 ? '+' : '' }}{{ decision.moraleDelta }}</span>
          <span v-if="decision.stressDelta" class="tno-effect-badge stress">压力 {{ decision.stressDelta > 0 ? '+' : '' }}{{ decision.stressDelta }}</span>
        </div>

        <footer class="tno-dossier-foot">
          <small class="tno-cooldown-hint">
            {{ decision.cooldownMinutes ? `冷却间隔：${Math.round(decision.cooldownMinutes / 60)} 游戏小时` : '单次决议' }}
          </small>
          <button
            type="button"
            class="tno-exec-btn"
            :disabled="model.busy || !decisionAvailable(decision)"
            @click="executeDecision(decision)"
          >
            执行决议（-{{ decision.energyCost ?? 0 }} 精力）
          </button>
        </footer>
      </article>
    </div>

    <!-- Recent Decision Execution Log -->
    <details class="tno-decision-log">
      <summary>最近执行的决议记录（{{ decisionHistory.length }}）</summary>
      <div class="tno-decision-log-list">
        <p v-for="entry in decisionHistory" :key="entry.id">
          [第 {{ Math.floor(entry.at / 1440) + 1 }} 天 {{ String(Math.floor((entry.at % 1440) / 60)).padStart(2, '0') }}:{{ String(entry.at % 60).padStart(2, '0') }}] · 已执行「{{ decisionTitleById(entry.subject) }}」
        </p>
        <p v-if="!decisionHistory.length">尚未执行过个人决议。</p>
      </div>
    </details>
  </section>
</template>
