import type { SceneBounds } from './scene-movement';

/** One outdoor layout for the walkable scene and the city sandbox. Metres are illustrative. */
export const sceneBounds: SceneBounds = { minX: -260, maxX: 260, minZ: -272, maxZ: 260 };

export interface SceneArea extends SceneBounds { id: string; label: string }
export interface SceneLandmark { id: string; label: string; x: number; z: number }
export interface ScenePath { x: number; z: number; width: number; depth: number; kind: 'road' | 'walk' }

export type BuildingFacade = 'facade' | 'stone' | 'brick' | 'wood' | 'shopRed' | 'shopGreen' | 'cafe';

export interface WorldBuilding {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  floors: number;
  columns: number;
  color: string;
  facade: BuildingFacade;
  /** Half-turn keeps shop fronts facing the street. The footprint stays axis-aligned. */
  rotationY?: number;
}

export const CITY_DISTRICT_IDS = ['campus', 'home', 'commercial', 'downtown', 'city-park', 'grand-commercial', 'takao-mountain'] as const;
export type CityDistrictId = typeof CITY_DISTRICT_IDS[number];

// First match wins: named destinations precede the wider campus and street areas.
export const sceneAreas: SceneArea[] = [
  { id: 'library', label: '图书馆前庭', minX: -14, maxX: 14, minZ: -20, maxZ: -6 },
  { id: 'teaching', label: '教学楼广场', minX: -23, maxX: 23, minZ: -58, maxZ: -30 },
  { id: 'residences', label: '宿舍院落', minX: -63, maxX: -28, minZ: -39, maxZ: 6 },
  { id: 'sports', label: '运动场', minX: 28, maxX: 65, minZ: -37, maxZ: 13 },
  { id: 'campus-cafe', label: '校园咖啡露台', minX: 9, maxX: 22, minZ: -6, maxZ: 8 },
  { id: 'promenade', label: '林荫步道', minX: -34, maxX: 34, minZ: 8, maxZ: 24 },
  { id: 'south-gate', label: '校园南门', minX: -9, maxX: 9, minZ: 24, maxZ: 34 },
  { id: 'construction-site', label: '南门建设工地', minX: -67, maxX: -37, minZ: 59, maxZ: 83 },
  { id: 'bookshop', label: '街角书店', minX: -34, maxX: -10, minZ: 55, maxZ: 73 },
  { id: 'convenience', label: '便利店门前', minX: 11, maxX: 31, minZ: 55, maxZ: 73 },
  { id: 'street-cafe', label: '街边咖啡馆', minX: 36, maxX: 61, minZ: 55, maxZ: 73 },
  { id: 'bus-stop', label: '高田接驳站', minX: 37, maxX: 58, minZ: 32, maxZ: 42 },
  { id: 'pocket-park', label: '口袋公园', minX: 22, maxX: 65, minZ: 74, maxZ: 89 },
  { id: 'junction', label: '南门十字路口', minX: -10, maxX: 10, minZ: 39, maxZ: 59 },
  { id: 'home', label: '杂司谷住宅区', minX: -250, maxX: -150, minZ: 120, maxZ: 210 },
  { id: 'commercial', label: '池袋·东池袋商业区', minX: 130, maxX: 250, minZ: 110, maxZ: 210 },
  { id: 'downtown', label: '目白·目白台住宅区', minX: -115, maxX: 110, minZ: 145, maxZ: 255 },
  { id: 'city-park', label: '神田川沿岸公园', minX: 120, maxX: 250, minZ: -210, maxZ: -100 },
  { id: 'grand-commercial', label: '新宿·大型商业娱乐区', minX: -250, maxX: -120, minZ: -210, maxZ: -100 },
  { id: 'takao-mountain', label: '高尾山自然风景区', minX: -95, maxX: 95, minZ: -262, maxZ: -125 },
  { id: 'campus', label: '高田·西早稻田校园', minX: -70, maxX: 70, minZ: -60, maxZ: 27 },
  { id: 'neighborhood', label: '高田校园南门街区', minX: -70, maxX: 70, minZ: 27, maxZ: 90 },
  { id: 'city-roads', label: '城市连接道路', ...sceneBounds },
];

export const sceneLandmarks: SceneLandmark[] = [
  { id: 'library', label: '图书馆', x: 0, z: -6 },
  { id: 'teaching', label: '教学楼', x: 0, z: -36 },
  { id: 'residences', label: '宿舍院落', x: -49, z: -5 },
  { id: 'sports', label: '运动场', x: 46, z: -11 },
  { id: 'campus-cafe', label: '校园咖啡', x: 14, z: 0.9 },
  { id: 'south-gate', label: '南门', x: 0, z: 29 },
  { id: 'junction', label: '十字路口', x: 0, z: 48 },
  { id: 'construction-site', label: '建设工地', x: -52, z: 62 },
  { id: 'bookshop', label: '街角书店', x: -22, z: 56.5 },
  { id: 'convenience', label: '便利店', x: 21, z: 56.5 },
  { id: 'street-cafe', label: '街边咖啡', x: 48, z: 56.5 },
  { id: 'bus-stop', label: '公交站', x: 47, z: 39.5 },
  { id: 'pocket-park', label: '口袋公园', x: 37, z: 80 },
  { id: 'home', label: '杂司谷接驳站', x: -180, z: 150 },
  { id: 'commercial', label: '池袋接驳站', x: 180, z: 150 },
  { id: 'downtown', label: '目白台接驳站', x: -20, z: 185 },
  { id: 'city-park', label: '神田川绿道站', x: 180, z: -150 },
  { id: 'grand-commercial', label: '新宿大型商业区接驳站', x: -180, z: -150 },
  { id: 'takao-mountain', label: '高尾山接驳站', x: 0, z: -175 },
];

export const scenePaths: ScenePath[] = [
  { x: 0, z: 60, width: 8, depth: 60, kind: 'road' },
  { x: 0, z: 48, width: 138, depth: 10, kind: 'road' },
  { x: 0, z: 48, width: 470, depth: 10, kind: 'road' },
  { x: -180, z: 94.5, width: 10, depth: 103, kind: 'road' },
  { x: 180, z: -35, width: 10, depth: 258, kind: 'road' },
  { x: 152.5, z: 94, width: 65, depth: 10, kind: 'road' },
  { x: 125, z: 117.5, width: 10, depth: 57, kind: 'road' },
  { x: -180, z: 141, width: 120, depth: 10, kind: 'road' },
  { x: 180, z: 141, width: 120, depth: 10, kind: 'road' },
  { x: 180, z: -159, width: 120, depth: 10, kind: 'road' },
  { x: 0, z: -105, width: 8, depth: 80, kind: 'road' },
  { x: 0, z: -155, width: 90, depth: 10, kind: 'road' },
  { x: 0, z: 131, width: 10, depth: 166, kind: 'road' },
  { x: 0, z: 185, width: 195, depth: 10, kind: 'road' },
  { x: 0, z: 208, width: 180, depth: 6, kind: 'walk' },
  { x: -20, z: 185, width: 98, depth: 6, kind: 'walk' },
  { x: 50, z: 219, width: 6, depth: 34, kind: 'walk' },
  { x: -12, z: 131, width: 4.6, depth: 156, kind: 'walk' },
  { x: -151.5, z: 56.5, width: 165, depth: 5, kind: 'walk' },
  { x: 151.5, z: 56.5, width: 165, depth: 5, kind: 'walk' },
  { x: -171.5, z: 103, width: 5, depth: 98, kind: 'walk' },
  { x: 171.5, z: -31, width: 5, depth: 250, kind: 'walk' },
  { x: 152.5, z: 102.5, width: 43, depth: 5, kind: 'walk' },
  { x: 133.5, z: 126.5, width: 5, depth: 53, kind: 'walk' },
  { x: -180, z: 150, width: 116, depth: 6, kind: 'walk' },
  { x: 180, z: 150, width: 116, depth: 6, kind: 'walk' },
  { x: 180, z: -150, width: 116, depth: 6, kind: 'walk' },
  { x: -190, z: 130, width: 86, depth: 6, kind: 'walk' },
  { x: 190, z: 127, width: 94, depth: 10, kind: 'walk' },
  { x: 190, z: -174, width: 110, depth: 5, kind: 'walk' },
  { x: 225, z: -163, width: 5, depth: 24, kind: 'walk' },
  { x: 0, z: -155, width: 80, depth: 5, kind: 'walk' },
  { x: -35, z: -185, width: 30, depth: 5, kind: 'walk' },
  { x: 25, z: -215, width: 40, depth: 5, kind: 'walk' },
  { x: 0, z: 12, width: 5.3, depth: 42, kind: 'walk' },
  { x: 0, z: -9.4, width: 23, depth: 4.8, kind: 'walk' },
  { x: 0, z: 10, width: 66, depth: 4.5, kind: 'walk' },
  { x: 8, z: 4.7, width: 4, depth: 11.6, kind: 'walk' },
  { x: 11, z: 0.9, width: 10, depth: 3.5, kind: 'walk' },
  { x: -31, z: -7, width: 4.5, depth: 46, kind: 'walk' },
  { x: 31, z: -7, width: 4.5, depth: 46, kind: 'walk' },
  { x: 0, z: -27, width: 66, depth: 4.5, kind: 'walk' },
  { x: 0, z: -33, width: 5.3, depth: 12, kind: 'walk' },
  { x: -44, z: -3, width: 28, depth: 5, kind: 'walk' },
  { x: -49, z: -5, width: 14, depth: 6, kind: 'walk' },
  { x: 39, z: -11, width: 16, depth: 4, kind: 'walk' },
  { x: -37, z: 39.5, width: 65, depth: 5, kind: 'walk' },
  { x: 37, z: 39.5, width: 65, depth: 5, kind: 'walk' },
  { x: -37, z: 56.5, width: 65, depth: 5, kind: 'walk' },
  { x: 37, z: 56.5, width: 65, depth: 5, kind: 'walk' },
  { x: -6.5, z: 36.5, width: 4, depth: 13, kind: 'walk' },
  { x: 6.5, z: 36.5, width: 4, depth: 13, kind: 'walk' },
  { x: -6.5, z: 71.5, width: 4, depth: 37, kind: 'walk' },
  { x: 6.5, z: 71.5, width: 4, depth: 37, kind: 'walk' },
  { x: 37, z: 80, width: 61, depth: 3.5, kind: 'walk' },
  { x: 64, z: 68, width: 3.5, depth: 24, kind: 'walk' },
];

/** Footprints shared by collision, the sandbox and the navigation drawing. */
export const worldBuildings: readonly WorldBuilding[] = [
  { id: 'building:0:-14', x: 0, z: -14, width: 25, depth: 7, height: 10.2, floors: 3, columns: 12, color: '#839583', facade: 'facade' },
  { id: 'building:-18:-10', x: -18, z: -10, width: 7.5, depth: 12, height: 13.5, floors: 5, columns: 4, color: '#b7ac8b', facade: 'stone' },
  { id: 'building:18:-12', x: 18, z: -12, width: 8, depth: 11, height: 8.6, floors: 3, columns: 5, color: '#a4b4a2', facade: 'facade' },
  { id: 'building:14:-2.6', x: 14, z: -2.6, width: 7, depth: 5, height: 4, floors: 1, columns: 4, color: '#b97e5b', facade: 'cafe' },
  { id: 'building:teaching-building', x: 0, z: -46, width: 32, depth: 12, height: 12.4, floors: 4, columns: 10, color: '#9ba68f', facade: 'stone' },
  { id: 'building:residence-building', x: -49, z: -18, width: 18, depth: 20, height: 13.8, floors: 5, columns: 6, color: '#ad846c', facade: 'brick' },
  { id: 'building:residence-north-building', x: -49, z: -44, width: 18, depth: 10, height: 10.8, floors: 4, columns: 6, color: '#9ba9a0', facade: 'facade' },
  { id: 'building:shop-book', x: -22, z: 65, width: 18, depth: 12, height: 8.7, floors: 2, columns: 7, color: '#aa726d', facade: 'stone', rotationY: Math.PI },
  { id: 'building:shop-convenience', x: 21, z: 65, width: 16, depth: 12, height: 7.2, floors: 2, columns: 6, color: '#709d8b', facade: 'stone', rotationY: Math.PI },
  { id: 'building:shop-cafe', x: 48, z: 65, width: 19, depth: 12, height: 8.2, floors: 2, columns: 7, color: '#a38365', facade: 'stone', rotationY: Math.PI },
  { id: 'building:home-apartment', x: -192, z: 117, width: 26, depth: 18, height: 13.8, floors: 5, columns: 8, color: '#aa8770', facade: 'brick' },
  { id: 'building:home-west-apartment', x: -226, z: 178, width: 20, depth: 24, height: 10.8, floors: 4, columns: 6, color: '#9ba9a0', facade: 'facade' },
  { id: 'building:home-east-apartment', x: -163, z: 181, width: 19, depth: 25, height: 13.8, floors: 5, columns: 6, color: '#ada58c', facade: 'stone' },
  { id: 'building:commercial-shop:151', x: 151, z: 111, width: 20, depth: 15, height: 9.2, floors: 3, columns: 7, color: '#709d8b', facade: 'stone' },
  { id: 'building:commercial-shop:178', x: 178, z: 111, width: 23, depth: 15, height: 9.2, floors: 3, columns: 8, color: '#aa726d', facade: 'stone' },
  { id: 'building:commercial-shop:210', x: 210, z: 111, width: 28, depth: 15, height: 9.2, floors: 3, columns: 9, color: '#a38365', facade: 'stone' },
  { id: 'building:commercial-corner', x: 216, z: 184, width: 28, depth: 20, height: 14, floors: 5, columns: 8, color: '#ad846c', facade: 'brick' },
  { id: 'building:downtown-office-west', x: -78, z: 226, width: 22, depth: 22, height: 16.2, floors: 5, columns: 8, color: '#ada58c', facade: 'stone' },
  { id: 'building:downtown-office-south', x: -82, z: 157, width: 22, depth: 17, height: 18.6, floors: 6, columns: 6, color: '#9ba9a0', facade: 'facade' },
  { id: 'building:downtown-shop-east', x: 87, z: 226, width: 17, depth: 18, height: 13.2, floors: 4, columns: 6, color: '#aa8770', facade: 'brick' },
  { id: 'building:toyokawa-residence', x: 50, z: 235, width: 24, depth: 20, height: 12.8, floors: 4, columns: 7, color: '#b7ac8b', facade: 'facade' },
  { id: 'building:grand-mall', x: -180, z: -175, width: 32, depth: 22, height: 16.5, floors: 5, columns: 8, color: '#8a7d93', facade: 'facade' },
  { id: 'building:livehouse', x: -155, z: -135, width: 26, depth: 20, height: 14.2, floors: 4, columns: 6, color: '#9d708b', facade: 'brick' },
  { id: 'building:ktv', x: -205, z: -135, width: 24, depth: 18, height: 12.8, floors: 4, columns: 6, color: '#aa726d', facade: 'shopRed' },
  { id: 'building:grand-tower', x: -150, z: -180, width: 20, depth: 20, height: 22, floors: 7, columns: 5, color: '#708b9d', facade: 'stone' },
  { id: 'building:takao-station', x: -25, z: -155, width: 22, depth: 16, height: 8.5, floors: 3, columns: 6, color: '#7a8c7b', facade: 'stone' },
  { id: 'building:takao-onsen', x: 45, z: -155, width: 24, depth: 18, height: 10.8, floors: 3, columns: 6, color: '#9c6f5a', facade: 'brick' },
  { id: 'building:takao-teahouse', x: -35, z: -185, width: 16, depth: 14, height: 7.2, floors: 2, columns: 4, color: '#aa7a59', facade: 'wood' },
  { id: 'building:takao-summit', x: 25, z: -215, width: 22, depth: 18, height: 12, floors: 3, columns: 5, color: '#688d77', facade: 'shopGreen' },
];

export const worldSites = {
  sports: { x: 46, z: -11, rx: 17, ry: 23 },
  pocketPark: { x: 22, z: 74, width: 43, depth: 15 },
  worksite: { x: -66.5, z: 59.5, width: 29, depth: 23 },
  lake: { x: 179, z: -192, rx: 23, ry: 12 },
} as const;

/** Artistic hill inside the Takao district. The 599m name is the place, not this model's height. */
export const takaoPeak = { x: 8, z: -204, radius: 54, height: 18 };

function takaoRaw(x: number, z: number) {
  const radius = Math.hypot(x - takaoPeak.x, z - takaoPeak.z) / takaoPeak.radius;
  if (radius >= 1) return 0;
  return (1 - radius) ** 1.55 * takaoPeak.height;
}

/** Ground height in metres. Building pads stay level so doors meet the slope. */
export function takaoElevation(x: number, z: number) {
  let height = takaoRaw(x, z);
  for (const building of worldBuildings) {
    if (!building.id.startsWith('building:takao')) continue;
    const pad = takaoRaw(building.x, building.z);
    const dx = Math.abs(x - building.x) - building.width / 2;
    const dz = Math.abs(z - building.z) - building.depth / 2;
    if (dx <= 0 && dz <= 0) { height = pad; continue; }
    const outside = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
    if (outside < 5) height = pad * (1 - outside / 5) + height * (outside / 5);
  }
  return height;
}

export function buildingBaseY(building: { id: string; x: number; z: number; width: number; depth: number }) {
  return building.id.startsWith('building:takao') ? takaoElevation(building.x, building.z) : 0;
}

export function buildingFootprint(building: WorldBuilding) {
  return {
    minX: building.x - building.width / 2,
    maxX: building.x + building.width / 2,
    minZ: building.z - building.depth / 2,
    maxZ: building.z + building.depth / 2,
  };
}

const districtIds = new Set<string>(CITY_DISTRICT_IDS);

export function isCityDistrict(value: string): value is CityDistrictId {
  return districtIds.has(value);
}

/** Smallest named district under a point. South-gate streets count as the campus district. */
export function cityDistrictAt(x: number, z: number): CityDistrictId | undefined {
  let best: { id: CityDistrictId; area: number } | undefined;
  const consider = (id: CityDistrictId, area: SceneArea) => {
    if (x < area.minX || x > area.maxX || z < area.minZ || z > area.maxZ) return;
    const size = (area.maxX - area.minX) * (area.maxZ - area.minZ);
    if (!best || size < best.area) best = { id, area: size };
  };
  for (const area of sceneAreas) {
    if (isCityDistrict(area.id)) consider(area.id, area);
    else if (area.id === 'neighborhood') consider('campus', area);
  }
  return best?.id;
}

export function takaoRing(scale: number, steps = 28) {
  const points: { x: number; z: number }[] = [];
  for (let index = 0; index < steps; index++) {
    const angle = index / steps * Math.PI * 2;
    points.push({
      x: takaoPeak.x + Math.cos(angle) * takaoPeak.radius * scale,
      z: takaoPeak.z + Math.sin(angle) * takaoPeak.radius * scale * 0.86,
    });
  }
  return points;
}

export interface GroveTree { x: number; z: number; scale: number; tint: number }

function blockedGrove(x: number, z: number) {
  if (x < sceneBounds.minX + 8 || x > sceneBounds.maxX - 8 || z < sceneBounds.minZ + 8 || z > sceneBounds.maxZ - 8) return true;
  if (worldBuildings.some(building => Math.abs(x - building.x) < building.width / 2 + 3.2 && Math.abs(z - building.z) < building.depth / 2 + 3.2)) return true;
  if (scenePaths.some(path => Math.abs(x - path.x) < path.width / 2 + 1.4 && Math.abs(z - path.z) < path.depth / 2 + 1.4)) return true;
  const lake = worldSites.lake;
  if ((x - lake.x) ** 2 / (lake.rx + 2) ** 2 + (z - lake.z) ** 2 / (lake.ry + 2) ** 2 < 1) return true;
  const sports = worldSites.sports;
  if ((x - sports.x) ** 2 / sports.rx ** 2 + (z - sports.z) ** 2 / sports.ry ** 2 < 1) return true;
  return false;
}

function groveRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = (value + Math.imul(value ^ value >>> 7, 61 | value)) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** Decorative trees for the sandbox. The walkable scene reuses the mountain subset. */
export function cityGrove(): GroveTree[] {
  const random = groveRandom(20261028);
  const trees: GroveTree[] = [];
  const clusters = sceneAreas.filter(area => ['campus', 'neighborhood', 'home', 'commercial', 'downtown', 'city-park', 'grand-commercial', 'takao-mountain'].includes(area.id));
  for (const area of clusters) {
    const quota = area.id === 'takao-mountain' ? 28 : area.id === 'city-park' ? 14 : 8;
    let guard = 0;
    while (trees.filter(tree => tree.x >= area.minX && tree.x <= area.maxX && tree.z >= area.minZ && tree.z <= area.maxZ).length < quota && guard < quota * 12) {
      guard += 1;
      const x = area.minX + 8 + random() * (area.maxX - area.minX - 16);
      const z = area.minZ + 8 + random() * (area.maxZ - area.minZ - 16);
      if (area.id === 'takao-mountain' && takaoElevation(x, z) < 0.4) continue;
      if (blockedGrove(x, z)) continue;
      trees.push({ x, z, scale: 0.85 + random() * 0.7, tint: Math.floor(random() * 4) });
    }
  }
  return trees;
}
