<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ShellActions, ShellModel } from './types';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import {
  applyDraftToScrapbook,
  createInitialScrapbook,
  exportAllScrapbooksBackup,
  hydratePersonScrapbook,
  importScrapbookBackupIntoStore,
  listScrapbookSummaries,
  notebookPeople,
  saveScrapbook,
  type NotebookPerson,
  type SavedScrapbook,
  type ScrapbookSummary,
} from '../runtime/notebook';
import {
  angled3DPose,
  backCoverPose,
  BOOK_CLIPS,
  BOOK_THEMES,
  buildLiveWorldSnapshot,
  CHARM_MOUNTS,
  clamp,
  CLIPPING_PRESETS,
  closedFrontPose,
  COVER_STYLES,
  createBlankSpread,
  createItemFromPreset,
  derivePageHeaderFromSnapshot,
  DESK_MOODS,
  DOODLE_PRESETS,
  ensureScrapbookFontsLoaded,
  EXTENDED_CHARM_PRESETS,
  extractWorldMemories,
  flatEditPose,
  fitBookScale,
  FONT_STYLES,
  fontStyleCssVars,
  INK_COLORS,
  isBackFacing,
  MOOD_OPTIONS,
  moveItemLayer,
  PAPER_STYLES,
  PEN_MARK_PRESETS,
  PRESSED_PRESETS,
  resolveFontStyleId,
  resolveInkColor,
  rotateBookPose,
  STAMP_PRESETS,
  stepCharmPendulum,
  STICKER_DATA_URLS,
  STICKER_DEFS,
  STICKY_NOTE_PRESETS,
  TITLE_MARKS,
  updatePlacedItem,
  WASHI_TAPES,
  WAX_SEAL_PRESETS,
  WEATHER_OPTIONS,
  zoomBookPose,
  type BookPose,
  type BookSpread,
  type BookThemeId,
  type FontStyleId,
  type InkColorId,
  type PlacedScrapItem,
  type ScrapItemType,
  type TitleMarkId,
} from '../runtime/notebook-scrapbook';
import ScrapbookItemView from './ScrapbookItemView.vue';
import ScrapbookCharmView from './ScrapbookCharmView.vue';

const props = defineProps<{ model: ShellModel; actions?: ShellActions }>();

const scope = computed(() => props.model.memoryScope || (props.model.mode === 'demo' ? 'demo:notebook' : ''));
const people = computed<NotebookPerson[]>(() => notebookPeople(props.model.state));
const currentProtagonist = computed(() => activeProtagonist(props.model.state));

const search = ref('');
const selectedPersonId = ref<string>(currentProtagonist.value);
const summaries = ref<Map<string, ScrapbookSummary>>(new Map());
const book = ref<SavedScrapbook | null>(null);
const loading = ref(false);
const saving = ref(false);
const dirty = ref(false);
const notice = ref('');
const statusText = ref('');

const activeSide = ref<'cover' | 'left' | 'right'>('left');
const selectedItemId = ref('');
const activeTab = ref<'write' | 'stickers' | 'world' | 'inspect'>('write');
const deskMood = ref<'day' | 'lamp' | 'night'>('day');
const pose = ref<BookPose>(flatEditPose());
const viewLocked = ref(false);
const bookGliding = ref(false);

const composeHint = ref('');
const composeSide = ref<'left' | 'right'>('right');
const composing = ref(false);

const flipActive = ref(false);
const flipAngle = ref(0);
const flipFrontSide = ref<BookSpread['right'] | null>(null);
const flipBackSide = ref<BookSpread['left'] | null>(null);
const flipPaperStyle = ref('lined');

const charmAngle = ref(0);
const charmVel = ref(0);
const charmTilt = ref(0);

const stageViewport = ref<HTMLElement>();
const bookScale = ref(0.86);

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let flipTimer: ReturnType<typeof setTimeout> | undefined;
let glideTimer: ReturnType<typeof setTimeout> | undefined;
let charmRaf: number | undefined;
let charmLastTs = 0;
let resizeObs: ResizeObserver | undefined;
let loadSeq = 0;

let stageDrag: {
  pointerId: number;
  startX: number;
  startY: number;
  basePose: BookPose;
} | undefined;

let itemDrag: {
  pointerId: number;
  itemId: string;
  side: 'cover' | 'left' | 'right';
  spreadId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  moved: boolean;
} | undefined;

const filteredPeople = computed(() => {
  const q = search.value.trim().toLowerCase();
  return q
    ? people.value.filter(p => p.name.toLowerCase().includes(q) || p.group.includes(q))
    : people.value;
});

const selectedPerson = computed(() =>
  people.value.find(p => p.id === selectedPersonId.value) ?? people.value[0],
);
const isOwnBook = computed(() => selectedPerson.value?.id === currentProtagonist.value);

const theme = computed(() => BOOK_THEMES[book.value?.themeId ?? 'sage'] ?? BOOK_THEMES.sage);
const currentClip = computed(() => BOOK_CLIPS.find(c => c.id === book.value?.clipId) ?? BOOK_CLIPS[0]);
const spreads = computed(() => book.value?.spreads ?? []);
const activeSpreadIndex = computed(() =>
  clamp(book.value?.activeSpreadIndex ?? 0, 0, Math.max(0, spreads.value.length - 1)),
);
const activeSpread = computed(() => spreads.value[activeSpreadIndex.value] ?? createBlankSpread(1));

const coverItems = computed(() => book.value?.coverItems ?? []);
const leftItems = computed(() => activeSpread.value.items.filter(item => item.side === 'left'));
const rightItems = computed(() => activeSpread.value.items.filter(item => item.side === 'right'));

const selectedItem = computed<PlacedScrapItem | null>(() => {
  if (!selectedItemId.value || !book.value) return null;
  const fromCover = book.value.coverItems.find(it => it.id === selectedItemId.value);
  if (fromCover) return fromCover;
  return activeSpread.value.items.find(it => it.id === selectedItemId.value) ?? null;
});

const liveSnapshot = computed(() => buildLiveWorldSnapshot(props.model.state as unknown as Record<string, unknown>));
const worldMemories = computed(() => extractWorldMemories(liveSnapshot.value));
const worldHeader = computed(() => derivePageHeaderFromSnapshot(liveSnapshot.value));

const backFacing = computed(() => isBackFacing(pose.value.yaw));

const themeCssVars = computed(() => ({
  '--book-cover': theme.value.coverColor,
  '--book-accent': theme.value.coverAccent,
  '--book-spine': theme.value.spineColor,
  '--book-metal': theme.value.metalColor,
  '--book-ink': theme.value.inkColor,
  '--book-ribbon': theme.value.ribbonColor,
  '--book-liner': theme.value.linerColor,
}));

const MARK_TINT_SWATCHES = [
  { hex: '#c94a3c', label: '朱红' },
  { hex: '#345f9e', label: '群青' },
  { hex: '#4a644f', label: '苔绿' },
  { hex: '#b8762c', label: '琥珀' },
  { hex: '#b55678', label: '莓粉' },
  { hex: '#593e6d', label: '暮紫' },
  { hex: '#f4cf53', label: '暖黄荧光' },
  { hex: '#78cfa0', label: '薄荷高光' },
  { hex: '#2e2924', label: '炭黑' },
] as const;

interface TitleMarkSvgDef {
  viewBox: string;
  paths: Array<{ d: string; strokeWidth: number; strokeOpacity: number; useHighlight?: boolean }>;
}

const TITLE_MARK_SHAPES: Partial<Record<TitleMarkId, TitleMarkSvgDef>> = {
  'ink-underline': {
    viewBox: '0 0 280 16',
    paths: [{ d: 'M3 9 Q135 5, 276 8', strokeWidth: 2.2, strokeOpacity: 0.85 }],
  },
  'wave-underline': {
    viewBox: '0 0 280 16',
    paths: [{ d: 'M2 9 Q14 2, 26 9 T50 9 T74 8 T98 9 T122 8 T146 9 T170 8 T194 9 T218 8 T242 9 T266 8 L277 9', strokeWidth: 2.1, strokeOpacity: 0.86 }],
  },
  'double-underline': {
    viewBox: '0 0 280 16',
    paths: [
      { d: 'M2 5 Q138 2, 276 4', strokeWidth: 2.1, strokeOpacity: 0.88 },
      { d: 'M5 11 Q140 9, 273 10', strokeWidth: 1.35, strokeOpacity: 0.72 },
    ],
  },
  'highlight-wash': {
    viewBox: '0 0 280 20',
    paths: [{ d: 'M6 10 Q140 6, 274 9', strokeWidth: 13, strokeOpacity: 0.42, useHighlight: true }],
  },
  'circle-wrap': {
    viewBox: '0 0 280 42',
    paths: [{ d: 'M14 23 C8 9, 64 3, 146 4 C230 5, 274 12, 270 23 C266 34, 212 39, 128 38 C42 37, 6 29, 20 14', strokeWidth: 2.1, strokeOpacity: 0.8 }],
  },
};

function titleMarkShape(mark?: string): TitleMarkSvgDef | null {
  if (!mark || mark === 'none') return null;
  return TITLE_MARK_SHAPES[mark as TitleMarkId] ?? null;
}

const bookDefaultFont = computed<FontStyleId>(() =>
  book.value?.fontStyle ?? (selectedPersonId.value === 'sakiko' ? 'anthropic-serif' : 'handwriting'),
);
const bookDefaultInk = computed<InkColorId>(() =>
  book.value?.inkColor ?? (selectedPersonId.value === 'sakiko' ? 'navy' : 'charcoal'),
);
const editingTargetSide = computed<'cover' | 'left' | 'right'>(() =>
  !pose.value.isOpen || activeSide.value === 'cover' ? 'cover' : activeSide.value,
);
const currentFontStyleId = computed<FontStyleId>(() => {
  if (editingTargetSide.value === 'cover') return bookDefaultFont.value;
  return resolveFontStyleId(activeSpread.value[editingTargetSide.value].fontStyle ?? '') ?? bookDefaultFont.value;
});
const currentInkColorId = computed<InkColorId>(() => {
  if (editingTargetSide.value === 'cover') return bookDefaultInk.value;
  return resolveInkColor(activeSpread.value[editingTargetSide.value].inkColor ?? '') ?? bookDefaultInk.value;
});
const styleSpreadSide = computed<'left' | 'right'>(() =>
  editingTargetSide.value === 'right' ? 'right' : 'left',
);
const currentTitleMark = computed<TitleMarkId>(() =>
  (activeSpread.value[styleSpreadSide.value].titleMark as TitleMarkId) || 'none',
);
const currentDateCircled = computed<boolean>(() =>
  Boolean(activeSpread.value[styleSpreadSide.value].dateCircled),
);

const leftPageFontId = computed<FontStyleId>(
  () => resolveFontStyleId(activeSpread.value.left.fontStyle ?? '') ?? bookDefaultFont.value,
);
const rightPageFontId = computed<FontStyleId>(
  () => resolveFontStyleId(activeSpread.value.right.fontStyle ?? '') ?? bookDefaultFont.value,
);

const coverStyleVars = computed(() => fontStyleCssVars(bookDefaultFont.value, bookDefaultInk.value));
const leftPageStyleVars = computed(() =>
  fontStyleCssVars(leftPageFontId.value, activeSpread.value.left.inkColor || bookDefaultInk.value),
);
const rightPageStyleVars = computed(() =>
  fontStyleCssVars(rightPageFontId.value, activeSpread.value.right.inkColor || bookDefaultInk.value),
);
const flipFrontStyleVars = computed(() =>
  fontStyleCssVars(flipFrontSide.value?.fontStyle || bookDefaultFont.value, flipFrontSide.value?.inkColor || bookDefaultInk.value),
);
const flipBackStyleVars = computed(() =>
  fontStyleCssVars(flipBackSide.value?.fontStyle || bookDefaultFont.value, flipBackSide.value?.inkColor || bookDefaultInk.value),
);

function setActiveFontStyle(id: FontStyleId) {
  if (!book.value) return;
  if (editingTargetSide.value === 'cover') {
    book.value.fontStyle = id;
  } else {
    activeSpread.value[editingTargetSide.value].fontStyle = id;
  }
  markDirty();
}

function applyFontStyleToBook(id: FontStyleId) {
  if (!book.value) return;
  book.value.fontStyle = id;
  for (const sp of book.value.spreads) {
    sp.left.fontStyle = id;
    sp.right.fontStyle = id;
  }
  markDirty();
}

function setActiveInkColor(id: InkColorId) {
  if (!book.value) return;
  if (editingTargetSide.value === 'cover') {
    book.value.inkColor = id;
  } else {
    activeSpread.value[editingTargetSide.value].inkColor = id;
  }
  markDirty();
}

function setActiveTitleMark(id: TitleMarkId) {
  ensureOpenSpreadForAction();
  const side = styleSpreadSide.value;
  activeSpread.value[side].titleMark = id;
  activeSide.value = side;
  markDirty();
}

function toggleActiveDateCircle() {
  ensureOpenSpreadForAction();
  const side = styleSpreadSide.value;
  activeSpread.value[side].dateCircled = !activeSpread.value[side].dateCircled;
  activeSide.value = side;
  markDirty();
}

function recomputeBookScale() {
  const el = stageViewport.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  bookScale.value = fitBookScale(pose.value, rect.width, rect.height);
}

watch(pose, () => { recomputeBookScale(); }, { deep: true });

function nudgeCharm(strength = 18) {
  charmVel.value += strength;
  charmTilt.value = clamp(Math.abs(strength) * 0.45, 2, 16);
  startCharmLoop();
}

function startCharmLoop() {
  if (charmRaf !== undefined || typeof requestAnimationFrame === 'undefined') return;
  charmLastTs = 0;
  const tick = (ts: number) => {
    const dt = charmLastTs ? (ts - charmLastTs) / 1000 : 0.016;
    charmLastTs = ts;
    const bias = pose.value.isOpen ? -pose.value.yaw * 0.08 : -pose.value.yaw * 0.14;
    const next = stepCharmPendulum(
      { angle: charmAngle.value, vel: charmVel.value, tilt: charmTilt.value },
      dt,
      bias,
    );
    charmAngle.value = next.angle;
    charmVel.value = next.vel;
    charmTilt.value = next.tilt;
    if (next.settled) {
      charmRaf = undefined;
      return;
    }
    charmRaf = requestAnimationFrame(tick);
  };
  charmRaf = requestAnimationFrame(tick);
}

function glideToPose(nextPose: BookPose) {
  clearTimeout(glideTimer);
  bookGliding.value = true;
  pose.value = nextPose;
  nudgeCharm(nextPose.isOpen ? -24 : 22);
  glideTimer = setTimeout(() => { bookGliding.value = false; }, 540);
}

async function refreshSummaries() {
  if (!scope.value) return;
  try {
    summaries.value = await listScrapbookSummaries(scope.value);
  } catch { /* Non-fatal summary badge failure */ }
}

async function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  if (!scope.value || !book.value || !dirty.value) return;
  saving.value = true;
  try {
    const saved = await saveScrapbook(scope.value, book.value);
    book.value = saved;
    dirty.value = false;
    statusText.value = '已永久保存';
    await refreshSummaries();
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '保存手账失败';
  } finally {
    saving.value = false;
  }
}

function markDirty(immediate = false) {
  if (!book.value) return;
  dirty.value = true;
  statusText.value = '待保存…';
  if (saveTimer) clearTimeout(saveTimer);
  if (immediate) {
    void flushSave();
    return;
  }
  saveTimer = setTimeout(() => { void flushSave(); }, 280);
}

async function loadPersonBook(personId: string) {
  const seq = ++loadSeq;
  if (!scope.value || !personId) return;
  await flushSave();
  itemDrag = undefined;
  selectedItemId.value = '';
  loading.value = true;
  notice.value = '';
  try {
    const personName = people.value.find(p => p.id === personId)?.name;
    const loaded = await hydratePersonScrapbook(scope.value, props.model.state, personId, personName);
    if (seq !== loadSeq) return;
    book.value = loaded;
    dirty.value = false;
    statusText.value = '已同步存档';
    activeSide.value = pose.value.isOpen ? 'left' : 'cover';
    await refreshSummaries();
    await nextTick();
    recomputeBookScale();
  } catch (error) {
    if (seq !== loadSeq) return;
    const personName = people.value.find(p => p.id === personId)?.name ?? '手账';
    book.value = createInitialScrapbook(scope.value || 'fallback', personId, personName, props.model.state);
    notice.value = error instanceof Error ? error.message : '加载手账失败';
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

async function selectPerson(personId: string) {
  if (personId === selectedPersonId.value && book.value) return;
  selectedPersonId.value = personId;
  composeSide.value = 'right';
  await loadPersonBook(personId);
}

watch([scope, () => props.model.notebookRevision], () => {
  void loadPersonBook(selectedPersonId.value);
});

onMounted(() => {
  ensureScrapbookFontsLoaded(stageViewport.value?.ownerDocument ?? document);
  if (!people.value.some(p => p.id === selectedPersonId.value)) {
    selectedPersonId.value = people.value[0]?.id ?? 'soyo';
  }
  void loadPersonBook(selectedPersonId.value);
  if (typeof ResizeObserver !== 'undefined' && stageViewport.value) {
    resizeObs = new ResizeObserver(recomputeBookScale);
    resizeObs.observe(stageViewport.value);
  }
  recomputeBookScale();
});

onBeforeUnmount(() => {
  void flushSave();
  clearTimeout(saveTimer);
  clearTimeout(flipTimer);
  clearTimeout(glideTimer);
  if (charmRaf !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(charmRaf);
  resizeObs?.disconnect();
});

function ensureOpenSpreadForAction(): boolean {
  if (!pose.value.isOpen) {
    glideToPose(angled3DPose());
    if (activeSide.value === 'cover') activeSide.value = 'left';
  }
  return true;
}

function flipToSpread(targetIndex: number) {
  if (!book.value || flipActive.value) return;
  const max = Math.max(0, book.value.spreads.length - 1);
  const clamped = clamp(targetIndex, 0, max);
  if (clamped === activeSpreadIndex.value) return;

  itemDrag = undefined;
  selectedItemId.value = '';
  const dir = clamped > activeSpreadIndex.value ? 'next' : 'prev';
  const currentSp = activeSpread.value;
  const nextSp = book.value.spreads[clamped];
  flipPaperStyle.value = currentSp.paperStyle;

  if (dir === 'next') {
    flipFrontSide.value = { ...currentSp.right };
    flipBackSide.value = { ...nextSp.left };
    flipAngle.value = 0;
  } else {
    flipFrontSide.value = { ...nextSp.right };
    flipBackSide.value = { ...currentSp.left };
    flipAngle.value = -180;
  }
  flipActive.value = true;
  nudgeCharm(dir === 'next' ? -20 : 20);

  requestAnimationFrame(() => {
    flipAngle.value = dir === 'next' ? -180 : 0;
  });

  clearTimeout(flipTimer);
  flipTimer = setTimeout(() => {
    if (book.value) {
      book.value.activeSpreadIndex = clamped;
      markDirty();
    }
    flipActive.value = false;
  }, 430);
}

function openFromCover() {
  glideToPose(angled3DPose());
  if (activeSide.value === 'cover') activeSide.value = 'left';
}

function stepPrevPage() {
  if (!pose.value.isOpen) {
    openFromCover();
    return;
  }
  if (activeSpreadIndex.value > 0) flipToSpread(activeSpreadIndex.value - 1);
  else glideToPose(closedFrontPose());
}

function stepNextPage() {
  if (!pose.value.isOpen) {
    openFromCover();
    return;
  }
  if (activeSpreadIndex.value < spreads.value.length - 1) flipToSpread(activeSpreadIndex.value + 1);
}

function addSpreadAndOpen() {
  if (!book.value) return;
  const nextIndex = book.value.spreads.length + 1;
  const blank = createBlankSpread(nextIndex);
  blank.left.date = worldHeader.value.dateText;
  blank.left.weather = worldHeader.value.weatherText;
  blank.left.mood = worldHeader.value.moodText;
  blank.right.date = worldHeader.value.dateText;
  blank.right.weather = worldHeader.value.weatherText;
  book.value.spreads.push(blank);
  const newIdx = book.value.spreads.length - 1;
  if (!pose.value.isOpen) glideToPose(angled3DPose());
  book.value.activeSpreadIndex = newIdx;
  activeSide.value = 'left';
  markDirty(true);
}

function removeCurrentSpread() {
  if (!book.value || book.value.spreads.length <= 1) {
    notice.value = '至少需保留一跨页手账，可直接清空或编辑文字。';
    return;
  }
  const idx = activeSpreadIndex.value;
  book.value.spreads.splice(idx, 1);
  book.value.activeSpreadIndex = clamp(idx - 1, 0, book.value.spreads.length - 1);
  selectedItemId.value = '';
  markDirty(true);
}

function setTheme(themeId: BookThemeId) {
  if (!book.value) return;
  const t = BOOK_THEMES[themeId];
  book.value.themeId = themeId;
  book.value.coverStyle = t.defaultCoverStyle;
  book.value.charmId = t.defaultCharmId;
  book.value.clipId = t.defaultClipId;
  markDirty();
}

function addPresetItem(
  type: ScrapItemType,
  presetId: string,
  extra?: Partial<Pick<PlacedScrapItem, 'caption' | 'sourceRef' | 'dataPayload'>>,
) {
  if (!book.value) return;
  const targetSide = pose.value.isOpen
    ? (activeSide.value === 'cover' ? 'left' : activeSide.value)
    : activeSide.value;
  const existing = targetSide === 'cover' ? book.value.coverItems : activeSpread.value.items;
  const placed = createItemFromPreset(type, presetId, targetSide, existing, extra);
  if (targetSide === 'cover') book.value.coverItems.push(placed);
  else activeSpread.value.items.push(placed);
  selectedItemId.value = placed.id;
  activeTab.value = 'inspect';
  markDirty();
}

function applyWorldArtifact(
  art: {
    itemType: ScrapItemType;
    presetId: string;
    caption: string;
    sourceRef: PlacedScrapItem['sourceRef'];
    dataPayload: Record<string, unknown>;
  },
) {
  ensureOpenSpreadForAction();
  const side = activeSide.value === 'cover' ? 'right' : activeSide.value;
  activeSide.value = side;
  addPresetItem(art.itemType, art.presetId, {
    caption: art.caption,
    sourceRef: art.sourceRef,
    dataPayload: art.dataPayload,
  });
  notice.value = `已将「${art.caption.slice(0, 18)}」贴入${side === 'left' ? '左页' : '右页'}！`;
}

function syncHeaderFromWorld(sideKey: 'left' | 'right') {
  if (!book.value) return;
  const side = activeSpread.value[sideKey];
  side.date = worldHeader.value.dateText;
  side.weather = worldHeader.value.weatherText;
  side.mood = worldHeader.value.moodText;
  if (!side.title.trim()) side.title = worldHeader.value.suggestedTitle;
  markDirty();
}

function mutateSelectedItem(patch: Partial<PlacedScrapItem>) {
  if (!book.value || !selectedItem.value) return;
  const id = selectedItem.value.id;
  if (selectedItem.value.side === 'cover') {
    book.value.coverItems = updatePlacedItem(book.value.coverItems, id, patch);
  } else {
    activeSpread.value.items = updatePlacedItem(activeSpread.value.items, id, patch);
  }
  markDirty();
}

function moveSelectedToSide(dest: 'cover' | 'left' | 'right') {
  if (!book.value || !selectedItem.value || selectedItem.value.side === dest) return;
  const current = selectedItem.value;
  const copy: PlacedScrapItem = { ...current, side: dest, x: clamp(current.x, 14, 86), y: clamp(current.y, 14, 86) };
  if (current.side === 'cover') {
    book.value.coverItems = book.value.coverItems.filter(it => it.id !== current.id);
  } else {
    activeSpread.value.items = activeSpread.value.items.filter(it => it.id !== current.id);
  }
  if (dest === 'cover') book.value.coverItems.push(copy);
  else activeSpread.value.items.push(copy);
  activeSide.value = dest;
  markDirty();
}

function reorderSelectedItem(dir: 'front' | 'back') {
  if (!book.value || !selectedItem.value) return;
  const id = selectedItem.value.id;
  if (selectedItem.value.side === 'cover') {
    book.value.coverItems = moveItemLayer(book.value.coverItems, id, dir);
  } else {
    activeSpread.value.items = moveItemLayer(activeSpread.value.items, id, dir);
  }
  markDirty();
}

function duplicateSelectedItem() {
  if (!book.value || !selectedItem.value) return;
  const src = selectedItem.value;
  const clone: PlacedScrapItem = {
    ...src,
    id: `it-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    x: clamp(src.x + 6, 10, 90),
    y: clamp(src.y + 6, 10, 90),
    zIndex: src.zIndex + 1,
  };
  if (clone.side === 'cover') book.value.coverItems.push(clone);
  else activeSpread.value.items.push(clone);
  selectedItemId.value = clone.id;
  markDirty();
}

function deleteSelectedItem() {
  if (!book.value || !selectedItem.value) return;
  const id = selectedItem.value.id;
  if (selectedItem.value.side === 'cover') {
    book.value.coverItems = book.value.coverItems.filter(it => it.id !== id);
  } else {
    activeSpread.value.items = activeSpread.value.items.filter(it => it.id !== id);
  }
  selectedItemId.value = '';
  markDirty(true);
}

async function askModelCompose() {
  if (!book.value || composing.value || !props.actions?.composeNotebookPage) return;
  ensureOpenSpreadForAction();
  const targetPersonId = book.value.personId;
  const targetSpreadIdx = activeSpreadIndex.value;
  const targetSide = composeSide.value;
  composing.value = true;
  notice.value = `正在请 ${selectedPerson.value?.name ?? '对方'} 书写并装饰这一页…`;
  try {
    const draft = await props.actions.composeNotebookPage({
      personId: targetPersonId,
      spreadIndex: targetSpreadIdx,
      targetSide,
      instruction: composeHint.value.trim() || undefined,
    });
    if (!draft || !book.value || book.value.personId !== targetPersonId) return;
    const updated = applyDraftToScrapbook(book.value, draft, props.model.state, {
      spreadIndex: targetSpreadIdx,
      targetSide,
      applyCoverDecorations: false,
    });
    book.value = updated;
    activeSide.value = targetSide;
    composeHint.value = '';
    markDirty(true);
    notice.value = `已写好并装饰「${draft.title}」，所有文字和贴纸均可继续调整。`;
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '代写未能完成，请稍后重试。';
  } finally {
    composing.value = false;
  }
}

function cycleHeaderOption(sideKey: 'left' | 'right', field: 'weather' | 'mood') {
  const list = field === 'weather' ? WEATHER_OPTIONS : MOOD_OPTIONS;
  const cur = activeSpread.value[sideKey][field];
  const next = list[(list.indexOf(cur) + 1) % list.length];
  activeSpread.value[sideKey][field] = next;
  markDirty();
}

/* Pointer interactions: stage 3D rotation & item dragging */
function onStagePointerDown(e: PointerEvent) {
  if (viewLocked.value || e.button !== 0) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, button, .nb-scrap-item, .nb-charm-swing-arm')) return;
  stageDrag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, basePose: { ...pose.value } };
  (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
}

function onStagePointerMove(e: PointerEvent) {
  if (itemDrag && itemDrag.pointerId === e.pointerId) {
    const spreadId = activeSpread.value.id;
    if (itemDrag.side !== 'cover' && itemDrag.spreadId !== spreadId) {
      itemDrag = undefined;
      return;
    }
    const dx = e.clientX - itemDrag.startClientX;
    const dy = e.clientY - itemDrag.startClientY;
    if (!itemDrag.moved && Math.hypot(dx, dy) > 3) itemDrag.moved = true;
    if (!itemDrag.moved) return;
    const effScale = Math.max(0.28, bookScale.value);
    const cosY = Math.max(0.35, Math.abs(Math.cos((pose.value.yaw * Math.PI) / 180)));
    const nextX = clamp(itemDrag.startX + (dx / (356 * effScale * cosY)) * 100, 6, 94);
    const nextY = clamp(itemDrag.startY + (dy / (492 * effScale)) * 100, 6, 94);
    mutateSelectedItem({ x: Math.round(nextX * 10) / 10, y: Math.round(nextY * 10) / 10 });
    return;
  }
  if (stageDrag && stageDrag.pointerId === e.pointerId) {
    const dx = e.clientX - stageDrag.startX;
    const dy = e.clientY - stageDrag.startY;
    pose.value = rotateBookPose(stageDrag.basePose, dx, dy);
  }
}

function onStagePointerUp(e: PointerEvent) {
  if (itemDrag && itemDrag.pointerId === e.pointerId) {
    if (itemDrag.moved) markDirty(true);
    itemDrag = undefined;
  }
  if (stageDrag && stageDrag.pointerId === e.pointerId) {
    stageDrag = undefined;
  }
}

function onStageWheel(e: WheelEvent) {
  if (viewLocked.value) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest('textarea')) return;
  e.preventDefault();
  pose.value = zoomBookPose(pose.value, e.deltaY < 0 ? 1.07 : 0.93);
}

function startItemDrag(e: PointerEvent, item: PlacedScrapItem) {
  if (e.button !== 0) return;
  selectedItemId.value = item.id;
  activeSide.value = item.side;
  activeTab.value = 'inspect';
  itemDrag = {
    pointerId: e.pointerId,
    itemId: item.id,
    side: item.side,
    spreadId: activeSpread.value.id,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startX: item.x,
    startY: item.y,
    moved: false,
  };
  (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
}

function selectPageSide(side: 'left' | 'right' | 'cover') {
  activeSide.value = side;
  composeSide.value = side === 'right' ? 'right' : 'left';
}

function placedItemStyle(item: PlacedScrapItem) {
  return {
    left: `${item.x}%`,
    top: `${item.y}%`,
    opacity: String(item.opacity ?? 1),
    zIndex: String(item.zIndex ?? 1),
    transform: `translate(-50%, -50%) rotate(${item.rotate ?? 0}deg) scale(${item.scale ?? 1}) scaleX(${item.flipX ? -1 : 1})`,
  };
}

async function downloadBackup() {
  if (!scope.value) return;
  await flushSave();
  try {
    const content = await exportAllScrapbooksBackup(scope.value);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `unread-city-scrapbooks-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice.value = '已导出所有人物的手账与贴纸立体备份。';
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '导出备份失败';
  }
}

async function uploadBackup(event: Event) {
  const inputEl = event.target as HTMLInputElement;
  const file = inputEl.files?.[0];
  inputEl.value = '';
  if (!file || !scope.value) return;
  try {
    const res = await importScrapbookBackupIntoStore(scope.value, await file.text(), props.model.state, selectedPersonId.value);
    await loadPersonBook(selectedPersonId.value);
    await refreshSummaries();
    notice.value = `导入成功：${res.importedBooks} 本立体手账、${res.importedPages} 条新增手账页。`;
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '导入手账备份失败';
  }
}
</script>

<template>
  <section class="uc-notebook" data-notebook>
    <!-- Header: Character Book Switcher & Actions -->
    <header class="nb-shell-header">
      <div class="nb-person-strip" aria-label="人物手账列表">
        <input
          v-model="search"
          type="search"
          class="nb-search-mini"
          placeholder="搜索人物…"
          aria-label="查找人物手账"
          data-notebook-search
        />
        <div class="nb-people-scroll">
          <button
            v-for="person in filteredPeople"
            :key="person.id"
            type="button"
            class="nb-person-pill"
            :class="{ active: selectedPersonId === person.id }"
            :data-notebook-person="person.id"
            @click="selectPerson(person.id)"
          >
            <span>{{ person.name }}</span>
            <span class="nb-group-tag">{{ person.id === currentProtagonist ? '本人' : person.group }}</span>
            <span v-if="summaries.get(person.id)?.filledPages" class="nb-count-badge">
              {{ summaries.get(person.id)?.filledPages }}
            </span>
          </button>
        </div>
      </div>

      <div class="nb-toolbar-actions">
        <button type="button" class="nb-pill-btn" :class="{ active: pose.isOpen && Math.abs(pose.yaw) > 2 }" @click="glideToPose(angled3DPose())">3D 斜视</button>
        <button type="button" class="nb-pill-btn" :class="{ active: pose.isOpen && Math.abs(pose.yaw) <= 2 }" @click="glideToPose(flatEditPose())">平铺编辑</button>
        <button type="button" class="nb-pill-btn" :class="{ active: !pose.isOpen && !backFacing }" @click="glideToPose(closedFrontPose())">合上封面</button>
        <button type="button" class="nb-pill-btn" :class="{ active: backFacing }" @click="glideToPose(backCoverPose())">看封底</button>
        <button type="button" class="nb-pill-btn" :class="{ 'soft-active': viewLocked }" @click="viewLocked = !viewLocked">
          {{ viewLocked ? '解锁视角' : '锁定视角' }}
        </button>
        <button type="button" class="nb-pill-btn" :disabled="!scope || saving" data-notebook-export @click="downloadBackup">导出</button>
        <label class="nb-pill-btn" style="display:inline-flex;align-items:center">
          导入<input type="file" accept=".json,application/json" :disabled="!scope || saving" data-notebook-import @change="uploadBackup" />
        </label>
        <span class="nb-save-pill" :class="{ 'is-dirty': dirty }" data-scrapbook-save-state>
          {{ saving ? '保存中…' : dirty ? '待保存' : (statusText || '已永久保存') }}
        </span>
      </div>
    </header>

    <div class="nb-status-banner">
      <span>
        <strong>{{ selectedPerson?.name }}的手账本</strong>
        · {{ isOwnBook ? '本人持有的日常记录' : '已存入书架的同行者手账（翻阅与修改均永久留存）' }}
        · 共 {{ spreads.length }} 跨页 · {{ worldHeader.dateText }}
      </span>
      <span v-if="notice" role="status">{{ notice }}</span>
    </div>

    <!-- Main 2-Column 3D Workbench -->
    <div class="nb-studio-grid">
      <!-- 3D Book Stage -->
      <section
        class="nb-stage-card"
        :class="{ 'is-locked': viewLocked }"
        :data-desk-mood="deskMood"
        data-scrapbook-stage
        @pointerdown="onStagePointerDown"
        @pointermove="onStagePointerMove"
        @pointerup="onStagePointerUp"
        @pointercancel="onStagePointerUp"
        @wheel="onStageWheel"
      >
        <div class="nb-stage-hud-top">
          <div class="nb-hud-badge-row">
            <span class="nb-glass-chip">
              {{ !pose.isOpen ? '封面 / 封底' : `第 ${activeSpreadIndex + 1} / ${spreads.length} 跨页` }}
            </span>
            <button
              v-for="m in DESK_MOODS"
              :key="m.id"
              type="button"
              class="nb-pill-btn"
              :class="{ active: deskMood === m.id }"
              @click="deskMood = m.id as 'day' | 'lamp' | 'night'"
            >
              {{ m.short }}
            </button>
          </div>
          <div class="nb-hud-badge-row">
            <button type="button" class="nb-pill-btn" @click="stepPrevPage">◀ 上一页</button>
            <button type="button" class="nb-pill-btn" @click="stepNextPage">下一页 ▶</button>
            <button type="button" class="nb-pill-btn warm-cta" data-scrapbook-new-spread @click="addSpreadAndOpen">+ 新建跨页</button>
          </div>
        </div>

        <div ref="stageViewport" class="nb-stage-viewport">
          <div class="nb-book-anchor" :style="themeCssVars">
            <div
              v-if="book"
              class="nb-book-solid"
              :class="{ 'is-gliding': bookGliding }"
              :style="{
                transform: `scale(${bookScale}) rotateX(${pose.pitch}deg) rotateY(${pose.yaw}deg)`,
              }"
            >
              <!-- Spine Side Wall & Ribbon Tail -->
              <div class="nb-spine-side-wall">
                <span class="nb-spine-title">{{ book.coverTitle }}</span>
              </div>
              <div class="nb-spine-open-back" />
              <div class="nb-ribbon-tail" />

              <!-- Hanging Spring Charm -->
              <ScrapbookCharmView
                :charm-id="book.charmId"
                :mount-id="book.charmMount"
                :angle="charmAngle"
                :tilt="charmTilt"
                @nudge="nudgeCharm(26)"
              />

              <!-- Right Base Wing (Right Page + Back Cover + Edges) -->
              <div class="nb-book-right-wing">
                <div class="nb-block-edge nb-paper-top" />
                <div class="nb-block-edge nb-paper-bottom" />
                <div class="nb-block-edge nb-paper-fore" />

                <!-- Binder Clip -->
                <div
                  v-if="currentClip.id !== 'none'"
                  class="nb-top-book-clip"
                  :style="{ '--clip-color': currentClip.color, '--clip-wire': currentClip.wire } as Record<string, string>"
                >
                  <div class="nb-clip-wire-arch" />
                  <div class="nb-clip-jaw">CLIP</div>
                </div>

                <!-- Right Spread Page -->
                <div
                  class="nb-spread-page nb-right-spread-page"
                  :class="[`nb-paper-${activeSpread.paperStyle}`, { 'nb-page-active-ring': activeSide === 'right' && pose.isOpen }]"
                  :style="rightPageStyleVars"
                  data-spread-side="right"
                  :data-font-style="rightPageFontId"
                  :data-title-mark="activeSpread.right.titleMark || 'none'"
                  :data-date-circled="activeSpread.right.dateCircled ? '1' : '0'"
                  @pointerdown="selectPageSide('right')"
                >
                  <div class="nb-page-header">
                    <div class="nb-page-meta-row">
                      <div class="nb-date-wrap" :class="{ 'is-circled': Boolean(activeSpread.right.dateCircled) }">
                        <input
                          v-model="activeSpread.right.date"
                          type="text"
                          class="nb-page-date-input"
                          aria-label="右页日期"
                          data-page-date="right"
                          @input="markDirty()"
                        />
                        <svg
                          v-if="activeSpread.right.dateCircled"
                          class="nb-date-circle-svg"
                          viewBox="0 0 154 34"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M12 19 C8 8, 44 3, 86 4 C128 5, 148 11, 146 19 C144 27, 108 31, 62 30 C21 29, 6 22, 16 11"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-opacity="0.82"
                          />
                        </svg>
                      </div>
                      <div class="nb-badge-row">
                        <button type="button" class="nb-mini-chip-btn" @click="cycleHeaderOption('right', 'weather')">{{ activeSpread.right.weather }}</button>
                        <button type="button" class="nb-mini-chip-btn" @click="cycleHeaderOption('right', 'mood')">{{ activeSpread.right.mood }}</button>
                      </div>
                    </div>
                    <div class="nb-title-wrap" :class="`nb-tmark-${activeSpread.right.titleMark || 'none'}`">
                      <input
                        v-model="activeSpread.right.title"
                        type="text"
                        maxlength="60"
                        placeholder="右页标题…"
                        aria-label="右页标题"
                        class="nb-page-title-input"
                        data-page-title="right"
                        @input="markDirty()"
                      />
                      <svg
                        v-if="titleMarkShape(activeSpread.right.titleMark)"
                        class="nb-title-mark-svg"
                        :viewBox="titleMarkShape(activeSpread.right.titleMark)!.viewBox"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path
                          v-for="(seg, si) in titleMarkShape(activeSpread.right.titleMark)!.paths"
                          :key="si"
                          :d="seg.d"
                          fill="none"
                          :stroke="seg.useHighlight ? '#f2cd4f' : 'currentColor'"
                          :stroke-width="seg.strokeWidth"
                          stroke-linecap="round"
                          :stroke-opacity="seg.strokeOpacity"
                        />
                      </svg>
                    </div>
                  </div>
                  <textarea
                    v-model="activeSpread.right.body"
                    maxlength="2000"
                    placeholder="写下这一页的故事、备忘或随想…"
                    aria-label="右页正文"
                    class="nb-page-body-input"
                    data-page-body="right"
                    @input="markDirty()"
                  />
                  <div class="nb-page-items-layer">
                    <div
                      v-for="item in rightItems"
                      :key="item.id"
                      class="nb-scrap-item"
                      :class="{ 'is-selected': selectedItemId === item.id }"
                      :style="placedItemStyle(item)"
                      :data-placed-item="item.id"
                      @pointerdown.stop="startItemDrag($event, item)"
                    >
                      <ScrapbookItemView :item="item" />
                    </div>
                  </div>
                </div>

                <!-- Back Cover Face -->
                <div class="nb-cover-face nb-cover-back">
                  <div class="nb-cover-footer"><span>{{ theme.backMark }}</span><span>ARCHIVE</span></div>
                  <div class="nb-back-pocket">
                    <div class="nb-back-pocket-ticket">保留好每一次见面与车票存根</div>
                    <small style="opacity:.75">{{ selectedPerson?.name }} · 个人藏本</small>
                  </div>
                </div>
              </div>

              <!-- Animated 3D Page Flip Sheet -->
              <div
                v-if="flipActive && flipFrontSide && flipBackSide"
                class="nb-page-flipper"
                :style="{ transform: `translateZ(5.5px) rotateY(${flipAngle}deg)` }"
              >
                <div
                  class="nb-spread-page nb-flip-face-front"
                  :class="`nb-paper-${flipPaperStyle}`"
                  :style="flipFrontStyleVars"
                  :data-font-style="flipFrontSide.fontStyle || bookDefaultFont"
                >
                  <div class="nb-page-header">
                    <div class="nb-title-wrap nb-flip-title-preview" :class="`nb-tmark-${flipFrontSide.titleMark || 'none'}`">
                      <strong class="nb-page-title-preview">{{ flipFrontSide.title || '……' }}</strong>
                      <svg
                        v-if="titleMarkShape(flipFrontSide.titleMark)"
                        class="nb-title-mark-svg"
                        :viewBox="titleMarkShape(flipFrontSide.titleMark)!.viewBox"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path
                          v-for="(seg, si) in titleMarkShape(flipFrontSide.titleMark)!.paths"
                          :key="si"
                          :d="seg.d"
                          fill="none"
                          :stroke="seg.useHighlight ? '#f2cd4f' : 'currentColor'"
                          :stroke-width="seg.strokeWidth"
                          stroke-linecap="round"
                          :stroke-opacity="seg.strokeOpacity"
                        />
                      </svg>
                    </div>
                    <small class="nb-page-date-preview" :class="{ 'is-circled': Boolean(flipFrontSide.dateCircled) }">{{ flipFrontSide.date }}</small>
                  </div>
                  <div class="nb-flip-preview-body">{{ flipFrontSide.body }}</div>
                </div>
                <div
                  class="nb-spread-page nb-flip-face-back"
                  :class="`nb-paper-${flipPaperStyle}`"
                  :style="flipBackStyleVars"
                  :data-font-style="flipBackSide.fontStyle || bookDefaultFont"
                >
                  <div class="nb-page-header">
                    <div class="nb-title-wrap nb-flip-title-preview" :class="`nb-tmark-${flipBackSide.titleMark || 'none'}`">
                      <strong class="nb-page-title-preview">{{ flipBackSide.title || '……' }}</strong>
                      <svg
                        v-if="titleMarkShape(flipBackSide.titleMark)"
                        class="nb-title-mark-svg"
                        :viewBox="titleMarkShape(flipBackSide.titleMark)!.viewBox"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path
                          v-for="(seg, si) in titleMarkShape(flipBackSide.titleMark)!.paths"
                          :key="si"
                          :d="seg.d"
                          fill="none"
                          :stroke="seg.useHighlight ? '#f2cd4f' : 'currentColor'"
                          :stroke-width="seg.strokeWidth"
                          stroke-linecap="round"
                          :stroke-opacity="seg.strokeOpacity"
                        />
                      </svg>
                    </div>
                    <small class="nb-page-date-preview" :class="{ 'is-circled': Boolean(flipBackSide.dateCircled) }">{{ flipBackSide.date }}</small>
                  </div>
                  <div class="nb-flip-preview-body">{{ flipBackSide.body }}</div>
                </div>
              </div>

              <!-- Hinged Left Wing (Front Cover + Left Spread Page) -->
              <div
                class="nb-book-hinge"
                :class="{ 'is-open': pose.isOpen }"
                :style="{
                  transform: `translateZ(3.5px) rotateY(${pose.isOpen ? -180 : 0}deg)`,
                }"
              >
                <div class="nb-block-edge nb-hinge-top" />
                <div class="nb-block-edge nb-hinge-bottom" />
                <div class="nb-block-edge nb-hinge-fore" />

                <!-- Front Cover Exterior -->
                <div
                  class="nb-cover-face nb-cover-front"
                  :class="{ 'cover-active-ring': activeSide === 'cover' && !pose.isOpen }"
                  :data-cover-style="book.coverStyle"
                  @pointerdown="activeSide = 'cover'"
                >
                  <div class="nb-cover-deco-layer">
                    <div class="nb-cover-ribbon-sash" />
                    <div v-if="book.coverStyle === 'classic'" class="nb-cover-deco-classic" />
                    <div v-else-if="book.coverStyle === 'plaid'" class="nb-cover-deco-plaid" />
                    <div v-else-if="book.coverStyle === 'postage'" class="nb-cover-deco-postage" />
                    <svg v-else class="nb-cover-deco-botanical" viewBox="0 0 310 440" fill="none" stroke="currentColor" stroke-width="1.3">
                      <rect x="8" y="8" width="294" height="424" rx="10" stroke-opacity="0.45" />
                      <path d="M26 42 Q42 26 62 34 M284 42 Q268 26 248 34 M26 398 Q42 414 62 406 M284 398 Q268 414 248 406" />
                    </svg>
                  </div>
                  <span class="nb-corner-guard nb-cg-tr" />
                  <span class="nb-corner-guard nb-cg-br" />
                  <span class="nb-corner-guard nb-cg-tl" />
                  <span class="nb-corner-guard nb-cg-bl" />

                  <div class="nb-cover-plaque" :style="coverStyleVars" :data-font-style="bookDefaultFont">
                    <div class="nb-cover-plaque-tag">{{ theme.coverTag }}</div>
                    <input
                      v-model="book.coverTitle"
                      type="text"
                      maxlength="40"
                      class="nb-cover-title-input"
                      aria-label="封面名称"
                      @input="markDirty()"
                    />
                    <input
                      v-model="book.coverSub"
                      type="text"
                      maxlength="48"
                      class="nb-cover-sub-input"
                      aria-label="封面副标题"
                      @input="markDirty()"
                    />
                  </div>

                  <div class="nb-cover-footer">
                    <span>{{ theme.themeLabel }}</span>
                    <button type="button" class="nb-cover-unlock-btn" data-open-from-cover @click.stop="openFromCover">打开手账 ▶</button>
                  </div>

                  <div class="nb-page-items-layer">
                    <div
                      v-for="item in coverItems"
                      :key="item.id"
                      class="nb-scrap-item"
                      :class="{ 'is-selected': selectedItemId === item.id }"
                      :style="placedItemStyle(item)"
                      :data-placed-item="item.id"
                      @pointerdown.stop="startItemDrag($event, item)"
                    >
                      <ScrapbookItemView :item="item" />
                    </div>
                  </div>
                </div>

                <!-- Magnetic Clasp -->
                <button v-if="!pose.isOpen" type="button" class="nb-book-clasp" aria-label="解开搭扣打开手账" @click.stop="openFromCover">
                  <span>翻开</span>
                </button>

                <!-- Left Spread Page (Inner Side of Front Cover Wing) -->
                <div
                  class="nb-spread-page nb-left-spread-page"
                  :class="[`nb-paper-${activeSpread.paperStyle}`, { 'nb-page-active-ring': activeSide === 'left' && pose.isOpen }]"
                  :style="leftPageStyleVars"
                  data-spread-side="left"
                  :data-font-style="leftPageFontId"
                  :data-title-mark="activeSpread.left.titleMark || 'none'"
                  :data-date-circled="activeSpread.left.dateCircled ? '1' : '0'"
                  @pointerdown="selectPageSide('left')"
                >
                  <div class="nb-page-header">
                    <div class="nb-page-meta-row">
                      <div class="nb-date-wrap" :class="{ 'is-circled': Boolean(activeSpread.left.dateCircled) }">
                        <input
                          v-model="activeSpread.left.date"
                          type="text"
                          class="nb-page-date-input"
                          aria-label="左页日期"
                          data-page-date="left"
                          @input="markDirty()"
                        />
                        <svg
                          v-if="activeSpread.left.dateCircled"
                          class="nb-date-circle-svg"
                          viewBox="0 0 154 34"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M12 19 C8 8, 44 3, 86 4 C128 5, 148 11, 146 19 C144 27, 108 31, 62 30 C21 29, 6 22, 16 11"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-opacity="0.82"
                          />
                        </svg>
                      </div>
                      <div class="nb-badge-row">
                        <button type="button" class="nb-mini-chip-btn" @click="cycleHeaderOption('left', 'weather')">{{ activeSpread.left.weather }}</button>
                        <button type="button" class="nb-mini-chip-btn" @click="cycleHeaderOption('left', 'mood')">{{ activeSpread.left.mood }}</button>
                      </div>
                    </div>
                    <div class="nb-title-wrap" :class="`nb-tmark-${activeSpread.left.titleMark || 'none'}`">
                      <input
                        v-model="activeSpread.left.title"
                        type="text"
                        maxlength="60"
                        placeholder="左页标题…"
                        aria-label="左页标题"
                        class="nb-page-title-input"
                        data-page-title="left"
                        @input="markDirty()"
                      />
                      <svg
                        v-if="titleMarkShape(activeSpread.left.titleMark)"
                        class="nb-title-mark-svg"
                        :viewBox="titleMarkShape(activeSpread.left.titleMark)!.viewBox"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path
                          v-for="(seg, si) in titleMarkShape(activeSpread.left.titleMark)!.paths"
                          :key="si"
                          :d="seg.d"
                          fill="none"
                          :stroke="seg.useHighlight ? '#f2cd4f' : 'currentColor'"
                          :stroke-width="seg.strokeWidth"
                          stroke-linecap="round"
                          :stroke-opacity="seg.strokeOpacity"
                        />
                      </svg>
                    </div>
                  </div>
                  <textarea
                    v-model="activeSpread.left.body"
                    maxlength="2000"
                    placeholder="自由书写或请角色代写这一页…"
                    aria-label="左页正文"
                    class="nb-page-body-input"
                    data-page-body="left"
                    @input="markDirty()"
                  />
                  <div class="nb-page-items-layer">
                    <div
                      v-for="item in leftItems"
                      :key="item.id"
                      class="nb-scrap-item"
                      :class="{ 'is-selected': selectedItemId === item.id }"
                      :style="placedItemStyle(item)"
                      :data-placed-item="item.id"
                      @pointerdown.stop="startItemDrag($event, item)"
                    >
                      <ScrapbookItemView :item="item" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="nb-stage-hud-bottom">
          <div class="nb-hud-badge-row">
            <button type="button" class="nb-pill-btn" :class="{ active: activeSide === 'left' }" @click="pose.isOpen || openFromCover(); selectPageSide('left')">当前编辑：左页</button>
            <button type="button" class="nb-pill-btn" :class="{ active: activeSide === 'right' }" @click="pose.isOpen || openFromCover(); selectPageSide('right')">当前编辑：右页</button>
            <button type="button" class="nb-pill-btn" :class="{ active: activeSide === 'cover' }" @click="glideToPose(closedFrontPose()); activeSide = 'cover'">编辑封面</button>
          </div>
          <div class="nb-hud-badge-row">
            <button type="button" class="nb-pill-btn" @click="pose = zoomBookPose(pose, 0.9)">缩小</button>
            <button type="button" class="nb-pill-btn" @click="pose = zoomBookPose(pose, 1.1)">放大</button>
            <button type="button" class="nb-pill-btn warn-btn" @click="removeCurrentSpread">删除本跨页</button>
          </div>
        </div>
      </section>

      <!-- Right Workshop & Co-Authoring Panel -->
      <aside class="nb-workshop-pane" aria-label="手账工坊">
        <div class="nb-tab-bar" role="tablist">
          <button type="button" class="nb-tab-btn" :class="{ active: activeTab === 'write' }" @click="activeTab = 'write'">书写外观</button>
          <button type="button" class="nb-tab-btn" :class="{ active: activeTab === 'stickers' }" @click="activeTab = 'stickers'">贴纸扩展</button>
          <button type="button" class="nb-tab-btn" :class="{ active: activeTab === 'world' }" @click="activeTab = 'world'">世界取材</button>
          <button type="button" class="nb-tab-btn" :class="{ active: activeTab === 'inspect' }" @click="activeTab = 'inspect'">元素精调</button>
        </div>

        <div v-if="book" class="nb-pane-scroll">
          <!-- TAB 1: Write, Co-author & Cover/Hardware -->
          <template v-if="activeTab === 'write'">
            <section class="nb-group-box nb-compose-card">
              <h3>角色代写与贴画本页</h3>
              <p style="font-size:11px;color:#546153">
                写完后正文、标题、天气心情与贴纸均可直接修改或拖动。
              </p>
              <div class="nb-chip-grid">
                <button type="button" class="nb-pill-btn" :class="{ active: composeSide === 'left' }" @click="composeSide = 'left'">写入左页</button>
                <button type="button" class="nb-pill-btn" :class="{ active: composeSide === 'right' }" @click="composeSide = 'right'">写入右页</button>
              </div>
              <textarea
                v-model="composeHint"
                rows="2"
                maxlength="200"
                class="nb-field-textarea"
                placeholder="给这一页指定话题或灵感线索（可留空）…"
                data-scrapbook-compose-hint
              />
              <button
                type="button"
                class="nb-pill-btn warm-cta"
                :disabled="composing || model.busy || !actions?.composeNotebookPage"
                data-scrapbook-compose
                @click="askModelCompose"
              >
                {{ composing ? '正在书写并搭配贴纸…' : `请 ${selectedPerson?.name ?? '角色'} 写并装饰${composeSide === 'left' ? '左页' : '右页'}` }}
              </button>
            </section>

            <section class="nb-group-box">
              <div class="nb-group-title-row">
                <h3>手写字体、墨色与划线（{{ editingTargetSide === 'cover' ? '封面 / 默认' : editingTargetSide === 'left' ? '左页' : '右页' }}）</h3>
                <button
                  type="button"
                  class="nb-mini-chip-btn"
                  title="将当前字体应用到整本手账"
                  @click="applyFontStyleToBook(currentFontStyleId)"
                >
                  统一整本字体
                </button>
              </div>
              <div class="nb-chip-grid">
                <button
                  v-for="fs in FONT_STYLES"
                  :key="fs.id"
                  type="button"
                  class="nb-pill-btn"
                  :class="{ active: currentFontStyleId === fs.id }"
                  :data-font-style="fs.id"
                  :style="{ fontFamily: fs.displayStack }"
                  @click="setActiveFontStyle(fs.id as FontStyleId)"
                >
                  {{ fs.label }}
                </button>
              </div>
              <div class="nb-ink-bar">
                <button
                  v-for="ic in INK_COLORS"
                  :key="ic.id"
                  type="button"
                  class="nb-pill-btn nb-ink-pill"
                  :class="{ active: currentInkColorId === ic.id }"
                  :data-ink-color="ic.id"
                  @click="setActiveInkColor(ic.id as InkColorId)"
                >
                  <span class="nb-swatch-dot" :style="{ background: ic.hex }" />
                  {{ ic.label }}
                </button>
              </div>
              <div class="nb-chip-grid">
                <button
                  v-for="tm in TITLE_MARKS"
                  :key="tm.id"
                  type="button"
                  class="nb-pill-btn"
                  :class="{ active: currentTitleMark === tm.id }"
                  :data-title-mark="tm.id"
                  @click="setActiveTitleMark(tm.id as TitleMarkId)"
                >
                  {{ tm.label }}
                </button>
                <button
                  type="button"
                  class="nb-pill-btn"
                  :class="{ active: currentDateCircled }"
                  data-toggle-date-circle
                  @click="toggleActiveDateCircle"
                >
                  {{ currentDateCircled ? '✓ 已圈出日期' : '◯ 圈出日期' }}
                </button>
              </div>
            </section>

            <section class="nb-group-box">
              <h3>纸张底纹 · 第 {{ activeSpreadIndex + 1 }} 跨页</h3>
              <div class="nb-chip-grid">
                <button
                  v-for="paper in PAPER_STYLES"
                  :key="paper.id"
                  type="button"
                  class="nb-pill-btn"
                  :class="{ active: activeSpread.paperStyle === paper.id }"
                  @click="activeSpread.paperStyle = paper.id; markDirty()"
                >
                  {{ paper.label }}
                </button>
              </div>
            </section>

            <section class="nb-group-box">
              <h3>手账本封面主题与装帧</h3>
              <div class="nb-chip-grid">
                <button
                  v-for="(t, tid) in BOOK_THEMES"
                  :key="tid"
                  type="button"
                  class="nb-pill-btn"
                  :class="{ active: book.themeId === tid }"
                  @click="setTheme(tid as BookThemeId)"
                >
                  {{ t.themeLabel }}
                </button>
              </div>
              <div class="nb-chip-grid">
                <button
                  v-for="cs in COVER_STYLES"
                  :key="cs.id"
                  type="button"
                  class="nb-pill-btn"
                  :class="{ active: book.coverStyle === cs.id }"
                  @click="book.coverStyle = cs.id; markDirty()"
                >
                  {{ cs.label }}
                </button>
              </div>
            </section>

            <section class="nb-group-box">
              <h3>挂坠饰品、挂载位与书夹</h3>
              <div class="nb-chip-grid">
                <button
                  v-for="ch in EXTENDED_CHARM_PRESETS"
                  :key="ch.id"
                  type="button"
                  class="nb-pill-btn"
                  :class="{ active: book.charmId === ch.id }"
                  @click="book.charmId = ch.id; nudgeCharm(20); markDirty()"
                >
                  {{ ch.label }}
                </button>
              </div>
              <div class="nb-chip-grid">
                <button
                  v-for="mt in CHARM_MOUNTS"
                  :key="mt.id"
                  type="button"
                  class="nb-pill-btn"
                  :class="{ active: book.charmMount === mt.id }"
                  @click="book.charmMount = mt.id; nudgeCharm(16); markDirty()"
                >
                  {{ mt.label }}
                </button>
              </div>
              <div class="nb-chip-grid">
                <button
                  v-for="cl in BOOK_CLIPS"
                  :key="cl.id"
                  type="button"
                  class="nb-pill-btn"
                  :class="{ active: book.clipId === cl.id }"
                  @click="book.clipId = cl.id; markDirty()"
                >
                  {{ cl.label }}
                </button>
              </div>
            </section>
          </template>

          <!-- TAB 2: Stickers, Tapes, Stamps, Pressed, Doodles -->
          <template v-else-if="activeTab === 'stickers'">
            <section class="nb-group-box">
              <h3>角色贴纸（点击贴入{{ activeSide === 'cover' ? '封面' : activeSide === 'left' ? '左页' : '右页' }}）</h3>
              <div class="nb-sticker-grid">
                <button
                  v-for="st in STICKER_DEFS"
                  :key="st.id"
                  type="button"
                  class="nb-sticker-card"
                  :data-add-sticker="st.id"
                  @click="addPresetItem('sticker', st.id)"
                >
                  <img :src="STICKER_DATA_URLS[st.id]" :alt="st.label" />
                  <span>{{ st.label }}</span>
                </button>
              </div>
            </section>

            <section class="nb-group-box">
              <h3>手绘笔迹 · 圈圈与下划线（可拖拽与换墨色）</h3>
              <div class="nb-chip-grid">
                <button
                  v-for="mk in PEN_MARK_PRESETS"
                  :key="mk.id"
                  type="button"
                  class="nb-pill-btn nb-mark-chip"
                  :data-add-mark="mk.id"
                  @click="addPresetItem('mark', mk.id)"
                >
                  <span class="nb-swatch-dot" :style="{ background: mk.color }" />
                  {{ mk.label }}
                </button>
              </div>
            </section>

            <section class="nb-group-box">
              <h3>和纸胶带 & 手帐印章</h3>
              <div class="nb-chip-grid">
                <button v-for="tp in WASHI_TAPES" :key="tp.id" type="button" class="nb-pill-btn" @click="addPresetItem('tape', tp.id)">+ {{ tp.label }}</button>
                <button v-for="sm in STAMP_PRESETS" :key="sm.id" type="button" class="nb-pill-btn" @click="addPresetItem('stamp', sm.id)">+ {{ sm.label }}</button>
              </div>
            </section>

            <section class="nb-group-box">
              <h3>干花标本 · 涂鸦手写 · 便签 · 火漆 · 票据</h3>
              <div class="nb-chip-grid">
                <button v-for="pr in PRESSED_PRESETS" :key="pr.id" type="button" class="nb-pill-btn" @click="addPresetItem('pressed', pr.id)">+ {{ pr.label }}</button>
                <button v-for="dd in DOODLE_PRESETS" :key="dd.id" type="button" class="nb-pill-btn" @click="addPresetItem('doodle', dd.id)">+ {{ dd.label }}</button>
                <button v-for="nt in STICKY_NOTE_PRESETS" :key="nt.id" type="button" class="nb-pill-btn" @click="addPresetItem('note', nt.id)">+ {{ nt.label }}</button>
                <button v-for="wx in WAX_SEAL_PRESETS" :key="wx.id" type="button" class="nb-pill-btn" @click="addPresetItem('wax', wx.id)">+ {{ wx.label }}</button>
                <button v-for="cl in CLIPPING_PRESETS" :key="cl.id" type="button" class="nb-pill-btn" @click="addPresetItem('clipping', cl.id)">+ {{ cl.label }}</button>
              </div>
            </section>
          </template>

          <!-- TAB 3: Live World Snapshot Sourcing -->
          <template v-else-if="activeTab === 'world'">
            <section class="nb-group-box">
              <h3>当前世界实况同步</h3>
              <p style="font-size:11.5px;color:#554c42">{{ worldHeader.statusSummary }}</p>
              <div class="nb-chip-grid">
                <button type="button" class="nb-pill-btn" @click="syncHeaderFromWorld('left')">填充左页日期与天气</button>
                <button type="button" class="nb-pill-btn" @click="syncHeaderFromWorld('right')">填充右页日期与天气</button>
              </div>
            </section>

            <section class="nb-group-box">
              <h3>生活账单与消费小票</h3>
              <p v-if="!worldMemories.receipts.length" style="font-size:11px;color:#726659">近期暂无可贴入的新消费凭条。</p>
              <article v-for="art in worldMemories.receipts" :key="art.sourceRef.id" class="nb-world-item-card">
                <header><strong>{{ art.label }}</strong><small>{{ art.badge }}</small></header>
                <span>{{ art.caption }}</span>
                <button type="button" class="nb-pill-btn" @click="applyWorldArtifact(art)">贴到当前页</button>
              </article>
            </section>

            <section class="nb-group-box">
              <h3>手机短信剪报</h3>
              <p v-if="!worldMemories.messages.length" style="font-size:11px;color:#726659">暂无可剪贴的近期对话。</p>
              <article v-for="art in worldMemories.messages" :key="art.sourceRef.id" class="nb-world-item-card">
                <header><strong>{{ art.label }}</strong><small>{{ art.badge }}</small></header>
                <span>{{ art.caption }}</span>
                <button type="button" class="nb-pill-btn" @click="applyWorldArtifact(art)">剪贴成气泡卡片</button>
              </article>
            </section>

            <section class="nb-group-box">
              <h3>足迹印章与随行日志</h3>
              <article v-for="art in [...worldMemories.stamps, ...worldMemories.notes]" :key="art.sourceRef.id" class="nb-world-item-card">
                <header><strong>{{ art.label }}</strong><small>{{ art.badge }}</small></header>
                <span>{{ art.caption }}</span>
                <button type="button" class="nb-pill-btn" @click="applyWorldArtifact(art)">盖章 / 贴便签</button>
              </article>
            </section>
          </template>

          <!-- TAB 4: Placed Item Inspector -->
          <template v-else>
            <section v-if="selectedItem" class="nb-group-box" data-scrapbook-inspector>
              <h3>已选中元素（可直接在书页拖拽移动）</h3>
              <label style="font-size:11px;color:#62564a">自定义手写附注 / 文案</label>
              <input
                type="text"
                class="nb-field-input"
                maxlength="120"
                :value="selectedItem.caption"
                aria-label="元素附注文本"
                @input="mutateSelectedItem({ caption: ($event.target as HTMLInputElement).value })"
              />
              <div v-if="selectedItem.type === 'mark'" class="nb-tint-row">
                <span class="nb-field-hint">笔迹墨色</span>
                <div class="nb-tint-swatches">
                  <button
                    v-for="sw in MARK_TINT_SWATCHES"
                    :key="sw.hex"
                    type="button"
                    class="nb-tint-dot"
                    :class="{ active: (selectedItem.tint || '') === sw.hex }"
                    :style="{ background: sw.hex }"
                    :title="sw.label"
                    :aria-label="`设置笔迹颜色：${sw.label}`"
                    :data-mark-tint="sw.hex"
                    @click="mutateSelectedItem({ tint: sw.hex })"
                  />
                </div>
              </div>
              <div class="nb-chip-grid">
                <button type="button" class="nb-pill-btn" :class="{ active: selectedItem.side === 'left' }" @click="moveSelectedToSide('left')">放左页</button>
                <button type="button" class="nb-pill-btn" :class="{ active: selectedItem.side === 'right' }" @click="moveSelectedToSide('right')">放右页</button>
                <button type="button" class="nb-pill-btn" :class="{ active: selectedItem.side === 'cover' }" @click="moveSelectedToSide('cover')">放封面</button>
              </div>
              <div class="nb-slider-row">
                <span>水平 {{ Math.round(selectedItem.x) }}%</span>
                <input type="range" min="8" max="92" step="1" :value="selectedItem.x" @input="mutateSelectedItem({ x: Number(($event.target as HTMLInputElement).value) })" />
              </div>
              <div class="nb-slider-row">
                <span>垂直 {{ Math.round(selectedItem.y) }}%</span>
                <input type="range" min="8" max="92" step="1" :value="selectedItem.y" @input="mutateSelectedItem({ y: Number(($event.target as HTMLInputElement).value) })" />
              </div>
              <div class="nb-slider-row">
                <span>缩放 {{ selectedItem.scale.toFixed(2) }}</span>
                <input type="range" min="0.45" max="1.65" step="0.05" :value="selectedItem.scale" @input="mutateSelectedItem({ scale: Number(($event.target as HTMLInputElement).value) })" />
              </div>
              <div class="nb-slider-row">
                <span>旋转 {{ Math.round(selectedItem.rotate) }}°</span>
                <input type="range" min="-45" max="45" step="1" :value="selectedItem.rotate" @input="mutateSelectedItem({ rotate: Number(($event.target as HTMLInputElement).value) })" />
              </div>
              <div class="nb-chip-grid">
                <button type="button" class="nb-pill-btn" @click="mutateSelectedItem({ flipX: !selectedItem.flipX })">水平镜像</button>
                <button type="button" class="nb-pill-btn" @click="reorderSelectedItem('front')">置顶</button>
                <button type="button" class="nb-pill-btn" @click="reorderSelectedItem('back')">置底</button>
                <button type="button" class="nb-pill-btn" @click="duplicateSelectedItem">复制</button>
                <button type="button" class="nb-pill-btn warn-btn" @click="deleteSelectedItem">删除</button>
              </div>
            </section>
            <section v-else class="nb-group-box">
              <h3>尚未选中页面素材</h3>
              <p style="font-size:11.5px;color:#665a4e">
                在手账页面上点击任意贴纸、胶带、干花、凭条或卡片，或去“贴纸扩展”/“世界取材”贴一张进来。
              </p>
            </section>
          </template>
        </div>
      </aside>
    </div>
  </section>
</template>
