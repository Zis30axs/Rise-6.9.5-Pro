import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CALIFORNIA_SANDBOX_MODEL_BYTES, CALIFORNIA_SANDBOX_MODEL_SHA256,
} from '../src/frontend/california-sandbox-map';

const pack = JSON.parse(readFileSync('integration/california-sandbox/pack.json', 'utf8')) as {
  bytes: number; sha256: string; archive: string; bundledIn: string; loader: string;
  source: string; id: string; manifestSchema: string;
};

describe('California sandbox asset packaging', () => {
  it('matches the committed GLB to the pack registration', () => {
    const bytes = readFileSync(pack.source);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
    expect(bytes.length).toBe(pack.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(pack.sha256);
    expect(pack.sha256).toBe(CALIFORNIA_SANDBOX_MODEL_SHA256);
    expect(pack.bytes).toBe(CALIFORNIA_SANDBOX_MODEL_BYTES);
    expect(pack.bytes).toBe(1_866_268);
    expect(pack.id).toBe('california-sandbox');
    expect(pack.archive).toBe('unread-city-lite-assets.zip');
    expect(pack.bundledIn).toBe('unread-city-lite-assets.zip');
    expect(pack.manifestSchema).toBe('unread-city-lite-assets-v1');
  });

  it('packages the model in the core Lite ZIP and wires the scene', () => {
    const release = readFileSync('scripts/build_lite_release.py', 'utf8');
    const loader = readFileSync('scripts/lite_asset_loader.js', 'utf8');
    const scene = readFileSync('src/frontend/CaliforniaSandboxScene.vue', 'utf8');
    const card = readFileSync('scripts/build_lite_card.py', 'utf8');
    const workflow = readFileSync('.github/workflows/lite-prerelease.yml', 'utf8');
    expect(release).toContain('CALIFORNIA_SANDBOX_SHA256');
    expect(release).toContain('californiaSandboxInCoreZip');
    expect(loader).toContain('unread-city-lite-assets-v1');
    expect(scene).toContain("import californiaModelAsset from '../../assets/models/unread-city-california-sandbox.glb?inline'");
    expect(scene).toContain('CALIFORNIA_SANDBOX_MODEL_SHA256');
    expect(card).toContain('unread-city-lite-assets.zip');
    expect(workflow).toContain('dist/unread-city-lite-assets.zip');
    expect(workflow).toContain('californiaSandboxInCoreZip');
  });

  it('carries the v2 terrain density and the four landmark meshes', () => {
    const bytes = readFileSync(pack.source);
    const jsonLength = bytes.readUInt32LE(12);
    const meta = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as {
      meshes: { name: string; primitives: { attributes: { POSITION: number }; indices: number }[] }[];
      accessors: { count: number }[];
    };
    expect(meta.meshes.length).toBeGreaterThanOrEqual(13);
    const names = new Set(meta.meshes.map(mesh => mesh.name));
    expect(names.has('california-terrain')).toBe(true);
    for (const id of ['golden-gate', 'hollywood-sign', 'transamerica', 'griffith']) {
      expect(names.has(`california-landmark-${id}`)).toBe(true);
    }
    let vertices = 0;
    let triangles = 0;
    for (const mesh of meta.meshes) {
      for (const prim of mesh.primitives) {
        vertices += meta.accessors[prim.attributes.POSITION].count;
        triangles += meta.accessors[prim.indices].count / 3;
      }
    }
    expect(vertices).toBeGreaterThanOrEqual(40000);
    expect(triangles).toBeGreaterThan(80000);
    const terrain = meta.meshes.find(mesh => mesh.name === 'california-terrain')!;
    expect(meta.accessors[terrain.primitives[0].attributes.POSITION].count)
      .toBeGreaterThanOrEqual(40000);
    const scene = readFileSync('src/frontend/CaliforniaSandboxScene.vue', 'utf8');
    expect(scene).toContain('californiaLandmarkStructures');
    expect(scene).toContain('flyToLandmark');
  });

  it('keeps the generator as the single source of the GLB', () => {
    const generator = readFileSync('scripts/build_california_sandbox_glb.py', 'utf8');
    expect(generator).toContain('unread-city-california-sandbox.glb');
    expect(generator).toContain('unread-city-california-sandbox-data.json');
    expect(generator).toContain('PLACE_GEO');
    expect(generator).toContain('def height_at');
    expect(generator).toContain('def build_glb');
    const verify = readFileSync('scripts/verify_california_model.py', 'utf8');
    expect(verify).toContain('CALIFORNIA_SANDBOX_MODEL_SHA256');
    expect(verify).toContain('unread-city-california-sandbox.glb');
  });
});
