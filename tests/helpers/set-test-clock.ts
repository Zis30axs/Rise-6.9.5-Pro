import type { WorldState } from '../../src/frontend/types';
import { gameMinute } from '../../src/runtime/protagonist-world';

/** Position a fixture on the timeline without playing the intervening actions. */
export function setTestClock(state: WorldState, clock: WorldState['clock']): void {
  state.clock = { ...clock };
  const minute = gameMinute(state);
  const world = state.protagonists;
  if (world?.strategy) world.strategy.cursor = minute;
  if (world?.backgroundLife) {
    world.backgroundLife.cursor = minute;
    for (const person of Object.values(world.backgroundLife.people)) {
      person.nextDecisionAt = Math.max(person.nextDecisionAt, minute);
    }
  }
}
