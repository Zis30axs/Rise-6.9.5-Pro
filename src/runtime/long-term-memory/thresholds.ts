import type { MemorySource } from './types';

/** Keep 75 new operation logs without requesting an archival summary. */
export const MEMORY_EARLY_JOURNAL_LIMIT = 75;
/** Normal archival windows are at least 20 saved story turns apart. */
export const MEMORY_MIN_TURN_INTERVAL = 20;

export type PendingMemoryEvidence = Pick<MemorySource, 'id' | 'kind' | 'turn'>;

/** Split provenance chunks of one journal entry count as one logged action. */
export function pendingJournalCount(sources: readonly PendingMemoryEvidence[]): number {
  return new Set(sources
    .filter(source => source.kind === 'journal')
    .map(source => source.id.replace(/:part:\d+$/, ''))).size;
}

/**
 * Return an inclusive story-turn boundary for all due unsummarized sources.
 * Null means no model summarization request should be scheduled yet.
 *
 * The >75-log rule is ONLY eligible immediately after a committed
 * foreground LLM story turn. Ordinary UI actions only append sources, so an
 * idle player never spends a model call by exceeding the log threshold.
 * 0 remains the old idle sentinel for unfinished due-batch tracking.
 */
export function memoryArchiveBoundary(
  pending: readonly PendingMemoryEvidence[], lastScheduledTurn: number,
  dueThrough: number, configuredInterval: number, forced = false,
  narrativeJustCommitted = false,
): number | null {
  if (!pending.length) return null;
  const latestTurn = pending.reduce((latest, source) => Math.max(latest, source.turn), 0);
  // Count fixed story-floor checkpoints (20, 40, 60...) instead of elapsed
  // turns since the last job: an early 76-log archive must not shift floor 20.
  const window = Math.max(MEMORY_MIN_TURN_INTERVAL, configuredInterval);
  const reachedTurns = Math.floor(latestTurn / window) > Math.floor(lastScheduledTurn / window);
  const exceededJournals = narrativeJustCommitted && pendingJournalCount(pending) > MEMORY_EARLY_JOURNAL_LIMIT;
  if (forced || reachedTurns || exceededJournals) return Math.max(1, dueThrough, latestTurn);
  if (dueThrough > 0 && pending.some(source => source.turn <= dueThrough)) return dueThrough;
  return null;
}
