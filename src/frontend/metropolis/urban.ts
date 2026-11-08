import type { Facade, Layer, V3, World } from './types';
import { box, cylinder, face, line, mix, ribbon, rng, smoothPath } from './geometry';
import { isLand, riverX, terrainHeight } from './terrain';

const C = {
  asphalt: '#354851', concrete: '#bac7c2', stone: '#d7c9b0', dark: '#233e4e',
  glass: '#5c929e', gold: '#dfb978', light: '#ffe0a3', rail: '#536f7c',
  teal: '#6ac1c4', green: '#527b60', white: '#eee6d1', rust: '#b77f5f',
};
const plots = [
  { x: 4.82, z: -4.28, rx: 1.15, rz: 1.18 },
  { x: 8.12, z: -6.76, rx: 1.1, rz: .85 },
  { x: 10.98, z: -4.23, rx: 1.16, rz: 1.1 },
  { x: 2.0, z: -4.25, rx: .9, rz: 1.02 },
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
function base(x: number, z: number) { return Math.max(.68, terrainHeight(x, z)); }
function edge(w: World, points: V3[], color = C.gold, width = .018, layer: Layer = 'details', glow = 0) {
  // Cosmetic line strokes share the terrain renderer's CSS-pixel convention.
  line(w, points, color, clamp(width * 32, .45, 1.5), layer, glow);
}
function topOutline(w: World, x: number, y: number, z: number, sx: number, sz: number, color = C.gold, layer: Layer = 'buildings') {
  edge(w, [[x - sx / 2, y, z - sz / 2], [x + sx / 2, y, z - sz / 2],
    [x + sx / 2, y, z + sz / 2], [x - sx / 2, y, z + sz / 2], [x - sx / 2, y, z - sz / 2]], color, .014, layer);
}
function quad(w: World, x: number, y: number, z: number, sx: number, sz: number, color: string, layer: Layer) {
  face(w, [[x - sx / 2, y, z - sz / 2], [x - sx / 2, y, z + sz / 2],
    [x + sx / 2, y, z + sz / 2], [x + sx / 2, y, z - sz / 2]], color, layer);
}

/** A solid rectangular member, including sloping bridge legs and canopy ribs. */
function beam(w: World, a: V3, b: V3, size: number, color: string, layer: Layer, thickness = size) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz) || 1;
  const d: V3 = [dx / length, dy / length, dz / length];
  const ref: V3 = Math.abs(d[1]) > .94 ? [1, 0, 0] : [0, 1, 0];
  const u: V3 = [d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]];
  const ul = Math.hypot(...u) || 1; u[0] /= ul; u[1] /= ul; u[2] /= ul;
  const v: V3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const ring = (p: V3) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => [
    p[0] + u[0] * size * su / 2 + v[0] * thickness * sv / 2,
    p[1] + u[1] * size * su / 2 + v[1] * thickness * sv / 2,
    p[2] + u[2] * size * su / 2 + v[2] * thickness * sv / 2,
  ] as V3);
  const A = ring(a), B = ring(b);
  for (let i = 0; i < 4; i++) face(w, [A[i], A[(i + 1) % 4], B[(i + 1) % 4], B[i]], color, layer, { doubleSided: true });
  face(w, A.slice().reverse(), color, layer, { doubleSided: true });
  face(w, B, color, layer, { doubleSided: true });
}

function offsetPath(points: V3[], amount: number, lift = 0): V3[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz) || 1;
    return [p[0] - dz / length * amount, p[1] + lift, p[2] + dx / length * amount];
  });
}
function nearPath(x: number, z: number, points: V3[], radius: number) {
  return points.some(p => Math.hypot(p[0] - x, p[2] - z) < radius);
}
function groundRoad(w: World, points: [number, number][], width = .36, sidewalk = true) {
  const path = points.map(([x, z]) => [x, base(x, z) + .045, z] as V3);
  if (sidewalk) ribbon(w, path.map(p => [p[0], p[1] - .016, p[2]]), width + .17, '#9ca99b', 'roads');
  ribbon(w, path, width, C.asphalt, 'roads');
  w.lines.push({ points: path.map(p => [p[0], p[1] + .008, p[2]]), color: '#d5c9a0', width: .48, layer: 'roads', dashed: true });
}

function streetNetwork(w: World) {
  for (const x of [.6, 3.35, 6.35, 9.7, 12.5]) {
    groundRoad(w, [[x, -10.65], [x, -7.9], [x, -5.6], [x, -2.75], [x, 0], [x, 2.98]], x === 6.35 ? .49 : .31);
  }
  for (const z of [-10.65, -8.85, -7.9, -5.6, -2.75, 0, 2.98]) {
    groundRoad(w, [[.25, z], [3.35, z], [6.35, z], [9.7, z], [12.8, z]], z === -2.75 ? .48 : .32);
  }
  groundRoad(w, [[-8.85, -2.4], [-8.85, 0], [-8.85, 2.95], [-7.2, 3.45], [-4.1, 3.45]], .34);
  groundRoad(w, [[-8.85, -.15], [-5.85, -.15]], .28);
  groundRoad(w, [[-6.0, 1.95], [-6.0, 3.45]], .24);
  groundRoad(w, [[12.5, -5.6], [14.45, -5.6], [14.45, -.3], [12.5, -.3]], .27);

  // Crossings and landscaped medians stay part of the streets, never extra buildings.
  for (const x of [3.35, 6.35, 9.7]) for (const z of [-5.6, -2.75, 0]) {
    const y = base(x, z) + .057;
    for (const side of [-1, 1]) for (let n = 0; n < 5; n++) {
      quad(w, x + (n - 2) * .06, y, z + side * .33, .034, .18, '#e1d9ba', 'roads');
    }
  }
  for (let z = -7.5; z < -.5; z += .75) {
    box(w, 6.35, base(6.35, z) + .04, z, .075, .045, .45, C.green, 'details');
  }
}

function viaductPiers(w: World, path: V3[], deckWidth: number, layer: Layer, every: number, exclude?: (p: V3) => boolean) {
  let distance = 0, last = path[0];
  for (const p of path) {
    distance += Math.hypot(p[0] - last[0], p[2] - last[2]); last = p;
    if (distance < every) continue;
    distance = 0;
    if (exclude?.(p)) continue;
    const y = isLand(p[0], p[2]) ? terrainHeight(p[0], p[2]) : -.12;
    const height = p[1] - .15 - y;
    if (height < .25) continue;
    cylinder(w, p[0], y, p[2], layer === 'rail' ? .07 : .105, height, '#9bafa9', layer, 6);
    cylinder(w, p[0], y - .03, p[2], layer === 'rail' ? .14 : .21, .14, '#657f7e', layer, 8);
    box(w, p[0], p[1] - .18, p[2], .3, .11, deckWidth * .95, C.concrete, layer);
  }
}

function expressway(w: World) {
  const z = 1.15;
  const path = smoothPath([
    [-15.0, .79, z], [-12.3, 1.48, z], [-9, 2.15, z], [-5.7, 2.25, z],
    [.55, 2.25, z], [5.6, 2.18, z], [10.7, 1.9, z], [12.9, .82, z],
  ], 106);
  ribbon(w, path, 1.14, '#788d90', 'roads', .19);
  ribbon(w, path.map(p => [p[0], p[1] + .025, p[2]]), .96, '#354652', 'roads');
  for (const offset of [-.46, .46]) edge(w, offsetPath(path, offset, .05), '#c4d4cc', .024, 'roads');
  edge(w, offsetPath(path, 0, .052), C.gold, .035, 'roads');
  for (const offset of [-.23, .23]) w.lines.push({ points: offsetPath(path, offset, .055), color: '#e5d9b6', width: .5, layer: 'roads', dashed: true });
  viaductPiers(w, path, 1.12, 'roads', 1.4, p => p[0] > -5.8 && p[0] < .7);

  const towers = [-5.7, .55], deck = 2.25, crown = 7.3;
  for (const x of towers) {
    const foot = isLand(x, z) ? terrainHeight(x, z) : -.15;
    for (const side of [-1, 1]) {
      const a: V3 = [x, foot, z + side * .78], b: V3 = [x, crown, z + side * .48];
      beam(w, a, b, .23, '#d3b47e', 'roads', .31);
      box(w, x, foot - .04, a[2], .56, .26, .6, '#617d82', 'roads');
      edge(w, [[x + .125, deck + .15, z + side * .71], [x + .125, crown - .08, z + side * .48]], C.light, .03, 'roads', .26);
    }
    beam(w, [x, crown - .15, z - .48], [x, crown - .15, z + .48], .21, C.gold, 'roads');
    beam(w, [x, deck - .08, z - .75], [x, deck - .08, z + .75], .19, C.concrete, 'roads');
    beam(w, [x, crown - 1.35, z - .54], [x, crown - 1.35, z + .54], .12, '#b7a786', 'roads');
  }

  const left = towers[0], right = towers[1], middle = (left + right) / 2;
  for (const side of [-1, 1]) {
    const cable: V3[] = [];
    for (let i = 0; i <= 40; i++) {
      const x = left + (right - left) * i / 40;
      const y = 3.05 + (crown - 3.05) * ((x - middle) / ((right - left) / 2)) ** 2;
      cable.push([x, y, z + side * .51]);
      if (i > 0 && i < 40 && i % 2 === 0) edge(w, [[x, deck + .1, z + side * .51], [x, y, z + side * .51]], '#e3c897', .019, 'roads', .12);
    }
    edge(w, cable, C.light, .045, 'roads', .22);
    for (const [a, b] of [[-9.5, left], [right, 4.2]]) {
      const startIsTower = a === right;
      const sideCable: V3[] = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18, x = a + (b - a) * t;
        const u = startIsTower ? 1 - t : t;
        sideCable.push([x, deck + .16 + (crown - deck - .16) * u ** 1.65, z + side * .51]);
      }
      edge(w, sideCable, C.light, .037, 'roads', .15);
    }
    // Repeated solid trusses make the main deck read as a bridge, not a floating line.
    for (let x = left; x < right; x += .6) {
      const end = Math.min(right, x + .6);
      beam(w, [x, deck - .07, z + side * .55], [end, deck - .3, z + side * .55], .043, '#729194', 'roads');
      beam(w, [x, deck - .3, z + side * .55], [end, deck - .07, z + side * .55], .043, '#729194', 'roads');
    }
  }

  const ramps: V3[][] = [
    [[6.7, 2.18, .88], [8.9, 2.1, .7], [10.5, 1.65, -.3], [10.2, 1.2, -1.5], [8.7, .77, -1.8], [6.35, .74, -1.7]],
    [[-9.3, 2.11, 1.42], [-10.5, 1.95, 1.9], [-10.6, 1.52, 3.3], [-9.6, 1.0, 4.1], [-8.9, .75, 3.1]],
  ];
  for (const controls of ramps) {
    const curve = smoothPath(controls, 42);
    ribbon(w, curve, .48, C.asphalt, 'roads', .11);
    for (const side of [-.23, .23]) edge(w, offsetPath(curve, side, .035), '#d0d6bf', .019, 'roads');
    viaductPiers(w, curve, .48, 'roads', 1.1);
  }
  w.routes.push({ id: 'golden-tide-expressway', points: offsetPath(path, -.23, .075), color: '#f9d38c', kind: 'road', speed: 1.55, count: 19, closed: false });
  return path;
}

function railAlignment() {
  return smoothPath([
    [-7.55, 2.5, 3.35], [-8.05, 2.95, 1.15], [-8.15, 2.15, -1.8], [-7.05, 2.0, -4.2],
    [-5.1, 2.5, -6.4], [-1.4, 2.7, -8.35], [3.9, 2.18, -8.55], [8.9, 2.15, -8.2],
    [11.8, 2.08, -6.3], [12.13, 2.18, -3.85], [10.65, 2.25, -2.75], [7.0, 2.3, -2.75],
    [3.8, 2.4, -2.75], [2.15, 2.8, -.85], [2.05, 3.12, 1.2], [1.0, 2.5, 3.0],
    [-2.7, 2.15, 3.9], [-5.7, 2.17, 3.85],
  ], 190, true);
}

function station(w: World, route: V3[], tx: number, tz: number, length: number, nameSeed: number) {
  let index = 0, distance = Infinity;
  route.forEach((p, i) => { const d = Math.hypot(p[0] - tx, p[2] - tz); if (d < distance) { distance = d; index = i; } });
  const p = route[index], a = route[Math.max(0, index - 1)], b = route[Math.min(route.length - 1, index + 1)];
  const dx = b[0] - a[0], dz = b[2] - a[2], magnitude = Math.hypot(dx, dz) || 1;
  const forward: V3 = [dx / magnitude, 0, dz / magnitude], normal: V3 = [-forward[2], 0, forward[0]];
  const at = (along: number, side: number, up: number): V3 => [p[0] + forward[0] * along + normal[0] * side, p[1] + up, p[2] + forward[2] * along + normal[2] * side];
  const deck = [at(-length / 2, -.54, .04), at(length / 2, -.54, .04), at(length / 2, .54, .04), at(-length / 2, .54, .04)];
  face(w, deck, '#d6cbb0', 'rail', { doubleSided: true });
  ribbon(w, [at(-length / 2, 0, -.03), at(length / 2, 0, -.03)], 1.05, '#97afac', 'rail', .17);
  for (const side of [-.47, .47]) {
    edge(w, [at(-length / 2, side, .07), at(length / 2, side, .07)], C.light, .035, 'rail', .35);
    for (let n = 0; n <= 4; n++) beam(w, at((n / 4 - .5) * length, side, .03), at((n / 4 - .5) * length, side, .7), .045, '#c1d6d4', 'rail');
  }
  for (let span = 0; span < 5; span++) {
    const from = (span / 5 - .5) * (length + .22), to = ((span + 1) / 5 - .5) * (length + .22);
    for (let slice = 0; slice < 8; slice++) {
      const angle1 = slice / 8 * Math.PI, angle2 = (slice + 1) / 8 * Math.PI;
      const s1 = Math.cos(angle1) * .65, s2 = Math.cos(angle2) * .65;
      const y1 = .65 + Math.sin(angle1) * .28, y2 = .65 + Math.sin(angle2) * .28;
      face(w, [at(from, s1, y1), at(to, s1, y1), at(to, s2, y2), at(from, s2, y2)], slice % 2 ? '#a5c8c8' : '#dbe3d7', 'rail', { doubleSided: true });
    }
  }
  for (let n = 0; n <= 5; n++) {
    const along = (n / 5 - .5) * (length + .22), arch: V3[] = [];
    for (let j = 0; j <= 12; j++) arch.push(at(along, Math.cos(j / 12 * Math.PI) * .65, .65 + Math.sin(j / 12 * Math.PI) * .28));
    edge(w, arch, '#e2dcc8', .028, 'rail');
  }
  // Stairs and a glazed elevator land next to the guideway rather than ending in air.
  const ground = Math.max(.68, terrainHeight(p[0] + normal[0] * .8, p[2] + normal[2] * .8));
  const foot = at(-length * .28, .83, ground - p[1]);
  box(w, foot[0], ground, foot[2], .31, p[1] - ground + .52, .31, '#88adb0', 'rail', {
    facade: { columns: 2, rows: 7, seed: nameSeed, style: 'glass' },
  });
  const stairTop = at(length * .25, .8, .03), stairBottom = at(length * .25 + .94, .8, ground - p[1]);
  ribbon(w, [stairTop, stairBottom], .36, '#afbcb4', 'rail', .07);
  for (let n = 1; n < 12; n++) {
    const step = mix(stairTop, stairBottom, n / 12);
    edge(w, [[step[0] - normal[0] * .17, step[1] + .015, step[2] - normal[2] * .17], [step[0] + normal[0] * .17, step[1] + .015, step[2] + normal[2] * .17]], '#d5d7c4', .017, 'rail');
  }
  return [p[0], p[1] + 1.08, p[2]] as V3;
}

function cloudline(w: World, route: V3[]) {
  ribbon(w, route, .43, '#90a9aa', 'rail', .13);
  ribbon(w, route.map(p => [p[0], p[1] + .025, p[2]]), .34, '#526c78', 'rail');
  for (const side of [-.115, .115]) edge(w, offsetPath(route, side, .048), '#c7dfdf', .023, 'rail', .12);
  for (const side of [-.22, .22]) edge(w, offsetPath(route, side, .055), '#71cbd0', .018, 'rail', .16);
  viaductPiers(w, route, .43, 'rail', 1.25);
  // A trussed river crossing distinguishes the railway from the highway's cables.
  const riverSpan = route.filter(p => p[2] > 3.45 && p[0] > -4.8 && p[0] < .5);
  if (riverSpan.length > 2) {
    for (const side of [-.25, .25]) {
      const sidePath = offsetPath(riverSpan, side, .12);
      edge(w, sidePath.map(p => [p[0], p[1] + .55, p[2]]), '#88b8b5', .035, 'rail');
      for (let i = 0; i < sidePath.length - 1; i += 2) {
        const a = sidePath[i], b = sidePath[Math.min(i + 2, sidePath.length - 1)];
        beam(w, a, [b[0], b[1] + .55, b[2]], .035, '#7da7a7', 'rail');
      }
    }
  }
  const central = station(w, route, 7.0, -2.75, 2.75, 410);
  station(w, route, 4.0, -8.55, 2.5, 250);
  station(w, route, -7.6, 2.5, 2.25, 670);
  w.routes.push({ id: 'cloudline-orbital', points: route, color: '#a7eff0', kind: 'rail', speed: 1.08, count: 3, closed: true });
  return central;
}

function ordinaryBuilding(w: World, x: number, z: number, sx: number, sz: number, height: number, seed: number, random: () => number) {
  const y = base(x, z), podium = height > 2.9 && random() > .45;
  const glass = height > 2.3;
  const colors = glass ? ['#4d7d8a', '#67949a', '#426d80', '#799e9f', '#557d8e', '#5b8798'] : ['#c9b99d', '#b9c1b0', '#d7cbb3', '#a8b7b0', '#c1a68a', '#b6b3a1'];
  const color = colors[Math.floor(random() * colors.length)];
  const facade: Facade = { columns: clamp(Math.round(sx / .13), 2, 6), rows: clamp(Math.round(height / .23), 3, 21), seed, style: glass ? 'glass' : random() > .45 ? 'warm' : 'stone' };
  box(w, x, y - .025, z, sx + .1, .09, sz + .1, '#a9b0a0', 'buildings');
  if (podium) {
    box(w, x, y, z, sx, .38, sz, '#c2bba6', 'buildings', { facade: { ...facade, rows: 2, style: 'stone' } });
    box(w, x, y + .38, z, sx * .86, height - .38, sz * .86, color, 'buildings', { facade });
  } else box(w, x, y, z, sx, height, sz, color, 'buildings', { facade });
  const top = y + height, roofWidth = podium ? sx * .86 : sx, roofDepth = podium ? sz * .86 : sz;
  if (height > 3.25 && random() > .35) {
    box(w, x, top, z, roofWidth * .69, .32 + random() * .34, roofDepth * .72, '#67868a', 'buildings', { facade: { ...facade, columns: 3, rows: 2 } });
    topOutline(w, x, top + .02, z, roofWidth, roofDepth, '#b8c7b8');
  } else if (height < 1.6 && random() > .5) {
    const h = .24, roof = random() > .5 ? '#9e7560' : '#647d7e';
    const a: V3 = [x - sx / 2 - .035, top, z - sz / 2 - .035], b: V3 = [x + sx / 2 + .035, top, z - sz / 2 - .035];
    const c: V3 = [x + sx / 2 + .035, top, z + sz / 2 + .035], d: V3 = [x - sx / 2 - .035, top, z + sz / 2 + .035];
    const A: V3 = [a[0], top + h, z], B: V3 = [b[0], top + h, z];
    face(w, [a, A, B, b], roof, 'buildings', { doubleSided: true });
    face(w, [d, c, B, A], roof, 'buildings', { doubleSided: true });
    face(w, [a, d, A], color, 'buildings'); face(w, [b, B, c], color, 'buildings');
  } else {
    box(w, x + roofWidth * .17, top + .015, z, roofWidth * .33, .13, roofDepth * .35, '#8da09d', 'buildings');
    if (random() > .5) quad(w, x - roofWidth * .2, top + .022, z, roofWidth * .26, roofDepth * .72, '#547f65', 'buildings');
  }
}

function neighborhoods(w: World, rail: V3[]) {
  const random = rng(81479); let count = 0, parcelIndex = 0;
  // These six verified parcels intersect station structures or the west bridge footing.
  const clearings: [number, number][] = [
    [5.6133333333, -2.0216666667], [8.035, -3.4733333333], [7.165, -2.0216666667],
    [-6.97, 2.83], [-5.81, 2.2], [-5.23, 2.2],
  ];
  const add = (x: number, z: number, sx: number, sz: number, height: number) => {
    if (!isLand(x, z) || terrainHeight(x, z) < .55) return;
    if ([-1, 1].some(a => [-1, 1].some(b => !isLand(x + a * sx / 2, z + b * sz / 2)))) return;
    if (plots.some(p => Math.abs(x - p.x) < p.rx + sx / 2 && Math.abs(z - p.z) < p.rz + sz / 2)) return;
    if (nearPath(x, z, rail, Math.hypot(sx, sz) / 2 + .3)) return;
    // Clear the two descending highway ramps, including the east loop's inner plaza.
    if (x > 7.9 && x < 10.9 && z > -2.28 && z < .1) return;
    const reserved = clearings.some(([px, pz]) => Math.abs(x - px) < .005 && Math.abs(z - pz) < .005);
    // Consume the same lot-specific random choices so clearing these parcels
    // does not change any other building's dimensions, roof, colour or windows.
    const target: World = reserved ? { faces: [], lines: [], landmarks: [], routes: [] } : w;
    ordinaryBuilding(target, x, z, sx, sz, height, 700 + parcelIndex * 19, random);
    parcelIndex++;
    if (!reserved) count++;
  };
  const columns = [[.98, 3.02], [3.73, 5.99], [6.73, 9.34], [10.09, 12.16]];
  const rows = [[-7.53, -5.98], [-5.24, -3.12], [-2.35, -.38]];
  for (const [x0, x1] of columns) for (const [z0, z1] of rows) {
    for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 3; iz++) {
      const cellX = (x1 - x0) / 3, cellZ = (z1 - z0) / 3;
      const x = x0 + cellX * (ix + .5), z = z0 + cellZ * (iz + .5);
      const strength = Math.exp(-(((x - 6.1) / 5.9) ** 2) - ((z + 4.8) / 4.6) ** 2);
      const height = .7 + strength * 2.55 + random() * (1.2 + strength * .85);
      add(x, z, cellX * (.68 + random() * .16), cellZ * (.69 + random() * .15), height);
    }
  }
  for (const [x0, x1] of columns) for (let ix = 0; ix < 4; ix++) {
    const dx = (x1 - x0) / 4;
    add(x0 + dx * (ix + .5), 2.35, dx * .78, .72, .65 + random() * 1.2);
  }
  for (let ix = 0; ix < 14; ix++) for (let iz = 0; iz < 2; iz++) {
    add(.55 + ix * .82, -10.2 + iz * .71, .56 + random() * .1, .48, .6 + random() * 1.7);
  }
  for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 3; iz++) {
    add(-8.45 + ix * .67, -1.83 + iz * .55, .47, .39, .6 + random() * 1.15);
  }
  for (let ix = 0; ix < 7; ix++) for (let iz = 0; iz < 2; iz++) {
    add(-7.55 + ix * .58, 2.2 + iz * .63, .43, .43, .65 + random() * 1.3);
  }
  for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 7; iz++) {
    add(13.15 + ix * .65, -5.2 + iz * .7, .44, .46, .6 + random() * 1.5);
  }
  return count;
}

function octagonalTower(w: World, x: number, z: number, y: number, rX: number, rZ: number, height: number, color: string, seed: number, twist = 0) {
  const ring = (up: number, turn: number): V3[] => Array.from({ length: 8 }, (_, i) => {
    const a = (i + .5) / 8 * Math.PI * 2 + turn;
    return [x + Math.cos(a) * rX, y + up, z + Math.sin(a) * rZ];
  });
  const low = ring(0, 0), high = ring(height, twist);
  for (let i = 0; i < 8; i++) face(w, [low[i], high[i], high[(i + 1) % 8], low[(i + 1) % 8]], color, 'buildings', {
    doubleSided: true, facade: { columns: 3, rows: clamp(Math.round(height / .24), 3, 22), seed: seed + i, style: 'glass' },
  });
  face(w, high.slice().reverse(), '#c1cfc1', 'buildings', { doubleSided: true });
  edge(w, [...high, high[0]], '#e3c895', .018, 'buildings', .1);
}

function skyline(w: World) {
  // A stepped octagonal crown with a warm central spire, the skyline's highest point.
  const x = 4.82, z = -4.28, y = base(x, z);
  box(w, x, y, z, 2.18, .5, 2.02, '#bcc5b4', 'buildings', { facade: { columns: 10, rows: 2, seed: 24, style: 'stone' } });
  octagonalTower(w, x, z, y + .5, .92, .87, 5.05, '#52818c', 80);
  octagonalTower(w, x, z, y + 5.55, .74, .69, 1.7, '#6b939b', 96);
  octagonalTower(w, x, z, y + 7.25, .5, .47, 1.2, '#92b2b0', 112);
  cylinder(w, x, y + 8.45, z, .17, .54, '#ddcba0', 'buildings', 8, .09);
  beam(w, [x, y + 8.9, z], [x, y + 9.3, z], .035, C.light, 'buildings');
  for (let i = 0; i < 8; i++) {
    const angle = (i + .5) / 8 * Math.PI * 2;
    edge(w, [[x + Math.cos(angle) * .92, y + .52, z + Math.sin(angle) * .87],
      [x + Math.cos(angle) * .92, y + 5.56, z + Math.sin(angle) * .87]], '#d0be91', .02, 'buildings', .1);
  }
  quad(w, x - .72, y + .516, z + .6, .46, .54, C.green, 'buildings');
  quad(w, x + .72, y + .516, z - .6, .46, .54, C.green, 'buildings');

  // Three gently twisting crystal sections make a distinct, lower western tower.
  const prismX = 2.0, prismZ = -4.25, prismY = base(prismX, prismZ);
  box(w, prismX, prismY, prismZ, 1.6, .4, 1.58, '#b0c0b2', 'buildings', { facade: { columns: 7, rows: 2, seed: 312, style: 'stone' } });
  octagonalTower(w, prismX, prismZ, prismY + .4, .71, .68, 2.25, '#5a959a', 330, .13);
  octagonalTower(w, prismX, prismZ, prismY + 2.65, .66, .63, 2.15, '#5a8995', 348, -.13);
  octagonalTower(w, prismX, prismZ, prismY + 4.8, .55, .53, 1.5, '#83aead', 365, .17);
  face(w, [[prismX - .5, prismY + 6.3, prismZ], [prismX, prismY + 7.0, prismZ - .1], [prismX + .5, prismY + 6.3, prismZ], [prismX, prismY + 6.3, prismZ + .45]], '#bdcfbf', 'buildings', { doubleSided: true });

  // Twin glass slabs joined by a suspended garden bridge.
  const twinX = 10.98, twinZ = -4.23, twinY = base(twinX, twinZ);
  box(w, twinX, twinY, twinZ, 2.2, .45, 1.78, '#b0baae', 'buildings', { facade: { columns: 10, rows: 2, seed: 581, style: 'stone' } });
  for (const side of [-1, 1]) {
    const tx = twinX + side * .63, h = side < 0 ? 5.6 : 6.4;
    box(w, tx, twinY + .45, twinZ, .65, h, 1.0, side < 0 ? '#5b8798' : '#6b8da6', 'buildings', { facade: { columns: 4, rows: 22, seed: 600 + side, style: 'glass' } });
    box(w, tx, twinY + h + .45, twinZ, .58, .14, .91, '#d0c9b4', 'buildings');
    topOutline(w, tx, twinY + h + .6, twinZ, .57, .9);
  }
  box(w, twinX, twinY + 4.8, twinZ, 1.8, .36, .62, '#8eb4bb', 'buildings', { facade: { columns: 8, rows: 2, seed: 620, style: 'glass' } });
  quad(w, twinX, twinY + 5.18, twinZ, 1.7, .53, '#648c68', 'buildings');
  topOutline(w, twinX, twinY + 5.2, twinZ, 1.78, .6, '#e8c782');

  // Observation tower: a narrow shaft, structural outriggers and a luminous ring crown.
  const ox = 8.12, oz = -6.76, oy = base(ox, oz);
  cylinder(w, ox, oy, oz, .83, .33, '#b9c6b4', 'buildings', 12, .73);
  octagonalTower(w, ox, oz, oy + .33, .32, .32, 5.35, '#628997', 890);
  for (const [dx, dz] of [[-.67, -.4], [.67, -.4], [0, .68]]) beam(w, [ox + dx, oy + .35, oz + dz], [ox + dx * .35, oy + 4.9, oz + dz * .35], .095, '#bacdc3', 'buildings');
  cylinder(w, ox, oy + 5.54, oz, .42, .4, '#a6c2ba', 'buildings', 16, .95);
  octagonalTower(w, ox, oz, oy + 5.94, .92, .92, .62, '#80b1b8', 910);
  cylinder(w, ox, oy + 6.56, oz, 1.0, .13, '#d8cbaa', 'buildings', 20, .91);
  cylinder(w, ox, oy + 6.69, oz, .5, .5, '#abc7c0', 'buildings', 16, .27);
  cylinder(w, ox, oy + 7.19, oz, .075, .9, '#e2cf9f', 'buildings', 6, .03);
  for (const level of [oy + 5.95, oy + 6.67]) {
    const circle: V3[] = Array.from({ length: 33 }, (_, i) => [ox + Math.cos(i / 32 * Math.PI * 2) * .95, level, oz + Math.sin(i / 32 * Math.PI * 2) * .95]);
    edge(w, circle, '#f3d697', .028, 'buildings', .3);
  }
}

function yacht(w: World, x: number, z: number, length: number, yaw: number) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const p = (a: number, y: number, b: number): V3 => [x + a * cs + b * sn, y, z - a * sn + b * cs];
  const hull = [p(-length * .38, .13, -.16), p(length * .33, .13, -.15), p(length * .54, .13, 0), p(length * .33, .13, .15), p(-length * .38, .13, .16)];
  face(w, hull, '#e6dfcb', 'details', { doubleSided: true });
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    face(w, [a, b, [b[0], .02, b[2]], [a[0], .02, a[2]]], '#638d99', 'details', { doubleSided: true });
  }
  face(w, [p(-length * .18, .35, -.1), p(length * .19, .35, -.1), p(length * .19, .35, .1), p(-length * .18, .35, .1)], '#e8ebdb', 'details', { doubleSided: true });
  for (const side of [-1, 1]) face(w, [p(-length * .2, .14, side * .11), p(-length * .16, .34, side * .1), p(length * .19, .34, side * .1), p(length * .25, .14, side * .11)], '#4d778b', 'details', { doubleSided: true });
  edge(w, [p(-length * .12, .34, 0), p(-length * .12, .64, 0)], '#ded5ba', .018, 'details');
}

function waterfront(w: World) {
  const x = 10.25, z = 3.72, y = .72;
  box(w, x, .23, z + .12, 4.0, .48, 1.85, '#6f9093', 'buildings');
  box(w, x, y, z, 3.5, .2, 1.55, '#d3cbb5', 'buildings');
  box(w, x, y + .2, z + .12, 2.95, .55, 1.17, '#6d9ea8', 'buildings', { facade: { columns: 16, rows: 3, seed: 1019, style: 'glass' } });
  // Three overlapping sail shells: curved ridge lines and solid white roof facets.
  for (let petal = 0; petal < 3; petal++) {
    const cx = x - 1.02 + petal * 1.01, cz = z - .02 + (petal % 2) * .17;
    const length = 1.35, shellHeight = petal === 1 ? 1.85 : 1.4;
    for (let band = 0; band < 10; band++) {
      const t0 = band / 10, t1 = (band + 1) / 10;
      const cross = (t: number, side: number): V3 => [cx + side * .54 * Math.sin(Math.PI * t) ** .65, y + .6 + shellHeight * Math.sin(Math.PI * t) + side * .1, cz + (t - .5) * length];
      for (const side of [-1, 1]) face(w, [cross(t0, 0), cross(t1, 0), cross(t1, side), cross(t0, side)], band % 3 === 0 ? '#d8dfd1' : '#eee7d2', 'buildings', { doubleSided: true });
    }
    const ridge: V3[] = Array.from({ length: 17 }, (_, i) => [cx, y + .6 + shellHeight * Math.sin(Math.PI * i / 16), cz + (i / 16 - .5) * length]);
    edge(w, ridge, '#f4d99e', .025, 'buildings', .12);
  }
  for (let i = 0; i < 6; i++) {
    box(w, x - 1.85 + i * .74, .12, z + .84, .14, .6, .14, '#8da6a3', 'details');
  }
  // Waterfront steps and an illuminated promenade descend towards the marina.
  for (let i = 0; i < 5; i++) box(w, x - .2, .12 + i * .11, z + 1.06 - i * .12, 3.5, .11, .27, '#c6c5b2', 'details');
  edge(w, [[8.15, .74, 4.6], [11.9, .74, 4.6]], C.light, .03, 'details', .35);
  const pier: V3[] = [[12.0, .52, 4.25], [12.0, .52, 6.8], [8.65, .52, 6.8]];
  ribbon(w, pier, .36, '#a99a7d', 'details', .14);
  for (let z1 = 4.5; z1 <= 6.8; z1 += .48) for (const side of [-1, 1]) cylinder(w, 12.0 + side * .13, -.18, z1, .045, .68, '#5d7376', 'details', 5);
  for (let x1 = 8.8; x1 <= 11.7; x1 += .62) {
    ribbon(w, [[x1, .5, 6.8], [x1, .5, 5.75]], .17, '#aa9f87', 'details', .08);
    cylinder(w, x1, -.15, 6.73, .05, .65, '#526d76', 'details', 5);
    yacht(w, x1 - .25, 6.15, .88, Math.PI / 2);
  }
  yacht(w, 13.1, 7.2, 1.45, -.3);
  w.routes.push({ id: 'bay-waterbus', points: smoothPath([[-9, .13, 8.25], [-4.2, .13, 7.15], [1.8, .13, 7.2], [6.3, .13, 8.1], [11.0, .13, 7.85]], 80), color: '#e5dcc4', kind: 'boat', speed: .34, count: 2, closed: false });
  return [x, y + 2.65, z] as V3;
}

function civicDetails(w: World) {
  // A riverside boardwalk follows the actual river, not an unrelated decorative curve.
  const promenade: V3[] = [];
  for (let i = 0; i <= 27; i++) {
    const z = -5.8 + i * .33, x = riverX(z) + 1.38;
    if (isLand(x, z)) promenade.push([x, Math.max(.64, terrainHeight(x, z)) + .05, z]);
  }
  ribbon(w, promenade, .2, '#c3baa1', 'details', .045);
  edge(w, offsetPath(promenade, -.1, .16), '#b9cbbd', .016, 'details');
  // Street lamps form restrained pools of warm light; no additional point lights.
  for (let n = 0; n < 24; n++) {
    const x = n < 12 ? .39 + n * 1.1 : 12.76;
    const z = n < 12 ? .28 : -7.6 + (n - 12) * .82;
    if (!isLand(x, z)) continue;
    const y = base(x, z);
    beam(w, [x, y, z], [x, y + .43, z], .022, '#778c8c', 'details');
    box(w, x, y + .43, z, .095, .045, .095, '#f4dca9', 'details', { glow: .65 });
  }
  // Circular civic plaza at the base of the eastern interchange.
  cylinder(w, 9.2, .7, -1.1, .72, .04, '#b9c1ad', 'details', 24);
  cylinder(w, 9.2, .75, -1.1, .44, .075, '#729d9e', 'details', 24);
  cylinder(w, 9.2, .83, -1.1, .34, .02, '#6db6be', 'water', 24);
  beam(w, [9.2, .83, -1.1], [9.2, 1.3, -1.1], .04, '#dce5d0', 'details');
}

/** An authored metropolitan composition: stable geometry and three independent transit routes. */
export function buildUrban(world: World) {
  const firstFace = world.faces.length, firstLine = world.lines.length;
  const rail = railAlignment();
  streetNetwork(world);
  expressway(world);
  const centralStation = cloudline(world, rail);
  const ordinaryCount = neighborhoods(world, rail);
  skyline(world);
  const artCenter = waterfront(world);
  civicDetails(world);

  world.landmarks.push(
    { id: 'aurelion', name: '凌云金融中心', en: 'AURELION TOWER', category: '城市天际线',
      description: '三重退台将城市的高度推向云端。八角玻璃立面迎接海湾晨光，塔冠的暖金色线条沿着空中花园缓缓升起。',
      position: [4.82, 10.02, -4.28], camera: { target: [4.82, 4.3, -4.28], yaw: -.62, pitch: .59, distance: 18 }, accent: '#e6c389' },
    { id: 'golden-tide', name: '金潮跨湾大桥', en: 'GOLDEN TIDE BRIDGE', category: '悬索桥与高架',
      description: '两座金色门塔撑起河口上空的悬索。车流从西岸街区越过水面，再沿弧形匝道滑入都会街网；桥下，轻轨与海湾航线各有自己的节奏。',
      position: [-2.6, 4.85, 1.15], camera: { target: [-2.7, 2.25, 1.15], yaw: -.74, pitch: .55, distance: 18.5 }, accent: '#f0c782' },
    { id: 'cloudline', name: '云环中央车站', en: 'CLOUDLINE CENTRAL', category: '空中轻轨',
      description: '银色列车沿独立的高架环线穿过楼群，越过河流与海湾入口。弧形玻璃雨棚、临空站台和连接街面的楼梯，共同组成城市的空中客厅。',
      position: centralStation, camera: { target: [6.8, 2.8, -2.8], yaw: -.35, pitch: .76, distance: 21.5 }, accent: '#97d9dc' },
    { id: 'shell-harbour', name: '贝屿艺术中心', en: 'SHELL HARBOUR', category: '滨水文化地标',
      description: '三瓣白色帆壳面向海湾展开，玻璃长廊连接展厅与水边阶梯。木栈桥向游艇港延伸，远处的水上巴士在光影之间缓缓经过。',
      position: artCenter, camera: { target: [10.1, 1.05, 4.8], yaw: -.64, pitch: .58, distance: 13.5 }, accent: '#e8d6ad' },
    { id: 'amber-quarter', name: '西岸琥珀街区', en: 'AMBER QUARTER', category: '河岸城市生活',
      description: '低矮街屋、温暖屋顶与细密街巷在桥塔旁层层铺开。这里是山地、河口与繁华东岸之间的一段从容过渡。',
      position: [-6.55, 2.55, 2.55], camera: { target: [-6.55, 1.0, 2.35], yaw: -.48, pitch: .74, distance: 12.5 }, accent: '#d6ab83' },
    { id: 'orbit-observatory', name: '星环观景塔', en: 'ORBIT OBSERVATORY', category: '云端观景',
      description: '环形观景舱悬在修长塔身之上，三道支撑从广场向空中汇合。登高望去，山脊、玻璃天际线、金色桥缆与整片海湾同时入画。',
      position: [8.12, 8.83, -6.76], camera: { target: [8.12, 3.8, -6.76], yaw: .44, pitch: .57, distance: 15.7 }, accent: '#c1d9c6' },
    { id: 'dusk-ridge', name: '暮岭山脊', en: 'DUSK RIDGELINE', category: '山地与海湾',
      description: '层叠山脊从森林深处升起，溪流沿山谷汇入城市河道。转过山肩，天际线、跨湾大桥与海面同时展开，都会因此拥有了完整的远近层次。',
      position: [-12.4, 8.1, -8.4], camera: { target: [-12, 3.3, -7.2], yaw: -.85, pitch: .65, distance: 21 }, accent: '#acbe9e' },
  );
  return { buildings: ordinaryCount + 6, faces: world.faces.length - firstFace, lines: world.lines.length - firstLine };
}
