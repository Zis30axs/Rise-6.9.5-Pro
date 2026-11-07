<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import MapCharacterAvatar from './MapCharacterAvatar.vue';
import { identityStrategyDossier } from './identity-strategy';
import mutsumiStageAsideUrl from '../../assets/downtown-art/characters/mutsumi/uniform/neutral-aside.webp';
import mutsumiNeutralUrl from '../../assets/downtown-art/characters/mutsumi/uniform/neutral.webp';
import mutsumiShyUrl from '../../assets/downtown-art/characters/mutsumi/uniform/shy.webp';
import mutsumiSmileUrl from '../../assets/downtown-art/characters/mutsumi/uniform/smile.webp';
import sakikoSmileUrl from '../../assets/downtown-art/characters/sakiko/casual/smile.webp';
import { isProtagonistId, type ProtagonistId } from '../runtime/dual-protagonists';
import { activeProtagonist as readActiveProtagonist } from '../runtime/protagonist-world';
import {
  buildIdentityRelationshipMesh,
  getIdentityCardCatalog,
  getProtagonistBondForCard,
  isCharacterInContacts,
  resolveIdentityCardById,
  resolveLocationName,
  type IdentityCardMode,
  type IdentityCardSide,
  type IdentityMeshEdge,
  type IdentityMeshGroup,
  type IdentityMeshNode,
  type IdentityPhotoPose,
  type ResidentIdentityCard
} from './identity-card';
import type { ShellActions, ShellModel } from './types';

const props = defineProps<{
  model: ShellModel;
  actions: ShellActions;
  initialPersonId?: string;
}>();

const emit = defineEmits<{
  fillComposer: [text: string];
  closePanel: [];
  openSocialPanel: [];
}>();

const activeProtagonist = computed<ProtagonistId>(() => readActiveProtagonist(props.model.state));

const cardCatalog = computed<ResidentIdentityCard[]>(() =>
  getIdentityCardCatalog(props.model.state, activeProtagonist.value)
);

// 快捷持卡人选取、搜索与全览花名册
const rosterSearchQuery = ref<string>('');
const rosterCategoryFilter = ref<'all' | 'protagonist' | 'family' | 'watanare' | 'band' | 'town'>('all');
const showRosterDrawer = ref<boolean>(false);

const filteredCardCatalog = computed<ResidentIdentityCard[]>(() => {
  const q = rosterSearchQuery.value.trim().toLowerCase();
  return cardCatalog.value.filter((item) => {
    if (q) {
      const match =
        item.name.toLowerCase().includes(q) ||
        item.nativeName.toLowerCase().includes(q) ||
        item.gradeOrTitle.toLowerCase().includes(q) ||
        item.schoolOrAffiliation.toLowerCase().includes(q) ||
        item.municipality.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (rosterCategoryFilter.value === 'all') return true;
    if (rosterCategoryFilter.value === 'protagonist') {
      return isProtagonistId(item.id);
    }
    if (rosterCategoryFilter.value === 'family') {
      return /母|父|妹|弟|家/.test(item.familySummary) || /遥奈|美代子|长崎夫人|真琴/.test(item.name);
    }
    if (rosterCategoryFilter.value === 'watanare') {
      return item.id.startsWith('watanare-') || item.id.startsWith('wata-') || /真唯|紫阳花|纱月|香穗|玲奈子|星来/.test(item.name);
    }
    if (rosterCategoryFilter.value === 'band') {
      return item.id.startsWith('bang-') || Boolean(item.stageProfile) || /素世|祥子|睦|初华|海铃|喵梦|若麦|灯|立希|爱音|乐奈/.test(item.name);
    }
    if (rosterCategoryFilter.value === 'town') {
      return !isProtagonistId(item.id) && !item.id.startsWith('watanare-') && !item.id.startsWith('bang-');
    }
    return true;
  });
});

const currentCardIndex = computed(() =>
  cardCatalog.value.findIndex((c) => c.id === activeCard.value.id)
);

function selectPrevCard() {
  const len = cardCatalog.value.length;
  if (len <= 1) return;
  const idx = currentCardIndex.value;
  const nextIdx = idx <= 0 ? len - 1 : idx - 1;
  selectedCardId.value = cardCatalog.value[nextIdx].id;
  actionFeedback.value = '';
}

function selectNextCard() {
  const len = cardCatalog.value.length;
  if (len <= 1) return;
  const idx = currentCardIndex.value;
  const nextIdx = (idx + 1) % len;
  selectedCardId.value = cardCatalog.value[nextIdx].id;
  actionFeedback.value = '';
}

function chooseCardFromDrawer(cardId: string) {
  selectedCardId.value = cardId;
  showRosterDrawer.value = false;
  actionFeedback.value = '';
}

const selectedCardId = ref<string>(props.initialPersonId || activeProtagonist.value);
const cardMode = ref<IdentityCardMode>('civil');
const photoPose = ref<IdentityPhotoPose>('standard');
const showStandingFigure = ref<boolean>(false);
const actionFeedback = ref<string>('');

// ============================================================================
// 3D Physical Card Transform State (ISO 7810 ID-1 Real Card Proportions)
// ============================================================================
const rotX = ref<number>(-6);
const rotY = ref<number>(12);
const cardScale = ref<number>(1);
const isDragging3D = ref<boolean>(false);
const thicknessLayers = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];

let dragPointerId: number | null = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartRotX = 0;
let dragStartRotY = 0;

const cardSide = computed<IdentityCardSide>(() => {
  const normY = (((rotY.value % 360) + 540) % 360) - 180;
  return Math.abs(normY) > 90 ? 'back' : 'front';
});

const card3DTransformStyle = computed(() => ({
  transform: `rotateX(${rotX.value.toFixed(2)}deg) rotateY(${rotY.value.toFixed(2)}deg) scale3d(${cardScale.value.toFixed(3)}, ${cardScale.value.toFixed(3)}, 1)`
}));

const hologramGlareStyle = computed(() => {
  const normY = (((rotY.value % 360) + 540) % 360) - 180;
  const glareX = 50 + normY * 0.85;
  const glareY = 50 - rotX.value * 1.4;
  const hueShift = Math.round((normY * 2.2 + rotX.value * 1.8 + 360) % 360);
  return {
    '--glare-x': `${glareX.toFixed(1)}%`,
    '--glare-y': `${glareY.toFixed(1)}%`,
    '--holo-hue': `${hueShift}deg`
  };
});

function adjustCard3DView(preset: 'front' | 'angled' | 'back') {
  if (preset === 'front') {
    rotX.value = 0;
    rotY.value = 0;
    cardScale.value = 1;
  } else if (preset === 'angled') {
    rotX.value = -9;
    rotY.value = 20;
    cardScale.value = 1;
  } else if (preset === 'back') {
    rotX.value = 0;
    rotY.value = 180;
  }
}

function toggleFlip() {
  if (cardSide.value === 'front') {
    adjustCard3DView('back');
  } else {
    adjustCard3DView('front');
  }
}

function adjustCardZoom(delta: number) {
  cardScale.value = Math.min(1.18, Math.max(0.84, Number((cardScale.value + delta).toFixed(2))));
}

function onCardPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('button')) return;
  const el = event.currentTarget as HTMLElement;
  dragPointerId = event.pointerId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragStartRotX = rotX.value;
  dragStartRotY = rotY.value;
  isDragging3D.value = true;
  el.setPointerCapture(event.pointerId);
}

function onCardPointerMove(event: PointerEvent) {
  if (!isDragging3D.value || event.pointerId !== dragPointerId) return;
  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;
  rotY.value = dragStartRotY + dx * 0.55;
  rotX.value = Math.max(-42, Math.min(42, dragStartRotX - dy * 0.42));
}

function onCardPointerUp(event: PointerEvent) {
  if (event.pointerId !== dragPointerId) return;
  isDragging3D.value = false;
  dragPointerId = null;
}

function onCardWheel(event: WheelEvent) {
  event.preventDefault();
  const delta = event.deltaY < 0 ? 0.04 : -0.04;
  adjustCardZoom(delta);
}

// ============================================================================
// Card Selection, Authentic Japanese My Number Formatting & Mode
// ============================================================================
watch(
  () => props.initialPersonId,
  (nextId) => {
    if (nextId) {
      selectedCardId.value = nextId;
      adjustCard3DView('angled');
      actionFeedback.value = '';
    } else {
      selectedCardId.value = activeProtagonist.value;
    }
  }
);

const activeCard = computed<ResidentIdentityCard>(() =>
  resolveIdentityCardById(selectedCardId.value, props.model.state, activeProtagonist.value)
);

const isMutsumiCard = computed<boolean>(() => activeCard.value.id === 'bang-mutsumi');

/** Formats YYYY.MM.DD into authentic Japanese My Number Card date: 2007年1月14日生 (平成19年) */
const japaneseBirthLabel = computed<string>(() => {
  const parts = activeCard.value.birthDate.split('.');
  if (parts.length !== 3) return `${activeCard.value.birthDate}生`;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const heisei = year >= 1989 ? `平成${year - 1988}年` : `${year}年`;
  return `${year}年${month}月${day}日生（${heisei}）`;
});

const japaneseExpiryLabel = computed<string>(() => {
  const parts = activeCard.value.expiryDate.split('.');
  if (parts.length !== 3) return `${activeCard.value.expiryDate}前有效`;
  return `${parts[0]}年${parts[1]}月${parts[2]}日前有效`;
});

const japaneseMayorLabel = computed<string>(() => {
  const id = activeCard.value.id;
  if (id === 'bang-mutsumi') return '東京都文京区長';
  if (id === 'soyo') return '東京都港区長';
  if (id === 'sakiko' || id === 'renako' || id === 'watanare-haruna' || id === '甘织遥奈') return '東京都豊島区長';
  if (id === 'emma') return '東京都新宿区長';
  return '東京都文京区長';
});

const japaneseHankoSeal = computed<string>(() => {
  const id = activeCard.value.id;
  if (id === 'bang-mutsumi') return '文京区長之印';
  if (id === 'soyo') return '港区長之印';
  if (id === 'sakiko' || id === 'renako' || id === 'watanare-haruna' || id === '甘织遥奈') return '豊島区長之印';
  if (id === 'emma') return '新宿区長之印';
  return '文京区長之印';
});

/** 12-digit My Number grouped as 4-4-4 for the back face */
const myNumberDigits = computed<string[]>(() => {
  const raw = activeCard.value.cardSerial.replace(/\D/g, '').padEnd(12, '0').slice(0, 12);
  return [raw.slice(0, 4), raw.slice(4, 8), raw.slice(8, 12)];
});

const securityFourDigits = computed<string>(() => {
  const raw = activeCard.value.cardSerial.replace(/\D/g, '');
  return raw.slice(-6, -2) || '0114';
});

const protagonistBond = computed(() =>
  getProtagonistBondForCard(activeCard.value, activeProtagonist.value, props.model.state.contacts)
);

const isAtAnchorZone = computed<boolean>(
  () => props.model.state.locationId === activeCard.value.anchorZoneId
);

const currentLocationLabel = computed<string>(() =>
  resolveLocationName(props.model.state.locationId)
);

const mutsumiExpressionSpriteUrl = computed<string>(() => {
  if (photoPose.value === 'smile') return mutsumiSmileUrl;
  if (photoPose.value === 'shy') return mutsumiShyUrl;
  if (photoPose.value === 'stage') return mutsumiStageAsideUrl;
  return mutsumiNeutralUrl;
});

const standingPreviewUrl = computed<string>(() => {
  if (activeCard.value.id === 'bang-mutsumi') {
    return mutsumiExpressionSpriteUrl.value;
  }
  if (activeCard.value.id === 'sakiko') {
    return sakikoSmileUrl;
  }
  return mutsumiNeutralUrl;
});

function selectCard(cardId: string) {
  selectedCardId.value = cardId;
  actionFeedback.value = '';
}

function setCardMode(mode: IdentityCardMode) {
  if (mode === 'stage' && !activeCard.value.stageProfile) return;
  cardMode.value = mode;
  if (mode === 'stage' && isMutsumiCard.value) {
    photoPose.value = 'stage';
  } else if (mode === 'civil' && photoPose.value === 'stage') {
    photoPose.value = 'standard';
  }
}

// ============================================================================
// Interactive Relationship Mesh Graph (可视化人际关系网状图)
// ============================================================================
const meshFilter = ref<IdentityMeshGroup>('all');
const meshEdgeMode = ref<'direct' | 'all' | 'focus'>('direct');
const meshZoom = ref<number>(1);
const meshPanX = ref<number>(0);
const meshPanY = ref<number>(0);

function zoomInMesh() {
  meshZoom.value = Math.min(2.5, Number((meshZoom.value + 0.2).toFixed(2)));
}
function zoomOutMesh() {
  meshZoom.value = Math.max(0.6, Number((meshZoom.value - 0.2).toFixed(2)));
}
function resetMeshZoom() {
  meshZoom.value = 1;
  meshPanX.value = 0;
  meshPanY.value = 0;
}

function onMeshWheel(event: WheelEvent) {
  event.preventDefault();
  const delta = event.deltaY < 0 ? 0.1 : -0.1;
  meshZoom.value = Math.min(2.5, Math.max(0.6, Number((meshZoom.value + delta).toFixed(2))));
}

const selectedMeshNodeId = ref<string>('');
const customNodeOffsets = reactive<Record<string, { x: number; y: number }>>({});
const svgCanvasRef = ref<SVGSVGElement | null>(null);
let draggingNodeId: string | null = null;
let nodeDragPointerId: number | null = null;
let nodeDragMoved = false;

const baseMesh = computed(() =>
  buildIdentityRelationshipMesh(
    activeCard.value,
    props.model.state,
    activeProtagonist.value,
    meshFilter.value
  )
);

const meshNodes = computed<IdentityMeshNode[]>(() =>
  baseMesh.value.nodes.map((node) => {
    const custom = customNodeOffsets[`${activeCard.value.id}:${node.id}`];
    return custom ? { ...node, x: custom.x, y: custom.y } : node;
  })
);

const meshNodeMap = computed(() => new Map(meshNodes.value.map((n) => [n.id, n])));

const meshEdges = computed<
  Array<
    IdentityMeshEdge & {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      mx: number;
      my: number;
      isHighlighted: boolean;
    }
  >
>(() => {
  const focusId = selectedMeshNode.value?.id;
  return baseMesh.value.edges
    .filter((edge) => {
      if (meshEdgeMode.value === 'direct') {
        return edge.kind === 'primary';
      }
      if (meshEdgeMode.value === 'focus') {
        if (!focusId) return edge.kind === 'primary';
        return edge.sourceId === focusId || edge.targetId === focusId;
      }
      return true;
    })
    .map((edge) => {
      const s = meshNodeMap.value.get(edge.sourceId);
      const t = meshNodeMap.value.get(edge.targetId);
      if (!s || !t) return null;
      const isHighlighted =
        !focusId ||
        focusId === activeCard.value.id ||
        edge.sourceId === focusId ||
        edge.targetId === focusId;
      return {
        ...edge,
        x1: s.x,
        y1: s.y,
        x2: t.x,
        y2: t.y,
        mx: Math.round((s.x + t.x) / 2),
        my: Math.round((s.y + t.y) / 2),
        isHighlighted
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
});

const selectedMeshNode = computed<IdentityMeshNode>(() => {
  const found = meshNodes.value.find((n) => n.id === selectedMeshNodeId.value);
  if (found) return found;
  const nonCenter = meshNodes.value.find((n) => n.id === activeProtagonist.value && !n.isCenter);
  return nonCenter ?? meshNodes.value.find((n) => !n.isCenter) ?? meshNodes.value[0];
});

const selectedNodeConnectedEdges = computed(() => {
  const targetId = selectedMeshNode.value?.id;
  if (!targetId) return [];
  return meshEdges.value
    .filter((edge) => edge.sourceId === targetId || edge.targetId === targetId)
    .map((edge) => {
      const otherId = edge.sourceId === targetId ? edge.targetId : edge.sourceId;
      const otherNode = meshNodeMap.value.get(otherId);
      return {
        id: edge.id,
        otherId,
        otherName: otherNode?.name ?? otherId,
        label: edge.label,
        affinity: edge.affinity,
        kind: edge.kind
      };
    });
});

watch(activeCard, (nextCard) => {
  if (!nextCard.stageProfile && cardMode.value === 'stage') {
    cardMode.value = 'civil';
  }
  photoPose.value = 'standard';
  actionFeedback.value = '';
  selectedMeshNodeId.value = '';
});

function resetMeshLayout() {
  for (const key of Object.keys(customNodeOffsets)) {
    delete customNodeOffsets[key];
  }
}

function startMeshNodeDrag(node: IdentityMeshNode, event: PointerEvent) {
  if (event.button !== 0) return;
  event.stopPropagation();
  draggingNodeId = node.id;
  nodeDragPointerId = event.pointerId;
  nodeDragMoved = false;
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
}

function moveMeshNodeDrag(event: PointerEvent) {
  if (!draggingNodeId || event.pointerId !== nodeDragPointerId || !svgCanvasRef.value) return;
  const rect = svgCanvasRef.value.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const svgX = Math.round(((event.clientX - rect.left) / rect.width) * 680);
  const svgY = Math.round(((event.clientY - rect.top) / rect.height) * 380);
  const clampedX = Math.max(48, Math.min(632, svgX));
  const clampedY = Math.max(44, Math.min(336, svgY));
  customNodeOffsets[`${activeCard.value.id}:${draggingNodeId}`] = { x: clampedX, y: clampedY };
  nodeDragMoved = true;
}

function endMeshNodeDrag(node: IdentityMeshNode, event: PointerEvent) {
  if (event.pointerId !== nodeDragPointerId) return;
  if (!nodeDragMoved) {
    selectedMeshNodeId.value = node.id;
  } else {
    selectedMeshNodeId.value = node.id;
  }
  draggingNodeId = null;
  nodeDragPointerId = null;
}

function jumpToNodeIdentityCard(node: IdentityMeshNode) {
  if (!node.hasCard || node.id === activeCard.value.id) return;
  selectCard(node.id);
  adjustCard3DView('angled');
}

// ============================================================================
// World Actions (Save Contact, Travel, Natural Greeting / SMS)
// ============================================================================
function registerMutsumiToContacts() {
  const card = activeCard.value;
  const existing = isCharacterInContacts(card, props.model.state.contacts);
  if (existing) {
    actionFeedback.value = `${card.name}已在当前人际档案中登记。`;
    return;
  }
  props.actions.dispatch({
    type: 'save_contact',
    id: card.id,
    name: card.name,
    portraitId: 'claude',
    sourcePersonId: null,
    summary:
      activeProtagonist.value === 'sakiko'
        ? '自幼相识的青梅竹马，同为 Ave Mujica 成员（代号 Mortis），常在校园图书馆东侧花坛照料绿植。'
        : '月之森女子学园同班同学、前 CRYCHIC 吉他手，性格安静寡言，常在校园图书馆东侧花坛照料绿植。'
  });
  actionFeedback.value = `已将「${card.name}」正式收录至当前人际通讯录。`;
}

function travelToAnchorLocation() {
  const targetZone = activeCard.value.anchorZoneId;
  if (props.model.state.locationId === targetZone) {
    actionFeedback.value = `当前已在${activeCard.value.anchorZoneLabel}。`;
    return;
  }
  props.actions.dispatch({
    type: 'travel',
    locationId: targetZone
  });
  actionFeedback.value = `已动身前往${activeCard.value.anchorZoneLabel}。`;
}

function composeGreetingToCardHolder() {
  const card = activeCard.value;
  if (card.id === 'bang-mutsumi') {
    const prompt =
      activeProtagonist.value === 'sakiko'
        ? '我在图书馆东侧的花坛旁找到正在照料绿植的若叶睦，轻声唤了她的名字。'
        : '我在图书馆东侧的花坛边走近若叶睦，温和地向她打招呼，问她今天在种什么。';
    emit('fillComposer', prompt);
    emit('closePanel');
    return;
  }
  emit('fillComposer', `我走近${card.name}，主动向对方打招呼。`);
  emit('closePanel');
}

function composeSmsToCardHolder() {
  const card = activeCard.value;
  if (card.id === 'bang-mutsumi') {
    const smsPrompt =
      activeProtagonist.value === 'sakiko'
        ? '给若叶睦发短信：睦，今天排练前有空吗？我们在图书馆东侧见一面。'
        : '给若叶睦发短信：小睦，现在在图书馆那边吗？我有话想找你聊聊。';
    emit('fillComposer', smsPrompt);
    emit('closePanel');
    return;
  }
  emit('fillComposer', `给${card.name}发短信：今天有空见一面吗？`);
  emit('closePanel');
}

const strategyDossier = computed(() => identityStrategyDossier(activeCard.value.id, activeCard.value.personId, props.model.state));
const strategyTime = (at: number) => '第 ' + (Math.floor(at / 1440) + 1) + ' 天 ' + String(Math.floor(at % 1440 / 60)).padStart(2, '0') + ':' + String(at % 60).padStart(2, '0');
const strategyKindLabel = (kind: string) => ({ start: '开始国策', complete: '完成国策', cancel: '取消国策', bypass: '跳过国策', decision: '执行决议', narrative: '剧情进展', major_event: '重大事件', spirit_expired: '民族精神到期' } as Record<string, string>)[kind] ?? kind;
</script>

<template>
  <section class="idcard-panel" aria-label="居民身份证与通行证档案">
    <!-- Top Switcher & Mode Header -->
    <header class="idcard-header">
      <div class="idcard-header-top">
        <div class="idcard-title-group">
          <span class="idcard-eyebrow">日本国 个人番号卡 · 住民基本台帐 · 学籍证明（ISO/IEC 7810 ID-1 规格）</span>
          <h4 class="idcard-main-title">
            {{ activeCard.name }}
            <span class="idcard-native-name">{{ activeCard.nativeName }}</span>
          </h4>
        </div>
        <div class="idcard-header-actions">
          <button
            v-if="activeCard.stageProfile"
            type="button"
            class="idcard-mode-btn"
            :class="{ active: cardMode === 'civil' }"
            @click="setCardMode('civil')"
          >
            个人番号卡
          </button>
          <button
            v-if="activeCard.stageProfile"
            type="button"
            class="idcard-mode-btn stage-mode"
            :class="{ active: cardMode === 'stage' }"
            @click="setCardMode('stage')"
          >
            出演者証 · {{ activeCard.stageProfile.stageCode.split(' ')[0] }}
          </button>
          <button
            type="button"
            class="idcard-flip-btn"
            :aria-pressed="cardSide === 'back'"
            @click="toggleFlip"
          >
            {{ cardSide === 'front' ? '翻转裏面 ↻' : '返回表面 ↺' }}
          </button>
        </div>
      </div>

      <!-- Character Selection & Directory Toolbar -->
      <div class="idcard-picker-toolbar">
        <div class="idcard-picker-controls">
          <!-- Prev / Next Card Stepper -->
          <div class="idcard-nav-stepper">
            <button
              type="button"
              class="idcard-stepper-btn"
              title="切换至上一位持卡人"
              aria-label="上一位持卡人"
              @click="selectPrevCard"
            >
              ‹
            </button>
            <span class="idcard-stepper-counter">
              {{ currentCardIndex >= 0 ? currentCardIndex + 1 : 1 }} / {{ cardCatalog.length }}
            </span>
            <button
              type="button"
              class="idcard-stepper-btn"
              title="切换至下一位持卡人"
              aria-label="下一位持卡人"
              @click="selectNextCard"
            >
              ›
            </button>
          </div>

          <!-- Quick Search Bar -->
          <div class="idcard-search-box">
            <input
              v-model="rosterSearchQuery"
              type="search"
              class="idcard-search-input"
              placeholder="🔍 快速找人（输入姓名/身份/学校）…"
              aria-label="检索持卡人"
            />
            <button
              v-if="rosterSearchQuery"
              type="button"
              class="idcard-search-clear"
              title="清空搜索"
              @click="rosterSearchQuery = ''"
            >
              ✕
            </button>
          </div>

          <!-- Open Full Roster Modal / Drawer -->
          <button
            type="button"
            class="idcard-drawer-toggle-btn"
            :class="{ active: showRosterDrawer }"
            @click="showRosterDrawer = !showRosterDrawer"
          >
            📋 全览花名册 ({{ cardCatalog.length }})
          </button>
        </div>

        <!-- Quick Category Filter Chips -->
        <div class="idcard-category-tabs" role="tablist">
          <button
            type="button"
            class="idcard-cat-tab"
            :class="{ active: rosterCategoryFilter === 'all' }"
            @click="rosterCategoryFilter = 'all'"
          >
            全部
          </button>
          <button
            type="button"
            class="idcard-cat-tab"
            :class="{ active: rosterCategoryFilter === 'protagonist' }"
            @click="rosterCategoryFilter = 'protagonist'"
          >
            核心主角
          </button>
          <button
            type="button"
            class="idcard-cat-tab"
            :class="{ active: rosterCategoryFilter === 'family' }"
            @click="rosterCategoryFilter = 'family'"
          >
            至亲家属
          </button>
          <button
            type="button"
            class="idcard-cat-tab"
            :class="{ active: rosterCategoryFilter === 'watanare' }"
            @click="rosterCategoryFilter = 'watanare'"
          >
            芦谷同伴
          </button>
          <button
            type="button"
            class="idcard-cat-tab"
            :class="{ active: rosterCategoryFilter === 'band' }"
            @click="rosterCategoryFilter = 'band'"
          >
            乐团成员
          </button>
          <button
            type="button"
            class="idcard-cat-tab"
            :class="{ active: rosterCategoryFilter === 'town' }"
            @click="rosterCategoryFilter = 'town'"
          >
            都会在册
          </button>
        </div>
      </div>

      <!-- Character Roster Quick Horizontal Chips -->
      <nav class="idcard-roster-bar" aria-label="切换证件持有人">
        <button
          v-for="item in filteredCardCatalog"
          :key="item.id"
          type="button"
          class="idcard-roster-chip"
          :class="{
            active: item.id === activeCard.id
          }"
          @click="selectCard(item.id)"
        >
          <span class="idcard-roster-dot" :class="{ mutsumi: item.id === 'bang-mutsumi' }"></span>
          <span class="idcard-roster-name">{{ item.name }}</span>
          <span v-if="item.id === activeProtagonist" class="idcard-roster-badge self">当前视角</span>
        </button>
        <span v-if="!filteredCardCatalog.length" class="idcard-roster-empty">
          未检索到符合条件的持卡人
        </span>
      </nav>

      <!-- Full Roster Grid Drawer / Modal -->
      <div v-if="showRosterDrawer" class="idcard-roster-drawer" role="dialog" aria-modal="true" aria-label="全览花名册">
        <div class="idcard-drawer-backdrop" @click="showRosterDrawer = false"></div>
        <div class="idcard-drawer-content">
          <div class="idcard-drawer-header">
            <div class="idcard-drawer-title-group">
              <h5>学区在册居民身份证全览</h5>
              <span class="idcard-drawer-subtitle">共收录 {{ cardCatalog.length }} 位在册居民 · 点击卡片立即调取档案</span>
            </div>
            <button type="button" class="idcard-drawer-close-btn" @click="showRosterDrawer = false">✕ 关闭</button>
          </div>
          <div class="idcard-drawer-grid">
            <article
              v-for="item in filteredCardCatalog"
              :key="item.id"
              class="idcard-drawer-card"
              :class="{ active: item.id === activeCard.id, self: item.id === activeProtagonist }"
              @click="chooseCardFromDrawer(item.id)"
            >
              <div class="idcard-drawer-avatar-wrap">
                <MapCharacterAvatar class="idcard-avatar" :person-id="item.id" :protagonist-id="isProtagonistId(item.id) ? item.id : undefined" :name="item.name" />
              </div>
              <div class="idcard-drawer-info">
                <div class="idcard-drawer-card-top">
                  <span class="idcard-drawer-name">{{ item.name }}</span>
                  <span v-if="item.id === activeProtagonist" class="idcard-drawer-badge self">当前视角</span>
                  <span v-else class="idcard-drawer-badge">{{ item.categoryBadge.split('·')[0].trim() }}</span>
                </div>
                <div class="idcard-drawer-native">{{ item.nativeName }}</div>
                <div class="idcard-drawer-role">{{ item.gradeOrTitle }}</div>
                <div class="idcard-drawer-meta">
                  <span>{{ item.schoolOrAffiliation.split('·')[0].trim() }}</span>
                  <span>{{ item.municipality.split('·')[0].replace('东京都', '').replace('住民基本台帐', '').trim() }}</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </header>

    <!-- ====================================================================
         3D Authentic Japanese Individual Number Card (85.6mm × 54.0mm Ratio)
         ==================================================================== -->
    <div
      class="idcard-3d-viewport"
      :class="{ 'is-dragging': isDragging3D }"
      data-idcard-3d-stage
      @pointerdown="onCardPointerDown"
      @pointermove="onCardPointerMove"
      @pointerup="onCardPointerUp"
      @pointercancel="onCardPointerUp"
      @wheel="onCardWheel"
    >
      <!-- Top 3D Camera & Expression Pose Toolbar (Outside Card Surface) -->
      <div class="idcard-3d-toolbar" aria-label="3D 证件视角与照片神态操作">
        <div v-if="isMutsumiCard" class="idcard-toolbar-poses" role="group" aria-label="证件照神态切换">
          <span class="idcard-pose-label">写真神态：</span>
          <button
            type="button"
            class="idcard-3d-ctrl-btn"
            :class="{ active: photoPose === 'standard' }"
            @click.stop="photoPose = 'standard'"
          >
            正装
          </button>
          <button
            type="button"
            class="idcard-3d-ctrl-btn"
            :class="{ active: photoPose === 'smile' }"
            @click.stop="photoPose = 'smile'"
          >
            浅笑
          </button>
          <button
            type="button"
            class="idcard-3d-ctrl-btn"
            :class="{ active: photoPose === 'shy' }"
            @click.stop="photoPose = 'shy'"
          >
            微赧
          </button>
          <button
            type="button"
            class="idcard-3d-ctrl-btn"
            :class="{ active: photoPose === 'stage' }"
            @click.stop="photoPose = 'stage'"
          >
            侧影
          </button>
        </div>
        <span v-else class="idcard-3d-hint">按住卡片拖动 360° 旋转 · 滚轮缩放</span>

        <div class="idcard-3d-controls">
          <button
            type="button"
            class="idcard-3d-ctrl-btn"
            :class="{ active: cardSide === 'front' && Math.abs(rotY % 360) < 6 && Math.abs(rotX) < 6 }"
            title="回到正面平视"
            @click.stop="adjustCard3DView('front')"
          >
            表面回正
          </button>
          <button
            type="button"
            class="idcard-3d-ctrl-btn"
            :class="{ active: cardSide === 'front' && Math.abs(rotY % 360) >= 6 }"
            title="立体斜视检视卡芯厚度与全息防伪"
            @click.stop="adjustCard3DView('angled')"
          >
            立体斜视
          </button>
          <button
            type="button"
            class="idcard-3d-ctrl-btn"
            :class="{ active: cardSide === 'back' }"
            title="翻转查看裏面个人番号与IC芯片"
            @click.stop="adjustCard3DView('back')"
          >
            查看裏面
          </button>
          <button
            type="button"
            class="idcard-3d-ctrl-btn icon-only"
            aria-label="缩小证件"
            title="缩小证件"
            @click.stop="adjustCardZoom(-0.08)"
          >
            −
          </button>
          <button
            type="button"
            class="idcard-3d-ctrl-btn icon-only"
            aria-label="放大证件"
            title="放大证件"
            @click.stop="adjustCardZoom(0.08)"
          >
            ＋
          </button>
        </div>
      </div>

      <!-- 3D Preserve-3D Standard ID-1 Card Stage (388px × 245px) -->
      <div class="idcard-3d-scene">
        <article
          class="jp-mynumber-rig"
          :class="[`mode-${cardMode}`, { 'is-dragging': isDragging3D }]"
          :style="[card3DTransformStyle, hologramGlareStyle]"
        >
          <!-- Physical PVC & Polycarbonate Card Core Thickness Layers -->
          <div
            v-for="zOffset in thicknessLayers"
            :key="zOffset"
            class="jp-card-thickness-layer"
            :style="{ transform: `translateZ(${zOffset}px)` }"
            aria-hidden="true"
          ></div>

          <!-- ================================================================
               FRONT FACE (表面): Authentic Japanese Individual Number Card
               ================================================================ -->
          <div class="jp-card-face jp-card-front">
            <!-- Sakura & Cyan Fine Guilloche Wave Pattern + Dynamic 3D Rainbow Sheen -->
            <div class="jp-guilloche-pattern" aria-hidden="true"></div>
            <div class="jp-holo-ribbon" aria-hidden="true"></div>
            <div class="jp-3d-glare" aria-hidden="true"></div>

            <!-- CIVIL MODE: 日本 个人番号卡 (My Number Card) -->
            <div v-if="cardMode === 'civil'" class="jp-front-layout">
              <!-- Top Row: 氏名 Box + 个人番号卡 Emblem -->
              <div class="jp-top-row">
                <div class="jp-name-box">
                  <span class="jp-box-tag">氏名</span>
                  <div class="jp-name-content">
                    <span class="jp-romaji-furigana">{{ activeCard.romanizedName }}</span>
                    <strong class="jp-kanji-name">{{ activeCard.nativeName }}</strong>
                  </div>
                </div>
                <div class="jp-card-title-badge">
                  <div class="jp-card-title-text">
                    <span>個人番号</span>
                    <span>卡</span>
                  </div>
                  <!-- Iconic Japanese My Number Prismatic Emblem -->
                  <div class="jp-myna-emblem" aria-hidden="true">
                    <svg viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="16" fill="url(#myna-grad)" stroke="#d988a2" stroke-width="1.2" />
                      <defs>
                        <linearGradient id="myna-grad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stop-color="#ffdce8" />
                          <stop offset="50%" stop-color="#d4f2ea" />
                          <stop offset="100%" stop-color="#ffeab8" />
                        </linearGradient>
                      </defs>
                      <!-- Stylized Rabbit Ears & Cherry Blossom Motif -->
                      <path
                        d="M14 10 C12 4, 16 4, 17 11 C19 4, 23 4, 21 11 C24 13, 25 18, 22 22 C19 25, 16 25, 13 22 C11 18, 11 13, 14 10 Z"
                        fill="#e05684"
                        opacity="0.82"
                      />
                      <circle cx="16" cy="16" r="1.3" fill="#fff" />
                      <circle cx="20" cy="16" r="1.3" fill="#fff" />
                    </svg>
                  </div>
                </div>
              </div>

              <!-- Second Row: 住所 (Address & School Registry) -->
              <div class="jp-address-row">
                <span class="jp-box-tag">住所</span>
                <div class="jp-address-content">
                  <p class="jp-address-main">{{ activeCard.residenceAddress }}</p>
                  <p class="jp-address-sub">{{ activeCard.schoolOrAffiliation }}（{{ activeCard.studentNo }}）</p>
                </div>
              </div>

              <!-- Main Lower Area: Left ID Photo | Center Birth/Mayor/Validity | Right Ghost Watermark -->
              <div class="jp-main-lower">
                <!-- Left: Official 3:3.8 ID Portrait Photo + 4-digit code -->
                <div class="jp-photo-col">
                  <div class="jp-photo-frame">
                    <svg
                      v-if="isMutsumiCard && photoPose !== 'standard'"
                      class="jp-portrait-svg"
                      viewBox="0 0 256 256"
                      preserveAspectRatio="xMidYMin slice"
                      role="img"
                      :aria-label="`${activeCard.name}证件照`"
                    >
                      <image
                        :href="mutsumiExpressionSpriteUrl"
                        x="-200.53"
                        y="-6.68"
                        width="668.44"
                        height="1170.07"
                      />
                    </svg>
                    <MapCharacterAvatar
                      v-else
                      class="idcard-avatar jp-portrait-img"
                      :person-id="activeCard.id" :protagonist-id="isProtagonistId(activeCard.id) ? activeCard.id : undefined"
                      :name="activeCard.name"
                      role="img"
                      aria-hidden="false"
                      :aria-label="`${activeCard.name}证件照`"
                    />
                    <span class="jp-photo-holo-stamp" aria-hidden="true">桜</span>
                  </div>
                  <span class="jp-photo-sec-code">{{ securityFourDigits }}</span>
                </div>

                <!-- Center: Birthdate, Gender, Mayor Seal, Teal Validity Bar, Cert Slot -->
                <div class="jp-center-col">
                  <div class="jp-birth-sex-row">
                    <span class="jp-birth-text">{{ japaneseBirthLabel }}</span>
                    <div class="jp-sex-box">
                      <span class="jp-box-tag-sm">性別</span>
                      <strong>{{ activeCard.gender }}</strong>
                    </div>
                  </div>

                  <div class="jp-mayor-row">
                    <div class="jp-mayor-info">
                      <span class="jp-issue-date">{{ activeCard.issueDate.replace(/\./g, '年').replace(/年(\d+)$/, '月$1日') }}交付</span>
                      <strong class="jp-mayor-title">{{ japaneseMayorLabel }}</strong>
                    </div>
                    <!-- Official Vermilion Square Hanko Seal (朱肉公印) -->
                    <div class="jp-hanko-seal" aria-label="交付機関公印">
                      <span>{{ japaneseHankoSeal.slice(0, 3) }}</span>
                      <span>{{ japaneseHankoSeal.slice(3) }}</span>
                    </div>
                  </div>

                  <!-- Iconic Blue-Green Validity Ribbon on Japanese My Number Card -->
                  <div class="jp-validity-ribbon">
                    <span class="jp-validity-date">{{ japaneseExpiryLabel }}</span>
                    <span class="jp-validity-label">有効期限</span>
                  </div>

                  <!-- Electronic Certificate & Campus Clearance Slot -->
                  <div class="jp-cert-slot">
                    <span class="jp-cert-label">電子証明書<br />有効期限</span>
                    <span class="jp-cert-val">{{ activeCard.expiryDate.replace(/\./g, '·') }} · {{ activeCard.anchorZoneLabel }}特認</span>
                  </div>
                </div>

                <!-- Right: Laser Ghost Portrait Watermark & Vertical Notice -->
                <div class="jp-ghost-col" aria-hidden="true">
                  <div class="jp-ghost-photo">
                    <MapCharacterAvatar class="idcard-avatar" :person-id="activeCard.id" :protagonist-id="isProtagonistId(activeCard.id) ? activeCard.id : undefined" :name="activeCard.name" />
                  </div>
                  <span class="jp-jlis-micro">J-LIS</span>
                  <div class="jp-organ-box">
                    <span>特記事項</span>
                    <small>{{ activeCard.bloodType }}·{{ activeCard.zodiac }}</small>
                  </div>
                </div>
              </div>

              <!-- Bottom Pink Prismatic Security Footer -->
              <div class="jp-bottom-strip">
                <span class="jp-bottom-ministry">总务省 · 地方公共团体信息系统机构 · 学区连盟</span>
                <span class="jp-bottom-sign">自署: <strong>{{ activeCard.signatureText }}</strong></span>
              </div>
            </div>

            <!-- STAGE MODE: Japanese Livehouse / Artist Backstage PVC Pass (出演者 · 关系者证) -->
            <div v-else-if="activeCard.stageProfile" class="jp-stage-layout">
              <div class="jp-stage-top">
                <div class="jp-stage-brand">
                  <span class="jp-stage-crest">❖</span>
                  <div>
                    <strong>{{ activeCard.stageProfile.bandName }} · OFFICIAL ARTIST PASS</strong>
                    <small>TOKYO LIVEHOUSE CIRCUIT · 出演者 · 关系者特别通行证</small>
                  </div>
                </div>
                <span class="jp-stage-level">{{ activeCard.stageProfile.clearanceLevel.split(' ')[0] }}</span>
              </div>

              <div class="jp-stage-middle">
                <div class="jp-photo-frame stage">
                  <svg
                    v-if="isMutsumiCard"
                    class="jp-portrait-svg"
                    viewBox="0 0 256 256"
                    preserveAspectRatio="xMidYMin slice"
                  >
                    <image
                      :href="mutsumiExpressionSpriteUrl"
                      x="-200.53"
                      y="-6.68"
                      width="668.44"
                      height="1170.07"
                    />
                  </svg>
                  <MapCharacterAvatar v-else class="idcard-avatar jp-portrait-img" :person-id="activeCard.id" :protagonist-id="isProtagonistId(activeCard.id) ? activeCard.id : undefined" :name="activeCard.name" role="img" aria-hidden="false" :aria-label="activeCard.name" />
                </div>

                <div class="jp-stage-fields">
                  <div class="jp-stage-codename">
                    <small>STAGE ALIAS / 舞台代号</small>
                    <strong>{{ activeCard.stageProfile.stageCode }}</strong>
                    <span>{{ activeCard.nativeName }}（{{ activeCard.romanizedName }}）</span>
                  </div>
                  <dl class="jp-stage-dl">
                    <div>
                      <dt>ROLE / 担当</dt>
                      <dd>{{ activeCard.stageProfile.stageTitle }}</dd>
                    </div>
                    <div>
                      <dt>GEAR / 使用機材</dt>
                      <dd class="mono">{{ activeCard.stageProfile.instrument }}</dd>
                    </div>
                    <div>
                      <dt>PASS NO.</dt>
                      <dd class="mono">{{ activeCard.stageProfile.passSerial }}</dd>
                    </div>
                    <div>
                      <dt>FORMER</dt>
                      <dd>{{ activeCard.stageProfile.formerBand }}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div class="jp-stage-bottom">
                <span class="jp-stage-quote">{{ activeCard.stageProfile.stageQuote }}</span>
                <span class="jp-stage-sig">{{ activeCard.signatureText }}</span>
              </div>
            </div>
          </div>

          <!-- ================================================================
               BACK FACE (裏面): Japanese My Number Card Back (IC Chip + 12-Digit Number + 追記欄)
               ================================================================ -->
          <div class="jp-card-face jp-card-back">
            <div class="jp-back-pattern" aria-hidden="true"></div>
            <div class="jp-3d-glare" aria-hidden="true"></div>

            <div class="jp-back-layout">
              <!-- Top Section: Left Gold IC Chip + QR | Right 12-digit My Number & Name -->
              <div class="jp-back-top">
                <div class="jp-back-chip-area">
                  <!-- Authentic Gold ISO 7816 Contact IC Chip -->
                  <div class="jp-gold-ic-chip" aria-label="IC芯片">
                    <span></span><span></span><span></span><span></span>
                    <span></span><span></span><span></span><span></span>
                  </div>
                  <!-- Mini Verification QR Matrix -->
                  <div class="jp-qr-box" aria-hidden="true">
                    <svg viewBox="0 0 28 28">
                      <rect x="2" y="2" width="8" height="8" fill="none" stroke="#1e262c" stroke-width="2" />
                      <rect x="4" y="4" width="4" height="4" fill="#1e262c" />
                      <rect x="18" y="2" width="8" height="8" fill="none" stroke="#1e262c" stroke-width="2" />
                      <rect x="20" y="4" width="4" height="4" fill="#1e262c" />
                      <rect x="2" y="18" width="8" height="8" fill="none" stroke="#1e262c" stroke-width="2" />
                      <rect x="4" y="20" width="4" height="4" fill="#1e262c" />
                      <rect x="12" y="4" width="3" height="3" fill="#1e262c" />
                      <rect x="12" y="11" width="5" height="5" fill="#1e262c" />
                      <rect x="19" y="13" width="3" height="6" fill="#1e262c" />
                      <rect x="13" y="20" width="6" height="3" fill="#1e262c" />
                      <rect x="22" y="21" width="4" height="4" fill="#1e262c" />
                    </svg>
                  </div>
                </div>

                <div class="jp-back-number-area">
                  <div class="jp-mynumber-header">
                    <span class="jp-mynumber-title">個人番号</span>
                    <span class="jp-mynumber-sub">INDIVIDUAL NUMBER</span>
                  </div>
                  <div class="jp-mynumber-digits" aria-label="12桁個人番号">
                    <span v-for="(block, idx) in myNumberDigits" :key="idx" class="jp-digit-group">
                      {{ block }}
                    </span>
                  </div>
                  <div class="jp-back-holder-line">
                    <span>氏名: <strong>{{ activeCard.nativeName }}</strong></span>
                    <span>{{ japaneseBirthLabel.split('（')[0] }}</span>
                  </div>
                </div>
              </div>

              <!-- Middle White Box: 追記欄 (Official Endorsements & Red Hanko Stamps) -->
              <div class="jp-tsuiki-box">
                <div class="jp-tsuiki-label">追<br />記<br />欄</div>
                <ul class="jp-tsuiki-list">
                  <li v-for="item in activeCard.endorsements" :key="item.code">
                    <span class="jp-stamp-circle">検</span>
                    <div class="jp-tsuiki-text">
                      <strong>{{ item.authority }}</strong>：{{ item.scope }}
                      <small class="mono">[{{ item.code }} · {{ item.validUntil }}]</small>
                    </div>
                  </li>
                  <li>
                    <span class="jp-stamp-circle">済</span>
                    <div class="jp-tsuiki-text">
                      <strong>联络先 · 结算账户</strong>：{{ activeCard.phoneDisplay }} / {{ activeCard.appaPayHandle }}
                    </div>
                  </li>
                </ul>
              </div>

              <!-- Bottom MRZ Optical Machine Readable Strip -->
              <div class="jp-back-mrz">
                <p>{{ activeCard.mrzLine1 }}</p>
                <p>{{ activeCard.mrzLine2 }}</p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- Trait Tags & Standing Figure Toggle -->
    <div class="idcard-subbar">
      <div class="idcard-trait-list">
        <span v-for="trait in activeCard.traits" :key="trait" class="idcard-trait-chip">
          {{ trait }}
        </span>
      </div>
      <button
        v-if="isMutsumiCard"
        type="button"
        class="idcard-standing-toggle"
        @click="showStandingFigure = !showStandingFigure"
      >
        {{ showStandingFigure ? '收起全身校服立绘 ▲' : '查看全身校服立绘 ▼' }}
      </button>
    </div>

    <!-- Optional Expandable Full Standing Sprite Showcase for Wakaba Mutsumi -->
    <div v-if="isMutsumiCard && showStandingFigure" class="idcard-standing-drawer">
      <div class="idcard-standing-visual">
        <img :src="standingPreviewUrl" :alt="`${activeCard.name}月之森校服立绘`" />
      </div>
      <div class="idcard-standing-notes">
        <h5>月之森女子学园冬季校服 · 角色档案设定</h5>
        <p v-for="(para, idx) in activeCard.bioParagraphs" :key="idx">{{ para }}</p>
      </div>
    </div>

    <!-- ====================================================================
         Interactive Visual Relationship Mesh Graph (可视化人际关系网状图)
         ==================================================================== -->
    <section class="idcard-strategy-section" data-omniscient-dossier>
      <header><div><h5>全知档案 · 战略与行动</h5><small>真实世界状态，不改变人物自身认知</small></div><b>全知模式</b></header>
      <div v-if="strategyDossier.owner" class="idcard-strategy-grid">
        <article><h6>当前国策</h6><strong>{{ strategyDossier.focus?.title ?? '暂无进行中的国策' }}</strong><p v-if="strategyDossier.focus">进度 {{ strategyDossier.focus.percent }}% · {{ strategyDossier.focus.progress }}/{{ strategyDossier.focus.duration }} 分钟</p><p>控制：{{ strategyDossier.controller==='auto'?'AI 托管':'手动' }}</p><small>已完成：{{ strategyDossier.completed.join('、')||'无' }}</small></article>
        <article><h6>领导者特质</h6><p v-for="x in strategyDossier.traits" :key="x">{{ x }}</p><p v-if="!strategyDossier.traits.length">暂无</p></article>
        <article><h6>民族精神</h6><p v-for="x in strategyDossier.spirits" :key="x.title">{{ x.title }} · {{ x.expiresAt===null?'持续':strategyTime(x.expiresAt)+' 到期' }}</p><p v-if="!strategyDossier.spirits.length">暂无</p></article>
      </div>
      <p v-else>该人物尚无独立国策档案。</p>
      <article class="idcard-strategy-block"><h6>组织与职位</h6><p v-for="x in strategyDossier.organizations" :key="x.id">{{ x.kind }} · {{ x.title }} · {{ x.detail }}</p><p v-if="!strategyDossier.organizations.length">暂无组织记录</p></article>
      <details v-if="strategyDossier.owner"><summary>AI View 权重与修正来源</summary><p v-for="x in strategyDossier.weights" :key="x.title">{{ x.title }}：{{ x.value }} <small>{{ x.breakdown.map(y=>y.source+' '+y.operation+y.amount).join(' / ') }}</small></p></details>
      <details v-if="strategyDossier.owner"><summary>隐藏世界变量</summary><p v-for="[k,v] in strategyDossier.flags" :key="k">{{ k }} = {{ v }}</p><p v-for="[k,v] in strategyDossier.stats" :key="k">{{ k }} = {{ v }}</p></details>
      <article class="idcard-strategy-block"><h6>真实行动记录</h6><p v-for="x in strategyDossier.history" :key="x.id">{{ strategyTime(x.at) }} · {{ strategyKindLabel(x.kind) }} · {{ x.subject }} {{ x.note??'' }}</p><p v-for="x in strategyDossier.activity" :key="x.id">{{ strategyTime(x.at) }} · {{ x.title }} · {{ x.detail }}</p><p v-for="x in strategyDossier.beats" :key="x.id+'-'+x.text">Otherside · {{ x.text }}</p><p v-if="!strategyDossier.history.length&&!strategyDossier.activity.length&&!strategyDossier.beats.length">暂无行动记录</p></article>
    </section>

    <section class="idcard-mesh-section" aria-label="人际关系网状拓扑图">
      <header class="idcard-mesh-header">
        <div class="idcard-mesh-title-block">
          <h5>{{ activeCard.name }} · 人际羁绊网状图</h5>
          <span class="idcard-mesh-subtitle">
            好感与身份层级优先显现 · 支持滚轮/按钮放大 · 切换圈层与连线模式避免遮挡 · 当前：{{ currentLocationLabel }}
          </span>
        </div>

        <!-- Mesh Control Toolbar: Categories + Edge Mode + Zoom -->
        <div class="idcard-mesh-toolbar-wrap">
          <!-- Category Filter Bar -->
          <div class="idcard-mesh-filter-bar" role="group" aria-label="筛选关系圈层">
            <button
              type="button"
              class="idcard-mesh-filter-btn"
              :class="{ active: meshFilter === 'all' }"
              @click="meshFilter = 'all'"
            >
              全部关系
            </button>
            <button
              type="button"
              class="idcard-mesh-filter-btn family"
              :class="{ active: meshFilter === 'family' }"
              @click="meshFilter = 'family'"
            >
              至亲家庭
            </button>
            <button
              type="button"
              class="idcard-mesh-filter-btn campus"
              :class="{ active: meshFilter === 'campus' }"
              @click="meshFilter = 'campus'"
            >
              学园同窗
            </button>
            <button
              type="button"
              class="idcard-mesh-filter-btn mujica"
              :class="{ active: meshFilter === 'mujica' }"
              @click="meshFilter = 'mujica'"
            >
              Ave Mujica
            </button>
            <button
              type="button"
              class="idcard-mesh-filter-btn crychic"
              :class="{ active: meshFilter === 'crychic' }"
              @click="meshFilter = 'crychic'"
            >
              CRYCHIC
            </button>
            <button
              type="button"
              class="idcard-mesh-filter-btn legal"
              :class="{ active: meshFilter === 'legal' }"
              @click="meshFilter = 'legal'"
            >
              事务伙伴
            </button>
          </div>

          <!-- Edge Display Mode (Anti-Clutter) & Zoom Controls -->
          <div class="idcard-mesh-action-controls">
            <!-- Edge Clutter Reducer -->
            <div class="idcard-mesh-edge-mode-bar" role="group" aria-label="连线显示模式">
              <button
                type="button"
                class="idcard-mesh-mode-btn"
                :class="{ active: meshEdgeMode === 'direct' }"
                title="仅展示与持证人的直接好感连线，隐藏次级交叉线以防遮挡"
                @click="meshEdgeMode = 'direct'"
              >
                主从直连
              </button>
              <button
                type="button"
                class="idcard-mesh-mode-btn"
                :class="{ active: meshEdgeMode === 'all' }"
                title="展示全部人物交叉羁绊网线"
                @click="meshEdgeMode = 'all'"
              >
                全交叉网
              </button>
              <button
                type="button"
                class="idcard-mesh-mode-btn"
                :class="{ active: meshEdgeMode === 'focus' }"
                title="仅显示与当前选定人物相连的线"
                @click="meshEdgeMode = 'focus'"
              >
                选中聚焦
              </button>
            </div>

            <!-- Zoom & Pan Stepper -->
            <div class="idcard-mesh-zoom-bar">
              <button
                type="button"
                class="idcard-mesh-zoom-btn"
                title="放大拓扑图（亦可滚轮滑动）"
                aria-label="放大"
                @click="zoomInMesh"
              >
                +
              </button>
              <span class="idcard-mesh-zoom-scale">{{ Math.round(meshZoom * 100) }}%</span>
              <button
                type="button"
                class="idcard-mesh-zoom-btn"
                title="缩小拓扑图"
                aria-label="缩小"
                @click="zoomOutMesh"
              >
                -
              </button>
              <button
                type="button"
                class="idcard-mesh-zoom-btn reset"
                title="恢复 100% 原始缩放"
                @click="resetMeshZoom"
              >
                重置缩放
              </button>
            </div>

            <button
              type="button"
              class="idcard-mesh-reset-btn"
              title="恢复默认节点拓扑位置"
              @click="resetMeshLayout"
            >
              重置位置
            </button>
          </div>
        </div>
      </header>

      <!-- SVG Interactive Network Topology Canvas (Zoomable & Draggable) -->
      <div class="idcard-mesh-canvas-wrap" @wheel="onMeshWheel">
        <svg
          ref="svgCanvasRef"
          class="idcard-mesh-svg"
          viewBox="0 0 680 380"
          role="img"
          :aria-label="`${activeCard.name}的人际关系网状图`"
          @pointermove="moveMeshNodeDrag"
        >
          <defs>
            <radialGradient id="mesh-center-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="rgba(148, 212, 178, 0.28)" />
              <stop offset="65%" stop-color="rgba(148, 212, 178, 0.06)" />
              <stop offset="100%" stop-color="rgba(14, 24, 21, 0)" />
            </radialGradient>
          </defs>

          <!-- Zoom Transform Layer -->
          <g :transform="`scale(${meshZoom})`" transform-origin="340 190">
            <!-- Background Orbital Radar Rings -->
            <circle cx="340" cy="190" r="175" fill="url(#mesh-center-glow)" />
            <ellipse cx="340" cy="190" rx="188" ry="106" class="idcard-mesh-orbit-ring" />
            <ellipse cx="340" cy="190" rx="242" ry="136" class="idcard-mesh-orbit-ring outer" />
            <line x1="60" y1="190" x2="620" y2="190" class="idcard-mesh-axis-line" />
            <line x1="340" y1="24" x2="340" y2="356" class="idcard-mesh-axis-line" />

            <!-- Relationship Edges (Primary Spokes + Inter-Character Cross Mesh) -->
            <g class="idcard-mesh-edges">
              <g
                v-for="edge in meshEdges"
                :key="edge.id"
                class="idcard-mesh-edge-group"
                :class="[
                  `kind-${edge.kind}`,
                  `group-${edge.group}`,
                  { dimmed: !edge.isHighlighted }
                ]"
              >
                <line
                  :x1="edge.x1"
                  :y1="edge.y1"
                  :x2="edge.x2"
                  :y2="edge.y2"
                  class="idcard-mesh-edge-line"
                  :stroke-width="edge.kind === 'primary' ? Math.max(2.0, edge.affinity / 26) : 1.3"
                />
                <!-- Edge Midpoint Label Pill -->
                <g
                  v-if="edge.kind === 'primary' || edge.isHighlighted"
                  :transform="`translate(${edge.mx}, ${edge.my})`"
                  class="idcard-mesh-edge-badge"
                >
                  <rect
                    :x="edge.kind === 'primary' ? -34 : -42"
                    y="-9"
                    :width="edge.kind === 'primary' ? 68 : 84"
                    height="18"
                    rx="9"
                  />
                  <text x="0" y="3.5" text-anchor="middle">{{ edge.label }}</text>
                </g>
              </g>
            </g>

            <!-- Relationship Nodes (Affinity Priority Top + Avatar Center + Role Priority Bottom + Name Subordinate) -->
            <g class="idcard-mesh-nodes">
              <g
                v-for="node in meshNodes"
                :key="node.id"
                class="idcard-mesh-node"
                :class="[
                  `group-${node.group}`,
                  {
                    'is-center': node.isCenter,
                    'is-selected': selectedMeshNode?.id === node.id,
                    'is-protagonist': node.isCurrentProtagonist
                  }
                ]"
                :data-mesh-node="node.id"
                @pointerdown="startMeshNodeDrag(node, $event)"
                @pointerup="endMeshNodeDrag(node, $event)"
                @pointercancel="endMeshNodeDrag(node, $event)"
              >
                <!-- 1. Top Affinity Badge (Highest Visual Priority) -->
                <g :transform="`translate(${node.x}, ${node.y - (node.isCenter ? 36 : 28)})`" class="idcard-node-affinity-pill">
                  <rect
                    :x="node.isCenter ? -36 : -30"
                    y="-9"
                    :width="node.isCenter ? 72 : 60"
                    height="18"
                    rx="9"
                    class="idcard-mesh-affinity-bg"
                    :class="{
                      high: node.affinity >= 80,
                      mid: node.affinity >= 60 && node.affinity < 80,
                      center: node.isCenter
                    }"
                  />
                  <text x="0" y="3.5" text-anchor="middle" class="idcard-mesh-affinity-text">
                    {{ node.isCenter ? '★ 持证人' : `★ ${node.affinity}` }}
                  </text>
                </g>

                <!-- 2. Outer Pulse Halo for Center or Selected Node -->
                <circle
                  v-if="node.isCenter || selectedMeshNode?.id === node.id || node.isCurrentProtagonist"
                  :cx="node.x"
                  :cy="node.y"
                  :r="node.isCenter ? 35 : 27"
                  class="idcard-mesh-node-halo"
                />

                <!-- 3. Node Background Circle -->
                <circle
                  :cx="node.x"
                  :cy="node.y"
                  :r="node.isCenter ? 29 : 22"
                  class="idcard-mesh-node-bg"
                />

                <!-- 4. Character Portrait Image inside Node Circle -->
                <foreignObject
                  :x="node.x - (node.isCenter ? 28 : 21)"
                  :y="node.y - (node.isCenter ? 28 : 21)"
                  :width="node.isCenter ? 56 : 42"
                  :height="node.isCenter ? 56 : 42"
                  class="idcard-mesh-avatar"
                >
                  <MapCharacterAvatar class="idcard-avatar" :person-id="node.id" :protagonist-id="isProtagonistId(node.id) ? node.id : undefined" :name="node.name" />
                </foreignObject>

                <!-- 5. Node Border Ring -->
                <circle
                  :cx="node.x"
                  :cy="node.y"
                  :r="node.isCenter ? 28.5 : 21.5"
                  class="idcard-mesh-node-ring"
                />

                <!-- 6. Identity / Role Priority Pill (Below Avatar, Bold Prominent) -->
                <g :transform="`translate(${node.x}, ${node.y + (node.isCenter ? 36 : 28)})`" class="idcard-node-role-pill">
                  <rect
                    :x="-Math.max(48, Math.min(68, node.roleLabel.length * 6.6))"
                    y="-10"
                    :width="Math.max(96, Math.min(136, node.roleLabel.length * 13.2))"
                    height="20"
                    rx="6"
                    class="idcard-mesh-role-bg"
                    :class="{ 'is-selected': selectedMeshNode?.id === node.id }"
                  />
                  <text x="0" y="3.5" text-anchor="middle" class="idcard-mesh-role-text">
                    {{ node.roleLabel.length > 9 ? node.roleLabel.slice(0, 8) + '…' : node.roleLabel }}
                  </text>
                </g>

                <!-- 7. Character Name (Subordinate Secondary Label) -->
                <g :transform="`translate(${node.x}, ${node.y + (node.isCenter ? 57 : 49)})`" class="idcard-node-name-pill">
                  <text x="0" y="3" text-anchor="middle" class="idcard-mesh-name-subtext">
                    {{ node.name }}
                  </text>
                </g>
              </g>
            </g>
          </g>
        </svg>

        <!-- Mesh Legend Bar -->
        <div class="idcard-mesh-legend">
          <span class="legend-item"><i class="dot family"></i> 至亲家庭</span>
          <span class="legend-item"><i class="dot campus"></i> 学园同窗</span>
          <span class="legend-item"><i class="dot mujica"></i> Ave Mujica</span>
          <span class="legend-item"><i class="dot crychic"></i> CRYCHIC · MyGO</span>
          <span class="legend-item"><i class="dot legal"></i> 事务伙伴</span>
          <span class="legend-item"><i class="line-sample direct"></i> 直连好感度</span>
          <span class="legend-item"><i class="line-sample cross"></i> 交叉羁绊网</span>
        </div>
      </div>

      <!-- Selected Node & Current Protagonist Inspector Dossier -->
      <div class="idcard-dossier-grid">
        <!-- Left: Selected Node Details in the Mesh -->
        <section v-if="selectedMeshNode" class="idcard-dossier-card">
          <div class="idcard-dossier-head">
            <div class="idcard-inspector-person">
              <MapCharacterAvatar
                class="idcard-avatar idcard-inspector-avatar"
                :person-id="selectedMeshNode.id" :protagonist-id="isProtagonistId(selectedMeshNode.id) ? selectedMeshNode.id : undefined"
                :name="selectedMeshNode.name"
                role="img"
                aria-hidden="false"
                :aria-label="selectedMeshNode.name"
              />
              <div>
                <h5>
                  {{ selectedMeshNode.name }}
                  <small class="idcard-inspector-group">{{ selectedMeshNode.groupLabel }}</small>
                </h5>
                <p class="idcard-bond-role">{{ selectedMeshNode.roleLabel }}</p>
              </div>
            </div>
            <span class="idcard-affinity-pill">{{ selectedMeshNode.statusTag }}</span>
          </div>

          <div
            v-if="!selectedMeshNode.isCenter"
            class="idcard-affinity-bar"
            role="progressbar"
            :aria-valuenow="selectedMeshNode.affinity"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="idcard-affinity-fill"
              :style="{ width: `${Math.min(100, Math.max(8, selectedMeshNode.affinity))}%` }"
            ></div>
          </div>

          <p class="idcard-bond-note">{{ selectedMeshNode.note }}</p>

          <!-- Cross-connections of this selected node -->
          <div v-if="selectedNodeConnectedEdges.length" class="idcard-node-cross-list">
            <span
              v-for="link in selectedNodeConnectedEdges"
              :key="link.id"
              class="idcard-node-cross-chip"
              :class="{ cross: link.kind === 'cross' }"
              @click="selectedMeshNodeId = link.otherId"
            >
              ↔ {{ link.otherName }}（{{ link.label }}）
            </span>
          </div>

          <div v-if="selectedMeshNode.hasCard && !selectedMeshNode.isCenter" class="idcard-inspector-actions">
            <button
              type="button"
              class="idcard-jump-card-btn"
              @click="jumpToNodeIdentityCard(selectedMeshNode)"
            >
              切换至「{{ selectedMeshNode.name }}」的个人番号卡 ↗
            </button>
          </div>
        </section>

        <!-- Right: Current Protagonist Relationship Card -->
        <section class="idcard-dossier-card">
          <div class="idcard-dossier-head">
            <h5>与当前视角主角（{{ protagonistBond.protagonistName }}）的实时羁绊</h5>
            <span class="idcard-affinity-pill">{{ protagonistBond.statusTag }}</span>
          </div>
          <p class="idcard-bond-role">{{ protagonistBond.roleLabel }}</p>
          <div
            class="idcard-affinity-bar"
            role="progressbar"
            :aria-valuenow="protagonistBond.affinity"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="idcard-affinity-fill"
              :style="{ width: `${Math.min(100, Math.max(8, protagonistBond.affinity))}%` }"
            ></div>
          </div>
          <p class="idcard-bond-note">{{ protagonistBond.note }}</p>
        </section>
      </div>
    </section>

    <!-- Action Bar: Register Contact, Travel to Library, Compose Greeting/SMS -->
    <footer class="idcard-action-footer">
      <p v-if="actionFeedback" class="idcard-feedback-banner" role="status">
        {{ actionFeedback }}
      </p>
      <div class="idcard-action-buttons">
        <button
          v-if="activeCard.id !== activeProtagonist"
          type="button"
          class="idcard-action-btn primary"
          :disabled="protagonistBond.isRegisteredContact"
          @click="registerMutsumiToContacts"
        >
          {{ protagonistBond.isRegisteredContact ? '✓ 已收录至人际名录' : '＋ 收录至人际名录' }}
        </button>

        <button
          type="button"
          class="idcard-action-btn"
          :disabled="isAtAnchorZone"
          @click="travelToAnchorLocation"
        >
          {{ isAtAnchorZone ? `当前已在${activeCard.anchorZoneLabel}` : `前往常驻地 · ${activeCard.anchorZoneLabel}` }}
        </button>

        <button
          v-if="activeCard.id !== activeProtagonist"
          type="button"
          class="idcard-action-btn"
          @click="composeGreetingToCardHolder"
        >
          当面搭话
        </button>

        <button
          v-if="activeCard.id !== activeProtagonist"
          type="button"
          class="idcard-action-btn"
          @click="composeSmsToCardHolder"
        >
          发送短信
        </button>
      </div>
    </footer>
  </section>
</template>
