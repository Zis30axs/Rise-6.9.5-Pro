/** Display-only bridge between existing saved world positions and the new Tokyo GLB.
 * Do not write these scenic coordinates into MVU, transit, schedules or save data.
 */
import sandboxData from '../../assets/models/unread-city-tokyo-sandbox-data.json';
import { mapLocationPoint } from './campus-map-layout';
import { districtBounds, mapDistricts, type MapDistrictId } from './map-districts';

export type TokyoPoint = { x: number; z: number };
export type TokyoScope = 'city' | MapDistrictId;

export const TOKYO_SANDBOX_MODEL_SHA256 = '12151a8faa994e1740abbd18f67d37a8aa315e8ce60b6b8d03aff0b22f387afb';
export const tokyoDistricts = sandboxData.districts;
export const tokyoLandmarks = sandboxData.landmarks;
export const tokyoCityBounds = {
  minX: Math.min(...tokyoDistricts.map(d => d.minX)),
  maxX: Math.max(...tokyoDistricts.map(d => d.maxX)),
  minZ: Math.min(...tokyoDistricts.map(d => d.minZ)),
  maxZ: Math.max(...tokyoDistricts.map(d => d.maxZ)),
};

const districtById = new Map(tokyoDistricts.map(d => [d.id, d]));
const landmarkById = new Map(tokyoLandmarks.map(p => [p.id, p]));
const districtAnchors = mapDistricts.map(old => {
  const current = districtById.get(old.id);
  if (!current) throw new Error('东京沙盘缺少既有城区：' + old.id);
  const previous = districtBounds(old.id);
  return {
    id: old.id,
    oldX: old.x,
    oldZ: old.z,
    newX: current.x,
    newZ: current.z,
    xScale: Math.min(1.3, Math.max(.4, (current.maxX - current.minX) / (previous.maxX - previous.minX))),
    zScale: Math.min(1.3, Math.max(.4, (current.maxZ - current.minZ) / (previous.maxZ - previous.minZ))),
  };
});

function nearestOldDistrict(x: number, z: number) {
  return districtAnchors.reduce((best, candidate) =>
    Math.hypot(x - candidate.oldX, z - candidate.oldZ) <
    Math.hypot(x - best.oldX, z - best.oldZ) ? candidate : best);
}

/** Legacy scene positions are never modified; only their drawing point changes. */
export function projectOldTokyoPosition(position: TokyoPoint, hint?: MapDistrictId): TokyoPoint {
  const anchor = (hint ? districtAnchors.find(row => row.id === hint) : undefined)
    ?? nearestOldDistrict(position.x, position.z);
  return {
    x: anchor.newX + (position.x - anchor.oldX) * anchor.xScale,
    z: anchor.newZ + (position.z - anchor.oldZ) * anchor.zScale,
  };
}

/** Place, person, protagonist and route-event pins share this height above the ground. */
export const TOKYO_PIN_ELEVATION = 8;

const LEGACY_LANDMARK_EPSILON = 0.6;

function sameScenicPoint(a: TokyoPoint, b: TokyoPoint) {
  return Math.abs(a.x - b.x) < LEGACY_LANDMARK_EPSILON && Math.abs(a.z - b.z) < LEGACY_LANDMARK_EPSILON;
}

/**
 * Location pins on the new sand table.
 * A landmark that still sits on its old flat-map coordinate is projected into
 * the district frame so it meets the 3D building. A landmark authored on the
 * new map (it no longer matches that old point) stays at the saved coordinate.
 */
export function tokyoLocationPosition(locationId: string, hint?: MapDistrictId): TokyoPoint | undefined {
  // The court's indoor and outdoor map pins both refer to the new building.
  if (locationId === 'court-hearing') locationId = 'courthouse';
  const old = mapLocationPoint(locationId);
  const landmark = landmarkById.get(locationId);
  if (landmark && !(old && sameScenicPoint(landmark, old))) return { x: landmark.x, z: landmark.z };
  return old ? projectOldTokyoPosition(old, hint) : undefined;
}

/** One tap opens or closes a route-event description. A gesture and its follow-up click must not both toggle. */
export function applyRouteEventGesture(activeId: string, eventId: string): { activeId: string; gestureAlreadyToggled: true } {
  return { activeId: activeId === eventId ? '' : eventId, gestureAlreadyToggled: true };
}

export function applyRouteEventTap(activeId: string, eventId: string, gestureAlreadyToggled: boolean): { activeId: string; gestureAlreadyToggled: false } {
  if (gestureAlreadyToggled) return { activeId, gestureAlreadyToggled: false };
  return { activeId: activeId === eventId ? '' : eventId, gestureAlreadyToggled: false };
}

export function tokyoDistrictBounds(scope: TokyoScope) {
  return scope === 'city' ? tokyoCityBounds : (districtById.get(scope) ?? tokyoDistricts[0]);
}
