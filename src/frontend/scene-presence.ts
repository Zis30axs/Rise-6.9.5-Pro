import { isScenePositionWalkable, type SceneMovementWorld } from './scene-movement';

/** Repair only millimetre rounding at a wall; never relocate an invalid save across a room. */
export function recoverScenePresencePosition(x: number, z: number, world: SceneMovementWorld): { x: number; z: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (isScenePositionWalkable(x, z, world)) return { x, z };
  for (const radius of [0.001, 0.003, 0.006, 0.01]) {
    for (let index = 0; index < 16; index++) {
      const angle = index * Math.PI / 8;
      const candidate = { x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius };
      if (isScenePositionWalkable(candidate.x, candidate.z, world)) return candidate;
    }
  }
  return null;
}
