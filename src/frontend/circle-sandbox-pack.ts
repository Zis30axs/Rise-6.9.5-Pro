import circlePackDataUrl from '../../assets/circle-livehouse/packs/unread-city-circle-sandbox.zip?offline-pack';

export const CIRCLE_PACK_ARCHIVE = 'assets/circle-livehouse/packs/unread-city-circle-sandbox.zip';
export const CIRCLE_PACK_PAYLOAD_SHA256 = 'f7423c15e2f380616c6b3d0126a8920bb87aecedacf79160f376053f5cc7d8a4';
export const CIRCLE_PACK_MANIFEST_SHA256 = 'fe9f51c48bb646657c181276a286d59b369f07c1b6d92d3c70a1237eff8a6946';
export const CIRCLE_PACK_ZIP_SHA256 = '26487ff90b96df10fa51243f71afb47935b4ebbe6ab657ad3f18d78d8e0136c7';
export const CIRCLE_PACK_ZIP_BYTES = 3106;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** Synchronous SHA-256 so the sand-table module can reject a bad pack before the first frame. */
export function sha256Hex(input: Uint8Array): string {
  const bitLength = input.length * 8;
  const pad = (64 - ((input.length + 1 + 8) % 64)) % 64;
  const data = new Uint8Array(input.length + 1 + pad + 8);
  data.set(input);
  data[input.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(data.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(data.length - 4, bitLength >>> 0);
  const words = new Uint32Array(64);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotr(words[index - 15]!, 7) ^ rotr(words[index - 15]!, 18) ^ (words[index - 15]! >>> 3);
      const s1 = rotr(words[index - 2]!, 17) ^ rotr(words[index - 2]!, 19) ^ (words[index - 2]! >>> 10);
      words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choose + SHA256_K[index]! + words[index]!) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map(value => value.toString(16).padStart(8, '0')).join('');
}

export interface CircleSandboxDistrict {
  id: string;
  name: string;
  shortName: string;
  description: string;
  x: number;
  z: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  color: number;
}
export interface CircleSandboxLandmark {
  id: string;
  name: string;
  subtitle: string;
  district: string;
  x: number;
  z: number;
  desc: string;
  services: readonly { id: string; label: string; minutes: number; price: number }[];
}
export interface CircleSandboxBuilding {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  floors: number;
  color: string;
  roofType: string;
  roomId: string;
}
export interface CircleSandboxRoad {
  x: number;
  z: number;
  width: number;
  depth: number;
  kind: string;
  rotationY?: number;
}
export interface CircleSandboxOverlay {
  schema: 'unread-city-circle-sandbox-v1';
  districts: readonly CircleSandboxDistrict[];
  landmarks: readonly CircleSandboxLandmark[];
  buildings: readonly CircleSandboxBuilding[];
  roads: readonly CircleSandboxRoad[];
}

function zipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  const earliest = Math.max(0, bytes.byteLength - 22 - 65535);
  for (let index = bytes.byteLength - 22; index >= earliest; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50 && index + 22 + view.getUint16(index + 20, true) === bytes.byteLength) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error('CiRCLE 资源包找不到有效结束记录');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('CiRCLE 资源包不支持多卷 ZIP');
  const count = view.getUint16(end + 10, true);
  if (count !== view.getUint16(end + 8, true)) throw new Error('CiRCLE 资源包文件数量不一致');
  const size = view.getUint32(end + 12, true);
  const offset = view.getUint32(end + 16, true);
  if (offset === 0xffffffff || size === 0xffffffff || count === 0xffff) throw new Error('CiRCLE 资源包不支持 ZIP64');
  const entries = new Map<string, Uint8Array>();
  const decode = new TextDecoder('utf-8', { fatal: true });
  let at = offset;
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > bytes.byteLength || view.getUint32(at, true) !== 0x02014b50) throw new Error('CiRCLE 资源包目录已损坏');
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const unpacked = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decode.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (flags & 1 || method !== 0 || packed !== unpacked || local === 0xffffffff) {
      throw new Error('CiRCLE 资源包只能使用未加密、无压缩的标准 ZIP');
    }
    if (!/^(manifest\.json|assets\/[0-9a-f]{64})$/.test(name) || entries.has(name)) throw new Error('CiRCLE 资源包路径或文件重复');
    if (view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 8, true) !== 0) throw new Error('CiRCLE 资源包数据头错误');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + packed > bytes.byteLength) throw new Error('CiRCLE 资源包数据越界');
    entries.set(name, bytes.subarray(start, start + packed));
    at += 46 + nameLength + extra + comment;
  }
  if (at !== offset + size) throw new Error('CiRCLE 资源包目录长度不一致');
  return entries;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('CiRCLE 资源包字段无效：' + label);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || /https?:\/\//i.test(value)) throw new Error('CiRCLE 资源包字段无效：' + label);
  return value;
}

function parseOverlay(bytes: Uint8Array): CircleSandboxOverlay {
  const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Partial<CircleSandboxOverlay>;
  if (parsed.schema !== 'unread-city-circle-sandbox-v1') throw new Error('CiRCLE 资源包图式不匹配');
  const districts = parsed.districts ?? [];
  const landmarks = parsed.landmarks ?? [];
  const buildings = parsed.buildings ?? [];
  const roads = parsed.roads ?? [];
  if (districts.length !== 1 || districts[0]?.id !== 'circle') throw new Error('CiRCLE 资源包缺少现场屋城区');
  if (landmarks.length !== 1 || landmarks[0]?.id !== 'circle' || landmarks[0]?.district !== 'circle') {
    throw new Error('CiRCLE 资源包缺少现场屋图钉');
  }
  if (buildings.length < 1 || roads.length < 1) throw new Error('CiRCLE 资源包缺少几何');
  for (const building of buildings) {
    text(building.id, 'building.id');
    text(building.color, 'building.color');
    if (!/^#[0-9a-fA-F]{6}$/.test(building.color)) throw new Error('CiRCLE 建筑颜色无效');
    finite(building.x, 'building.x');
    finite(building.height, 'building.height');
  }
  return parsed as CircleSandboxOverlay;
}

function loadCircleSandboxOverlay(dataUrl: string): CircleSandboxOverlay {
  const bytes = readLocalAssetBytesSync(dataUrl);
  if (bytes.byteLength !== CIRCLE_PACK_ZIP_BYTES || sha256Hex(bytes) !== CIRCLE_PACK_ZIP_SHA256) {
    throw new Error('CiRCLE 资源包校验失败');
  }
  const entries = zipEntries(bytes);
  const manifest = entries.get('manifest.json');
  if (!manifest || sha256Hex(manifest) !== CIRCLE_PACK_MANIFEST_SHA256) throw new Error('CiRCLE 资源包清单校验失败');
  const manifestJson = JSON.parse(new TextDecoder().decode(manifest)) as {
    schema?: string;
    assets?: { sha256?: string; bytes?: number; path?: string; mime?: string }[];
  };
  const asset = manifestJson.assets?.[0];
  if (manifestJson.schema !== 'unread-city-lite-assets-v1' || manifestJson.assets?.length !== 1
    || asset?.sha256 !== CIRCLE_PACK_PAYLOAD_SHA256 || asset.mime !== 'application/json'
    || asset.path !== 'assets/' + CIRCLE_PACK_PAYLOAD_SHA256) {
    throw new Error('CiRCLE 资源包清单不匹配');
  }
  const payload = entries.get(asset.path);
  if (!payload || payload.byteLength !== asset.bytes || sha256Hex(payload) !== asset.sha256) {
    throw new Error('CiRCLE 沙盘数据校验失败');
  }
  return parseOverlay(payload);
}

/** readLocalAssetBytes is async at the network boundary; a data URL is pure and synchronous. */
function readLocalAssetBytesSync(source: string): Uint8Array<ArrayBuffer> {
  const inline = /^data:[^;,]*;base64,([A-Za-z0-9+/=]+)$/.exec(source);
  if (!inline) throw new Error('CiRCLE 资源包必须内嵌在本地数据地址中');
  if (inline[1].length > 200_000) throw new Error('CiRCLE 资源包体积异常');
  const binary = atob(inline[1]);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export const circleSandboxOverlay = loadCircleSandboxOverlay(circlePackDataUrl);
