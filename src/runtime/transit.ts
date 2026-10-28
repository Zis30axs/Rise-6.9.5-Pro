import type { InteriorPresence, ScenePresence, TransitState } from '../frontend/types';

export type TransitVehicleId = 'btr82a' | 'zbd04a';

export const TRANSIT_STOP_RANGE = 6;
export const TRANSIT_SEQUENCE_LIMIT = 1_000_000_000;

export interface TransitStop {
  id: 'campus' | 'home' | 'commercial' | 'city-park' | 'downtown' | 'grand-commercial' | 'takao-mountain';
  label: string;
  locationId: string;
  x: number;
  z: number;
  yaw: number;
}

/** Historical stop IDs/coordinates are save-compatible; labels describe Tokyo neighborhoods. */
export const transitStops: readonly TransitStop[] = [
  { id: 'campus', label: '高田校园接驳站', locationId: 'bus-stop', x: 46, z: 38, yaw: 3.141 },
  { id: 'home', label: '杂司谷住宅区站', locationId: 'home', x: -180, z: 150, yaw: 0 },
  { id: 'commercial', label: '池袋／东池袋站', locationId: 'commercial', x: 180, z: 150, yaw: 0 },
  { id: 'downtown', label: '目白／目白台站', locationId: 'downtown', x: -20, z: 185, yaw: 0 },
  { id: 'city-park', label: '神田川绿道站', locationId: 'city-park', x: 180, z: -150, yaw: 0 },
  { id: 'grand-commercial', label: '新宿／大型商业区站', locationId: 'grand-commercial', x: -180, z: -150, yaw: 0 },
  { id: 'takao-mountain', label: '高尾山风景区站', locationId: 'takao-mountain', x: 0, z: -175, yaw: 0 },
];

export const transitVehicles = [
  { id: 'btr82a', label: '都营巴士·地区接驳' },
  { id: 'zbd04a', label: '东京Metro·副都心线联程' },
] as const;

export interface TransitRoute { stop: TransitStop; minutes: number; fare: number }
const cityRoutes = [
  { stopId: 'home', minutes: 12, fare: 180 },
  { stopId: 'commercial', minutes: 18, fare: 210 },
  { stopId: 'city-park', minutes: 16, fare: 180 },
  // Only the Metro-linked journey serves Mejiro/Mejirodai; fares are game balancing values.
  { stopId: 'downtown', minutes: 22, fare: 240 },
  { stopId: 'grand-commercial', minutes: 20, fare: 220 },
  { stopId: 'takao-mountain', minutes: 25, fare: 260 },
] as const;

export function createTransitState(): TransitState { return { sequence: 0, lastRide: null }; }

export function getNearbyTransitStop(scene: ScenePresence | null, interior: InteriorPresence | null = null): TransitStop | null {
  if (!scene || interior || !Number.isFinite(scene.x) || !Number.isFinite(scene.z)) return null;
  return transitStops.find(stop => Math.hypot(scene.x - stop.x, scene.z - stop.z) <= TRANSIT_STOP_RANGE) ?? null;
}

/** Each outer district has a direct return service; changing outer lines takes place at campus. */
export function getTransitRoutes(stopId: string, vehicleId: TransitVehicleId = 'btr82a'): TransitRoute[] {
  if (stopId === 'campus') return cityRoutes.filter(route => route.stopId !== 'downtown' || vehicleId === 'zbd04a')
    .map(route => ({ stop: transitStops.find(stop => stop.id === route.stopId)!, minutes: route.minutes, fare: route.fare }));
  if (stopId === 'downtown' && vehicleId !== 'zbd04a') return [];
  const route = cityRoutes.find(route => route.stopId === stopId);
  return route ? [{ stop: transitStops[0]!, minutes: route.minutes, fare: route.fare }] : [];
}

/** Novel-mode route planning chooses the rail-linked journey for Mejiro. */
export function selectTravelVehicle(originLocationId: string, destinationLocationId: string, requested?: string): string {
  if (requested) return requested;
  const downtown = (id: string) => id === 'downtown' || id === 'toyokawa-house';
  return downtown(originLocationId) || downtown(destinationLocationId) ? 'zbd04a' : 'btr82a';
}

export function isFarTransitLocation(locationId: string): boolean {
  return transitStops.some(stop => stop.id !== 'campus' && stop.locationId === locationId);
}

export function isOutsideCampus(scene: ScenePresence | null): boolean {
  return !!scene && (scene.x < -70 || scene.x > 70 || scene.z < -60 || scene.z > 90);
}

export function requiresTransitReturn(locationId: string, scene: ScenePresence | null): boolean {
  return isFarTransitLocation(locationId) || isOutsideCampus(scene);
}

/** Read-only narrative facts: viewing them never settles another ride. */
export function getTransitContext(transit: TransitState, scene: ScenePresence | null, interior: InteriorPresence | null = null) {
  const nearbyStop = getNearbyTransitStop(scene, interior);
  const ride = transit.lastRide;
  return {
    count: transit.sequence,
    nearbyStop: nearbyStop ? { id: nearbyStop.id, label: nearbyStop.label,
      routes: getTransitRoutes(nearbyStop.id, nearbyStop.id === 'downtown' ? 'zbd04a' : 'btr82a')
        .map(route => ({ toStopId: route.stop.id, destination: route.stop.label, minutes: route.minutes, fare: route.fare })) } : null,
    lastRide: ride ? {
      ...ride,
      vehicle: transitVehicles.find(vehicle => vehicle.id === ride.vehicleId)!.label,
      from: transitStops.find(stop => stop.id === ride.fromStopId)!.label,
      to: transitStops.find(stop => stop.id === ride.toStopId)!.label,
      alreadyCommitted: true,
    } : null,
  };
}
