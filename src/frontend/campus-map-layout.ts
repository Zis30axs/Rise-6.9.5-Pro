import { sceneAreas, sceneLandmarks, scenePaths } from './scene-layout';
import { buildingBaseY, takaoPeak, takaoRing, worldBuildings } from './world-layout';
import { campusInteriors } from '../runtime/campus-interiors';
import { districtBounds, campusDetailBounds, type LocalMapScope } from './map-districts';

export type CampusMapScope = LocalMapScope;
export interface MapPoint { x: number; y: number }
export interface MapBuilding { id: string; x: number; z: number; width: number; depth: number; height: number; color: string }

export const campusMapBounds = campusDetailBounds;
export const mapBounds = districtBounds;
export const mapPaths = scenePaths;
export const mapAreas = sceneAreas.filter(area => ['campus', 'neighborhood', 'home', 'commercial', 'city-park', 'downtown', 'grand-commercial', 'takao-mountain'].includes(area.id));
export const mapLandmarks = sceneLandmarks;
export const mapBuildings: readonly MapBuilding[] = worldBuildings;

const aliases: Record<string, string> = { gate: 'south-gate', cafe: 'campus-cafe', dorm: 'residences' };
export function mapLocationPoint(locationId: string): { x: number; z: number } | undefined {
  const room = campusInteriors.find(item => item.id === locationId);
  if (room) return room.entrance;
  return sceneLandmarks.find(item => item.id === (aliases[locationId] ?? locationId));
}

export function visibleMapBuildings(scope: CampusMapScope): readonly MapBuilding[] {
  const bounds = mapBounds(scope);
  return mapBuildings.filter(item => item.x + item.width / 2 >= bounds.minX && item.x - item.width / 2 <= bounds.maxX && item.z + item.depth / 2 >= bounds.minZ && item.z - item.depth / 2 <= bounds.maxZ);
}

/** Keep touch targets apart and choose short leaders as the map rotates. */
export function mapDistrictLabels<T extends { anchor: MapPoint }>(items: readonly T[], width: number, height: number): (T & { label: MapPoint })[] {
  // Six campus pins stay on the historical two-column, three-row frame.
  // Seven city districts need a fourth row; the old search had only six slots and dropped them onto their anchors.
  const columns = [56, Math.max(56, width - 56)];
  const rowCount = Math.max(items.length > 4 ? 3 : 2, Math.ceil(items.length / columns.length));
  const rows = rowCount <= 3
    ? (rowCount === 2 ? [28, height - 48] : [28, (28 + height - 48) / 2, height - 48])
    : Array.from({ length: rowCount }, (_, index) => 26 + (Math.max(26, height - 52) - 26) * index / (rowCount - 1));
  const slots = columns.flatMap(x => rows.map(y => ({ x, y })));
  let best: MapPoint[] = [];
  if (items.length <= 6 && slots.length <= 6) {
    let bestDistance = Infinity;
    const assign = (labels: MapPoint[], remaining: MapPoint[], distance: number) => {
      if (labels.length === items.length) { if (distance < bestDistance) { best = labels; bestDistance = distance; } return; }
      remaining.forEach((slot, index) => {
        const anchor = items[labels.length].anchor;
        assign([...labels, slot], remaining.filter((_, slotIndex) => slotIndex !== index), distance + Math.hypot(slot.x - anchor.x, slot.y - anchor.y));
      });
    };
    assign([], slots, 0);
  } else {
    const used = new Set<number>();
    const labels = items.map(item => item.anchor);
    const pending = items.map((_, index) => index);
    while (pending.length && used.size < slots.length) {
      let choice = pending[0];
      let slotIndex = slots.findIndex((_, index) => !used.has(index));
      let distance = Infinity;
      for (const itemIndex of pending) for (let index = 0; index < slots.length; index++) {
        if (used.has(index)) continue;
        const next = Math.hypot(slots[index].x - items[itemIndex].anchor.x, slots[index].y - items[itemIndex].anchor.y);
        if (next < distance) { distance = next; choice = itemIndex; slotIndex = index; }
      }
      used.add(slotIndex);
      labels[choice] = slots[slotIndex];
      pending.splice(pending.indexOf(choice), 1);
    }
    best = labels;
  }
  return items.map((item, index) => ({ ...item, label: best[index] ?? item.anchor }));
}

export interface DistrictChipMetrics {
  font: number;
  height: number;
  padX: number;
  /** Compensates the map's CSS zoom, then lets the chip grow only a little as you zoom in. */
  layoutScale: number;
  show: boolean;
}

/** City-overview chips stay small. Below this zoom they hide so the buildings stay readable. */
export function districtChipMetrics(viewportWidth: number, viewScale: number): DistrictChipMetrics {
  const zoom = Math.min(4, Math.max(0.45, Number.isFinite(viewScale) ? viewScale : 1));
  const narrow = viewportWidth < 480;
  const font = narrow ? 9 : 10;
  const height = narrow ? 16 : 18;
  const padX = narrow ? 4 : 5;
  const screenFactor = Math.min(1.08, Math.max(0.7, 0.9 + 0.16 * Math.log2(zoom)));
  return { font, height, padX, layoutScale: screenFactor / zoom, show: zoom >= 0.8 };
}

export function districtChipWidth(text: string, metrics: Pick<DistrictChipMetrics, 'font' | 'padX' | 'layoutScale'>) {
  return Math.ceil([...text].length * metrics.font * metrics.layoutScale + metrics.padX * 2 * metrics.layoutScale);
}

export interface ScreenBox { x: number; y: number; w: number; h: number }

/** Screen rectangle of an extruded footprint, used so a chip can step off the roof. */
export function screenBuildingBoxes(buildings: readonly MapBuilding[], project: (x: number, z: number, elevation?: number) => MapPoint, pad = 4): ScreenBox[] {
  return buildings.map(building => {
    const xs = [building.x - building.width / 2, building.x + building.width / 2];
    const zs = [building.z - building.depth / 2, building.z + building.depth / 2];
    const points = xs.flatMap(x => zs.flatMap(z => [project(x, z, 0), project(x, z, building.height)]));
    const minX = Math.min(...points.map(point => point.x)) - pad;
    const maxX = Math.max(...points.map(point => point.x)) + pad;
    const minY = Math.min(...points.map(point => point.y)) - pad;
    const maxY = Math.max(...points.map(point => point.y)) + pad;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  });
}

function boxesOverlap(a: ScreenBox, b: ScreenBox) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Small chips near each district. A chip that would cover a building or another chip is omitted. */
export function placeDistrictChips<T extends { anchor: MapPoint; shortName: string }>(
  items: readonly T[],
  obstacles: readonly ScreenBox[],
  width: number,
  height: number,
  metrics: DistrictChipMetrics,
): (T & { label: MapPoint; visible: boolean; chipWidth: number; chipHeight: number })[] {
  if (!metrics.show) return items.map(item => ({ ...item, label: item.anchor, visible: false, chipWidth: 0, chipHeight: 0 }));
  const placed: ScreenBox[] = [];
  const chipHeight = metrics.height * metrics.layoutScale;
  return items.map(item => {
    const chipWidth = districtChipWidth(item.shortName, metrics);
    const offsets: [number, number][] = [[0, -(chipHeight + 10)]];
    for (let ring = 1; ring <= 6; ring++) {
      const step = ring * (chipHeight + 8);
      offsets.push([0, -step], [0, step], [step * 1.6, -chipHeight], [-step * 1.6, -chipHeight], [step, step * 0.6], [-step, step * 0.6]);
    }
    const spot = offsets.map(([dx, dy]) => ({ x: item.anchor.x + dx, y: item.anchor.y + dy })).find(center => {
      const box = { x: center.x - chipWidth / 2, y: center.y - chipHeight / 2, w: chipWidth, h: chipHeight };
      const inside = box.x >= 4 && box.y >= 4 && box.x + box.w <= width - 4 && box.y + box.h <= height - 4;
      return inside && !placed.some(other => boxesOverlap(box, other)) && !obstacles.some(other => boxesOverlap(box, other));
    });
    if (!spot) return { ...item, label: item.anchor, visible: false, chipWidth, chipHeight };
    placed.push({ x: spot.x - chipWidth / 2, y: spot.y - chipHeight / 2, w: chipWidth, h: chipHeight });
    return { ...item, label: spot, visible: true, chipWidth, chipHeight };
  });
}

/** Place round touch targets with a coarse grid so each candidate is not compared with every previous box. */
export function separatePoints(anchors: readonly MapPoint[], width: number, height: number, diameter = 44): { x: number; y: number; moved: boolean }[] {
  const placed: MapPoint[] = [];
  const cell = Math.max(8, diameter);
  const grid = new Map<string, number[]>();
  const blocked = (x: number, y: number) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const bucket = grid.get(`${cx + ox}:${cy + oy}`);
      if (!bucket) continue;
      for (const index of bucket) if (Math.hypot(placed[index].x - x, placed[index].y - y) < diameter - 0.5) return true;
    }
    return false;
  };
  const offsets: [number, number][] = [[0, 0]];
  for (let ring = 1; ring <= 5; ring++) {
    const step = ring * (diameter + 2);
    offsets.push([0, -step], [0, step], [-step, 0], [step, 0], [-step, -step], [step, -step], [-step, step], [step, step]);
  }
  return anchors.map(anchor => {
    const spot = offsets.map(([dx, dy]) => ({ x: anchor.x + dx, y: anchor.y + dy }))
      .find(candidate => candidate.x >= diameter / 2 && candidate.x <= width - diameter / 2 && candidate.y >= diameter / 2 && candidate.y <= height - diameter / 2 && !blocked(candidate.x, candidate.y))
      ?? { x: Math.max(diameter / 2, Math.min(width - diameter / 2, anchor.x)), y: Math.max(diameter / 2, Math.min(height - diameter / 2, anchor.y)) };
    const index = placed.length;
    placed.push(spot);
    const key = `${Math.floor(spot.x / cell)}:${Math.floor(spot.y / cell)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(index);
    else grid.set(key, [index]);
    return { ...spot, moved: Math.hypot(spot.x - anchor.x, spot.y - anchor.y) > 2 };
  });
}

/** One fixed oblique projection for the slab, roads, buildings and live pins. */
export interface MapCameraView { center?: { x: number; z: number }; zoom?: number; overhead?: number }
export function createCampusMapProjection(width: number, height: number, bearing: number, scope: CampusMapScope, view: MapCameraView = {}) {
  const bounds = mapBounds(scope);
  const angle = (Number.isFinite(bearing) ? bearing : 0) * Math.PI / 180;
  const overhead = Math.min(1, Math.max(0, view.overhead ?? 0));
  const cos = Math.cos(angle), sin = Math.sin(angle), compression = .62 + .38 * overhead;
  const elevationScale = 1 - overhead * .94;
  const raw = (x: number, z: number, elevation = 0): MapPoint => ({ x: cos * x - sin * z, y: (sin * x + cos * z) * compression - elevation });
  const corners = [bounds.minX, bounds.maxX].flatMap(x => [bounds.minZ, bounds.maxZ].flatMap(z => [raw(x, z), raw(x, z, -4)]));
  for (const building of visibleMapBuildings(scope)) for (const x of [building.x - building.width / 2, building.x + building.width / 2]) {
    for (const z of [building.z - building.depth / 2, building.z + building.depth / 2]) corners.push(raw(x, z, building.height + buildingBaseY(building)));
  }
  if (scope === 'city' || scope === 'takao-mountain') {
    corners.push(raw(takaoPeak.x, takaoPeak.z, takaoPeak.height));
    for (const point of takaoRing(1, 8)) corners.push(raw(point.x, point.z));
  }
  const minX = Math.min(...corners.map(point => point.x)), maxX = Math.max(...corners.map(point => point.x));
  const minY = Math.min(...corners.map(point => point.y)), maxY = Math.max(...corners.map(point => point.y));
  const unit = Math.max(.001, Math.min(Math.max(1, width - 24) / (maxX - minX), Math.max(1, height - 24) / (maxY - minY))) * Math.max(.1, Math.min(32, view.zoom ?? 1));
  const a = cos * unit, b = sin * unit * compression, c = -sin * unit, d = cos * unit * compression;
  const e = view.center ? width / 2 - a * view.center.x - c * view.center.z : width / 2 - (minX + maxX) * unit / 2;
  const f = view.center ? height / 2 - b * view.center.x - d * view.center.z : height / 2 - (minY + maxY) * unit / 2;
  return { unit, a, b, c, d, e, f, compression, elevationScale, metersPerPixel: Math.hypot(d, b) / Math.abs(a * d - b * c),
    project: (x: number, z: number, elevation = 0): MapPoint => ({ x: a * x + c * z + e, y: b * x + d * z + f - elevation * unit * elevationScale }) };
}
