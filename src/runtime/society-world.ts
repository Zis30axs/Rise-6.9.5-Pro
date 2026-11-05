import type { WorldState } from '../frontend/types';
import { activeProtagonist, gameMinute } from './protagonist-world';
import { musicPersonId } from './livehouse';
import { applySocietyCommand, createSocietyState, parseSocietyState, settleSocietyState, type SocietyCommand, type SocietyContext } from './society';

/** The active controller acts for themselves; never select a remote actor from untrusted input. */
export function commitSocietyCommand(world: WorldState, requestId: string, command: SocietyCommand): WorldState {
  if (!world.protagonists) throw new Error('社交组织需要已启用的四主角世界');
  const next: WorldState = structuredClone(world);
  const owner = activeProtagonist(next);
  const context: SocietyContext = {
    at: gameMinute(next),
    actor: owner,
    personId: musicPersonId(owner),
    knownPersonIds: [...new Set(next.contacts.flatMap(contact =>
      [contact.id, ...(contact.sourcePersonId ? [contact.sourcePersonId] : [])]))],
    bands: next.livehouse?.bands ?? [],
  };
  const previous = settleSocietyState(next.protagonists!.society ?? createSocietyState(), context.at);
  const updated = applySocietyCommand(previous, command, requestId, context);
  if (updated === previous) return world;
  next.protagonists!.society = parseSocietyState(updated, context.at);
  next.protagonists!.revision++;
  return next;
}

/** Resolve expiring influence contests on the same authoritative game clock. */
export function settleSocietyWorld(before:WorldState,after:WorldState):void {
  if(!after.protagonists?.society)return;
  const end=gameMinute(after);
  after.protagonists.society=settleSocietyState(after.protagonists.society,end);
}

