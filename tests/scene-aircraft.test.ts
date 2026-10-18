import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { aircraftPose, createSceneAircraft, loadAircraftModel } from '../src/frontend/scene-aircraft';
import type { AirlinerPass } from '../src/frontend/types';

const pass: AirlinerPass = { id: 'airliner-test-1', source: 'ambient', startedAt: 1_000_000, durationMs: 40000, routeIndex: 0 };
const settle = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };
function model() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(3, 1, 5), new THREE.MeshStandardMaterial()));
  return group;
}
function glbData(definition: object) {
  const json = new TextEncoder().encode(JSON.stringify(definition));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(20 + jsonLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20); bytes.set(json, 20);
  return `data:model/gltf-binary;base64,${btoa(String.fromCharCode(...bytes))}`;
}

describe('saved aircraft flight rendering', () => {
  it('uses saved absolute time for each route, without replaying on restore or at expiry', () => {
    const midway = aircraftPose(pass, pass.startedAt + 20000)!;
    expect(midway).toMatchObject({ progress: 0.5, x: 0, y: 64, z: -110, yaw: Math.PI / 2 });
    for (const routeIndex of [0, 1, 2, 3] as const) {
      const flight = { ...pass, routeIndex };
      const first = aircraftPose(flight, pass.startedAt)!;
      const later = aircraftPose(flight, pass.startedAt + 30000)!;
      expect(later.progress).toBe(0.75);
      expect((later.x - first.x) * Math.sin(later.yaw) + (later.z - first.z) * Math.cos(later.yaw)).toBeGreaterThan(0);
      expect(aircraftPose(flight, pass.startedAt + 40000)).toBeNull();
    }
    expect(aircraftPose(pass, pass.startedAt - 1)).toBeNull();
    expect(aircraftPose(null, pass.startedAt)).toBeNull();
    expect(aircraftPose(pass, NaN)).toBeNull();
    expect(aircraftPose({ ...pass, durationMs: NaN } as AirlinerPass, pass.startedAt)).toBeNull();
  });

  it('loads lazily once, reuses its model, and hides an expired pass after a delayed load', async () => {
    let resolve!: (group: THREE.Group) => void;
    const loader = vi.fn(() => new Promise<THREE.Group>(done => { resolve = done; }));
    const scene = new THREE.Scene();
    const aircraft = createSceneAircraft(scene, { loadModel: loader });
    aircraft.setPass(pass);
    expect(aircraft.update(pass.startedAt + 40000)).toBe(false);
    expect(loader).not.toHaveBeenCalled();
    expect(aircraft.update(pass.startedAt + 5000)).toBe(false);
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    aircraft.update(pass.startedAt + 6000);
    resolve(model()); await settle();
    expect(aircraft.group.visible).toBe(false);
    expect(aircraft.update(pass.startedAt + 40000)).toBe(false);
    expect(aircraft.group.visible).toBe(false);
    aircraft.setPass({ ...pass, id: 'airliner-test-2', startedAt: pass.startedAt + 180000 });
    expect(aircraft.update(pass.startedAt + 190000)).toBe(true);
    expect(aircraft.group.userData).toMatchObject({ aircraftId: 'airliner-test-2', progress: 0.25 });
    expect(aircraft.group.visible).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
    aircraft.dispose();
    expect(scene.getObjectByName('scene-aircraft')).toBeUndefined();
  });

  it('centres only the visual marker for reduced motion and still expires at the saved end time', async () => {
    const aircraft = createSceneAircraft(new THREE.Scene(), { loadModel: async () => model() });
    aircraft.setPass(pass);
    aircraft.update(pass.startedAt + 5000, false); await settle();
    expect(aircraft.update(pass.startedAt + 10000, false)).toBe(false);
    expect(aircraft.group.visible).toBe(true);
    const midpoint = aircraftPose(pass, pass.startedAt + 20000)!;
    expect(aircraft.group.position.toArray()).toEqual([midpoint.x, midpoint.y, midpoint.z]);
    expect(aircraft.group.userData.progress).toBe(0.25);
    aircraft.update(pass.startedAt + 40000, false);
    expect(aircraft.group.visible).toBe(false);
    aircraft.dispose();
  });

  it('releases a late asynchronous load after disposal without publishing ready or leaking shared assets', async () => {
    let resolve!: (group: THREE.Group) => void;
    const changed = vi.fn();
    const aircraft = createSceneAircraft(new THREE.Scene(), { loadModel: () => new Promise(done => { resolve = done; }), changed });
    const loaded = model();
    const mesh = loaded.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const close = vi.fn();
    const texture = new THREE.Texture({ close });
    const secondTexture = new THREE.Texture({ close });
    secondTexture.source = texture.source;
    mesh.material.map = texture; mesh.material.normalMap = secondTexture;
    loaded.add(new THREE.Mesh(mesh.geometry, mesh.material));
    const disposeGeometry = vi.spyOn(mesh.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(mesh.material, 'dispose');
    const disposeTexture = vi.spyOn(texture, 'dispose');
    aircraft.setPass(pass); aircraft.update(pass.startedAt + 1000); await settle();
    aircraft.dispose(); aircraft.dispose();
    resolve(loaded); await settle();
    expect(changed.mock.calls).toEqual([['loading']]);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeTexture).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(aircraft.update(pass.startedAt + 2000)).toBe(false);
    expect(aircraft.group.children).toHaveLength(0);
  });

  it('reports a failed asset once while the caller can keep rendering the campus', async () => {
    const loader = vi.fn(async () => { throw new Error('decode failed'); });
    const changed = vi.fn();
    const aircraft = createSceneAircraft(new THREE.Scene(), { loadModel: loader, changed });
    aircraft.setPass(pass); aircraft.update(pass.startedAt); await settle();
    expect(changed.mock.calls).toEqual([['loading'], ['error']]);
    expect(aircraft.update(pass.startedAt + 10000)).toBe(false);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(aircraft.group.visible).toBe(false);
    aircraft.dispose();
  });
});

describe('bundled aircraft loader resource boundary', () => {
  it('parses an ordinary self-contained GLB without a decoder or an external request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      const loaded = await loadAircraftModel(glbData({ asset: { version: '2.0' }, scenes: [{ nodes: [] }], scene: 0 }));
      expect(loaded).toBeInstanceOf(THREE.Group);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it('rejects outside buffers, images, decoder extensions, and invalid headers before loading', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      for (const definition of [
        { buffers: [{ uri: 'https://example.invalid/aircraft.bin' }] },
        { images: [{ uri: 'data:image/png;base64,AAAA' }] },
        { extensionsRequired: ['KHR_draco_mesh_compression'] },
        { extensionsUsed: ['EXT_meshopt_compression'] },
      ]) await expect(loadAircraftModel(glbData({ asset: { version: '2.0' }, ...definition }))).rejects.toThrow('self-contained');
      await expect(loadAircraftModel('https://example.invalid/aircraft.glb')).rejects.toThrow('bundled');
      await expect(loadAircraftModel('data:model/gltf-binary;base64,AAAA')).rejects.toThrow('GLB');
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});
