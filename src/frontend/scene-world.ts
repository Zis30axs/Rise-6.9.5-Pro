import * as THREE from 'three';
import type { SceneMovementWorld } from './scene-movement';
import { sceneBounds, scenePaths } from './scene-layout';

export type SceneAction = 'phone' | 'map' | 'observe' | 'rest' | 'schedule';
export interface SceneHotspot {
  action: SceneAction;
  label: string;
  position: THREE.Vector3;
  fallback: [number, number];
}

export const sceneHotspots: SceneHotspot[] = [
  { action: 'map', label: '路牌 · 地图', position: new THREE.Vector3(-5.6, 2.8, 2.2), fallback: [23, 48] },
  { action: 'rest', label: '长椅 · 休息15分钟', position: new THREE.Vector3(6, 1.5, 3.5), fallback: [73, 63] },
  { action: 'phone', label: '打开手机', position: new THREE.Vector3(8.5, 2.8, -3.2), fallback: [81, 43] },
  { action: 'observe', label: '看看周围', position: new THREE.Vector3(0, 5.4, -11.5), fallback: [48, 35] },
  { action: 'schedule', label: '公告栏 · 日程', position: new THREE.Vector3(-10, 3.3, -4), fallback: [13, 36] },
];

export interface StreetNode { label: string; position: [number, number, number]; yaw: number }
export const streetRoutes: Record<string, StreetNode[]> = {
  gate: [
    { label: '南门步道', position: [0, 1.7, 18], yaw: 0 },
    { label: '庭院路口', position: [0, 1.7, 7], yaw: 0 },
    { label: '图书馆前庭', position: [0, 1.7, -6], yaw: 0 },
  ],
  library: [
    { label: '图书馆前庭', position: [0, 1.7, -6], yaw: 0 },
    { label: '入口台阶', position: [0, 1.92, -8.4], yaw: 0 },
  ],
  cafe: [
    { label: '咖啡店外', position: [8, 1.7, 7], yaw: 0.48 },
    { label: '露台边', position: [10, 1.7, 2.2], yaw: 0.75 },
    { label: '店门前', position: [14, 1.7, 0.9], yaw: 0 },
  ],
  dorm: [
    { label: '公寓前庭', position: [-49, 1.7, -5], yaw: 0 },
    { label: '宿舍楼门前', position: [-49, 1.7, -6.5], yaw: 0 },
  ],
  teaching: [
    { label: '教学楼门前', position: [0, 1.7, -36], yaw: 0 },
  ],
  'bus-stop': [
    { label: '南门公交站', position: [46, 1.7, 38], yaw: 3.141 },
  ],
  sports: [
    { label: '运动场入口', position: [39, 1.7, -11], yaw: 0 },
    { label: '跑道边', position: [46, 1.7, -11], yaw: 0 },
  ],
  junction: [
    { label: '十字路口', position: [0, 1.7, 48], yaw: 0 },
  ],
  bookshop: [
    { label: '书店门前', position: [-22, 1.7, 53], yaw: 3.141 },
  ],
  convenience: [
    { label: '便利店门前', position: [21, 1.7, 53], yaw: 3.141 },
  ],
  'street-cafe': [
    { label: '街边咖啡露台', position: [48, 1.7, 53], yaw: 3.141 },
  ],
  'pocket-park': [
    { label: '口袋公园', position: [37, 1.7, 76], yaw: 3.141 },
  ],
  home: [
    { label: '住宅区公交站', position: [-180, 1.7, 150], yaw: 0 },
    { label: '家门前庭院', position: [-190, 1.7, 130], yaw: 0 },
  ],
  commercial: [
    { label: '商业区公交站', position: [180, 1.7, 150], yaw: 0 },
    { label: '商店步行广场', position: [196, 1.7, 127], yaw: 0 },
  ],
  downtown: [
    { label: '市中心公交站', position: [-20, 1.7, 185], yaw: 0 },
    { label: '市中心步行广场', position: [20, 1.7, 208], yaw: 0 },
    { label: '丰川家门前', position: [50, 1.7, 222], yaw: 0 },
  ],
  'city-park': [
    { label: '公园公交站', position: [180, 1.7, -150], yaw: 0 },
    { label: '湖畔绿道', position: [207, 1.7, -174], yaw: 0 },
  ],
  'grand-commercial': [
    { label: '大型商业区接驳站', position: [-180, 1.7, -150], yaw: 0 },
    { label: 'Live House 门前广场', position: [-155, 1.7, -135], yaw: 0 },
    { label: 'KTV 娱乐城门前', position: [-205, 1.7, -135], yaw: 0 },
  ],
};

/** Local geometry only. The scene is illustrative; it is not a world-state authority. */
export function createCampusWorld(scene: THREE.Scene) {
  const world = new THREE.Group();
  scene.add(world);
  const pickables: THREE.Object3D[] = [];
  // Visual layout, local navigation and collision share the same finite outdoor block.
  const movementWorld: SceneMovementWorld = {
    bounds: { ...sceneBounds },
    colliders: [], surfaces: [],
  };
  const solidBox = (id: string, x: number, z: number, width: number, depth: number) => {
    movementWorld.colliders.push({ kind: 'box', id, minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
  };
  const solidCircle = (id: string, x: number, z: number, radius: number) => {
    movementWorld.colliders.push({ kind: 'circle', id, x, z, radius });
  };
  const walkableStep = (x: number, z: number, width: number, depth: number, height: number) => {
    movementWorld.surfaces.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, height });
  };
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const windows = new Set<THREE.MeshStandardMaterial>();
  const materialCache = new Map<string, THREE.MeshStandardMaterial>();
  const instances: THREE.InstancedMesh[] = [];
  const material = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const key = `${color}:${JSON.stringify(extra)}`;
    const cached = materialCache.get(key);
    if (cached) return cached;
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.86, ...extra });
    materials.add(value);
    materialCache.set(key, value);
    return value;
  };
  const palette = {
    stone: material(0xe0d1b7), facade: material(0xc9ba9e), roof: material(0x657061),
    trim: material(0xf0e2c5), dark: material(0x343f3d), wood: material(0x875f42),
    grass: material(0x708569), path: material(0xd4c5aa), soil: material(0x69745e),
    leaf: [material(0x718462), material(0x9a9c69), material(0x546f58), material(0xa38e62)],
    gold: material(0xccab6a), glass: material(0x57726f, { metalness: 0.22, roughness: 0.45 }),
    asphalt: material(0x707b76), roadPaint: material(0xf1e9cc), brick: material(0xb68f76),
    court: material(0xb07c66), sport: material(0x76987a), shopGreen: material(0x679485), shopRed: material(0x98585b),
  };
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = world) => {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  };
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const cylinderShapes = new Map<string, THREE.CylinderGeometry>();
  const unitCrown = new THREE.IcosahedronGeometry(1, 1);
  const unitDisc = new THREE.CircleGeometry(1, 24);
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent?: THREE.Object3D) => {
    const object = mesh(unitBox, mat, x, y, z, parent); object.scale.set(w, h, d); return object;
  };
  const cylinder = (r1: number, r2: number, h: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const radius = Math.max(r1, r2), key = `${r1 / radius}:${r2 / radius}`;
    let shape = cylinderShapes.get(key);
    if (!shape) { shape = new THREE.CylinderGeometry(r1 / radius, r2 / radius, 1, 8); cylinderShapes.set(key, shape); }
    const object = mesh(shape, mat, x, y, z); object.scale.set(radius, h, radius); return object;
  };
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x293e32, transparent: true, opacity: 0.16, depthWrite: false });
  materials.add(shadowMat);
  const shadow = (x: number, z: number, sx: number, sz: number) => {
    const object = mesh(unitDisc, shadowMat, x, 0.025, z);
    object.rotation.x = -Math.PI / 2;
    object.scale.set(sx, sz, 1);
    return object;
  };
  const tag = (object: THREE.Object3D, action: SceneAction) => {
    object.userData.sceneAction = action;
    pickables.push(object);
  };

  const walkMarker = new THREE.Group(); world.add(walkMarker);
  walkMarker.userData.sceneWalk = true; pickables.push(walkMarker);
  const walkMaterial = new THREE.MeshBasicMaterial({ color: 0xf6e4b5, transparent: true, opacity: 0.87, side: THREE.DoubleSide, depthWrite: false });
  materials.add(walkMaterial);
  const ring = mesh(new THREE.RingGeometry(0.6, 0.72, 32), walkMaterial, 0, 0.07, 0, walkMarker);
  ring.rotation.x = -Math.PI / 2;
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.42); arrowShape.lineTo(-0.34, -0.18); arrowShape.lineTo(-0.12, -0.18); arrowShape.lineTo(-0.12, -0.4); arrowShape.lineTo(0.12, -0.4); arrowShape.lineTo(0.12, -0.18); arrowShape.lineTo(0.34, -0.18); arrowShape.closePath();
  const walkArrow = mesh(new THREE.ShapeGeometry(arrowShape), walkMaterial, 0, 0.08, 0, walkMarker);
  walkArrow.rotation.x = -Math.PI / 2;

  // The courtyard extends beyond the camera, so it feels like a place rather than a model on a base.
  box(sceneBounds.maxX - sceneBounds.minX, 0.5, sceneBounds.maxZ - sceneBounds.minZ, palette.grass,
    (sceneBounds.minX + sceneBounds.maxX) / 2, -0.3, (sceneBounds.minZ + sceneBounds.maxZ) / 2);
  for (const path of scenePaths) box(path.width, 0.035, path.depth, path.kind === 'road' ? palette.asphalt : palette.path, path.x, path.kind === 'road' ? -0.015 : 0.006, path.z);
  for (let i = 0; i < 20; i++) {
    box(0.06, 0.052, 1.5, palette.stone, -2.5, 0.015, i * 2.4 - 6);
    box(0.06, 0.052, 1.5, palette.stone, 2.5, 0.015, i * 2.4 - 6);
  }
  const build = (x: number, z: number, w: number, h: number, d: number, floors: number, cols: number, facade = palette.facade, id = `building:${x}:${z}`) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    world.add(group);
    box(w, h, d, facade, 0, h / 2, 0, group);
    box(w + 0.55, 0.28, d + 0.55, palette.trim, 0, h + 0.12, 0, group);
    box(w + 0.15, 0.5, d + 0.12, palette.stone, 0, 0.25, 0, group);
    solidBox(id.startsWith('building:') ? id : `building:${id}`, x, z, w + 0.15, d + 0.12);
    for (let floor = 0; floor < floors; floor++) {
      const yy = 1.5 + floor * (h - 1.4) / floors;
      box(w + 0.1, 0.12, d + 0.12, palette.trim, 0, yy - 0.9, 0, group);
      for (let col = 0; col < cols; col++) {
        const xx = (col - (cols - 1) / 2) * (w - 1.6) / cols;
        const lit = (floor * 3 + col) % 4 !== 0;
        const mat = material(lit ? 0xebc38a : 0x54716c, { emissive: lit ? 0xffc679 : 0x345851, emissiveIntensity: lit ? 0.32 : 0.08 });
        if (lit) windows.add(mat);
        box(Math.min(1.15, w / cols * 0.55), 1.65, 0.07, palette.dark, xx, yy, d / 2 + 0.04, group);
        box(Math.min(0.95, w / cols * 0.45), 1.45, 0.075, mat, xx, yy, d / 2 + 0.09, group);
        box(0.055, 1.5, 0.1, palette.stone, xx, yy, d / 2 + 0.15, group);
      }
    }
    return group;
  };
  const library = build(0, -14, 25, 10.2, 7, 3, 12);
  tag(library, 'observe');
  // Central portico and steps.
  box(6.6, 0.22, 4, palette.stone, 0, 0.1, -9.1);
  walkableStep(0, -9.1, 6.6, 4, 0.21);
  box(5.6, 0.22, 3.5, palette.trim, 0, 0.3, -9.4);
  walkableStep(0, -9.4, 5.6, 3.5, 0.41);
  box(5, 3.8, 0.15, palette.dark, 0, 2.25, -10.4);
  box(4.5, 3.4, 0.2, palette.glass, 0, 2.25, -10.28);
  solidBox('library-door', 0, -10.28, 5, 0.3);
  box(7.2, 0.35, 2.3, palette.trim, 0, 4.6, -9.9);
  for (const x of [-2.9, 2.9]) { cylinder(0.2, 0.24, 4.2, palette.trim, x, 2.3, -9.2); solidCircle(`portico-column:${x}`, x, -9.2, 0.24); }
  box(0.08, 3.4, 0.3, palette.gold, 0, 2.25, -10.1);
  build(-18, -10, 7.5, 13.5, 12, 5, 4, palette.stone);
  build(18, -12, 8, 8.6, 11, 3, 5);
  // The original gate remains on the connected campus-to-neighborhood walking spine.
  for (const x of [-5, 5]) { box(1, 4.6, 1, palette.stone, x, 2.3, 27); box(1.3, 0.35, 1.3, palette.trim, x, 4.7, 27); solidBox(`gate-pillar:${x}`, x, 27, 1, 1); }
  box(11.4, 0.45, 0.9, palette.trim, 0, 4.8, 27);
  for (let i = 0; i < 9; i++) {
    const xx = 7 + i * 1.4;
    for (const sign of [-1, 1]) { box(0.1, 1.45, 0.1, palette.roof, xx * sign, 0.75, 27); box(1.5, 0.07, 0.1, palette.roof, xx * sign, 1.3, 27); solidBox(`gate-fence:${xx * sign}`, xx * sign, 27, 1.5, 0.1); }
  }
  // Café, striped awning and terrace.
  const cafe = build(14, -2.6, 7, 4, 5, 1, 4, material(0xc49776));
  tag(cafe, 'phone');
  const awning = box(7.5, 0.18, 2, palette.roof, 14, 2.8, 0.6);
  awning.rotation.x = 0.08;
  for (let i = 0; i < 9; i += 2) box(0.45, 0.19, 2.05, palette.trim, 10.6 + i * 0.8, 2.82, 0.6);
  for (const [x, z] of [[11, 3.4], [15, 4.2]]) {
    cylinder(0.7, 0.7, 0.11, palette.wood, x, 1.15, z);
    solidCircle(`terrace-table:${x}:${z}`, x, z, 0.7);
    cylinder(0.08, 0.15, 1.1, palette.dark, x, 0.6, z);
    for (const dx of [-1, 1]) { box(0.52, 0.1, 0.55, palette.wood, x + dx, 0.65, z); solidBox(`terrace-chair:${x + dx}:${z}`, x + dx, z, 0.52, 0.55); }
  }
  // Skyline remains beyond the playable block, leaving the new north campus open.
  const distantMat = material(0xa4a798);
  for (let i = 0; i < 11; i++) box(7 + i % 3, 10 + i % 4 * 3, 8, distantMat, (i - 5) * 15, 5 + i % 4 * 1.5, -76 - i % 3 * 4);

  function tree(x: number, z: number, scale: number, colorIndex: number) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    world.add(group);
    group.scale.setScalar(scale);
    const trunk = box(0.32, 3.4, 0.32, palette.wood, 0, 1.7, 0, group);
    trunk.rotation.z = 0.04;
    // Covers the trunk's slight lean; foliage above walking height remains passable.
    solidCircle(`tree:${x}:${z}`, x, z, 0.3 * scale);
    const leaf = palette.leaf[colorIndex % palette.leaf.length];
    for (const [xx, yy, zz, rr] of [[0, 4.4, 0, 1.8], [-0.9, 3.7, 0.35, 1.35], [1, 3.9, -0.2, 1.45], [0.4, 5.4, 0.1, 1.1]]) {
      const crown = mesh(unitCrown, leaf, xx, yy, zz, group);
      crown.scale.set(rr, rr * 1.1, rr);
    }
    shadow(x + 0.4, z + 0.7, 2.7 * scale, 1.5 * scale);
  }
  for (const [x, z, size, color] of [[-9, 3, 1.45, 0], [-14, 8, 1.6, 2], [-7, -6, 1.1, 1], [-15, -2, 1.2, 2], [8, -6.5, 1.15, 0], [12, 8, 1.6, 1], [19, 4, 1.3, 2], [-24, -16, 1.3, 0], [25, -14, 1.5, 1], [-7, 15, 1.6, 0], [7, 17, 1.4, 2]]) tree(x, z, size, color);
  for (const [x, z] of [[-8.8, 3], [7.8, -6], [11.5, 8]]) {
    box(3.7, 0.5, 2.3, palette.stone, x, 0.25, z);
    solidBox(`planter:${x}:${z}`, x, z, 3.7, 2.3);
    box(3.4, 0.05, 2, palette.soil, x, 0.53, z);
  }
  // A recognisable bench, signpost and bulletin board are the actual raycast targets.
  const bench = new THREE.Group(); bench.position.set(6, 0, 3.5); world.add(bench); tag(bench, 'rest');
  solidBox('bench', 6, 3.43, 3.5, 1);
  for (const y of [1, 1.3, 1.6]) box(3.5, 0.2, 0.14, palette.wood, 0, y, -0.45, bench);
  for (const z of [-0.3, 0, 0.3]) box(3.5, 0.15, 0.25, palette.wood, 0, 0.82, z, bench);
  for (const x of [-1.35, 1.35]) { box(0.14, 0.8, 0.85, palette.dark, x, 0.42, 0, bench); box(0.14, 1.1, 0.14, palette.dark, x, 1.1, -0.5, bench); }
  shadow(6.4, 3.7, 2.3, 0.9);
  const sign = new THREE.Group(); sign.position.set(-5.6, 0, 2.2); world.add(sign); tag(sign, 'map');
  solidBox('signpost', -5.525, 2.2, 2.45, 0.18);
  box(0.13, 2.7, 0.13, palette.dark, 0, 1.35, 0, sign);
  for (const [y, x, color] of [[2.25, 0.3, palette.roof], [1.8, -0.15, palette.wood]] as const) box(2, 0.4, 0.17, color, x, y, 0, sign);
  box(0.95, 0.04, 0.18, palette.trim, 0.2, 2.25, 0.01, sign);
  box(0.9, 0.04, 0.18, palette.trim, -0.25, 1.8, 0.01, sign);
  const board = new THREE.Group(); board.position.set(-10, 0, -4); world.add(board); tag(board, 'schedule');
  solidBox('bulletin-board', -10, -4, 3.4, 0.34);
  box(3.4, 2.1, 0.22, palette.wood, 0, 2, 0, board);
  box(3.1, 1.8, 0.25, palette.roof, 0, 2, 0, board);
  for (const x of [-1.3, 1.3]) box(0.16, 1.2, 0.18, palette.dark, x, 0.6, 0, board);
  for (const [x, y, angle] of [[-0.8, 2.15, -0.08], [0.05, 1.9, 0.07], [0.87, 2.2, -0.04]]) {
    const paper = box(0.6, 1, 0.04, palette.trim, x, y, 0.15, board); paper.rotation.z = angle;
  }
  const phone = new THREE.Group(); phone.position.set(8.5, 0, -3.2); world.add(phone); tag(phone, 'phone');
  solidBox('phone-pedestal', 8.5, -3.2, 0.65, 0.65);
  box(0.65, 1.4, 0.65, palette.stone, 0, 0.7, 0, phone);
  box(0.65, 0.95, 0.18, palette.dark, 0, 1.95, 0, phone);
  box(0.47, 0.7, 0.2, material(0xb7d8b3, { emissive: 0x96c8aa, emissiveIntensity: 0.25 }), 0, 1.98, 0.03, phone);

  // North teaching court and west residential court are connected by the campus walking loop.
  build(0, -46, 32, 12.4, 12, 4, 10, palette.stone, 'teaching-building');
  box(30, 0.04, 11, palette.path, 0, 0.015, -34.5);
  box(9, 3.2, 0.16, palette.glass, 0, 1.8, -39.93);
  box(12, 0.3, 2.8, palette.trim, 0, 3.8, -39);
  for (const x of [-5.5, 5.5]) { cylinder(0.16, 0.19, 3.6, palette.stone, x, 1.8, -38.7); solidCircle(`teaching-column:${x}`, x, -38.7, 0.19); }
  build(-49, -18, 18, 13.8, 20, 5, 6, palette.brick, 'residence-building');
  build(-49, -44, 18, 10.8, 10, 4, 6, palette.facade, 'residence-north-building');
  box(5, 3.3, 0.16, palette.glass, -49, 1.8, -7.93);
  box(7, 0.23, 2, palette.trim, -49, 3.8, -7.3);
  // Bicycle racks remain outside the open front walk.
  for (let index = 0; index < 5; index++) {
    const x = -59 + index * 1.2;
    for (const dx of [-0.35, 0.35]) { cylinder(0.035, 0.035, 0.8, palette.dark, x + dx, 0.4, 4); solidCircle(`bicycle-rack:${x}:${dx}`, x + dx, 4, 0.035); }
    box(0.77, 0.07, 0.07, palette.dark, x, 0.8, 4);
    solidBox(`bicycle-rack-rail:${x}`, x, 4, 0.77, 0.07);
  }

  // A full outdoor running track and marked sports court, with walkable turf and solid goal posts.
  const track = mesh(new THREE.RingGeometry(0.75, 1, 48), palette.court, 46, 0.028, -11);
  track.rotation.x = -Math.PI / 2; track.scale.set(17, 23, 1);
  box(23, 0.035, 34, palette.sport, 46, 0.005, -11);
  for (const ratio of [0.81, 0.88, 0.95]) {
    const line = mesh(new THREE.RingGeometry(ratio - 0.003, ratio + 0.003, 48), palette.roadPaint, 46, 0.035, -11);
    line.rotation.x = -Math.PI / 2; line.scale.set(17, 23, 1);
  }
  for (const x of [35.3, 56.7]) box(0.07, 0.018, 32, palette.roadPaint, x, 0.035, -11);
  for (const z of [-27, -11, 5]) box(21.5, 0.018, 0.07, palette.roadPaint, 46, 0.035, z);
  const centerCircle = mesh(new THREE.RingGeometry(2.9, 2.98, 32), palette.roadPaint, 46, 0.04, -11); centerCircle.rotation.x = -Math.PI / 2;
  for (const z of [-26.5, 4.5]) {
    for (const x of [42.5, 49.5]) { box(0.1, 2.4, 0.1, palette.trim, x, 1.2, z); solidBox(`sport-goal:${x}:${z}`, x, z, 0.1, 0.1); }
    box(7.1, 0.1, 0.1, palette.trim, 46, 2.4, z);
    for (const x of [42.5, 49.5]) box(0.08, 0.08, 1.2, palette.trim, x, 0.04, z + (z < 0 ? -0.6 : 0.6));
  }
  for (let row = 0; row < 3; row++) {
    box(1.1, 0.38 + row * 0.25, 17, row % 2 ? palette.stone : palette.wood, 62 + row * 1.1, (0.38 + row * 0.25) / 2, -11);
  }
  solidBox('sport-bleachers', 63.1, -11, 3.3, 17);

  // Continue the visible campus fence toward both boundaries, keeping the original entrance open.
  for (const sign of [-1, 1]) {
    box(50, 0.65, 0.4, palette.stone, sign * 44.5, 0.325, 27);
    box(50, 0.06, 0.12, palette.roof, sign * 44.5, 1.3, 27);
    solidBox(`campus-front-fence:${sign}`, sign * 44.5, 27, 50, 0.4);
    for (let x = 20; x <= 69; x += 2.5) box(0.07, 0.8, 0.07, palette.roof, x * sign, 1, 27);
  }

  // Four zebra crossings and lane marks make the road junction legible from eye height.
  for (const z of [39.5, 56.5]) for (let x = -3.3; x <= 3.4; x += 1.1) box(0.54, 0.025, 3, palette.roadPaint, x, 0.015, z);
  for (const x of [-7, 7]) for (let z = 43.7; z < 53; z += 1.05) box(3, 0.025, 0.5, palette.roadPaint, x, 0.015, z);
  for (let z = 31.5; z < 88; z += 5) if (z < 42 || z > 55) box(0.13, 0.022, 2.6, palette.roadPaint, 0, 0.01, z);
  for (let x = -64; x <= 64; x += 7) if (Math.abs(x) > 12) box(3.5, 0.022, 0.13, palette.roadPaint, x, 0.01, 48);
  for (const z of [42.1, 53.9]) for (const x of [-37, 37]) box(65, 0.035, 0.18, palette.trim, x, 0.015, z);
  for (const x of [-9.6, 9.6]) for (const z of [40, 56]) {
    cylinder(0.06, 0.09, 3.4, palette.dark, x, 1.7, z);
    solidCircle(`traffic-light:${x}:${z}`, x, z, 0.09);
    box(0.38, 0.95, 0.32, palette.dark, x, 3, z);
    for (let light = 0; light < 3; light++) box(0.2, 0.18, 0.04, [palette.shopRed, palette.gold, palette.shopGreen][light], x, 3.28 - light * 0.28, z + 0.18);
  }

  const storefront = (x: number, width: number, height: number, color: THREE.MeshStandardMaterial, id: string) => {
    const building = build(x, 65, width, height, 12, 2, Math.round(width / 2.6), palette.stone, id);
    building.rotation.y = Math.PI;
    box(width - 0.5, 0.9, 0.2, color, x, 3.45, 58.82);
    box(width - 0.8, 2.3, 0.16, palette.glass, x, 1.35, 58.88);
    box(1.6, 2.4, 0.19, palette.dark, x, 1.3, 58.75);
    solidBox(`${id}:front`, x, 58.83, width, 0.25);
    for (const side of [-1, 1]) box(0.1, 2.4, 0.23, palette.trim, x + side * 1, 1.3, 58.74);
    box(width + 0.3, 0.16, 1.9, color, x, 3, 58.2);
    return building;
  };
  storefront(-22, 18, 8.7, palette.shopRed, 'shop-book');
  storefront(21, 16, 7.2, palette.shopGreen, 'shop-convenience');
  storefront(48, 19, 8.2, palette.wood, 'shop-cafe');
  // Books, grocery stripe and a cup silhouette distinguish the local shop fronts without textures.
  for (let index = 0; index < 7; index++) box(0.27, 0.62 + index % 3 * 0.09, 0.12, [palette.trim, palette.gold, palette.brick][index % 3], -28 + index * 0.34, 1.35, 58.72);
  for (let index = 0; index < 9; index++) box(0.7, 0.18, 1.95, index % 2 ? palette.trim : palette.shopGreen, 14.6 + index * 1.6, 3.02, 58.2);
  cylinder(0.4, 0.3, 0.55, palette.trim, 44, 3.45, 58.62);
  const cupHandle = mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 12), palette.trim, 44.43, 3.45, 58.62); cupHandle.rotation.x = Math.PI / 2;
  for (const x of [42.5, 53.5]) {
    cylinder(0.65, 0.65, 0.1, palette.wood, x, 0.95, 57.5);
    cylinder(0.09, 0.14, 0.9, palette.dark, x, 0.45, 57.5);
    solidCircle(`street-cafe-table:${x}`, x, 57.5, 0.65);
  }

  // A bus shelter opens directly onto the north sidewalk; its arrival point remains unobstructed.
  box(11, 0.25, 3.2, palette.roof, 47, 3.1, 35.7);
  box(10.5, 2.4, 0.13, palette.glass, 47, 1.45, 34.35);
  solidBox('bus-shelter-back', 47, 34.35, 10.5, 0.13);
  for (const x of [42.1, 51.9]) {
    cylinder(0.07, 0.09, 3, palette.dark, x, 1.5, 36.8); solidCircle(`bus-shelter-post:${x}`, x, 36.8, 0.09);
  }
  box(6, 0.14, 0.65, palette.wood, 47, 0.75, 35.3); solidBox('bus-shelter-seat', 47, 35.3, 6, 0.65);
  for (const x of [44.5, 49.5]) box(0.1, 0.75, 0.5, palette.dark, x, 0.375, 35.3);
  cylinder(0.06, 0.09, 3.3, palette.dark, 40, 1.65, 39.5); solidCircle('bus-stop-sign', 40, 39.5, 0.09);
  box(1.15, 1.7, 0.15, palette.shopGreen, 40, 2.6, 39.5);
  solidBox('bus-stop-sign-board', 40, 39.5, 1.15, 0.15);
  for (let index = 0; index < 4; index++) box(0.7, 0.04, 0.04, palette.trim, 40, 2.9 - index * 0.23, 39.6);

  // Pocket park behind the shops: open walk, shallow fountain and shaded seating.
  box(39, 0.025, 14, palette.grass, 44, 0, 81);
  box(36, 0.035, 3.5, palette.path, 45, 0.02, 80);
  cylinder(3.3, 3.5, 0.55, palette.stone, 50, 0.275, 80);
  cylinder(2.9, 2.9, 0.04, material(0x90b7b0), 50, 0.57, 80);
  cylinder(0.5, 0.7, 1.05, palette.trim, 50, 0.8, 80);
  solidCircle('park-fountain', 50, 80, 3.5);
  for (const x of [31, 60]) {
    box(4, 0.16, 0.75, palette.wood, x, 0.72, 84);
    box(4, 0.9, 0.12, palette.wood, x, 1.1, 84.4);
    for (const dx of [-1.6, 1.6]) box(0.14, 0.7, 0.7, palette.dark, x + dx, 0.35, 84);
    solidBox(`park-bench:${x}`, x, 84.1, 4, 0.9);
  }

  // Trees flank the routes instead of filling the walkable corridors.
  for (const [x, z] of [[-36, -50], [36, -50], [-36, -32], [36, -32], [-36, -10], [36, 14], [-36, 14], [-22, 16], [22, 18], [-61, 14], [61, 17], [-61, -30], [-62, 35], [-47, 35], [-30, 35], [24, 35], [62, 35], [-62, 62], [-43, 65], [-26, 82], [-47, 82], [28, 76], [61, 76], [40, 86], [57, 86]]) tree(x, z, 1.2 + Math.abs(x % 3) * 0.15, Math.abs(x + z) % 4);

  // Three outdoor destination blocks share the city roads and remain genuinely walkable.
  // These are illustrative residential buildings, not facts about the player's real home or family.
  box(96, 0.028, 48, palette.path, -194, 0.008, 177);
  build(-192, 117, 26, 13.8, 18, 5, 8, palette.brick, 'home-apartment');
  build(-226, 178, 20, 10.8, 24, 4, 6, palette.facade, 'home-west-apartment');
  build(-163, 181, 19, 13.8, 25, 5, 6, palette.stone, 'home-east-apartment');
  box(6, 3.1, 0.17, palette.glass, -192, 1.7, 126.1);
  box(8, 0.25, 2.4, palette.trim, -192, 3.8, 127);
  box(29, 0.035, 25, palette.grass, -194, 0.035, 179);
  for (const [x, z] of [[-215, 157], [-210, 198], [-175, 199], [-154, 132], [-236, 132]]) tree(x, z, 1.45, 1);

  box(103, 0.035, 22, palette.path, 188, 0.015, 125);
  for (const [x, width, color] of [[151, 20, palette.shopGreen], [178, 23, palette.shopRed], [210, 28, palette.wood]] as const) {
    build(x, 111, width, 9.2, 15, 3, Math.round(width / 3), palette.stone, `commercial-shop:${x}`);
    box(width - 1, 2.8, 0.15, palette.glass, x, 1.55, 118.65);
    box(width + 0.5, 0.22, 3.2, color, x, 3.3, 120);
    box(width - 1, 0.9, 0.16, color, x, 4.2, 118.8);
    solidBox(`commercial-shop-front:${x}`, x, 118.65, width, 0.2);
  }
  for (const [x, z] of [[143, 132], [226, 133], [220, 181], [144, 180]]) tree(x, z, 1.5, 0);
  build(216, 184, 28, 14, 20, 5, 8, palette.brick, 'commercial-corner');
  for (const x of [151, 211]) {
    box(4.4, 0.16, 0.75, palette.wood, x, 0.78, 130);
    box(4.4, 0.9, 0.13, palette.wood, x, 1.13, 130.45);
    solidBox(`commercial-bench:${x}`, x, 130.1, 4.4, 0.9);
  }

  // Downtown and the Toyokawa residence use procedural geometry; no duplicate texture bundle.
  box(188, 0.026, 38, palette.path, 0, 0.008, 217);
  build(-78, 226, 22, 16.2, 22, 5, 8, palette.stone, 'downtown-office-west');
  build(-82, 157, 22, 18.6, 17, 6, 6, palette.facade, 'downtown-office-south');
  build(87, 226, 17, 13.2, 18, 4, 6, palette.brick, 'downtown-shop-east');
  const residence = build(50, 235, 24, 12.8, 20, 4, 7, palette.facade, 'toyokawa-residence');
  box(25, 0.35, 2.5, palette.trim, 50, 4.3, 224.9);
  box(4.4, 3.2, 0.16, palette.glass, 50, 1.9, 224.85);
  solidBox('toyokawa-exterior-door', 50, 224.85, 4.4, 0.16);
  tag(residence, 'observe');
  for (const [x, z] of [[-99, 244], [-60, 245], [94, 243], [15, 238], [-42, 225]]) tree(x, z, 1.35, Math.abs(x) % 4);
  box(114, 0.025, 92, palette.grass, 188, 0, -160);
  // Reapply the park avenue above its turf; the lake has a real collision shore.
  for (const path of scenePaths.filter(path => path.z < -100)) box(path.width, 0.035, path.depth, path.kind === 'road' ? palette.asphalt : palette.path, path.x, path.kind === 'road' ? 0.005 : 0.025, path.z);
  const lake = mesh(unitDisc, material(0x6d999b, { roughness: 0.32, metalness: 0.18 }), 179, 0.05, -192);
  lake.rotation.x = -Math.PI / 2; lake.scale.set(23, 12, 1);
  // Walkers keep clear of the water even where the visual bank is gently curved.
  solidBox('city-park-lake', 179, -192, 46, 24);
  box(98, 0.035, 4.8, palette.path, 185, 0.02, -176);
  for (const [x, z] of [[135, -194], [147, -176], [135, -132], [158, -119], [211, -199], [232, -190], [234, -169], [230, -129], [203, -119], [210, -137]]) tree(x, z, 1.7, Math.abs(x + z) % 4);
  for (const x of [201, 217]) {
    box(4.2, 0.16, 0.8, palette.wood, x, 0.75, -182);
    box(4.2, 0.9, 0.12, palette.wood, x, 1.1, -182.4);
    solidBox(`city-park-bench:${x}`, x, -182.1, 4.2, 0.9);
  }

  const cityShelter = (id: string, x: number, z: number) => {
    box(12, 0.25, 3.6, palette.roof, x, 3.2, z + 4.3);
    box(11.5, 2.6, 0.13, palette.glass, x, 1.5, z + 5.9);
    solidBox(`${id}:shelter-back`, x, z + 5.9, 11.5, 0.13);
    for (const xx of [x - 5.3, x + 5.3]) {
      cylinder(0.08, 0.1, 3.1, palette.dark, xx, 1.55, z + 3);
      solidCircle(`${id}:shelter-post:${xx}`, xx, z + 3, 0.1);
    }
    box(5.4, 0.15, 0.7, palette.wood, x, 0.75, z + 5);
    solidBox(`${id}:shelter-seat`, x, z + 5, 5.4, 0.7);
    cylinder(0.07, 0.1, 3.4, palette.dark, x - 8, 1.7, z);
    box(1.2, 1.65, 0.15, palette.shopGreen, x - 8, 2.6, z);
    solidBox(`${id}:stop-sign`, x - 8, z, 1.2, 0.16);
    for (let index = 0; index < 4; index++) box(0.75, 0.04, 0.04, palette.trim, x - 8, 2.95 - index * 0.24, z - 0.1);
  };
  cityShelter('home', -180, 150); cityShelter('commercial', 180, 150); cityShelter('city-park', 180, -150);
  cityShelter('downtown', -20, 185); cityShelter('grand-commercial', -180, -150);
  build(-180, -175, 32, 16.5, 22, 5, 8, palette.facade, 'grand-mall');
  build(-155, -135, 26, 14.2, 20, 4, 6, palette.brick, 'livehouse');
  build(-205, -135, 24, 12.8, 18, 4, 6, palette.shopRed, 'ktv');
  build(-150, -180, 20, 22.0, 20, 7, 5, palette.stone, 'grand-tower');
  for (const [x, z] of [[-180, 141], [180, 141], [180, -159], [-20, 176], [-180, -141]]) {
    for (let dx = -53; dx <= 53; dx += 7) if (Math.abs(dx) > 9) box(3.5, 0.025, 0.12, palette.roadPaint, x + dx, 0.035, z);
    for (let dz = -4; dz <= 4; dz += 1.1) box(3, 0.025, 0.5, palette.roadPaint, x - 14, 0.035, z + dz);
  }

  // Low masonry and rails visibly close the expanded finite city block.
  const fullWidth = sceneBounds.maxX - sceneBounds.minX, fullDepth = sceneBounds.maxZ - sceneBounds.minZ;
  const centerX = (sceneBounds.minX + sceneBounds.maxX) / 2, centerZ = (sceneBounds.minZ + sceneBounds.maxZ) / 2;
  for (const x of [sceneBounds.minX, sceneBounds.maxX]) {
    box(0.5, 0.85, fullDepth, palette.stone, x, 0.425, centerZ); box(0.12, 0.08, fullDepth, palette.roof, x, 1.3, centerZ);
    solidBox(`boundary:x:${x}`, x, centerZ, 0.5, fullDepth);
    for (let z = sceneBounds.minZ + 2; z < sceneBounds.maxZ; z += 6) box(0.08, 0.55, 0.08, palette.roof, x, 1.05, z);
  }
  for (const z of [sceneBounds.minZ, sceneBounds.maxZ]) {
    box(fullWidth, 0.85, 0.5, palette.stone, centerX, 0.425, z); box(fullWidth, 0.08, 0.12, palette.roof, centerX, 1.3, z);
    solidBox(`boundary:z:${z}`, centerX, z, fullWidth, 0.5);
    for (let x = sceneBounds.minX + 2; x < sceneBounds.maxX; x += 6) box(0.08, 0.55, 0.08, palette.roof, x, 1.05, z);
  }
  // Warm practical lights are visible meshes, without continuous animation or expensive postprocessing.
  const lampGlow = material(0xffdf9c, { emissive: 0xffbd66, emissiveIntensity: 1.5 });
  for (const [x, z] of [[-3.7, 7.5], [3.7, -5], [-12.5, -5], [10, 10], [-29, -24], [29, -24], [-24, 39.5], [24, 39.5], [-41, 56.5], [34, 56.5], [-6.5, 73], [9.5, 83]]) {
    cylinder(0.065, 0.095, 3.8, palette.dark, x, 1.9, z);
    solidCircle(`lamp:${x}:${z}`, x, z, 0.095);
    cylinder(0.35, 0.18, 0.18, palette.dark, x, 3.85, z);
    cylinder(0.22, 0.25, 0.42, lampGlow, x, 3.55, z);
    shadow(x + 0.2, z + 0.2, 0.7, 0.5);
  }
  const hemi = new THREE.HemisphereLight(0xffe1c2, 0x6f866b, 2.3);
  const sun = new THREE.DirectionalLight(0xffd3a0, 2.5); sun.position.set(-20, 20, 12);
  scene.add(hemi, sun);
  const sunBall = mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffdeb3 }), -36, 18, -63);
  materials.add(sunBall.material);
  scene.fog = new THREE.Fog(0xc7bba9, 55, 170);

  // Small local text signs use the system font; no downloads or image assets are required.
  const signText = (text: string, x: number, y: number, z: number, width: number, north = false) => {
    // Geometry/data tests and static fallback do not require a canvas implementation.
    if (typeof document === 'undefined' || typeof CanvasRenderingContext2D === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 80;
    const context = canvas.getContext('2d'); if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fff1d1'; context.font = '600 44px "Microsoft YaHei", "PingFang SC", sans-serif';
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 192, 42, 360);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }); materials.add(mat);
    const sign = mesh(new THREE.PlaneGeometry(width, width * 80 / 384), mat, x, y, z); if (north) sign.rotation.y = Math.PI;
  };
  box(8, 1.45, 0.13, palette.roof, 0, 5.6, -10.25); signText('图书馆', 0, 5.6, -10.16, 7.5);
  box(8.6, 1.5, 0.13, palette.roof, 0, 5.3, -39.65); signText('教学楼', 0, 5.3, -39.55, 8);
  box(8.6, 1.5, 0.13, palette.roof, -49, 5.1, -7.65); signText('学生公寓', -49, 5.1, -7.55, 8);
  signText('校园咖啡', 14, 3.35, 0.04, 6);
  signText('街角书店', -22, 3.48, 58.68, 7.5, true);
  signText('便利店', 21, 3.48, 58.68, 6.5, true);
  signText('街边咖啡', 48, 3.48, 58.68, 7.5, true);
  signText('南门公交站', 47, 3.12, 37.32, 8);
  signText('住宅区 · 示例住处', -192, 5, 126.22, 14);
  signText('城市商业区', 178, 4.2, 118.91, 16);
  signText('城市公园', 180, 3.2, -152.67, 10);
  for (const [label, x, z] of [['住宅区公交站', -180, 150], ['商业区公交站', 180, 150], ['公园公交站', 180, -150]] as const) signText(label, x, 3.2, z + 2.45, 11, true);
  box(6.5, 1.1, 0.18, palette.roof, 46, 2.7, 14.5); signText('运动场', 46, 2.7, 14.61, 6);
  for (const x of [43.3, 48.7]) { box(0.1, 2.2, 0.1, palette.dark, x, 1.1, 14.5); solidBox(`sport-sign-post:${x}`, x, 14.5, 0.1, 0.1); }
  box(4.8, 1.1, 0.18, palette.shopGreen, 27, 2.5, 74); signText('口袋公园', 27, 2.5, 73.89, 4.4, true);
  for (const x of [25, 29]) { box(0.1, 2, 0.1, palette.dark, x, 1, 74); solidBox(`park-sign-post:${x}`, x, 74, 0.1, 0.1); }

  // Batch repeated windows, facade trim, trunks, foliage and railings by geometry/material.
  // Keep separate batches inside each hotspot group so the existing raycast actions remain intact.
  world.updateMatrixWorld(true);
  const batches = new Map<THREE.Object3D, Map<string, THREE.Mesh[]>>();
  world.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object === sunBall || Array.isArray(object.material)) return;
    let ancestor = object.parent, owner: THREE.Object3D = world;
    while (ancestor && ancestor !== world) {
      if (ancestor === walkMarker) return;
      if (pickables.includes(ancestor) && owner === world) owner = ancestor;
      ancestor = ancestor.parent;
    }
    const key = `${object.geometry.uuid}:${object.material.uuid}`;
    let ownerBatches = batches.get(owner); if (!ownerBatches) { ownerBatches = new Map(); batches.set(owner, ownerBatches); }
    const batch = ownerBatches.get(key) ?? []; batch.push(object); ownerBatches.set(key, batch);
  });
  const inverse = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  for (const [owner, groups] of batches) for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const batch = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
    inverse.copy(owner.matrixWorld).invert();
    meshes.forEach((object, index) => { matrix.multiplyMatrices(inverse, object.matrixWorld); batch.setMatrixAt(index, matrix); object.removeFromParent(); });
    batch.instanceMatrix.setUsage(THREE.StaticDrawUsage); batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox(); batch.computeBoundingSphere(); owner.add(batch); instances.push(batch);
  }

  return {
    pickables,
    movementWorld,
    setWalkTarget(position: [number, number, number] | undefined, yaw: number) {
      walkMarker.visible = !!position;
      if (position) walkMarker.position.set(position[0], 0, position[2]);
      walkMarker.rotation.y = -yaw;
    },
    setTime(hour: number, locationId: string) {
      const night = hour < 6 || hour >= 20;
      const evening = hour >= 16 && hour < 20;
      hemi.intensity = night ? 1.35 : 2.3;
      sun.intensity = night ? 0.55 : evening ? 2.5 : 2.8;
      sun.color.set(night ? 0xaebcd9 : evening ? 0xffd3a0 : 0xfff1d2);
      sunBall.visible = !night;
      if (scene.fog instanceof THREE.Fog) scene.fog.color.set(night ? 0x657879 : locationId === 'cafe' ? 0xc6b29c : 0xc7bba9);
      windows.forEach((mat) => { mat.emissiveIntensity = night ? 0.95 : evening ? 0.32 : 0.08; });
    },
    dispose() {
      world.removeFromParent(); hemi.removeFromParent(); sun.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      textures.forEach((texture) => texture.dispose());
      instances.forEach((instance) => instance.dispose());
      pickables.length = 0;
    },
  };
}
