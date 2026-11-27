<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import crychicBranchIcon from './assets/focus/crychic-branch.webp';
import mygoBranchIcon from './assets/focus/mygo-branch.webp';
import type { ShellActions, ShellModel } from './types';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import {
  FOCUS_CATALOG, DECISION_CATALOG, MUTSUMI_OWNER_ID, TRAIT_CATALOG, SPIRIT_CATALOG,
  canStartFocus, checkCondition, createGameStrategyState, focusWeight, focusBranchLocked, mutsumiBalanceValue,
  type FocusDefinition, type StrategyCommand, type StrategyEffect, type StrategyOwner,
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
const state = computed(() => props.model.state.protagonists?.strategy ?? createGameStrategyState(minute.value));
const profile = computed(() => state.value.people[actor.value]);
const mutsumiBalance = computed(() =>
  actor.value === MUTSUMI_OWNER_ID ? mutsumiBalanceStatus(mutsumiBalanceValue(state.value)) : null,
);
const focuses = computed(() => FOCUS_CATALOG.filter(row => row.owner === actor.value));
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
const feedback = ref('');
let serial = 0;

const MIN_TREE_ZOOM = 0.5;
const MAX_TREE_ZOOM = 1.85;
const COLUMN_WIDTH = 196;
const ROW_HEIGHT = 144;
const NODE_HEIGHT = 114;
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
  viewportWidth.value = viewport.clientWidth;
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

async function openFocusDetail(focusId: string, event?: MouseEvent) {
  if (selectedFocusId.value === focusId) {
    closeFocusDetail();
    return;
  }
  detailTrigger = (event?.currentTarget as HTMLElement | undefined) ?? null;
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

function startSelectedFocus(focusId: string) {
  if (viewingNpc.value) return;
  dispatch({ type: 'start_focus', owner: activeActor.value, focusId });
  if (!props.model.notice && profile.value.active?.id === focusId) {
    selectedFocusId.value = null;
  }
}

function available(focus: FocusDefinition) { return canStartFocus(state.value, actor.value, focus); }

const nextAvailableFocus = computed(() =>
  focuses.value.find(f => !profile.value.completed.includes(f.id) && profile.value.active?.id !== f.id && !focusBranchLocked(state.value, actor.value, f) && available(f)) ?? null,
);

function status(focus: FocusDefinition) {
  if (profile.value.completed.includes(focus.id)) return '已完成';
  if (profile.value.active?.id === focus.id) return '进行中';
  if (focusBranchLocked(state.value, actor.value, focus)) return '已放弃';
  if (!available(focus)) return '尚未解锁';
  return '可开始';
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

function remainingDays(focus: FocusDefinition) {
  if (profile.value.active?.id !== focus.id) return (focus.durationMinutes / 1440).toFixed(1);
  return Math.max(0, (focus.durationMinutes - profile.value.active.progress) / 1440).toFixed(1);
}

function prerequisites(focus: FocusDefinition) {
  const condition = focus.prerequisites;
  if (!condition) return '无需前置国策';
  if ('completed' in condition) return `完成「${FOCUS_CATALOG.find(f => f.id === condition.completed)?.title ?? condition.completed}」`;
  return checkCondition(condition, { state: state.value, owner: actor.value }) ? '前置条件已满足' : '前置条件尚未满足';
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
  <section class="focus-panel" data-testid="focus-tree-panel" aria-label="个人国策树">
    <!-- Compact active focus / ready focus card -->
    <div class="fp-route-top">
      <div class="fp-rt-icon" aria-hidden="true">{{ current ? '◷' : '◈' }}</div>
      <div class="fp-rt-main">
        <div class="fp-rt-label">
          <template v-if="viewingNpc">{{ viewerName }}的路线轨迹</template>
          <template v-else-if="current">正在进行 · 随剧情时间推进</template>
          <template v-else-if="nextAvailableFocus">现在可以开始</template>
          <template v-else>当前阶段路线已完成</template>
        </div>
        <div class="fp-rt-title">
          {{ current ? current.title : nextAvailableFocus ? nextAvailableFocus.title : `${viewerName} · 已完成 ${profile.completed.length}/${focuses.length}` }}
        </div>
        <div v-if="current && profile.active" class="focus-progress fp-rt-bar" role="progressbar" :aria-label="current.title" :aria-valuenow="percentage(current)" aria-valuemin="0" aria-valuemax="100">
          <i :style="{ width: percentage(current) + '%' }"></i>
        </div>
      </div>
      <div class="fp-rt-side">
        <template v-if="current && profile.active">
          <span class="fp-rt-rem">剩 {{ remainingDays(current) }} 日</span>
          <button v-if="!viewingNpc && profile.controller === 'manual'" type="button" class="fp-btn-line fp-btn-danger" :disabled="model.busy" @click="dispatch({type:'cancel_focus',owner:activeActor})">取消国策</button>
        </template>
        <button v-else-if="!viewingNpc && nextAvailableFocus" type="button" class="fp-btn-gold" @click="openFocusDetail(nextAvailableFocus.id, $event)">查看</button>
        <button v-else-if="viewingNpc" type="button" class="fp-btn-line" @click="viewTarget = 'active'">返回主角</button>
      </div>
    </div>

    <!-- Trait pills + compact character archive selector -->
    <div class="fp-meta-bar">
      <div class="fp-traits">
        <span v-for="trait in traits" :key="trait.id" class="fp-trait tno-spirit-badge">★ {{ trait.title }}</span>
        <span v-for="spirit in spirits" :key="spirit.id" class="fp-spirit tno-spirit-badge">❖ {{ spirit.title }}</span>
        <button v-if="!viewingNpc && profile.controller === 'auto'" type="button" class="fp-self-pill" :disabled="model.busy" @click="setControl('manual')">她自己决定方向中 · 改为由我选择</button>
      </div>
      <label class="fp-target-picker">
        <span class="sr-only">切换查看人物路线</span>
        <select v-model="viewTarget" class="fp-target-select" aria-label="切换查看主角或城中人物国策" data-testid="focus-target-select">
          <option value="active">{{ protagonistNames[activeActor] }}（当前）</option>
          <optgroup v-for="group in NPC_FOCUS_DIRECTORY" :key="group.label" :label="group.label">
            <option v-for="member in group.members" :key="member.id" :value="member.id">{{ member.name }}</option>
          </optgroup>
        </select>
      </label>
    </div>

    <!-- Mutsumi Balance of Mind -->
    <section v-if="mutsumiBalance" class="fp-bop-card" data-testid="mutsumi-balance-panel" aria-label="若叶睦心境天平">
      <div class="fp-bop-head">
        <strong>心境天平 · {{ mutsumiBalance.poleLeft }} ↔ {{ mutsumiBalance.poleRight }}</strong>
        <span class="fp-bop-pill">{{ mutsumiBalance.tierLabel }}（{{ mutsumiBalance.value > 0 ? `+${mutsumiBalance.value}` : mutsumiBalance.value }}）</span>
      </div>
      <div
        class="fp-bop-track"
        role="meter"
        :aria-label="`心境天平：${mutsumiBalance.tierLabel}`"
        :aria-valuenow="mutsumiBalance.value"
        aria-valuemin="-100"
        aria-valuemax="100"
      >
        <span class="fp-bop-center" aria-hidden="true"></span>
        <span class="fp-bop-needle" :style="{ left: mutsumiBalance.markerPercent + '%' }"></span>
      </div>
      <p class="fp-bop-summary">{{ mutsumiBalance.summary }}</p>
    </section>

    <p v-if="feedback" role="status" class="fp-feedback">{{ feedback }}</p>

    <!-- Visual Focus Tree immediately on first screen -->
    <section class="fp-tree-wrap">
      <div class="fp-tree-toolbar">
        <span class="fp-tree-title">个人国策树 <small>已完成 {{ profile.completed.length }}/{{ focuses.length }}</small></span>
        <div class="fp-zoom-controls" role="toolbar" aria-label="国策树缩放控制">
          <button type="button" aria-label="缩小国策树" :disabled="treeZoom <= MIN_TREE_ZOOM" @click="zoomTree(-0.15)">−</button>
          <span>{{ Math.round(treeZoom * 100) }}%</span>
          <button type="button" aria-label="放大国策树" :disabled="treeZoom >= MAX_TREE_ZOOM" @click="zoomTree(0.15)">+</button>
          <button type="button" title="重置缩放与位置" @click="resetTreeView()">重置</button>
        </div>
      </div>

      <div
        ref="treeViewport"
        class="fp-tree-viewport"
        :class="{ 'is-panning': isPanningTree }"
        data-testid="focus-tree-viewport"
        aria-label="国策路线图"
        tabindex="0"
        @wheel="onTreeWheel"
        @pointerdown="onTreePointerDown"
        @pointermove="onTreePointerMove"
        @lostpointercapture="onTreePointerUp"
      >
        <div v-if="focuses.length" class="fp-tree-space" :style="{ width: treeLayout.width * treeZoom + 'px', height: treeLayout.height * treeZoom + 'px' }">
          <div
            class="focus-tree fp-tree-canvas"
            :style="{ width: treeLayout.width + 'px', height: treeLayout.height + 'px', transform: 'scale(' + treeZoom + ')' }"
          >
            <svg class="fp-tree-links" :viewBox="'0 0 ' + treeLayout.width + ' ' + treeLayout.height" aria-hidden="true">
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
              class="focus-card tno-focus-node fp-node"
              :class="[statusClass(focus), { selected: selectedFocusId === focus.id }]"
              :style="{ left: x + 'px', top: y + 'px', height: NODE_HEIGHT + 'px' }"
              :data-focus-id="focus.id"
              :aria-expanded="selectedFocusId === focus.id"
              @click="openFocusDetail(focus.id, $event)"
            >
              <span class="fp-node-ic">
                <img v-if="focusIcon(focus.id)" :src="focusIcon(focus.id)!" alt="" loading="lazy" />
                <span v-else aria-hidden="true">{{ focusGlyph(focus.id) }}</span>
              </span>
              <strong class="fp-node-title">{{ focus.title }}</strong>
              <span class="fp-node-meta">
                <template v-if="profile.active?.id === focus.id">进行中 · 剩 {{ remainingDays(focus) }} 日</template>
                <template v-else-if="statusClass(focus) === 'is-ready'">{{ focus.durationMinutes / 1440 }} 日 · 可开始</template>
                <template v-else-if="statusClass(focus) === 'is-done'">已完成</template>
                <template v-else-if="statusClass(focus) === 'is-locked'">已放弃</template>
                <template v-else>{{ focus.durationMinutes / 1440 }} 日</template>
              </span>
              <span v-if="profile.active?.id === focus.id" class="focus-progress fp-node-bar" role="progressbar" :aria-label="focus.title" :aria-valuenow="percentage(focus)" aria-valuemin="0" aria-valuemax="100">
                <i :style="{ width: percentage(focus) + '%' }"></i>
              </span>
            </button>
          </div>
        </div>
        <p v-else class="fp-empty">当前人物尚未登记个人国策。</p>
      </div>

      <!-- Node Detail Bottom Sheet -->
      <div v-if="selectedFocus" class="fp-sheet-backdrop" data-testid="focus-detail-modal" @click.self="closeFocusDetail">
        <article ref="focusDetail" class="fp-detail-sheet" role="region" tabindex="-1" :aria-label="selectedFocus.title + ' · 国策详情'" @keydown.esc.stop="closeFocusDetail">
          <div class="fp-sh-grab" aria-hidden="true"></div>
          <header class="fp-sh-head">
            <div class="fp-sh-ic">
              <img v-if="focusIcon(selectedFocus.id)" :src="focusIcon(selectedFocus.id)!" :alt="`${selectedFocus.title}图标`" />
              <span v-else aria-hidden="true">{{ focusGlyph(selectedFocus.id) }}</span>
            </div>
            <div class="fp-sh-titles">
              <h4>{{ selectedFocus.title }}</h4>
              <div class="fp-sh-sub">需时 {{ selectedFocus.durationMinutes / 1440 }} 日 · {{ status(selectedFocus) }}</div>
            </div>
            <button type="button" class="fp-icb" aria-label="关闭国策详情" @click="closeFocusDetail">×</button>
          </header>

          <div class="fp-sh-body">
            <p v-if="selectedFocus.description" class="fp-sh-desc">{{ selectedFocus.description }}</p>

            <div class="fp-sh-sec">需要</div>
            <p class="fp-sh-line">{{ prerequisites(selectedFocus) }}</p>

            <div class="fp-sh-sec">完成后</div>
            <ul v-if="selectedFocus.onComplete?.length" class="fp-sh-list">
              <li v-for="(eff, idx) in selectedFocus.onComplete" :key="idx">★ {{ effectLabel(eff) }}</li>
            </ul>
            <p v-else class="fp-sh-line">推进人物当前阶段方向</p>

            <div v-if="selectedFocus.branchGroup" class="fp-sh-warn">
              互斥路线 · 二选一。开始后，另一条路线会关闭。
            </div>

            <details class="fp-tendency" data-ai-view>
              <summary>人物倾向参考（{{ weight(selectedFocus).value }}）</summary>
              <p>基础倾向 {{ selectedFocus.aiWeight }}；负数代表她原本抗拒，你仍可替她选择。</p>
              <p v-for="(modifier, index) in weight(selectedFocus).breakdown" :key="index">{{ sourceName(modifier.source) }}：{{ modifier.amount > 0 ? '+' : '' }}{{ modifier.amount }}</p>
            </details>
          </div>

          <footer class="fp-sh-foot">
            <button v-if="!viewingNpc && profile.active?.id === selectedFocus.id && profile.controller === 'manual'" type="button" class="fp-btn-line fp-btn-danger fp-btn-wide" :disabled="model.busy" @click="dispatch({type:'cancel_focus',owner:activeActor})">取消国策</button>
            <button v-else-if="!viewingNpc && !profile.completed.includes(selectedFocus.id) && profile.controller === 'auto'" type="button" class="fp-btn-gold fp-btn-wide" :disabled="model.busy" @click="setControl('manual')">改为由我选择方向</button>
            <button v-else-if="!viewingNpc && !profile.completed.includes(selectedFocus.id)" type="button" class="fp-btn-gold fp-btn-wide" :disabled="model.busy || !!profile.active || !available(selectedFocus)" @click="startSelectedFocus(selectedFocus.id)">
              <template v-if="profile.active">先完成「{{ current?.title }}」</template>
              <template v-else-if="focusBranchLocked(state, actor, selectedFocus)">已选择另一条路</template>
              <template v-else-if="!available(selectedFocus)">还没满足条件</template>
              <template v-else>开始国策 · {{ selectedFocus.durationMinutes / 1440 }} 日</template>
            </button>
            <button v-else type="button" class="fp-btn-gold fp-btn-wide" disabled>{{ status(selectedFocus) }}</button>
          </footer>
        </article>
      </div>
    </section>

    <details class="fp-archive">
      <summary>路线记录与顾问加成</summary>
      <div class="fp-archive-list">
        <p v-for="adv in activeAdvisorTraits" :key="`${adv.personId}:${adv.trait.id}`">{{ adv.trait.icon }} 顾问（{{ adv.personName }} · {{ adv.bandName }}）：{{ adv.trait.title }} · {{ formatNpcTraitModifiers(adv.trait).join('、') }}</p>
        <p v-for="entry in history" :key="entry.id">
          第 {{ Math.floor(entry.at / 1440) + 1 }} 天 · {{ historyKindLabel[entry.kind] }}<span v-if="historySubjectTitles.has(entry.subject)"> · {{ historySubjectTitles.get(entry.subject) }}</span><span v-if="entry.note">：{{ entry.note }}</span>
        </p>
        <p v-if="!history.length && !activeAdvisorTraits.length">暂无记录。</p>
      </div>
    </details>
  </section>
</template>
