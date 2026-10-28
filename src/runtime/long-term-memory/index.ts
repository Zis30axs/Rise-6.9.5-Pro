import type { WorldState } from '../../frontend/types';
import { activeProtagonist } from '../protagonist-world';
import { loadMemorySettings } from './settings';
import { collectCommittedSources, collectExistingSources } from './source';
import { searchMemory } from './retrieval';
import { scheduleMemoryWork, resumeMemoryWork, pauseMemoryWork, memoryIsPaused, memoryPauseVersion } from './scheduler';
import { ingestSources } from './storage';
import { pruneFutureMemory } from './storage';

const reconciling = new Map<string, Promise<boolean>>();
const unsafeScopes = new Set<string>();

export function memoryArchiveSafe(scope: string): boolean {
  return !!scope && !reconciling.has(scope) && !unsafeScopes.has(scope);
}

export function memoryBootstrap(scope: string, state: WorldState): void {
  try {
    if (!loadMemorySettings().enabled) return;
    unsafeScopes.add(scope);
    const idle = pauseMemoryWork(scope);
    const pauseToken = memoryPauseVersion(scope);
    const cutoff = { turn: state.protagonists?.narrativeTurn ?? 0,
      at: (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute };
    const running = idle.then(() => pruneFutureMemory(scope, cutoff))
      .then(() => {
        unsafeScopes.delete(scope);
        const sources = collectExistingSources(scope, state);
        // Switching chats while the database is reconciling must not restart
        // paid work in the retired chat. Backfill remains safe to ingest.
        if (memoryPauseVersion(scope) !== pauseToken) {
          if (sources.length) void ingestSources(sources).catch(() => {});
          return true;
        }
        if (sources.length) scheduleMemoryWork(scope, sources);
        else resumeMemoryWork(scope);
        return true;
      })
      .catch(() => false)
      .finally(() => { if (reconciling.get(scope) === running) reconciling.delete(scope); });
    reconciling.set(scope, running);
  } catch { /* Older history may not be available. */ }
}
export function memoryCommitted(scope: string, before: WorldState, after: WorldState): void {
  try {
    const settings = loadMemorySettings();
    if (!settings.enabled) return;
    const sources = collectCommittedSources(scope, before, after);
    if (sources.length) {
      const pausedAt = memoryPauseVersion(scope);
      const pending = reconciling.get(scope);
      const archive = (safe: boolean) => {
        if (!safe) return;
        // Reconciliation must finish before a newly committed turn can be
        // archived, or its source may be mistaken for discarded future history.
        void ingestSources(sources).then(() => {
          if (!unsafeScopes.has(scope) && !memoryIsPaused(scope)
            && memoryPauseVersion(scope) === pausedAt) scheduleMemoryWork(scope, []);
        }).catch(() => {});
      };
      if (pending) void pending.then(archive);
      else archive(!unsafeScopes.has(scope));
    }
  } catch { /* No memory feature may prevent a normal game save. */ }
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
