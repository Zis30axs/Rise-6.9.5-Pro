import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCampusWorld } from '../src/frontend/scene-world';
import { isScenePositionWalkable, SCENE_WALK_RADIUS } from '../src/frontend/scene-movement';
import { recoverScenePresencePosition } from '../src/frontend/scene-presence';
import { createSceneCrowd } from '../src/frontend/scene-crowd';
import { createCharacterAssetPool } from '../src/frontend/scene-character-assets';
import { getScenePeople } from '../src/runtime/scene-context';

describe('saved scene positions and crowd resource lifecycle', () => {
  it('keeps a valid saved point exact instead of moving it to a destination spawn', () => {
    const campus = createCampusWorld(new THREE.Scene());
    try {
      const point = { x: 0.123456, z: 18.123456 };
      expect(recoverScenePresencePosition(point.x, point.z, campus.movementWorld)).toEqual(point);
    } finally { campus.dispose(); }
  });

  it('recovers a real shop corner rounded into collision by saving three decimal places', () => {
    const campus = createCampusWorld(new THREE.Scene());
    try {
      const world = campus.movementWorld;
      const wall = world.colliders.find(collider => collider.id === 'building:shop-book');
      if (!wall || wall.kind !== 'box') throw new Error('Missing bookshop solid');
      const cornerOffset = SCENE_WALK_RADIUS / Math.sqrt(2);
      const contact = { x: wall.maxX + cornerOffset, z: wall.maxZ + cornerOffset };
      expect(isScenePositionWalkable(contact.x, contact.z, world)).toBe(true);
      const saved = { x: Number(contact.x.toFixed(3)), z: Number(contact.z.toFixed(3)) };
      // Establish the original failure: this genuine contact point becomes illegal after saving.
      expect(isScenePositionWalkable(saved.x, saved.z, world)).toBe(false);
      const recovered = recoverScenePresencePosition(saved.x, saved.z, world);
      expect(recovered).not.toBeNull();
      expect(isScenePositionWalkable(recovered!.x, recovered!.z, world)).toBe(true);
      expect(Math.hypot(recovered!.x - saved.x, recovered!.z - saved.z)).toBeLessThanOrEqual(0.010001);
      expect(recovered!.z).toBeGreaterThan(70);
    } finally { campus.dispose(); }
  });

  it('rejects a save deep in a building or far outside the scene without a large relocation', () => {
    const campus = createCampusWorld(new THREE.Scene());
    try {
      for (const point of [{ x: 0, z: -14 }, { x: 500, z: 1000 }, { x: NaN, z: 18 }, { x: 0, z: Infinity }]) {
        expect(recoverScenePresencePosition(point.x, point.z, campus.movementWorld)).toBeNull();
      }
    } finally { campus.dispose(); }
  });

  it('keeps actual nearby model IDs tied to the saved population and releases shared resources without a GPU', async () => {
    const scene = new THREE.Scene();
    const campus = createCampusWorld(scene);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    const released = new Set<THREE.BufferGeometry | THREE.Material>();
    const pool = createCharacterAssetPool({ loadModel: async () => {
      const geometry = new THREE.BoxGeometry(1, 2, 1), material = new THREE.MeshStandardMaterial();
      for (const resource of [geometry, material]) { resources.add(resource); resource.addEventListener('dispose', () => { released.add(resource); }); }
      const model = new THREE.Group(); model.add(new THREE.Mesh(geometry, material)); return { scene: model, animations: [] };
    } });
    const crowd = createSceneCrowd(scene, campus.movementWorld, pool);
    try {
      crowd.setPeople([]);
      const group = scene.getObjectByName('scene-people')!;
      expect(group.children).toHaveLength(0);
      const people = getScenePeople({ x: 0, z: 18, yaw: 0, areaId: 'promenade', seed: 'crowd-resource-test', encounterId: null });
      crowd.setPeople(people);
      crowd.update(0, new THREE.PerspectiveCamera(), new THREE.Vector3(0, 1.7, 18), false);
      for (let turn = 0; turn < 20; turn++) await Promise.resolve();
      expect(group.children.length).toBeGreaterThan(0); expect(group.children.length).toBeLessThanOrEqual(10);
      const savedIds = new Set(people.map(person => person.id));
      expect(group.children.every(child => savedIds.has(child.userData.scenePersonId))).toBe(true);
      crowd.dispose(); pool.dispose();
      expect(released).toEqual(resources);
      expect(scene.getObjectByName('scene-people')).toBeUndefined();
    } finally { crowd.dispose(); pool.dispose(); campus.dispose(); }
  });
});
