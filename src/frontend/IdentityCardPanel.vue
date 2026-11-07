<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import MapCharacterAvatar from './MapCharacterAvatar.vue';
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

const selectedCardId = ref<string>(props.initialPersonId || 'bang-mutsumi');
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
  if (id === 'sakiko' || id === 'renako') return '東京都豊島区長';
  if (id === 'emma') return '東京都新宿区長';
  return '東京都文京区長';
});

const japaneseHankoSeal = computed<string>(() => {
  const id = activeCard.value.id;
  if (id === 'bang-mutsumi') return '文京区長之印';
  if (id === 'soyo') return '港区長之印';
  if (id === 'sakiko' || id === 'renako') return '豊島区長之印';
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
            <span v-if="activeCard.isExemplar" class="idcard-exemplar-tag">范例接入</span>
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

      <!-- Character Roster Tabs -->
      <nav class="idcard-roster-bar" aria-label="切换证件持有人">
        <button
          v-for="item in cardCatalog"
          :key="item.id"
          type="button"
          class="idcard-roster-chip"
          :class="{
            active: item.id === activeCard.id,
            exemplar: item.isExemplar
          }"
          @click="selectCard(item.id)"
        >
          <span class="idcard-roster-dot" :class="{ mutsumi: item.id === 'bang-mutsumi' }"></span>
          <span class="idcard-roster-name">{{ item.name }}</span>
          <span v-if="item.isExemplar" class="idcard-roster-badge">范例</span>
          <span v-else-if="item.id === activeProtagonist" class="idcard-roster-badge self">当前视角</span>
        </button>
      </nav>
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
    <section class="idcard-mesh-section" aria-label="人际关系网状拓扑图">
      <header class="idcard-mesh-header">
        <div class="idcard-mesh-title-block">
          <h5>{{ activeCard.name }} · 人际羁绊网状图</h5>
          <span class="idcard-mesh-subtitle">
            点击节点检视羁绊详情 · 拖动节点可自由调整网状布局 · 当前区域：{{ currentLocationLabel }}
          </span>
        </div>
        <div class="idcard-mesh-filter-bar" role="group" aria-label="筛选关系圈层">
          <button
            type="button"
            class="idcard-mesh-filter-btn"
            :class="{ active: meshFilter === 'all' }"
            @click="meshFilter = 'all'"
          >
            全部关系网
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
            CRYCHIC · MyGO
          </button>
          <button
            type="button"
            class="idcard-mesh-filter-btn campus"
            :class="{ active: meshFilter === 'campus' }"
            @click="meshFilter = 'campus'"
          >
            大学城日常
          </button>
          <button
            type="button"
            class="idcard-mesh-reset-btn"
            title="恢复默认环状拓扑位置"
            @click="resetMeshLayout"
          >
            重置布局
          </button>
        </div>
      </header>

      <!-- SVG Interactive Network Topology Canvas -->
      <div class="idcard-mesh-canvas-wrap">
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
                :stroke-width="edge.kind === 'primary' ? Math.max(1.8, edge.affinity / 28) : 1.4"
              />
              <!-- Edge Midpoint Label Pill -->
              <g
                v-if="edge.kind === 'primary' || edge.isHighlighted"
                :transform="`translate(${edge.mx}, ${edge.my})`"
                class="idcard-mesh-edge-badge"
              >
                <rect
                  :x="edge.kind === 'primary' ? -30 : -42"
                  y="-9"
                  :width="edge.kind === 'primary' ? 60 : 84"
                  height="18"
                  rx="9"
                />
                <text x="0" y="3.5" text-anchor="middle">{{ edge.label }}</text>
              </g>
            </g>
          </g>

          <!-- Relationship Nodes (Avatars + Halo Rings + Labels) -->
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
              <!-- Outer Pulse Halo for Center or Selected Node -->
              <circle
                v-if="node.isCenter || selectedMeshNode?.id === node.id || node.isCurrentProtagonist"
                :cx="node.x"
                :cy="node.y"
                :r="node.isCenter ? 35 : 27"
                class="idcard-mesh-node-halo"
              />

              <!-- Node Background Circle -->
              <circle
                :cx="node.x"
                :cy="node.y"
                :r="node.isCenter ? 29 : 22"
                class="idcard-mesh-node-bg"
              />

              <!-- Character Portrait Image inside Node Circle -->
              <foreignObject
                :x="node.x - (node.isCenter ? 28 : 21)"
                :y="node.y - (node.isCenter ? 28 : 21)"
                :width="node.isCenter ? 56 : 42"
                :height="node.isCenter ? 56 : 42"
                class="idcard-mesh-avatar"
              >
                <MapCharacterAvatar class="idcard-avatar" :person-id="node.id" :protagonist-id="isProtagonistId(node.id) ? node.id : undefined" :name="node.name" />
              </foreignObject>

              <!-- Node Border Ring -->
              <circle
                :cx="node.x"
                :cy="node.y"
                :r="node.isCenter ? 28.5 : 21.5"
                class="idcard-mesh-node-ring"
              />

              <!-- Node Name Pill Below Circle -->
              <g :transform="`translate(${node.x}, ${node.y + (node.isCenter ? 41 : 33)})`">
                <rect x="-44" y="-10" width="88" height="20" rx="6" class="idcard-mesh-node-label-bg" />
                <text x="0" y="3.5" text-anchor="middle" class="idcard-mesh-node-name">
                  {{ node.name }}
                </text>
              </g>
            </g>
          </g>
        </svg>

        <!-- Mesh Legend Bar -->
        <div class="idcard-mesh-legend">
          <span class="legend-item"><i class="dot mujica"></i> Ave Mujica</span>
          <span class="legend-item"><i class="dot crychic"></i> CRYCHIC · MyGO!!!!!</span>
          <span class="legend-item"><i class="dot campus"></i> 大学城日常</span>
          <span class="legend-item"><i class="line-sample cross"></i> 人物间交叉羁绊网线</span>
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
