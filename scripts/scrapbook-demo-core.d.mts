export type BookThemeId = 'sage' | 'indigo' | 'dusk' | 'blossom';

export interface BookPose {
  yaw: number;
  pitch: number;
  zoom: number;
  isOpen: boolean;
}

export interface BookTheme {
  id: BookThemeId;
  themeLabel: string;
  bookTitle: string;
  coverTag: string;
  coverSub: string;
  backMark: string;
  coverColor: string;
  coverAccent: string;
  spineColor: string;
  metalColor: string;
  inkColor: string;
  ribbonColor: string;
  linerColor: string;
  cornerFinish: string;
  defaultCharmId: string;
  defaultClipId: string;
  defaultCoverStyle: string;
}

export interface SpreadSideContent {
  date: string;
  title: string;
  weather: string;
  mood: string;
  body: string;
  fontStyle?: string;
  inkColor?: string;
  titleMark?: string;
  dateCircled?: boolean;
}

export interface ScrapItemSourceRef {
  kind: string;
  id: string;
  day: number;
}

export interface PlacedScrapItem {
  id: string;
  type: 'sticker' | 'tape' | 'stamp' | 'clipping' | 'note' | 'wax' | 'pressed' | 'doodle' | 'mark' | 'receipt' | 'chat-snippet';
  presetId: string;
  side: 'cover' | 'left' | 'right';
  x: number;
  y: number;
  rotate: number;
  scale: number;
  opacity: number;
  zIndex: number;
  caption: string;
  flipX?: boolean;
  tint?: string;
  sourceRef?: ScrapItemSourceRef;
  dataPayload?: Record<string, unknown>;
}

export interface WorldTransactionItem {
  id: string;
  shop: string;
  itemLabel: string;
  amountYen: number;
  timeText: string;
  meta: string;
  accent: string;
}

export interface WorldMessageItem {
  id: string;
  sender: string;
  stickerId?: string;
  timeText: string;
  location: string;
  text: string;
  accent: string;
}

export interface WorldJournalItem {
  id: string;
  title: string;
  text: string;
  atLabel: string;
}

export interface ScrapbookWorldSnapshot {
  snapshotId: string;
  ownerId: 'soyo' | 'sakiko' | 'emma' | 'renako';
  themeId: BookThemeId;
  label: string;
  clock: { day: number; hour: number; minute: number };
  weatherId: 'sunny' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'hot';
  locationId: string;
  locationName: string;
  player: { energy: number; morale: number; stress: number; health: number; balance: number };
  transactions: WorldTransactionItem[];
  messages: WorldMessageItem[];
  journalEntries: WorldJournalItem[];
}

export interface ExtractedWorldArtifact {
  itemType: PlacedScrapItem['type'];
  presetId: string;
  label: string;
  badge: string;
  sourceRef: ScrapItemSourceRef;
  caption: string;
  dataPayload: Record<string, unknown>;
}

export interface BookSpread {
  id: string;
  label: string;
  paperStyle: string;
  left: SpreadSideContent;
  right: SpreadSideContent;
  items: PlacedScrapItem[];
}

export const BOOK_SPEC: Readonly<{
  width: number;
  height: number;
  closedDepth: number;
  coverDepth: number;
  leftBlockDepth: number;
  rightBlockDepth: number;
  hingeZ: number;
  cornerRadius: number;
}>;

export const BOOK_THEMES: Record<BookThemeId, BookTheme>;
export const PAPER_STYLES: ReadonlyArray<{ id: string; label: string }>;
export const FONT_STYLES: ReadonlyArray<{
  id: string;
  label: string;
  displayStack: string;
  italicStack: string;
  bodyStack: string;
}>;
export const INK_COLORS: ReadonlyArray<{ id: string; label: string; hex: string }>;
export const TITLE_MARKS: ReadonlyArray<{ id: string; label: string }>;
export const PEN_MARK_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  kind: string;
  color: string;
  editable: boolean;
  defaultText: string;
}>;
export const WEATHER_OPTIONS: readonly string[];
export const MOOD_OPTIONS: readonly string[];
export const STICKER_DEFS: ReadonlyArray<{ id: string; group: string; label: string; fileKey: string }>;
export const WASHI_TAPES: ReadonlyArray<{ id: string; label: string; bg: string; stripe: string; ink: string }>;
export const STAMP_PRESETS: ReadonlyArray<{ id: string; label: string; sub: string; color: string }>;
export const CLIPPING_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  kind: string;
  title: string;
  subtitle: string;
  meta: string;
  price: string;
  accent: string;
}>;
export const STICKY_NOTE_PRESETS: ReadonlyArray<{ id: string; label: string; bg: string; line: string; ink: string; pin: string }>;
export const WAX_SEAL_PRESETS: ReadonlyArray<{ id: string; label: string; outer: string; inner: string; glyph: string; text: string }>;
export const PRESSED_PRESETS: ReadonlyArray<{ id: string; label: string; kind: string; accent: string; tint: string }>;
export const DOODLE_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  kind: string;
  editable: boolean;
  defaultText: string;
  accent: string;
}>;
export const DESK_MOODS: ReadonlyArray<{ id: string; label: string; short: string }>;
export const CHARM_PRESETS: ReadonlyArray<{ id: string; label: string; kind: string; chain: string; metal: string; accent: string }>;
export const CHARM_MOUNTS: ReadonlyArray<{ id: string; label: string }>;
export const BOOK_CLIPS: ReadonlyArray<{ id: string; label: string; color: string; wire: string }>;
export const COVER_STYLES: ReadonlyArray<{ id: string; label: string }>;

export function resolveCharmAnchor(mountId: string): { x: number; y: number; z: number };
export function stepCharmPendulum(
  physics: { angle: number; vel: number; tilt: number },
  deltaSec: number,
  tiltBias?: number,
): { angle: number; vel: number; tilt: number; settled: boolean };

export function clamp(value: number, min: number, max: number): number;
export function angled3DPose(): BookPose;
export function flatEditPose(): BookPose;
export function closedFrontPose(): BookPose;
export function backCoverPose(): BookPose;
export function rotateBookPose(pose: BookPose, dx: number, dy: number): BookPose;
export function zoomBookPose(pose: BookPose, ratio: number): BookPose;
export function fitBookScale(pose: BookPose, availableWidth: number, availableHeight: number): number;
export function isBackFacing(yaw: number): boolean;
export function isFlatEnough(pose: BookPose): boolean;
export function buildDefaultCoverItemsByTheme(): Record<BookThemeId, PlacedScrapItem[]>;
export function buildDefaultSpreadsByTheme(): Record<BookThemeId, BookSpread[]>;
export function createBlankSpread(index: number): BookSpread;
export function createItemFromPreset(
  type: PlacedScrapItem['type'],
  presetId: string,
  side?: PlacedScrapItem['side'],
  existingItems?: PlacedScrapItem[],
  extra?: Partial<Pick<PlacedScrapItem, 'caption' | 'tint' | 'sourceRef' | 'dataPayload' | 'x' | 'y' | 'rotate' | 'scale'>>,
): PlacedScrapItem;
export function updatePlacedItem(
  items: PlacedScrapItem[],
  id: string,
  patch: Partial<PlacedScrapItem>,
): PlacedScrapItem[];
export function moveItemLayer(
  items: PlacedScrapItem[],
  id: string,
  direction: 'front' | 'back',
): PlacedScrapItem[];

export const WORLD_WEATHER_META: Readonly<Record<ScrapbookWorldSnapshot['weatherId'], { id: string; label: string; icon: string; spreadWeather: string }>>;
export const WORLD_SNAPSHOT_PRESETS: ReadonlyArray<ScrapbookWorldSnapshot>;
export function formatWorldCalendarDay(day: number): {
  day: number;
  iso: string;
  year: number;
  month: number;
  date: number;
  weekdayLabel: string;
  display: string;
  shortDate: string;
  dotDate: string;
};
export function normalizeWorldSnapshot(raw: unknown): ScrapbookWorldSnapshot;
export function adaptWorldStateToSnapshot(
  hostState: Record<string, unknown>,
  options?: { locationNames?: Record<string, string> },
): ScrapbookWorldSnapshot;
export function derivePageHeaderFromSnapshot(rawSnapshot: unknown): {
  dateText: string;
  weatherText: string;
  moodText: string;
  suggestedTitle: string;
  suggestedDeskMood: 'day' | 'lamp' | 'night';
  statusSummary: string;
};
export function extractWorldMemories(rawSnapshot: unknown): {
  receipts: ExtractedWorldArtifact[];
  messages: ExtractedWorldArtifact[];
  stamps: ExtractedWorldArtifact[];
  notes: ExtractedWorldArtifact[];
};
export function exportNotebookPagesCompat(
  spreadsByTheme: Record<string, BookSpread[]>,
  activeThemeId: BookThemeId | string,
  rawSnapshot?: unknown,
): Array<{
  id: string;
  personId: string;
  title: string;
  text: string;
  kind: 'character' | 'observer';
  at: number;
  turn: number;
  sourceId: string;
}>;
export function exportScrapbookBackup(bundleInput: Record<string, unknown>): Record<string, unknown>;
export function importScrapbookBackup(
  rawInput: string | Record<string, unknown>,
  activeThemeId?: BookThemeId | string,
): Record<string, unknown>;
