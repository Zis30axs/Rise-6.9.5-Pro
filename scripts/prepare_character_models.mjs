import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { MeshoptSimplifier } from 'meshoptimizer/simplifier'

// Offline LOD output uses ordinary GLB buffers/images: no runtime decoder or URL.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.argv.length !== 3) throw new Error('Usage: node scripts/prepare_character_models.mjs <prepared temporary directory>')
const temporary = path.resolve(process.argv[2])
const outputDirectory = path.join(root, 'assets/characters')
const sources = JSON.parse(await readFile(path.join(temporary, 'sources.json'), 'utf8'))
const specs = {
  soyo: { triangles: 22000, height: 1.62, yaw: 0 },
  deepseek: { triangles: 23000, height: 1.65, yaw: Math.PI, arm: 65 },
  xiaoyang: { triangles: 28000, height: 1.62, yaw: Math.PI, arm: 70 },
  claude: { triangles: 60000, height: 1.05, yaw: 0 },
}
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const components = { 5120: [Int8Array, 'getInt8'], 5121: [Uint8Array, 'getUint8'], 5122: [Int16Array, 'getInt16'], 5123: [Uint16Array, 'getUint16'], 5125: [Uint32Array, 'getUint32'], 5126: [Float32Array, 'getFloat32'] }
const sha256 = (data) => createHash('sha256').update(data).digest('hex')

function readGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB header')
  const jsonLength = bytes.readUInt32LE(12)
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(24 + jsonLength) !== 0x004e4942) throw new Error('Invalid GLB chunks')
  const data = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
  const binary = bytes.subarray(28 + jsonLength)
  if (data.buffers.length !== 1 || data.buffers[0].byteLength > binary.length || data.buffers[0].uri || data.images.some((item) => item.uri)) throw new Error('Only self-contained GLB is accepted')
  return { data, binary }
}

function readAccessor(data, binary, index) {
  const a = data.accessors[index]
  const view = data.bufferViews[a?.bufferView]
  const component = components[a?.componentType]
  const width = widths[a?.type]
  if (!a || !view || view.buffer !== 0 || !component || !width || a.sparse || !Number.isInteger(a.count) || a.count < 1) throw new Error('Unsupported accessor')
  const [Type, method] = component
  const size = Type.BYTES_PER_ELEMENT
  const stride = view.byteStride ?? width * size
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
  if (stride < width * size || start < 0 || start + (a.count - 1) * stride + width * size > (view.byteOffset ?? 0) + view.byteLength || (view.byteOffset ?? 0) + view.byteLength > binary.length) throw new Error('Accessor exceeds buffer view')
  const result = new Type(a.count * width)
  const dv = new DataView(binary.buffer, binary.byteOffset, binary.byteLength)
  for (let row = 0; row < a.count; row++) for (let column = 0; column < width; column++) {
    const value = dv[method](start + row * stride + column * size, true)
    if (!Number.isFinite(value)) throw new Error('Nonfinite attribute')
    result[row * width + column] = value
  }
  return result
}

function writer(data) {
  const chunks = []
  let byteLength = 0
  data.bufferViews = []; data.accessors = []; data.buffers = [{ byteLength: 0 }]
  function view(raw, target) {
    const bytes = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
    const pad = (4 - byteLength % 4) % 4
    if (pad) { chunks.push(Buffer.alloc(pad)); byteLength += pad }
    const id = data.bufferViews.length
    data.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, ...(target ? { target } : {}) })
    chunks.push(bytes); byteLength += bytes.length
    return id
  }
  function accessor(array, original, target, bounds = false) {
    const item = { bufferView: view(array, target), componentType: original.componentType, count: array.length / widths[original.type], type: original.type, ...(original.normalized ? { normalized: true } : {}) }
    if (bounds) {
      const width = widths[item.type]
      item.min = Array(width).fill(Infinity); item.max = Array(width).fill(-Infinity)
      for (let i = 0; i < array.length; i++) {
        item.min[i % width] = Math.min(item.min[i % width], array[i]); item.max[i % width] = Math.max(item.max[i % width], array[i])
      }
    }
    data.accessors.push(item)
    return data.accessors.length - 1
  }
  function finish() {
    data.buffers[0].byteLength = byteLength
    const json = Buffer.from(JSON.stringify(data), 'utf8')
    const jsonPad = Buffer.alloc((4 - json.length % 4) % 4, 0x20)
    const binPad = Buffer.alloc((4 - byteLength % 4) % 4)
    const header = Buffer.alloc(20)
    header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4)
    header.writeUInt32LE(28 + json.length + jsonPad.length + byteLength + binPad.length, 8)
    header.writeUInt32LE(json.length + jsonPad.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
    const binHeader = Buffer.alloc(8)
    binHeader.writeUInt32LE(byteLength + binPad.length, 0); binHeader.writeUInt32LE(0x004e4942, 4)
    return Buffer.concat([header, json, jsonPad, binHeader, ...chunks, binPad])
  }
  return { view, accessor, finish }
}

function pose(data, spec) {
  for (const node of data.nodes) if (spec.arm && ['UpperArm_L', 'UpperArm_R'].includes(node.name)) {
    const angle = spec.arm / 180 * Math.PI * (node.name.endsWith('_L') ? 1 : -1)
    node.rotation = new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle)).toArray()
  }
}

function bounds(data, binary) {
  const world = new Map()
  const walk = (id, parent, ancestors) => {
    if (ancestors.has(id) || !data.nodes[id]) throw new Error('Invalid or cyclic node hierarchy')
    const node = data.nodes[id]
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3().fromArray(node.translation ?? [0, 0, 0]), new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]), new Vector3().fromArray(node.scale ?? [1, 1, 1]))
    const matrix = parent.clone().multiply(local)
    world.set(id, matrix)
    for (const child of node.children ?? []) walk(child, matrix, new Set(ancestors).add(id))
  }
  for (const id of data.scenes[data.scene ?? 0].nodes) walk(id, new Matrix4(), new Set())
  const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const [id, matrix] of world) {
    const node = data.nodes[id]
    if (node.mesh === undefined) continue
    const skin = node.skin === undefined ? null : data.skins[node.skin]
    const ibm = skin ? readAccessor(data, binary, skin.inverseBindMatrices) : null
    const boneMatrices = skin?.joints.map((joint, i) => world.get(joint).clone().multiply(new Matrix4().fromArray(ibm, i * 16)))
    for (const primitive of data.meshes[node.mesh].primitives) {
      const p = readAccessor(data, binary, primitive.attributes.POSITION)
      const joints = skin ? readAccessor(data, binary, primitive.attributes.JOINTS_0) : null
      const weights = skin ? readAccessor(data, binary, primitive.attributes.WEIGHTS_0) : null
      for (let i = 0; i < p.length / 3; i++) {
        const vertex = new Vector3().fromArray(p, i * 3)
        let v = vertex.clone().applyMatrix4(matrix)
        if (skin) {
          v = new Vector3()
          for (let k = 0; k < 4; k++) {
            const weight = weights[i * 4 + k]
            if (weight > 0) {
              const transform = boneMatrices[joints[i * 4 + k]]
              if (!transform) throw new Error('Invalid skin joint')
              v.add(vertex.clone().applyMatrix4(transform).multiplyScalar(weight))
            }
          }
        }
        min.min(v); max.max(v)
      }
    }
  }
  return { min: min.toArray(), max: max.toArray(), height: max.y - min.y }
}

await MeshoptSimplifier.ready
await mkdir(outputDirectory, { recursive: true })
const manifest = []
for (const source of sources) {
  const { data: input, binary } = readGlb(await readFile(path.join(temporary, `${source.id}.glb`)))
  const spec = specs[source.id]
  const data = structuredClone(input)
  const out = writer(data)
  data.animations = []
  delete data.extensionsRequired
  const primitiveStats = []
  let totalTriangles = 0, totalVertices = 0
  for (let m = 0; m < input.meshes.length; m++) for (let p = 0; p < input.meshes[m].primitives.length; p++) {
    const original = input.meshes[m].primitives[p]
    if ((original.mode ?? 4) !== 4 || original.extensions || original.targets) throw new Error('Unsupported primitive')
    const positions = readAccessor(input, binary, original.attributes.POSITION)
    const indices = new Uint32Array(readAccessor(input, binary, original.indices))
    if (indices.length % 3 || indices.some((i) => i >= positions.length / 3)) throw new Error('Invalid triangles')
    const uv = original.attributes.TEXCOORD_0 === undefined ? new Float32Array(positions.length / 3 * 2) : new Float32Array(readAccessor(input, binary, original.attributes.TEXCOORD_0))
    const target = Math.max(36, Math.floor(indices.length * Math.min(1, spec.triangles / source.triangles) / 3) * 3)
    // The scan-derived Claude atlas contains many tiny UV islands: crossing their
    // seams makes visible triangular stripes. Preserve both seams and normals:
    // UV-only simplification left polygon-shaped shading on the small chin.
    let simplifyAttributes = uv
    let attributeWidth = 2
    let attributeWeights = [0.7, 0.7]
    if (source.id === 'claude') {
      const normals = readAccessor(input, binary, original.attributes.NORMAL)
      attributeWidth = 5; attributeWeights = [2, 2, 0.8, 0.8, 0.8]
      simplifyAttributes = new Float32Array(positions.length / 3 * attributeWidth)
      for (let i = 0; i < positions.length / 3; i++) {
        simplifyAttributes.set(uv.subarray(i * 2, i * 2 + 2), i * attributeWidth)
        simplifyAttributes.set(normals.subarray(i * 3, i * 3 + 3), i * attributeWidth + 2)
      }
    }
    let [reduced, error] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, simplifyAttributes, attributeWidth, attributeWeights, null, target, source.id === 'claude' ? 0.008 : source.id === 'soyo' ? 0.012 : 0.025, source.id === 'claude' ? [] : ['Permissive'])
    if (!reduced.length) { reduced = indices; error = 0 }
    const [remap, count] = MeshoptSimplifier.compactMesh(reduced)
    const attributes = {}
    for (const [semantic, accessorId] of Object.entries(original.attributes)) {
      if (!['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'].includes(semantic)) continue
      const originalAccessor = input.accessors[accessorId]
      const array = readAccessor(input, binary, accessorId)
      const width = widths[originalAccessor.type]
      const compact = new array.constructor(count * width)
      for (let i = 0; i < remap.length; i++) if (remap[i] < count) compact.set(array.subarray(i * width, (i + 1) * width), remap[i] * width)
      attributes[semantic] = out.accessor(compact, originalAccessor, 34962, semantic === 'POSITION')
    }
    const compactIndices = count <= 65535 ? new Uint16Array(reduced) : reduced
    data.meshes[m].primitives[p] = { attributes, indices: out.accessor(compactIndices, { componentType: count <= 65535 ? 5123 : 5125, type: 'SCALAR' }, 34963), material: original.material }
    primitiveStats.push({ mesh: m, primitive: p, triangles: reduced.length / 3, vertices: count, error })
    totalTriangles += reduced.length / 3; totalVertices += count
  }
  for (let i = 0; i < (input.skins?.length ?? 0); i++) {
    const a = input.skins[i].inverseBindMatrices
    data.skins[i].inverseBindMatrices = out.accessor(readAccessor(input, binary, a), input.accessors[a])
  }
  for (let i = 0; i < input.images.length; i++) {
    const v = input.bufferViews[input.images[i].bufferView]
    data.images[i].bufferView = out.view(binary.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength))
  }
  pose(data, spec)
  const before = readGlb(out.finish())
  const rawBounds = bounds(before.data, before.binary)
  const scale = spec.height / rawBounds.height
  const center = new Vector3((rawBounds.min[0] + rawBounds.max[0]) / 2, rawBounds.min[1], (rawBounds.min[2] + rawBounds.max[2]) / 2)
  center.multiplyScalar(-scale).applyAxisAngle(new Vector3(0, 1, 0), spec.yaw)
  const wrapperId = data.nodes.length
  data.nodes.push({ name: `${source.id}_Grounded`, children: data.scenes[data.scene ?? 0].nodes, translation: center.toArray(), scale: [scale, scale, scale], rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), spec.yaw).toArray() })
  data.scenes[data.scene ?? 0].nodes = [wrapperId]
  data.asset.generator = 'Unread City offline character LOD / meshoptimizer 1.1.1 + Pillow'
  data.asset.extras = { ...data.asset.extras, sourceArchive: source.archive, sourceArchiveSha256: source.archiveSha256, upAxis: '+Y', forwardAxis: '+Z', groundY: 0, displayHeightMeters: spec.height, modifications: 'Diffuse texture resize; UV-aware simplification; morphs, MMD physics and VRM runtime extensions omitted; bone skinning retained; relaxed standing arm pose; normalized dimensions and grounding. No source scripts or external resources run.' }
  const bytes = out.finish()
  const verify = readGlb(bytes)
  for (let i = 0; i < verify.data.accessors.length; i++) readAccessor(verify.data, verify.binary, i)
  const finalBounds = bounds(verify.data, verify.binary)
  if (Math.abs(finalBounds.min[1]) > 0.0001 || Math.abs(finalBounds.height - spec.height) > 0.0001) throw new Error('Normalization failed')
  await writeFile(path.join(outputDirectory, `${source.id}.glb`), bytes)
  const { bonesInfo, humanoid, ...record } = source
  manifest.push({ ...record, output: `${source.id}.glb`, bytes: bytes.length, sha256: sha256(bytes), triangles: totalTriangles, vertices: totalVertices, sourceTriangles: source.triangles, sourceVertices: source.vertices, bounds: finalBounds, pose: source.id === 'claude' ? 'Original static standing pose; source has no rig' : 'Relaxed standing; arm bones lowered; original rig retained without IK/physics', forwardAxis: '+Z', upAxis: '+Y', skins: data.skins?.length ?? 0, animationClips: 0, textures: data.images.length, meshPrimitives: primitiveStats.length, primitiveStats })
  console.log(`${source.id}: ${bytes.length} bytes, ${totalTriangles} triangles, ${totalVertices} vertices, ${source.bones} bones`)
}
await writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify({ generatedOn: '2026-10-18', tool: 'prepare_character_models.py + prepare_character_models.mjs', models: manifest, totalBytes: manifest.reduce((n, m) => n + m.bytes, 0), originalModelBytes: manifest.reduce((n, m) => n + m.sourceModelBytes, 0) }, null, 2) + '\n')
