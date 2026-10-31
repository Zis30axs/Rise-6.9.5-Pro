import type { WorldAction, WorldState } from '../frontend/types';

export const INTERACTION_EVENT_COOLDOWN_MINUTES = 180;
export const INTERACTION_EVENT_MAX_DAILY_OFFERS = 2;
export const INTERACTION_EVENT_HISTORY_LIMIT = 64;

const ARRIVAL_ACTIONS = new Set<WorldAction['type']>([
  'travel', 'novel_travel', 'ride_transit', 'enter_interior', 'leave_interior',
]);
const gameMinute = (state: WorldState) =>
  (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
const owner = (state: WorldState) => state.protagonists?.accounts.active ?? 'soyo';
const location = (state: WorldState, action: WorldAction) =>
  action.type === 'travel' || action.type === 'novel_travel'
    ? action.locationId : state.locationId;

/** Use game time, never browser wall time, so refresh and chat switching cannot reset the gate. */
export function canCheckInteractionEvent(state: WorldState, action: WorldAction): boolean {
  // Dedicated case decisions cannot be interrupted by unrelated random events.
  if (['law_case', 'cook_dish', 'eat_cooked', 'share_cooked'].includes(action.type)) return false;
  const now = gameMinute(state);
  const actor = owner(state);
  const checks = state.interactionEventRate?.checks ?? [];
  const latest = [...checks].reverse().find(check => check.owner === actor);
  if (latest && now - latest.at < INTERACTION_EVENT_COOLDOWN_MINUTES) return false;
  const day = Math.floor(now / 1440);
  const today = checks.filter(check => check.owner === actor && Math.floor(check.at / 1440) === day);
  if (today.filter(check => check.offered).length >= INTERACTION_EVENT_MAX_DAILY_OFFERS) return false;
  if (ARRIVAL_ACTIONS.has(action.type) && today.some(check =>
    check.arrival && check.locationId === location(state, action))) return false;
  return true;
}

/** Stamp only the tentative action snapshot; cancellation or a failed save cannot consume a check. */
export function recordInteractionEventCheck(state: WorldState, action: WorldAction, offered: boolean): WorldState {
  if (!canCheckInteractionEvent(state, action)) throw new Error('随机事件尚在冷却中');
  const at = gameMinute(state);
  const checks = [
    ...(state.interactionEventRate?.checks ?? []).filter(check => check.at >= at - 1440),
    { owner: owner(state), at, locationId: location(state, action), arrival: ARRIVAL_ACTIONS.has(action.type), offered },
  ].slice(-INTERACTION_EVENT_HISTORY_LIMIT);
  return { ...state, interactionEventRate: { version: 1, checks } };
}
