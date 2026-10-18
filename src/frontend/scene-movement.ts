/** Scene-only walking. These coordinates never change the saved world location or clock. */
export interface ScenePosition { x: number; y: number; z: number }
export interface MovementInput { forward: number; strafe: number }
export interface SceneBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export type SceneCollider =
  | ({ kind: 'box'; id?: string } & SceneBounds)
  | { kind: 'circle'; id?: string; x: number; z: number; radius: number };
export interface SceneSurface extends SceneBounds { height: number }
export interface SceneMovementWorld {
  bounds: SceneBounds;
  colliders: SceneCollider[];
  surfaces: SceneSurface[];
}

export const SCENE_WALK_RADIUS = 0.3;
export const SCENE_WALK_SPEED = 3.4;
export const SCENE_MAX_FRAME_SECONDS = 0.05;
export const SCENE_EYE_HEIGHT = 1.7;
const MAX_SUBSTEP = SCENE_WALK_RADIUS / 2;
const EPSILON = 0.000001;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function sceneEyeHeight(x: number, z: number, world: SceneMovementWorld): number {
  let floor = 0;
  for (const surface of world.surfaces) {
    if (x >= surface.minX && x <= surface.maxX && z >= surface.minZ && z <= surface.maxZ) floor = Math.max(floor, surface.height);
  }
  return SCENE_EYE_HEIGHT + floor;
}

function overlaps(x: number, z: number, collider: SceneCollider): boolean {
  if (collider.kind === 'circle') return Math.hypot(x - collider.x, z - collider.z) < SCENE_WALK_RADIUS + collider.radius - EPSILON;
  const dx = x - clamp(x, collider.minX, collider.maxX);
  const dz = z - clamp(z, collider.minZ, collider.maxZ);
  return dx * dx + dz * dz < (SCENE_WALK_RADIUS - EPSILON) ** 2;
}

export function isScenePositionWalkable(x: number, z: number, world: SceneMovementWorld): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const bounds = world.bounds;
  return x >= bounds.minX + SCENE_WALK_RADIUS - EPSILON && x <= bounds.maxX - SCENE_WALK_RADIUS + EPSILON
    && z >= bounds.minZ + SCENE_WALK_RADIUS - EPSILON && z <= bounds.maxZ - SCENE_WALK_RADIUS + EPSILON
    && !world.colliders.some(collider => overlaps(x, z, collider));
}

/** Exact swept interval for one axis, with round player corners around boxes and trunks. */
function axisMove(x: number, z: number, delta: number, axis: 'x' | 'z', world: SceneMovementWorld): number {
  if (delta === 0) return axis === 'x' ? x : z;
  const start = axis === 'x' ? x : z;
  const cross = axis === 'x' ? z : x;
  const min = axis === 'x' ? world.bounds.minX : world.bounds.minZ;
  const max = axis === 'x' ? world.bounds.maxX : world.bounds.maxZ;
  let target = clamp(start + delta, min + SCENE_WALK_RADIUS, max - SCENE_WALK_RADIUS);
  for (const collider of world.colliders) {
    let low: number, high: number;
    if (collider.kind === 'circle') {
      const center = axis === 'x' ? collider.x : collider.z;
      const distance = Math.abs(cross - (axis === 'x' ? collider.z : collider.x));
      const radius = SCENE_WALK_RADIUS + collider.radius;
      if (distance >= radius) continue;
      const extent = Math.sqrt(Math.max(0, radius * radius - distance * distance));
      low = center - extent; high = center + extent;
    } else {
      const crossMin = axis === 'x' ? collider.minZ : collider.minX;
      const crossMax = axis === 'x' ? collider.maxZ : collider.maxX;
      const distance = Math.abs(cross - clamp(cross, crossMin, crossMax));
      if (distance >= SCENE_WALK_RADIUS) continue;
      const extent = Math.sqrt(Math.max(0, SCENE_WALK_RADIUS ** 2 - distance ** 2));
      low = (axis === 'x' ? collider.minX : collider.minZ) - extent;
      high = (axis === 'x' ? collider.maxX : collider.maxZ) + extent;
    }
    // Check the swept segment, not only its endpoint: even a thin fence cannot be skipped.
    if (delta > 0 && start <= low + EPSILON && target > low) target = Math.max(start, low);
    if (delta < 0 && start >= high - EPSILON && target < high) target = Math.min(start, high);
  }
  return target;
}

/** Bounded frame movement with per-axis sliding; positive forward follows the camera yaw. */
export function moveScenePosition(position: ScenePosition, input: MovementInput, yaw: number, elapsedSeconds: number, world: SceneMovementWorld): ScenePosition {
  if (![position.x, position.y, position.z, input.forward, input.strafe, yaw, elapsedSeconds].every(Number.isFinite)) return { ...position };
  // Old or externally supplied camera points must not be teleported through nearby obstacles.
  if (!isScenePositionWalkable(position.x, position.z, world)) return { ...position };
  const duration = clamp(elapsedSeconds, 0, SCENE_MAX_FRAME_SECONDS);
  const length = Math.max(1, Math.hypot(input.forward, input.strafe));
  const forward = input.forward / length, strafe = input.strafe / length;
  const distance = SCENE_WALK_SPEED * duration;
  const dx = (Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * distance;
  const dz = (-Math.cos(yaw) * forward + Math.sin(yaw) * strafe) * distance;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_SUBSTEP));
  let x = position.x, z = position.z;
  for (let step = 0; step < steps; step++) {
    x = axisMove(x, z, dx / steps, 'x', world);
    z = axisMove(x, z, dz / steps, 'z', world);
  }
  return { x, y: sceneEyeHeight(x, z, world), z };
}
