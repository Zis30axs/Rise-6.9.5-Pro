import * as THREE from 'three';
import { readLocalAssetBytes } from './local-asset-buffer';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const groundVehicleIds = ['btr82a', 'zbd04a', 't84'] as const;
export type GroundVehicleId = typeof groundVehicleIds[number];
export type GroundVehicleStatus = 'idle' | 'loading' | 'ready' | 'error';
export interface VehicleStop { id: string; x: number; z: number; roadZ: number }
export const vehicleStops: readonly VehicleStop[] = [
  { id: 'bus-stop', x: 46, z: 38, roadZ: 48 },
  { id: 'home', x: -180, z: 150, roadZ: 141 },
  { id: 'commercial', x: 180, z: 150, roadZ: 141 },
  { id: 'city-park', x: 180, z: -150, roadZ: -159 },
  { id: 'grand-commercial', x: -180, z: -150, roadZ: -141 },
];

/** Decorative traffic uses visible animation time only, and never changes a saved world clock. */
export function groundVehiclePose(id: GroundVehicleId, seconds: number, stop: VehicleStop) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const lane = stop.id === 'bus-stop' ? -2.7 : 2.7;
  if (id === 't84') {
    const progress = ((seconds * 2.3 + 16) % 110) / 110;
    return { x: stop.x + 55 - progress * 110, z: stop.roadZ - lane, y: 0.02, yaw: -Math.PI / 2, waiting: false, opacity: Math.min(1, progress * 10, (1 - progress) * 10) };
  }
  const phase = (seconds + (id === 'zbd04a' ? 18 : 0)) % 124;
  const berth = id === 'btr82a' ? -4 : 10;
  // Long dwell, a smooth low-speed departure, then approach from the other end of the road.
  const offset = phase < 72 ? 0 : phase < 98 ? (phase - 72) * 1.65 : -42.9 + (phase - 98) * 1.65;
  const opacity = phase < 92 || phase >= 104 ? 1 : phase < 98 ? (98 - phase) / 6 : (phase - 98) / 6;
  return { x: stop.x + berth + offset, z: stop.roadZ + lane, y: 0.02, yaw: Math.PI / 2, waiting: phase < 72, opacity };
}

/** Only embedded, ordinary GLB is accepted; no model can fetch an outside image or decoder. */
export async function loadGroundVehicleModel(dataUrl: string): Promise<THREE.Group> {
  const bytes = await readLocalAssetBytes(dataUrl, 8000000, 'Invalid bundled vehicle');
  if (bytes.length < 20) throw new Error('Invalid vehicle GLB');
  const view = new DataView(bytes.buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length
    || view.getUint32(16, true) !== 0x4e4f534a || view.getUint32(12, true) > bytes.length - 20) throw new Error('Invalid vehicle GLB');
  const definition: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw new Error('Invalid vehicle definition');
  const data = definition as Record<string, unknown>;
  for (const name of ['buffers', 'images']) {
    const items = data[name];
    if (items !== undefined && (!Array.isArray(items) || items.some(item => !item || typeof item !== 'object' || 'uri' in item))) {
      throw new Error('Vehicle must be self-contained without a decoder');
    }
  }
  for (const name of ['extensionsRequired', 'extensionsUsed']) {
    if (data[name] !== undefined && (!Array.isArray(data[name]) || data[name].length > 0)) throw new Error('Vehicle must be self-contained without a decoder');
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => { if (!url.startsWith('blob:')) throw new Error('Vehicle external resource blocked'); return url; });
  return (await new GLTFLoader(manager).parseAsync(bytes.buffer, '')).scene;
}

/** Lightweight civilian Tokyo vehicles. Historical IDs are kept for saves but military GLBs are unused. */
export function createTokyoRoadVehicle(id: GroundVehicleId): THREE.Group {
  const isBus = id === 'btr82a', isTaxi = id === 'zbd04a';
  const length = isBus ? 7.1 : isTaxi ? 4.3 : 4.1;
  const width = isBus ? 2.15 : 1.82;
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: isBus ? '#f2f0db' : isTaxi ? '#253a46' : '#c8dad9', roughness: .72 });
  const glass = new THREE.MeshStandardMaterial({ color: '#557986', roughness: .28, metalness: .15 });
  const tire = new THREE.MeshStandardMaterial({ color: '#292e36', roughness: .94 });
  const trim = new THREE.MeshStandardMaterial({ color: '#fff2cb', roughness: .5 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); group.add(mesh); return mesh;
  };
  const bodyH = isBus ? 2.4 : .9;
  add(new THREE.BoxGeometry(length, bodyH, width), paint, 0, .52 + bodyH / 2, 0);
  if (isBus) {
    add(new THREE.BoxGeometry(length * .85, .74, width + .009), glass, 0, 1.95, 0);
    const stripe = new THREE.MeshStandardMaterial({ color: '#2b846d', roughness: .75 });
    add(new THREE.BoxGeometry(length + .012, .1, width + .018), stripe, 0, 1.15, 0);
  } else {
    add(new THREE.BoxGeometry(length * .54, .52, width * .86), paint, 0, 1.48, 0);
    add(new THREE.BoxGeometry(length * .45, .38, width * .88), glass, 0, 1.47, 0);
    if (isTaxi) add(new THREE.BoxGeometry(.78, .13, .38), trim, 0, 1.87, 0);
  }
  for (const x of [-length * .33, length * .33]) for (const z of [-width * .52, width * .52]) {
    const wheel = add(new THREE.CylinderGeometry(.33, .33, .19, 12), tire, x, .34, z);
    wheel.rotation.x = Math.PI / 2;
  }
  for (const z of [-width * .3, width * .3]) add(new THREE.BoxGeometry(.06, .22, .26), trim, length / 2 + .04, 1.02, z);
  group.name = isBus ? 'tokyo-civilian-bus' : isTaxi ? 'tokyo-civilian-taxi' : 'tokyo-civilian-car';
  return group;
}

export interface GroundVehicleSnapshot { status: GroundVehicleStatus; count: number; activeIds: GroundVehicleId[]; stopId: string }

export function createSceneVehicles(scene: THREE.Scene, options: {
  loadModel: (id: GroundVehicleId) => Promise<THREE.Group>;
  changed?: (snapshot: GroundVehicleSnapshot) => void;
}) {
  const group = new THREE.Group(); group.name = 'scene-ground-vehicles'; scene.add(group);
  const models = new Map<GroundVehicleId, THREE.Group>();
  const finishes = new Map<GroundVehicleId, { material: THREE.Material; opacity: number; transparent: boolean; depthWrite: boolean }[]>();
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const bitmaps = new Set<{ close: () => void }>();
  let status: GroundVehicleStatus = 'idle', disposed = false, seconds = 0, remaining = 0, failed = false;
  let stop = vehicleStops[0], snapshotKey = '';
  function release(model: THREE.Object3D) {
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!geometries.has(object.geometry)) { geometries.add(object.geometry); object.geometry.dispose(); }
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (materials.has(material)) continue;
        materials.add(material);
        for (const texture of Object.values(material)) {
          if (!(texture instanceof THREE.Texture) || textures.has(texture)) continue;
          textures.add(texture); texture.dispose();
          const bitmap: unknown = texture.source?.data;
          if (bitmap && typeof bitmap === 'object' && 'close' in bitmap && typeof bitmap.close === 'function' && !bitmaps.has(bitmap as { close: () => void })) {
            bitmaps.add(bitmap as { close: () => void }); bitmap.close();
          }
        }
        material.dispose();
      }
    });
    model.removeFromParent();
  }
  function publish() {
    if (disposed) return;
    const activeIds = groundVehicleIds.filter(id => models.get(id)?.visible);
    const key = `${status}:${activeIds.join(',')}:${stop.id}`;
    if (key !== snapshotKey) { snapshotKey = key; options.changed?.({ status, count: activeIds.length, activeIds, stopId: stop.id }); }
  }
  function beginLoad() {
    status = 'loading'; remaining = groundVehicleIds.length; publish();
    for (const id of groundVehicleIds) {
      void Promise.resolve().then(() => options.loadModel(id)).then(model => {
        if (disposed) { release(model); return; }
        const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        if (!Number.isFinite(size.length()) || size.x <= 0 || size.y <= 0 || size.z <= 0 || Math.max(size.x, size.y, size.z) > 20) {
          release(model); throw new Error('Invalid vehicle dimensions');
        }
        model.name = `scene-vehicle-${id}`; model.visible = false;
        const finish = new Map<THREE.Material, { material: THREE.Material; opacity: number; transparent: boolean; depthWrite: boolean }>();
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = false; object.receiveShadow = false;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if (!finish.has(material)) finish.set(material, { material, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
          }
        });
        finishes.set(id, [...finish.values()]);
        models.set(id, model); group.add(model);
      }).catch(() => { failed = true; }).finally(() => {
        if (disposed) return;
        remaining--; status = remaining ? 'loading' : failed ? 'error' : 'ready'; publish();
      });
    }
  }
  return {
    group,
    update(deltaSeconds: number, observer: { x: number; z: number }, animate = true): boolean {
      if (disposed) return false;
      const nearest = vehicleStops.reduce((best, candidate) => Math.hypot(observer.x - candidate.x, observer.z - candidate.z) < Math.hypot(observer.x - best.x, observer.z - best.z) ? candidate : best);
      stop = nearest;
      if (status === 'idle') beginLoad();
      if (animate && Number.isFinite(deltaSeconds) && deltaSeconds > 0) seconds += Math.min(deltaSeconds, 0.1);
      for (const id of groundVehicleIds) {
        const model = models.get(id); if (!model) continue;
        const pose = groundVehiclePose(id, seconds, stop)!;
        model.position.set(pose.x, pose.y, pose.z); model.rotation.y = pose.yaw;
        model.visible = pose.opacity > 0 && Math.hypot(observer.x - stop.x, observer.z - stop.z) < 115;
        for (const finish of finishes.get(id) ?? []) {
          const transparent = finish.transparent || pose.opacity < 1;
          if (finish.material.transparent !== transparent) { finish.material.transparent = transparent; finish.material.needsUpdate = true; }
          finish.material.opacity = finish.opacity * pose.opacity;
          finish.material.depthWrite = pose.opacity < 1 ? false : finish.depthWrite;
        }
        model.userData.vehicleId = id; model.userData.waiting = pose.waiting;
      }
      publish();
      return animate && [...models.values()].some(model => model.visible);
    },
    dispose() {
      if (disposed) return;
      disposed = true; models.forEach(release); models.clear(); finishes.clear(); group.removeFromParent();
    },
  };
}
