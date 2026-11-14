/** Beijing map-only travel catalogue. The host model owns all committed state. */
import atlas from '../../assets/beijing-sandbox/sandbox.json';
import type { InternationalLeg } from './california';

export interface BeijingPlace {
  id: string;
  name: string;
  subtitle: string;
  description: string;
}

export const beijingPlaces: readonly BeijingPlace[] = atlas.places.map(({ id, name, subtitle, description }) => ({
  id, name, subtitle, description,
}));

const beijingIds: ReadonlySet<string> = new Set(beijingPlaces.map(place => place.id));
export function isBeijingLocation(id: string): boolean { return beijingIds.has(id); }

/**
 * Story-economy fares (JPY), not actual Beijing transport prices. These are
 * provisional authored game values and must not be mistaken for live fares.
 * The uploaded atlas's route minutes are likewise illustrative.
 */
const localLegs: readonly InternationalLeg[] = atlas.routes.map(route => ({
  from: route.from,
  to: route.to,
  minutes: route.minutes,
  fare: route.method === '步行' ? 0 : 300,
  method: route.method,
}));

/** Composite flight + airport transfer, because the current 33-node model has no PEK anchor. */
const entryLeg: InternationalLeg = {
  from: 'haneda-airport',
  to: 'beijing-beijing-station',
  minutes: 330,
  fare: 42000,
  method: '东京至北京国际航班及机场接驳',
};

const allLegs: readonly InternationalLeg[] = [...localLegs, entryLeg];

export function beijingTravelLeg(from: string, to: string): InternationalLeg | null {
  const outward = allLegs.find(leg => leg.from === from && leg.to === to);
  if (outward) return outward;
  const backward = allLegs.find(leg => leg.from === to && leg.to === from);
  return backward ? { ...backward, from, to } : null;
}

export function beijingConnections(from: string): InternationalLeg[] {
  return allLegs.flatMap(leg => leg.from === from ? [leg]
    : leg.to === from ? [{ ...leg, from, to: leg.from }] : []);
}

/** Tokyo world clock is authoritative; Beijing civil time is exactly one hour behind. */
export function beijingLocalTime(clock: { hour: number; minute: number }) {
  return { hour: (clock.hour + 23) % 24, minute: clock.minute };
}
