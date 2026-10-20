import * as THREE from 'three';
import { readLocalAssetBytes } from './local-asset-buffer';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AirlinerPass } from './types';

export type AircraftModelStatus = 'idle' | 'loading' | 'ready' | 'error';
const routes = [
  [[-190, 64, -110], [190, 64, -110]],
  [[175, 70, -150], [-175, 70, 100]],
  [[90, 72, 190], [90, 72, -180]],
  [[-180, 66, 120], [180, 66, -150]],
] as const;

/** Absolute saved time determines progress, including after hiding or remounting the view. */
export function aircraftPose(pass: AirlinerPass | null, now: number) {
  if (!pass || !Number.isFinite(now) || !Number.isFinite(pass.startedAt) || !Number.isFinite(pass.durationMs) || pass.durationMs <= 0) return null;
  const progress = (now - pass.startedAt) / pass.durationMs;
  const route = routes[pass.routeIndex];
  if (!route || !Number.isFinite(progress) || progress < 0 || progress >= 1) return null;
  const [from, to] = route;
  return {
    progress,
    x: from[0] + (to[0] - from[0]) * progress,
    y: from[1] + (to[1] - from[1]) * progress,
    z: from[2] + (to[2] - from[2]) * progress,
    yaw: Math.atan2(to[0] - from[0], to[2] - from[2]),
  };
}

/** Decode only our self-contained asset; a model can never request an external image or buffer. */
export async function loadAircraftModel(dataUrl: string): Promise<THREE.Group> {
  const bytes = await readLocalAssetBytes(dataUrl, 6000000, 'Invalid bundled aircraft');
  const buffer = bytes.buffer;
  const view = new DataView(buffer);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('Invalid aircraft GLB');
  const jsonLength = view.getUint32(12, true);
  if (jsonLength > bytes.length - 20) throw new Error('Invalid aircraft payload');
  const definition = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
    buffers?: { uri?: unknown }[]; images?: { uri?: unknown }[]; extensionsRequired?: string[]; extensionsUsed?: string[];
  };
  if ([...(definition.buffers ?? []), ...(definition.images ?? [])].some(item => item.uri !== undefined) || (definition.extensionsRequired?.length ?? 0) > 0 || (definition.extensionsUsed?.length ?? 0) > 0) throw new Error('Aircraft must be self-contained without a decoder');
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => { if (!url.startsWith('blob:')) throw new Error('Aircraft external resource blocked'); return url; });
  const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
  return gltf.scene;
}

function releaseModel(model: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  const bitmaps = new Set<{ close: () => void }>();
  textures.forEach(texture => {
    texture.dispose();
    const bitmap: unknown = texture.source?.data;
    if (bitmap && typeof bitmap === 'object' && 'close' in bitmap && typeof bitmap.close === 'function') bitmaps.add(bitmap as { close: () => void });
  });
  bitmaps.forEach(bitmap => bitmap.close());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  model.removeFromParent();
}

export function createSceneAircraft(scene: THREE.Scene, options: { loadModel: () => Promise<THREE.Group>; changed?: (status: AircraftModelStatus) => void }) {
  const group = new THREE.Group();
  group.name = 'scene-aircraft'; group.visible = false;
  scene.add(group);
  let pass: AirlinerPass | null = null;
  let model: THREE.Group | undefined;
  let status: AircraftModelStatus = 'idle';
  let disposed = false;
  function change(next: AircraftModelStatus) { status = next; if (!disposed) options.changed?.(next); }
  function beginLoad() {
    change('loading');
    void Promise.resolve().then(options.loadModel).then(next => {
      if (disposed) { releaseModel(next); return; }
      const bounds = new THREE.Box3().setFromObject(next);
      const size = bounds.getSize(new THREE.Vector3());
      const length = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(length) || length <= 0) { releaseModel(next); throw new Error('Empty aircraft'); }
      const center = bounds.getCenter(new THREE.Vector3());
      const content = new THREE.Group();
      content.add(next); next.position.sub(center);
      // Scene units are a distant visual approximation, not civil aviation altitude or scale.
      content.scale.setScalar(5.2 / length);
      // The bundled asset is exported upright with its nose along +Z.
      next.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = false; object.receiveShadow = false;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if ('fog' in material) material.fog = false;
        }
      });
      model = content; group.add(content); change('ready');
    }).catch(() => { if (!disposed) change('error'); });
  }
  return {
    group,
    setPass(next: AirlinerPass | null) { pass = next; },
    update(now: number, animate = true): boolean {
      if (disposed) return false;
      const pose = aircraftPose(pass, now);
      group.visible = !!pose && !!model;
      if (!pose) return false;
      if (status === 'idle') beginLoad();
      // Reduced motion retains a stationary sky marker until the saved pass expires.
      const rendered = animate ? pose : aircraftPose(pass, pass!.startedAt + pass!.durationMs / 2)!;
      group.position.set(rendered.x, rendered.y, rendered.z); group.rotation.y = rendered.yaw;
      group.userData.aircraftId = pass!.id; group.userData.progress = pose.progress;
      return !!model && animate;
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent();
      if (model) releaseModel(model);
      model = undefined; pass = null;
    },
  };
}
