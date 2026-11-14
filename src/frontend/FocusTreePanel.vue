<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import crychicBranchIcon from './assets/focus/crychic-branch.webp';
import mygoBranchIcon from './assets/focus/mygo-branch.webp';
import type { ShellActions, ShellModel } from './types';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import {
  FOCUS_CATALOG, DECISION_CATALOG, MUTSUMI_OWNER_ID, TRAIT_CATALOG, SPIRIT_CATALOG,
  canStartFocus, checkCondition, createGameStrategyState, focusWeight, focusBranchLocked, mutsumiBalanceValue,
  type FocusDefinition, type DecisionDefinition, type StrategyCommand, type StrategyEffect, type StrategyOwner,
} from '../runtime/strategy';
import { mutsumiBalanceStatus } from '../runtime/mutsumi-balance';
import {
  NPC_CIRCLE_STAT_LABELS,
  NPC_FOCUS_DIRECTORY,
  NPC_FOCUS_OWNER_NAMES,
} from '../runtime/npc-focuses';
import {
  PRESET_NPC_TRAIT_CATALOG,
  activeBandAdvisorTraits,
  advisorDecisionAdjustments,
  formatNpcTraitModifiers,
  npcSelfExternalModifiers,
} from '../runtime/npc-traits';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();
const activeActor = computed(() => activeProtagonist(props.model.state));
const viewTarget = ref<'active' | string>('active');
const viewingNpc = computed(() => viewTarget.value !== 'active' && !!NPC_FOCUS_OWNER_NAMES[viewTarget.value]);
const actor = computed<StrategyOwner>(() => viewingNpc.value ? viewTarget.value : activeActor.value);
const viewerName = computed(() => viewingNpc.value ? (NPC_FOCUS_OWNER_NAMES[viewTarget.value] ?? viewTarget.value) : protagonistNames[activeActor.value]);
const minute = computed(() => (props.model.state.clock.day - 1) * 1440 + props.model.state.clock.hour * 60 + props.model.state.clock.minute);
const clockText = computed(() => `D${props.model.state.clock.day} · ${String(props.model.state.clock.hour).padStart(2, '0')}:${String(props.model.state.clock.minute).padStart(2, '0')}`);
const state = computed(() => props.model.state.protagonists?.strategy ?? createGameStrategyState(minute.value));
const profile = computed(() => state.value.people[actor.value]);
const mutsumiBalance = computed(() =>
  actor.value === MUTSUMI_OWNER_ID ? mutsumiBalanceStatus(mutsumiBalanceValue(state.value)) : null,
);
const focuses = computed(() => FOCUS_CATALOG.filter(row => row.owner === actor.value));
const decisions = computed(() => viewingNpc.value ? [] : DECISION_CATALOG.filter(row => row.owner === activeActor.value));
const history = computed(() => state.value.history.filter(row => row.owner === actor.value).slice(-12).reverse());
const current = computed(() => FOCUS_CATALOG.find(row => row.id === profile.value.active?.id) ?? null);
const traits = computed(() => viewingNpc.value
  ? (PRESET_NPC_TRAIT_CATALOG[actor.value] ?? []).map(item => ({ id: item.id, title: item.title, modifiers: item.modifiers }))
  : profile.value.traits.flatMap(id => TRAIT_CATALOG.filter(row => row.id === id)));
const activeAdvisorTraits = computed(() => viewingNpc.value ? [] : activeBandAdvisorTraits(props.model.state, activeActor.value));
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
const feedback = ref('');
let serial = 0;

const MIN_TREE_ZOOM = 0.5;
const MAX_TREE_ZOOM = 1.85;
const COLUMN_WIDTH = 208;
const ROW_HEIGHT = 168;
const NODE_HEIGHT = 136;
const TREE_INSET = 8;

const treeLayout = computed(() => {
  const nodes = new Map(focuses.value.map(focus => [focus.id, { focus, x: 0, y: 0 }]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const { focus } of nodes.values()) {
    const condition = focus.prerequisites;
    const parent = condition && 'completed' in condition ? condition.completed : null;
    if (!parent || !nodes.has(parent)) {
      roots.push(focus.id);
      continue;
    }
    const siblings = children.get(parent) ?? [];
    siblings.push(focus.id);
    children.set(parent, siblings);
  }

  let nextColumn = 0;
  let maxDepth = 0;
  const links: { from: string; to: FocusDefinition; path: string }[] = [];
  function place(id: string, depth: number): number {
    const node = nodes.get(id)!;
    const childIds = children.get(id) ?? [];
    const childXs = childIds.map(child => place(child, depth + 1));
    node.x = childXs.length ? (childXs[0] + childXs.at(-1)!) / 2 : (++nextColumn - 0.5) * COLUMN_WIDTH;
    node.y = TREE_INSET + depth * ROW_HEIGHT;
    maxDepth = Math.max(maxDepth, depth);
    const endY = node.y + ROW_HEIGHT;
    const bend = node.y + (NODE_HEIGHT + ROW_HEIGHT) / 2;
    childIds.forEach((to, index) => links.push({
      from: id, to: nodes.get(to)!.focus,
      path: `M ${node.x} ${node.y + NODE_HEIGHT} V ${bend} H ${childXs[index]} V ${endY}`,
    }));
    return node.x;
  }
  roots.forEach(id => place(id, 0));

  return {
    nodes: [...nodes.values()].sort((a, b) => a.y - b.y || a.x - b.x),
    links,
    width: Math.max(1, nextColumn) * COLUMN_WIDTH,
    height: maxDepth * ROW_HEIGHT + NODE_HEIGHT + TREE_INSET * 2,
  };
});

const treeViewport = ref<HTMLElement | null>(null);
const focusDetail = ref<HTMLElement | null>(null);
const viewportWidth = ref(0);
const manualZoom = ref<number | null>(null);
const treeZoom = computed(() => manualZoom.value ?? clampZoom(Math.min(1, (viewportWidth.value || treeLayout.value.width) / treeLayout.value.width)));
const isPanningTree = ref(false);
const selectedFocusId = ref<string | null>(null);
const selectedFocus = computed(() => focuses.value.find(row => row.id === selectedFocusId.value) ?? null);

let observer: ResizeObserver | undefined;
let pan: { pointerId: number; x: number; y: number; left: number; top: number } | null = null;
let detailTrigger: HTMLElement | null = null;

onMounted(() => {
  const viewport = treeViewport.value;
  if (!viewport) return;
  observer = new ResizeObserver(() => { viewportWidth.value = viewport.clientWidth; });
  observer.observe(viewport);
});
onBeforeUnmount(() => observer?.disconnect());

watch(actor, () => {
  selectedFocusId.value = null;
  detailTrigger = null;
  resetTreeView();
});

function clampZoom(next: number): number {
  return Math.min(MAX_TREE_ZOOM, Math.max(MIN_TREE_ZOOM, next));
}

async function zoomTree(delta: number) {
  const viewport = treeViewport.value;
  if (!viewport) return;
  const previous = treeZoom.value;
  const width = treeLayout.value.width;
  const height = treeLayout.value.height;
  const x = viewport.scrollLeft + Math.min(viewport.clientWidth, width * previous) / 2;
  const y = viewport.scrollTop + Math.min(viewport.clientHeight, height * previous) / 2;
  manualZoom.value = clampZoom(Math.round((previous + delta) * 100) / 100);
  await nextTick();
  const scale = treeZoom.value / previous;
  viewport.scrollTo(x * scale - viewport.clientWidth / 2, y * scale - viewport.clientHeight / 2);
}

function resetTreeView() {
  manualZoom.value = null;
  treeViewport.value?.scrollTo(0, 0);
}

function onTreeWheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  void zoomTree(event.deltaY < 0 ? 0.12 : -0.12);
}

function onTreePointerDown(event: PointerEvent) {
  const viewport = treeViewport.value;
  if (!viewport || event.pointerType !== 'mouse' || event.button !== 0 || (event.target as Element).closest('button')) return;
  isPanningTree.value = true;
  pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  viewport.setPointerCapture(event.pointerId);
}

function onTreePointerMove(event: PointerEvent) {
  if (pan?.pointerId !== event.pointerId) return;
  treeViewport.value?.scrollTo(pan.left - (event.clientX - pan.x), pan.top - (event.clientY - pan.y));
}

function onTreePointerUp(event: PointerEvent) {
  if (pan?.pointerId !== event.pointerId) return;
  isPanningTree.value = false;
  pan = null;
}

async function openFocusDetail(focusId: string, event: MouseEvent) {
  if (selectedFocusId.value === focusId) {
    closeFocusDetail();
    return;
  }
  detailTrigger = event.currentTarget as HTMLElement;
  selectedFocusId.value = focusId;
  await nextTick();
  focusDetail.value?.focus();
}

function closeFocusDetail() {
  selectedFocusId.value = null;
  detailTrigger?.focus();
  detailTrigger = null;
}

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
  if (viewingNpc.value) return;
  dispatch({ type: 'set_control', owner: activeActor.value, controller, includeInPrompt });
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

function effectiveDecisionCost(decision: DecisionDefinition): number {
  return advisorDecisionAdjustments(props.model.state, activeActor.value, decision).energyCost;
}

function decisionAvailable(decision: DecisionDefinition) {
  if (viewingNpc.value) return false;
  const used = profile.value.decisionUsedAt[decision.id];
  const cost = effectiveDecisionCost(decision);
  return profile.value.controller === 'manual'
    && props.model.state.player.energy >= cost
    && checkCondition(decision.available, { state: state.value, owner: activeActor.value })
    && (used === undefined || !!decision.cooldownMinutes && minute.value - used >= decision.cooldownMinutes);
}

function decisionDescription(decision: DecisionDefinition) {
  const cost = effectiveDecisionCost(decision);
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
      ...NPC_CIRCLE_STAT_LABELS,
    };
    return `${statNames[effect.key] ?? effect.key} ${effect.amount >= 0 ? '+' : ''}${effect.amount}`;
  }
  if (effect.type === 'set_flag') return '推进关键阶段路线';
  if (effect.type === 'add_spirit') return `获得精神状态：${SPIRIT_CATALOG.find(s => s.id === effect.id)?.title ?? effect.id}`;
  if (effect.type === 'shift_balance') {
    return effect.delta < 0
      ? `心境倾向若叶睦（本我） ${effect.delta}`
      : `心境倾向 Mortis（舞台护盾） +${effect.delta}`;
  }
  return '移除精神状态';
}

function weight(focus: FocusDefinition) {
  return focusWeight(
    state.value,
    actor.value,
    focus,
    viewingNpc.value ? npcSelfExternalModifiers(actor.value) : undefined,
  );
}

function sourceName(id: string) {
  if (id.startsWith('trait:')) {
    const traitId = id.slice(6);
    const npcTrait = PRESET_NPC_TRAIT_CATALOG[actor.value]?.find(x => x.id === traitId);
    if (npcTrait) return npcTrait.title;
    return TRAIT_CATALOG.find(x => x.id === traitId)?.title ?? id;
  }
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
  balance: '心境偏移',
};
const historySubjectTitles = new Map([
  ...[...FOCUS_CATALOG, ...DECISION_CATALOG, ...SPIRIT_CATALOG].map(row => [row.id, row.title] as const),
  ['mutsumi_balance', '心境天平'] as const,
]);
</script>

<template>
  <section class="focus-panel tno-focus-screen" data-testid="focus-tree-panel" aria-label="国策与决议管理">
    <div class="tno-crt-lines" aria-hidden="true"></div>

    <!-- Top TNO Command Header -->
    <header class="focus-top tno-command-bar">
      <div class="tno-command-title">
        <small class="tno-kicker">NATIONAL FOCUS &amp; DIRECTIVES // 战略终端 · {{ clockText }}</small>
        <h2>{{ viewerName }} · 个人国策</h2>
        <p>{{ viewingNpc ? '此人物的个人国策与生活轨迹正随时间独立推进。' : '为接下来的日子选择一条路线。' }}</p>
      </div>
      <div class="tno-command-status">
        <label class="tno-viewer-picker">
          <span class="tno-viewer-label">档案切换</span>
          <select v-model="viewTarget" class="tno-viewer-select" aria-label="切换查看主角或城中人物国策" data-testid="focus-target-select">
            <option value="active">当前主角 · {{ protagonistNames[activeActor] }}</option>
            <optgroup v-for="group in NPC_FOCUS_DIRECTORY" :key="group.label" :label="group.label">
              <option v-for="member in group.members" :key="member.id" :value="member.id">{{ member.name }}</option>
            </optgroup>
          </select>
        </label>
        <span class="focus-control" :class="{ auto: profile.controller === 'auto' }">
          <i class="tno-dot" aria-hidden="true"></i>
          {{ profile.controller === 'auto' ? 'AI 托管中' : '手动控制' }}
        </span>
      </div>
    </header>

    <!-- TNO Control Console & Prompt Sync -->
    <div v-if="!viewingNpc" class="focus-controls tno-control-strip">
      <div class="tno-mode-buttons">
        <button type="button" :class="{ selected: profile.controller === 'manual' }" :disabled="model.busy" @click="setControl('manual')">接管人物</button>
        <button type="button" :class="{ selected: profile.controller === 'auto' }" :disabled="model.busy" @click="setControl('auto')">启用 AI 托管</button>
      </div>
      <label class="focus-toggle">
        <input type="checkbox" :checked="profile.includeInPrompt" :disabled="model.busy" @change="setControl(profile.controller, ($event.target as HTMLInputElement).checked)">
        <span>允许已授权国策影响下一轮剧情</span>
      </label>
    </div>
    <div v-else class="focus-controls tno-control-strip tno-npc-banner">
      <span class="tno-monitor-idle">当前正在浏览城中人物的个人国策轨迹；可缩放或点击节点查看条件与倾向权重。</span>
      <button type="button" class="tno-secondary-btn" @click="viewTarget = 'active'">返回当前主角</button>
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
            <button v-if="!viewingNpc && profile.controller === 'manual'" type="button" class="tno-danger-btn" :disabled="model.busy" @click="dispatch({type:'cancel_focus',owner:activeActor})">取消国策</button>
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

    <section v-if="mutsumiBalance" class="tno-bop-panel" data-testid="mutsumi-balance-panel" aria-label="若叶睦心境天平">
      <div class="tno-bop-head">
        <div>
          <span class="tno-monitor-tag">BALANCE OF MIND // 心境天平</span>
          <strong>{{ mutsumiBalance.poleLeft }} ↔ {{ mutsumiBalance.poleRight }}</strong>
        </div>
        <span class="tno-bop-pill" :class="`is-${mutsumiBalance.side}`">
          {{ mutsumiBalance.tierLabel }}（{{ mutsumiBalance.value > 0 ? `+${mutsumiBalance.value}` : mutsumiBalance.value }}）
        </span>
      </div>
      <div class="tno-bop-poles">
        <span>{{ mutsumiBalance.poleLeft }} (-100)</span>
        <span>{{ mutsumiBalance.poleRight }} (+100)</span>
      </div>
      <div
        class="tno-bop-track"
        role="meter"
        :aria-label="`心境天平：${mutsumiBalance.tierLabel}`"
        :aria-valuenow="mutsumiBalance.value"
        aria-valuemin="-100"
        aria-valuemax="100"
      >
        <span class="tno-bop-center-tick" aria-hidden="true"></span>
        <span class="tno-bop-needle" :style="{ left: mutsumiBalance.markerPercent + '%' }"></span>
      </div>
      <p class="tno-bop-summary">{{ mutsumiBalance.summary }}</p>
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
          <button type="button" class="tno-zoom-btn" aria-label="缩小国策树" :disabled="treeZoom <= MIN_TREE_ZOOM" @click="zoomTree(-0.15)">−</button>
          <span class="tno-zoom-readout">{{ Math.round(treeZoom * 100) }}%</span>
          <button type="button" class="tno-zoom-btn" aria-label="放大国策树" :disabled="treeZoom >= MAX_TREE_ZOOM" @click="zoomTree(0.15)">+</button>
          <button type="button" class="tno-zoom-reset" title="重置缩放与位置" @click="resetTreeView()">重置视图</button>
        </div>
      </div>
      <p v-if="hasBranches" class="focus-note">互斥路线只能完成其中一条。另一条及其后续计划届时会锁定。</p>

      <div
        ref="treeViewport"
        class="tno-tree-viewport"
        :class="{ 'is-panning': isPanningTree }"
        data-testid="focus-tree-viewport"
        aria-label="国策路线图"
        tabindex="0"
        @wheel="onTreeWheel"
        @pointerdown="onTreePointerDown"
        @pointermove="onTreePointerMove"
        @lostpointercapture="onTreePointerUp"
      >
        <div v-if="focuses.length" class="tno-tree-space" :style="{ width: treeLayout.width * treeZoom + 'px', height: treeLayout.height * treeZoom + 'px' }">
          <div
            class="focus-tree tno-tree-canvas"
            :style="{ width: treeLayout.width + 'px', height: treeLayout.height + 'px', transform: 'scale(' + treeZoom + ')' }"
          >
            <svg class="tno-tree-links" :viewBox="'0 0 ' + treeLayout.width + ' ' + treeLayout.height" aria-hidden="true">
              <path
                v-for="link in treeLayout.links"
                :key="link.to.id"
                :d="link.path"
                :class="{ unlocked: profile.completed.includes(link.from), locked: focusBranchLocked(state, actor, link.to) }"
                :data-from="link.from"
                :data-to="link.to.id"
              />
            </svg>
            <button
              v-for="{ focus, x, y } in treeLayout.nodes"
              :key="focus.id"
              type="button"
              class="focus-card tno-focus-node"
              :class="[statusClass(focus), { selected: selectedFocusId === focus.id }]"
              :style="{ left: x + 'px', top: y + 'px', height: NODE_HEIGHT + 'px' }"
              :data-focus-id="focus.id"
              :aria-expanded="selectedFocusId === focus.id"
              @click="openFocusDetail(focus.id, $event)"
            >
              <div class="tno-node-emblem-wrap">
                <div class="tno-node-medallion">
                  <img v-if="focusIcon(focus.id)" :src="focusIcon(focus.id)!" alt="" loading="lazy" />
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
        </div>
        <p v-else class="focus-note">当前人物尚未登记个人国策。</p>
      </div>

      <div v-if="selectedFocus" class="tno-focus-detail-backdrop" data-testid="focus-detail-modal">
        <article ref="focusDetail" class="tno-focus-detail-modal" role="region" tabindex="-1" :aria-label="selectedFocus.title + ' · 国策详情'" @keydown.esc.stop="closeFocusDetail">
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
            <button v-if="!viewingNpc && profile.active?.id === selectedFocus.id && profile.controller === 'manual'" type="button" class="tno-danger-btn" :disabled="model.busy" @click="dispatch({type:'cancel_focus',owner:activeActor})">取消国策</button>
            <button v-else-if="!viewingNpc && !profile.completed.includes(selectedFocus.id)" type="button" class="tno-start-btn" :disabled="model.busy || profile.controller === 'auto' || !!profile.active || !available(selectedFocus)" @click="dispatch({type:'start_focus',owner:activeActor,focusId:selectedFocus.id})">开始国策</button>
            <button type="button" class="tno-secondary-btn" @click="closeFocusDetail">关闭窗口</button>
          </footer>
        </article>
      </div>
    </section>

    <!-- TNO Decisions Console -->
    <section v-if="!viewingNpc" class="tno-decisions-section">
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
          <button type="button" class="tno-start-btn" :disabled="model.busy || !decisionAvailable(decision)" @click="dispatch({type:'choose_decision',owner:activeActor,decisionId:decision.id})">执行决议</button>
        </article>
        <p v-if="!decisions.length" class="focus-note">暂时没有符合这条路线的个人决议。</p>
      </div>
    </section>

    <!-- TNO Historical Log Drawer -->
    <details class="focus-history tno-archive-log">
      <summary>领导者特质、个人精神与国策记录</summary>
      <div class="tno-log-list">
        <p v-for="trait in traits" :key="trait.id">★ 领导者特质：{{ trait.title }}</p>
        <p v-for="adv in activeAdvisorTraits" :key="`${adv.personId}:${adv.trait.id}`">{{ adv.trait.icon }} 顾问特质（{{ adv.personName }} · {{ adv.bandName }}）：{{ adv.trait.title }} · {{ formatNpcTraitModifiers(adv.trait).join('、') }}</p>
        <p v-for="spirit in spirits" :key="spirit.id">❖ 个人精神：{{ spirit.title }}</p>
        <p v-for="entry in history" :key="entry.id">
          [第 {{ Math.floor(entry.at / 1440) + 1 }} 天] · {{ historyKindLabel[entry.kind] }}<span v-if="historySubjectTitles.has(entry.subject)"> · {{ historySubjectTitles.get(entry.subject) }}</span><span v-if="entry.note">：{{ entry.note }}</span>
        </p>
        <p v-if="!history.length && !traits.length && !activeAdvisorTraits.length && !spirits.length">暂无记录。</p>
      </div>
    </details>
  </section>
</template>
