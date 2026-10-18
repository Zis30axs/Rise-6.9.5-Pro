import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three'
import { MeshoptSimplifier } from 'meshoptimizer/simplifier'

// Offline conversion of the three exact user-supplied files. GLB metadata is
// data: its URLs, filenames, extras and extension content never execute or fetch.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = process.argv[2]
if (!sourceDirectory || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/prepare_ground_vehicle_models.mjs <source directory> (Python + Pillow required)')
}
const sources = [
  { id: 'btr82a', file: 'btr-82a.glb', sha256: '95da1339c5148e15e181a5d61885d421f601975a5471842adca900901f4dffa7', yaw: Math.PI, scale: 1, ratio: 0.45, textureSize: 256, excludeMaterials: [] },
  { id: 'zbd04a', file: 'chinese_zbd-04a.glb', sha256: '1e22f9f290879de7c3d1ab8d923f106984fd57fa1c62ea54bfea1a047d43ecde', yaw: 0, scale: 7.2 / 7.46106481552124, ratio: 0.036, textureSize: 256, excludeMaterials: [] },
  { id: 't84', file: 't-84_oplotlow_poly.glb', sha256: 'e3eac5a881b0c9fa83bc799a5e7a4c2b9ab479cffb98c7a8ed4272e8a9f43177', yaw: 0, scale: 3.6 / 3827.530029296875, ratio: 0.65, textureSize: 512, excludeMaterials: [2] },
]
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const readers = { 5121: ['getUint8', 1], 5123: ['getUint16', 2], 5125: ['getUint32', 4], 5126: ['getFloat32', 4] }

function readGlb(bytes) {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB v2 header.')
  const length = bytes.readUInt32LE(12)
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || length + 28 > bytes.length || bytes.readUInt32LE(24 + length) !== 0x004e4942) throw new Error('Invalid GLB chunks.')
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + length))
  const binaryLength = bytes.readUInt32LE(20 + length)
  const binary = bytes.subarray(28 + length)
  if (binaryLength !== binary.length || json.buffers.length !== 1 || json.buffers[0].byteLength > binary.length) throw new Error('Invalid embedded buffer.')
  if ([...json.buffers, ...(json.images ?? [])].some((item) => item.uri !== undefined)) throw new Error('External or data URIs are not followed.')
  if (json.skins?.length || json.animations?.length || json.extensionsRequired?.some((name) => name !== 'KHR_materials_pbrSpecularGlossiness')) throw new Error('Review unsupported skin, animation or required extension.')
  return { json, binary }
}

function readAccessor(json, binary, index) {
  const item = json.accessors[index]
  const view = json.bufferViews[item?.bufferView]
  const reader = readers[item?.componentType]
  const width = components[item?.type]
  if (!view || view.buffer !== 0 || !reader || !width || item.sparse || item.normalized || !Number.isSafeInteger(item.count) || item.count < 1) throw new Error('Unsupported accessor.')
  const [method, bytes] = reader
  const stride = view.byteStride ?? width * bytes
  const offset = (view.byteOffset ?? 0) + (item.byteOffset ?? 0)
  if (stride < width * bytes || offset < 0 || offset + (item.count - 1) * stride + width * bytes > (view.byteOffset ?? 0) + view.byteLength || (view.byteOffset ?? 0) + view.byteLength > binary.length) throw new Error('Accessor exceeds its buffer view.')
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength)
  const result = item.componentType === 5126 ? new Float32Array(item.count * width) : new Uint32Array(item.count * width)
  for (let row = 0; row < item.count; row++) {
    for (let col = 0; col < width; col++) {
      const value = data[method](offset + row * stride + col * bytes, true)
      if (!Number.isFinite(value)) throw new Error('Nonfinite vertex attribute.')
      result[row * width + col] = value
    }
  }
  return result
}

function collectGeometry(json, binary, spec) {
  const groups = new Map()
  let sourceTriangles = 0
  let removedDisplayTriangles = 0
  const axisTransform = new Matrix4().makeRotationY(spec.yaw).multiply(new Matrix4().makeScale(spec.scale, spec.scale, spec.scale))
  const visit = (id, parent, ancestors) => {
    if (ancestors.has(id) || !json.nodes[id]) throw new Error('Invalid scene graph.')
    const nextAncestors = new Set(ancestors).add(id)
    const node = json.nodes[id]
    if (node.skin !== undefined) throw new Error('Skin is unsupported.')
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      new Vector3().fromArray(node.translation ?? [0, 0, 0]),
      new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
      new Vector3().fromArray(node.scale ?? [1, 1, 1]),
    )
    const world = parent.clone().multiply(local)
    const baked = axisTransform.clone().multiply(world)
    const normalMatrix = new Matrix3().getNormalMatrix(baked)
    if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh].primitives) {
      if ((primitive.mode ?? 4) !== 4 || primitive.targets || primitive.indices === undefined) throw new Error('Only static indexed triangles are supported.')
      const positions = readAccessor(json, binary, primitive.attributes.POSITION)
      const normals = readAccessor(json, binary, primitive.attributes.NORMAL)
      const uv = primitive.attributes.TEXCOORD_0 === undefined ? null : readAccessor(json, binary, primitive.attributes.TEXCOORD_0)
      const indices = readAccessor(json, binary, primitive.indices)
      if (indices.length % 3 || normals.length !== positions.length || (uv && uv.length !== positions.length / 3 * 2)) throw new Error('Mismatched primitive attributes.')
      sourceTriangles += indices.length / 3
      if (spec.excludeMaterials.includes(primitive.material)) { removedDisplayTriangles += indices.length / 3; continue }
      if (!json.materials[primitive.material]) throw new Error('Missing material.')
      let group = groups.get(primitive.material)
      if (!group) {
        group = { material: primitive.material, positions: [], normals: [], uv: [], indices: [], weld: new Map(), sourceTriangles: 0 }
        groups.set(primitive.material, group)
      }
      const remap = new Uint32Array(positions.length / 3)
      const p = new Vector3()
      const n = new Vector3()
      for (let v = 0; v < remap.length; v++) {
        p.fromArray(positions, v * 3).applyMatrix4(baked)
        n.fromArray(normals, v * 3).applyNormalMatrix(normalMatrix)
        const tex = uv ? [uv[v * 2], uv[v * 2 + 1]] : [0, 0]
        const key = [p.x, p.y, p.z, ...tex].map((value) => Math.round(value * 1e6)).join(',')
        let target = group.weld.get(key)
        if (target === undefined) {
          target = group.positions.length / 3
          group.weld.set(key, target)
          group.positions.push(p.x, p.y, p.z)
          group.normals.push(n.x, n.y, n.z)
          group.uv.push(...tex)
        }
        remap[v] = target
      }
      for (let k = 0; k < indices.length; k += 3) {
        if (indices[k] >= remap.length || indices[k + 1] >= remap.length || indices[k + 2] >= remap.length) throw new Error('Index exceeds positions.')
        // Preserve winding under reflected transforms.
        group.indices.push(remap[indices[k]], remap[indices[k + (baked.determinant() < 0 ? 2 : 1)]], remap[indices[k + (baked.determinant() < 0 ? 1 : 2)]])
      }
      group.sourceTriangles += indices.length / 3
    }
    for (const child of node.children ?? []) visit(child, world, nextAncestors)
  }
  for (const id of json.scenes[json.scene ?? 0].nodes) visit(id, new Matrix4(), new Set())
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const group of groups.values()) for (let i = 0; i < group.positions.length; i++) {
    const axis = i % 3
    min[axis] = Math.min(min[axis], group.positions[i]); max[axis] = Math.max(max[axis], group.positions[i])
  }
  const offset = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2]
  for (const group of groups.values()) for (let i = 0; i < group.positions.length; i++) group.positions[i] -= offset[i % 3]
  return { groups, sourceTriangles, removedDisplayTriangles, sourceBoundsMeters: { min, max } }
}

async function convert(spec, temporary) {
  const source = await readFile(path.join(path.resolve(sourceDirectory), spec.file))
  if (sha256(source) !== spec.sha256) throw new Error(`${spec.file} differs from documented input.`)
  const { json, binary } = readGlb(source)
  const { groups, sourceTriangles, removedDisplayTriangles, sourceBoundsMeters } = collectGeometry(json, binary, spec)
  const output = {
    asset: { version: '2.0', generator: 'Unread City offline ground LOD / meshoptimizer 1.1.1 + Pillow', extras: {
      ...json.asset.extras, sourceSha256: spec.sha256, upAxis: '+Y', forwardAxis: '+Z', groundY: 0,
      modifications: 'Baked complete scene graph; normalized metres, Y-up, vehicle front +Z, grounded and centered; merged materials and UV-aware welded/simplified geometry; embedded 256/512px diffuse maps; removed metallic/normal maps and T-84 display ground only. Original attribution retained; embedded license metadata not independently verified.',
    } },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: `${spec.id} grounded vehicle LOD`, mesh: 0 }],
    meshes: [{ name: `${spec.id} vehicle LOD`, primitives: [] }], materials: [], textures: [], images: [],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }],
  }
  const chunks = []
  let byteLength = 0
  const addView = (bytes, target) => {
    const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const padding = (4 - byteLength % 4) % 4
    if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding }
    const id = output.bufferViews.length
    output.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length, ...(target ? { target } : {}) })
    chunks.push(data); byteLength += data.length
    return id
  }
  const addAccessor = (data, type, componentType, target, bounds = false) => {
    const item = { bufferView: addView(data, target), componentType, count: data.length / components[type], type }
    if (bounds) {
      item.min = Array(components[type]).fill(Infinity); item.max = Array(components[type]).fill(-Infinity)
      for (let i = 0; i < data.length; i++) { const axis = i % components[type]; item.min[axis] = Math.min(item.min[axis], data[i]); item.max[axis] = Math.max(item.max[axis], data[i]) }
    }
    output.accessors.push(item); return output.accessors.length - 1
  }
  const textureTasks = []
  const textureIds = new Map()
  const stats = []
  const finalPositions = []
  for (const [id, group] of [...groups].sort((a, b) => a[0] - b[0])) {
    const material = json.materials[id]
    const pbr = material.pbrMetallicRoughness ?? {}
    const specular = material.extensions?.KHR_materials_pbrSpecularGlossiness
    const diffuse = specular?.diffuseTexture ?? pbr.baseColorTexture
    const simpleMaterial = {
      name: material.name ?? `Vehicle material ${id}`, doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: specular?.diffuseFactor ?? pbr.baseColorFactor ?? [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.88 },
      ...(material.alphaMode ? { alphaMode: material.alphaMode } : {}), ...(material.alphaCutoff === undefined ? {} : { alphaCutoff: material.alphaCutoff }),
    }
    if (diffuse) {
      if ((diffuse.texCoord ?? 0) !== 0 || diffuse.extensions) throw new Error('Unsupported texture coordinates or transform.')
      const imageId = json.textures[diffuse.index].source
      let textureId = textureIds.get(imageId)
      if (textureId === undefined) {
        const image = json.images[imageId]
        const view = json.bufferViews[image.bufferView]
        if (!view || view.buffer !== 0 || (view.byteOffset ?? 0) + view.byteLength > binary.length) throw new Error('Invalid embedded image.')
        textureId = textureTasks.length
        textureIds.set(imageId, textureId)
        const src = path.join(temporary, `${spec.id}-source-${imageId}.image`)
        const dst = path.join(temporary, `${spec.id}-texture-${imageId}.image`)
        await writeFile(src, binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength))
        textureTasks.push({ src, dst, size: spec.textureSize, imageId })
      }
      simpleMaterial.pbrMetallicRoughness.baseColorTexture = { index: textureId }
    }
    output.materials.push(simpleMaterial)
    const positions = new Float32Array(group.positions)
    const originalIndices = new Uint32Array(group.indices)
    const target = Math.min(originalIndices.length, Math.max(36, Math.floor(originalIndices.length * spec.ratio / 3) * 3))
    let [indices, error] = MeshoptSimplifier.simplifyWithAttributes(originalIndices, positions, 3,
      new Float32Array(group.uv), 2, diffuse ? [0.5, 0.5] : [0, 0], null, target, 0.025, ['Prune', 'Permissive'])
    // A thin panel is still visible geometry; never prune a whole material.
    if (indices.length === 0) { indices = originalIndices; error = 0 }
    const [remap, count] = MeshoptSimplifier.compactMesh(indices)
    const compactPositions = new Float32Array(count * 3)
    const compactNormals = new Float32Array(count * 3)
    const compactUv = new Float32Array(count * 2)
    for (let v = 0; v < remap.length; v++) {
      const to = remap[v]
      if (to >= count) continue
      compactPositions.set(positions.subarray(v * 3, v * 3 + 3), to * 3)
      compactNormals.set(group.normals.slice(v * 3, v * 3 + 3), to * 3)
      compactUv.set(group.uv.slice(v * 2, v * 2 + 2), to * 2)
    }
    const compactIndices = count <= 65535 ? new Uint16Array(indices) : indices
    output.meshes[0].primitives.push({ attributes: {
      POSITION: addAccessor(compactPositions, 'VEC3', 5126, 34962, true), NORMAL: addAccessor(compactNormals, 'VEC3', 5126, 34962),
      ...(diffuse ? { TEXCOORD_0: addAccessor(compactUv, 'VEC2', 5126, 34962) } : {}),
    }, indices: addAccessor(compactIndices, 'SCALAR', count <= 65535 ? 5123 : 5125, 34963), material: output.materials.length - 1 })
    finalPositions.push(compactPositions)
    stats.push({ sourceMaterial: id, sourceTriangles: group.sourceTriangles, triangles: indices.length / 3, vertices: count, relativeError: error })
  }
  // Simplification may remove an extreme point; ground and center the final LOD.
  const finalMin = [Infinity, Infinity, Infinity]
  const finalMax = [-Infinity, -Infinity, -Infinity]
  for (const data of finalPositions) for (let i = 0; i < data.length; i++) {
    const axis = i % 3
    finalMin[axis] = Math.min(finalMin[axis], data[i]); finalMax[axis] = Math.max(finalMax[axis], data[i])
  }
  const finalOffset = [(finalMin[0] + finalMax[0]) / 2, finalMin[1], (finalMin[2] + finalMax[2]) / 2]
  for (let p = 0; p < finalPositions.length; p++) {
    const data = finalPositions[p]
    const item = output.accessors[output.meshes[0].primitives[p].attributes.POSITION]
    item.min = [Infinity, Infinity, Infinity]; item.max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < data.length; i++) {
      const axis = i % 3
      data[i] -= finalOffset[axis]
      item.min[axis] = Math.min(item.min[axis], data[i]); item.max[axis] = Math.max(item.max[axis], data[i])
    }
  }
  const python = spawnSync(process.env.PYTHON ?? 'python', ['-c', `
import json,sys
from PIL import Image
for item in json.load(sys.stdin):
    with Image.open(item['src']) as original:
        image = original.convert('RGBA')
        image.thumbnail((item['size'], item['size']), Image.Resampling.LANCZOS)
        if image.getextrema()[3][0] < 255:
            image.quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(item['dst'], 'PNG', optimize=True)
        else:
            image.convert('RGB').save(item['dst'], 'JPEG', quality=76, optimize=True, progressive=False, subsampling=2)
`], { input: JSON.stringify(textureTasks), encoding: 'utf8', shell: false, maxBuffer: 1024 * 1024 })
  if (python.error || python.status !== 0) throw new Error(`Texture conversion failed: ${python.error?.message ?? python.stderr}`)
  for (const task of textureTasks) {
    const bytes = await readFile(task.dst)
    output.images.push({ name: `Diffuse ${task.imageId}`, bufferView: addView(bytes), mimeType: bytes[0] === 0x89 ? 'image/png' : 'image/jpeg' })
    output.textures.push({ sampler: 0, source: output.images.length - 1 })
  }
  const padding = (4 - byteLength % 4) % 4
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding }
  output.buffers[0].byteLength = byteLength
  const encoded = Buffer.from(JSON.stringify(output))
  const jsonBytes = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 0x20)])
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonBytes.length + byteLength, 8)
  header.writeUInt32LE(jsonBytes.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(byteLength, 0); binHeader.writeUInt32LE(0x004e4942, 4)
  const model = Buffer.concat([header, jsonBytes, binHeader, ...chunks])
  if (model.length > 700000) throw new Error(`${spec.id} exceeds 700,000-byte budget (${model.length}); groups=${JSON.stringify(stats)}`)
  const positionAccessors = output.meshes[0].primitives.map((p) => output.accessors[p.attributes.POSITION])
  const min = [0, 1, 2].map((axis) => Math.min(...positionAccessors.map((a) => a.min[axis])))
  const max = [0, 1, 2].map((axis) => Math.max(...positionAccessors.map((a) => a.max[axis])))
  const file = `assets/models/ground-${spec.id}.glb`
  await writeFile(path.join(root, file), model)
  return {
    id: spec.id, file, sourceFile: spec.file, sourceBytes: source.length, sourceSha256: spec.sha256, outputBytes: model.length, outputSha256: sha256(model),
    reductionPercent: +(100 * (1 - model.length / source.length)).toFixed(3), sourceTriangles, removedDisplayTriangles,
    triangles: stats.reduce((n, s) => n + s.triangles, 0), vertices: stats.reduce((n, s) => n + s.vertices, 0), primitives: stats.length,
    images: output.images.length, externalUris: 0, decoderExtensions: 0, forwardAxis: '+Z', upAxis: '+Y',
    boundsMeters: { min, max, size: max.map((value, axis) => value - min[axis]) },
    conversion: { sourceYawRadians: spec.yaw, scale: spec.scale, sourceBoundsMeters }, attribution: json.asset.extras, groups: stats,
  }
}

await MeshoptSimplifier.ready
await mkdir(path.join(root, 'assets', 'models'), { recursive: true })
const temporaryRoot = path.join(root, 'outputs')
await mkdir(temporaryRoot, { recursive: true })
const temporary = await mkdtemp(path.join(temporaryRoot, '.ground-lod-'))
try {
  const models = []
  for (const spec of sources) models.push(await convert(spec, temporary))
  const outputBytes = models.reduce((n, model) => n + model.outputBytes, 0)
  if (outputBytes > 2000000) throw new Error('Combined models exceed 2 MB.')
  const report = { sourceBytes: models.reduce((n, model) => n + model.sourceBytes, 0), outputBytes, models }
  await writeFile(path.join(root, 'outputs', 'ground-vehicle-asset-statistics.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  // Delete only the exact workspace directory returned by mkdtemp.
  if (path.dirname(temporary) === temporaryRoot && path.basename(temporary).startsWith('.ground-lod-')) await rm(temporary, { recursive: true, force: true })
}
