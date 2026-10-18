import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { campusInteriors, getInteriorMovementWorld } from '../src/runtime/campus-interiors';
import { createInteriorWorld } from '../src/frontend/scene-interior';
import { isScenePositionWalkable, moveScenePosition, SCENE_WALK_SPEED, type SceneMovementWorld, type ScenePosition } from '../src/frontend/scene-movement';

function walkSegment(start: ScenePosition, target: { x: number; z: number }, world: SceneMovementWorld): ScenePosition | null {
  let point = start;
  for (let i = 0; i < 30; i++) {
    const dx = target.x - point.x, dz = target.z - point.z, length = Math.hypot(dx, dz);
    if (length < 0.00001) return point;
    const next = moveScenePosition(point, { forward: -dz / length, strafe: dx / length }, 0, Math.min(1 / 30, length / SCENE_WALK_SPEED), world);
    if (Math.hypot(point.x - next.x, point.z - next.z) < 0.000001) return null;
    point = next;
  }
  return null;
}

describe('campus interior worlds', () => {
  for (const room of campusInteriors) {
    it(`${room.id}: every interaction is reachable from the doorway with actual swept movement`, () => {
      const movement = getInteriorMovementWorld(room);
      const queue = [{ x: room.spawn.x, y: 1.7, z: room.spawn.z }];
      const visited = new Set(['0,0']), reached = new Set<string>();
      expect(isScenePositionWalkable(queue[0].x, queue[0].z, movement)).toBe(true);
      for (let head = 0; head < queue.length && reached.size < room.interactions.length; head++) {
        const current = queue[head];
        for (const item of room.interactions) if (!reached.has(item.id) && Math.hypot(item.x - current.x, item.z - current.z) < 0.75 && walkSegment(current, item, movement)) reached.add(item.id);
        for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
          const next = { x: current.x + dx, z: current.z + dz };
          const key = `${Math.round((next.x - room.spawn.x) * 2)},${Math.round((next.z - room.spawn.z) * 2)}`;
          if (visited.has(key) || !isScenePositionWalkable(next.x, next.z, movement)) continue;
          const walked = walkSegment(current, next, movement); if (walked) { visited.add(key); queue.push(walked); }
        }
      }
      expect([...reached].sort()).toEqual(room.interactions.map(item => item.id).sort());
    });
    it(`${room.id}: visible furniture matches shared collision and releases its resources`, () => {
      const scene = new THREE.Scene(), built = createInteriorWorld(scene, room);
      expect(scene.children).toContain(built.group);
      expect(built.movementWorld).toEqual(getInteriorMovementWorld(room));
      for (const obstacle of room.obstacles) {
        const visual = built.group.getObjectByName(`furniture:${obstacle.id}`);
        expect(visual).toBeDefined();
        const bounds = new THREE.Box3().setFromObject(visual!);
        expect(bounds.min.x).toBeGreaterThanOrEqual(obstacle.minX - 0.03);
        expect(bounds.max.x).toBeLessThanOrEqual(obstacle.maxX + 0.03);
        expect(bounds.min.z).toBeGreaterThanOrEqual(obstacle.minZ - 0.03);
        expect(bounds.max.z).toBeLessThanOrEqual(obstacle.maxZ + 0.03);
        expect(isScenePositionWalkable((obstacle.minX + obstacle.maxX) / 2, (obstacle.minZ + obstacle.maxZ) / 2, built.movementWorld)).toBe(false);
      }
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      built.group.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(item => materials.add(item)); } });
      let geometryDisposals = 0, materialDisposals = 0;
      geometries.forEach(item => item.addEventListener('dispose', () => geometryDisposals++));
      materials.forEach(item => item.addEventListener('dispose', () => materialDisposals++));
      built.setTime(23); built.setTime(12); built.dispose(); built.dispose();
      expect(scene.children).not.toContain(built.group);
      expect(built.group.children).toHaveLength(0);
      expect(geometryDisposals).toBe(geometries.size);
      expect(materialDisposals).toBe(materials.size);
    });
  }
});
