import type { WorldState } from '../../frontend/types';
import { activeProtagonist } from '../protagonist-world';
import { loadMemorySettings } from './settings';
import { collectCommittedSources } from './source';
import { searchMemory } from './retrieval';
import { scheduleMemoryWork } from './scheduler';

export function memoryCommitted(scope: string, before: WorldState, after: WorldState): void {
  try {
    const settings = loadMemorySettings();
    if (!settings.enabled) return;
    const sources = collectCommittedSources(scope, before, after);
    if (sources.length) scheduleMemoryWork(scope, sources);
  } catch { /* No memory feature may prevent a normal game save. */ }
}
export async function memoryPromptContext(scope: string, state: WorldState, input: string): Promise<string> {
  try {
    const settings = loadMemorySettings();
    if (!settings.enabled || !settings.passive || !input.trim()) return '';
    const cutoff = (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
    const owner = activeProtagonist(state);
    const matches = await searchMemory(scope, input, owner, cutoff, { limit: 4, narrator: true });
    let result = '';
    const limit = settings.tokenBudget * 2;
    for (const item of matches) {
      const line = JSON.stringify({ at: item.at, sourceIds: item.sourceIds,
        narratorOnly: item.narratorOnly, knownBy: item.knownBy, summary: item.text.slice(0, 750) });
      if (result.length + line.length > limit) break;
      result += line + '\n';
    }
    return result;
  } catch { return ''; }
}
