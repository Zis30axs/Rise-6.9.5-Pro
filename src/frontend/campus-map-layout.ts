import { sceneAreas, sceneBounds, sceneLandmarks, scenePaths } from './scene-layout';
import { campusInteriors } from '../runtime/campus-interiors';

export type CampusMapScope = 'campus' | 'city';
export interface MapPoint { x: number; y: number }
export interface MapBuilding { id: string; x: number; z: number; width: number; depth: number; height: number; color: string }

export const campusMapBounds = { minX: -74, maxX: 74, minZ: -64, maxZ: 94 };
export const mapBounds = (scope: CampusMapScope) => scope === 'city' ? sceneBounds : campusMapBounds;
export const mapPaths = scenePaths;
export const mapAreas = sceneAreas.filter(area => ['campus', 'neighborhood', 'home', 'commercial', 'city-park'].includes(area.id));
export const mapLandmarks = sceneLandmarks;

// Major building footprints mirror the outdoor scene. A regression compares
// these with its real colliders so future scene edits cannot silently drift.
export const mapBuildings: readonly MapBuilding[] = [
  { id: 'building:0:-14', x: 0, z: -14, width: 25, depth: 7, height: 10.2, color: '#839583' },
  { id: 'building:-18:-10', x: -18, z: -10, width: 7.5, depth: 12, height: 13.5, color: '#b7ac8b' },
  { id: 'building:18:-12', x: 18, z: -12, width: 8, depth: 11, height: 8.6, color: '#a4b4a2' },
  { id: 'building:14:-2.6', x: 14, z: -2.6, width: 7, depth: 5, height: 4, color: '#b97e5b' },
  { id: 'building:teaching-building', x: 0, z: -46, width: 32, depth: 12, height: 12.4, color: '#9ba68f' },
  { id: 'building:residence-building', x: -49, z: -18, width: 18, depth: 20, height: 13.8, color: '#ad846c' },
  { id: 'building:residence-north-building', x: -49, z: -44, width: 18, depth: 10, height: 10.8, color: '#9ba9a0' },
  { id: 'building:shop-book', x: -22, z: 65, width: 18, depth: 12, height: 8.7, color: '#aa726d' },
  { id: 'building:shop-convenience', x: 21, z: 65, width: 16, depth: 12, height: 7.2, color: '#709d8b' },
  { id: 'building:shop-cafe', x: 48, z: 65, width: 19, depth: 12, height: 8.2, color: '#a38365' },
  { id: 'building:home-apartment', x: -192, z: 117, width: 26, depth: 18, height: 13.8, color: '#aa8770' },
  { id: 'building:home-west-apartment', x: -226, z: 178, width: 20, depth: 24, height: 10.8, color: '#9ba9a0' },
  { id: 'building:home-east-apartment', x: -163, z: 181, width: 19, depth: 25, height: 13.8, color: '#ada58c' },
  { id: 'building:commercial-shop:151', x: 151, z: 111, width: 20, depth: 15, height: 9.2, color: '#709d8b' },
  { id: 'building:commercial-shop:178', x: 178, z: 111, width: 23, depth: 15, height: 9.2, color: '#aa726d' },
  { id: 'building:commercial-shop:210', x: 210, z: 111, width: 28, depth: 15, height: 9.2, color: '#a38365' },
  { id: 'building:commercial-corner', x: 216, z: 184, width: 28, depth: 20, height: 14, color: '#ad846c' },
];

const aliases: Record<string, string> = { gate: 'south-gate', cafe: 'campus-cafe', dorm: 'residences' };
export function mapLocationPoint(locationId: string): { x: number; z: number } | undefined {
  const room = campusInteriors.find(item => item.id === locationId);
  if (room) return room.entrance;
  return sceneLandmarks.find(item => item.id === (aliases[locationId] ?? locationId));
}

export function visibleMapBuildings(scope: CampusMapScope): readonly MapBuilding[] {
  const bounds = mapBounds(scope);
  return mapBuildings.filter(item => item.x >= bounds.minX && item.x <= bounds.maxX && item.z >= bounds.minZ && item.z <= bounds.maxZ);
}

/** Four separate touch targets; choose the shortest leaders as the map rotates. */
export function mapDistrictLabels<T extends { anchor: MapPoint }>(items: readonly T[], width: number, height: number): (T & { label: MapPoint })[] {
  const slots = [56, width - 56].flatMap(x => [28, height - 48].map(y => ({ x, y })));
  let best: MapPoint[] = [], bestDistance = Infinity;
  const assign = (labels: MapPoint[], remaining: MapPoint[], distance: number) => {
    if (labels.length === items.length) { if (distance < bestDistance) { best = labels; bestDistance = distance; } return; }
    remaining.forEach((slot, index) => {
      const anchor = items[labels.length].anchor;
      assign([...labels, slot], remaining.filter((_, i) => i !== index), distance + Math.hypot(slot.x - anchor.x, slot.y - anchor.y));
    });
  };
  assign([], slots, 0);
  return items.map((item, index) => ({ ...item, label: best[index] ?? item.anchor }));
}

/** One fixed oblique projection for the slab, roads, buildings and live pins. */
export function createCampusMapProjection(width: number, height: number, bearing: number, scope: CampusMapScope) {
  const bounds = mapBounds(scope);
  const angle = (Number.isFinite(bearing) ? bearing : 0) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle), compression = .62;
  const raw = (x: number, z: number, elevation = 0): MapPoint => ({ x: cos * x - sin * z, y: (sin * x + cos * z) * compression - elevation });
  const corners = [bounds.minX, bounds.maxX].flatMap(x => [bounds.minZ, bounds.maxZ].flatMap(z => [raw(x, z), raw(x, z, -4)]));
  for (const building of visibleMapBuildings(scope)) for (const x of [building.x - building.width / 2, building.x + building.width / 2]) {
    for (const z of [building.z - building.depth / 2, building.z + building.depth / 2]) corners.push(raw(x, z, building.height));
  }
  const minX = Math.min(...corners.map(point => point.x)), maxX = Math.max(...corners.map(point => point.x));
  const minY = Math.min(...corners.map(point => point.y)), maxY = Math.max(...corners.map(point => point.y));
  const unit = Math.max(.001, Math.min(Math.max(1, width - 24) / (maxX - minX), Math.max(1, height - 24) / (maxY - minY)));
  const a = cos * unit, b = sin * unit * compression, c = -sin * unit, d = cos * unit * compression;
  const e = width / 2 - (minX + maxX) * unit / 2, f = height / 2 - (minY + maxY) * unit / 2;
  return { unit, a, b, c, d, e, f, metersPerPixel: Math.hypot(d, b) / Math.abs(a * d - b * c),
    project: (x: number, z: number, elevation = 0): MapPoint => ({ x: a * x + c * z + e, y: b * x + d * z + f - elevation * unit }) };
}
