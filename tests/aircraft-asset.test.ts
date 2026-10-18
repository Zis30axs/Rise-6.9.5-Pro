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
  asset: { version: string; extras: Record<string, string> };
  buffers: { byteLength: number; uri?: string }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  accessors: Accessor[];
  meshes: { primitives: Primitive[] }[];
  nodes: { mesh: number; matrix?: number[]; rotation?: number[]; scale?: number[] }[];
  materials: unknown[];
  textures: { source: number }[];
  images: { bufferView: number; mimeType: string; uri?: string }[];
  extensionsUsed?: string[]; extensionsRequired?: string[];
}

const model = readFileSync(new URL('../assets/models/ambient-aircraft.glb', import.meta.url));
const report = JSON.parse(readFileSync(new URL('../assets/models/ambient-aircraft.stats.json', import.meta.url), 'utf8'));
const jsonLength = model.readUInt32LE(12);
const glb = JSON.parse(model.toString('utf8', 20, 20 + jsonLength)) as Glb;
const binaryHeader = 20 + jsonLength;
const binary = model.subarray(binaryHeader + 8);
const primitives = glb.meshes.flatMap(mesh => mesh.primitives);

function values(index: number) {
  const accessor = glb.accessors[index];
  const view = glb.bufferViews[accessor.bufferView];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3 }[accessor.type];
  const width = accessor.componentType === 5123 ? 2 : 4;
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? components * width;
  expect([5123, 5125, 5126]).toContain(accessor.componentType);
  expect((accessor.byteOffset ?? 0) + (accessor.count - 1) * stride + components * width).toBeLessThanOrEqual(view.byteLength);
  return Array.from({ length: accessor.count * components }, (_, item) => {
    const position = offset + Math.floor(item / components) * stride + item % components * width;
    return accessor.componentType === 5126 ? binary.readFloatLE(position)
      : accessor.componentType === 5123 ? binary.readUInt16LE(position) : binary.readUInt32LE(position);
  });
}

describe('packaged distant aircraft asset', () => {
  it('contains a complete GLB below the budget without external assets or decoder extensions', () => {
    expect(model.readUInt32LE(0)).toBe(0x46546c67);
    expect(model.readUInt32LE(4)).toBe(2);
    expect(model.readUInt32LE(8)).toBe(model.length);
    expect(model.readUInt32LE(16)).toBe(0x4e4f534a);
    expect(model.readUInt32LE(binaryHeader + 4)).toBe(0x004e4942);
    expect(model.readUInt32LE(binaryHeader)).toBe(binary.length);
    expect(model.length).toBeLessThanOrEqual(500_000);
    expect(glb.asset.version).toBe('2.0');
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
      expect(image.mimeType).toBe('image/jpeg');
      const view = glb.bufferViews[image.bufferView];
      const jpeg = binary.subarray(view.byteOffset, (view.byteOffset ?? 0) + view.byteLength);
      expect(jpeg.subarray(0, 2).toString('hex')).toBe('ffd8');
      expect(jpeg.subarray(-2).toString('hex')).toBe('ffd9');
    }
  });

  it('has finite matching vertex attributes and valid triangle indices after simplification', () => {
    for (const primitive of primitives) {
      expect(primitive.mode ?? 4).toBe(4);
      expect(glb.materials[primitive.material]).toBeDefined();
      const positions = values(primitive.attributes.POSITION);
      const normals = values(primitive.attributes.NORMAL);
      const indices = values(primitive.indices);
      expect(positions.length).toBeGreaterThan(0);
      expect(normals.length).toBe(positions.length);
      expect(indices.length % 3).toBe(0);
      expect(positions.every(Number.isFinite)).toBe(true);
      expect(normals.every(Number.isFinite)).toBe(true);
      expect(indices.every(index => Number.isInteger(index) && index >= 0 && index < positions.length / 3)).toBe(true);
      for (let vertex = 0; vertex < normals.length; vertex += 3) {
        expect(Math.hypot(...normals.slice(vertex, vertex + 3))).toBeCloseTo(1, 4);
      }
      if (primitive.attributes.TEXCOORD_0 !== undefined) {
        const uv = values(primitive.attributes.TEXCOORD_0);
        expect(uv.length).toBe(positions.length / 3 * 2);
        expect(uv.every(Number.isFinite)).toBe(true);
      }
      const accessor = glb.accessors[primitive.attributes.POSITION];
      for (let axis = 0; axis < 3; axis++) {
        const coordinates = positions.filter((_, index) => index % 3 === axis);
        expect(Math.min(...coordinates)).toBe(accessor.min![axis]);
        expect(Math.max(...coordinates)).toBe(accessor.max![axis]);
      }
    }
  });

  it('reports the actual packaged bytes, hash, geometry and bounds', () => {
    expect(report.outputBytes).toBe(model.length);
    expect(report.outputSha256).toBe(createHash('sha256').update(model).digest('hex'));
    expect(report.triangles).toBe(primitives.reduce((sum, primitive) => sum + glb.accessors[primitive.indices].count / 3, 0));
    expect(report.vertices).toBe(primitives.reduce((sum, primitive) => sum + glb.accessors[primitive.attributes.POSITION].count, 0));
    expect(report.primitives).toBe(primitives.length);
    expect(report.meshes).toBe(glb.meshes.length);
    expect(report.embeddedJpegImages).toBe(glb.images.length);
    expect(report.extensionCount).toBe(0);
    expect(report.externalUris).toBe(0);
    expect(report.triangles).toBeLessThan(15_000);
    for (let axis = 0; axis < 3; axis++) {
      const minimum = Math.min(...primitives.map(primitive => glb.accessors[primitive.attributes.POSITION].min![axis]));
      const maximum = Math.max(...primitives.map(primitive => glb.accessors[primitive.attributes.POSITION].max![axis]));
      expect(report.boundsMeters.min[axis]).toBe(minimum);
      expect(report.boundsMeters.max[axis]).toBe(maximum);
      expect(report.boundsMeters.size[axis]).toBe(maximum - minimum);
    }
    // A bad transform or unit conversion would make a distant aircraft invisible or enormous.
    expect(report.boundsMeters.size[0]).toBeGreaterThan(14);
    expect(report.boundsMeters.size[0]).toBeLessThan(16);
    expect(report.boundsMeters.size[1]).toBeLessThan(6);
    expect(report.boundsMeters.size[2]).toBeGreaterThan(21);
    expect(report.boundsMeters.size[2]).toBeLessThan(23);
    expect(glb.nodes[0].matrix).toBeUndefined();
    expect(glb.nodes[0].rotation).toBeUndefined();
    expect(glb.nodes[0].scale).toBeUndefined();
  });

  it('keeps the original attribution and declares the derivative and flight axes', () => {
    expect(glb.asset.extras).toMatchObject({
      author: '42manako (https://sketchfab.com/42manako)',
      title: 'Russian Su-30SM "45 Blue"',
      license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
      source: 'https://sketchfab.com/3d-models/russian-su-30sm-45-blue-8dc883ebe3c84da3834f10aae5d58386',
      sourceSha256: '1737bd65c51cee3eeba0c5b47643f67d6fd907dec7a12b33b151cf6eb8781bcb',
      forwardAxis: '+Z', upAxis: '+Y',
    });
    expect(glb.asset.extras.modifications).toContain('LOD');
    expect(report.sourceSha256).toBe(glb.asset.extras.sourceSha256);
    expect(report.forwardAxis).toBe(glb.asset.extras.forwardAxis);
    expect(report.upAxis).toBe(glb.asset.extras.upAxis);
  });
});
