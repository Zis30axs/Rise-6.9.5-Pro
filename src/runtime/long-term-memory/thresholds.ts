import type { MemorySource } from './types';

/** Keep 75 new operation logs without requesting an archival summary. */
export const MEMORY_EARLY_JOURNAL_LIMIT = 75;
/** The narrative archive cycle cannot run before 20 committed story turns. */
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
 * 0 is the old idle sentinel. For >75 logs at story turn 0, use 1
 * as a positive batch marker until every pending turn-0 source is done.
 */
export function memoryArchiveBoundary(
  pending: readonly PendingMemoryEvidence[], lastScheduledTurn: number,
  dueThrough: number, configuredInterval: number, forced = false,
): number | null {
  if (!pending.length) return null;
  const latestTurn = pending.reduce((latest, source) => Math.max(latest, source.turn), 0);
  const reachedTurns = latestTurn - lastScheduledTurn >=
    Math.max(MEMORY_MIN_TURN_INTERVAL, configuredInterval);
  const exceededJournals = pendingJournalCount(pending) > MEMORY_EARLY_JOURNAL_LIMIT;
  if (forced || reachedTurns || exceededJournals) return Math.max(1, dueThrough, latestTurn);
  if (dueThrough > 0 && pending.some(source => source.turn <= dueThrough)) return dueThrough;
  return null;
}
