/** Display-only bridge between California runtime places and the new California GLB.
 * Do not write these scenic coordinates into MVU, transit, schedules or save data.
 *
 * Coordinate frame (same convention as the Tokyo sandbox: x east, z south, y up):
 *   x = (lon - LON0) * K_LON, z = (LAT0 - lat) * K_LAT, 1 unit is about 2.2 km.
 * The projection is documented in the data JSON ("projection") and implemented
 * by scripts/build_california_sandbox_glb.py, which also authors the GLB.
 */
import sandboxData from '../../assets/models/unread-city-california-sandbox-data.json';

export type CaliforniaPoint = { x: number; z: number };
export type CaliforniaRegionId =
  | 'bay-area' | 'north-coast' | 'sacramento-valley' | 'sierra-nevada'
  | 'central-valley' | 'central-coast' | 'southern-california' | 'desert';
export type CaliforniaScope = 'state' | CaliforniaRegionId;

export const CALIFORNIA_SANDBOX_MODEL_SHA256 =
  'bd0e09b93b7edd5db7f0058154054b5fefd3a284580ddd28eb90721dc7cc3330';
export const CALIFORNIA_SANDBOX_MODEL_BYTES = 1866268;

/** Projection constants; must match the generator and the data JSON. */
export const CALIFORNIA_PROJECTION = {
  lonCenter: -119.25,
  latCenter: 37.25,
  unitsPerDegreeLat: 480 / 9.5,
  unitsPerDegreeLon: (480 / 9.5) * 0.7984,
} as const;

/** lat/lon -> model (x, z). North is -z, east is +x. */
export function projectCaliforniaLatLon(lat: number, lon: number): CaliforniaPoint {
  return {
    x: (lon - CALIFORNIA_PROJECTION.lonCenter) * CALIFORNIA_PROJECTION.unitsPerDegreeLon,
    z: (CALIFORNIA_PROJECTION.latCenter - lat) * CALIFORNIA_PROJECTION.unitsPerDegreeLat,
  };
}

export const californiaDistricts = sandboxData.districts;
export const californiaLandmarks = sandboxData.landmarks;
export const californiaRoutes = sandboxData.routes;
export const californiaMountains = sandboxData.mountains;

/**
 * The four recognizable landmark structures (Golden Gate Bridge, Hollywood
 * Sign, Transamerica Pyramid, Griffith Observatory). Each is a named mesh in
 * the GLB (`california-landmark-<id>`) and a `kind: 'landmark'` building in
 * the data JSON, so the scene can label and fly to it. The defensive cast
 * is needed because only these four building entries carry the extra fields.
 */
export type CaliforniaLandmarkStructure = {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: string;
  landmarkId: string;
  desc: string;
};
export const californiaLandmarkStructures = (
  sandboxData.buildings as unknown as Record<string, unknown>[]
).filter((b) => b['kind'] === 'landmark') as unknown as CaliforniaLandmarkStructure[];

export const californiaStateBounds = {
  minX: Math.min(...californiaDistricts.map(d => d.minX)),
  maxX: Math.max(...californiaDistricts.map(d => d.maxX)),
  minZ: Math.min(...californiaDistricts.map(d => d.minZ)),
  maxZ: Math.max(...californiaDistricts.map(d => d.maxZ)),
};

const districtById = new Map(californiaDistricts.map(d => [d.id, d]));
const landmarkById = new Map(californiaLandmarks.map(p => [p.id, p]));

/** Place, person and protagonist pins share this height above the ground. */
export const CALIFORNIA_PIN_ELEVATION = 8;

/**
 * Location pins on the state sand table.
 * Haneda is the Tokyo departure point, not a California place, so it has no
 * pin on this map. Every California place id resolves to its landmark.
 */
export function californiaLocationPosition(locationId: string): CaliforniaPoint | undefined {
  const landmark = landmarkById.get(locationId);
  return landmark ? { x: landmark.x, z: landmark.z } : undefined;
}

/** Waypoints of one travel leg, for the route ribbon. Direction-agnostic. */
export function californiaRoutePoints(from: string, to: string): CaliforniaPoint[] | undefined {
  const route = californiaRoutes.find(row =>
    (row.from === from && row.to === to) || (row.from === to && row.to === from));
  if (!route) return undefined;
  const points = route.points.map(point => ({ x: point.x, z: point.z }));
  return route.from === from ? points : [...points].reverse();
}

/** Highest peak (Mt. Whitney) for camera fitting. */
export function californiaSummit(): { x: number; y: number; z: number } {
  const peak = californiaMountains.reduce((best, mountain) =>
    mountain.height > best.height ? mountain : best, californiaMountains[0]);
  return { x: peak.x, y: peak.height, z: peak.z };
}

export function californiaDistrictBounds(scope: CaliforniaScope) {
  return scope === 'state' ? californiaStateBounds : (districtById.get(scope) ?? californiaDistricts[0]);
}
