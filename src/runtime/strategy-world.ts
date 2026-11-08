import type { WorldState } from '../frontend/types';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import { adjustEnergy } from './energy';
import { emptyLivehouseVisit, INSTRUMENT_SKILL_CAP } from './livehouse-visit';
import { personState } from './protagonist-world';
import {
  DECISION_CATALOG, applyStrategyCommand, createStrategyState, parseStrategyState,
  settleStrategyState, type StrategyCommand,
} from './strategy';

const gameMinute = (state: WorldState) => (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
const clampStat = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/** UI-originated commands never advance the clock or invoke the narrative model. */
export function commitStrategyCommand(world: WorldState, requestId: string, command: StrategyCommand): WorldState {
  if (!world.protagonists) throw new Error('请先初始化四主角世界');
  const next: WorldState = structuredClone(world), p = next.protagonists!;
  const before = p.strategy ?? createStrategyState(gameMinute(world));
  const isReplay = before.receipts.some(row => row.id === requestId);
  const decision = command.type === 'choose_decision'
    ? DECISION_CATALOG.find(row => row.id === command.decisionId && row.owner === command.owner)
    : undefined;
  const isPlayableOwner = (PROTAGONISTS as readonly string[]).includes(command.owner);
  const person = isPlayableOwner ? personState(next, command.owner as ProtagonistId) : null;

  if (!isReplay && command.type === 'choose_decision' && decision?.energyCost && person) {
    if (person.player.energy < decision.energyCost) {
      throw new Error(`精力不足，执行「${decision.title}」需要 ${decision.energyCost} 点精力。`);
    }
  }

  const changed = applyStrategyCommand(before, command, requestId);
  if (changed === before) return world; // same request, same payload

  if (command.type === 'choose_decision' && decision && person) {
    if (decision.energyCost) {
      person.player.energy = adjustEnergy(person.player.energy, -decision.energyCost);
    }
    if (decision.moraleDelta) {
      person.player.morale = clampStat(person.player.morale + decision.moraleDelta);
    }
    if (decision.stressDelta) {
      person.player.stress = clampStat(person.player.stress + decision.stressDelta);
    }
    if (decision.instrumentDelta && isPlayableOwner) {
      const ownerId = command.owner as ProtagonistId;
      const visit = next.livehouseVisit ?? emptyLivehouseVisit();
      visit.skill[ownerId] = Math.min(INSTRUMENT_SKILL_CAP, (visit.skill[ownerId] ?? 0) + decision.instrumentDelta);
      next.livehouseVisit = visit;
    }
    const stamp = `第 ${next.clock.day} 天 ${String(next.clock.hour).padStart(2, '0')}:${String(next.clock.minute).padStart(2, '0')}`;
    const costNote = decision.energyCost ? `消耗精力 ${decision.energyCost}` : '';
    const instNote = decision.instrumentDelta ? `乐器熟练度 +${decision.instrumentDelta}` : '';
    const extra = [costNote, instNote].filter(Boolean).join('，');
    person.journal.push({
      id: `decision:${requestId}`,
      at: stamp,
      text: `执行个人决议「${decision.title}」${extra ? `（${extra}）` : ''}。`,
    });
    if (person.journal.length > 100) person.journal.splice(0, person.journal.length - 100);
  }

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
  after.protagonists.strategy = settleStrategyState(saved, end);
}
