import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSceneVehicles, groundVehicleIds, groundVehiclePose, loadGroundVehicleModel, vehicleStops, type GroundVehicleId } from '../src/frontend/scene-vehicles';
import { sceneAreas, sceneBounds, scenePaths } from '../src/frontend/scene-layout';
import { createCampusWorld, streetRoutes } from '../src/frontend/scene-world';
import { isScenePositionWalkable, moveScenePosition } from '../src/frontend/scene-movement';

const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
function model() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(3, 2, 7), new THREE.MeshStandardMaterial()));
  return group;
}
function glbData(definition: object) {
  const json = new TextEncoder().encode(JSON.stringify(definition)), jsonLength = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(20 + jsonLength), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20); bytes.set(json, 20);
  return `data:model/gltf-binary;base64,${btoa(String.fromCharCode(...bytes))}`;
}

describe('local city roads and decorative ground vehicles', () => {
  it('keeps all vehicle footprints on asphalt and outside the sidewalks throughout every stop loop', () => {
    for (const stop of vehicleStops) for (const id of groundVehicleIds) for (let second = 0; second <= 250; second++) {
      const pose = groundVehiclePose(id, second, stop)!;
      expect(Number.isFinite(pose.x + pose.z + pose.yaw)).toBe(true);
      expect(pose.x).toBeGreaterThan(sceneBounds.minX); expect(pose.x).toBeLessThan(sceneBounds.maxX);
      const halfLength = id === 't84' ? 4.7 : 3.9, halfWidth = id === 't84' ? 1.85 : 1.7;
      for (const [dx, dz] of [[-halfLength, -halfWidth], [halfLength, halfWidth]]) {
        expect(scenePaths.some(path => path.kind === 'road' && Math.abs(pose.x + dx - path.x) <= path.width / 2 && Math.abs(pose.z + dz - path.z) <= path.depth / 2), `${stop.id}:${id}:${second}`).toBe(true);
      }
    }
    expect(groundVehiclePose('btr82a', NaN, vehicleStops[0])).toBeNull();
    expect(groundVehiclePose('btr82a', -1, vehicleStops[0])).toBeNull();
    expect(groundVehiclePose('btr82a', 0, vehicleStops[0])?.waiting).toBe(true);
    expect(groundVehiclePose('zbd04a', 0, vehicleStops[0])?.waiting).toBe(true);
    expect(groundVehiclePose('t84', 0, vehicleStops[0])?.waiting).toBe(false);
  });

  it('gives every station a correct named region and an unobstructed actual walking spawn', () => {
    const campus = createCampusWorld(new THREE.Scene());
    try {
      for (const stop of vehicleStops) {
        const area = sceneAreas.find(area => stop.x >= area.minX && stop.x <= area.maxX && stop.z >= area.minZ && stop.z <= area.maxZ);
        expect(area?.id).toBe(stop.id);
        const [x, y, z] = streetRoutes[stop.id][0].position;
        expect({ x, z }).toEqual({ x: stop.x, z: stop.z });
        expect(isScenePositionWalkable(x, z, campus.movementWorld)).toBe(true);
        const step = moveScenePosition({ x, y, z }, { forward: 1, strafe: 0 }, streetRoutes[stop.id][0].yaw, 1 / 30, campus.movementWorld);
        expect(Math.hypot(step.x - x, step.z - z)).toBeGreaterThan(0.05);
      }
      for (const id of ['building:home-apartment', 'building:commercial-shop:178', 'city-park-lake', 'home:shelter-back', 'commercial:shelter-back', 'city-park:shelter-back']) {
        expect(campus.movementWorld.colliders.some(collider => collider.id === id)).toBe(true);
      }
    } finally { campus.dispose(); }
  });

  it('loads exactly once per model, draws at most three, relocates the visual fleet to the nearby station and freezes reduced motion', async () => {
    const scene = new THREE.Scene(), loadModel = vi.fn(async () => model()), changed = vi.fn();
    const vehicles = createSceneVehicles(scene, { loadModel, changed });
    expect(loadModel).not.toHaveBeenCalled();
    vehicles.update(0, { x: 46, z: 38 }); await settle();
    expect(loadModel).toHaveBeenCalledTimes(3);
    vehicles.update(0.05, { x: 46, z: 38 });
    expect(vehicles.group.children).toHaveLength(3);
    expect(changed.mock.lastCall?.[0]).toMatchObject({ status: 'ready', count: 3, activeIds: [...groundVehicleIds], stopId: 'bus-stop' });
    const vehicle = vehicles.group.getObjectByName('scene-vehicle-t84')!;
    const initial = vehicle.position.x;
    vehicles.update(0.05, { x: 46, z: 38 }); expect(vehicle.position.x).toBeLessThan(initial);
    vehicles.update(999, { x: 46, z: 38 }); expect(Math.abs(vehicle.position.x - initial)).toBeLessThan(1);
    const beforePause = vehicle.position.clone();
    expect(vehicles.update(999, { x: 46, z: 38 }, false)).toBe(false);
    expect(vehicle.position).toEqual(beforePause);
    vehicles.update(0, { x: 46, z: 38 }); expect(vehicle.position).toEqual(beforePause);
    vehicles.update(0.05, { x: 46, z: 38 });
    expect(beforePause.x - vehicle.position.x).toBeCloseTo(2.3 * 0.05);
    vehicles.update(1, { x: 180, z: -150 }, false);
    const still = vehicle.position.clone(); vehicles.update(50, { x: 180, z: -150 }, false);
    expect(vehicle.position).toEqual(still);
    expect(changed.mock.lastCall?.[0]).toMatchObject({ count: 3, stopId: 'city-park' });
    vehicles.update(0.05, { x: 0, z: -210 });
    expect(vehicles.group.children.every(child => !child.visible)).toBe(true);
    expect(loadModel).toHaveBeenCalledTimes(3);
    vehicles.dispose(); vehicles.dispose();
    expect(scene.getObjectByName('scene-ground-vehicles')).toBeUndefined();
  });

  it('releases resources shared across multiple loaded vehicles once, including a late load after unmount', async () => {
    const resolvers = new Map<GroundVehicleId, (group: THREE.Group) => void>(), changed = vi.fn();
    const vehicles = createSceneVehicles(new THREE.Scene(), { loadModel: id => new Promise(resolve => { resolvers.set(id, resolve); }), changed });
    vehicles.update(0, vehicleStops[0]); await settle();
    const original = model(), mesh = original.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const close = vi.fn(), texture = new THREE.Texture({ close }); mesh.material.map = texture;
    const geoDispose = vi.spyOn(mesh.geometry, 'dispose'), matDispose = vi.spyOn(mesh.material, 'dispose'), texDispose = vi.spyOn(texture, 'dispose');
    resolvers.get('btr82a')!(original); await settle();
    vehicles.update(0, vehicleStops[0]); vehicles.dispose(); vehicles.dispose();
    for (const id of ['zbd04a', 't84'] as const) {
      const late = new THREE.Group(); late.add(new THREE.Mesh(mesh.geometry, mesh.material)); resolvers.get(id)!(late);
    }
    await settle();
    expect(geoDispose).toHaveBeenCalledTimes(1); expect(matDispose).toHaveBeenCalledTimes(1);
    expect(texDispose).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls.some(([snapshot]) => snapshot.status === 'ready')).toBe(false);
    expect(vehicles.group.children).toHaveLength(0);
  });

  it('keeps the world usable if one model cannot load, without retrying every frame', async () => {
    const changed = vi.fn(), loader = vi.fn(async (id: GroundVehicleId) => { if (id === 't84') throw new Error('bad model'); return model(); });
    const vehicles = createSceneVehicles(new THREE.Scene(), { loadModel: loader, changed });
    vehicles.update(0, vehicleStops[0]); await settle(); vehicles.update(0, vehicleStops[0]);
    expect(changed.mock.lastCall?.[0]).toMatchObject({ status: 'error', count: 2, activeIds: ['btr82a', 'zbd04a'] });
    expect(loader).toHaveBeenCalledTimes(3); vehicles.dispose();
  });
});

describe('embedded vehicle loader boundary', () => {
  it('parses ordinary self-contained GLB without fetching outside resources', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      const loaded = await loadGroundVehicleModel(glbData({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 }));
      expect(loaded).toBeInstanceOf(THREE.Group); expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it('rejects external buffers, image URLs, decoders and malformed definitions before parsing', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      for (const definition of [{ buffers: [{ uri: 'https://example.invalid/vehicle.bin' }] }, { images: [{ uri: 'data:image/png;base64,AAAA' }] }, { extensionsUsed: ['EXT_meshopt_compression'] }, { extensionsRequired: ['KHR_draco_mesh_compression'] }, { images: {} }]) {
        await expect(loadGroundVehicleModel(glbData(definition))).rejects.toThrow('self-contained');
      }
      await expect(loadGroundVehicleModel(glbData([]))).rejects.toThrow('definition');
      await expect(loadGroundVehicleModel('https://example.invalid/car.glb')).rejects.toThrow('bundled');
      await expect(loadGroundVehicleModel('data:model/gltf-binary;base64,AAAA')).rejects.toThrow('GLB');
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});
