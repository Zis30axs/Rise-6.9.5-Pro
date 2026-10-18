// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Accessor {
  bufferView: number; byteOffset?: number; componentType: number; count: number;
  type: 'SCALAR' | 'VEC2' | 'VEC3'; min?: number[]; max?: number[];
}
interface Primitive { attributes: Record<string, number>; indices: number; material: number; mode?: number }
interface Glb {
  asset: { version: string; extras: Record<string, string | number> };
  buffers: { byteLength: number; uri?: string }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  accessors: Accessor[]; meshes: { primitives: Primitive[] }[];
  nodes: { mesh: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  materials: { name: string }[]; textures: { source: number }[];
  images: { bufferView: number; mimeType: string; uri?: string }[];
  extensionsUsed?: string[]; extensionsRequired?: string[];
}

const expected = [
  { id: 'btr82a', bytes: 308176, hash: '256ec00ee1f81726f62e7280e4429a7fea6b598176b31fcd900b9369946eb7e7', triangles: 8047,
    author: '42manako (https://sketchfab.com/42manako)', title: 'BTR-82A', license: 'CC-BY-NC-4.0 (http://creativecommons.org/licenses/by-nc/4.0/)',
    source: 'https://sketchfab.com/3d-models/btr-82a-5c10df6da4154042a481fe89fd688fdb', sourceHash: '95da1339c5148e15e181a5d61885d421f601975a5471842adca900901f4dffa7' },
  { id: 'zbd04a', bytes: 549456, hash: '83751e8feaf3e66de4b9f0ed1ce4fdb8ab3e46a82e6cf62544111caf034e67dc', triangles: 8196,
    author: '42manako (https://sketchfab.com/42manako)', title: 'Chinese ZBD-04A', license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
    source: 'https://sketchfab.com/3d-models/chinese-zbd-04a-673ca87305e34fc6afd3f790010ccded', sourceHash: '1e22f9f290879de7c3d1ab8d923f106984fd57fa1c62ea54bfea1a047d43ecde' },
  { id: 't84', bytes: 510188, hash: 'b3b315cf924b8e79a526e0a00d545f03c9ee453ee2f28aec5952235bf7b9b5a5', triangles: 8009,
    author: 'lm9241221 (https://sketchfab.com/lm9241221)', title: 'T-84 OPLOT(LOW POLY)', license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
    source: 'https://sketchfab.com/3d-models/t-84-oplotlow-poly-98c26e7d386c466e982ec81e89d42b06', sourceHash: 'e3eac5a881b0c9fa83bc799a5e7a4c2b9ab479cffb98c7a8ed4272e8a9f43177' },
];

describe('embedded ground vehicle LOD assets', () => {
  for (const spec of expected) {
    const bytes = readFileSync(new URL(`../assets/models/ground-${spec.id}.glb`, import.meta.url));
    const jsonLength = bytes.readUInt32LE(12);
    const glb = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)) as Glb;
    const binary = bytes.subarray(28 + jsonLength);
    const primitives = glb.meshes.flatMap(mesh => mesh.primitives);
    const values = (index: number) => {
      const a = glb.accessors[index], view = glb.bufferViews[a.bufferView];
      const components = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
      const width = a.componentType === 5123 ? 2 : 4;
      const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = view.byteStride ?? components * width;
      expect([5123, 5125, 5126]).toContain(a.componentType);
      expect(a.count).toBeGreaterThan(0);
      expect((a.byteOffset ?? 0) + (a.count - 1) * stride + components * width).toBeLessThanOrEqual(view.byteLength);
      return Array.from({ length: a.count * components }, (_, i) => {
        const at = offset + Math.floor(i / components) * stride + i % components * width;
        return a.componentType === 5126 ? binary.readFloatLE(at) : a.componentType === 5123 ? binary.readUInt16LE(at) : binary.readUInt32LE(at);
      });
    };

    it(`${spec.id}: loads from one complete bounded GLB without external resources or decoders`, () => {
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
      expect(bytes.readUInt32LE(4)).toBe(2);
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);
      expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
      expect(bytes.readUInt32LE(24 + jsonLength)).toBe(0x004e4942);
      expect(bytes.readUInt32LE(20 + jsonLength)).toBe(binary.length);
      expect(bytes.length).toBe(spec.bytes);
      expect(bytes.length).toBeLessThanOrEqual(700_000);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(spec.hash);
      expect(glb.buffers).toEqual([{ byteLength: binary.length }]);
      expect(glb.extensionsUsed ?? []).toEqual([]);
      expect(glb.extensionsRequired ?? []).toEqual([]);
      expect(JSON.stringify(glb)).not.toMatch(/"(?:uri|extensions)"\s*:/);
      for (const view of glb.bufferViews) {
        expect(view.buffer).toBe(0);
        expect((view.byteOffset ?? 0) % 4).toBe(0);
        expect(view.byteLength).toBeGreaterThan(0);
        expect((view.byteOffset ?? 0) + view.byteLength).toBeLessThanOrEqual(binary.length);
      }
      for (const texture of glb.textures) expect(glb.images[texture.source]).toBeDefined();
      for (const image of glb.images) {
        const view = glb.bufferViews[image.bufferView], at = view.byteOffset ?? 0;
        expect(['image/jpeg', 'image/png']).toContain(image.mimeType);
        if (image.mimeType === 'image/png') {
          expect(binary.subarray(at, at + 8).toString('hex')).toBe('89504e470d0a1a0a');
          expect(binary.readUInt32BE(at + 16)).toBeLessThanOrEqual(512);
          expect(binary.readUInt32BE(at + 20)).toBeLessThanOrEqual(512);
        } else expect(binary.subarray(at, at + 2).toString('hex')).toBe('ffd8');
      }
    });

    it(`${spec.id}: keeps valid triangles, normals, UVs and a grounded vehicle-sized silhouette`, () => {
      let triangles = 0;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const primitive of primitives) {
        const positions = values(primitive.attributes.POSITION), normals = values(primitive.attributes.NORMAL), indices = values(primitive.indices);
        const a = glb.accessors[primitive.attributes.POSITION];
        expect(primitive.mode ?? 4).toBe(4);
        expect(glb.materials[primitive.material]).toBeDefined();
        expect(normals.length).toBe(positions.length);
        expect(indices.length % 3).toBe(0);
        expect(positions.every(Number.isFinite)).toBe(true);
        expect(normals.every(Number.isFinite)).toBe(true);
        expect(indices.every(i => Number.isInteger(i) && i >= 0 && i < positions.length / 3)).toBe(true);
        for (let n = 0; n < normals.length; n += 3) expect(Math.hypot(normals[n], normals[n + 1], normals[n + 2])).toBeCloseTo(1, 4);
        if (primitive.attributes.TEXCOORD_0 !== undefined) {
          const uv = values(primitive.attributes.TEXCOORD_0);
          expect(uv.length).toBe(positions.length / 3 * 2);
          expect(uv.every(Number.isFinite)).toBe(true);
        }
        for (let axis = 0; axis < 3; axis++) {
          const coordinates = positions.filter((_, i) => i % 3 === axis);
          expect(Math.min(...coordinates)).toBe(a.min![axis]);
          expect(Math.max(...coordinates)).toBe(a.max![axis]);
          min[axis] = Math.min(min[axis], a.min![axis]); max[axis] = Math.max(max[axis], a.max![axis]);
        }
        triangles += indices.length / 3;
      }
      expect(triangles).toBe(spec.triangles);
      expect(min[1]).toBe(0);
      expect(min[0] + max[0]).toBeCloseTo(0, 5);
      expect(min[2] + max[2]).toBeCloseTo(0, 5);
      expect(max[0] - min[0]).toBeGreaterThan(2.8);
      expect(max[0] - min[0]).toBeLessThan(3.7);
      expect(max[1]).toBeGreaterThan(2.5);
      expect(max[1]).toBeLessThan(4.1);
      expect(max[2] - min[2]).toBeGreaterThan(7);
      expect(max[2] - min[2]).toBeLessThan(8.6);
      for (const node of glb.nodes) {
        expect(node.matrix).toBeUndefined(); expect(node.rotation).toBeUndefined();
        expect(node.scale).toBeUndefined(); expect(node.translation).toBeUndefined();
      }
      if (spec.id === 't84') expect(glb.materials.some(material => material.name.includes('ground'))).toBe(false);
    });

    it(`${spec.id}: retains the exact supplied attribution and declares the modifications and axes`, () => {
      expect(glb.asset.extras).toMatchObject({ author: spec.author, title: spec.title, license: spec.license,
        source: spec.source, sourceSha256: spec.sourceHash, upAxis: '+Y', forwardAxis: '+Z', groundY: 0 });
      expect(glb.asset.extras.modifications).toContain('Baked complete scene graph');
      expect(glb.asset.extras.modifications).toContain('not independently verified');
    });
  }

  it('keeps the three complete assets within the combined 2 MB allowance', () => {
    expect(expected.reduce((total, spec) => total + spec.bytes, 0)).toBeLessThanOrEqual(2_000_000);
  });
});
