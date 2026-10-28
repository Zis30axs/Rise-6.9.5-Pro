import type { WorldState } from '../../frontend/types';
import { activeProtagonist } from '../protagonist-world';
import { loadMemorySettings } from './settings';
import { collectCommittedSources, collectExistingSources } from './source';
import { searchMemory } from './retrieval';
import { scheduleMemoryWork, resumeMemoryWork, pauseMemoryWork } from './scheduler';
import { pruneFutureMemory } from './storage';

const reconciling = new Map<string, Promise<boolean>>();
const unsafeScopes = new Set<string>();

export function memoryBootstrap(scope: string, state: WorldState): void {
  try {
    if (!loadMemorySettings().enabled) return;
    unsafeScopes.add(scope);
    const idle = pauseMemoryWork(scope);
    const cutoff = { turn: state.protagonists?.narrativeTurn ?? 0,
      at: (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute };
    const running = idle.then(() => pruneFutureMemory(scope, cutoff))
      .then(() => {
        unsafeScopes.delete(scope);
        const sources = collectExistingSources(scope, state);
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
      const pending = reconciling.get(scope);
      if (pending) void pending.then(safe => { if (safe) scheduleMemoryWork(scope, sources); });
      else if (!unsafeScopes.has(scope)) scheduleMemoryWork(scope, sources);
    }
  } catch { /* No memory feature may prevent a normal game save. */ }
}
export async function memoryPromptContext(scope: string, state: WorldState, input: string): Promise<string> {
  try {
    const settings = loadMemorySettings();
    if (!settings.enabled || !settings.passive || !input.trim() || reconciling.has(scope) || unsafeScopes.has(scope)) return '';
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
