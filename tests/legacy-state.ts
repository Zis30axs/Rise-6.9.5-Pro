import type { WorldState } from '../src/frontend/types';
import { reduceState } from '../src/runtime/model';

/** Older saves never contained these fields; do not fake migration by relabelling a new save. */
export function withoutPlayerNeeds(state: WorldState) {
  const { inventory: _inventory, academics: _academics, player, ...rest } = state;
  return { ...rest, contacts: withoutContactProfiles(state).contacts, player: { energy: player.energy, balance: player.balance } };
}

export function withoutAcademics(state: WorldState) {
  const { academics: _academics, ...rest } = state;
  return { ...rest, contacts: withoutContactProfiles(state).contacts };
}

export function withoutContactProfiles(state: WorldState) {
  return { ...state, contacts: state.contacts.map(({ portraitId: _portrait, sourcePersonId: _source, isMain: _main, ...contact }) => contact) };
}

export function withAcademicSelection(state: WorldState): WorldState {
  return reduceState(state, { type: 'choose_academics', majorId: 'computer-science' });
}
