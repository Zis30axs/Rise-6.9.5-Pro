export interface NovelReadingProgress {
  entryId: string;
  segmentId: string;
  segmentIndex: number;
  completed: boolean;
  updatedAt: number;
}

export interface ReadingRowItem {
  id: string;
  entryId: string;
  text: string;
}

const STORAGE_PREFIX = 'unread-city.novel-progress.v1';

// In-memory hot cache ensuring instant, zero-latency access across reactive re-renders
const memoryCache = new Map<string, NovelReadingProgress>();

export function novelProgressStorageKey(scope: string | undefined, protagonistId: string | undefined): string {
  const cleanScope = scope && scope.trim() ? scope.trim().replace(/[^a-zA-Z0-9._:-]/g, '_') : 'default';
  const cleanHero = protagonistId && protagonistId.trim() ? protagonistId.trim() : 'soyo';
  return `${STORAGE_PREFIX}:${cleanScope}:${cleanHero}`;
}

export function getNovelReadingProgress(scope: string | undefined, protagonistId: string | undefined): NovelReadingProgress | null {
  const key = novelProgressStorageKey(scope, protagonistId);
  const hot = memoryCache.get(key);
  if (hot) return hot;
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.segmentId === 'string' && typeof parsed.entryId === 'string') {
      const record: NovelReadingProgress = {
        entryId: parsed.entryId,
        segmentId: parsed.segmentId,
        segmentIndex: Number.isInteger(parsed.segmentIndex) ? parsed.segmentIndex : 0,
        completed: !!parsed.completed,
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      };
      memoryCache.set(key, record);
      return record;
    }
  } catch {
    // Graceful fallback when storage is inaccessible
  }
  return null;
}

export function saveNovelReadingProgress(
  scope: string | undefined,
  protagonistId: string | undefined,
  progress: NovelReadingProgress,
): void {
  const key = novelProgressStorageKey(scope, protagonistId);
  memoryCache.set(key, progress);
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(progress));
  } catch {
    // Keep working seamlessly with memory cache if localStorage is unavailable
  }
}

export function clearNovelReadingProgressCache(): void {
  memoryCache.clear();
}

export interface ResolveCursorOptions {
  rows: readonly ReadingRowItem[];
  entries: readonly { id: string; role: 'user' | 'assistant'; otherSideBeats?: unknown[] }[];
  scope?: string;
  protagonistId?: string;
  lastKnownLatestEntryId?: string | null;
  switchedHero?: boolean;
}

/**
 * Calculates the exact sentence cursor for novel dialogue presentation.
 * Avoids restarting read on existing dialogue when switching chats or protagonists.
 * Only positions to sentence 0 on genuine new generation rounds or a brand-new game opening.
 */
export function resolveReadingCursor({
  rows,
  entries,
  scope,
  protagonistId,
  lastKnownLatestEntryId,
  switchedHero,
}: ResolveCursorOptions): number {
  if (!rows.length) return 0;
  const latestEntry = entries.at(-1);
  const latestEntryId = latestEntry?.id ?? '';

  // Case 1: Genuine new LLM generation round produced in current active interaction
  const isNewGeneration =
    !switchedHero &&
    !!lastKnownLatestEntryId &&
    latestEntryId !== lastKnownLatestEntryId &&
    latestEntry?.role === 'assistant';

  if (isNewGeneration) {
    const start = rows.findIndex(row => row.entryId === latestEntryId);
    return Math.max(0, start);
  }

  // Case 2: Check persisted progress for this chat session and protagonist
  const saved = getNovelReadingProgress(scope, protagonistId);
  if (saved) {
    const matchedIndex = rows.findIndex(row => row.id === saved.segmentId);
    if (matchedIndex >= 0) return matchedIndex;
    if (saved.completed || saved.entryId === latestEntryId) {
      return rows.length - 1;
    }
  }

  // Case 3: Fresh new game initial opening (first session load only, never when switching protagonists)
  const isNewGameOpening =
    !switchedHero &&
    !lastKnownLatestEntryId &&
    entries.length === 1 &&
    entries[0]?.role === 'assistant' &&
    !entries[0]?.otherSideBeats?.length &&
    (!scope || scope === 'default' || scope.includes('fresh'));

  if (isNewGameOpening) {
    const start = rows.findIndex(row => row.entryId === latestEntryId);
    return Math.max(0, start);
  }

  // Case 4: Existing conversation reopened, reloaded, or protagonist switched
  // Stay at the end of the existing dialogue instead of restarting reading from sentence 0
  return rows.length - 1;
}
