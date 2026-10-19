import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyCharacterCamera, characterCameraPosition, characterForPerson, createCharacterAssetPool, createScenePlayerCharacter, loadCharacterModel, type CharacterModel } from '../src/frontend/scene-character-assets';
import { createSceneCrowd } from '../src/frontend/scene-crowd';
import type { ScenePerson } from '../src/runtime/scene-context';
import { isScenePositionWalkable, type SceneMovementWorld } from '../src/frontend/scene-movement';

const settle = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
const world: SceneMovementWorld = { bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, colliders: [], surfaces: [] };
function model(): CharacterModel {
  const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
  return { scene, animations: [] };
}
function glb(definition: object) {
  const json = new TextEncoder().encode(JSON.stringify(definition)), length = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(20 + length), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, length, true); view.setUint32(16, 0x4e4f534a, true); bytes.fill(0x20, 20); bytes.set(json, 20);
  return `data:model/gltf-binary;base64,${btoa(String.fromCharCode(...bytes))}`;
}
function people(count = 18): ScenePerson[] {
  return Array.from({ length: count }, (_, index) => ({ id: `saved-npc-${index}`, name: `NPC ${index}`, candidateName: `NPC ${index}`, identity: '同学', tags: ['同学'], description: '', x: index - 8, z: -5, color: 0xffffff, portraitId: characterForPerson(`saved-npc-${index}`), contactId: null, isMain: false }));
}

describe('embedded character resource lifecycle', () => {
  it('rejects outside references and unbundled decoders before a GLTF loader can request them', async () => {
    for (const definition of [{ buffers: [{ uri: 'https://outside.example/model.bin' }] }, { images: [{ uri: 'https://outside.example/face.png' }] }, { images: [{}], extensionsUsed: ['KHR_draco_mesh_compression'] }, { buffers: 'broken' }, { extensionsRequired: 'KHR_materials_unlit' }]) {
      await expect(loadCharacterModel(glb(definition))).rejects.toThrow();
    }
    await expect(loadCharacterModel('https://outside.example/model.glb')).rejects.toThrow();
    await expect(loadCharacterModel('data:model/gltf-binary;base64,AA==')).rejects.toThrow();
  });

  it('deduplicates pending decoding, shares meshes, scales the actual models and disposes shared resources once', async () => {
    const original = model(), mesh = original.scene.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const close = vi.fn(), texture = new THREE.Texture({ close }); mesh.material.map = texture;
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose'), materialDispose = vi.spyOn(mesh.material, 'dispose'), textureDispose = vi.spyOn(texture, 'dispose');
    const loadModel = vi.fn(async () => original), pool = createCharacterAssetPool({ loadModel });
    const [a, b] = await Promise.all([pool.acquire('soyo'), pool.acquire('soyo')]);
    expect(loadModel).toHaveBeenCalledTimes(1);
    const meshes: THREE.Mesh[] = []; [a, b].forEach(instance => instance.group.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); }));
    expect(meshes[0]).not.toBe(meshes[1]); expect(meshes[0].geometry).toBe(meshes[1].geometry); expect(meshes[0].material).toBe(meshes[1].material);
    const bounds = new THREE.Box3().setFromObject(a.group); expect(bounds.min.y).toBeCloseTo(0); expect(bounds.max.y).toBeCloseTo(1.62);
    expect(pool.snapshot()).toEqual({ status: 'ready', modelIds: ['soyo'], instanceCount: 2 });
    a.dispose(); a.dispose(); expect(geometryDispose).not.toHaveBeenCalled(); expect(pool.snapshot().instanceCount).toBe(1);
    pool.dispose(); pool.dispose(); expect(geometryDispose).toHaveBeenCalledTimes(1); expect(materialDispose).toHaveBeenCalledTimes(1); expect(textureDispose).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
    await expect(pool.acquire('soyo')).rejects.toThrow();
  });

  it('releases a late parse after exit without attaching or publishing new state', async () => {
    let finish!: (model: CharacterModel) => void;
    const changed = vi.fn(), original = model(), mesh = original.scene.children[0] as THREE.Mesh;
    const release = vi.spyOn(mesh.geometry, 'dispose');
    const pool = createCharacterAssetPool({ loadModel: () => new Promise(resolve => { finish = resolve; }), changed });
    const scene = new THREE.Scene(), player = createScenePlayerCharacter(scene, pool);
    await settle(); player.dispose(); pool.dispose(); const callCount = changed.mock.calls.length;
    finish(original); await settle();
    expect(scene.children).toHaveLength(0); expect(release).toHaveBeenCalledTimes(1); expect(changed).toHaveBeenCalledTimes(callCount);
  });

  it('clones independent bones and returns the optional player gait to the imported standing pose', async () => {
    const original = model(), geometry = (original.scene.children[0] as THREE.Mesh).geometry;
    const count = geometry.getAttribute('position').count, indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let vertex = 0; vertex < count; vertex++) weights[vertex * 4] = 1;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4)); geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const left = new THREE.Bone(); left.name = '左足'; left.rotation.x = 0.04;
    const right = new THREE.Bone(); right.name = '右足'; left.add(right);
    const mesh = new THREE.SkinnedMesh(geometry, (original.scene.children[0] as THREE.Mesh).material);
    mesh.add(left); mesh.bind(new THREE.Skeleton([left, right])); original.scene.clear(); original.scene.add(mesh);
    const pool = createCharacterAssetPool({ loadModel: async () => original }), scene = new THREE.Scene();
    const player = createScenePlayerCharacter(scene, pool), sibling = await pool.acquire('soyo'); await settle();
    const playerLeft = player.group.getObjectByName('左足')!, siblingLeft = sibling.group.getObjectByName('左足')!;
    const rest = playerLeft.quaternion.clone();
    expect(playerLeft).not.toBe(left); expect(playerLeft).not.toBe(siblingLeft);
    player.update(new THREE.Vector3(2, 2.7, 3), 0, true); player.animate(180, true);
    expect(playerLeft.quaternion.equals(rest)).toBe(false); expect(siblingLeft.quaternion.equals(rest)).toBe(true); expect(left.quaternion.equals(rest)).toBe(true);
    expect(player.group.position.x).toBe(2); expect(player.group.position.y).toBeCloseTo(1); expect(player.group.position.z).toBe(3);
    player.setPhoneActive(true); expect(playerLeft.quaternion.equals(rest)).toBe(true);
    player.animate(190, true); expect(playerLeft.quaternion.equals(rest)).toBe(true); player.setPhoneActive(false);
    player.animate(200, false); expect(playerLeft.quaternion.equals(rest)).toBe(true);
    player.update(new THREE.Vector3(2, 1.7, 3), 0, false); expect(player.group.visible).toBe(false);
    player.dispose(); sibling.dispose(); pool.dispose();
  });

  it('keeps appearance stable, limits nearby clones and preserves saved NPC pick identities', async () => {
    const scene = new THREE.Scene(), loadModel = vi.fn(async () => model()), pool = createCharacterAssetPool({ loadModel });
    const crowd = createSceneCrowd(scene, world, pool), entries = people(), camera = new THREE.PerspectiveCamera();
    const original = structuredClone(entries); crowd.setPeople(entries); expect(loadModel).not.toHaveBeenCalled();
    crowd.update(0, camera, new THREE.Vector3(0, 1.7, 0), true); await settle();
    const rendered = scene.getObjectByName('scene-people')!; expect(rendered.children).toHaveLength(10); expect(loadModel.mock.calls.length).toBeLessThanOrEqual(3);
    const person = rendered.children[0]; let mesh!: THREE.Mesh;
    person.traverse(object => { if (object instanceof THREE.Mesh) mesh = object; });
    const hit: THREE.Intersection = { object: mesh, distance: 3, point: mesh.position.clone() };
    const id = crowd.personAtHit(hit); expect(entries.some(entry => entry.id === id)).toBe(true);
    expect(person.userData.characterModelId).toBe(characterForPerson(id!));
    crowd.setPeople([...entries].reverse()); crowd.update(9999, camera, new THREE.Vector3(0, 1.7, 0), true); await settle();
    expect(entries).toEqual(original); expect(crowd.personAtHit(hit)).toBe(id);
    crowd.update(0, camera, new THREE.Vector3(90, 1.7, 90), false); expect(rendered.children).toHaveLength(0); expect(pool.snapshot().instanceCount).toBe(0);
    crowd.dispose(); pool.dispose(); expect(scene.children).toHaveLength(0);
  });

  it('does not resurrect NPCs removed while their appearance is still decoding', async () => {
    let finish!: (model: CharacterModel) => void;
    const pool = createCharacterAssetPool({ loadModel: () => new Promise(resolve => { finish = resolve; }) }), scene = new THREE.Scene();
    const crowd = createSceneCrowd(scene, world, pool); crowd.setPeople(people(1));
    crowd.update(0, new THREE.PerspectiveCamera(), new THREE.Vector3(0, 1.7, 0), true); await settle();
    crowd.setPeople([]); finish(model()); await settle();
    expect(scene.getObjectByName('scene-people')!.children).toHaveLength(0); expect(pool.snapshot().instanceCount).toBe(0);
    crowd.dispose(); pool.dispose();
  });

  it('uses a confirmed portrait and discards the older appearance if its load finishes late', async () => {
    let finishOld!: (model: CharacterModel) => void;
    const scene = new THREE.Scene(), entries = people(1); entries[0].portraitId = 'deepseek';
    const pool = createCharacterAssetPool({ loadModel: id => id === 'deepseek' ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve(model()) });
    const crowd = createSceneCrowd(scene, world, pool), eye = new THREE.Vector3(0, 1.7, 0), camera = new THREE.PerspectiveCamera();
    crowd.setPeople(entries); crowd.update(0, camera, eye, false); await settle();
    crowd.setPeople([{ ...entries[0], name: '已确认姓名', portraitId: 'claude', contactId: 'saved-contact', isMain: true }]);
    crowd.update(0, camera, eye, false); await settle();
    finishOld(model()); await settle();
    const visible = scene.getObjectByName('scene-people')!.children;
    expect(visible).toHaveLength(1); expect(visible[0].userData.characterModelId).toBe('claude');
    expect(visible[0].userData.scenePersonId).toBe(entries[0].id);
    expect(pool.snapshot().instanceCount).toBe(1); crowd.dispose(); pool.dispose();
  });

  it('moves only the camera for third person and stops its boom before walls and bounds', () => {
    const eye = new THREE.Vector3(0, 1.7, 0), before = eye.clone();
    const blocked = { ...world, colliders: [{ kind: 'box' as const, minX: -2, maxX: 2, minZ: 1.5, maxZ: 1.6 }] };
    const camera = characterCameraPosition(eye, 0, -0.12, blocked);
    expect(camera.z).toBeLessThanOrEqual(1.2); expect(camera.z).toBeGreaterThan(0.9); expect(isScenePositionWalkable(camera.x, camera.z, blocked)).toBe(true); expect(eye).toEqual(before);
    const nearEdge = characterCameraPosition(new THREE.Vector3(0, 1.7, 99.6), 0, 0, world); expect(nearEdge.z).toBeLessThanOrEqual(99.7 + 0.0001);
  });

  it('frames a front phone portrait in the available desktop/mobile space and restores the unchanged preferred camera', () => {
    const eye = new THREE.Vector3(0, 1.7, 0), saved = eye.clone();
    for (const [width, height] of [[1280, 720], [390, 844], [320, 740]]) for (const mode of ['first-person', 'third-person'] as const) {
      const camera = new THREE.PerspectiveCamera(68, width / height, 0.08, 360);
      applyCharacterCamera(camera, eye, 0, -0.12, world, mode, false, width, height);
      const beforePosition = camera.position.clone(), beforeRotation = camera.quaternion.clone(), beforeProjection = camera.projectionMatrix.clone();
      applyCharacterCamera(camera, eye, 0, -0.12, world, mode, true, width, height);
      expect(camera.position.z).toBeLessThan(eye.z); expect(isScenePositionWalkable(camera.position.x, camera.position.z, world)).toBe(true);
      const forehead = new THREE.Vector3(0, 1.62, 0).project(camera), hands = new THREE.Vector3(0, 1.08, -0.28).project(camera);
      if (width <= 760) {
        expect((1 - forehead.y) * height / 2).toBeGreaterThan(65);
        expect((1 - hands.y) * height / 2).toBeLessThan(THREE.MathUtils.clamp(height * 0.31, 174, 260));
      } else expect((forehead.x + 1) * width / 2).toBeLessThan(width - 480);
      applyCharacterCamera(camera, eye, 0, -0.12, world, mode, false, width, height);
      expect(camera.position.equals(beforePosition)).toBe(true); expect(camera.quaternion.equals(beforeRotation)).toBe(true); expect(camera.projectionMatrix.equals(beforeProjection)).toBe(true); expect(eye.equals(saved)).toBe(true);
    }
  });

  it('uses the right hand only and restores the relaxed pose, including when the phone model arrives late', async () => {
    let finish!: (model: CharacterModel) => void;
    const scene = new THREE.Scene(), pool = createCharacterAssetPool({ loadModel: () => new Promise(resolve => { finish = resolve; }) });
    const player = createScenePlayerCharacter(scene, pool); player.update(new THREE.Vector3(4, 1.7, 7), 0.6, true); player.setPhoneActive(true);
    const phone = player.group.getObjectByName('player-handheld-phone')!; expect(phone.visible).toBe(false);
    const original = model();
    for (const side of ['左', '右']) {
      const upper = new THREE.Bone(), elbow = new THREE.Bone(), wrist = new THREE.Bone(), middle = new THREE.Bone();
      upper.name = `${side}腕`; elbow.name = `${side}ひじ`; wrist.name = `${side}手首`; middle.name = `${side}中指１`;
      upper.position.set(side === '左' ? 0.12 : -0.12, 0.5, 0); elbow.position.y = -0.22; wrist.position.y = -0.2; middle.position.y = -0.08;
      upper.add(elbow); elbow.add(wrist); wrist.add(middle); original.scene.add(upper);
    }
    await settle(); finish(original); await settle(); expect(phone.visible).toBe(true); expect(phone.position.x).toBeLessThan(0);
    const leftArm = player.group.getObjectByName('左腕')!, rightArm = player.group.getObjectByName('右腕')!, relaxed = new THREE.Quaternion();
    expect(leftArm.quaternion.equals(relaxed)).toBe(true); expect(rightArm.quaternion.equals(relaxed)).toBe(false);
    const position = player.group.position.clone(), rotation = player.group.quaternion.clone();
    player.animate(200, true); player.setPhoneActive(false);
    expect(phone.visible).toBe(false); expect(player.group.position.equals(position)).toBe(true); expect(player.group.quaternion.equals(rotation)).toBe(true);
    expect(leftArm.quaternion.equals(relaxed)).toBe(true); expect(rightArm.quaternion.equals(relaxed)).toBe(true);
    const propGeometry = (phone.children[0] as THREE.Mesh).geometry, release = vi.spyOn(propGeometry, 'dispose');
    player.dispose(); player.dispose(); pool.dispose(); expect(release).toHaveBeenCalledTimes(1);
  });

  it('uses a clear side for a phone close-up at a front wall, turning only the visible actor toward it', () => {
    const eye = new THREE.Vector3(0, 1.7, 0), saved = eye.clone();
    const blocked = { ...world, colliders: [{ kind: 'box' as const, minX: -9, maxX: 9, minZ: -2, maxZ: -0.35 }] };
    const camera = new THREE.PerspectiveCamera(68, 320 / 740, 0.08, 360);
    const displayYaw = applyCharacterCamera(camera, eye, 0, -0.12, blocked, 'third-person', true, 320, 740);
    expect(Math.hypot(camera.position.x, camera.position.z)).toBeGreaterThan(2); expect(isScenePositionWalkable(camera.position.x, camera.position.z, blocked)).toBe(true);
    const facing = new THREE.Vector3(Math.sin(displayYaw), 0, -Math.cos(displayYaw));
    expect(facing.dot(new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize())).toBeCloseTo(1); expect(eye.equals(saved)).toBe(true);
    const head = new THREE.Vector3(0, 1.62, 0).project(camera); expect((1 - head.y) * 740 / 2).toBeGreaterThan(65);
  });
});
