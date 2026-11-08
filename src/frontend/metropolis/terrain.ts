import { face, line, ribbon, rng } from './geometry';
import type { V3, World } from './types';

/** Scenic coordinates only. Water is y=0; the buildable urban plateau is y=.68. */
export const TERRAIN_BOUNDS = { minX: -17, maxX: 17, minZ: -13, maxZ: 12 } as const;
const GROUND = .68;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = (lo: number, hi: number, v: number) => {
  const t = clamp((v - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};
const bell = (v: number) => Math.exp(-v * v);

export function riverX(z: number): number { return -3.25 + 1.65 * Math.sin(z * .42); }
function riverHalfWidth(z: number): number {
  return 1.02 + .27 * (.5 + .5 * Math.sin(z * .55 + .7)) + .18 * smooth(0, 5, z);
}
function coastZ(x: number): number {
  return 5.25 + .65 * Math.sin(x * .43) + .28 * Math.sin(x * .97)
    - 1.55 * bell((x + 2.3) / 3) + 1.1 * bell((x + 12.4) / 3);
}
function leftEdge(z: number): number { return -16.6 + .27 * Math.sin(z * .73) + .16 * Math.sin(z * 1.37); }
function rightEdge(z: number): number { return 16.35 - .17 * Math.sin(z * .4) - 3.05 * bell((z - 1.6) / 2.3); }
function backEdge(x: number): number { return -12.65 + .18 * Math.sin(x * .55) + .1 * Math.cos(x * 1.03); }
function landMargin(x: number, z: number): number {
  return Math.min(x - leftEdge(z), rightEdge(z) - x, z - backEdge(x), coastZ(x) - z,
    Math.abs(x - riverX(z)) - riverHalfWidth(z));
}
export function isLand(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && landMargin(x, z) > 0;
}
function hash(x: number, z: number): number {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return v - Math.floor(v);
}
function noise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(0, 1, x - ix), fz = smooth(0, 1, z - iz);
  const a = hash(ix, iz) * (1 - fx) + hash(ix + 1, iz) * fx;
  const b = hash(ix, iz + 1) * (1 - fx) + hash(ix + 1, iz + 1) * fx;
  return a * (1 - fz) + b * fz;
}
function mountainHeight(x: number, z: number): number {
  const mask = (1 - smooth(-9.8, -7.4, x)) * (1 - smooth(-5.3, -2.4, z));
  if (!mask) return 0;
  const main = 7.05 * Math.exp(-(((x + 12.45) / 2.85) ** 2 + ((z + 8.4) / 3.6) ** 2));
  const northern = 6.2 * Math.exp(-(((x + 9.7) / 1.85) ** 2 + ((z + 11.1) / 2.05) ** 2));
  const western = 4.9 * Math.exp(-(((x + 15.4) / 2.15) ** 2 + ((z + 5.1) / 2.75) ** 2));
  const spur = 3.15 * Math.exp(-(((x + 10.5) / 2.5) ** 2 + ((z + 4.7) / 1.9) ** 2));
  const ridges = 1 - Math.abs(noise(x * .93, z * .93) * 2 - 1);
  const crags = noise(x * 2.3 + 11, z * 2.3) - .5;
  return Math.max(main, northern, western, spur) * mask * (.83 + .17 * ridges)
    + mask * .28 * crags * smooth(.5, 3, Math.max(main, northern, western));
}
function surfaceHeight(x: number, z: number): number {
  const coastDrop = .43 * (1 - smooth(0, .85, coastZ(x) - z));
  const bankDrop = .13 * (1 - smooth(0, .34, Math.abs(x - riverX(z)) - riverHalfWidth(z)));
  const inletDrop = .32 * (1 - smooth(0, .65, rightEdge(z) - x));
  return Math.max(.19, GROUND + mountainHeight(x, z) - coastDrop - bankDrop - inletDrop);
}
export function terrainHeight(x: number, z: number): number {
  return isLand(x, z) ? surfaceHeight(x, z) : 0;
}

type Point = { x: number; z: number; margin: number; edge?: boolean };
type Boundary = { a: Point; b: Point; kind: 'coast' | 'river' | 'cut' | 'inlet' };
function point(x: number, z: number, sign = 1): Point { return { x, z, margin: landMargin(x, z) * sign }; }
function intersection(a: Point, b: Point, sign: number): Point {
  let lo = 0, hi = 1;
  for (let n = 0; n < 13; n++) {
    const t = (lo + hi) / 2;
    const margin = landMargin(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) * sign;
    if ((margin > 0) === (a.margin > 0)) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, margin: 0, edge: true };
}
/** Clip small triangles against the analytic shore, rather than stair-stepping cells. */
function clip(points: Point[], sign = 1): Point[] {
  const out: Point[] = [];
  for (let n = 0; n < points.length; n++) {
    const a = points[n], b = points[(n + 1) % points.length];
    if (a.margin > 0) out.push(a);
    if ((a.margin > 0) !== (b.margin > 0)) out.push(intersection(a, b, sign));
  }
  return out;
}
function classifyBoundary(x: number, z: number): Boundary['kind'] {
  if (Math.abs(Math.abs(x - riverX(z)) - riverHalfWidth(z)) < .045) return 'river';
  if (Math.abs(coastZ(x) - z) < .045) return 'coast';
  if (Math.abs(rightEdge(z) - x) < .045) return 'inlet';
  return 'cut';
}
function colorMix(a: string, b: string, amount: number): string {
  const t = clamp(amount);
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const channel = (shift: number) => Math.round(((A >> shift) & 255) * (1 - t) + ((B >> shift) & 255) * t);
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
}
function groundColor(x: number, z: number, h: number): string {
  const slope = Math.hypot(surfaceHeight(x + .15, z) - surfaceHeight(x - .15, z), surfaceHeight(x, z + .15) - surfaceHeight(x, z - .15)) / .3;
  const tint = noise(x * 1.6, z * 1.6);
  if (coastZ(x) - z < .7 && h < 1) return colorMix('#c8b18a', '#e3cfab', tint);
  if (h > 6.1) return colorMix('#aab0a2', '#eee9d8', smooth(6.1, 7.4, h) * .8 + tint * .12);
  if (h > 3.25 || slope > 1.1) return colorMix('#6f8271', '#aeaa8e', clamp((h - 2) / 4 + slope * .17 + tint * .13));
  if (h > 1.05) return colorMix('#426d5d', '#82956d', tint * .6 + (h - 1) * .07);
  if (x < -8.5) return colorMix('#6b936e', '#91ac7c', tint * .7);
  return colorMix('#839d88', '#a4af94', tint * .32);
}
function landMesh(w: World): Boundary[] {
  const boundaries: Boundary[] = [];
  const step = .72;
  for (let z = -13; z < 7; z += step) for (let x = -17; x < 17; x += step) {
    const X = Math.min(17, x + step), Z = Math.min(7, z + step);
    const a = point(x, z), b = point(X, z), c = point(X, Z), d = point(x, Z);
    // Alternating diagonals avoid an obvious repeated mountain grid.
    const triangles = ((Math.round((x + 17) / step) + Math.round((z + 13) / step)) & 1)
      ? [[a, d, b], [b, d, c]] : [[a, d, c], [a, c, b]];
    for (const tri of triangles) {
      const polygon = clip(tri);
      if (polygon.length < 3) continue;
      const coords: V3[] = polygon.map(p => [p.x, surfaceHeight(p.x, p.z), p.z]);
      for (let k = 1; k < coords.length - 1; k++) {
        const pts = [coords[0], coords[k], coords[k + 1]];
        const cx = pts.reduce((v, p) => v + p[0], 0) / 3, cz = pts.reduce((v, p) => v + p[2], 0) / 3;
        face(w, pts, groundColor(cx, cz, surfaceHeight(cx, cz)), 'terrain', { doubleSided: true });
      }
      for (let k = 0; k < polygon.length; k++) {
        const p = polygon[k], q = polygon[(k + 1) % polygon.length];
        if (p.edge && q.edge && Math.hypot(p.x - q.x, p.z - q.z) > .004)
          boundaries.push({ a: p, b: q, kind: classifyBoundary((p.x + q.x) / 2, (p.z + q.z) / 2) });
      }
    }
  }
  return boundaries;
}
function inwardNormal(p: Point): [number, number] {
  const dx = landMargin(p.x + .02, p.z) - landMargin(p.x - .02, p.z);
  const dz = landMargin(p.x, p.z + .02) - landMargin(p.x, p.z - .02);
  const length = Math.hypot(dx, dz) || 1;
  return [dx / length, dz / length];
}
function shorePoint(p: Point, distance: number, water = false): V3 {
  const [nx, nz] = inwardNormal(p), x = p.x + nx * distance, z = p.z + nz * distance;
  return [x, water ? .013 : surfaceHeight(x, z) + .014, z];
}
function shoreDetails(w: World, edges: Boundary[]): void {
  const rockColors = ['#475b56', '#6d7970', '#9a997f', '#b1a384'];
  for (const { a, b, kind } of edges) {
    const ah = surfaceHeight(a.x, a.z), bh = surfaceHeight(b.x, b.z);
    const fractions = [0, .23, .51, .82, 1];
    for (let k = 0; k < 4; k++) {
      let lowerA = -.93 + (ah + .93) * fractions[k], upperA = -.93 + (ah + .93) * fractions[k + 1];
      let lowerB = -.93 + (bh + .93) * fractions[k], upperB = -.93 + (bh + .93) * fractions[k + 1];
      if (kind !== 'cut') { const waterline = kind === 'river' ? .008 : .002; if (Math.max(upperA,upperB) <= waterline) continue; lowerA=Math.max(lowerA,waterline);lowerB=Math.max(lowerB,waterline);upperA=Math.max(upperA,waterline);upperB=Math.max(upperB,waterline); }
      const color = kind === 'river' ? ['#3c6869', '#668780', '#899a87', '#a5ae98'][k] : rockColors[k];
      face(w, [[a.x, lowerA, a.z], [b.x, lowerB, b.z], [b.x, upperB, b.z], [a.x, upperA, a.z]], color, 'terrain', { doubleSided: true });
    }
    if (kind === 'cut') {
      if (Math.max(ah, bh) > 2) {
        for (const t of [.23, .51, .82]) line(w, [[a.x, -.93 + (ah + .93) * t, a.z], [b.x, -.93 + (bh + .93) * t, b.z]], '#b4b49b', .45, 'details');
      }
      continue;
    }
    const wetA = shorePoint(a, -.18, true), wetB = shorePoint(b, -.18, true);
    face(w, [shorePoint(a, 0, true), wetA, wetB, shorePoint(b, 0, true)], '#79bbb1', 'water', { doubleSided: true });
    if (kind === 'river') {
      line(w, [shorePoint(a, .1), shorePoint(b, .1)], '#bdc6ac', .65, 'details');
      continue;
    }
    if (kind === 'coast' && (a.x < -7.5 || a.x > -.1)) {
      face(w, [shorePoint(a, .04), shorePoint(a, .48), shorePoint(b, .48), shorePoint(b, .04)], '#d5c19b', 'terrain', { doubleSided: true });
    }
    // A real raised stone edge follows the urban waterfront and the eastern inlet.
    if ((kind === 'coast' && a.x > .3) || kind === 'inlet') {
      const p = shorePoint(a, .55), q = shorePoint(b, .55);
      face(w, [[p[0], p[1] - .17, p[2]], [q[0], q[1] - .17, q[2]], q, p], '#a2aea0', 'details', { doubleSided: true });
      line(w, [p, q], '#ddd4b9', .95, 'details');
    }
  }
}
function waterColor(x: number, z: number): string {
  const distance = Math.max(0, -landMargin(x, z));
  const deep = smooth(.15, 5.5, distance);
  const base = colorMix('#459b9d', '#21546c', deep);
  return colorMix(base, '#7ebdb7', noise(x * .8 + 4, z * .8) * .075);
}
function waterMesh(w: World): void {
  const step = 1.5;
  for (let z = -13; z < 12; z += step) for (let x = -17; x < 17; x += step) {
    const X = Math.min(17, x + step), Z = Math.min(12, z + step);
    const a = point(x, z, -1), b = point(X, z, -1), c = point(X, Z, -1), d = point(x, Z, -1);
    if ([a, b, c, d].every(p => p.margin > 0)) {
      face(w, [[x, 0, z], [x, 0, Z], [X, 0, Z], [X, 0, z]], waterColor((x + X) / 2, (z + Z) / 2), 'water', { doubleSided: true });
      continue;
    }
    for (const tri of [[a, d, c], [a, c, b]]) {
      const polygon = clip(tri, -1);
      if (polygon.length < 3) continue;
      const cx = polygon.reduce((n, p) => n + p.x, 0) / polygon.length, cz = polygon.reduce((n, p) => n + p.z, 0) / polygon.length;
      face(w, polygon.map(p => [p.x, 0, p.z] as V3), waterColor(cx, cz), 'water', { doubleSided: true });
    }
  }
  // Three contiguous ribbons keep the winding river unbroken at any mesh resolution.
  for (let z = -13; z < 5.2; z += .38) {
    const Z = Math.min(5.2, z + .38), a = riverX(z), b = riverX(Z), wa = riverHalfWidth(z), wb = riverHalfWidth(Z);
    for (let k = 0; k < 3; k++) {
      const left = -1 + k * 2 / 3, right = -1 + (k + 1) * 2 / 3;
      face(w, [[a + wa * left, .006, z], [b + wb * left, .006, Z], [b + wb * right, .006, Z], [a + wa * right, .006, z]], k === 1 ? '#367c89' : '#529c9e', 'water', { doubleSided: true });
    }
  }
  const random = rng(62123);
  for (let k = 0; k < 85; k++) {
    const x = -16 + random() * 32, z = 4.6 + random() * 6.9, length = .18 + random() * .65;
    if (landMargin(x, z) > -.42 || isLand(x + length, z)) continue;
    line(w, [[x, .024, z], [x + length * .48, .024, z + .018], [x + length, .024, z]], k % 4 ? '#5d9ea7' : '#a0c3ba', k % 4 ? .55 : .85, 'water');
  }
}
function displayBase(w: World): void {
  const footprint: [number, number][] = [[-17, -12.35], [-16.35, -13], [16.35, -13], [17, -12.35], [17, 11.35], [16.35, 12], [-16.35, 12], [-17, 11.35]];
  // The top is completely covered by land and water. Omitting this very large
  // hidden polygon also avoids a centroid painter sort covering the far shore.
  for (let k = 0; k < footprint.length; k++) {
    const a = footprint[k], b = footprint[(k + 1) % footprint.length];
    face(w, [[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], -.94, b[1]], [a[0], -.94, a[1]]], '#254e60', 'water', { doubleSided: true });
    face(w, [[a[0], -.94, a[1]], [b[0], -.94, b[1]], [b[0], -1.52, b[1]], [a[0], -1.52, a[1]]], '#223237', 'terrain', { doubleSided: true });
  }
  for (const [height, color, width] of [[-.94, '#bcaa7d', 1.05], [-1.46, '#526365', .7], [.003, '#7baba8', .55]] as const)
    line(w, [...footprint, footprint[0]].map(([x, z]) => [x, height, z] as V3), color, width, 'details');
  for (let x = -15; x <= 15; x += 1.25) line(w, [[x, -1.08, 12.004], [x, x % 2.5 === 0 ? -1.29 : -1.19, 12.004]], '#8b9a91', .55, 'details');
}
function canopy(w: World, x: number, z: number, height: number, seed: number, pine: boolean): void {
  const y = surfaceHeight(x, z), radius = height * (pine ? .25 : .32);
  const colors = pine ? ['#345e4b', '#416f52', '#53815c'] : ['#4f805b', '#649767', '#7ba775', '#3e7054'];
  line(w, [[x, y, z], [x, y + height * .7, z]], '#74694f', .8, 'nature');
  if (pine) {
    for (let tier = 0; tier < 2; tier++) {
      const base = y + height * (.23 + tier * .29), tip = y + height * (.79 + tier * .24), r = radius * (1 - tier * .28);
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI * 2 / 3 + seed, b = (k + 1) * Math.PI * 2 / 3 + seed;
        face(w, [[x + Math.cos(a) * r, base, z + Math.sin(a) * r], [x, tip, z], [x + Math.cos(b) * r, base, z + Math.sin(b) * r]], colors[(k + tier) % colors.length], 'nature', { doubleSided: true });
      }
    }
  } else {
    const ring: V3[] = [];
    for (let k = 0; k < 4; k++) {
      const angle = k * Math.PI / 2 + seed;
      ring.push([x + Math.cos(angle) * radius, y + height * .64, z + Math.sin(angle) * radius]);
    }
    for (let k = 0; k < 4; k++) {
      const a = ring[k], b = ring[(k + 1) % 4];
      face(w, [a, [x, y + height, z], b], colors[(k + Math.floor(seed)) % colors.length], 'nature', { doubleSided: true });
      face(w, [b, [x, y + height * .34, z], a], colors[(k + 1) % colors.length], 'nature', { doubleSided: true });
    }
  }
}
function greenSpaces(w: World): void {
  const centerX = -12.1, centerZ = 1.1;
  const oval: V3[] = [], path: V3[] = [];
  for (let k = 0; k <= 52; k++) {
    const angle = k / 52 * Math.PI * 2, x = centerX + 2.65 * Math.cos(angle), z = centerZ + 2.35 * Math.sin(angle);
    path.push([x, surfaceHeight(x, z) + .025, z]);
    if (k < 52 && k % 4 === 0) oval.push([x, surfaceHeight(x, z) + .012, z]);
  }
  face(w, oval.reverse(), '#8aa977', 'nature', { doubleSided: true });
  ribbon(w, path, .12, '#d3c7a6', 'nature');
  const trail: V3[] = [];
  const trailPoints = [[-13.1, -1.35], [-14.8, -2.3], [-13.8, -3.45], [-15.1, -4.35], [-13.1, -5.3], [-14.0, -6.25], [-12.5, -7.75]];
  for (let i = 0; i < trailPoints.length - 1; i++) for (let j = 0; j < 5; j++) {
    const t = j / 5, x = trailPoints[i][0] * (1 - t) + trailPoints[i + 1][0] * t, z = trailPoints[i][1] * (1 - t) + trailPoints[i + 1][1] * t;
    trail.push([x, surfaceHeight(x, z) + .035, z]);
  }
  ribbon(w, trail, .075, '#bcb397', 'nature');
  const random = rng(12098), placed: [number, number][] = [];
  for (let attempts = 0; attempts < 15000 && placed.length < 250; attempts++) {
    const group = placed.length;
    let x: number, z: number;
    if (group < 95) { x = -16.05 + random() * 6.8; z = -2.6 + random() * 7.7; }
    else if (group < 180) { x = -15.8 + random() * 7.5; z = -12.1 + random() * 8.3; }
    else if (group < 225) {
      z = -11.8 + random() * 15.1;
      x = riverX(z) + (random() > .52 ? 1 : -1) * (riverHalfWidth(z) + .45 + random() * .52);
      if (Math.abs(z - 1.15) < .8 || Math.abs(z + 2.75) < .55 || Math.abs(z + 8.5) < .45) continue;
      if (x > -8 && x < -3.8 && z > -2.2 && z < 3.3) continue;
    } else { x = -.5 + random() * 13; z = -12.1 + random() * 2.3; }
    if (x < -10.7 && Math.abs(z - 1.15) < 1.0) continue;
    if (z < -9.8 && (Math.abs(z + 10.65) < .55 || [.6,3.35,6.35,9.7,12.5].some(roadX => Math.abs(x-roadX)<.38))) continue;
    if (landMargin(x, z) < .35 || surfaceHeight(x, z) > 4.65) continue;
    if (Math.hypot(surfaceHeight(x + .2, z) - surfaceHeight(x - .2, z), surfaceHeight(x, z + .2) - surfaceHeight(x, z - .2)) > .9) continue;
    if (placed.some(p => Math.hypot(x - p[0], z - p[1]) < .31)) continue;
    const ovalDistance = Math.abs(Math.hypot((x - centerX) / 2.65, (z - centerZ) / 2.35) - 1);
    if (ovalDistance < .06) continue;
    placed.push([x, z]);
    canopy(w, x, z, .48 + random() * .56, random() * 6.28, group >= 95 && group < 180 || random() < .35);
  }
  // Low coastal outcrops give the open bay a natural foreground scale cue.
  for (let k = 0; k < 12; k++) {
    const x = -15.2 + random() * 6.9, z = coastZ(x) + .35 + random() * .8;
    const r = .12 + random() * .24, h = .12 + random() * .35;
    for (let n = 0; n < 5; n++) {
      const a = n / 5 * Math.PI * 2, b = (n + 1) / 5 * Math.PI * 2;
      face(w, [[x + Math.cos(a) * r, -.02, z + Math.sin(a) * r], [x + r * .12, h, z], [x + Math.cos(b) * r, -.02, z + Math.sin(b) * r]], n % 2 ? '#9da38c' : '#768c7b', 'terrain', { doubleSided: true });
    }
  }
}

/** Fine clipped land, geological sides, layered water, and exactly 250 seeded trees. */
export function buildTerrain(world: World): void {
  displayBase(world);
  waterMesh(world);
  const boundaries = landMesh(world);
  shoreDetails(world, boundaries);
  greenSpaces(world);
}
