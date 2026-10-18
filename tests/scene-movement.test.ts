import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  isScenePositionWalkable, moveScenePosition, sceneEyeHeight,
  SCENE_MAX_FRAME_SECONDS, SCENE_WALK_RADIUS, SCENE_WALK_SPEED,
  type MovementInput, type SceneMovementWorld, type ScenePosition,
} from '../src/frontend/scene-movement';
import { createCampusWorld, streetRoutes } from '../src/frontend/scene-world';
import { sceneBounds, sceneLandmarks, scenePaths } from '../src/frontend/scene-layout';

function emptyWorld(): SceneMovementWorld {
  return { bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, colliders: [], surfaces: [] };
}
function walk(start: ScenePosition, input: MovementInput, world: SceneMovementWorld, frames = 100, yaw = 0): ScenePosition {
  let current = start;
  for (let frame = 0; frame < frames; frame++) {
    current = moveScenePosition(current, input, yaw, 1 / 60, world);
    expect(isScenePositionWalkable(current.x, current.z, world)).toBe(true);
  }
  return current;
}

/** Walk a short segment with the production sweep; a clear endpoint alone cannot prove passage. */
function walkTo(start: ScenePosition, target: { x: number; z: number }, world: SceneMovementWorld): ScenePosition | null {
  let current = start;
  const maxFrames = Math.ceil(Math.hypot(target.x - start.x, target.z - start.z) / (SCENE_WALK_SPEED / 30)) + 1;
  for (let frame = 0; frame < maxFrames; frame++) {
    const dx = target.x - current.x, dz = target.z - current.z;
    const remaining = Math.hypot(dx, dz);
    if (remaining < 0.000001) return current;
    const next = moveScenePosition(current, { forward: -dz / remaining, strafe: dx / remaining }, 0,
      Math.min(1 / 30, remaining / SCENE_WALK_SPEED), world);
    if (!isScenePositionWalkable(next.x, next.z, world)) throw new Error(`Walk entered a solid at ${next.x}, ${next.z}`);
    if (Math.hypot(next.x - current.x, next.z - current.z) < 0.000001) return null;
    current = next;
  }
  return Math.hypot(target.x - current.x, target.z - current.z) < 0.000001 ? current : null;
}

function isOnScenePath(x: number, z: number): boolean {
  return scenePaths.some(path => Math.abs(x - path.x) <= path.width / 2 && Math.abs(z - path.z) <= path.depth / 2);
}

/** Search only the rendered paths, checking every 1 m edge by walking it, including thin fences. */
function reachableLandmarks(start: ScenePosition, world: SceneMovementWorld): Set<string> {
  const reached = new Set<string>(), visited = new Set([`${start.x},${start.z}`]);
  const queue = [start];
  for (let head = 0; head < queue.length && reached.size < sceneLandmarks.length; head++) {
    const current = queue[head];
    for (const landmark of sceneLandmarks) {
      // Fractional courtyard arrival points may be just beside a path-grid node.
      if (!reached.has(landmark.id) && Math.hypot(landmark.x - current.x, landmark.z - current.z) <= 1.5
        && walkTo(current, landmark, world)) reached.add(landmark.id);
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx, z = current.z + dz, key = `${Math.round(x)},${Math.round(z)}`;
      if (visited.has(key) || !isOnScenePath(x, z) || !isScenePositionWalkable(x, z, world)) continue;
      const next = walkTo(current, { x, z }, world);
      if (next) { visited.add(key); queue.push(next); }
    }
  }
  return reached;
}

describe('scene-only free movement', () => {
  it('moves relative to camera yaw and normalizes diagonal input without changing the source', () => {
    const world = emptyWorld(), start = { x: 0, y: 1.7, z: 0 };
    const straight = moveScenePosition(start, { forward: 1, strafe: 0 }, 0, 0.04, world);
    const diagonal = moveScenePosition(start, { forward: 1, strafe: 1 }, 0, 0.04, world);
    const rotated = moveScenePosition(start, { forward: 1, strafe: 0 }, Math.PI / 2, 0.04, world);
    expect(straight.z).toBeCloseTo(-SCENE_WALK_SPEED * 0.04);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(Math.hypot(straight.x, straight.z));
    expect(diagonal.x).toBeGreaterThan(0); expect(diagonal.z).toBeLessThan(0);
    expect(rotated.x).toBeCloseTo(SCENE_WALK_SPEED * 0.04); expect(rotated.z).toBeCloseTo(0);
    expect(start).toEqual({ x: 0, y: 1.7, z: 0 });
  });

  it('preserves analog slow walking and bounds long or negative animation-frame delays', () => {
    const world = emptyWorld(), start = { x: 0, y: 1.7, z: 0 };
    const slow = moveScenePosition(start, { forward: 0.25, strafe: 0 }, 0, 0.04, world);
    expect(slow.z).toBeCloseTo(-SCENE_WALK_SPEED * 0.04 * 0.25);
    const resumed = moveScenePosition(start, { forward: 999, strafe: 999 }, 0, 30, world);
    expect(Math.hypot(resumed.x, resumed.z)).toBeCloseTo(SCENE_WALK_SPEED * SCENE_MAX_FRAME_SECONDS);
    expect(moveScenePosition(start, { forward: 1, strafe: 0 }, 0, -1, world)).toEqual(start);
    expect(moveScenePosition(start, { forward: NaN, strafe: 0 }, 0, 1, world)).toEqual(start);
  });

  it('sweeps even a thin fence instead of jumping through it on delayed frames', () => {
    const world = emptyWorld();
    world.colliders.push({ kind: 'box', minX: -2, maxX: 2, minZ: 0, maxZ: 0.005 });
    let current = { x: 0, y: 1.7, z: 0.42 };
    for (let frame = 0; frame < 25; frame++) current = moveScenePosition(current, { forward: 1, strafe: 0 }, 0, 999, world);
    expect(current.z).toBeCloseTo(0.005 + SCENE_WALK_RADIUS);
    expect(isScenePositionWalkable(current.x, current.z, world)).toBe(true);
    expect(walk(current, { forward: -1, strafe: 0 }, world, 10).z).toBeGreaterThan(current.z);
  });

  it('slides along a wall while keeping the full player radius clear', () => {
    const world = emptyWorld();
    world.colliders.push({ kind: 'box', minX: 0, maxX: 1, minZ: -10, maxZ: 10 });
    const end = walk({ x: -0.4, y: 1.7, z: 0 }, { forward: 1, strafe: 1 }, world);
    expect(end.x).toBeCloseTo(-SCENE_WALK_RADIUS);
    expect(end.z).toBeLessThan(-3);
  });

  it('stops at an inside corner without penetrating either wall or drifting after contact', () => {
    const world = emptyWorld();
    world.colliders.push(
      { kind: 'box', minX: 0, maxX: 2, minZ: -2, maxZ: 2 },
      { kind: 'box', minX: -2, maxX: 2, minZ: 0, maxZ: 2 },
    );
    const end = walk({ x: -0.8, y: 1.7, z: -0.8 }, { forward: -1, strafe: 1 }, world);
    expect(end.x).toBeCloseTo(-SCENE_WALK_RADIUS); expect(end.z).toBeCloseTo(-SCENE_WALK_RADIUS);
    expect(walk(end, { forward: -1, strafe: 1 }, world, 10)).toEqual(end);
  });

  it('uses a round body at box corners and blocks trunks at their actual radius', () => {
    const boxWorld = emptyWorld();
    boxWorld.colliders.push({ kind: 'box', minX: 0, maxX: 2, minZ: 0, maxZ: 2 });
    expect(isScenePositionWalkable(-0.29, -0.29, boxWorld)).toBe(true);
    const corner = walk({ x: -0.29, y: 1.7, z: -0.29 }, { forward: 0, strafe: 1 }, boxWorld);
    expect(Math.hypot(corner.x, corner.z)).toBeCloseTo(SCENE_WALK_RADIUS);
    const trunkWorld = emptyWorld();
    trunkWorld.colliders.push({ kind: 'circle', x: 0, z: 0, radius: 0.45 });
    const trunk = walk({ x: 0, y: 1.7, z: 1 }, { forward: 1, strafe: 0 }, trunkWorld);
    expect(trunk.z).toBeCloseTo(0.45 + SCENE_WALK_RADIUS);
  });

  it('keeps the whole body inside all four scene boundaries', () => {
    const world = emptyWorld();
    world.bounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    const end = walk({ x: 0, y: 1.7, z: 0 }, { forward: 1, strafe: 1 }, world);
    expect(end.x).toBeCloseTo(0.7); expect(end.z).toBeCloseTo(-0.7);
    const opposite = walk(end, { forward: -1, strafe: -1 }, world);
    expect(opposite.x).toBeCloseTo(-0.7); expect(opposite.z).toBeCloseTo(0.7);
    expect(isScenePositionWalkable(1, 0, world)).toBe(false);
  });

  it('raises and lowers the eye with the actual nested step surfaces', () => {
    const world = emptyWorld();
    world.surfaces.push(
      { minX: -2, maxX: 2, minZ: -3, maxZ: 0, height: 0.21 },
      { minX: -1.5, maxX: 1.5, minZ: -3, maxZ: -0.5, height: 0.41 },
    );
    const first = moveScenePosition({ x: 0, y: 1.7, z: 0.05 }, { forward: 1, strafe: 0 }, 0, 0.04, world);
    expect(first.y).toBeCloseTo(1.91);
    const upper = walk(first, { forward: 1, strafe: 0 }, world, 12);
    expect(upper.y).toBeCloseTo(2.11);
    expect(walk(upper, { forward: -1, strafe: 0 }, world, 20).y).toBeCloseTo(1.7);
  });

  it('registers scene solids with the geometry and leaves every existing observation node usable', () => {
    const campus = createCampusWorld(new THREE.Scene());
    try {
      const world = campus.movementWorld;
      for (const prefix of ['building:', 'tree:', 'planter:', 'bench', 'signpost', 'bulletin-board', 'gate-pillar:', 'gate-fence:', 'lamp:', 'terrace-table:', 'phone-pedestal']) {
        expect(world.colliders.some(collider => collider.id?.startsWith(prefix)), prefix).toBe(true);
      }
      for (const node of Object.values(streetRoutes).flat()) {
        const [x, y, z] = node.position;
        expect(isScenePositionWalkable(x, z, world), node.label).toBe(true);
        const next = moveScenePosition({ x, y, z }, { forward: 1, strafe: 0 }, node.yaw, 1 / 60, world);
        expect(Math.hypot(next.x - x, next.z - z), node.label).toBeGreaterThan(0.01);
      }
      expect(Object.fromEntries(['gate', 'library', 'cafe', 'dorm', 'teaching'].map(id => [id, streetRoutes[id][0].position]))).toEqual({
        gate: [0, 1.7, 18], library: [0, 1.7, -6], cafe: [8, 1.7, 7], dorm: [-49, 1.7, -5], teaching: [0, 1.7, -36],
      });
      expect(sceneEyeHeight(0, -8.4, world)).toBeCloseTo(2.11);
      expect(isScenePositionWalkable(0, -14, world)).toBe(false);
      expect(isScenePositionWalkable(-10, -4, world)).toBe(false);
      expect(isScenePositionWalkable(6, 3.5, world)).toBe(false);
    } finally { campus.dispose(); }
  });

  it('keeps the south gate open and expands walking to the north campus without leaving the finite block', () => {
    const campus = createCampusWorld(new THREE.Scene());
    try {
      const world = campus.movementWorld;
      const street = walk({ x: 0, y: 1.7, z: 18 }, { forward: -1, strafe: 0 }, world, 330);
      expect(street.z).toBeGreaterThan(36); expect(street.z).toBeLessThan(39);
      expect(isScenePositionWalkable(5, 27, world)).toBe(false);
      expect(isScenePositionWalkable(0, -34, world)).toBe(true);
      for (const [x, z] of [[sceneBounds.minX - 1, 0], [sceneBounds.maxX + 1, 0], [0, sceneBounds.minZ - 1], [0, sceneBounds.maxZ + 1]]) {
        expect(isScenePositionWalkable(x, z, world), `outside ${x}, ${z}`).toBe(false);
      }
    } finally { campus.dispose(); }
  });

  // This exhaustive 1 m walk search now includes three city districts beyond the campus.
  // Give the enlarged graph its own budget when the full suite runs many workers at once.
  it('can actually walk from the original south-gate spawn along connected paths to every campus and street landmark', () => {
    const campus = createCampusWorld(new THREE.Scene());
    try {
      const world = campus.movementWorld;
      for (const landmark of sceneLandmarks) {
        expect(isScenePositionWalkable(landmark.x, landmark.z, world), landmark.label).toBe(true);
      }
      const [x, y, z] = streetRoutes.gate[0].position;
      const reached = reachableLandmarks({ x, y, z }, world);
      expect(sceneLandmarks.filter(landmark => !reached.has(landmark.id)).map(landmark => landmark.label)).toEqual([]);
    } finally { campus.dispose(); }
  }, 15000);

  it('blocks the new teaching, residence and shop facades and lets the player back away after contact', () => {
    const campus = createCampusWorld(new THREE.Scene());
    try {
      const world = campus.movementWorld;
      for (const name of ['teaching-building', 'residence-building', 'residence-north-building', 'shop-book', 'shop-convenience', 'shop-cafe']) {
        const building = world.colliders.find(collider => collider.id === `building:${name}`);
        if (!building || building.kind !== 'box') throw new Error(`Missing solid building: ${name}`);
        const storefront = world.colliders.find(collider => collider.id === `${name}:front`);
        const facadeZ = storefront?.kind === 'box' ? Math.min(building.minZ, storefront.minZ) : building.minZ;
        const x = (building.minX + building.maxX) / 2, z = facadeZ - 0.5;
        expect(isScenePositionWalkable(x, z, world), `${name} approach`).toBe(true);
        expect(isScenePositionWalkable(x, (building.minZ + building.maxZ) / 2, world), `${name} interior`).toBe(false);
        // Long enough to emerge through the far facade if this building were merely decorative.
        const frames = Math.ceil((building.maxZ - building.minZ + 2) / SCENE_WALK_SPEED * 60);
        const contact = walk({ x, y: sceneEyeHeight(x, z, world), z }, { forward: -1, strafe: 0 }, world, frames);
        expect(contact.z, `${name} facade`).toBeCloseTo(facadeZ - SCENE_WALK_RADIUS);
        expect(walk(contact, { forward: 1, strafe: 0 }, world, 10).z, `${name} escape`).toBeLessThan(contact.z - 0.5);
      }
    } finally { campus.dispose(); }
  });
});
