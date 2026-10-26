import type { SceneBounds } from './scene-movement';

/** Illustrative local coordinates, shared by the walkable scene and its small navigation map. */
export const sceneBounds: SceneBounds = { minX: -260, maxX: 260, minZ: -220, maxZ: 260 };
export interface SceneArea extends SceneBounds { id: string; label: string }
export interface SceneLandmark { id: string; label: string; x: number; z: number }
export interface ScenePath { x: number; z: number; width: number; depth: number; kind: 'road' | 'walk' }

// First match wins: named destinations precede the wider campus and street areas.
export const sceneAreas: SceneArea[] = [
  { id: 'library', label: '图书馆前庭', minX: -14, maxX: 14, minZ: -20, maxZ: -6 },
  { id: 'teaching', label: '教学楼广场', minX: -23, maxX: 23, minZ: -58, maxZ: -30 },
  { id: 'residences', label: '宿舍院落', minX: -63, maxX: -28, minZ: -39, maxZ: 6 },
  { id: 'sports', label: '运动场', minX: 28, maxX: 65, minZ: -37, maxZ: 13 },
  { id: 'campus-cafe', label: '校园咖啡露台', minX: 9, maxX: 22, minZ: -6, maxZ: 8 },
  { id: 'promenade', label: '林荫步道', minX: -34, maxX: 34, minZ: 8, maxZ: 24 },
  { id: 'south-gate', label: '校园南门', minX: -9, maxX: 9, minZ: 24, maxZ: 34 },
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
  { id: 'campus', label: '高田·西早稻田校园', minX: -70, maxX: 70, minZ: -60, maxZ: 27 },
  { id: 'neighborhood', label: '高田校园南门街区', minX: -70, maxX: 70, minZ: 27, maxZ: 90 },
  { id: 'city-roads', label: '城市连接道路', ...sceneBounds },
];

// These are reachable outdoor arrival points, never building centers or teleport destinations.
export const sceneLandmarks: SceneLandmark[] = [
  { id: 'library', label: '图书馆', x: 0, z: -6 },
  { id: 'teaching', label: '教学楼', x: 0, z: -36 },
  { id: 'residences', label: '宿舍院落', x: -49, z: -5 },
  { id: 'sports', label: '运动场', x: 46, z: -11 },
  { id: 'campus-cafe', label: '校园咖啡', x: 14, z: 0.9 },
  { id: 'south-gate', label: '南门', x: 0, z: 29 },
  { id: 'junction', label: '十字路口', x: 0, z: 48 },
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
];

export const scenePaths: ScenePath[] = [
  { x: 0, z: 60, width: 8, depth: 60, kind: 'road' },
  { x: 0, z: 48, width: 138, depth: 10, kind: 'road' },
  // The same asphalt connects the campus with three distinct city destinations.
  { x: 0, z: 48, width: 470, depth: 10, kind: 'road' },
  { x: -180, z: 94.5, width: 10, depth: 103, kind: 'road' },
  { x: 180, z: -35, width: 10, depth: 258, kind: 'road' },
  { x: 152.5, z: 94, width: 65, depth: 10, kind: 'road' },
  { x: 125, z: 117.5, width: 10, depth: 57, kind: 'road' },
  { x: -180, z: 141, width: 120, depth: 10, kind: 'road' },
  { x: 180, z: 141, width: 120, depth: 10, kind: 'road' },
  { x: 180, z: -159, width: 120, depth: 10, kind: 'road' },
  // A northern arterial joins the campus street grid to a separate downtown block.
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
  // Campus spine, a complete walking loop, and branches into the destination courtyards.
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
  // Four connected sidewalks leave the asphalt visible through the intersection.
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
