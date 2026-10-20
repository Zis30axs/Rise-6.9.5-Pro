/**
 * Pure, data-only route policy for the downtown recovery.
 *
 * Not yet wired into model.ts, the 3D scene or the UI. This module quotes an
 * itinerary; it NEVER moves a player, advances the clock or charges a wallet.
 * Existing three routes keep their published fares and durations.
 */
export type CityStopId = 'campus' | 'home' | 'commercial' | 'city-park' | 'downtown';
export type CityVehicleId = 'btr82a' | 'zbd04a';
export interface CityLeg {
  readonly fromStopId: CityStopId;
  readonly toStopId: CityStopId;
  readonly vehicleId: CityVehicleId;
  readonly minutes: number;
  readonly fare: number;
}
export interface CityJourney {
  readonly legs: readonly CityLeg[];
  readonly minutes: number;
  readonly fare: number;
}
interface DistrictService {
  readonly minutes: number;
  readonly fare: number;
  readonly expressOnly: boolean;
}

const services: Readonly<Record<Exclude<CityStopId, 'campus'>, DistrictService>> =
  Object.freeze({
    home: Object.freeze({ minutes: 45, fare: 6, expressOnly: false }),
    commercial: Object.freeze({ minutes: 25, fare: 3, expressOnly: false }),
    'city-park': Object.freeze({ minutes: 35, fare: 4, expressOnly: false }),
    // Authored game-balancing values, not real-world fares or canon facts.
    downtown: Object.freeze({ minutes: 60, fare: 12, expressOnly: true }),
  });

function assertStop(value: unknown): asserts value is CityStopId {
  if (value !== 'campus' &&
      (typeof value !== 'string' || !Object.hasOwn(services, value))) {
    throw new Error('未知公交站点');
  }
}
function assertVehicle(value: unknown): asserts value is CityVehicleId {
  if (value !== 'btr82a' && value !== 'zbd04a') throw new Error('未知车辆');
}

/** Map the manor to its area's bus stop, not a new direct bus/teleport target. */
export function cityStopForLocation(locationId: string): CityStopId | null {
  if (locationId === 'bus-stop' || locationId === 'campus') return 'campus';
  if (locationId === 'toyokawa-home') return 'downtown';
  return Object.hasOwn(services, locationId) ? locationId as CityStopId : null;
}

/**
 * At most two bus legs, with outer-district transfers at campus.
 * Without an explicit selection, each leg selects the lowest allowed vehicle.
 * Explicit BTR selection is rejected for a downtown leg, never silently changed.
 */
export function quoteCityJourney(
  from: CityStopId,
  to: CityStopId,
  selectedVehicle?: CityVehicleId,
): CityJourney {
  assertStop(from); assertStop(to);
  if (selectedVehicle !== undefined) assertVehicle(selectedVehicle);
  if (from === to) return Object.freeze({ legs: Object.freeze([]), minutes: 0, fare: 0 });
  const stops: readonly CityStopId[] = from === 'campus' || to === 'campus'
    ? [from, to] : [from, 'campus', to];
  const legs: CityLeg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const fromStopId = stops[i - 1]!, toStopId = stops[i]!;
    const district = fromStopId === 'campus' ? toStopId : fromStopId;
    if (district === 'campus') throw new Error('无效线路');
    const service = services[district];
    const vehicleId = selectedVehicle ?? (service.expressOnly ? 'zbd04a' : 'btr82a');
    if (service.expressOnly && vehicleId !== 'zbd04a') {
      throw new Error('市中心线路仅限 ZBD-04A，请更换车辆');
    }
    legs.push(Object.freeze({
      fromStopId, toStopId, vehicleId,
      minutes: service.minutes, fare: service.fare,
    }));
  }
  return Object.freeze({
    legs: Object.freeze(legs),
    minutes: legs.reduce((sum, leg) => sum + leg.minutes, 0),
    fare: legs.reduce((sum, leg) => sum + leg.fare, 0),
  });
}

/** Local navigation must use walking; callers must not route via campus here. */
export function isDowntownLocalWalk(from: string, to: string): boolean {
  return (from === 'downtown' && to === 'toyokawa-home') ||
    (from === 'toyokawa-home' && to === 'downtown');
}
