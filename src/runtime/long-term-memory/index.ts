import type { WorldState } from '../../frontend/types';
import { activeProtagonist } from '../protagonist-world';
import { loadMemorySettings } from './settings';
import { collectCommittedSources, collectExistingSources } from './source';
import type { MemorySource } from './types';
import { searchMemory } from './retrieval';
import { scheduleMemoryWork, resumeMemoryWork, pauseMemoryWork, memoryIsPaused, memoryPauseVersion } from './scheduler';
import { ingestSources } from './storage';
import { pruneFutureMemory } from './storage';

const reconciling = new Map<string, Promise<boolean>>();
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

type IngestAck = (keys: ReadonlySet<string>) => void;
function ackSources(sources: MemorySource[], callback?: IngestAck): void {
  if (!callback || !sources.length) return;
  try { callback(new Set(sources.map(s => s.key))); }
  catch { /* The persisted outbox is replayed on next load. */ }
}

export function memoryBootstrap(scope: string, state: WorldState,
  recovered: MemorySource[] = [], onIngest?: IngestAck): void {
  try {
    if (!loadMemorySettings().enabled) return;
    unsafeScopes.add(scope);
    const idle = pauseMemoryWork(scope), pauseToken = memoryPauseVersion(scope);
    const cutoff = { turn: state.protagonists?.narrativeTurn ?? 0,
      at: (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute };
    const sources = collectExistingSources(scope, state);
    const running = idle.then(() => pruneFutureMemory(scope, cutoff, sources))
      .then(async () => {
        const deduplicated = [...new Map([...recovered, ...sources].map(s => [s.key, s])).values()];
        await ingestSources(deduplicated);
        ackSources(recovered, onIngest);
        unsafeScopes.delete(scope);
        // A retired chat must not restart background paid requests.
        if (memoryPauseVersion(scope) === pauseToken) resumeMemoryWork(scope);
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
        await ingestSources(sources);
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
        factuality: item.factuality, summary: item.text.slice(0, 750) });
      if (result.length + line.length > limit) break;
      result += line + '\n';
    }
    return result;
  } catch { return ''; }
}
