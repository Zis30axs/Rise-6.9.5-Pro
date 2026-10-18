import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCampusWorld } from '../src/frontend/scene-world';
import { isScenePositionWalkable, SCENE_WALK_RADIUS } from '../src/frontend/scene-movement';
import { recoverScenePresencePosition } from '../src/frontend/scene-presence';
import { createSceneCrowd } from '../src/frontend/scene-crowd';
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

  it('uses two instance batches for the population and releases their shared resources without a GPU', () => {
    const scene = new THREE.Scene();
    const campus = createCampusWorld(scene);
    const crowd = createSceneCrowd(scene, campus.movementWorld);
    try {
      crowd.setPeople([]);
      const batches = crowd.pickables.filter((object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh);
      expect(batches).toHaveLength(2);
      expect(batches.every(batch => batch.count === 0)).toBe(true);
      const people = getScenePeople({ x: 0, z: 18, yaw: 0, areaId: 'promenade', seed: 'crowd-resource-test', encounterId: null });
      crowd.setPeople(people);
      expect(batches.map(batch => batch.count).sort((a, b) => a - b)).toEqual([people.length, people.length * 10]);
      const represented = new Set(batches.flatMap(batch => batch.userData.scenePersonId as string[]));
      expect(represented).toEqual(new Set(people.map(person => person.id)));
      const resources = new Set(batches.flatMap(batch => [batch.geometry, ...(Array.isArray(batch.material) ? batch.material : [batch.material])]));
      const released = new Set<THREE.BufferGeometry | THREE.Material>();
      resources.forEach(resource => resource.addEventListener('dispose', () => { released.add(resource); }));
      crowd.dispose();
      expect(released).toEqual(resources);
      expect(scene.getObjectByName('scene-people')).toBeUndefined();
    } finally { campus.dispose(); }
  });
});
