import type { WorldState } from '../../frontend/types';
import { activeProtagonist } from '../protagonist-world';
import { loadMemorySettings } from './settings';
import { collectCommittedSources, collectExistingSources } from './source';
import type { MemorySource } from './types';
import { searchMemory } from './retrieval';
import { scheduleMemoryWork, resumeMemoryWork, pauseMemoryWork, memoryIsPaused, memoryPauseVersion } from './scheduler';
import { ingestSources, rows, pruneFutureMemory, hasConfirmedSameTurnDivergence } from './storage';

const reconciling = new Map<string, Promise<boolean>>();
// Track the short IDB ingestion transactions as well as model scheduler work.
// A rollback waits for these writes before pruning the old timeline.
const ingesting = new Map<string, Promise<void>>();
function trackedIngest(scope: string, sources: MemorySource[]): Promise<void> {
  const previous = ingesting.get(scope);
  const current = (previous?.catch(() => {}) ?? Promise.resolve())
    .then(() => ingestSources(sources));
  ingesting.set(scope, current);
  void current.finally(() => {
    if (ingesting.get(scope) === current) ingesting.delete(scope);
  }).catch(() => {});
  return current;
}
const unsafeScopes = new Set<string>();
const outboxWarnings = new Map<string, number>();

export function memoryOutboxWarning(scope: string): number {
  return outboxWarnings.get(scope) ?? 0;
}
export function reportMemoryOutboxWarning(scope: string, count: number): void {
  outboxWarnings.set(scope, Math.max(0, count));
}
export function memoryArchiveSafe(scope: string): boolean {
  return !!scope && !reconciling.has(scope) && !unsafeScopes.has(scope);
}

type IngestAck = (texts: ReadonlyMap<string, string>) => void;
function ackSources(sources: MemorySource[], callback?: IngestAck): void {
  if (!callback || !sources.length) return;
  try { callback(new Map(sources.map(s => [s.key, s.text]))); }
  catch { /* The persisted outbox is replayed on next load. */ }
}

export function memoryBootstrap(scope: string, state: WorldState,
  recovered: MemorySource[] = [], onIngest?: IngestAck): void {
  try {
    if (!loadMemorySettings().enabled) return;
    unsafeScopes.add(scope);
    const previousReconciliation = reconciling.get(scope);
    const priorIngest = ingesting.get(scope);
    const idle = Promise.all([
      pauseMemoryWork(scope),
      previousReconciliation?.catch(() => false) ?? Promise.resolve(true),
      priorIngest?.catch(() => {}) ?? Promise.resolve(),
    ]), pauseToken = memoryPauseVersion(scope);
    const cutoff = { turn: state.protagonists?.narrativeTurn ?? 0,
      at: (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute };
    const sources = collectExistingSources(scope, state);
    const running = idle.then(async () => {
        // Retained story windows are incomplete. A missing key is not
        // divergence, but a retained key with different prose proves it.
        const archived = await rows<MemorySource>('sources', scope);
        const diverged = hasConfirmedSameTurnDivergence(archived, sources, cutoff)
          || hasConfirmedSameTurnDivergence(recovered, sources, cutoff);
        await pruneFutureMemory(scope, cutoff, sources);
        // The discarded same-turn tail must not be ingested right back into
        // the archive by replaying an old outbox after rollback.
        return [...new Map([
          ...recovered.filter(s => !diverged || s.turn < cutoff.turn),
          ...sources,
        ].map(s => [s.key, s])).values()];
      })
      .then(async deduplicated => {
        await trackedIngest(scope, deduplicated);
        // A successful reconciliation also retires proven-invalid branch
        // receipts; no source is acknowledged before the transaction completes.
        ackSources(recovered, onIngest);
        // Another save may already have begun a newer reconciliation.
        if (reconciling.get(scope) === running) {
          unsafeScopes.delete(scope);
          // A retired chat must not restart background paid requests.
          if (memoryPauseVersion(scope) === pauseToken) resumeMemoryWork(scope);
        }
        return true;
      })
      .catch(() => false)
      .finally(() => { if (reconciling.get(scope) === running) reconciling.delete(scope); });
    reconciling.set(scope, running);
  } catch { /* Failed optional backfill must not block gameplay. */ }
}

export function memoryCommitted(scope: string, before: WorldState, after: WorldState,
  committedSources?: MemorySource[], onIngest?: IngestAck): void {
  try {
    if (!loadMemorySettings().enabled) return;
    const sources = committedSources ?? collectCommittedSources(scope, before, after);
    if (!sources.length) return;
    const pending = reconciling.get(scope);
    const pauseToken = memoryPauseVersion(scope);
    const archive = async (safe: boolean) => {
      if (!safe || unsafeScopes.has(scope)) return;
      try {
        await trackedIngest(scope, sources);
        // A rewind may have started while this transaction was in flight.
        // Text-matched receipts prevent clearing corrected sources.
        ackSources(sources, onIngest);
        if (!memoryIsPaused(scope) && memoryPauseVersion(scope) === pauseToken)
          scheduleMemoryWork(scope, []);
      } catch { /* Keep the synchronous chat outbox for recovery. */ }
    };
    if (pending) void pending.then(archive);
    else void archive(true);
  } catch { /* Sidecar never blocks saving. */ }
}

export async function memoryPromptContext(scope: string, state: WorldState, input: string): Promise<string> {
  try {
    const settings = loadMemorySettings();
    if (!settings.enabled || !settings.passive || !input.trim() || !memoryArchiveSafe(scope)) return '';
    const cutoff = (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
    const owner = activeProtagonist(state);
    const matches = await searchMemory(scope, input, owner, cutoff, { limit: 4, narrator: true,
      maxTurn: state.protagonists?.narrativeTurn ?? Number.MAX_SAFE_INTEGER });
    let result = '';
    const limit = settings.tokenBudget * 2;
    for (const item of matches) {
      const line = JSON.stringify({ at: item.at, sourceIds: item.sourceIds,
        narratorOnly: item.narratorOnly, knownBy: item.knownBy,
        summary: item.text.slice(0, 750) });
      if (result.length + line.length > limit) break;
      result += line + '\n';
    }
    return result;
  } catch { return ''; }
}
