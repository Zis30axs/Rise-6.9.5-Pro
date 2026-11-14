<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ShellActions, ShellModel } from './types';
import {
  formatStrategyModifier,
  type StrategyModifier,
} from '../runtime/strategy';
import type { FactionCondition, FactionFocusCommand } from '../runtime/faction-focus';
import { buildFactionViews, type FactionNodeView, type FactionViewModel } from '../runtime/faction-focus-world';

const props = defineProps<{ model: ShellModel; actions: ShellActions }>();

const NODE_W = 192;
const NODE_H = 104;
const COL_GAP = 24;
const ROW_GAP = 36;
const PAD = 14;

let serial = 0;
const feedback = ref('');
const views = computed(() => buildFactionViews(props.model.state));
const selectedFactionId = ref<string>('');
const selectedNodeId = ref<string | null>(null);

watch(
  views,
  list => {
    if (!list.length) return;
    if (!selectedFactionId.value || !list.some(v => v.profile.id === selectedFactionId.value)) {
      const owned = list.find(v => v.canManage);
      selectedFactionId.value = (owned ?? list[0]!).profile.id;
    }
  },
  { immediate: true },
);

const current = computed<FactionViewModel | null>(
  () => views.value.find(v => v.profile.id === selectedFactionId.value) ?? views.value[0] ?? null,
);

watch(
  current,
  val => {
    if (!val) {
      selectedNodeId.value = null;
      return;
    }
    const existing = val.nodes.find(n => n.definition.id === selectedNodeId.value);
    if (!existing) {
      const preferred =
        val.nodes.find(n => n.status === 'active')
        ?? val.nodes.find(n => n.status === 'available')
        ?? val.nodes[0];
      selectedNodeId.value = preferred?.definition.id ?? null;
    }
  },
  { immediate: true },
);

function extractPrereqIds(cond?: FactionCondition): string[] {
  if (!cond) return [];
  if ('completed' in cond) return [cond.completed];
  if ('all' in cond) return cond.all.flatMap(extractPrereqIds);
  if ('any' in cond) return cond.any.flatMap(extractPrereqIds);
  return [];
}

interface PositionedNode {
  view: FactionNodeView;
  x: number;
  y: number;
}

interface TreeEdge {
  key: string;
  path: string;
  done: boolean;
}

const treeLayout = computed<{
  width: number;
  height: number;
  nodes: PositionedNode[];
  edges: TreeEdge[];
}>(() => {
  const vm = current.value;
  if (!vm || !vm.nodes.length) {
    return { width: 652, height: 140, nodes: [], edges: [] };
  }
  const maxTier = Math.max(...vm.nodes.map(n => n.definition.tier), 0);
  const maxCol = Math.max(...vm.nodes.map(n => n.definition.column), 2);
  const posMap = new Map<string, PositionedNode>();
  const nodes: PositionedNode[] = vm.nodes.map(view => {
    const x = PAD + view.definition.column * (NODE_W + COL_GAP);
    const y = PAD + view.definition.tier * (NODE_H + ROW_GAP);
    const entry = { view, x, y };
    posMap.set(view.definition.id, entry);
    return entry;
  });

  const edges: TreeEdge[] = [];
  for (const child of nodes) {
    const parentIds = extractPrereqIds(child.view.definition.prerequisites);
    for (const parentId of parentIds) {
      const parent = posMap.get(parentId);
      if (!parent) continue;
      const x1 = parent.x + NODE_W / 2;
      const y1 = parent.y + NODE_H;
      const x2 = child.x + NODE_W / 2;
      const y2 = child.y;
      const midY = y1 + (y2 - y1) / 2;
      const path = `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
      edges.push({
        key: `${parentId}->${child.view.definition.id}`,
        path,
        done: parent.view.status === 'completed',
      });
    }
  }

  return {
    width: PAD * 2 + (maxCol + 1) * NODE_W + maxCol * COL_GAP,
    height: PAD * 2 + (maxTier + 1) * NODE_H + maxTier * ROW_GAP,
    nodes,
    edges,
  };
});

const inspectedNode = computed<FactionNodeView | null>(() => {
  const vm = current.value;
  if (!vm) return null;
  return vm.nodes.find(n => n.definition.id === selectedNodeId.value) ?? vm.nodes[0] ?? null;
});

const activeNode = computed<FactionNodeView | null>(
  () => current.value?.nodes.find(n => n.definition.id === current.value?.entry.active?.id) ?? null,
);

function sendCommand(command: FactionFocusCommand, okText: string): boolean {
  if (props.model.busy) return false;
  feedback.value = '';
  const prevRev = props.model.state.protagonists?.revision ?? -1;
  try {
    props.actions.dispatch({
      type: 'faction_focus',
      requestId: `ff-ui:${Date.now().toString(36)}:${++serial}`,
      command,
    });
    const nextRev = props.model.state.protagonists?.revision ?? -1;
    if (!props.model.notice && nextRev > prevRev) {
      feedback.value = okText;
      return true;
    }
    feedback.value = props.model.notice || '阵营方针尚未变更。';
    return false;
  } catch (err) {
    feedback.value = err instanceof Error ? err.message : '操作未能完成。';
    return false;
  }
}

function setController(controller: 'manual' | 'auto') {
  if (!current.value?.canManage) return;
  sendCommand(
    {
      type: 'set_faction_control',
      factionId: current.value.profile.id,
      controller,
      includeInPrompt: current.value.entry.includeInPrompt,
    },
    controller === 'manual' ? '已切换为手动拍板阵营国策。' : '已交回给阵营成员自主统筹。',
  );
}

function toggleStoryEcho(event: Event) {
  if (!current.value?.canManage) return;
  const checked = (event.target as HTMLInputElement).checked;
  sendCommand(
    {
      type: 'set_faction_control',
      factionId: current.value.profile.id,
      controller: current.value.entry.controller,
      includeInPrompt: checked,
    },
    checked ? '已开启与相关场景的日常呼应。' : '已改为静默在后台推进。',
  );
}

function startFocus(node: FactionNodeView) {
  const vm = current.value;
  if (!vm?.canManage || node.status !== 'available') return;
  if (vm.entry.controller !== 'manual') {
    const switched = sendCommand(
      {
        type: 'set_faction_control',
        factionId: vm.profile.id,
        controller: 'manual',
        includeInPrompt: vm.entry.includeInPrompt,
      },
      '已接管为手动拍板。',
    );
    if (!switched) return;
  }
  sendCommand(
    {
      type: 'start_faction_focus',
      factionId: vm.profile.id,
      focusId: node.definition.id,
    },
    `已启动阵营国策「${node.definition.title}」。`,
  );
}

function cancelActiveFocus() {
  const vm = current.value;
  if (!vm?.canManage || !vm.entry.active || vm.entry.controller !== 'manual') return;
  sendCommand(
    { type: 'cancel_faction_focus', factionId: vm.profile.id },
    '已中止当前阵营国策。',
  );
}

const STATUS_LABELS: Record<FactionNodeView['status'], string> = {
  completed: '已达成',
  active: '推进中',
  available: '可启动',
  branch_locked: '路线已锁定',
  locked: '未解锁',
};

function formatDays(minutes: number): string {
  const days = Math.round((minutes / 1440) * 10) / 10;
  return `${days} 天`;
}

function modifierLabel(mod: StrategyModifier): string {
  return formatStrategyModifier(mod);
}

function mutsumiShiftText(delta?: number): string {
  if (!delta) return '';
  return delta < 0
    ? `牵动若叶睦向「本我敞开」靠近 (${delta})`
    : `牵动若叶睦向「Mortis 舞台假面」收紧 (+${delta})`;
}
</script>

<template>
  <section class="society-card ff-section" data-testid="faction-focus-section" aria-label="阵营国策树">
    <div class="society-row tno-card-top">
      <div>
        <span class="tno-card-kicker">SHARED FACTION FOCUS TREE</span>
        <h3>阵营国策树</h3>
      </div>
      <div class="ff-faction-tabs" role="tablist" aria-label="选择阵营">
        <button
          v-for="item in views"
          :key="item.profile.id"
          type="button"
          class="ff-faction-tab"
          :class="{ active: current?.profile.id === item.profile.id, 'is-running': !!item.entry.active }"
          @click="selectedFactionId = item.profile.id; feedback = ''"
        >
          <span>{{ item.profile.title }}</span>
          <small>{{ item.entry.active ? '推进中' : `${item.entry.completed.length}/${item.nodes.length}` }}</small>
        </button>
      </div>
    </div>

    <template v-if="current">
      <div class="ff-telemetry">
        <div class="ff-stat-pill">
          <span>阵营类型</span>
          <strong>{{ current.profile.subtitle }}</strong>
        </div>
        <div class="ff-stat-pill">
          <span>在籍成员</span>
          <strong>{{ current.profile.memberIds.length }} 人</strong>
        </div>
        <div class="ff-stat-pill">
          <span>内阁席位</span>
          <strong>
            {{ current.profile.advisors.length }} 席
            <template v-if="current.profile.advisors.length">
              （{{ current.profile.advisors.map(a => a.name).join(' · ') }}）
            </template>
          </strong>
        </div>
        <div
          class="ff-stat-pill is-speed"
          :title="`基础 1.00 + 内阁席位 +${current.rateBreakdown.seatBonus.toFixed(2)} + 顾问协同 +${current.rateBreakdown.traitBonus.toFixed(2)}`"
        >
          <span>推进速率</span>
          <strong>×{{ current.rateBreakdown.totalRate.toFixed(2) }}</strong>
        </div>
      </div>

      <div class="ff-control-bar">
        <div class="ff-mode-group" role="group" aria-label="阵营统筹方式">
          <button
            type="button"
            class="ff-mode-btn"
            :class="{ active: current.entry.controller === 'auto' }"
            :disabled="!current.canManage || model.busy"
            @click="setController('auto')"
          >
            由成员统筹
          </button>
          <button
            type="button"
            class="ff-mode-btn"
            :class="{ active: current.entry.controller === 'manual' }"
            :disabled="!current.canManage || model.busy"
            @click="setController('manual')"
          >
            手动拍板
          </button>
        </div>

        <label class="ff-echo-toggle">
          <input
            type="checkbox"
            :checked="current.entry.includeInPrompt"
            :disabled="!current.canManage || model.busy"
            @change="toggleStoryEcho"
          />
          <span>相关场景自然呼应阵营方针</span>
        </label>

        <span v-if="!current.canManage" class="ff-readonly-note">
          当前视角非该阵营主导成员，仅可旁观进度
        </span>
      </div>

      <div v-if="activeNode" class="ff-active-banner">
        <div class="ff-active-meta">
          <strong>
            正在推进：{{ activeNode.definition.title }}
          </strong>
          <span>
            {{ activeNode.progressPercent }}%
          </span>
        </div>
        <div class="ff-progress-track">
          <div
            class="ff-progress-fill"
            :style="{ width: `${activeNode.progressPercent}%` }"
          ></div>
        </div>
        <div v-if="current.canManage && current.entry.controller === 'manual'" class="society-actions">
          <button type="button" class="muted" :disabled="model.busy" @click="cancelActiveFocus">
            中止当前国策
          </button>
        </div>
      </div>

      <div v-if="current.spirits.length" class="ff-spirits-bar">
        <span class="ff-spirits-heading">已生效全员阵营精神：</span>
        <div class="ff-spirit-list">
          <div v-for="spirit in current.spirits" :key="spirit.id" class="ff-spirit-chip">
            <strong>{{ spirit.title }}</strong>
            <small>{{ spirit.summary }}</small>
            <div class="ff-mod-tags">
              <span v-for="(mod, idx) in spirit.modifiers" :key="idx" class="ff-mod-tag">
                {{ modifierLabel(mod) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="ff-tree-scroll" aria-label="阵营国策分支图">
        <div
          class="ff-tree-stage"
          :style="{ width: `${treeLayout.width}px`, height: `${treeLayout.height}px` }"
        >
          <svg
            class="ff-tree-svg"
            :viewBox="`0 0 ${treeLayout.width} ${treeLayout.height}`"
            :width="treeLayout.width"
            :height="treeLayout.height"
            aria-hidden="true"
          >
            <path
              v-for="edge in treeLayout.edges"
              :key="edge.key"
              :d="edge.path"
              class="ff-tree-edge"
              :class="{ 'is-done': edge.done }"
            />
          </svg>

          <button
            v-for="item in treeLayout.nodes"
            :key="item.view.definition.id"
            type="button"
            class="ff-node-card"
            :class="[`status-${item.view.status}`, { 'is-selected': inspectedNode?.definition.id === item.view.definition.id }]"
            :style="{
              left: `${item.x}px`,
              top: `${item.y}px`,
              width: `${NODE_W}px`,
              height: `${NODE_H}px`,
            }"
            @click="selectedNodeId = item.view.definition.id"
          >
            <div class="ff-node-top">
              <span class="ff-node-status">{{ STATUS_LABELS[item.view.status] }}</span>
              <span class="ff-node-days">{{ formatDays(item.view.definition.durationMinutes) }}</span>
            </div>
            <strong class="ff-node-title">{{ item.view.definition.title }}</strong>
            <div class="ff-node-foot">
              <span v-if="item.view.definition.branchGroup" class="ff-node-tag">互斥路线</span>
              <span v-else-if="item.view.definition.important" class="ff-node-tag is-important">终局共识</span>
              <span v-if="item.view.spiritDefinitions.length" class="ff-node-spirit-hint">
                +{{ item.view.spiritDefinitions[0]!.title }}
              </span>
            </div>
            <div v-if="item.view.status === 'active'" class="ff-node-bar">
              <span :style="{ width: `${item.view.progressPercent}%` }"></span>
            </div>
          </button>
        </div>
      </div>

      <div v-if="inspectedNode" class="ff-inspector" data-testid="faction-focus-inspector">
        <div class="ff-inspector-head">
          <div>
            <strong>{{ inspectedNode.definition.title }}</strong>
            <span class="ff-inspector-status">{{ STATUS_LABELS[inspectedNode.status] }}</span>
          </div>
          <span class="society-meta">预计耗时：{{ formatDays(inspectedNode.definition.durationMinutes) }}</span>
        </div>

        <p class="ff-inspector-desc">{{ inspectedNode.definition.description }}</p>

        <div class="ff-inspector-reqs">
          <span><strong>前提门槛：</strong>{{ inspectedNode.prerequisiteText }}</span>
          <span v-if="inspectedNode.availableText">
            <strong>保持条件：</strong>{{ inspectedNode.availableText }}
          </span>
        </div>

        <div v-if="inspectedNode.spiritDefinitions.length || inspectedNode.definition.shiftMutsumiBalance" class="ff-inspector-rewards">
          <div v-for="sp in inspectedNode.spiritDefinitions" :key="sp.id" class="ff-reward-row">
            <strong>赋予全员阵营精神「{{ sp.title }}」：</strong>
            <span>{{ sp.modifiers.map(modifierLabel).join(' · ') }}</span>
          </div>
          <div v-if="inspectedNode.definition.shiftMutsumiBalance" class="ff-reward-row is-balance">
            <strong>心境影响：</strong>
            <span>{{ mutsumiShiftText(inspectedNode.definition.shiftMutsumiBalance) }}</span>
          </div>
        </div>

        <div class="society-actions">
          <button
            v-if="current.canManage && inspectedNode.status === 'available' && !current.entry.active"
            type="button"
            :disabled="model.busy"
            @click="startFocus(inspectedNode)"
          >
            {{ current.entry.controller === 'auto' ? '接管并启动此国策' : '启动此阵营国策' }}
          </button>
          <button
            v-else-if="current.canManage && inspectedNode.status === 'active' && current.entry.controller === 'manual'"
            type="button"
            class="muted"
            :disabled="model.busy"
            @click="cancelActiveFocus"
          >
            中止推进
          </button>
        </div>
      </div>

      <p v-if="feedback" class="society-message" role="status">{{ feedback }}</p>
    </template>
  </section>
</template>
