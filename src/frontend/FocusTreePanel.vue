<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import crychicBranchIcon from './assets/focus/crychic-branch.webp';
import mygoBranchIcon from './assets/focus/mygo-branch.webp';
import type { ShellActions, ShellModel } from './types';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import {
  FOCUS_CATALOG, DECISION_CATALOG, TRAIT_CATALOG, SPIRIT_CATALOG,
  canStartFocus, checkCondition, createStrategyState, focusWeight, focusBranchLocked,
  type FocusDefinition, type DecisionDefinition, type StrategyCommand, type StrategyEffect,
} from '../runtime/strategy';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const actor = computed(() => activeProtagonist(props.model.state));
const minute = computed(() => (props.model.state.clock.day - 1) * 1440 + props.model.state.clock.hour * 60 + props.model.state.clock.minute);
const clockText = computed(() => `D${props.model.state.clock.day} · ${String(props.model.state.clock.hour).padStart(2, '0')}:${String(props.model.state.clock.minute).padStart(2, '0')}`);
const state = computed(() => props.model.state.protagonists?.strategy ?? createStrategyState(minute.value));
const profile = computed(() => state.value.people[actor.value]);
const focuses = computed(() => FOCUS_CATALOG.filter(row => row.owner === actor.value));
const rootFocuses = computed(() => focuses.value.filter(row => !row.branchGroup));
const branchFocuses = computed(() => focuses.value.filter(row => !!row.branchGroup));
const decisions = computed(() => DECISION_CATALOG.filter(row => row.owner === actor.value));
const history = computed(() => state.value.history.filter(row => row.owner === actor.value).slice(-12).reverse());
const current = computed(() => FOCUS_CATALOG.find(row => row.id === profile.value.active?.id) ?? null);
const traits = computed(() => profile.value.traits.flatMap(id => TRAIT_CATALOG.filter(row => row.id === id)));
const spirits = computed(() => profile.value.spirits.flatMap(item => SPIRIT_CATALOG.filter(row => row.id === item.id)));
const focusArtwork: Readonly<Record<string, string>> = {
  soyo_rebuild_crychic: crychicBranchIcon,
  soyo_mygo_future: mygoBranchIcon,
};
const focusIcon = (id: string): string | null => focusArtwork[id] ?? null;
const focusGlyph = (id: string): string => {
  if (id === 'soyo_face_past') return '⏳';
  if (id === 'sakiko_redefine_band') return '♛';
  if (id === 'emma_daily_circle') return '❀';
  if (id === 'renako_small_circle') return '✦';
  return '◈';
};
const hasBranches = computed(() => focuses.value.some(f => !!f.branchGroup));
const rootCompleted = computed(() => rootFocuses.value.length > 0 && rootFocuses.value.every(f => profile.value.completed.includes(f.id)));
const feedback = ref('');
let serial = 0;

// Interactive HOI4/TNO Focus Tree Zoom, Pan & Click-to-Inspect State
const MIN_TREE_ZOOM = 0.55;
const MAX_TREE_ZOOM = 1.85;
const treeZoom = ref(1);
const treePanX = ref(0);
const treePanY = ref(0);
const isPanningTree = ref(false);
const selectedFocusId = ref<string | null>(null);
const selectedFocus = computed(() => focuses.value.find(row => row.id === selectedFocusId.value) ?? null);

let panPointerId: number | null = null;
let panStartClientX = 0;
let panStartClientY = 0;
let panOriginX = 0;
let panOriginY = 0;
let panMoved = false;

watch(actor, () => {
  selectedFocusId.value = null;
  resetTreeView();
});

function clampZoom(next: number): number {
  return Math.min(MAX_TREE_ZOOM, Math.max(MIN_TREE_ZOOM, Math.round(next * 100) / 100));
}

function zoomTree(delta: number) {
  treeZoom.value = clampZoom(treeZoom.value + delta);
}

function resetTreeView() {
  treeZoom.value = 1;
  treePanX.value = 0;
  treePanY.value = 0;
}

function onTreeWheel(event: WheelEvent) {
  const delta = event.deltaY < 0 ? 0.12 : -0.12;
  treeZoom.value = clampZoom(treeZoom.value + delta);
}

function onTreePointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('.tno-focus-node, button, a, summary')) return;
  isPanningTree.value = true;
  panPointerId = event.pointerId;
  panStartClientX = event.clientX;
  panStartClientY = event.clientY;
  panOriginX = treePanX.value;
  panOriginY = treePanY.value;
  panMoved = false;
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
}

function onTreePointerMove(event: PointerEvent) {
  if (!isPanningTree.value || panPointerId !== event.pointerId) return;
  const dx = event.clientX - panStartClientX;
  const dy = event.clientY - panStartClientY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panMoved = true;
  treePanX.value = Math.max(-360, Math.min(360, panOriginX + dx));
  treePanY.value = Math.max(-260, Math.min(260, panOriginY + dy));
}

function onTreePointerUp(event: PointerEvent) {
  if (panPointerId !== event.pointerId) return;
  isPanningTree.value = false;
  panPointerId = null;
  (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
}

function openFocusDetail(focusId: string) {
  if (panMoved) {
    panMoved = false;
    return;
  }
  selectedFocusId.value = selectedFocusId.value === focusId ? null : focusId;
}

function closeFocusDetail() {
  selectedFocusId.value = null;
}

const treeStageStyle = computed(() => ({
  transform: `translate(${treePanX.value}px, ${treePanY.value}px) scale(${treeZoom.value})`,
}));

function dispatch(command: StrategyCommand) {
  if (props.model.busy) return;
  feedback.value = '';
  const previous = props.model.state.protagonists?.revision ?? -1;
  try {
    // Strategy management is synchronous and offline, not an LLM interaction.
    props.actions.dispatch({ type: 'strategy', requestId: `focus-ui:${Date.now().toString(36)}:${++serial}`, command });
    feedback.value = !props.model.notice && (props.model.state.protagonists?.revision ?? -1) > previous
      ? '国策安排已更新。' : props.model.notice || '操作未完成。';
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '操作未完成。';
  }
}

function setControl(controller: 'manual' | 'auto', includeInPrompt = profile.value.includeInPrompt) {
  dispatch({ type: 'set_control', owner: actor.value, controller, includeInPrompt });
}

function available(focus: FocusDefinition) { return canStartFocus(state.value, actor.value, focus); }

function status(focus: FocusDefinition) {
  if (profile.value.completed.includes(focus.id)) return '已完成';
  if (profile.value.active?.id === focus.id) return '进行中';
  if (focusBranchLocked(state.value, actor.value, focus)) return '路线已锁定';
  if (!available(focus)) return '尚未解锁';
  return '可执行';
}

function statusClass(focus: FocusDefinition) {
  if (profile.value.completed.includes(focus.id)) return 'is-done';
  if (profile.value.active?.id === focus.id) return 'is-active';
  if (focusBranchLocked(state.value, actor.value, focus)) return 'is-locked';
  if (!available(focus)) return 'is-unavailable';
  return 'is-ready';
}

function percentage(focus: FocusDefinition) {
  return profile.value.active?.id === focus.id
    ? Math.round(profile.value.active.progress / focus.durationMinutes * 100) : 0;
}

function prerequisites(focus: FocusDefinition) {
  const condition = focus.prerequisites;
  if (!condition) return '无需前置国策';
  if ('completed' in condition) return `需要完成：${FOCUS_CATALOG.find(f => f.id === condition.completed)?.title ?? condition.completed}`;
  return checkCondition(condition, { state: state.value, owner: actor.value }) ? '前置条件已满足' : '前置条件尚未满足';
}

function decisionAvailable(decision: DecisionDefinition) {
  const used = profile.value.decisionUsedAt[decision.id];
  const cost = decision.energyCost ?? 0;
  return profile.value.controller === 'manual'
    && props.model.state.player.energy >= cost
    && checkCondition(decision.available, { state: state.value, owner: actor.value })
    && (used === undefined || !!decision.cooldownMinutes && minute.value - used >= decision.cooldownMinutes);
}

function decisionDescription(decision: DecisionDefinition) {
  const cost = decision.energyCost ?? 0;
  const costLabel = cost > 0 ? `消耗 ${cost} 精力 · ` : '';
  const last = profile.value.decisionUsedAt[decision.id];
  if (last === undefined) return `${costLabel}${props.model.state.player.energy < cost ? '当前精力不足' : '尚未执行'}`;
  if (!decision.cooldownMinutes) return `${costLabel}已执行`;
  const minutes = Math.max(0, decision.cooldownMinutes - (minute.value - last));
  return minutes ? `${costLabel}冷却中 · 还需 ${Math.ceil(minutes / 60)} 游戏小时` : `${costLabel}${props.model.state.player.energy < cost ? '当前精力不足' : '可以再次执行'}`;
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
  return '移除精神状态';
}

function weight(focus: FocusDefinition) { return focusWeight(state.value, actor.value, focus); }

function sourceName(id: string) {
  if (id.startsWith('trait:')) return TRAIT_CATALOG.find(x => x.id === id.slice(6))?.title ?? id;
  if (id.startsWith('spirit:')) return SPIRIT_CATALOG.find(x => x.id === id.slice(7))?.title ?? id;
  return '国策条件';
}

const historyKindLabel: Readonly<Record<string, string>> = {
  start: '启动国策',
  complete: '完成国策',
  cancel: '中止国策',
  bypass: '条件跳过',
  decision: '执行决议',
  spirit_expired: '精神消退',
  narrative: '剧情联动',
  major_event: '关键节点',
};
</script>

<template>
  <section class="focus-panel tno-focus-screen" data-testid="focus-tree-panel" aria-label="国策与决议管理">
    <div class="tno-crt-lines" aria-hidden="true"></div>

    <!-- Top TNO Command Header -->
    <header class="focus-top tno-command-bar">
      <div class="tno-command-title">
        <small class="tno-kicker">NATIONAL FOCUS &amp; DIRECTIVES // 战略终端 · {{ clockText }}</small>
        <h2>{{ protagonistNames[actor] }} · 个人国策</h2>
        <p>为接下来的日子选择一条路线。</p>
      </div>
      <div class="tno-command-status">
        <span class="focus-control" :class="{ auto: profile.controller === 'auto' }">
          <i class="tno-dot" aria-hidden="true"></i>
          {{ profile.controller === 'auto' ? 'AI 托管中' : '手动控制' }}
        </span>
      </div>
    </header>

    <!-- TNO Control Console & Prompt Sync -->
    <div class="focus-controls tno-control-strip">
      <div class="tno-mode-buttons">
        <button type="button" :class="{ selected: profile.controller === 'manual' }" :disabled="model.busy" @click="setControl('manual')">接管人物</button>
        <button type="button" :class="{ selected: profile.controller === 'auto' }" :disabled="model.busy" @click="setControl('auto')">启用 AI 托管</button>
      </div>
      <label class="focus-toggle">
        <input type="checkbox" :checked="profile.includeInPrompt" :disabled="model.busy" @change="setControl(profile.controller, ($event.target as HTMLInputElement).checked)">
        <span>允许已授权国策影响下一轮剧情</span>
      </label>
    </div>

    <!-- Active Focus & Spirits Telemetry Strip -->
    <section class="tno-telemetry-strip" aria-label="当前国策与精神总览">
      <div class="tno-active-monitor">
        <div class="tno-monitor-head">
          <span class="tno-monitor-tag">CURRENT FOCUS // 当前执行</span>
          <strong>{{ current ? current.title : '待命 · 尚未启动国策' }}</strong>
        </div>
        <template v-if="current && profile.active">
          <div class="focus-progress tno-progress-lg" role="progressbar" :aria-label="current.title" :aria-valuenow="percentage(current)" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: percentage(current) + '%' }"></span>
          </div>
          <div class="tno-monitor-foot">
            <small>完成度 {{ percentage(current) }}%（{{ (profile.active.progress / 1440).toFixed(1) }} / {{ current.durationMinutes / 1440 }} 游戏日）</small>
            <button v-if="profile.controller === 'manual'" type="button" class="tno-danger-btn" :disabled="model.busy" @click="dispatch({type:'cancel_focus',owner:actor})">取消国策</button>
          </div>
        </template>
        <p v-else class="tno-monitor-idle">点击树上任意国策图标查看详情与启动条件。</p>
      </div>

      <div class="tno-spirits-rack">
        <span class="tno-monitor-tag">TRAITS &amp; SPIRITS // 特质与精神</span>
        <div v-if="traits.length || spirits.length" class="tno-spirit-chips">
          <span v-for="trait in traits" :key="trait.id" class="tno-chip trait">★ {{ trait.title }}</span>
          <span v-for="spirit in spirits" :key="spirit.id" class="tno-chip spirit">❖ {{ spirit.title }}</span>
        </div>
        <p v-else class="tno-monitor-idle">当前无生效中的特殊精神修正。</p>
      </div>
    </section>

    <p v-if="feedback" role="status" class="focus-feedback">{{ feedback }}</p>
    <p class="focus-note">计划会随着经历逐步推进，重要转折仍需亲自经历。人物不会自动知晓他人的秘密。</p>

    <!-- TNO Zoomable & Pannable Visual Focus Tree -->
    <section class="tno-tree-section">
      <div class="tno-section-head">
        <div>
          <h3>个人国策树</h3>
          <span class="tno-section-sub">FOCUS TOPOLOGY // 已完成 {{ profile.completed.length }} / {{ focuses.length }} · 点击国策节点查看详情</span>
        </div>
        <div class="tno-zoom-toolbar" role="toolbar" aria-label="国策树缩放控制">
          <button type="button" class="tno-zoom-btn" title="缩小国策树" :disabled="treeZoom <= MIN_TREE_ZOOM" @click="zoomTree(-0.15)">−</button>
          <span class="tno-zoom-readout">{{ Math.round(treeZoom * 100) }}%</span>
          <button type="button" class="tno-zoom-btn" title="放大国策树" :disabled="treeZoom >= MAX_TREE_ZOOM" @click="zoomTree(0.15)">+</button>
          <button type="button" class="tno-zoom-reset" title="重置缩放与位置" @click="resetTreeView()">重置视图</button>
        </div>
      </div>
      <p v-if="hasBranches" class="focus-note">分叉路线：完成其中一条后，另一条将永久锁定。完成「延续 CRYCHIC」后，素世将退出 MyGO!!!!!；昔日成员是否重聚，仍需各自决定。</p>

      <div
        class="tno-tree-viewport"
        :class="{ 'is-panning': isPanningTree }"
        data-testid="focus-tree-viewport"
        @wheel.prevent="onTreeWheel"
        @pointerdown="onTreePointerDown"
        @pointermove="onTreePointerMove"
        @pointerup="onTreePointerUp"
        @pointercancel="onTreePointerUp"
      >
        <div class="focus-tree tno-tree-canvas" :class="{ 'has-branches': hasBranches }" :style="treeStageStyle">
          <!-- Root Tier Nodes (Compact HOI4/TNO Emblem + Title Plaque) -->
          <div v-if="rootFocuses.length" class="tno-tree-root-tier">
            <button
              v-for="focus in rootFocuses"
              :key="focus.id"
              type="button"
              class="focus-card tno-focus-node root-node"
              :class="[
                statusClass(focus),
                {
                  active: profile.active?.id === focus.id,
                  done: profile.completed.includes(focus.id),
                  selected: selectedFocusId === focus.id,
                }
              ]"
              :aria-expanded="selectedFocusId === focus.id"
              @click="openFocusDetail(focus.id)"
            >
              <div class="tno-node-emblem-wrap">
                <div class="tno-node-medallion">
                  <img v-if="focusIcon(focus.id)" :src="focusIcon(focus.id)!" :alt="`${focus.title}国策图标`" loading="lazy" />
                  <span v-else class="tno-node-glyph" aria-hidden="true">{{ focusGlyph(focus.id) }}</span>
                </div>
                <span v-if="focus.important" class="tno-node-star" title="重要里程碑">★</span>
              </div>
              <div class="tno-node-plaque">
                <strong class="tno-node-title">{{ focus.title }}</strong>
                <div class="tno-node-meta">
                  <span class="tno-status-pill" :class="statusClass(focus)">{{ status(focus) }}</span>
                  <span class="tno-node-days">{{ focus.durationMinutes / 1440 }} 日</span>
                </div>
                <div v-if="profile.active?.id === focus.id" class="focus-progress tno-node-progress" role="progressbar" :aria-label="focus.title" :aria-valuenow="percentage(focus)" aria-valuemin="0" aria-valuemax="100">
                  <span :style="{ width: percentage(focus) + '%' }"></span>
                </div>
              </div>
            </button>
          </div>

          <!-- TNO Tactical Branch Connector & Mutual Exclusion Bridge -->
          <div v-if="hasBranches && branchFocuses.length" class="tno-branch-connector" :class="{ unlocked: rootCompleted }" aria-hidden="true">
            <div class="tno-trunk-line"></div>
            <div class="tno-crossbar-wrap">
              <span class="tno-crossbar-arm left"></span>
              <span class="tno-exclusive-badge">
                <b>&lt;!&gt;</b> 互斥路线 · 二选一
              </span>
              <span class="tno-crossbar-arm right"></span>
            </div>
            <div class="tno-branch-drops">
              <span class="tno-drop-line left"></span>
              <span class="tno-drop-line right"></span>
            </div>
          </div>

          <!-- Branch Tier Nodes (Compact HOI4/TNO Emblem + Title Plaque) -->
          <div v-if="branchFocuses.length" class="tno-tree-branch-tier">
            <button
              v-for="focus in branchFocuses"
              :key="focus.id"
              type="button"
              class="focus-card tno-focus-node focus-route"
              :class="[
                statusClass(focus),
                {
                  active: profile.active?.id === focus.id,
                  done: profile.completed.includes(focus.id),
                  'route-locked': focusBranchLocked(state, actor, focus),
                  selected: selectedFocusId === focus.id,
                }
              ]"
              :aria-expanded="selectedFocusId === focus.id"
              @click="openFocusDetail(focus.id)"
            >
              <div class="tno-node-emblem-wrap">
                <figure v-if="focusIcon(focus.id)" class="focus-icon tno-node-medallion">
                  <img :src="focusIcon(focus.id)!" :alt="`${focus.title}国策图标`" loading="lazy" />
                </figure>
                <div v-else class="tno-node-medallion">
                  <span class="tno-node-glyph" aria-hidden="true">{{ focusGlyph(focus.id) }}</span>
                </div>
                <span v-if="focus.important" class="tno-node-star" title="重要里程碑">★</span>
              </div>
              <div class="tno-node-plaque">
                <strong class="tno-node-title">{{ focus.title }}</strong>
                <div class="tno-node-meta">
                  <span class="tno-status-pill" :class="statusClass(focus)">{{ status(focus) }}</span>
                  <span class="tno-node-days">{{ focus.durationMinutes / 1440 }} 日</span>
                </div>
                <div v-if="profile.active?.id === focus.id" class="focus-progress tno-node-progress" role="progressbar" :aria-label="focus.title" :aria-valuenow="percentage(focus)" aria-valuemin="0" aria-valuemax="100">
                  <span :style="{ width: percentage(focus) + '%' }"></span>
                </div>
              </div>
            </button>
          </div>

          <p v-if="!focuses.length" class="focus-note">当前人物尚未登记个人国策。</p>
        </div>
      </div>

      <!-- Click-to-Open HOI4/TNO Focus Detail Modal / Inspector -->
      <div v-if="selectedFocus" class="tno-focus-detail-backdrop" data-testid="focus-detail-modal" @click.self="closeFocusDetail">
        <article class="tno-focus-detail-modal" role="dialog" :aria-label="`${selectedFocus.title} · 国策详情`">
          <header class="tno-detail-head">
            <div class="tno-detail-emblem">
              <img v-if="focusIcon(selectedFocus.id)" :src="focusIcon(selectedFocus.id)!" :alt="`${selectedFocus.title}国策图标`" />
              <span v-else class="tno-node-glyph" aria-hidden="true">{{ focusGlyph(selectedFocus.id) }}</span>
            </div>
            <div class="tno-detail-title-group">
              <div class="focus-row">
                <h4>{{ selectedFocus.title }}</h4>
                <span class="tno-status-pill" :class="statusClass(selectedFocus)">{{ status(selectedFocus) }}</span>
              </div>
              <p class="tno-duration-line">
                计划推进时间：{{ selectedFocus.durationMinutes / 1440 }} 游戏日
                <span v-if="selectedFocus.important" class="tno-milestone-tag">· 重要里程碑</span>
              </p>
              <p v-if="selectedFocus.branchGroup" class="focus-route-tag">&lt;!&gt; 互斥路线 · 二选一</p>
            </div>
            <button type="button" class="tno-detail-close" aria-label="关闭国策详情" @click="closeFocusDetail">×</button>
          </header>
          <p v-if="selectedFocus.description" class="focus-note">{{ selectedFocus.description }}</p>

          <div class="tno-detail-grid">
            <div class="tno-detail-box">
              <span class="tno-detail-label">PREREQUISITES // 前置条件</span>
              <p class="tno-prereq-line">{{ prerequisites(selectedFocus) }}</p>
            </div>
            <div class="tno-detail-box">
              <span class="tno-detail-label">COMPLETION EFFECTS // 完成效果</span>
              <div v-if="selectedFocus.onComplete?.length" class="tno-effect-chips">
                <span v-for="(eff, idx) in selectedFocus.onComplete" :key="idx" class="tno-effect-chip">{{ effectLabel(eff) }}</span>
              </div>
              <p v-else class="tno-prereq-line">推进人物当前阶段方向</p>
            </div>
          </div>

          <div v-if="profile.active?.id === selectedFocus.id" class="focus-progress tno-progress-lg" role="progressbar" :aria-label="selectedFocus.title" :aria-valuenow="percentage(selectedFocus)" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: percentage(selectedFocus) + '%' }"></span>
          </div>

          <details class="focus-ai" data-ai-view>
            <summary>AI View · 权重 {{ weight(selectedFocus).value }}</summary>
            <p>基础权重 {{ selectedFocus.aiWeight }}；负数代表人物倾向拒绝，你仍可手动选择。</p>
            <p v-for="(modifier, index) in weight(selectedFocus).breakdown" :key="index">{{ sourceName(modifier.source) }}：{{ modifier.amount > 0 ? '+' : '' }}{{ modifier.amount }}</p>
          </details>

          <footer class="focus-actions tno-detail-actions">
            <button v-if="profile.active?.id === selectedFocus.id && profile.controller === 'manual'" type="button" class="tno-danger-btn" :disabled="model.busy" @click="dispatch({type:'cancel_focus',owner:actor})">取消国策</button>
            <button v-else-if="!profile.completed.includes(selectedFocus.id)" type="button" class="tno-start-btn" :disabled="model.busy || profile.controller === 'auto' || !!profile.active || !available(selectedFocus)" @click="dispatch({type:'start_focus',owner:actor,focusId:selectedFocus.id})">开始国策</button>
            <button type="button" class="tno-secondary-btn" @click="closeFocusDetail">关闭窗口</button>
          </footer>
        </article>
      </div>
    </section>

    <!-- TNO Decisions Console -->
    <section class="tno-decisions-section">
      <div class="tno-section-head">
        <h3>决议</h3>
        <span class="tno-section-sub">EXECUTIVE DECISIONS // 可随时执行的个人行动指令</span>
      </div>
      <div class="focus-decisions">
        <article v-for="decision in decisions" :key="decision.id" class="focus-card tno-decision-card" :class="{ ready: decisionAvailable(decision) }">
          <div class="tno-decision-body">
            <div class="focus-row">
              <h4>◈ {{ decision.title }}</h4>
              <small class="tno-cooldown-badge">{{ decisionDescription(decision) }}</small>
            </div>
            <div v-if="decision.effects.length" class="tno-effect-chips">
              <span v-for="(eff, idx) in decision.effects" :key="idx" class="tno-effect-chip">{{ effectLabel(eff) }}</span>
            </div>
          </div>
          <button type="button" class="tno-start-btn" :disabled="model.busy || !decisionAvailable(decision)" @click="dispatch({type:'choose_decision',owner:actor,decisionId:decision.id})">执行决议</button>
        </article>
        <p v-if="!decisions.length" class="focus-note">暂时没有符合这条路线的个人决议。</p>
      </div>
    </section>

    <!-- TNO Historical Log Drawer -->
    <details class="focus-history tno-archive-log">
      <summary>领导者特质、个人精神与国策记录</summary>
      <div class="tno-log-list">
        <p v-for="trait in traits" :key="trait.id">★ 领导者特质：{{ trait.title }}</p>
        <p v-for="spirit in spirits" :key="spirit.id">❖ 个人精神：{{ spirit.title }}</p>
        <p v-for="entry in history" :key="entry.id">
          [第 {{ Math.floor(entry.at / 1440) + 1 }} 天] · {{ historyKindLabel[entry.kind] ?? entry.kind }} · {{ entry.subject }}<span v-if="entry.note">：{{ entry.note }}</span>
        </p>
        <p v-if="!history.length && !traits.length && !spirits.length">暂无记录。</p>
      </div>
    </details>
  </section>
</template>
