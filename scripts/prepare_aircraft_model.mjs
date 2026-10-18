import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MeshoptSimplifier } from 'meshoptimizer/simplifier'

// This offline conversion is intentionally scoped to the supplied, credited model.
// No URLs or commands embedded in the GLB are followed or executed.
const SOURCE_SHA256 = '1737bd65c51cee3eeba0c5b47643f67d6fd907dec7a12b33b151cf6eb8781bcb'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destination = path.join(root, 'assets', 'models', 'ambient-aircraft.glb')
const inputPath = process.argv[2]
if (!inputPath || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/prepare_aircraft_model.mjs <original.glb> (requires Python + Pillow)')
}
const source = await readFile(path.resolve(inputPath))
const sourceHash = createHash('sha256').update(source).digest('hex')
if (sourceHash !== SOURCE_SHA256) throw new Error('Input differs from the documented source model.')
if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2 || source.readUInt32LE(8) !== source.length) {
  throw new Error('Invalid GLB v2 header.')
}
const jsonLength = source.readUInt32LE(12)
const gltf = JSON.parse(source.toString('utf8', 20, 20 + jsonLength))
const binary = source.subarray(28 + jsonLength)
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const componentReaders = { 5123: ['getUint16', 2], 5125: ['getUint32', 4], 5126: ['getFloat32', 4] }

function accessor(index) {
  const item = gltf.accessors[index]
  const view = gltf.bufferViews[item.bufferView]
  const [read, width] = componentReaders[item.componentType]
  const length = components[item.type]
  const stride = view.byteStride ?? length * width
  const offset = (view.byteOffset ?? 0) + (item.byteOffset ?? 0)
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength)
  const out = item.componentType === 5126 ? new Float32Array(item.count * length) : new Uint32Array(item.count * length)
  for (let row = 0; row < item.count; row++) {
    for (let col = 0; col < length; col++) out[row * length + col] = data[read](offset + row * stride + col * width, true)
  }
  return out
}

// The source has a single -90 degree X root rotation and no other transforms.
// Bake it into vertices: source (x, y, z) -> output (x, z, -y).
// Result is Y-up, nose +Z, wing span X, metres at the source scale.
const expectedRootMatrix = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]
if (gltf.nodes[0].matrix?.some((value, index) => Math.abs(value - expectedRootMatrix[index]) > 1e-8)
    || gltf.nodes[0].matrix?.length !== expectedRootMatrix.length) {
  throw new Error('Unexpected root transform; conversion assumptions need review.')
}
for (const node of gltf.nodes.slice(1)) {
  if (node.matrix || node.translation || node.rotation || node.scale || node.skin !== undefined) {
    throw new Error('Unexpected source transform or skin; conversion assumptions need review.')
  }
}
const groups = new Map()
let sourceTriangles = 0
for (const mesh of gltf.meshes) {
  for (const primitive of mesh.primitives) {
    if ((primitive.mode ?? 4) !== 4) throw new Error('Only triangle primitives are supported.')
    const positions = accessor(primitive.attributes.POSITION)
    const normals = accessor(primitive.attributes.NORMAL)
    const uv = primitive.attributes.TEXCOORD_0 === undefined ? null : accessor(primitive.attributes.TEXCOORD_0)
    const indices = accessor(primitive.indices)
    let group = groups.get(primitive.material)
    if (!group) {
      group = { material: primitive.material, positions: [], normals: [], uv: [], indices: [], weld: new Map(), sourceTriangles: 0 }
      groups.set(primitive.material, group)
    }
    const remap = new Uint32Array(positions.length / 3)
    for (let v = 0; v < remap.length; v++) {
      const p = [positions[v * 3], positions[v * 3 + 2], -positions[v * 3 + 1]]
      const tex = uv ? [uv[v * 2], uv[v * 2 + 1]] : [0, 0]
      // Drop normal splits when welding, then retain the source normal of the
      // representative vertex. UV seams remain distinct to preserve the livery.
      const key = [...p, ...tex].map((n) => Math.round(n * 1e5)).join(',')
      let target = group.weld.get(key)
      if (target === undefined) {
        target = group.positions.length / 3
        group.weld.set(key, target)
        group.positions.push(...p)
        group.normals.push(normals[v * 3], normals[v * 3 + 2], -normals[v * 3 + 1])
        group.uv.push(...tex)
      }
      remap[v] = target
    }
    for (const index of indices) group.indices.push(remap[index])
    group.sourceTriangles += indices.length / 3
    sourceTriangles += indices.length / 3
  }
}

await MeshoptSimplifier.ready
const output = {
  asset: {
    version: '2.0', generator: 'Unread City offline aircraft LOD / meshoptimizer 1.1.1 + Pillow',
    extras: {
      ...gltf.asset.extras,
      modifications: 'Distant ambient LOD: material merge, vertex weld, UV-aware mesh simplification, 128/256px JPEG diffuse maps, basic metallic-roughness materials, baked Y-up transform.',
      forwardAxis: '+Z', upAxis: '+Y', sourceSha256: sourceHash,
    },
  },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Ambient aircraft LOD', mesh: 0 }],
  meshes: [{ name: 'Ambient aircraft LOD', primitives: [] }],
  materials: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }],
}
const chunks = []
let byteLength = 0
function addView(bytes, target) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const padding = (4 - byteLength % 4) % 4
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding }
  const index = output.bufferViews.length
  output.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buffer.length, ...(target ? { target } : {}) })
  chunks.push(buffer)
  byteLength += buffer.length
  return index
}
function addAccessor(data, type, componentType, target, bounds = false) {
  const count = data.length / components[type]
  const item = { bufferView: addView(data, target), componentType, count, type }
  if (bounds) {
    item.min = Array(components[type]).fill(Infinity)
    item.max = Array(components[type]).fill(-Infinity)
    for (let i = 0; i < data.length; i++) {
      const c = i % components[type]
      item.min[c] = Math.min(item.min[c], data[i])
      item.max[c] = Math.max(item.max[c], data[i])
    }
  }
  output.accessors.push(item)
  return output.accessors.length - 1
}

const stats = []
const materialIds = [...groups.keys()].sort((a, b) => a - b)
const temporaryRoot = path.join(root, 'outputs')
await mkdir(temporaryRoot, { recursive: true })
const temporary = await mkdtemp(path.join(temporaryRoot, '.aircraft-lod-'))
try {
  const textureTasks = []
  for (const id of materialIds) {
    const group = groups.get(id)
    const material = gltf.materials[id]
    const pbr = material.extensions.KHR_materials_pbrSpecularGlossiness
    const simpleMaterial = {
      name: `Aircraft material ${id}`, doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: pbr.diffuseFactor ?? [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 },
      ...(material.alphaMode ? { alphaMode: material.alphaMode } : {}),
    }
    if (pbr.diffuseTexture) {
      const image = gltf.images[gltf.textures[pbr.diffuseTexture.index].source]
      if (image.uri || image.bufferView === undefined) throw new Error('External texture is forbidden.')
      const view = gltf.bufferViews[image.bufferView]
      const src = path.join(temporary, `source-${id}.image`)
      const dst = path.join(temporary, `texture-${id}.jpg`)
      await writeFile(src, binary.subarray(view.byteOffset, view.byteOffset + view.byteLength))
      textureTasks.push({ src, dst, size: id === 10 ? 256 : 128, id })
      simpleMaterial.pbrMetallicRoughness.baseColorTexture = { index: textureTasks.length - 1 }
    }
    output.materials.push(simpleMaterial)

    const positions = new Float32Array(group.positions)
    const originalIndices = new Uint32Array(group.indices)
    const target = Math.max(36, Math.floor(originalIndices.length * 0.006 / 3) * 3)
    const [indices, error] = MeshoptSimplifier.simplifyWithAttributes(originalIndices, positions, 3,
      new Float32Array(group.uv), 2, pbr.diffuseTexture ? [8, 8] : [0, 0], null,
      Math.min(target, originalIndices.length), 0.025, ['Prune', 'Permissive'])
    const [remap, count] = MeshoptSimplifier.compactMesh(indices)
    const compactPositions = new Float32Array(count * 3)
    const compactNormals = new Float32Array(count * 3)
    const compactUv = new Float32Array(count * 2)
    for (let v = 0; v < remap.length; v++) {
      const target = remap[v]
      if (target >= count) continue
      compactPositions.set(group.positions.slice(v * 3, v * 3 + 3), target * 3)
      compactNormals.set(group.normals.slice(v * 3, v * 3 + 3), target * 3)
      compactUv.set(group.uv.slice(v * 2, v * 2 + 2), target * 2)
    }
    const compactIndices = count <= 65535 ? new Uint16Array(indices) : indices
    output.meshes[0].primitives.push({
      attributes: {
        POSITION: addAccessor(compactPositions, 'VEC3', 5126, 34962, true),
        NORMAL: addAccessor(compactNormals, 'VEC3', 5126, 34962),
        ...(pbr.diffuseTexture ? { TEXCOORD_0: addAccessor(compactUv, 'VEC2', 5126, 34962) } : {}),
      },
      indices: addAccessor(compactIndices, 'SCALAR', count <= 65535 ? 5123 : 5125, 34963),
      material: output.materials.length - 1,
    })
    stats.push({ material: id, sourceTriangles: group.sourceTriangles, triangles: indices.length / 3, vertices: count, relativeError: error })
  }
  // One process, explicit argument array, no shell; filenames are generated here.
  const python = spawnSync(process.env.PYTHON ?? 'python', ['-c', `
import json,sys
from PIL import Image
for item in json.load(sys.stdin):
    with Image.open(item['src']) as original:
        image = original.convert('RGB')
        image.thumbnail((item['size'], item['size']), Image.Resampling.LANCZOS)
        image.save(item['dst'], 'JPEG', quality=72, optimize=True, progressive=False, subsampling=2)
`], { input: JSON.stringify(textureTasks), encoding: 'utf8', shell: false, maxBuffer: 1024 * 1024 })
  if (python.error || python.status !== 0) throw new Error(`Texture conversion failed: ${python.error?.message ?? python.stderr}`)
  for (const texture of textureTasks) {
    const bytes = await readFile(texture.dst)
    output.images.push({ name: `Aircraft diffuse ${texture.id}`, bufferView: addView(bytes), mimeType: 'image/jpeg' })
    output.textures.push({ sampler: 0, source: output.images.length - 1 })
  }
  const binaryPadding = (4 - byteLength % 4) % 4
  if (binaryPadding) { chunks.push(Buffer.alloc(binaryPadding)); byteLength += binaryPadding }
  output.buffers[0].byteLength = byteLength
  const json = Buffer.from(JSON.stringify(output))
  const jsonPadded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)])
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + jsonPadded.length + body.length, 8)
  header.writeUInt32LE(jsonPadded.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(body.length, 0); binHeader.writeUInt32LE(0x004e4942, 4)
  const model = Buffer.concat([header, jsonPadded, binHeader, body])
  if (model.length > 500000) throw new Error(`LOD exceeds the 500,000-byte budget (${model.length}).`)
  const positionAccessors = output.meshes[0].primitives.map((primitive) => output.accessors[primitive.attributes.POSITION])
  const boundsMin = [0, 1, 2].map((axis) => Math.min(...positionAccessors.map((item) => item.min[axis])))
  const boundsMax = [0, 1, 2].map((axis) => Math.max(...positionAccessors.map((item) => item.max[axis])))
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, model)
  const report = {
    sourceSha256: sourceHash, sourceBytes: source.length, outputBytes: model.length,
    outputSha256: createHash('sha256').update(model).digest('hex'),
    sourceTriangles, triangles: stats.reduce((n, s) => n + s.triangles, 0),
    vertices: stats.reduce((n, s) => n + s.vertices, 0), primitives: stats.length,
    sourceMeshes: gltf.meshes.length, meshes: output.meshes.length,
    sourcePrimitives: gltf.meshes.reduce((count, mesh) => count + mesh.primitives.length, 0),
    embeddedJpegImages: output.images.filter((image) => image.mimeType === 'image/jpeg' && image.bufferView !== undefined).length,
    extensionCount: output.extensionsUsed?.length ?? 0,
    externalUris: [...output.buffers, ...output.images].filter((item) => item.uri !== undefined).length,
    boundsMeters: { min: boundsMin, max: boundsMax, size: boundsMax.map((value, axis) => value - boundsMin[axis]) },
    forwardAxis: '+Z', upAxis: '+Y', groups: stats,
  }
  await writeFile(path.join(root, 'assets', 'models', 'ambient-aircraft.stats.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  // Only remove the exact directory mkdtemp returned inside the project outputs.
  if (path.dirname(temporary) === temporaryRoot && path.basename(temporary).startsWith('.aircraft-lod-')) {
    await rm(temporary, { recursive: true, force: true })
  }
}
