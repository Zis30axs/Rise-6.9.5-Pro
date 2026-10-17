import * as THREE from 'three';

export type SceneAction = 'phone' | 'map' | 'observe' | 'rest' | 'schedule';
export interface SceneHotspot {
  action: SceneAction;
  label: string;
  position: THREE.Vector3;
  fallback: [number, number];
}

export const sceneHotspots: SceneHotspot[] = [
  { action: 'map', label: '路牌 · 地图', position: new THREE.Vector3(-5.6, 2.8, 2.2), fallback: [23, 48] },
  { action: 'rest', label: '长椅 · 歇一会', position: new THREE.Vector3(6, 1.5, 3.5), fallback: [73, 63] },
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
    { label: '林荫路口', position: [-8, 1.7, 9], yaw: -0.66 },
    { label: '公寓前庭', position: [-11, 1.7, 0], yaw: -0.9 },
    { label: '楼前步道', position: [-11, 1.7, -5], yaw: -1.22 },
  ],
};

/** Local geometry only. The scene is illustrative; it is not a world-state authority. */
export function createCampusWorld(scene: THREE.Scene) {
  const world = new THREE.Group();
  scene.add(world);
  const pickables: THREE.Object3D[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const windows: THREE.MeshStandardMaterial[] = [];
  const material = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.86, ...extra });
    materials.add(value);
    return value;
  };
  const palette = {
    stone: material(0xe0d1b7), facade: material(0xc9ba9e), roof: material(0x657061),
    trim: material(0xf0e2c5), dark: material(0x343f3d), wood: material(0x875f42),
    grass: material(0x708569), path: material(0xd4c5aa), soil: material(0x69745e),
    leaf: [material(0x718462), material(0x9a9c69), material(0x546f58), material(0xa38e62)],
    gold: material(0xccab6a), glass: material(0x57726f, { metalness: 0.22, roughness: 0.45 }),
  };
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = world) => {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent?: THREE.Object3D) =>
    mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const cylinder = (r1: number, r2: number, h: number, mat: THREE.Material, x: number, y: number, z: number) =>
    mesh(new THREE.CylinderGeometry(r1, r2, h, 8), mat, x, y, z);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x293e32, transparent: true, opacity: 0.16, depthWrite: false });
  materials.add(shadowMat);
  const shadow = (x: number, z: number, sx: number, sz: number) => {
    const object = mesh(new THREE.CircleGeometry(1, 24), shadowMat, x, 0.025, z);
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
  box(180, 0.5, 160, palette.grass, 0, -0.3, -20);
  box(5.3, 0.045, 75, palette.path, 0, 0, 12);
  box(43, 0.05, 3.6, palette.path, 0, 0.005, -4.6);
  box(23, 0.04, 4.8, palette.path, 0, 0.006, -9.4);
  for (let i = 0; i < 20; i++) {
    box(0.06, 0.052, 1.5, palette.stone, -2.5, 0.015, i * 2.4 - 6);
    box(0.06, 0.052, 1.5, palette.stone, 2.5, 0.015, i * 2.4 - 6);
  }
  const build = (x: number, z: number, w: number, h: number, d: number, floors: number, cols: number, facade = palette.facade) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    world.add(group);
    box(w, h, d, facade, 0, h / 2, 0, group);
    box(w + 0.55, 0.28, d + 0.55, palette.trim, 0, h + 0.12, 0, group);
    box(w + 0.15, 0.5, d + 0.12, palette.stone, 0, 0.25, 0, group);
    for (let floor = 0; floor < floors; floor++) {
      const yy = 1.5 + floor * (h - 1.4) / floors;
      box(w + 0.1, 0.12, d + 0.12, palette.trim, 0, yy - 0.9, 0, group);
      for (let col = 0; col < cols; col++) {
        const xx = (col - (cols - 1) / 2) * (w - 1.6) / cols;
        const lit = (floor * 3 + col) % 4 !== 0;
        const mat = material(lit ? 0xebc38a : 0x54716c, { emissive: lit ? 0xffc679 : 0x345851, emissiveIntensity: lit ? 0.32 : 0.08 });
        if (lit) windows.push(mat);
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
  box(5.6, 0.22, 3.5, palette.trim, 0, 0.3, -9.4);
  box(5, 3.8, 0.15, palette.dark, 0, 2.25, -10.4);
  box(4.5, 3.4, 0.2, palette.glass, 0, 2.25, -10.28);
  box(7.2, 0.35, 2.3, palette.trim, 0, 4.6, -9.9);
  for (const x of [-2.9, 2.9]) cylinder(0.2, 0.24, 4.2, palette.trim, x, 2.3, -9.2);
  box(0.08, 3.4, 0.3, palette.gold, 0, 2.25, -10.1);
  build(-18, -10, 7.5, 13.5, 12, 5, 4, palette.stone);
  build(18, -12, 8, 8.6, 11, 3, 5);
  // The entrance and the opposite street remain present when the player turns around.
  const rearLeft = build(-18, 41, 12, 8, 8, 3, 6, palette.stone); rearLeft.rotation.y = Math.PI;
  const rearRight = build(18, 43, 15, 10, 8, 3, 7); rearRight.rotation.y = Math.PI;
  box(75, 0.045, 6, palette.path, 0, 0.005, 36);
  for (const x of [-5, 5]) { box(1, 4.6, 1, palette.stone, x, 2.3, 27); box(1.3, 0.35, 1.3, palette.trim, x, 4.7, 27); }
  box(11.4, 0.45, 0.9, palette.trim, 0, 4.8, 27);
  for (let i = 0; i < 9; i++) {
    const xx = 7 + i * 1.4;
    for (const sign of [-1, 1]) { box(0.1, 1.45, 0.1, palette.roof, xx * sign, 0.75, 27); box(1.5, 0.07, 0.1, palette.roof, xx * sign, 1.3, 27); }
  }
  // Café, striped awning and terrace.
  const cafe = build(14, -2.6, 7, 4, 5, 1, 4, material(0xc49776));
  tag(cafe, 'phone');
  const awning = box(7.5, 0.18, 2, palette.roof, 14, 2.8, 0.6);
  awning.rotation.x = 0.08;
  for (let i = 0; i < 9; i += 2) box(0.45, 0.19, 2.05, palette.trim, 10.6 + i * 0.8, 2.82, 0.6);
  for (const [x, z] of [[11, 3.4], [15, 4.2]]) {
    cylinder(0.7, 0.7, 0.11, palette.wood, x, 1.15, z);
    cylinder(0.08, 0.15, 1.1, palette.dark, x, 0.6, z);
    for (const dx of [-1, 1]) box(0.52, 0.1, 0.55, palette.wood, x + dx, 0.65, z);
  }
  // Hazy skyline behind the courtyard.
  const distantMat = material(0xa4a798);
  for (let i = 0; i < 11; i++) box(5 + i % 3, 8 + i % 4 * 2.2, 6, distantMat, (i - 5) * 8, 4 + i % 4, -37 - i % 3 * 3);

  function tree(x: number, z: number, scale: number, colorIndex: number) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    world.add(group);
    group.scale.setScalar(scale);
    const trunk = box(0.32, 3.4, 0.32, palette.wood, 0, 1.7, 0, group);
    trunk.rotation.z = 0.04;
    const leaf = palette.leaf[colorIndex % palette.leaf.length];
    for (const [xx, yy, zz, rr] of [[0, 4.4, 0, 1.8], [-0.9, 3.7, 0.35, 1.35], [1, 3.9, -0.2, 1.45], [0.4, 5.4, 0.1, 1.1]]) {
      const crown = mesh(new THREE.IcosahedronGeometry(rr, 1), leaf, xx, yy, zz, group);
      crown.scale.y = 1.1;
    }
    shadow(x + 0.4, z + 0.7, 2.7 * scale, 1.5 * scale);
  }
  for (const [x, z, size, color] of [[-9, 3, 1.45, 0], [-14, 8, 1.6, 2], [-7, -6, 1.1, 1], [-15, -2, 1.2, 2], [8, -6.5, 1.15, 0], [12, 8, 1.6, 1], [19, 4, 1.3, 2], [-24, -16, 1.3, 0], [25, -14, 1.5, 1], [-7, 15, 1.6, 0], [7, 17, 1.4, 2]]) tree(x, z, size, color);
  for (const [x, z] of [[-8.8, 3], [7.8, -6], [11.5, 8]]) {
    box(3.7, 0.5, 2.3, palette.stone, x, 0.25, z);
    box(3.4, 0.05, 2, palette.soil, x, 0.53, z);
  }
  // A recognisable bench, signpost and bulletin board are the actual raycast targets.
  const bench = new THREE.Group(); bench.position.set(6, 0, 3.5); world.add(bench); tag(bench, 'rest');
  for (const y of [1, 1.3, 1.6]) box(3.5, 0.2, 0.14, palette.wood, 0, y, -0.45, bench);
  for (const z of [-0.3, 0, 0.3]) box(3.5, 0.15, 0.25, palette.wood, 0, 0.82, z, bench);
  for (const x of [-1.35, 1.35]) { box(0.14, 0.8, 0.85, palette.dark, x, 0.42, 0, bench); box(0.14, 1.1, 0.14, palette.dark, x, 1.1, -0.5, bench); }
  shadow(6.4, 3.7, 2.3, 0.9);
  const sign = new THREE.Group(); sign.position.set(-5.6, 0, 2.2); world.add(sign); tag(sign, 'map');
  box(0.13, 2.7, 0.13, palette.dark, 0, 1.35, 0, sign);
  for (const [y, x, color] of [[2.25, 0.3, palette.roof], [1.8, -0.15, palette.wood]] as const) box(2, 0.4, 0.17, color, x, y, 0, sign);
  box(0.95, 0.04, 0.18, palette.trim, 0.2, 2.25, 0.01, sign);
  box(0.9, 0.04, 0.18, palette.trim, -0.25, 1.8, 0.01, sign);
  const board = new THREE.Group(); board.position.set(-10, 0, -4); world.add(board); tag(board, 'schedule');
  box(3.4, 2.1, 0.22, palette.wood, 0, 2, 0, board);
  box(3.1, 1.8, 0.25, palette.roof, 0, 2, 0, board);
  for (const x of [-1.3, 1.3]) box(0.16, 1.2, 0.18, palette.dark, x, 0.6, 0, board);
  for (const [x, y, angle] of [[-0.8, 2.15, -0.08], [0.05, 1.9, 0.07], [0.87, 2.2, -0.04]]) {
    const paper = box(0.6, 1, 0.04, palette.trim, x, y, 0.15, board); paper.rotation.z = angle;
  }
  const phone = new THREE.Group(); phone.position.set(8.5, 0, -3.2); world.add(phone); tag(phone, 'phone');
  box(0.65, 1.4, 0.65, palette.stone, 0, 0.7, 0, phone);
  box(0.65, 0.95, 0.18, palette.dark, 0, 1.95, 0, phone);
  box(0.47, 0.7, 0.2, material(0xb7d8b3, { emissive: 0x96c8aa, emissiveIntensity: 0.25 }), 0, 1.98, 0.03, phone);
  // Warm practical lights are visible meshes, without continuous animation or expensive postprocessing.
  const lampGlow = material(0xffdf9c, { emissive: 0xffbd66, emissiveIntensity: 1.5 });
  for (const [x, z] of [[-3.7, 7.5], [3.7, -5], [-12.5, -5], [10, 10]]) {
    cylinder(0.065, 0.095, 3.8, palette.dark, x, 1.9, z);
    cylinder(0.35, 0.18, 0.18, palette.dark, x, 3.85, z);
    cylinder(0.22, 0.25, 0.42, lampGlow, x, 3.55, z);
    shadow(x + 0.2, z + 0.2, 0.7, 0.5);
  }
  const hemi = new THREE.HemisphereLight(0xffe1c2, 0x6f866b, 2.3);
  const sun = new THREE.DirectionalLight(0xffd3a0, 2.5); sun.position.set(-20, 20, 12);
  scene.add(hemi, sun);
  const sunBall = mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffdeb3 }), -36, 18, -63);
  materials.add(sunBall.material);
  scene.fog = new THREE.Fog(0xc7bba9, 32, 115);

  return {
    pickables,
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
      pickables.length = 0;
    },
  };
}
