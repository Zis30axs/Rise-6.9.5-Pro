import type { WorldState } from '../frontend/types';
import { activeProtagonist, otherProtagonists, protagonistNames } from './protagonist-world';
import { allResidentCast } from './npc-cast';
import {
  BOOK_THEMES,
  buildDefaultCoverItemsByTheme,
  buildLiveWorldSnapshot,
  clamp,
  createBlankSpread,
  createItemFromPreset,
  defaultBookProfileForPerson,
  derivePageHeaderFromSnapshot,
  formatWorldCalendarDay,
  isValidClipId,
  isValidCoverStyle,
  isValidMountId,
  isValidPaperStyle,
  isValidThemeId,
  resolveCharmPresetId,
  resolveFontStyleId,
  resolveInkColor,
  resolveMarkTint,
  resolveScrapPresetId,
  resolveTitleMark,
  type BookSpread,
  type BookThemeId,
  type FontStyleId,
  type InkColorId,
  type PlacedScrapItem,
  type ScrapItemType,
  type TitleMarkId,
} from './notebook-scrapbook';

export interface NotebookPerson {
  id: string;
  name: string;
  group: '主角' | '居民' | '联系人';
}

export interface NotebookDraftItem {
  type: ScrapItemType;
  presetId: string;
  side?: 'cover' | 'left' | 'right';
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  opacity?: number;
  caption?: string;
  flipX?: boolean;
  tint?: string;
}

export interface NotebookDraft {
  personId: string;
  title: string;
  text: string;
  side?: 'left' | 'right';
  weather?: string;
  mood?: string;
  paperStyle?: string;
  fontStyle?: FontStyleId;
  inkColor?: InkColorId;
  titleMark?: TitleMarkId;
  dateCircled?: boolean;
  themeId?: BookThemeId;
  coverStyle?: string;
  charmId?: string;
  clipId?: string;
  items?: NotebookDraftItem[];
}

export interface NotebookPage {
  id: string;
  personId: string;
  title: string;
  text: string;
  kind: 'character' | 'observer';
  at: number;
  turn: number;
  sourceId: string;
  side?: 'left' | 'right';
  weather?: string;
  mood?: string;
  paperStyle?: string;
  fontStyle?: FontStyleId;
  inkColor?: InkColorId;
  titleMark?: TitleMarkId;
  dateCircled?: boolean;
  themeId?: BookThemeId;
  coverStyle?: string;
  charmId?: string;
  clipId?: string;
  items?: NotebookDraftItem[];
}

export interface SavedScrapbook {
  key: string;
  scope: string;
  personId: string;
  themeId: BookThemeId;
  coverStyle: string;
  charmId: string;
  charmMount: string;
  clipId: string;
  fontStyle?: FontStyleId;
  inkColor?: InkColorId;
  coverTitle: string;
  coverSub: string;
  coverItems: PlacedScrapItem[];
  spreads: BookSpread[];
  activeSpreadIndex: number;
  importedPageIds: string[];
  updatedAt: number;
}

export interface ScrapbookSummary {
  personId: string;
  spreadCount: number;
  filledPages: number;
  itemCount: number;
  updatedAt: number;
}

interface StoredPage extends NotebookPage {
  key: string;
  scope: string;
}

const DB_NAME = 'unread-city-notebooks-v1';
const DB_VERSION = 2;
const STORE_PAGES = 'pages';
const STORE_SCRAPBOOKS = 'scrapbooks';

const DRAFT_ALLOWED_KEYS = new Set([
  'personId', 'title', 'text', 'side', 'weather', 'mood',
  'paperStyle', 'fontStyle', 'inkColor', 'titleMark', 'dateCircled',
  'themeId', 'coverStyle', 'charmId', 'clipId', 'items',
]);
const ITEM_ALLOWED_KEYS = new Set([
  'type', 'presetId', 'side', 'x', 'y', 'rotate', 'scale', 'opacity', 'caption', 'flipX', 'tint',
]);
const ALLOWED_ITEM_TYPES = new Set<ScrapItemType>([
  'sticker', 'tape', 'stamp', 'clipping', 'note', 'wax', 'pressed', 'doodle', 'mark', 'receipt', 'chat-snippet',
]);

export function notebookPeople(state: WorldState): NotebookPerson[] {
  const people = new Map<string, NotebookPerson>();
  const add = (person: NotebookPerson) => {
    if (person.id && person.name.trim() && !people.has(person.id)) people.set(person.id, person);
  };
  const current = activeProtagonist(state);
  add({ id: current, name: protagonistNames[current], group: '主角' });
  for (const id of otherProtagonists(current)) add({ id, name: protagonistNames[id], group: '主角' });
  for (const person of allResidentCast) add({ id: person.id, name: person.name, group: '居民' });
  for (const contact of state.contacts ?? []) {
    const id = contact.sourcePersonId || contact.id;
    add({ id, name: contact.name, group: '联系人' });
  }
  return [...people.values()];
}

function cleanShortString(value: unknown, maxLen: number, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${label}格式无效`);
  const trimmed = value.trim().slice(0, maxLen);
  return trimmed || undefined;
}

function validateDraftItems(raw: unknown, prefix: string): NotebookDraftItem[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > 10) throw new Error(`${prefix} 装饰项数量无效`);
  const parsed: NotebookDraftItem[] = [];
  raw.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${prefix} 装饰项 ${idx + 1} 格式无效`);
    const obj = entry as Record<string, unknown>;
    if (Object.keys(obj).some(key => !ITEM_ALLOWED_KEYS.has(key))) throw new Error(`${prefix} 装饰项 ${idx + 1} 含未授权字段`);
    if (typeof obj.type !== 'string' || !ALLOWED_ITEM_TYPES.has(obj.type as ScrapItemType)) {
      throw new Error(`${prefix} 装饰项 ${idx + 1} 类型无效`);
    }
    if (typeof obj.presetId !== 'string' || !obj.presetId.trim() || obj.presetId.length > 64) {
      throw new Error(`${prefix} 装饰项 ${idx + 1} 素材 ID 无效`);
    }
    const type = obj.type as ScrapItemType;
    const resolvedPreset = resolveScrapPresetId(type, obj.presetId);
    // Tolerate a non-fatal preset typo in story turns by dropping only that decoration item.
    if (!resolvedPreset) return;
    const side = obj.side === 'cover' || obj.side === 'left' || obj.side === 'right' ? obj.side : undefined;
    const num = (val: unknown, fallback: number | undefined, min: number, max: number) =>
      typeof val === 'number' && Number.isFinite(val) ? clamp(val, min, max) : fallback;
    const caption = typeof obj.caption === 'string' ? obj.caption.trim().slice(0, 80) : undefined;
    const tint = typeof obj.tint === 'string' ? resolveMarkTint(obj.tint) : undefined;
    parsed.push({
      type,
      presetId: resolvedPreset,
      ...(side ? { side } : {}),
      ...(typeof obj.x === 'number' ? { x: num(obj.x, 50, 8, 92) } : {}),
      ...(typeof obj.y === 'number' ? { y: num(obj.y, 50, 8, 92) } : {}),
      ...(typeof obj.rotate === 'number' ? { rotate: num(obj.rotate, 0, -45, 45) } : {}),
      ...(typeof obj.scale === 'number' ? { scale: num(obj.scale, 1, 0.4, 1.8) } : {}),
      ...(typeof obj.opacity === 'number' ? { opacity: num(obj.opacity, 1, 0.35, 1) } : {}),
      ...(caption ? { caption } : {}),
      ...(tint ? { tint } : {}),
      ...(obj.flipX === true ? { flipX: true } : {}),
    });
  });
  return parsed.length ? parsed : undefined;
}

export function validateNotebookDrafts(
  raw: unknown,
  state: WorldState,
  options?: { maxDrafts?: number },
): NotebookDraft[] {
  const maxDrafts = options?.maxDrafts ?? 2;
  if (!Array.isArray(raw) || raw.length > maxDrafts) throw new Error('人物手账数量无效');
  const known = new Set(notebookPeople(state).map(person => person.id));
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`人物手账 ${index + 1} 格式无效`);
    const obj = item as Record<string, unknown>;
    if (Object.keys(obj).some(key => !DRAFT_ALLOWED_KEYS.has(key))) {
      throw new Error(`人物手账 ${index + 1} 包含未授权字段`);
    }
    const personId = typeof obj.personId === 'string' ? obj.personId.trim() : '';
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const text = typeof obj.text === 'string' ? obj.text.trim() : '';
    if (!known.has(personId)) throw new Error(`人物手账 ${index + 1} 的人物未登记`);
    if (!title || title.length > 60) throw new Error(`人物手账 ${index + 1} 的标题无效`);
    if (!text || text.length > 1500) throw new Error(`人物手账 ${index + 1} 的正文无效`);

    const draft: NotebookDraft = { personId, title, text };
    if (obj.side !== undefined) {
      if (obj.side === 'left' || obj.side === 'right') draft.side = obj.side;
      else if (typeof obj.side !== 'string') throw new Error(`人物手账 ${index + 1} 页位格式无效`);
    }
    const weather = cleanShortString(obj.weather, 20, `人物手账 ${index + 1} 天气`);
    if (weather) draft.weather = weather;
    const mood = cleanShortString(obj.mood, 20, `人物手账 ${index + 1} 心情`);
    if (mood) draft.mood = mood;
    if (obj.paperStyle !== undefined) {
      if (typeof obj.paperStyle !== 'string') throw new Error(`人物手账 ${index + 1} 纸张格式无效`);
      if (isValidPaperStyle(obj.paperStyle)) draft.paperStyle = obj.paperStyle;
    }
    if (obj.fontStyle !== undefined) {
      if (typeof obj.fontStyle !== 'string') throw new Error(`人物手账 ${index + 1} 字体格式无效`);
      const resolvedFont = resolveFontStyleId(obj.fontStyle);
      if (resolvedFont) draft.fontStyle = resolvedFont;
    }
    if (obj.inkColor !== undefined) {
      if (typeof obj.inkColor !== 'string') throw new Error(`人物手账 ${index + 1} 墨色格式无效`);
      const resolvedInk = resolveInkColor(obj.inkColor);
      if (resolvedInk) draft.inkColor = resolvedInk;
    }
    if (obj.titleMark !== undefined) {
      if (typeof obj.titleMark !== 'string') throw new Error(`人物手账 ${index + 1} 标题划线格式无效`);
      const resolvedMark = resolveTitleMark(obj.titleMark);
      if (resolvedMark) draft.titleMark = resolvedMark;
    }
    if (obj.dateCircled !== undefined) {
      if (typeof obj.dateCircled !== 'boolean') throw new Error(`人物手账 ${index + 1} 日期圈记格式无效`);
      draft.dateCircled = obj.dateCircled;
    }
    if (obj.themeId !== undefined) {
      if (typeof obj.themeId !== 'string') throw new Error(`人物手账 ${index + 1} 主题格式无效`);
      if (isValidThemeId(obj.themeId)) draft.themeId = obj.themeId;
    }
    if (obj.coverStyle !== undefined) {
      if (typeof obj.coverStyle !== 'string') throw new Error(`人物手账 ${index + 1} 封面样式格式无效`);
      if (isValidCoverStyle(obj.coverStyle)) draft.coverStyle = obj.coverStyle;
    }
    if (obj.charmId !== undefined) {
      if (typeof obj.charmId !== 'string') throw new Error(`人物手账 ${index + 1} 挂坠格式无效`);
      const resolvedCharm = resolveCharmPresetId(obj.charmId);
      if (resolvedCharm) draft.charmId = resolvedCharm;
    }
    if (obj.clipId !== undefined) {
      if (typeof obj.clipId !== 'string') throw new Error(`人物手账 ${index + 1} 书夹格式无效`);
      if (isValidClipId(obj.clipId)) draft.clipId = obj.clipId;
    }
    const items = validateDraftItems(obj.items, `人物手账 ${index + 1}`);
    if (items?.length) draft.items = items;
    return draft;
  });
}

export const notebookMinute = (state: WorldState): number =>
  (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;

export const notebookTurn = (state: WorldState): number => state.story?.length ?? 0;

function validPage(value: unknown): value is NotebookPage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as Partial<NotebookPage>;
  return typeof p.id === 'string' && !!p.id && typeof p.personId === 'string' && !!p.personId
    && typeof p.title === 'string' && !!p.title.trim() && p.title.length <= 60
    && typeof p.text === 'string' && !!p.text.trim() && p.text.length <= 2000
    && (p.kind === 'character' || p.kind === 'observer')
    && typeof p.at === 'number' && Number.isFinite(p.at) && p.at >= 0
    && typeof p.turn === 'number' && Number.isFinite(p.turn) && p.turn >= 0
    && typeof p.sourceId === 'string';
}

export function notebookPageFromDraft(
  draft: NotebookDraft,
  state: WorldState,
  assistantId: string,
  index: number,
): NotebookPage {
  return {
    id: `${assistantId}:${index}`,
    personId: draft.personId,
    title: draft.title,
    text: draft.text,
    kind: 'character',
    at: notebookMinute(state),
    turn: notebookTurn(state),
    sourceId: assistantId,
    ...(draft.side ? { side: draft.side } : {}),
    ...(draft.weather ? { weather: draft.weather } : {}),
    ...(draft.mood ? { mood: draft.mood } : {}),
    ...(draft.paperStyle ? { paperStyle: draft.paperStyle } : {}),
    ...(draft.fontStyle ? { fontStyle: draft.fontStyle } : {}),
    ...(draft.inkColor ? { inkColor: draft.inkColor } : {}),
    ...(draft.titleMark ? { titleMark: draft.titleMark } : {}),
    ...(draft.dateCircled !== undefined ? { dateCircled: draft.dateCircled } : {}),
    ...(draft.themeId ? { themeId: draft.themeId } : {}),
    ...(draft.coverStyle ? { coverStyle: draft.coverStyle } : {}),
    ...(draft.charmId ? { charmId: draft.charmId } : {}),
    ...(draft.clipId ? { clipId: draft.clipId } : {}),
    ...(draft.items?.length ? { items: draft.items } : {}),
  };
}

export function makePersonalNotebookPage(
  state: WorldState,
  personId: string,
  title: string,
  text: string,
): NotebookPage {
  if (!notebookPeople(state).some(person => person.id === personId)) throw new Error('未知人物手账');
  const cleanTitle = title.trim();
  const cleanText = text.trim();
  if (!cleanTitle || cleanTitle.length > 60 || !cleanText || cleanText.length > 2000) {
    throw new Error('标题需 1–60 字，正文需 1–2000 字');
  }
  const active = activeProtagonist(state);
  return {
    id: `user:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`,
    personId,
    title: cleanTitle,
    text: cleanText,
    kind: personId === active ? 'character' : 'observer',
    at: notebookMinute(state),
    turn: notebookTurn(state),
    sourceId: '',
  };
}

function pageDateLabelFromMinute(at: number): string {
  const day = Math.max(1, Math.floor(at / 1440) + 1);
  const rem = Math.max(0, Math.floor(at % 1440));
  const hour = String(Math.floor(rem / 60)).padStart(2, '0');
  const minute = String(rem % 60).padStart(2, '0');
  return `${formatWorldCalendarDay(day).display} · ${hour}:${minute}`;
}

export function createInitialScrapbook(
  scope: string,
  personId: string,
  personName: string,
  state?: WorldState,
): SavedScrapbook {
  const profile = defaultBookProfileForPerson(personId, personName);
  const coverDefaults = buildDefaultCoverItemsByTheme()[profile.themeId] ?? [];
  const header = state
    ? derivePageHeaderFromSnapshot(buildLiveWorldSnapshot(state as unknown as Record<string, unknown>))
    : null;
  const firstSpread = createBlankSpread(1);
  firstSpread.left.fontStyle = profile.defaultFontStyle;
  firstSpread.left.inkColor = profile.defaultInkColor;
  firstSpread.right.fontStyle = profile.defaultFontStyle;
  firstSpread.right.inkColor = profile.defaultInkColor;
  if (header) {
    firstSpread.left.date = header.dateText;
    firstSpread.left.weather = header.weatherText;
    firstSpread.left.mood = header.moodText;
    firstSpread.right.date = header.dateText;
    firstSpread.right.weather = header.weatherText;
  }
  return {
    key: `${scope}::${personId}`,
    scope,
    personId,
    themeId: profile.themeId,
    coverStyle: profile.coverStyle,
    charmId: profile.charmId,
    charmMount: profile.charmMount,
    clipId: profile.clipId,
    fontStyle: profile.defaultFontStyle,
    inkColor: profile.defaultInkColor,
    coverTitle: profile.coverTitle,
    coverSub: profile.coverSub,
    coverItems: coverDefaults.map(item => ({ ...item, id: `cov-${personId}-${item.id}` })),
    spreads: [firstSpread],
    activeSpreadIndex: 0,
    importedPageIds: [],
    updatedAt: Date.now(),
  };
}

const BLANK_DEFAULT_TITLES = new Set(['新建左页手记', '右侧拼贴留白']);
const BLANK_DEFAULT_BODIES = new Set([
  '点击这里直接写下今天发生的趣事，或者从右侧贴纸盒拖选图案妆点版面。',
  '贴一张车票存根、咖啡馆小票或和纸胶带，把零碎日常留在本子里。',
]);

function hasPageContent(side: BookSpread['left'] | BookSpread['right']): boolean {
  const title = side.title.trim();
  const body = side.body.trim();
  return Boolean((title && !BLANK_DEFAULT_TITLES.has(title)) || (body && !BLANK_DEFAULT_BODIES.has(body)));
}

/** Materialize a validated draft or stored page directly onto a spread side, preserving user editability. */
export function applyDraftToScrapbook(
  book: SavedScrapbook,
  draft: NotebookDraft,
  state?: WorldState,
  options?: {
    spreadIndex?: number;
    targetSide?: 'left' | 'right';
    pageId?: string;
    atMinute?: number;
    sourceId?: string;
    applyCoverDecorations?: boolean;
  },
): SavedScrapbook {
  const nextSpreads: BookSpread[] = book.spreads.length
    ? book.spreads.map(sp => ({
      ...sp,
      left: { ...sp.left },
      right: { ...sp.right },
      items: sp.items.map(it => ({ ...it })),
    }))
    : [createBlankSpread(1)];

  let targetIdx = typeof options?.spreadIndex === 'number'
    ? clamp(Math.floor(options.spreadIndex), 0, nextSpreads.length - 1)
    : nextSpreads.length - 1;
  let targetSide: 'left' | 'right' = options?.targetSide ?? draft.side ?? 'left';

  if (options?.spreadIndex === undefined) {
    const last = nextSpreads[targetIdx];
    const requestedSide = draft.side;
    if (requestedSide) {
      if (hasPageContent(last[requestedSide])) {
        nextSpreads.push(createBlankSpread(nextSpreads.length + 1));
        targetIdx = nextSpreads.length - 1;
      }
      targetSide = requestedSide;
    } else if (!hasPageContent(last.left)) {
      targetSide = 'left';
    } else if (!hasPageContent(last.right)) {
      targetSide = 'right';
    } else {
      nextSpreads.push(createBlankSpread(nextSpreads.length + 1));
      targetIdx = nextSpreads.length - 1;
      targetSide = 'left';
    }
  }

  const spread = nextSpreads[targetIdx];
  const header = state
    ? derivePageHeaderFromSnapshot(buildLiveWorldSnapshot(state as unknown as Record<string, unknown>))
    : null;
  const dateText = typeof options?.atMinute === 'number'
    ? pageDateLabelFromMinute(options.atMinute)
    : (spread[targetSide].date || header?.dateText || formatWorldCalendarDay(1).display);

  spread[targetSide] = {
    ...spread[targetSide],
    date: dateText,
    title: draft.title.trim().slice(0, 60),
    weather: draft.weather ?? (spread[targetSide].weather || header?.weatherText || '晴朗'),
    mood: draft.mood ?? (spread[targetSide].mood || header?.moodText || '平静'),
    body: draft.text.trim().slice(0, 2000),
    fontStyle: draft.fontStyle ?? spread[targetSide].fontStyle ?? book.fontStyle ?? defaultBookProfileForPerson(book.personId, '').defaultFontStyle,
    inkColor: draft.inkColor ?? spread[targetSide].inkColor ?? book.inkColor ?? defaultBookProfileForPerson(book.personId, '').defaultInkColor,
    ...(draft.titleMark ? { titleMark: draft.titleMark } : spread[targetSide].titleMark ? { titleMark: spread[targetSide].titleMark } : {}),
    ...(draft.dateCircled !== undefined ? { dateCircled: draft.dateCircled } : spread[targetSide].dateCircled !== undefined ? { dateCircled: spread[targetSide].dateCircled } : {}),
  };

  if (draft.paperStyle && isValidPaperStyle(draft.paperStyle)) {
    spread.paperStyle = draft.paperStyle;
  }

  let nextCoverItems = book.coverItems.map(item => ({ ...item }));
  if (Array.isArray(draft.items) && draft.items.length) {
    const presetDefaultsX = [76, 24, 72, 28, 78, 22, 65, 35];
    const presetDefaultsY = [24, 72, 74, 24, 48, 48, 82, 16];
    draft.items.forEach((rawItem, idx) => {
      const side = rawItem.side ?? targetSide;
      const existingOnSide = side === 'cover' ? nextCoverItems : spread.items;
      const placed = createItemFromPreset(rawItem.type, rawItem.presetId, side, existingOnSide, {
        x: rawItem.x ?? presetDefaultsX[idx % presetDefaultsX.length],
        y: rawItem.y ?? presetDefaultsY[idx % presetDefaultsY.length],
        rotate: rawItem.rotate ?? (idx % 2 === 0 ? -7 : 8),
        scale: rawItem.scale ?? 0.96,
        ...(rawItem.caption ? { caption: rawItem.caption } : {}),
        ...(rawItem.tint ? { tint: rawItem.tint } : {}),
      });
      if (rawItem.flipX) placed.flipX = true;
      if (typeof rawItem.opacity === 'number') placed.opacity = clamp(rawItem.opacity, 0.35, 1);
      if (side === 'cover') nextCoverItems.push(placed);
      else spread.items.push(placed);
    });
  }

  const nextImported = options?.pageId && !book.importedPageIds.includes(options.pageId)
    ? [...book.importedPageIds, options.pageId]
    : book.importedPageIds;

  return {
    ...book,
    ...(options?.applyCoverDecorations && draft.themeId && isValidThemeId(draft.themeId) ? { themeId: draft.themeId } : {}),
    ...(options?.applyCoverDecorations && draft.coverStyle && isValidCoverStyle(draft.coverStyle) ? { coverStyle: draft.coverStyle } : {}),
    ...(options?.applyCoverDecorations && draft.charmId ? { charmId: resolveCharmPresetId(draft.charmId) ?? book.charmId } : {}),
    ...(options?.applyCoverDecorations && draft.clipId && isValidClipId(draft.clipId) ? { clipId: draft.clipId } : {}),
    coverItems: nextCoverItems,
    spreads: nextSpreads,
    activeSpreadIndex: targetIdx,
    importedPageIds: nextImported,
    updatedAt: Date.now(),
  };
}

/** Ingest any unseen NotebookPage entries for a person without clobbering prior player edits. */
export function mergePagesIntoScrapbook(
  book: SavedScrapbook,
  pages: readonly NotebookPage[],
  state?: WorldState,
): { book: SavedScrapbook; changed: boolean } {
  const unseen = pages
    .filter(p => p.personId === book.personId && !book.importedPageIds.includes(p.id))
    .sort((a, b) => a.at - b.at || a.turn - b.turn || a.id.localeCompare(b.id));
  if (!unseen.length) return { book, changed: false };
  let next = book;
  for (const page of unseen) {
    next = applyDraftToScrapbook(next, {
      personId: page.personId,
      title: page.title,
      text: page.text,
      ...(page.side ? { side: page.side } : {}),
      ...(page.weather ? { weather: page.weather } : {}),
      ...(page.mood ? { mood: page.mood } : {}),
      ...(page.paperStyle ? { paperStyle: page.paperStyle } : {}),
      ...(page.fontStyle ? { fontStyle: page.fontStyle } : {}),
      ...(page.inkColor ? { inkColor: page.inkColor } : {}),
      ...(page.titleMark ? { titleMark: page.titleMark } : {}),
      ...(page.dateCircled !== undefined ? { dateCircled: page.dateCircled } : {}),
      ...(page.themeId ? { themeId: page.themeId } : {}),
      ...(page.coverStyle ? { coverStyle: page.coverStyle } : {}),
      ...(page.charmId ? { charmId: page.charmId } : {}),
      ...(page.clipId ? { clipId: page.clipId } : {}),
      ...(page.items?.length ? { items: page.items } : {}),
    }, state, {
      pageId: page.id,
      atMinute: page.at,
      sourceId: page.sourceId,
      applyCoverDecorations: !next.importedPageIds.length,
    });
  }
  return { book: next, changed: true };
}

function normalizeSavedScrapbook(raw: unknown, scope: string, fallbackPersonId: string): SavedScrapbook | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Partial<SavedScrapbook>;
  const personId = typeof obj.personId === 'string' && obj.personId.trim() ? obj.personId.trim() : fallbackPersonId;
  const themeId: BookThemeId = isValidThemeId(obj.themeId) ? obj.themeId : 'sage';
  const theme = BOOK_THEMES[themeId];
  const profile = defaultBookProfileForPerson(personId, '');
  const resolvedBookFont = (typeof obj.fontStyle === 'string' && resolveFontStyleId(obj.fontStyle)) || profile.defaultFontStyle;
  const resolvedBookInk = (typeof obj.inkColor === 'string' && resolveInkColor(obj.inkColor)) || profile.defaultInkColor;
  const rawSpreads = Array.isArray(obj.spreads) && obj.spreads.length ? obj.spreads : [createBlankSpread(1)];
  const spreads: BookSpread[] = rawSpreads.map((sp, idx) => {
    const blank = createBlankSpread(idx + 1);
    const s = sp && typeof sp === 'object' ? sp as Partial<BookSpread> : {};
    const sideNorm = (side: unknown, fb: typeof blank.left) => {
      const d = side && typeof side === 'object' ? side as Partial<typeof blank.left> : {};
      const sideFont = typeof d.fontStyle === 'string' ? resolveFontStyleId(d.fontStyle) ?? resolvedBookFont : resolvedBookFont;
      const sideInk = typeof d.inkColor === 'string' ? resolveInkColor(d.inkColor) ?? resolvedBookInk : resolvedBookInk;
      const sideMark = typeof d.titleMark === 'string' ? resolveTitleMark(d.titleMark) ?? 'none' : 'none';
      return {
        date: typeof d.date === 'string' ? d.date : fb.date,
        title: typeof d.title === 'string' ? d.title : fb.title,
        weather: typeof d.weather === 'string' ? d.weather : fb.weather,
        mood: typeof d.mood === 'string' ? d.mood : fb.mood,
        body: typeof d.body === 'string' ? d.body : fb.body,
        fontStyle: sideFont,
        inkColor: sideInk,
        ...(sideMark !== 'none' ? { titleMark: sideMark } : {}),
        ...(d.dateCircled === true ? { dateCircled: true } : {}),
      };
    };
    const items = Array.isArray(s.items)
      ? s.items.filter((it): it is PlacedScrapItem => Boolean(it && typeof it === 'object' && typeof (it as PlacedScrapItem).id === 'string' && typeof (it as PlacedScrapItem).type === 'string' && typeof (it as PlacedScrapItem).presetId === 'string'))
        .map(it => ({ ...it }))
      : [];
    return {
      id: typeof s.id === 'string' && s.id ? s.id : blank.id,
      label: typeof s.label === 'string' && s.label ? s.label : blank.label,
      paperStyle: isValidPaperStyle(s.paperStyle) ? s.paperStyle : 'lined',
      left: sideNorm(s.left, blank.left),
      right: sideNorm(s.right, blank.right),
      items,
    };
  });
  const coverItems = Array.isArray(obj.coverItems)
    ? obj.coverItems.filter((it): it is PlacedScrapItem => Boolean(it && typeof it === 'object' && typeof (it as PlacedScrapItem).id === 'string' && typeof (it as PlacedScrapItem).type === 'string'))
      .map(it => ({ ...it }))
    : [];
  const importedPageIds = Array.isArray(obj.importedPageIds)
    ? obj.importedPageIds.filter((id): id is string => typeof id === 'string' && !!id)
    : [];
  return {
    key: `${scope}::${personId}`,
    scope,
    personId,
    themeId,
    coverStyle: isValidCoverStyle(obj.coverStyle) ? obj.coverStyle : theme.defaultCoverStyle,
    charmId: (typeof obj.charmId === 'string' && resolveCharmPresetId(obj.charmId)) || theme.defaultCharmId,
    charmMount: isValidMountId(obj.charmMount) ? obj.charmMount : 'spine-bottom',
    clipId: isValidClipId(obj.clipId) ? obj.clipId : theme.defaultClipId,
    fontStyle: resolvedBookFont,
    inkColor: resolvedBookInk,
    coverTitle: typeof obj.coverTitle === 'string' && obj.coverTitle.trim() ? obj.coverTitle.trim().slice(0, 48) : theme.bookTitle,
    coverSub: typeof obj.coverSub === 'string' ? obj.coverSub.slice(0, 64) : theme.coverSub,
    coverItems,
    spreads,
    activeSpreadIndex: clamp(typeof obj.activeSpreadIndex === 'number' ? Math.floor(obj.activeSpreadIndex) : 0, 0, Math.max(0, spreads.length - 1)),
    importedPageIds,
    updatedAt: typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt) ? obj.updatedAt : Date.now(),
  };
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('当前环境不支持本地手账持久化存储'));
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PAGES)) {
        db.createObjectStore(STORE_PAGES, { keyPath: 'key' }).createIndex('scope', 'scope', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SCRAPBOOKS)) {
        db.createObjectStore(STORE_SCRAPBOOKS, { keyPath: 'key' }).createIndex('scope', 'scope', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('无法打开手账数据库'));
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('手账存储操作失败'));
  });
}

export async function readNotebook(scope: string): Promise<NotebookPage[]> {
  if (!scope) return [];
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_PAGES, 'readonly');
    const rows = await idbReq<StoredPage[]>(tx.objectStore(STORE_PAGES).index('scope').getAll(scope));
    return rows.map(({ key: _key, scope: _scope, ...page }) => page)
      .filter(validPage)
      .sort((a, b) => a.at - b.at || a.turn - b.turn || a.id.localeCompare(b.id));
  } finally {
    db.close();
  }
}

function txComplete(tx: IDBTransaction, errMsg: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(errMsg));
    tx.onabort = () => reject(tx.error ?? new Error(errMsg));
  });
}

export async function writeNotebook(scope: string, pages: readonly NotebookPage[]): Promise<void> {
  if (!scope || !pages.length) return;
  for (const page of pages) {
    if (!validPage(page)) throw new Error('手账页无效');
  }
  const db = await openDb();
  try {
    const grouped = new Map<string, NotebookPage[]>();
    for (const page of pages) {
      const list = grouped.get(page.personId) ?? [];
      list.push(page);
      grouped.set(page.personId, list);
    }

    const updatedBooks: SavedScrapbook[] = [];
    if (grouped.size > 0) {
      const readTx = db.transaction(STORE_SCRAPBOOKS, 'readonly');
      const bookStore = readTx.objectStore(STORE_SCRAPBOOKS);
      const reads = await Promise.all(
        [...grouped.entries()].map(async ([personId, incoming]) => {
          const existingRaw = await idbReq<SavedScrapbook | undefined>(bookStore.get(`${scope}::${personId}`));
          if (!existingRaw) return null;
          const normalized = normalizeSavedScrapbook(existingRaw, scope, personId);
          if (!normalized) return null;
          const { book, changed } = mergePagesIntoScrapbook(normalized, incoming);
          return changed ? (JSON.parse(JSON.stringify(book)) as SavedScrapbook) : null;
        }),
      );
      for (const b of reads) if (b) updatedBooks.push(b);
    }

    const writeTx = db.transaction([STORE_PAGES, STORE_SCRAPBOOKS], 'readwrite');
    const done = txComplete(writeTx, '写入手账失败');
    const pageStore = writeTx.objectStore(STORE_PAGES);
    const bookStore = writeTx.objectStore(STORE_SCRAPBOOKS);
    for (const page of pages) {
      pageStore.put({ ...page, key: `${scope}::${page.id}`, scope });
    }
    for (const book of updatedBooks) {
      bookStore.put(book);
    }
    await done;
  } finally {
    db.close();
  }
}

export async function readScrapbook(scope: string, personId: string): Promise<SavedScrapbook | null> {
  if (!scope || !personId) return null;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_SCRAPBOOKS, 'readonly');
    const raw = await idbReq<SavedScrapbook | undefined>(tx.objectStore(STORE_SCRAPBOOKS).get(`${scope}::${personId}`));
    return normalizeSavedScrapbook(raw, scope, personId);
  } finally {
    db.close();
  }
}

export async function saveScrapbook(
  scope: string,
  book: Omit<SavedScrapbook, 'key' | 'scope'> & { key?: string; scope?: string },
): Promise<SavedScrapbook> {
  if (!scope || !book.personId) throw new Error('无效的手账保存目标');
  const plain: SavedScrapbook = JSON.parse(JSON.stringify({
    ...book,
    key: `${scope}::${book.personId}`,
    scope,
    updatedAt: Date.now(),
  }));
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_SCRAPBOOKS, 'readwrite');
    const done = txComplete(tx, '保存手账失败');
    tx.objectStore(STORE_SCRAPBOOKS).put(plain);
    await done;
    return plain;
  } finally {
    db.close();
  }
}

/** Load or initialize a person's persistent 3D scrapbook, automatically folding in any new NotebookPages. */
export async function hydratePersonScrapbook(
  scope: string,
  state: WorldState,
  personId: string,
  personName?: string,
): Promise<SavedScrapbook> {
  const people = notebookPeople(state);
  const resolvedName = personName || people.find(p => p.id === personId)?.name || '手账主人';
  const [saved, allPages] = await Promise.all([
    readScrapbook(scope, personId),
    readNotebook(scope),
  ]);
  const personPages = allPages.filter(p => p.personId === personId);
  const base = saved ?? createInitialScrapbook(scope, personId, resolvedName, state);
  const { book, changed } = mergePagesIntoScrapbook(base, personPages, state);
  if (!saved || changed) {
    return saveScrapbook(scope, book);
  }
  return book;
}

export async function clipScrapArtifactToNotebook(
  scope: string,
  state: WorldState,
  personId: string,
  personName: string,
  artifact: {
    itemType: ScrapItemType;
    presetId: string;
    caption: string;
    sourceRef: NonNullable<PlacedScrapItem['sourceRef']>;
    dataPayload: Record<string, unknown>;
  },
): Promise<SavedScrapbook> {
  const book = await hydratePersonScrapbook(scope, state, personId, personName);
  const nextSpreads: BookSpread[] = book.spreads.length
    ? book.spreads.map(sp => ({
      ...sp,
      left: { ...sp.left },
      right: { ...sp.right },
      items: sp.items.map(it => ({ ...it })),
    }))
    : [createBlankSpread(1)];

  for (const spread of nextSpreads) {
    const existing = spread.items.find(item => item.sourceRef?.id === artifact.sourceRef.id);
    if (existing) {
      existing.caption = artifact.caption;
      existing.dataPayload = { ...artifact.dataPayload };
      return saveScrapbook(scope, { ...book, spreads: nextSpreads });
    }
  }

  let target = nextSpreads[nextSpreads.length - 1];
  if (target.items.filter(it => it.type === 'receipt').length >= 4) {
    target = createBlankSpread(nextSpreads.length + 1);
    nextSpreads.push(target);
  }
  const rightReceipts = target.items.filter(it => it.side === 'right').length;
  const side: 'left' | 'right' = rightReceipts < 3 ? 'right' : 'left';
  if (!target[side].date) {
    const header = derivePageHeaderFromSnapshot(buildLiveWorldSnapshot(state as unknown as Record<string, unknown>));
    target[side].date = header.dateText;
    target[side].weather = header.weatherText;
    target[side].mood = header.moodText;
  }
  if (!target[side].title || target[side].title === '新的一页') {
    target[side].title = '证券交割留存';
  }
  const placed = createItemFromPreset(artifact.itemType, artifact.presetId, side, target.items, {
    caption: artifact.caption,
    sourceRef: artifact.sourceRef,
    dataPayload: artifact.dataPayload,
  });
  target.items.push(placed);
  return saveScrapbook(scope, { ...book, spreads: nextSpreads });
}

export async function listScrapbookSummaries(scope: string): Promise<Map<string, ScrapbookSummary>> {
  const summaries = new Map<string, ScrapbookSummary>();
  if (!scope) return summaries;
  const db = await openDb();
  try {
    const tx = db.transaction([STORE_SCRAPBOOKS, STORE_PAGES], 'readonly');
    const [rawBooks, rawPages] = await Promise.all([
      idbReq<SavedScrapbook[]>(tx.objectStore(STORE_SCRAPBOOKS).index('scope').getAll(scope)),
      idbReq<StoredPage[]>(tx.objectStore(STORE_PAGES).index('scope').getAll(scope)),
    ]);

    const seenPageIdsByPerson = new Map<string, Set<string>>();
    for (const raw of rawBooks) {
      const book = normalizeSavedScrapbook(raw, scope, raw.personId);
      if (!book) continue;
      let filledPages = 0;
      let itemCount = book.coverItems.length;
      for (const sp of book.spreads) {
        if (hasPageContent(sp.left)) filledPages += 1;
        if (hasPageContent(sp.right)) filledPages += 1;
        itemCount += sp.items.length;
      }
      summaries.set(book.personId, {
        personId: book.personId,
        spreadCount: book.spreads.length,
        filledPages,
        itemCount,
        updatedAt: book.updatedAt,
      });
      seenPageIdsByPerson.set(book.personId, new Set(book.importedPageIds));
    }

    for (const rawPage of rawPages) {
      if (!validPage(rawPage)) continue;
      const seen = seenPageIdsByPerson.get(rawPage.personId);
      if (seen?.has(rawPage.id)) continue;
      const prev = summaries.get(rawPage.personId) ?? {
        personId: rawPage.personId,
        spreadCount: 1,
        filledPages: 0,
        itemCount: 0,
        updatedAt: Date.now(),
      };
      prev.filledPages += 1;
      prev.itemCount += rawPage.items?.length ?? 0;
      summaries.set(rawPage.personId, prev);
    }

    return summaries;
  } finally {
    db.close();
  }
}

export async function exportNotebook(scope: string): Promise<string> {
  const pages = await readNotebook(scope);
  return JSON.stringify({ version: 1, pages }, null, 2);
}

/** Unified backup export containing all persisted 3D scrapbooks and legacy-compatible page summaries. */
export async function exportAllScrapbooksBackup(scope: string): Promise<string> {
  if (!scope) throw new Error('无有效存档作用域');
  const db = await openDb();
  let books: SavedScrapbook[] = [];
  let rawPages: NotebookPage[] = [];
  try {
    const tx = db.transaction([STORE_SCRAPBOOKS, STORE_PAGES], 'readonly');
    const [storedBooks, storedPages] = await Promise.all([
      idbReq<SavedScrapbook[]>(tx.objectStore(STORE_SCRAPBOOKS).index('scope').getAll(scope)),
      idbReq<StoredPage[]>(tx.objectStore(STORE_PAGES).index('scope').getAll(scope)),
    ]);
    books = storedBooks
      .map(b => normalizeSavedScrapbook(b, scope, b.personId))
      .filter((b): b is SavedScrapbook => Boolean(b));
    rawPages = storedPages.map(({ key: _k, scope: _s, ...p }) => p).filter(validPage);
  } finally {
    db.close();
  }

  const pageMap = new Map<string, NotebookPage>(rawPages.map(p => [p.id, p]));
  for (const book of books) {
    book.spreads.forEach((sp, spIdx) => {
      (['left', 'right'] as const).forEach((sideKey) => {
        const side = sp[sideKey];
        if (!hasPageContent(side)) return;
        const id = `sb:${book.personId}:${sp.id}:${sideKey}`;
        pageMap.set(id, {
          id,
          personId: book.personId,
          title: side.title.trim() || `${book.coverTitle} #${spIdx + 1}`,
          text: side.body.trim() || side.title.trim(),
          kind: 'character',
          at: Math.max(0, Math.floor(book.updatedAt / 60000) % 100000),
          turn: 0,
          sourceId: '',
          side: sideKey,
          weather: side.weather,
          mood: side.mood,
          paperStyle: sp.paperStyle,
        });
      });
    });
  }

  return JSON.stringify({
    version: 2,
    app: 'unread-city-scrapbook',
    exportedAt: new Date().toISOString(),
    scrapbooks: books.map(({ key: _k, scope: _s, ...rest }) => rest),
    pages: [...pageMap.values()],
  }, null, 2);
}

export async function importNotebook(scope: string, raw: string, state: WorldState): Promise<number> {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('手账备份不是有效的 JSON 文件'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('手账备份格式无效');
  const object = data as { version?: unknown; pages?: unknown };
  if (object.version !== 1 && object.version !== 2) throw new Error('不支持的手账备份版本');
  if (!Array.isArray(object.pages)) throw new Error('手账备份缺少 pages');
  const known = new Set(notebookPeople(state).map(person => person.id));
  const pages = object.pages as NotebookPage[];
  const bad = pages.find(p => !validPage(p) || !known.has(p.personId));
  if (bad) throw new Error('手账备份包含未知人物或超限页');
  const current = await readNotebook(scope);
  const existingIds = new Set(current.map(p => p.id));
  const accepted = pages.filter(p => !existingIds.has(p.id)
    && p.at <= notebookMinute(state) && p.turn <= notebookTurn(state));
  await writeNotebook(scope, accepted);
  return accepted.length;
}

/** Import v2 multi-scrapbook backups, v1 plain NotebookPage[] backups, or standalone workbench backups. */
export async function importScrapbookBackupIntoStore(
  scope: string,
  raw: string,
  state: WorldState,
  targetPersonId: string,
): Promise<{ importedBooks: number; importedPages: number }> {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('手账备份不是有效的 JSON 文件'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('手账备份格式无效');
  const obj = parsed as Record<string, unknown>;
  const known = new Set(notebookPeople(state).map(p => p.id));
  let importedBooks = 0;
  let importedPages = 0;

  if (Array.isArray(obj.scrapbooks)) {
    for (const rawBook of obj.scrapbooks) {
      const normalized = normalizeSavedScrapbook(rawBook, scope, targetPersonId);
      if (!normalized || !known.has(normalized.personId)) continue;
      await saveScrapbook(scope, normalized);
      importedBooks += 1;
    }
  } else if (obj.spreadsByTheme && typeof obj.spreadsByTheme === 'object') {
    const activeTheme = isValidThemeId(obj.activeThemeId) ? obj.activeThemeId : 'sage';
    const spreadsMap = obj.spreadsByTheme as Record<string, BookSpread[]>;
    const rawSpreads = Array.isArray(spreadsMap[activeTheme]) ? spreadsMap[activeTheme] : Object.values(spreadsMap).find(Array.isArray);
    if (rawSpreads?.length) {
      const personName = notebookPeople(state).find(p => p.id === targetPersonId)?.name ?? '手账主人';
      const base = createInitialScrapbook(scope, targetPersonId, personName, state);
      const normalized = normalizeSavedScrapbook({
        ...base,
        themeId: activeTheme,
        coverStyle: typeof obj.coverStyle === 'string' ? obj.coverStyle : base.coverStyle,
        charmId: typeof obj.charmId === 'string' ? obj.charmId : base.charmId,
        charmMount: typeof obj.charmMount === 'string' ? obj.charmMount : base.charmMount,
        clipId: typeof obj.clipId === 'string' ? obj.clipId : base.clipId,
        coverItems: Array.isArray((obj.coverItemsByTheme as Record<string, PlacedScrapItem[]> | undefined)?.[activeTheme])
          ? (obj.coverItemsByTheme as Record<string, PlacedScrapItem[]>)[activeTheme]
          : base.coverItems,
        spreads: rawSpreads,
      }, scope, targetPersonId);
      if (normalized) {
        await saveScrapbook(scope, normalized);
        importedBooks += 1;
      }
    }
  }

  if (Array.isArray(obj.pages)) {
    const pages = obj.pages.filter((p): p is NotebookPage =>
      validPage(p) && known.has(p.personId)
      && p.at <= notebookMinute(state) && p.turn <= notebookTurn(state));
    if (pages.length) {
      const current = await readNotebook(scope);
      const existingIds = new Set(current.map(p => p.id));
      const fresh = pages.filter(p => !existingIds.has(p.id));
      if (fresh.length) {
        await writeNotebook(scope, fresh);
        importedPages = fresh.length;
      }
    }
  }

  if (!importedBooks && !importedPages && !Array.isArray(obj.pages) && !Array.isArray(obj.scrapbooks) && !obj.spreadsByTheme) {
    throw new Error('未识别到有效的手账备份数据');
  }
  return { importedBooks, importedPages };
}
