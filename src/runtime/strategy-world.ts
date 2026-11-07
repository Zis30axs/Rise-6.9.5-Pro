import type { WorldState } from '../frontend/types';
import { applyStrategyCommand, createStrategyState, parseStrategyState, settleStrategyState, type StrategyCommand } from './strategy';

const gameMinute = (state: WorldState) => (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;

/** UI-originated commands never advance the clock or invoke the narrative model. */
export function commitStrategyCommand(world: WorldState, requestId: string, command: StrategyCommand): WorldState {
  if (!world.protagonists) throw new Error('请先初始化四主角世界');
  const next: WorldState = structuredClone(world), p = next.protagonists!;
  const before = p.strategy ?? createStrategyState(gameMinute(world));
  const changed = applyStrategyCommand(before, command, requestId);
  if (changed === before) return world; // same request, same payload
  p.strategy = parseStrategyState(changed, gameMinute(world));
  p.revision++;
  return next;
}

/** Called exactly once along with background-life settlement in the authoritative timeline. */
export function settleStrategyWorld(before: WorldState, after: WorldState): void {
  if (!after.protagonists) return;
  const start = gameMinute(before), end = gameMinute(after);
  if (end < start) throw new Error('国策时钟不能倒退');
  const saved = after.protagonists.strategy ?? createStrategyState(start);
  if (saved.cursor !== start) throw new Error('国策时钟与权威时间不同步');
  after.protagonists.strategy = settleStrategyState(saved,end);
}
