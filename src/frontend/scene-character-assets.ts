import * as THREE from 'three';
import { readLocalAssetBytes } from './local-asset-buffer';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { isScenePositionWalkable, type SceneMovementWorld } from './scene-movement';
import { downtownArtPack } from './generated/downtown-art';
import { getAnonArt, getMutsumiArt, getNagasakiMotherArt, getRaanaArt, getTakiArt, getTomoriArt } from './downtown-art-runtime';
import { resolveMajoTrioSceneArt } from './majo-art';
import { resolveMarinaExpressionPortrait } from './marina-art';
import { resolveUikaExpressionPortrait } from './uika-art';
import { resolveUmiriExpressionPortrait } from './umiri-art';
import { resolveNovelNpcEmotion } from './novel-npc-emotions';
export { characterForPerson } from './character-appearance';

/** Named standing art for 若叶睦, 千早爱音, 要乐奈, 椎名立希, 高松灯, 长崎夫人, 三角初华, 八幡海铃, 月岛麻里奈, the 魔裁 casual trio, and 冰上梅露露. Other names stay on their existing models. */
export function resolveSceneCharacterArt(name: string, expression?: unknown) {
  const umiri = resolveUmiriExpressionPortrait(name, typeof expression === 'string' ? expression : '');
  if (umiri) return { ...umiri, id: `umiri_casual_${umiri.pose}`, outfit: 'casual' as const, anchor: [384, 1280] as const };
  const uika = resolveUikaExpressionPortrait(name, typeof expression === 'string' ? expression : '');
  if (uika) return { ...uika, id: `uika_casual_${uika.pose}`, outfit: 'casual' as const, anchor: [384, 1280] as const };
  const marinaEmotion = resolveNovelNpcEmotion(typeof expression === 'string' ? expression : '');
  const marina = resolveMarinaExpressionPortrait(name, marinaEmotion);
  if (marina) {
    const pose = marinaEmotion === 'happy' ? 'smile' : marinaEmotion === 'relieved' ? 'cheerful' : marinaEmotion === 'surprised' || marinaEmotion === 'sad' || marinaEmotion === 'shy' || marinaEmotion === 'thinking' ? 'surprised' : 'neutral';
    return { ...marina, id: `marina_casual_${pose}`, pose, outfit: 'casual' as const, anchor: [384, 1280] as const };
  }
  return getMutsumiArt(downtownArtPack, { speaker: name, expression })
    ?? getAnonArt(downtownArtPack, { speaker: name, expression })
    ?? getRaanaArt(downtownArtPack, { speaker: name, expression })
    ?? getTakiArt(downtownArtPack, { speaker: name, expression })
    ?? getTomoriArt(downtownArtPack, { speaker: name, expression })
    ?? getNagasakiMotherArt(downtownArtPack, { speaker: name, expression })
    ?? resolveMajoTrioSceneArt(name, expression);
}

export const characterModelIds = ['soyo', 'deepseek', 'xiaoyang', 'claude'] as const;
export type CharacterModelId = typeof characterModelIds[number];
export type CharacterModelStatus = 'idle' | 'loading' | 'ready' | 'error';
export type CharacterCameraMode = 'first-person' | 'third-person';
export interface CharacterModel { scene: THREE.Group; animations: THREE.AnimationClip[] }
export interface CharacterSnapshot { status: CharacterModelStatus; modelIds: CharacterModelId[]; instanceCount: number }
const heights: Record<CharacterModelId, number> = { soyo: 1.62, deepseek: 1.65, xiaoyang: 1.65, claude: 1.22 };

/** Ordinary embedded GLB only; imported models cannot load outside buffers, images or decoders. */
export async function loadCharacterModel(dataUrl: string): Promise<CharacterModel> {
  const bytes = await readLocalAssetBytes(dataUrl, 16000000, 'Invalid bundled character');
  if (bytes.length < 20) throw new Error('Invalid character GLB');
  const view = new DataView(bytes.buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length
    || view.getUint32(16, true) !== 0x4e4f534a || view.getUint32(12, true) > bytes.length - 20) throw new Error('Invalid character GLB');
  const definition: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw new Error('Invalid character definition');
  const data = definition as Record<string, unknown>;
  for (const name of ['buffers', 'images']) {
    const items = data[name];
    if (items !== undefined && (!Array.isArray(items) || items.some(item => !item || typeof item !== 'object' || 'uri' in item))) throw new Error('Character must be self-contained');
  }
  const allowed = new Set(['KHR_materials_unlit', 'KHR_materials_emissive_strength', 'KHR_materials_specular', 'KHR_texture_transform']);
  for (const name of ['extensionsRequired', 'extensionsUsed']) {
    const extensions = data[name];
    if (extensions !== undefined && (!Array.isArray(extensions) || extensions.some(extension => typeof extension !== 'string' || !allowed.has(extension)))) throw new Error('Character decoder is not bundled');
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => { if (!url.startsWith('blob:')) throw new Error('Character external resource blocked'); return url; });
  const gltf = await new GLTFLoader(manager).parseAsync(bytes.buffer, '');
  return { scene: gltf.scene, animations: gltf.animations };
}

function releaseSkeletons(model: THREE.Object3D) {
  const skeletons = new Set<THREE.Skeleton>();
  model.traverse(object => { if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton); });
  skeletons.forEach(skeleton => skeleton.dispose());
}

function releaseTemplate(model: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const bitmaps = new Set<{ close(): void }>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  releaseSkeletons(model);
  textures.forEach(texture => {
    texture.dispose();
    const bitmap: unknown = texture.source?.data;
    if (bitmap && typeof bitmap === 'object' && 'close' in bitmap && typeof bitmap.close === 'function') bitmaps.add(bitmap as { close(): void });
  });
  bitmaps.forEach(bitmap => bitmap.close()); materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
  model.removeFromParent();
}

export interface CharacterInstance { group: THREE.Group; modelId: CharacterModelId; animations: readonly THREE.AnimationClip[]; dispose(): void }

/** One decoded template per appearance. Clones share immutable meshes/materials/textures, but not bones. */
export function createCharacterAssetPool(options: {
  loadModel(id: CharacterModelId): Promise<CharacterModel>;
  changed?(snapshot: CharacterSnapshot): void;
}) {
  const pending = new Map<CharacterModelId, Promise<CharacterModel>>(), templates = new Map<CharacterModelId, CharacterModel>();
  const failed = new Set<CharacterModelId>(), instances = new Set<CharacterInstance>();
  let disposed = false;
  function snapshot(): CharacterSnapshot {
    return { status: failed.size ? 'error' : pending.size ? 'loading' : instances.size ? 'ready' : 'idle',
      modelIds: characterModelIds.filter(id => [...instances].some(instance => instance.modelId === id)), instanceCount: instances.size };
  }
  function changed() { if (!disposed) options.changed?.(snapshot()); }
  async function template(id: CharacterModelId) {
    if (disposed) throw new Error('Character pool released');
    const cached = templates.get(id); if (cached) return cached;
    const existing = pending.get(id); if (existing) return existing;
    if (failed.has(id)) throw new Error('Character unavailable');
    const promise = Promise.resolve().then(() => options.loadModel(id)).then(model => {
      if (disposed) { releaseTemplate(model.scene); throw new Error('Character pool released'); }
      const bounds = new THREE.Box3().setFromObject(model.scene), size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= 0) { releaseTemplate(model.scene); throw new Error('Empty character'); }
      model.scene.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = false; } });
      templates.set(id, model); return model;
    }).catch(error => { if (!disposed) failed.add(id); throw error; }).finally(() => { pending.delete(id); changed(); });
    pending.set(id, promise); changed(); return promise;
  }
  return {
    snapshot,
    async acquire(id: CharacterModelId): Promise<CharacterInstance> {
      const model = await template(id);
      if (disposed) throw new Error('Character pool released');
      const copy = cloneSkeleton(model.scene);
      const bounds = new THREE.Box3().setFromObject(copy), center = bounds.getCenter(new THREE.Vector3());
      const content = new THREE.Group(), group = new THREE.Group();
      content.add(copy); copy.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
      content.scale.setScalar(heights[id] / (bounds.max.y - bounds.min.y)); group.add(content);
      group.name = `character-${id}`; group.userData.characterModelId = id;
      let released = false;
      const instance: CharacterInstance = { group, modelId: id, animations: model.animations, dispose() {
        if (released) return; released = true; group.removeFromParent(); releaseSkeletons(copy); instances.delete(instance); changed();
      } };
      instances.add(instance); changed(); return instance;
    },
    dispose() {
      if (disposed) return; disposed = true;
      [...instances].forEach(instance => instance.dispose()); templates.forEach(model => releaseTemplate(model.scene)); templates.clear();
      // Pending parses release themselves on completion and never publish a late instance.
    },
  };
}
export type CharacterAssetPool = ReturnType<typeof createCharacterAssetPool>;

/** A short swept boom keeps the third-person camera on the player's side of scene walls. */
export function characterCameraPosition(eye: THREE.Vector3, yaw: number, pitch: number, world: SceneMovementWorld, distance = 3.25) {
  let safe = 0;
  for (let step = 0.1; step <= distance; step += 0.1) {
    if (!isScenePositionWalkable(eye.x - Math.sin(yaw) * step, eye.z + Math.cos(yaw) * step, world)) break;
    safe = step;
  }
  return new THREE.Vector3(eye.x - Math.sin(yaw) * safe, eye.y + 0.65 + Math.sin(pitch) * safe, eye.z + Math.cos(yaw) * safe);
}

/** Presentation camera only: never changes the stored walking point, yaw, pitch or preferred mode. */
export function applyCharacterCamera(camera: THREE.PerspectiveCamera, eye: THREE.Vector3, yaw: number, pitch: number, world: SceneMovementWorld,
  mode: CharacterCameraMode, phoneActive: boolean, width: number, height: number, distance = 3.25) {
  const w = Math.max(1, width), h = Math.max(1, height), floor = eye.y - 1.7;
  let displayYaw = yaw;
  camera.clearViewOffset(); camera.fov = w < 650 ? 77 : 68;
  if (phoneActive) {
    // Prefer the front; a slight front-side angle is allowed if a wall blocks the direct shot.
    const candidates = [0, 0.4, -0.4, 0.8, -0.8, Math.PI / 2, -Math.PI / 2, 2.3, -2.3, Math.PI].map(angle => characterCameraPosition(eye, yaw + Math.PI + angle, 0, world, 2.3));
    const clearance = (point: THREE.Vector3) => Math.hypot(point.x - eye.x, point.z - eye.z);
    const point = candidates.find(point => clearance(point) >= 2.1) ?? candidates.reduce((a, b) => clearance(a) >= clearance(b) ? a : b);
    const mobile = w <= 760;
    camera.position.copy(point); camera.position.y = floor + (mobile ? 1.52 : 1.5);
    // At a wall only the display model turns toward a safe camera; the saved heading is untouched.
    displayYaw = Math.atan2(point.x - eye.x, -(point.z - eye.z));
    const target = new THREE.Vector3(eye.x, floor + (mobile ? 1.34 : 1.02), eye.z);
    camera.lookAt(target);
    const phoneTop = THREE.MathUtils.clamp(h * 0.31, 174, 260);
    const rect = mobile ? { x: 16, y: 70, width: w - 32, height: Math.max(80, phoneTop - 78) }
      : { x: 24, y: 85, width: Math.max(160, w - 504), height: Math.max(150, h - 165) };
    const targetHeight = mobile ? 0.76 : 1.85, targetWidth = mobile ? 0.7 : 0.85;
    const targetDistance = Math.max(0.3, camera.position.distanceTo(target));
    const tangent = Math.max(targetHeight / (2 * targetDistance * rect.height / h), targetWidth / (2 * targetDistance * rect.width / h));
    camera.fov = THREE.MathUtils.clamp(2 * Math.atan(tangent) * 180 / Math.PI, 35, 120);
    camera.setViewOffset(w, h, w / 2 - rect.x - rect.width / 2, h / 2 - rect.y - rect.height / 2, w, h);
  } else if (mode === 'third-person') {
    camera.position.copy(characterCameraPosition(eye, yaw, pitch, world, distance));
    const boom = Math.hypot(camera.position.x - eye.x, camera.position.z - eye.z);
    const ahead = THREE.MathUtils.smoothstep(boom, 1.2, 2.4);
    camera.lookAt(eye.x + Math.sin(yaw) * 0.7 * ahead, floor + THREE.MathUtils.lerp(0.84, 1.25, ahead), eye.z - Math.cos(yaw) * 0.7 * ahead);
  } else {
    camera.position.copy(eye);
    camera.lookAt(eye.x + Math.sin(yaw) * Math.cos(pitch), eye.y - Math.sin(pitch), eye.z - Math.cos(yaw) * Math.cos(pitch));
  }
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  return displayYaw;
}

function turnBoneToward(bone: THREE.Bone, endpoint: THREE.Object3D, target: THREE.Vector3, root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const origin = bone.getWorldPosition(new THREE.Vector3());
  const from = endpoint.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const to = target.clone().sub(origin).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
  const parentRotation = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  bone.quaternion.copy(parentRotation.invert().multiply(worldRotation)); root.updateMatrixWorld(true);
}

function holdPhoneWithArm(root: THREE.Object3D, side: '左' | '右', targetLocal: THREE.Vector3) {
  const upper = root.getObjectByName(`${side}腕`), elbow = root.getObjectByName(`${side}ひじ`), wrist = root.getObjectByName(`${side}手首`);
  if (!(upper instanceof THREE.Bone) || !(elbow instanceof THREE.Bone) || !(wrist instanceof THREE.Bone)) return;
  root.updateMatrixWorld(true);
  const shoulder = upper.getWorldPosition(new THREE.Vector3()), middle = elbow.getWorldPosition(new THREE.Vector3()), hand = wrist.getWorldPosition(new THREE.Vector3());
  const target = root.localToWorld(targetLocal.clone()), direction = target.clone().sub(shoulder);
  const l1 = shoulder.distanceTo(middle), l2 = middle.distanceTo(hand), d = Math.max(0.0001, Math.min(direction.length(), l1 + l2 - 0.0001));
  direction.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const pole = root.localToWorld(new THREE.Vector3(side === '左' ? 0.45 : -0.45, 0.7, 0.1)).sub(shoulder);
  pole.addScaledVector(direction, -pole.dot(direction)).normalize();
  const bend = shoulder.clone().addScaledVector(direction, along).addScaledVector(pole, height);
  turnBoneToward(upper, elbow, bend, root); turnBoneToward(elbow, wrist, target, root);
}

function gripPhoneEdge(root: THREE.Object3D, side: '左' | '右', phoneCenterX: number) {
  const wrist = root.getObjectByName(`${side}手首`), middle = root.getObjectByName(`${side}中指１`);
  if (!(wrist instanceof THREE.Bone) || !middle) return;
  const wristLocal = root.worldToLocal(wrist.getWorldPosition(new THREE.Vector3()));
  turnBoneToward(wrist, middle, root.localToWorld(wristLocal.clone().add(new THREE.Vector3(0, 0.10, 0.015))), root);
  const sign = side === '左' ? 1 : -1;
  // Keep each hand on its own edge. The retained finger bones curve gently onto the device back.
  for (const finger of ['人指', '中指', '薬指', '小指']) {
    const first = root.getObjectByName(`${side}${finger}１`), second = root.getObjectByName(`${side}${finger}２`), third = root.getObjectByName(`${side}${finger}３`);
    if (!(first instanceof THREE.Bone) || !(second instanceof THREE.Bone) || !third) continue;
    const base = root.worldToLocal(first.getWorldPosition(new THREE.Vector3()));
    turnBoneToward(first, second, root.localToWorld(new THREE.Vector3(phoneCenterX + sign * 0.048, base.y + 0.028, 0.322)), root);
    turnBoneToward(second, third, root.localToWorld(new THREE.Vector3(phoneCenterX + sign * 0.034, base.y + 0.038, 0.322)), root);
  }
}

export function createScenePlayerCharacter(scene: THREE.Scene, pool: CharacterAssetPool, changed?: (status: CharacterModelStatus) => void) {
  const group = new THREE.Group(); group.name = 'scene-player-soyo'; scene.add(group);
  let instance: CharacterInstance | undefined, disposed = false;
  let phoneActive = false;
  const poseRest = new Map<THREE.Bone, THREE.Quaternion>();
  const phone = new THREE.Group(); phone.name = 'player-handheld-phone'; phone.visible = false;
  const phoneBody = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.19, 0.014), new THREE.MeshStandardMaterial({ color: 0x202631, roughness: 0.4, metalness: 0.35 }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.092, 0.167), new THREE.MeshBasicMaterial({ color: 0x99d5ca }));
  screen.position.z = -0.0075; screen.rotation.y = Math.PI;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.009, 12), new THREE.MeshStandardMaterial({ color: 0x0a1119, metalness: 0.65, roughness: 0.2 }));
  lens.position.set(-0.03, 0.066, 0.0075);
  phone.add(phoneBody, screen, lens); phone.position.set(-0.045, 1.17, 0.30); phone.rotation.x = 0.25; group.add(phone);
  phone.traverse(object => { if (object instanceof THREE.Mesh) object.raycast = () => {}; });
  const limbs: { bone: THREE.Bone; rest: THREE.Quaternion; phase: number; amplitude: number; knee: boolean }[] = [];
  const axis = new THREE.Vector3(1, 0, 0), offset = new THREE.Quaternion();
  function applyPhonePose() {
    limbs.forEach(limb => limb.bone.quaternion.copy(limb.rest));
    poseRest.forEach((rest, bone) => bone.quaternion.copy(rest));
    phone.visible = phoneActive && !!instance;
    if (!phoneActive || !instance) return;
    instance.group.position.y = 0;
    // Right-handed use only. The left arm stays in its imported relaxed standing pose.
    holdPhoneWithArm(group, '右', new THREE.Vector3(phone.position.x - 0.075, 1.12, 0.285));
    gripPhoneEdge(group, '右', phone.position.x);
    const head = group.getObjectByName('頭');
    if (head instanceof THREE.Bone) head.quaternion.multiply(offset.setFromAxisAngle(axis, 0.32));
    for (const name of ['左目', '右目']) { const eye = group.getObjectByName(name); if (eye instanceof THREE.Bone) eye.quaternion.multiply(offset.setFromAxisAngle(axis, 0.12)); }
    group.updateMatrixWorld(true);
  }
  changed?.('loading');
  void pool.acquire('soyo').then(next => {
    if (disposed) { next.dispose(); return; }
    instance = next; group.add(next.group);
    next.group.traverse(object => { if (object instanceof THREE.Mesh) object.raycast = () => {}; });
    for (const name of ['頭', '首', '左目', '右目', '左腕', '右腕', '左ひじ', '右ひじ', '左手首', '右手首']) {
      const bone = next.group.getObjectByName(name); if (bone instanceof THREE.Bone) poseRest.set(bone, bone.quaternion.clone());
    }
    next.group.traverse(object => { if (object instanceof THREE.Bone && /^(左|右)(親指|小指|薬指|中指|人指)/.test(object.name)) poseRest.set(object, object.quaternion.clone()); });
    // A small local gait on the retained PMX bones, not a claimed animation supplied by the artist.
    for (const [name, phase, amplitude, knee] of [
      ['左足', 0, 0.32, false], ['右足', Math.PI, 0.32, false],
      ['左ひざ', 0, 0.36, true], ['右ひざ', Math.PI, 0.36, true],
      ['左腕', Math.PI, 0.14, false], ['右腕', 0, 0.14, false],
    ] as const) {
      const bone = next.group.getObjectByName(name);
      if (bone instanceof THREE.Bone) limbs.push({ bone, rest: bone.quaternion.clone(), phase, amplitude, knee });
    }
    applyPhonePose(); changed?.('ready');
  }).catch(() => { if (!disposed) changed?.('error'); });
  return {
    group,
    setPhoneActive(active: boolean) { if (phoneActive === active) return; phoneActive = active; applyPhonePose(); },
    update(eye: THREE.Vector3, yaw: number, visible: boolean) {
      group.position.set(eye.x, eye.y - 1.7, eye.z); group.rotation.y = Math.PI - yaw; group.visible = visible;
    },
    animate(now: number, walking: boolean) {
      if (phoneActive) { if (instance) instance.group.position.y = 0; return; }
      const phase = now / 1000 * 8;
      for (const limb of limbs) {
        const wave = Math.sin(phase + limb.phase);
        const angle = walking ? (limb.knee ? Math.max(0, wave) : wave) * limb.amplitude : 0;
        limb.bone.quaternion.copy(limb.rest).multiply(offset.setFromAxisAngle(axis, angle));
      }
      if (instance) instance.group.position.y = walking && limbs.length ? Math.abs(Math.sin(phase)) * 0.025 : 0;
    },
    dispose() { if (disposed) return; disposed = true; instance?.dispose(); releaseTemplate(phone); group.removeFromParent(); },
  };
}
