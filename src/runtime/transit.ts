import type { InteriorPresence, ScenePresence, TransitState } from '../frontend/types';

export const TRANSIT_STOP_RANGE = 6;
export const TRANSIT_SEQUENCE_LIMIT = 1_000_000_000;

export interface TransitStop {
  id: 'campus' | 'home' | 'commercial' | 'city-park';
  label: string;
  locationId: string;
  x: number;
  z: number;
  yaw: number;
}

/** The campus stop already existed; the other stops belong to the farther city districts. */
export const transitStops: readonly TransitStop[] = [
  { id: 'campus', label: '校园南门站', locationId: 'bus-stop', x: 46, z: 38, yaw: 3.141 },
  { id: 'home', label: '家园站', locationId: 'home', x: -180, z: 150, yaw: 0 },
  { id: 'commercial', label: '商业区站', locationId: 'commercial', x: 180, z: 150, yaw: 0 },
  { id: 'city-park', label: '城市公园站', locationId: 'city-park', x: 180, z: -150, yaw: 0 },
];

export const transitVehicles = [
  { id: 'btr82a', label: 'BTR-82A' },
  { id: 'zbd04a', label: 'ZBD-04A' },
] as const;

export interface TransitRoute { stop: TransitStop; minutes: number; fare: number }
const cityRoutes = [
  { stopId: 'home', minutes: 45, fare: 6 },
  { stopId: 'commercial', minutes: 25, fare: 3 },
  { stopId: 'city-park', minutes: 35, fare: 4 },
] as const;

export function createTransitState(): TransitState { return { sequence: 0, lastRide: null }; }

export function getNearbyTransitStop(scene: ScenePresence | null, interior: InteriorPresence | null = null): TransitStop | null {
  if (!scene || interior || !Number.isFinite(scene.x) || !Number.isFinite(scene.z)) return null;
  return transitStops.find(stop => Math.hypot(scene.x - stop.x, scene.z - stop.z) <= TRANSIT_STOP_RANGE) ?? null;
}

/** Each outer district has a direct return service; changing outer lines takes place at campus. */
export function getTransitRoutes(stopId: string): TransitRoute[] {
  if (stopId === 'campus') return cityRoutes.map(route => ({ stop: transitStops.find(stop => stop.id === route.stopId)!, minutes: route.minutes, fare: route.fare }));
  const route = cityRoutes.find(route => route.stopId === stopId);
  return route ? [{ stop: transitStops[0]!, minutes: route.minutes, fare: route.fare }] : [];
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
    nearbyStop: nearbyStop ? { id: nearbyStop.id, label: nearbyStop.label, routes: getTransitRoutes(nearbyStop.id).map(route => ({ toStopId: route.stop.id, destination: route.stop.label, minutes: route.minutes, fare: route.fare })) } : null,
    lastRide: ride ? {
      ...ride,
      vehicle: transitVehicles.find(vehicle => vehicle.id === ride.vehicleId)!.label,
      from: transitStops.find(stop => stop.id === ride.fromStopId)!.label,
      to: transitStops.find(stop => stop.id === ride.toStopId)!.label,
      alreadyCommitted: true,
    } : null,
  };
}
