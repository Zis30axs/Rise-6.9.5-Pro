/**
 * Shared 3D Scrapbook runtime adapter for Unread City.
 * Bundles local character stickers offline for Vite/Lite builds and connects
 * live WorldState snapshots with persistent per-character 3D scrapbooks.
 */
import mygoMUrl from '../../assets/stickers/mygo/mygo-m.png?inline';
import mygoYUrl from '../../assets/stickers/mygo/mygo-y.png?inline';
import mygoGUrl from '../../assets/stickers/mygo/mygo-g.png?inline';
import mygoOUrl from '../../assets/stickers/mygo/mygo-o.png?inline';
import mygoExclamationUrl from '../../assets/stickers/mygo/mygo-exclamation.png?inline';
import chibi01Url from '../../assets/stickers/chibi-wave2-20261114/chibi-01.png?inline';
import chibi02Url from '../../assets/stickers/chibi-wave2-20261114/chibi-02.png?inline';
import chibi03Url from '../../assets/stickers/chibi-wave2-20261114/chibi-03.png?inline';
import chibi04Url from '../../assets/stickers/chibi-wave2-20261114/chibi-04.png?inline';
import chibi05Url from '../../assets/stickers/chibi-wave2-20261114/chibi-05.png?inline';
import chibi06Url from '../../assets/stickers/chibi-wave2-20261114/chibi-06.png?inline';
import chibi07Url from '../../assets/stickers/chibi-wave2-20261114/chibi-07.png?inline';
import chibi08Url from '../../assets/stickers/chibi-wave2-20261114/chibi-08.png?inline';
import anthropicSerifDisplayUrl from '../../assets/fonts/anthropic-serif/anthropic_serif_display.ttf?inline';
import anthropicSerifDisplayItalicUrl from '../../assets/fonts/anthropic-serif/anthropic_serif_display_italic.ttf?inline';
import anthropicSerifTextUrl from '../../assets/fonts/anthropic-serif/anthropic_serif_text.ttf?inline';

import {
  BOOK_SPEC,
  BOOK_THEMES,
  PAPER_STYLES,
  FONT_STYLES,
  INK_COLORS,
  TITLE_MARKS,
  PEN_MARK_PRESETS,
  WEATHER_OPTIONS,
  MOOD_OPTIONS,
  STICKER_DEFS,
  PRESSED_PRESETS,
  DOODLE_PRESETS,
  DESK_MOODS,
  WASHI_TAPES,
  STAMP_PRESETS,
  CLIPPING_PRESETS,
  STICKY_NOTE_PRESETS,
  WAX_SEAL_PRESETS,
  CHARM_PRESETS,
  CHARM_MOUNTS,
  BOOK_CLIPS,
  COVER_STYLES,
  WORLD_WEATHER_META,
  resolveCharmAnchor,
  stepCharmPendulum,
  clamp,
  angled3DPose,
  flatEditPose,
  closedFrontPose,
  backCoverPose,
  rotateBookPose,
  zoomBookPose,
  fitBookScale,
  isBackFacing,
  isFlatEnough,
  buildDefaultCoverItemsByTheme,
  buildDefaultSpreadsByTheme,
  createBlankSpread,
  createItemFromPreset,
  updatePlacedItem,
  moveItemLayer,
  formatWorldCalendarDay,
  adaptWorldStateToSnapshot,
  derivePageHeaderFromSnapshot,
  extractWorldMemories,
  exportNotebookPagesCompat,
  type BookThemeId,
  type BookPose,
  type BookTheme,
  type SpreadSideContent,
  type PlacedScrapItem,
  type BookSpread,
  type ScrapbookWorldSnapshot,
  type ExtractedWorldArtifact,
} from '../../scripts/scrapbook-demo-core.mjs';

export {
  BOOK_SPEC,
  BOOK_THEMES,
  PAPER_STYLES,
  FONT_STYLES,
  INK_COLORS,
  TITLE_MARKS,
  PEN_MARK_PRESETS,
  WEATHER_OPTIONS,
  MOOD_OPTIONS,
  STICKER_DEFS,
  PRESSED_PRESETS,
  DOODLE_PRESETS,
  DESK_MOODS,
  WASHI_TAPES,
  STAMP_PRESETS,
  CLIPPING_PRESETS,
  STICKY_NOTE_PRESETS,
  WAX_SEAL_PRESETS,
  CHARM_PRESETS,
  CHARM_MOUNTS,
  BOOK_CLIPS,
  COVER_STYLES,
  WORLD_WEATHER_META,
  resolveCharmAnchor,
  stepCharmPendulum,
  clamp,
  angled3DPose,
  flatEditPose,
  closedFrontPose,
  backCoverPose,
  rotateBookPose,
  zoomBookPose,
  fitBookScale,
  isBackFacing,
  isFlatEnough,
  buildDefaultCoverItemsByTheme,
  buildDefaultSpreadsByTheme,
  createBlankSpread,
  createItemFromPreset,
  updatePlacedItem,
  moveItemLayer,
  formatWorldCalendarDay,
  adaptWorldStateToSnapshot,
  derivePageHeaderFromSnapshot,
  extractWorldMemories,
  exportNotebookPagesCompat,
};

export type {
  BookThemeId,
  BookPose,
  BookTheme,
  SpreadSideContent,
  PlacedScrapItem,
  BookSpread,
  ScrapbookWorldSnapshot,
  ExtractedWorldArtifact,
};

export type ScrapItemType = PlacedScrapItem['type'];

export const STICKER_DATA_URLS: Readonly<Record<string, string>> = Object.freeze({
  'mygo-m': mygoMUrl,
  'mygo-y': mygoYUrl,
  'mygo-g': mygoGUrl,
  'mygo-o': mygoOUrl,
  'mygo-exclamation': mygoExclamationUrl,
  'chibi-01': chibi01Url,
  'chibi-02': chibi02Url,
  'chibi-03': chibi03Url,
  'chibi-04': chibi04Url,
  'chibi-05': chibi05Url,
  'chibi-06': chibi06Url,
  'chibi-07': chibi07Url,
  'chibi-08': chibi08Url,
});

export interface ExtendedCharmPreset {
  readonly id: string;
  readonly label: string;
  readonly kind: 'none' | 'svg' | 'acrylic';
  readonly chain: string;
  readonly metal: string;
  readonly accent: string;
  readonly stickerId?: string;
}

export const EXTENDED_CHARM_PRESETS: readonly ExtendedCharmPreset[] = Object.freeze([
  ...CHARM_PRESETS.map(item => ({
    ...item,
    kind: item.kind as 'none' | 'svg',
  })),
  ...STICKER_DEFS.map(sticker => ({
    id: `acrylic-${sticker.id}`,
    label: `亚克力 · ${sticker.label}`,
    kind: 'acrylic' as const,
    chain: sticker.group === 'band' ? 'brass' : 'silver',
    metal: sticker.group === 'band' ? '#d2b47c' : '#cbb6e2',
    accent: sticker.group === 'band' ? '#88a88b' : '#b79cd6',
    stickerId: sticker.id,
  })),
]);

const VALID_THEME_IDS = new Set<string>(Object.keys(BOOK_THEMES));
const VALID_PAPER_IDS = new Set<string>(PAPER_STYLES.map(p => p.id));
const VALID_FONT_IDS = new Set<string>(FONT_STYLES.map(f => f.id));
const VALID_INK_IDS = new Set<string>(INK_COLORS.map(c => c.id));
const VALID_TITLE_MARK_IDS = new Set<string>(TITLE_MARKS.map(t => t.id));
const VALID_COVER_IDS = new Set<string>(COVER_STYLES.map(c => c.id));
const VALID_CLIP_IDS = new Set<string>(BOOK_CLIPS.map(c => c.id));
const VALID_MOUNT_IDS = new Set<string>(CHARM_MOUNTS.map(m => m.id));
const VALID_CHARM_IDS = new Set<string>(EXTENDED_CHARM_PRESETS.map(c => c.id));

const PRESET_LIST_BY_TYPE: Readonly<Record<string, ReadonlyArray<{ id: string; label: string }>>> = {
  sticker: STICKER_DEFS,
  tape: WASHI_TAPES,
  stamp: STAMP_PRESETS,
  clipping: CLIPPING_PRESETS,
  note: STICKY_NOTE_PRESETS,
  wax: WAX_SEAL_PRESETS,
  pressed: PRESSED_PRESETS,
  doodle: DOODLE_PRESETS,
  mark: PEN_MARK_PRESETS,
};

export type FontStyleId = 'handwriting' | 'casual-pen' | 'anthropic-serif' | 'editorial-type' | 'clean-print';
export type TitleMarkId = 'none' | 'ink-underline' | 'wave-underline' | 'double-underline' | 'highlight-wash' | 'circle-wrap';
export type InkColorId = 'charcoal' | 'sepia' | 'navy' | 'forest' | 'crimson' | 'violet';

export const SCRAPBOOK_FONT_FACES_CSS = [
  `@font-face { font-family: 'Anthropic Serif Display'; src: url("${anthropicSerifDisplayUrl}") format('truetype'); font-weight: 100 900; font-style: normal; font-display: swap; }`,
  `@font-face { font-family: 'Anthropic Serif Display'; src: url("${anthropicSerifDisplayItalicUrl}") format('truetype'); font-weight: 100 900; font-style: italic; font-display: swap; }`,
  `@font-face { font-family: 'Anthropic Serif Text'; src: url("${anthropicSerifTextUrl}") format('truetype'); font-weight: 100 900; font-style: normal; font-display: swap; }`,
  `@font-face { font-family: 'Anthropic Serif Text'; src: url("${anthropicSerifDisplayItalicUrl}") format('truetype'); font-weight: 100 900; font-style: italic; font-display: swap; }`,
].join('\n');

const loadedDocs = new WeakSet<Document>();

/** Register bundled offline Anthropic Serif font faces in the host Document so ShadowRoot resolves them cleanly. */
export function ensureScrapbookFontsLoaded(doc?: Document | null): void {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  if (!targetDoc || loadedDocs.has(targetDoc)) return;
  loadedDocs.add(targetDoc);
  try {
    if (targetDoc.head && !targetDoc.querySelector('style[data-uc-scrapbook-fonts]')) {
      const style = targetDoc.createElement('style');
      style.setAttribute('data-uc-scrapbook-fonts', '1');
      style.textContent = SCRAPBOOK_FONT_FACES_CSS;
      targetDoc.head.appendChild(style);
    }
    if (typeof FontFace !== 'undefined' && targetDoc.fonts) {
      const specs: Array<[string, string, FontFaceDescriptors]> = [
        ['Anthropic Serif Display', anthropicSerifDisplayUrl, { style: 'normal', weight: '300 700' }],
        ['Anthropic Serif Display', anthropicSerifDisplayItalicUrl, { style: 'italic', weight: '300 700' }],
        ['Anthropic Serif Text', anthropicSerifTextUrl, { style: 'normal', weight: '300 700' }],
        ['Anthropic Serif Text', anthropicSerifDisplayItalicUrl, { style: 'italic', weight: '300 700' }],
      ];
      for (const [family, url, desc] of specs) {
        try {
          const face = new FontFace(family, `url("${url}")`, desc);
          targetDoc.fonts.add(face);
          void face.load().catch(() => {});
        } catch { /* Ignore non-browser font loader errors */ }
      }
    }
  } catch { /* Safe noop in non-DOM test runtimes */ }
}

export function isValidFontStyle(id: unknown): id is FontStyleId {
  return typeof id === 'string' && VALID_FONT_IDS.has(id);
}

export function resolveFontStyleId(raw: string): FontStyleId | null {
  const value = raw.trim();
  if (!value) return null;
  if (VALID_FONT_IDS.has(value)) return value as FontStyleId;
  const lower = value.toLowerCase();
  if (lower.includes('anthropic') || value.includes('衬线') || lower.includes('祥子')) return 'anthropic-serif';
  const byLabel = FONT_STYLES.find(f => f.label === value || f.label.includes(value) || value.includes(f.label));
  return byLabel ? (byLabel.id as FontStyleId) : null;
}

export function isValidInkColor(id: unknown): id is InkColorId {
  return typeof id === 'string' && VALID_INK_IDS.has(id);
}

export function resolveInkColor(raw: string): InkColorId | null {
  const value = raw.trim();
  if (!value) return null;
  if (VALID_INK_IDS.has(value)) return value as InkColorId;
  const byHexOrLabel = INK_COLORS.find(c => c.hex.toLowerCase() === value.toLowerCase() || c.label.includes(value) || value.includes(c.label));
  return byHexOrLabel ? (byHexOrLabel.id as InkColorId) : null;
}

export function isValidTitleMark(id: unknown): id is TitleMarkId {
  return typeof id === 'string' && VALID_TITLE_MARK_IDS.has(id);
}

export function resolveTitleMark(raw: string): TitleMarkId | null {
  const value = raw.trim();
  if (!value) return null;
  if (VALID_TITLE_MARK_IDS.has(value)) return value as TitleMarkId;
  const byLabel = TITLE_MARKS.find(t => t.label === value || t.label.includes(value) || value.includes(t.label));
  return byLabel ? (byLabel.id as TitleMarkId) : null;
}

export function resolveMarkTint(raw?: string): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  const matchedInk = INK_COLORS.find(c => c.id === v || c.label.includes(v));
  return matchedInk?.hex;
}

export function fontStyleCssVars(fontStyleId?: string, inkColorId?: string): Record<string, string> {
  const font = FONT_STYLES.find(f => f.id === fontStyleId) ?? FONT_STYLES[0];
  const ink = INK_COLORS.find(c => c.id === inkColorId) ?? INK_COLORS[0];
  return {
    '--nb-font-display': font.displayStack,
    '--nb-font-italic': font.italicStack,
    '--nb-font-body': font.bodyStack,
    '--nb-page-ink': ink.hex,
  };
}

export function isValidThemeId(id: unknown): id is BookThemeId {
  return typeof id === 'string' && VALID_THEME_IDS.has(id);
}

export function isValidPaperStyle(id: unknown): id is string {
  return typeof id === 'string' && VALID_PAPER_IDS.has(id);
}

export function isValidCoverStyle(id: unknown): id is string {
  return typeof id === 'string' && VALID_COVER_IDS.has(id);
}

export function isValidClipId(id: unknown): id is string {
  return typeof id === 'string' && VALID_CLIP_IDS.has(id);
}

export function isValidMountId(id: unknown): id is string {
  return typeof id === 'string' && VALID_MOUNT_IDS.has(id);
}

export function isValidCharmId(id: unknown): id is string {
  return typeof id === 'string' && VALID_CHARM_IDS.has(id);
}

/** Resolve either exact presetId or exact/partial Chinese label into a canonical preset ID. */
export function resolveScrapPresetId(type: ScrapItemType, rawPresetId: string): string | null {
  const value = rawPresetId.trim();
  if (!value) return null;
  if (type === 'receipt') return value === 'live-receipt' || value.startsWith('tx') || value === 'receipt' ? value : 'live-receipt';
  if (type === 'chat-snippet') return value === 'live-chat' || value.startsWith('msg') || value === 'chat-snippet' ? value : 'live-chat';
  const catalog = PRESET_LIST_BY_TYPE[type];
  if (!catalog) return null;
  const exact = catalog.find(item => item.id === value);
  if (exact) return exact.id;
  const byLabel = catalog.find(item => item.label === value || value.includes(item.label) || item.label.includes(value));
  return byLabel ? byLabel.id : null;
}

/** Resolve cover theme/charm/clip/paper names or IDs safely. */
export function resolveCharmPresetId(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const exact = EXTENDED_CHARM_PRESETS.find(item => item.id === value);
  if (exact) return exact.id;
  const byLabel = EXTENDED_CHARM_PRESETS.find(item => item.label === value || item.label.includes(value));
  return byLabel ? byLabel.id : null;
}

export interface PersonBookProfile {
  themeId: BookThemeId;
  coverStyle: string;
  charmId: string;
  charmMount: string;
  clipId: string;
  defaultFontStyle: FontStyleId;
  defaultInkColor: InkColorId;
  coverTitle: string;
  coverSub: string;
}

const KNOWN_PERSON_PROFILES: Readonly<Record<string, Omit<PersonBookProfile, 'coverTitle' | 'coverSub' | 'defaultFontStyle' | 'defaultInkColor'> & { defaultFontStyle?: FontStyleId; defaultInkColor?: InkColorId }>> = {
  soyo: { themeId: 'sage', coverStyle: 'botanical', charmId: 'charm-bass', charmMount: 'spine-bottom', clipId: 'clip-brass-bar', defaultInkColor: 'forest' },
  sakiko: { themeId: 'indigo', coverStyle: 'classic', charmId: 'charm-moon', charmMount: 'ribbon-tip', clipId: 'clip-silver-quill', defaultFontStyle: 'anthropic-serif', defaultInkColor: 'navy' },
  emma: { themeId: 'dusk', coverStyle: 'plaid', charmId: 'charm-sakura', charmMount: 'spine-bottom', clipId: 'clip-rose-heart', defaultInkColor: 'sepia' },
  renako: { themeId: 'blossom', coverStyle: 'postage', charmId: 'acrylic-chibi-07', charmMount: 'corner-right', clipId: 'clip-peach-cat', defaultFontStyle: 'casual-pen', defaultInkColor: 'charcoal' },
  'bang-tomori': { themeId: 'sage', coverStyle: 'botanical', charmId: 'charm-clover', charmMount: 'spine-bottom', clipId: 'clip-brass-bar', defaultInkColor: 'charcoal' },
  'bang-anon': { themeId: 'blossom', coverStyle: 'postage', charmId: 'acrylic-mygo-exclamation', charmMount: 'corner-right', clipId: 'clip-peach-cat', defaultFontStyle: 'casual-pen', defaultInkColor: 'violet' },
  'bang-rana': { themeId: 'sage', coverStyle: 'plaid', charmId: 'acrylic-mygo-m', charmMount: 'ribbon-tip', clipId: 'clip-brass-bar', defaultFontStyle: 'casual-pen', defaultInkColor: 'forest' },
  'bang-taki': { themeId: 'indigo', coverStyle: 'classic', charmId: 'charm-cat', charmMount: 'spine-bottom', clipId: 'clip-silver-quill', defaultInkColor: 'charcoal' },
  'bang-mutsumi': { themeId: 'sage', coverStyle: 'botanical', charmId: 'acrylic-chibi-01', charmMount: 'spine-bottom', clipId: 'clip-brass-bar', defaultInkColor: 'forest' },
  'bang-uika': { themeId: 'indigo', coverStyle: 'postage', charmId: 'charm-star', charmMount: 'ribbon-tip', clipId: 'clip-silver-quill', defaultInkColor: 'navy' },
  'bang-umiri': { themeId: 'dusk', coverStyle: 'classic', charmId: 'acrylic-chibi-08', charmMount: 'spine-bottom', clipId: 'clip-rose-heart', defaultInkColor: 'sepia' },
  'bang-nyamu': { themeId: 'dusk', coverStyle: 'postage', charmId: 'acrylic-chibi-07', charmMount: 'corner-right', clipId: 'clip-rose-heart', defaultFontStyle: 'casual-pen', defaultInkColor: 'crimson' },
};

const THEME_CYCLE: readonly BookThemeId[] = ['sage', 'indigo', 'dusk', 'blossom'];

function hashId(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic default book styling per person (Sakiko uniquely uses Anthropic Serif by default). */
export function defaultBookProfileForPerson(personId: string, personName: string): PersonBookProfile {
  const mapped = KNOWN_PERSON_PROFILES[personId];
  const themeId = mapped?.themeId ?? THEME_CYCLE[hashId(personId) % THEME_CYCLE.length];
  const theme = BOOK_THEMES[themeId];
  const defaultFontStyle: FontStyleId = mapped?.defaultFontStyle ?? (personId === 'sakiko' ? 'anthropic-serif' : 'handwriting');
  const defaultInkColor: InkColorId = mapped?.defaultInkColor ?? 'charcoal';
  return {
    themeId,
    coverStyle: mapped?.coverStyle ?? theme.defaultCoverStyle,
    charmId: mapped?.charmId ?? theme.defaultCharmId,
    charmMount: mapped?.charmMount ?? 'spine-bottom',
    clipId: mapped?.clipId ?? theme.defaultClipId,
    defaultFontStyle,
    defaultInkColor,
    coverTitle: `${personName}的手账本`,
    coverSub: theme.coverSub,
  };
}

/** Concise catalog legend included in model authoring prompts so the LLM uses real sticker & extension IDs. */
export function scrapbookCatalogPromptLegend(): {
  stickers: { id: string; label: string }[];
  tapes: { id: string; label: string }[];
  stamps: { id: string; label: string }[];
  pressed: { id: string; label: string }[];
  doodles: { id: string; label: string }[];
  marks: { id: string; label: string }[];
  notes: { id: string; label: string }[];
  waxSeals: { id: string; label: string }[];
  clippings: { id: string; label: string }[];
  paperStyles: { id: string; label: string }[];
  fontStyles: { id: string; label: string }[];
  inkColors: { id: string; label: string }[];
  titleMarks: { id: string; label: string }[];
  coverStyles: { id: string; label: string }[];
  charms: { id: string; label: string }[];
} {
  return {
    stickers: STICKER_DEFS.map(s => ({ id: s.id, label: s.label })),
    tapes: WASHI_TAPES.map(t => ({ id: t.id, label: t.label })),
    stamps: STAMP_PRESETS.map(s => ({ id: s.id, label: s.label })),
    pressed: PRESSED_PRESETS.map(p => ({ id: p.id, label: p.label })),
    doodles: DOODLE_PRESETS.map(d => ({ id: d.id, label: d.label })),
    marks: PEN_MARK_PRESETS.map(m => ({ id: m.id, label: m.label })),
    notes: STICKY_NOTE_PRESETS.map(n => ({ id: n.id, label: n.label })),
    waxSeals: WAX_SEAL_PRESETS.map(w => ({ id: w.id, label: w.label })),
    clippings: CLIPPING_PRESETS.map(c => ({ id: c.id, label: c.label })),
    paperStyles: [...PAPER_STYLES],
    fontStyles: FONT_STYLES.map(f => ({ id: f.id, label: f.label })),
    inkColors: INK_COLORS.map(c => ({ id: c.id, label: c.label })),
    titleMarks: [...TITLE_MARKS],
    coverStyles: [...COVER_STYLES],
    charms: EXTENDED_CHARM_PRESETS.map(c => ({ id: c.id, label: c.label })),
  };
}

/** Short single-line legend for normal story turns to avoid inflating token budget. */
export const COMPACT_SCRAPBOOK_LEGEND =
  '可用贴纸ID: mygo-m(乐奈对指)/mygo-y(灯流汗)/mygo-g(立希眨眼)/mygo-o(素世认真)/mygo-exclamation(爱音闪亮)/chibi-01(睦鼓脸)/chibi-02(初华眯笑)/chibi-03(睦惊喜)/chibi-04(祥子仰望笑)/chibi-05(祥子招手)/chibi-06(初华比叉)/chibi-07(喵梦扯脸笑)/chibi-08(海铃抱胸); ' +
  '手绘笔迹(type:"mark"): mark-circle-red(红笔圆圈)/mark-circle-double(蓝墨双圈)/mark-circle-dashed(星芒虚线圈)/mark-underline-wave(波浪下划线)/mark-underline-double(双下划线)/mark-underline-loop(回环底线)/mark-highlight-sun(暖阳高光)/mark-highlight-mint(薄荷高光)/mark-bracket-brace(花括号批注)/mark-arrow-curve(拐弯箭头)/mark-star-doodle(五角星记号)/mark-heart-loop(钢笔小爱心); ' +
  '胶带: tape-sage-grid/tape-night-gold/tape-sakura-dot/tape-kraft-post/tape-music-bar/tape-sky-check; ' +
  '印章: stamp-checked/stamp-music/stamp-tea/stamp-star; ' +
  '干花: pressed-ginkgo/pressed-sakura/pressed-lavender/pressed-clover; ' +
  '涂鸦: doodle-cloud-bubble/doodle-star-note/doodle-coffee-ring/doodle-paw-trail; ' +
  '字体(fontStyle): handwriting(手写楷韵)/casual-pen(钢笔行草)/anthropic-serif(祥子默认Anthropic衬线)/editorial-type/clean-print; ' +
  '标题划线(titleMark): none/ink-underline/wave-underline/double-underline/highlight-wash/circle-wrap, dateCircled(true可圈出日期); ' +
  '纸张: lined/dot/grid/kraft/music';

const LOCATION_LABELS_FALLBACK: Record<string, string> = {
  apartments: '居民楼下',
  university: '文理大学',
  classroom: '教学楼教室',
  library: '中央图书馆',
  'student-dorm': '学生公寓',
  'toyokawa-house': '丰川宅',
  'margo-cafe': '玛尔戈咖啡厅',
  livehouse: 'CiRCLE Livehouse',
  park: '中央公园',
  shopping: '商业街',
  convenience: '便利店',
  bookshop: '古旧书店',
  clinic: '街区全科诊所',
  courthouse: '地方裁判所',
  'court-hearing': '法庭旁听席',
  'bus-stop': '南门公交站',
  'haneda-airport': '羽田国际机场',
  'sfo-airport': '旧金山国际机场',
};

/** Wrap adaptWorldStateToSnapshot with bundled Japanese/Chinese place labels when host map labels aren't supplied. */
export function buildLiveWorldSnapshot(
  state: Record<string, unknown>,
  extraLocationNames?: Record<string, string>,
): ScrapbookWorldSnapshot {
  return adaptWorldStateToSnapshot(state, {
    locationNames: { ...LOCATION_LABELS_FALLBACK, ...(extraLocationNames ?? {}) },
  });
}
