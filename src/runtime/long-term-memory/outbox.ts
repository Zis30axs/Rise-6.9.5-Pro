import type { MemorySource } from './types';

/**
 * Small synchronous commit journal stored next to unread_city, in the SAME
 * Tavern-Helper replaceVariables operation. IndexedDB ingestion can finish
 * later without having to reconstruct text after story/journal pruning.
 *
 * This is intentionally bounded. On overflow it reports information loss
 * instead of blocking the authoritative game save.
 */
export const MEMORY_OUTBOX_KEY = 'unread_city_memory_outbox_v1';
export const MAX_OUTBOX_SOURCES = 240;
export const MAX_OUTBOX_CHARS = 180_000;

export interface SavedMemoryOutbox {
  version: 1;
  sources: MemorySource[];
  overflowCount: number;
}

function validSource(raw: unknown): raw is MemorySource {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const source = raw as Partial<MemorySource>;
  return typeof source.scope === 'string' && source.scope.length < 3000
    && typeof source.key === 'string' && source.key.length < 3200
    && typeof source.id === 'string' && source.id.length < 1000
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
export function readSavedMemoryOutbox(vars: Record<string, unknown>, scope: string,
  maxTurn = Number.MAX_SAFE_INTEGER, maxMinute = Number.MAX_SAFE_INTEGER): SavedMemoryOutbox {
  const empty: SavedMemoryOutbox = { version: 1, sources: [], overflowCount: 0 };
  const raw = vars[MEMORY_OUTBOX_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.sources)) return empty;
  const overflowCount = Number.isSafeInteger(value.overflowCount)
    ? Math.max(0, Math.min(Number(value.overflowCount), Number.MAX_SAFE_INTEGER)) : 0;
  return {
    version: 1,
    overflowCount,
    sources: value.sources.slice(0, MAX_OUTBOX_SOURCES)
      .filter(s => validSource(s) && s.scope === scope
        && s.turn <= maxTurn && s.at <= maxMinute) as MemorySource[],
  };
}

export function appendSavedMemoryOutbox(vars: Record<string, unknown>, scope: string,
  additions: MemorySource[]): Record<string, unknown> {
  if (!additions.length) return vars;
  const current = readSavedMemoryOutbox(vars, scope);
  const known = new Set(current.sources.map(item => item.key));
  const sources = [...current.sources];
  let chars = sources.reduce((sum, row) => sum + JSON.stringify(row).length, 0);
  let overflowCount = current.overflowCount;
  for (const source of additions) {
    if (source.scope !== scope || !validSource(source) || known.has(source.key)) continue;
    known.add(source.key);
    const size = JSON.stringify(source).length;
    if (sources.length >= MAX_OUTBOX_SOURCES || chars + size > MAX_OUTBOX_CHARS) {
      overflowCount++;
      continue;
    }
    sources.push(source);
    chars += size;
  }
  return { ...vars, [MEMORY_OUTBOX_KEY]: {
    version: 1, sources, overflowCount,
  } satisfies SavedMemoryOutbox };
}

export function acknowledgeSavedMemoryOutbox(vars: Record<string, unknown>,
  scope: string, ingestedKeys: ReadonlySet<string>): Record<string, unknown> {
  const current = readSavedMemoryOutbox(vars, scope);
  const sources = current.sources.filter(s => !ingestedKeys.has(s.key));
  if (sources.length === current.sources.length) return vars;
  return { ...vars, [MEMORY_OUTBOX_KEY]: {
    version: 1, sources, overflowCount: current.overflowCount,
  } satisfies SavedMemoryOutbox };
}

export function outboxOverflowCount(vars: Record<string, unknown>, scope: string): number {
  return readSavedMemoryOutbox(vars, scope).overflowCount;
}
