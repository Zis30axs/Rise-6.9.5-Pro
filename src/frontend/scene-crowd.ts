import * as THREE from 'three';
import type { ScenePerson } from '../runtime/scene-context';
import { isScenePositionWalkable, sceneEyeHeight, type SceneMovementWorld } from './scene-movement';

interface Walker {
  person: ScenePerson;
  phase: number;
  dx: number;
  dz: number;
  radius: number;
}

const BOX_PARTS = 10;
const MAX_PEOPLE = 32;
const skinColors = [0xd4a17e, 0xc39371, 0xe0b796, 0xb98465];
const hairColors = [0x282827, 0x42372e, 0x262f30, 0x514139];

function stablePhase(id: string): number {
  let value = 0;
  for (const character of id) value = (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0;
  return value / 0xffffffff * Math.PI * 2;
}

/** Two shared instance batches keep the outdoor crowd small enough for mobile scenes. */
export function createSceneCrowd(scene: THREE.Scene, world: SceneMovementWorld) {
  const group = new THREE.Group();
  group.name = 'scene-people';
  scene.add(group);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const headGeometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  const body = new THREE.InstancedMesh(boxGeometry, material, MAX_PEOPLE * BOX_PARTS);
  const heads = new THREE.InstancedMesh(headGeometry, material, MAX_PEOPLE);
  body.count = 0; heads.count = 0;
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Individual instances are culled in the update below, instead of a stale aggregate bound.
  body.frustumCulled = false; heads.frustumCulled = false;
  const blockCenter = new THREE.Vector3((world.bounds.minX + world.bounds.maxX) / 2, 1, (world.bounds.minZ + world.bounds.maxZ) / 2);
  const blockRadius = Math.hypot(world.bounds.maxX - world.bounds.minX, world.bounds.maxZ - world.bounds.minZ) / 2 + 3;
  body.boundingSphere = new THREE.Sphere(blockCenter.clone(), blockRadius);
  heads.boundingSphere = new THREE.Sphere(blockCenter.clone(), blockRadius);
  group.add(body, heads);
  const bodyOwners: string[] = [], headOwners: string[] = [];
  body.userData.scenePersonId = bodyOwners;
  heads.userData.scenePersonId = headOwners;
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const point = new THREE.Vector3();
  const projection = new THREE.Matrix4();
  const frustum = new THREE.Frustum();
  const personTransform = new THREE.Matrix4();
  const partTransform = new THREE.Matrix4();
  let walkers: Walker[] = [];
  let fingerprint = '';

  function setPart(index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, tint: number, swing = 0) {
    transform.position.set(x, y, z); transform.rotation.set(swing, 0, 0); transform.scale.set(sx, sy, sz); transform.updateMatrix();
    partTransform.multiplyMatrices(personTransform, transform.matrix);
    body.setMatrixAt(index, partTransform); body.setColorAt(index, color.set(tint));
  }

  function pose(walker: Walker, index: number, now: number, animate: boolean) {
    const { person, phase, dx, dz, radius } = walker;
    const cycle = now / 1000 * 0.55 + phase;
    const offset = animate ? Math.sin(cycle) * radius : 0;
    const x = person.x + dx * offset, z = person.z + dz * offset;
    const heading = Math.atan2(dx, dz) + (Math.cos(cycle) < 0 ? Math.PI : 0);
    const stride = animate && radius > 0 ? Math.sin(now / 1000 * 5.3 + phase) * 0.32 : 0;
    const floor = sceneEyeHeight(x, z, world) - 1.7;
    transform.position.set(x, floor + (animate ? Math.abs(stride) * 0.035 : 0), z);
    transform.rotation.set(0, heading, 0); transform.scale.set(1, 1, 1); transform.updateMatrix();
    personTransform.copy(transform.matrix);
    const first = index * BOX_PARTS;
    const dark = 0x374249, skin = skinColors[index % skinColors.length];
    setPart(first, 0, 1.11, 0, 0.4, 0.61, 0.25, person.color);
    setPart(first + 1, 0, 0.75, 0, 0.35, 0.17, 0.24, dark);
    for (const side of [-1, 1]) {
      const legSwing = stride * side;
      const offsetIndex = side === -1 ? 2 : 5;
      setPart(first + offsetIndex, side * 0.105, 0.42, Math.sin(legSwing) * 0.24, 0.14, 0.6, 0.17, dark, legSwing);
      setPart(first + offsetIndex + 1, side * 0.105, 0.09, Math.sin(legSwing) * 0.49 + 0.045, 0.15, 0.12, 0.27, 0x293234, legSwing * 0.25);
      setPart(first + offsetIndex + 2, side * 0.285, 1.08, -Math.sin(legSwing) * 0.19, 0.13, 0.58, 0.15, person.color, -legSwing);
    }
    setPart(first + 8, 0, 1.71, -0.01, 0.29, 0.12, 0.27, hairColors[index % hairColors.length]);
    setPart(first + 9, 0, 1.43, 0, 0.13, 0.14, 0.13, skin);
    transform.position.set(0, 1.57, 0); transform.rotation.set(0, 0, 0); transform.scale.set(0.165, 0.195, 0.16); transform.updateMatrix();
    partTransform.multiplyMatrices(personTransform, transform.matrix);
    heads.setMatrixAt(index, partTransform); heads.setColorAt(index, color.set(skin));
  }

  function markUpdated() {
    body.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  }

  return {
    pickables: [body, heads] as THREE.Object3D[],
    setPeople(people: ScenePerson[]) {
      const nextFingerprint = people.map(person => `${person.id}:${person.x}:${person.z}:${person.color}`).join('|');
      if (nextFingerprint === fingerprint) return;
      fingerprint = nextFingerprint;
      walkers = people.slice(0, MAX_PEOPLE).filter(person => isScenePositionWalkable(person.x, person.z, world)).map(person => {
        const phase = stablePhase(person.id);
        let dx = Math.cos(phase), dz = Math.sin(phase), radius = 0;
        // Check the entire short stroll, including corners and props; never cross a building.
        for (const candidate of [[dx, dz], [1, 0], [0, 1]]) {
          if ([-0.7, -0.35, 0, 0.35, 0.7].every(offset => isScenePositionWalkable(person.x + candidate[0] * offset, person.z + candidate[1] * offset, world))) {
            [dx, dz] = candidate; radius = 0.7; break;
          }
        }
        return { person, phase, dx, dz, radius };
      });
      body.count = walkers.length * BOX_PARTS; heads.count = walkers.length;
      bodyOwners.length = headOwners.length = 0;
      walkers.forEach((walker, index) => {
        for (let part = 0; part < BOX_PARTS; part++) bodyOwners.push(walker.person.id);
        headOwners.push(walker.person.id); pose(walker, index, 0, false);
      });
      markUpdated();
    },
    update(now: number, camera: THREE.PerspectiveCamera, eye: THREE.Vector3, allowAnimation: boolean): boolean {
      if (!allowAnimation || !walkers.length) return false;
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projection);
      let active = false;
      walkers.forEach((walker, index) => {
        if (Math.hypot(walker.person.x - eye.x, walker.person.z - eye.z) > 38) return;
        point.set(walker.person.x, 1, walker.person.z);
        if (!frustum.containsPoint(point)) return;
        active = true; pose(walker, index, now, true);
      });
      if (active) markUpdated();
      return active;
    },
    personAtHit(hit: THREE.Intersection): string | undefined {
      const ids = hit.object.userData.scenePersonId;
      return Array.isArray(ids) && hit.instanceId !== undefined ? ids[hit.instanceId] : undefined;
    },
    dispose() {
      group.removeFromParent(); body.dispose(); heads.dispose();
      boxGeometry.dispose(); headGeometry.dispose(); material.dispose(); walkers = [];
    },
  };
}
