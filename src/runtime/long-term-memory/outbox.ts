import type { MemorySource } from './types';

/**
 * The first tier is written in the SAME synchronous Tavern-Helper save as
 * unread_city. When it fills, overflow is written synchronously to small
 * localStorage pages BEFORE their references are included in that save.
 * Only referenced pages are replayable: a failed main save cannot promote
 * its uncommitted sources into historical facts.
 *
 * Both tiers are bounded and best-effort. When localStorage is unavailable
 * or full, gameplay still saves and the unrecoverable risk is counted.
 */
export const MEMORY_OUTBOX_KEY = 'unread_city_memory_outbox_v1';
export const MAX_OUTBOX_SOURCES = 160;
export const MAX_OUTBOX_CHARS = 96_000;
const SPILL_PREFIX = 'unread-city:memory-source-spill:v1:';
const MAX_SPILL_REFS = 1024;
const MAX_SPILL_SOURCES = 64;
const SPILL_PAYLOAD_CHARS = 42_000;
const MAX_SPILL_PAGE_CHARS = 48_000;

export interface SavedMemoryOutbox {
  version: 1;
  sources: MemorySource[];
  overflowCount: number;
  /** References travel with WorldState; page bodies never enter the game save. */
  spillIds?: string[];
}
interface SpillPage {
  version: 1;
  id: string;
  scope: string;
  sources: MemorySource[];
}
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(id);

function validSource(raw: unknown): raw is MemorySource {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const source = raw as Partial<MemorySource>;
  return typeof source.scope === 'string' && source.scope.length < 3000
    && typeof source.key === 'string' && source.key.length < 3200
    && typeof source.id === 'string' && source.id.length < 1000
    && source.key === JSON.stringify([source.scope, source.id])
    && typeof source.text === 'string' && source.text.length <= 1000
    && typeof source.at === 'number' && Number.isSafeInteger(source.at) && source.at >= 0
    && typeof source.turn === 'number' && Number.isSafeInteger(source.turn) && source.turn >= 0
    && (source.owner === null || typeof source.owner === 'string')
    && Array.isArray(source.knownBy) && source.knownBy.length <= 20
    && source.knownBy.every(id => typeof id === 'string')
    && Array.isArray(source.participants) && source.participants.length <= 32
    && source.participants.every(id => typeof id === 'string')
    && source.processed === false && typeof source.kind === 'string';
}
function eligible(source: unknown, scope: string, maxTurn: number, maxMinute: number): source is MemorySource {
  return validSource(source) && source.scope === scope
    && source.turn <= maxTurn && source.at <= maxMinute;
}
function spillId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
}
function readSpill(scope: string, id: string): MemorySource[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(SPILL_PREFIX + id);
    if (!raw || raw.length > MAX_SPILL_PAGE_CHARS) return null;
    const page = JSON.parse(raw) as Partial<SpillPage>;
    if (page.version !== 1 || page.scope !== scope || page.id !== id
      || !Array.isArray(page.sources) || page.sources.length > MAX_SPILL_SOURCES
      || !page.sources.every(s => validSource(s) && s.scope === scope)) return null;
    return page.sources;
  } catch { return null; }
}
function spillPage(scope: string, sources: MemorySource[]): string | null {
  if (!sources.length) return null;
  const id = spillId();
  const data = JSON.stringify({ version: 1, scope, id, sources } satisfies SpillPage);
  if (data.length > MAX_SPILL_PAGE_CHARS) return null;
  try {
    // setItem is synchronous and atomic for one key. A reference is committed
    // only after this write returns successfully.
    globalThis.localStorage?.setItem(SPILL_PREFIX + id, data);
    if (globalThis.localStorage?.getItem(SPILL_PREFIX + id) !== data) return null;
    return id;
  } catch { return null; }
}

export function readSavedMemoryOutbox(vars: Record<string, unknown>, scope: string,
  maxTurn = Number.MAX_SAFE_INTEGER, maxMinute = Number.MAX_SAFE_INTEGER): SavedMemoryOutbox {
  const empty: SavedMemoryOutbox = { version: 1, sources: [], overflowCount: 0, spillIds: [] };
  const raw = vars[MEMORY_OUTBOX_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.sources)) return empty;
  const overflowCount = Number.isSafeInteger(value.overflowCount)
    ? Math.max(0, Math.min(Number(value.overflowCount), Number.MAX_SAFE_INTEGER)) : 0;
  const spillIds = Array.isArray(value.spillIds) ? [...new Set(value.spillIds.slice(0, MAX_SPILL_REFS)
    .filter(validId))] : [];
  return {
    version: 1, overflowCount, spillIds,
    sources: value.sources.slice(0, MAX_OUTBOX_SOURCES)
      .filter(s => eligible(s, scope, maxTurn, maxMinute)) as MemorySource[],
  };
}

/** Replay every committed tier, including sources no longer in the pruned story. */
export function recoverSavedMemoryOutbox(vars: Record<string, unknown>, scope: string,
  maxTurn = Number.MAX_SAFE_INTEGER, maxMinute = Number.MAX_SAFE_INTEGER): SavedMemoryOutbox {
  const outbox = readSavedMemoryOutbox(vars, scope, maxTurn, maxMinute);
  const sources = new Map(outbox.sources.map(row => [row.key, row]));
  let missing = 0;
  for (const id of outbox.spillIds ?? []) {
    const page = readSpill(scope, id);
    if (!page) { missing++; continue; }
    for (const source of page) {
      if (eligible(source, scope, maxTurn, maxMinute) && !sources.has(source.key))
        sources.set(source.key, source);
    }
  }
  // Missing pages are counted separately from failed source writes. A page may
  // contain multiple rows, so this warning is a lower bound, not a loss total.
  return { ...outbox, sources: [...sources.values()],
    overflowCount: Math.min(Number.MAX_SAFE_INTEGER, outbox.overflowCount + missing) };
}

export function appendSavedMemoryOutbox(vars: Record<string, unknown>, scope: string,
  additions: MemorySource[], maxTurn = Number.MAX_SAFE_INTEGER,
  maxMinute = Number.MAX_SAFE_INTEGER): Record<string, unknown> {
  if (!additions.length && maxTurn === Number.MAX_SAFE_INTEGER) return vars;
  const current = readSavedMemoryOutbox(vars, scope, maxTurn, maxMinute);
  const spillIds = (current.spillIds ?? []).filter(id => {
    const page = readSpill(scope, id);
    // Preserve missing pages as warnings; do not silently erase their receipts.
    return !page || page.some(row => eligible(row, scope, maxTurn, maxMinute));
  });
  const known = new Set(current.sources.map(item => item.key));
  for (const id of spillIds) {
    for (const row of readSpill(scope, id) ?? []) {
      if (eligible(row, scope, maxTurn, maxMinute)) known.add(row.key);
    }
  }
  const sources = [...current.sources];
  let chars = sources.reduce((sum, row) => sum + JSON.stringify(row).length, 0);
  let overflowCount = current.overflowCount;
  const overflow: MemorySource[] = [];
  for (const source of additions) {
    if (known.has(source.key)) continue;
    if (source.scope !== scope || !validSource(source)) { overflowCount++; continue; }
    known.add(source.key);
    const size = JSON.stringify(source).length;
    if (sources.length < MAX_OUTBOX_SOURCES && chars + size <= MAX_OUTBOX_CHARS) {
      sources.push(source);
      chars += size;
    } else overflow.push(source);
  }
  let page: MemorySource[] = [], pageSize = 0;
  const flush = () => {
    if (!page.length) return;
    if (spillIds.length >= MAX_SPILL_REFS) overflowCount += page.length;
    else {
      const id = spillPage(scope, page);
      if (id) spillIds.push(id);
      else overflowCount += page.length;
    }
    page = []; pageSize = 0;
  };
  for (const row of overflow) {
    const size = JSON.stringify(row).length;
    if (size > SPILL_PAYLOAD_CHARS) { overflowCount++; continue; }
    if (page.length >= MAX_SPILL_SOURCES || pageSize + size > SPILL_PAYLOAD_CHARS) flush();
    page.push(row); pageSize += size;
  }
  flush();
  return { ...vars, [MEMORY_OUTBOX_KEY]: {
    version: 1, sources, overflowCount, spillIds,
  } satisfies SavedMemoryOutbox };
}

/** Remove receipts only when the entire page was confirmed by IndexedDB. */
export function acknowledgeSavedMemoryOutbox(vars: Record<string, unknown>,
  scope: string, ingestedKeys: ReadonlySet<string>): Record<string, unknown> {
  const current = readSavedMemoryOutbox(vars, scope);
  const sources = current.sources.filter(s => !ingestedKeys.has(s.key));
  const spillIds = (current.spillIds ?? []).filter(id => {
    const page = readSpill(scope, id);
    return !page || !page.every(s => ingestedKeys.has(s.key));
  });
  if (sources.length === current.sources.length && spillIds.length === (current.spillIds ?? []).length) return vars;
  return { ...vars, [MEMORY_OUTBOX_KEY]: {
    version: 1, sources, overflowCount: current.overflowCount, spillIds,
  } satisfies SavedMemoryOutbox };
}

/** Called only AFTER the chat-variable acknowledgement commits successfully. */
export function releaseAcknowledgedMemorySpills(before: Record<string, unknown>,
  after: Record<string, unknown>, scope: string): void {
  const retained = new Set(readSavedMemoryOutbox(after, scope).spillIds ?? []);
  for (const id of readSavedMemoryOutbox(before, scope).spillIds ?? []) {
    if (retained.has(id)) continue;
    try { globalThis.localStorage?.removeItem(SPILL_PREFIX + id); }
    catch { /* Already in IndexedDB; a leftover page is only wasted space. */ }
  }
}

export function outboxOverflowCount(vars: Record<string, unknown>, scope: string): number {
  return recoverSavedMemoryOutbox(vars, scope).overflowCount;
}
