import type { WorldState } from '../frontend/types';
import { novelScenePlaces, getCampusInterior } from './campus-interiors';
import { novelDestinations } from './model';
import { isParisLocation } from './paris';
import { internationalConnections } from './california';

export interface AdjacentLocation {
  id: string;
  label: string;
  kind: 'enter' | 'exit' | 'nearby' | 'transit' | 'flight';
}

/** Undirected connections between the existing reachable outdoor landmarks. */
const outdoorLinks: readonly (readonly [string, string])[] = [
  ['gate', 'library'], ['gate', 'cafe'], ['gate', 'junction'], ['gate', 'bus-stop'],
  ['library', 'teaching'], ['library', 'dorm'], ['library', 'cafe'],
  ['dorm', 'teaching'], ['teaching', 'sports'], ['sports', 'cafe'],
  ['junction', 'bookshop'], ['junction', 'construction-site'], ['junction', 'convenience'], ['junction', 'bus-stop'],
  ['bookshop', 'convenience'], ['bookshop', 'construction-site'], ['convenience', 'street-cafe'],
  ['street-cafe', 'bus-stop'], ['street-cafe', 'pocket-park'], ['convenience', 'pocket-park'],
  ['pocket-park', 'courthouse'], ['construction-site', 'courthouse'],
  ['grand-commercial', 'circle'],
];
const distantLocations = new Set(['home', 'commercial', 'city-park', 'downtown', 'grand-commercial', 'takao-mountain', 'asukayama-park', 'highland']);
const areaExits: Readonly<Record<string, readonly string[]>> = {
  promenade: ['gate', 'library', 'cafe', 'dorm', 'sports'],
  campus: ['library', 'teaching', 'dorm', 'sports', 'gate'],
  neighborhood: ['junction', 'bookshop', 'convenience', 'street-cafe', 'bus-stop', 'pocket-park'],
  'city-roads': ['bus-stop', 'home', 'commercial', 'city-park', 'downtown', 'grand-commercial', 'takao-mountain', 'asukayama-park', 'highland'],
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
    // These doors connect two rooms in a single building.
    for (const [front, back] of [['clinic', 'clinic-room'], ['onigawara-laundry', 'onigawara-laundry-home']]) {
      if (room.id === front) add(back, 'enter');
      if (room.id === back) add(front, 'exit');
    }
    return result;
  }
  novelScenePlaces.filter(item => item.parentLocationId === origin).forEach(item => add(item.id, 'enter'));
  for (const [from, to] of outdoorLinks) {
    if (from === origin) add(to, 'nearby');
    if (to === origin) add(from, 'nearby');
  }
  for (const id of areaExits[origin] ?? []) add(id, distantLocations.has(id) || origin === 'city-roads' ? 'transit' : 'nearby');
  if (distantLocations.has(origin)) add('bus-stop', 'transit');
  if (origin === 'bus-stop') distantLocations.forEach(id => add(id, 'transit'));
  for (const leg of internationalConnections(origin)) {
    const walk = isParisLocation(origin) && leg.fare === 0 && leg.method.endsWith('步行');
    add(leg.to, leg.method.includes('航班') ? 'flight' : walk ? 'nearby' : 'transit');
  }
  return result;
}
