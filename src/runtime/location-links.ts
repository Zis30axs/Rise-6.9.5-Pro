import type { WorldState } from '../frontend/types';
import { campusInteriors, getCampusInterior } from './campus-interiors';
import { novelDestinations } from './model';

export interface AdjacentLocation {
  id: string;
  label: string;
  kind: 'enter' | 'exit' | 'nearby' | 'transit';
}

/** Undirected connections between the existing reachable outdoor landmarks. */
const outdoorLinks: readonly (readonly [string, string])[] = [
  ['gate', 'library'], ['gate', 'cafe'], ['gate', 'junction'], ['gate', 'bus-stop'],
  ['library', 'teaching'], ['library', 'dorm'], ['library', 'cafe'],
  ['dorm', 'teaching'], ['teaching', 'sports'], ['sports', 'cafe'],
  ['junction', 'bookshop'], ['junction', 'convenience'], ['junction', 'bus-stop'],
  ['bookshop', 'convenience'], ['convenience', 'street-cafe'],
  ['street-cafe', 'bus-stop'], ['street-cafe', 'pocket-park'], ['convenience', 'pocket-park'],
];
const distantLocations = new Set(['home', 'commercial', 'city-park']);
const areaExits: Readonly<Record<string, readonly string[]>> = {
  promenade: ['gate', 'library', 'cafe', 'dorm', 'sports'],
  campus: ['library', 'teaching', 'dorm', 'sports', 'gate'],
  neighborhood: ['junction', 'bookshop', 'convenience', 'street-cafe', 'bus-stop', 'pocket-park'],
  'city-roads': ['bus-stop', 'home', 'commercial', 'city-park'],
};

/** Only offer destinations supported by the existing travel engine; rooms expose their door first. */
export function getAdjacentLocations(state: Pick<WorldState, 'locationId' | 'interior'>): AdjacentLocation[] {
  const room = getCampusInterior(state.interior?.roomId ?? state.locationId);
  const origin = room?.parentLocationId ?? state.locationId;
  const result: AdjacentLocation[] = [];
  const add = (id: string, kind: AdjacentLocation['kind']) => {
    const destination = novelDestinations.find(item => item.id === id);
    if (!destination || id === state.locationId || result.some(item => item.id === id)) return;
    result.push({ id, label: destination.name, kind });
  };
  if (room) {
    add(room.parentLocationId, 'exit');
    return result;
  }
  campusInteriors.filter(item => item.parentLocationId === origin).forEach(item => add(item.id, 'enter'));
  for (const [from, to] of outdoorLinks) {
    if (from === origin) add(to, 'nearby');
    if (to === origin) add(from, 'nearby');
  }
  for (const id of areaExits[origin] ?? []) add(id, distantLocations.has(id) || origin === 'city-roads' ? 'transit' : 'nearby');
  if (distantLocations.has(origin)) add('bus-stop', 'transit');
  if (origin === 'bus-stop') distantLocations.forEach(id => add(id, 'transit'));
  return result;
}
