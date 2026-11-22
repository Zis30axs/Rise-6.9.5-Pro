import * as T from 'three';
import {
  allEnclosures,
  campusAngle,
  campusAt,
  campusEnclosure,
  communityById,
  distance,
  closest,
  contains,
  groundHeight,
  local,
  mid,
  nodes,
  rand,
  scenery,
  sections,
  sites,
  streets,
  type Point,
  type Site,
} from './plan';

const distanceToStreet = (p: Point, a: Point, b: Point) =>
  distance(p, closest(p, a, b));
type V = [number, number, number];
interface Batch {
  position: number[];
  color: number[];
  uv: number[];
  owner: number[];
}
const climates = [
  '#e9e6d9',
  '#d1dadd',
  '#e3c5b2',
  '#c7d6d6',
  '#e2d5bd',
  '#bccdd1',
];
function facade(type: string, night = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const c = canvas.getContext('2d')!;
  const glass = type === 'glass',
    brick = type === 'brick',
    paper = type === 'timber';
  c.fillStyle = night
    ? '#101824'
    : glass
      ? '#9baeb5'
      : brick
        ? '#c7ab96'
        : paper
          ? '#caae87'
          : '#d6d6ca';
  c.fillRect(0, 0, 128, 128);
  if (!night) {
    for (let i = 0; i < 350; i++) {
      c.fillStyle = i % 2 ? '#ffffff16' : '#26373212';
      c.fillRect(rand(i + 9) * 128, rand(i + 43) * 128, 2, 1);
    }
    if (brick)
      for (let row = 0; row < 16; row++) {
        c.fillStyle = '#edf0da55';
        c.fillRect(0, row * 8, 128, 1);
        for (let col = 0; col < 8; col++)
          c.fillRect(col * 20 + (row % 2) * 10, row * 8, 1, 8);
      }
    if (paper)
      for (let i = 0; i < 8; i++) {
        c.fillStyle = '#715c4d';
        c.fillRect(i * 17, 0, 2, 128);
      }
  }
  for (let floor = 0; floor < 2; floor++)
    for (let j = 0; j < 3; j++) {
      const x = j * 42 + (glass ? 1 : 5),
        y = floor * 64 + (glass ? 1 : 10),
        w = glass ? 40 : 32,
        h = glass ? 59 : 38;
      c.fillStyle = night ? '#272e36' : '#50626b';
      c.fillRect(x, y, w, h);
      const lit = (j + floor * 2) % 3 !== 0;
      const grad = c.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, night ? (lit ? '#ffe1a0' : '#233745') : '#b9d6da');
      grad.addColorStop(
        0.49,
        night ? (lit ? '#eec782' : '#213642') : '#90acb5'
      );
      grad.addColorStop(
        0.51,
        night ? (lit ? '#e9c483' : '#203443') : '#7796a4'
      );
      grad.addColorStop(1, night ? (lit ? '#cc9562' : '#243a4a') : '#527785');
      c.fillStyle = grad;
      c.fillRect(x + 2, y + 2, w - 4, h - 4);
      c.fillStyle = night ? '#46505a' : '#d0dbd7';
      c.fillRect(x + w * 0.53, y + 1, 2, h - 2);
      c.fillRect(x + 1, y + h * 0.66, w - 2, 2);
      if (!glass) {
        c.fillStyle = night ? '#474441' : '#f0e6d3';
        c.fillRect(x - 2, y + h, w + 4, 3);
        c.fillStyle = night ? '#2f3135' : '#919688';
        c.fillRect(x, y + h + 3, w, 2);
      }
    }
  const tex = new T.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
export function cityModel(native = new Map<string, T.Object3D>()) {
  const root = new T.Group();
  root.name = 'Tokyo-continuous-city';
  const batches = new Map<string, Batch>(),
    cache = new Map<string, T.Color>();
  let current = 0;
  const owners = ['', ...sites.map((s) => s.key)];
  function tri(
    a: V,
    b: V,
    c: V,
    color: string,
    mat = 'solid',
    uv = [0, 0, 1, 0, 1, 1]
  ) {
    let g = batches.get(mat);
    if (!g) {
      g = { position: [], color: [], uv: [], owner: [] };
      batches.set(mat, g);
    }
    let col = cache.get(color);
    if (!col) {
      col = new T.Color(color);
      cache.set(color, col);
    }
    g.position.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) g.color.push(col.r, col.g, col.b);
    g.uv.push(...uv);
    g.owner.push(current);
  }
  function top(poly: Point[], h: number, color: string) {
    for (let i = 1; i < poly.length - 1; i++)
      tri(
        [poly[0][0], h, poly[0][1]],
        [poly[i + 1][0], h, poly[i + 1][1]],
        [poly[i][0], h, poly[i][1]],
        color
      );
  }
  function ribbon(
    a: Point,
    b: Point,
    w: number,
    h: number,
    color: string,
    hb = h
  ) {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      l = Math.hypot(dx, dz) || 1,
      u = (-dz * w) / l / 2,
      v = (dx * w) / l / 2;
    const p: V = [a[0] + u, h, a[1] + v],
      q: V = [a[0] - u, h, a[1] - v],
      r: V = [b[0] - u, hb, b[1] - v],
      s: V = [b[0] + u, hb, b[1] + v];
    tri(p, r, q, color);
    tri(p, s, r, color);
  }
  const doc =
    typeof document !== 'undefined' &&
    typeof CanvasRenderingContext2D !== 'undefined';
  function prism(
    poly: Point[],
    base: number,
    h: number,
    color: string,
    roof = color,
    mat = 'solid'
  ) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      const A: V = [a[0], base, a[1]],
        B: V = [b[0], base, b[1]],
        C: V = [b[0], base + h, b[1]],
        D: V = [a[0], base + h, a[1]];
      const u = Math.max(
          1,
          Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) / 8)
        ),
        v = Math.max(0.5, Math.round(h / 5));
      tri(A, D, C, color, mat, [0, 0, 0, v, u, v]);
      tri(A, C, B, color, mat, [0, 0, u, v, u, 0]);
    }
    top(poly, base + h, roof);
  }
  function circle(x: number, z: number, r: number, rz = r, n = 9): Point[] {
    return Array.from({ length: n }, (_, i) => [
      x + r * Math.cos((i * 2 * Math.PI) / n),
      z + rz * Math.sin((i * 2 * Math.PI) / n),
    ]);
  }
  function crown(
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    color: string,
    n = 8
  ) {
    const ring = circle(x, z, r, r * 0.9, n),
      upper = circle(x - 0.11 * r, z + 0.06 * r, r * 0.73, r * 0.68, n);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a: V = [ring[i][0], y + h * 0.23, ring[i][1]];
      const b: V = [ring[j][0], a[1], ring[j][1]],
        c: V = [upper[j][0], y + h * 0.77, upper[j][1]],
        d: V = [upper[i][0], y + h * 0.77, upper[i][1]];
      tri(a, d, c, color);
      tri(a, c, b, color);
      tri(d, [x - r * 0.13, y + h, z], c, color);
      tri(a, b, [x, y, z], color);
    }
  }
  function tree(x: number, z: number, size: number, seed: number, base = 0) {
    top(
      circle(x + 0.65 * size, z + 0.4 * size, size * 1.05, size * 0.66, 8),
      base + 0.12,
      '#94a38b'
    );
    prism(
      circle(x, z, size * 0.1, size * 0.1, 5),
      base,
      size * 1.23,
      '#847462'
    );
    const pink = seed % 9 < 2,
      leaf = pink
        ? '#dda4a2'
        : ['#769a83', '#77986e', '#688b7a', '#86a978'][seed % 4];
    crown(x, base + size * 0.71, z, size, size * 1.65, leaf);
    crown(
      x - 0.35 * size,
      base + size * 1.3,
      z + 0.1 * size,
      size * 0.67,
      size * 1.2,
      pink ? '#f1c9bd' : '#a2bc89',
      6
    );
  }
  const lampLocations: T.Vector3[] = [];
  root.userData.streetlampPositions = lampLocations;
  // One land surface. The river, embankments and bridges share the very same sampled banks.
  top(
    [
      [-340, -276],
      [438, -276],
      [438, 362],
      [-340, 362],
    ],
    -0.26,
    '#c9cab8'
  );
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1],
      b = sections[i];
    top([a.left, a.right, b.right, b.left], 0.05, '#70a6ac');
    for (const [p, q] of [
      [a.left, b.left],
      [a.right, b.right],
    ]) {
      ribbon(p, q, 5.6, 0.2, '#93a58e');
      ribbon(p, q, 2, 0.26, '#d3ceaf');
    }
    const railA = mid(a.left, a.right, 0.82),
      railB = mid(b.left, b.right, 0.82);
    ribbon(railA, railB, 2.2, 2.85, '#878f8b');
    for (const off of [-0.55, 0.55])
      ribbon(
        [railA[0] + off, railA[1]],
        [railB[0] + off, railB[1]],
        0.13,
        2.9,
        '#d0d0be'
      );
    for (const t of [0.23, 0.7]) {
      const p = mid(railA, railB, t);
      prism(circle(...p, 0.52, 0.63, 6), 0.08, 2.7, '#a0ada7');
    }
    for (let j = 0; j < 7; j++) {
      const p = mid(
        mid(a.left, b.left, rand(i * 19 + j)),
        mid(a.right, b.right, rand(i * 19 + j)),
        0.12 + 0.76 * rand(i * 31 + j)
      );
      ribbon(
        p,
        [p[0] + 1.5 + rand(i + j) * 3, p[1] + 0.2],
        0.17,
        0.1,
        '#aad0c9'
      );
    }
  }
  // A softly rounded mountain is part of the same world surface.
  for (let z = -239; z < -93; z += 4)
    for (let x = -71; x < 79; x += 4) {
      const v = (u: number, w: number): V => [u, groundHeight(u, w) - 0.09, w];
      if (groundHeight(x, z) + groundHeight(x + 4, z + 4) < 0.12) continue;
      const h = groundHeight(x, z),
        col = h > 19 ? '#91a883' : h > 8 ? '#99b092' : '#b4c3a1';
      tri(v(x, z), v(x + 4, z + 4), v(x + 4, z), col);
      tri(v(x, z), v(x, z + 4), v(x + 4, z + 4), col);
    }
  // Unified university campus ground, central quadrangle, and low brick perimeter walls.
  {
    const cRect = (u0: number, v0: number, u1: number, v1: number): Point[] => [
      campusAt(u0, v0),
      campusAt(u1, v0),
      campusAt(u1, v1),
      campusAt(u0, v1),
    ];
    top(campusEnclosure, 0.23, '#9db88a');
    top(cRect(0.32, 0.22, 0.63, 0.38), 0.265, '#dcd3bc');
    top(cRect(0.34, 0.52, 0.62, 0.60), 0.265, '#dfd7c1');
    top(cRect(0.41, 0.74, 0.55, 0.942), 0.268, '#ded5be');
    top(cRect(0.24, 0.32, 0.31, 0.58), 0.26, '#d9d0b8');
    // Central quad lawn medallion with stone curb
    top(cRect(0.36, 0.27, 0.44, 0.34), 0.28, '#8fae7c');
    top(cRect(0.52, 0.27, 0.60, 0.34), 0.28, '#8fae7c');
    // Perimeter brick-and-stone campus walls with openings at South, West, and East gates
    const wallSeg = (a: Point, b: Point) => {
      const len = distance(a, b);
      if (len < 1) return;
      const dx = (b[0] - a[0]) / len,
        dz = (b[1] - a[1]) / len,
        nx = -dz * 0.35,
        nz = dx * 0.35;
      const wPoly: Point[] = [
        [a[0] + nx, a[1] + nz],
        [b[0] + nx, b[1] + nz],
        [b[0] - nx, b[1] - nz],
        [a[0] - nx, a[1] - nz],
      ];
      prism(wPoly, 0.22, 1.35, '#b8987e', '#e1dac6');
      const steps = Math.max(2, Math.round(len / 12));
      for (let k = 0; k <= steps; k++) {
        const p = mid(a, b, k / steps);
        prism(circle(p[0], p[1], 0.46, 0.46, 6), 0.22, 1.75, '#d9d1bc', '#ebe4d0');
      }
    };
    const [nw, ne, se, sw] = campusEnclosure;
    wallSeg(nw, ne);
    wallSeg(ne, mid(ne, se, 0.67));
    wallSeg(mid(ne, se, 0.79), se);
    wallSeg(se, mid(se, sw, 0.42));
    wallSeg(mid(se, sw, 0.62), sw);
    wallSeg(sw, mid(sw, nw, 0.21));
    wallSeg(mid(sw, nw, 0.33), nw);
    // Flanking academic annexes (West Research Hall & East Humanities Hall)
    const annex = (u: number, v: number, aw: number, ad: number, ah: number, tone: string) => {
      const [cx, cz] = campusAt(u, v),
        ca = Math.cos(campusAngle),
        sa = Math.sin(campusAngle);
      const pt = (x: number, z: number): Point => [cx + ca * x - sa * z, cz + sa * x + ca * z];
      const r = (x: number, z: number, rw: number, rd: number): Point[] => [
        pt(x - rw / 2, z - rd / 2),
        pt(x + rw / 2, z - rd / 2),
        pt(x + rw / 2, z + rd / 2),
        pt(x - rw / 2, z + rd / 2),
      ];
      top(r(0, 0, aw + 1.2, ad + 1.2), 0.26, '#d4ccb8');
      prism(r(0, 0, aw, ad), 0.26, ah, tone, '#dfd8c6', 'stone');
      prism(r(0, 0, aw * 1.03, ad * 1.03), 0.26 + ah, 0.35, '#e6dfc9');
      prism(r(0, 0, aw * 0.9, ad * 0.88), 0.61 + ah, 0.2, '#86958e');
      prism(r(0, ad * 0.48, aw * 0.38, 1.2), 0.26, 2.4, '#e5ddc7');
    };
    annex(0.16, 0.145, 19, 11.5, 10.5, '#cbbda4');
    annex(0.81, 0.145, 19, 11.5, 9.5, '#c1ccb8');
    // Ginkgo avenue & campus grove trees
    const campusTrees: [number, number, number, number][] = [
      [0.425, 0.82, 1.45, 11],
      [0.535, 0.82, 1.45, 12],
      [0.425, 0.67, 1.5, 13],
      [0.535, 0.67, 1.5, 14],
      [0.37, 0.30, 1.35, 15],
      [0.58, 0.30, 1.35, 16],
      [0.14, 0.72, 1.6, 17],
      [0.21, 0.83, 1.5, 18],
      [0.10, 0.85, 1.4, 19],
      [0.33, 0.83, 1.45, 20],
      [0.74, 0.76, 1.55, 21],
      [0.85, 0.82, 1.6, 22],
      [0.68, 0.86, 1.4, 23],
      [0.89, 0.74, 1.45, 24],
      [0.27, 0.13, 1.35, 25],
      [0.69, 0.13, 1.35, 26],
    ];
    for (const [u, v, size, seed] of campusTrees) {
      const p = campusAt(u, v);
      tree(p[0], p[1], size, seed, 0.24);
    }
  }
  // Unified character-themed residential communities (目白台豪华住宅区 / 杂司谷生活社区 / 神田川河岸社区 / 高原坡地别墅社区).
  {
    const makeHelpers = (
      at: (u: number, v: number) => Point,
      angle: number
    ) => {
      const ca = Math.cos(angle),
        sa = Math.sin(angle);
      const uvRect = (u0: number, v0: number, u1: number, v1: number): Point[] => [
        at(u0, v0),
        at(u1, v0),
        at(u1, v1),
        at(u0, v1),
      ];
      const localRect = (
        u: number,
        v: number,
        rw: number,
        rd: number,
        ox = 0,
        oz = 0
      ): Point[] => {
        const [cx, cz] = at(u, v);
        const pt = (x: number, z: number): Point => [
          cx + ca * (x + ox) - sa * (z + oz),
          cz + sa * (x + ox) + ca * (z + oz),
        ];
        return [
          pt(-rw / 2, -rd / 2),
          pt(rw / 2, -rd / 2),
          pt(rw / 2, rd / 2),
          pt(-rw / 2, rd / 2),
        ];
      };
      const wallSeg = (
        a: Point,
        b: Point,
        bodyColor: string,
        capColor: string,
        h = 1.15
      ) => {
        const len = distance(a, b);
        if (len < 1) return;
        const dx = (b[0] - a[0]) / len,
          dz = (b[1] - a[1]) / len,
          nx = -dz * 0.3,
          nz = dx * 0.3;
        prism(
          [
            [a[0] + nx, a[1] + nz],
            [b[0] + nx, b[1] + nz],
            [b[0] - nx, b[1] - nz],
            [a[0] - nx, a[1] - nz],
          ],
          0.22,
          h,
          bodyColor,
          capColor
        );
      };
      return { uvRect, localRect, wallSeg };
    };

    // 1. 目白台豪华住宅区 (downtown): 西区高密度豪宅塔楼群(长崎素世等) + 东区名门庭院宅邸区
    const dt = communityById.get('downtown')!;
    {
      const { uvRect, localRect, wallSeg } = makeHelpers(dt.at, dt.angle);
      top(dt.enclosure, 0.23, '#a4bb90');
      // West high-density luxury tower podium terrace
      top(uvRect(0.05, 0.08, 0.45, 0.91), 0.255, '#dcd6c4');
      top(uvRect(0.16, 0.44, 0.32, 0.64), 0.275, '#e7e1cf');
      // Central sunken reflecting pool in Soyo's tower courtyard
      const poolCenter = dt.at(0.24, 0.54);
      prism(circle(poolCenter[0], poolCenter[1], 3.8, 2.5, 14), 0.26, 0.22, '#dfd9c6', '#7ab6bc');
      // Central tree-lined prestige boulevard & east estate lanes
      top(uvRect(0.465, 0.075, 0.515, 0.925), 0.265, '#e4ddc9');
      top(uvRect(0.685, 0.14, 0.735, 0.88), 0.26, '#e2dac6');
      // Formal manor courtyard circles for Ouzuka & Toyokawa
      for (const v of [0.44, 0.79]) {
        const mc = dt.at(0.51, v);
        top(circle(mc[0], mc[1], 2.4, 2.4, 12), 0.275, '#ece6d4');
      }
      // Companion high-density luxury residential towers surrounding soyo-house
      const companionTowers: [number, number, number, number, number, string][] = [
        [0.10, 0.26, 13.5, 11.5, 31, '#cfd9d9'],
        [0.38, 0.26, 13.5, 11.5, 34, '#d8dfd8'],
        [0.10, 0.60, 13.0, 10.5, 27, '#d3dad6'],
        [0.38, 0.52, 12.5, 10.0, 24, '#cad7d8'],
        [0.10, 0.84, 13.0, 9.5, 22, '#dcd8ca'],
      ];
      for (const [u, v, tw, td, th, tone] of companionTowers) {
        top(localRect(u, v, tw + 1.2, td + 1.2), 0.27, '#cfc9b7');
        prism(localRect(u, v, tw, td), 0.27, 3.6, '#d9d2bf', '#cbd3ce', 'stone');
        prism(localRect(u, v, tw * 0.9, td * 0.88), 3.87, th - 3.6, tone, '#bfc9c5', 'glass');
        for (let y = 6.5; y < th - 1.5; y += 3.6) {
          prism(localRect(u, v, tw * 0.94, td * 0.92), y, 0.25, '#ece6d4');
        }
        prism(localRect(u, v, tw * 0.78, td * 0.76), th + 0.27, 1.0, '#78898d', '#92a896');
      }
      // Stone-and-limestone perimeter walls with open gateways
      const [nw, ne, se, sw] = dt.enclosure;
      wallSeg(nw, mid(nw, ne, 0.19), '#c8bea8', '#ebe4d1', 1.3);
      wallSeg(mid(nw, ne, 0.28), mid(nw, ne, 0.44), '#c8bea8', '#ebe4d1', 1.3);
      wallSeg(mid(nw, ne, 0.53), ne, '#c8bea8', '#ebe4d1', 1.3);
      wallSeg(ne, mid(ne, se, 0.45), '#c8bea8', '#ebe4d1', 1.3);
      wallSeg(mid(ne, se, 0.62), se, '#c8bea8', '#ebe4d1', 1.3);
      wallSeg(se, mid(se, sw, 0.45), '#c8bea8', '#ebe4d1', 1.3);
      wallSeg(mid(se, sw, 0.56), mid(se, sw, 0.71), '#c8bea8', '#ebe4d1', 1.3);
      wallSeg(mid(se, sw, 0.80), sw, '#c8bea8', '#ebe4d1', 1.3);
      wallSeg(sw, nw, '#c8bea8', '#ebe4d1', 1.3);
      // Ornamental boulevard & estate garden trees
      const dtTrees: [number, number, number, number][] = [
        [0.18, 0.45, 1.35, 31],
        [0.30, 0.45, 1.35, 32],
        [0.18, 0.63, 1.3, 33],
        [0.30, 0.63, 1.3, 34],
        [0.46, 0.22, 1.45, 35],
        [0.46, 0.40, 1.45, 36],
        [0.46, 0.66, 1.45, 37],
        [0.69, 0.36, 1.35, 38],
        [0.69, 0.68, 1.35, 39],
        [0.92, 0.22, 1.4, 40],
        [0.92, 0.44, 1.4, 41],
        [0.92, 0.72, 1.4, 42],
        [0.73, 0.14, 1.3, 43],
      ];
      for (const [u, v, size, seed] of dtTrees) {
        const pt = dt.at(u, v);
        tree(pt[0], pt[1], size, seed, 0.25);
      }
    }

    // 2. 杂司谷温情生活社区 (home)
    const hm = communityById.get('home')!;
    {
      const { uvRect, localRect, wallSeg } = makeHelpers(hm.at, hm.angle);
      top(hm.enclosure, 0.23, '#adc298');
      // North apartment courtyard paving
      top(uvRect(0.11, 0.26, 0.84, 0.37), 0.255, '#e0d8c2');
      // Central neighborhood pocket park & playground
      top(uvRect(0.32, 0.40, 0.56, 0.56), 0.265, '#92b281');
      const parkMid = hm.at(0.44, 0.48);
      top(circle(parkMid[0], parkMid[1], 4.6, 3.6, 12), 0.28, '#e3dac2');
      // Park wooden benches & small sandbox
      prism(localRect(0.44, 0.48, 3.6, 2.4), 0.28, 0.25, '#c4a987', '#e8d7b4');
      prism(localRect(0.37, 0.46, 2.4, 0.7), 0.28, 0.45, '#967054');
      prism(localRect(0.51, 0.46, 2.4, 0.7), 0.28, 0.45, '#967054');
      // Cozy companion townhouses & apartment annexes so the neighborhood feels lived-in
      const companionHomes: [number, number, number, number, number, string, string][] = [
        [0.09, 0.35, 9.5, 7.5, 5.4, '#e7dcc4', '#7a685c'],
        [0.90, 0.24, 9.5, 8.0, 6.2, '#e2d8c0', '#63787a'],
        [0.46, 0.86, 10.5, 7.8, 5.5, '#e8ddc6', '#896d5e'],
      ];
      for (const [u, v, hw, hd, hh, wall, rcol] of companionHomes) {
        top(localRect(u, v, hw + 0.8, hd + 0.8), 0.255, '#d5cebb');
        prism(localRect(u, v, hw, hd), 0.255, hh, wall, rcol, 'timber');
        prism(localRect(u, v, hw * 1.04, hd * 1.04), 0.255 + hh, 0.55, rcol);
      }
      // Low neighborhood hedges & timber-stone boundary fences with open street entries
      const [nw, ne, se, sw] = hm.enclosure;
      wallSeg(nw, mid(nw, ne, 0.42), '#8ea57d', '#a2ba8f', 0.9);
      wallSeg(mid(nw, ne, 0.54), ne, '#8ea57d', '#a2ba8f', 0.9);
      wallSeg(ne, mid(ne, se, 0.50), '#8ea57d', '#a2ba8f', 0.9);
      wallSeg(mid(ne, se, 0.64), se, '#8ea57d', '#a2ba8f', 0.9);
      wallSeg(se, mid(se, sw, 0.45), '#8ea57d', '#a2ba8f', 0.9);
      wallSeg(mid(se, sw, 0.57), sw, '#8ea57d', '#a2ba8f', 0.9);
      wallSeg(sw, mid(sw, nw, 0.36), '#8ea57d', '#a2ba8f', 0.9);
      wallSeg(mid(sw, nw, 0.48), nw, '#8ea57d', '#a2ba8f', 0.9);
      // Cherry blossom & neighborhood garden trees
      const hmTrees: [number, number, number, number][] = [
        [0.34, 0.43, 1.45, 9],
        [0.54, 0.43, 1.45, 18],
        [0.34, 0.54, 1.35, 27],
        [0.54, 0.54, 1.35, 10],
        [0.33, 0.28, 1.3, 51],
        [0.63, 0.28, 1.3, 52],
        [0.10, 0.56, 1.35, 53],
        [0.10, 0.84, 1.4, 54],
        [0.45, 0.67, 1.3, 55],
        [0.91, 0.84, 1.35, 56],
      ];
      for (const [u, v, size, seed] of hmTrees) {
        const pt = hm.at(u, v);
        tree(pt[0], pt[1], size, seed, 0.25);
      }
    }

    // 3. 神田川河岸公寓社区 (riverside)
    const rv = communityById.get('riverside')!;
    {
      const { uvRect, localRect, wallSeg } = makeHelpers(rv.at, rv.angle);
      top(rv.enclosure, 0.23, '#9fb98f');
      // Central riverside garden promenade
      top(uvRect(0.41, 0.08, 0.59, 0.92), 0.255, '#dfd9c4');
      // Companion riverside mid-rise apartment on southwest corner
      top(localRect(0.27, 0.78, 14.5, 11.0), 0.26, '#d3ccb8');
      prism(localRect(0.27, 0.78, 13.5, 10.0), 0.26, 11.2, '#d9d8cc', '#8b9994', 'stone');
      prism(localRect(0.27, 0.78, 13.8, 10.3), 11.46, 0.28, '#e8e2ce');
      // Low river-stone perimeter wall
      const [nw, ne, se, sw] = rv.enclosure;
      wallSeg(nw, mid(nw, ne, 0.36), '#b2b29f', '#d7d5c3', 0.85);
      wallSeg(mid(nw, ne, 0.64), ne, '#b2b29f', '#d7d5c3', 0.85);
      wallSeg(ne, mid(ne, se, 0.30), '#b2b29f', '#d7d5c3', 0.85);
      wallSeg(mid(ne, se, 0.44), mid(ne, se, 0.62), '#b2b29f', '#d7d5c3', 0.85);
      wallSeg(mid(ne, se, 0.78), se, '#b2b29f', '#d7d5c3', 0.85);
      wallSeg(se, mid(se, sw, 0.36), '#b2b29f', '#d7d5c3', 0.85);
      wallSeg(mid(se, sw, 0.64), sw, '#b2b29f', '#d7d5c3', 0.85);
      wallSeg(sw, mid(sw, nw, 0.38), '#b2b29f', '#d7d5c3', 0.85);
      wallSeg(mid(sw, nw, 0.54), nw, '#b2b29f', '#d7d5c3', 0.85);
      const rvTrees: [number, number, number, number][] = [
        [0.46, 0.14, 1.35, 9],
        [0.54, 0.34, 1.4, 18],
        [0.46, 0.62, 1.35, 61],
        [0.54, 0.86, 1.4, 62],
        [0.89, 0.40, 1.35, 27],
        [0.89, 0.68, 1.35, 36],
      ];
      for (const [u, v, size, seed] of rvTrees) {
        const pt = rv.at(u, v);
        tree(pt[0], pt[1], size, seed, 0.25);
      }
    }

    // 4. 高原坡地别墅社区 (highland)
    const hl = communityById.get('highland')!;
    {
      const { uvRect, localRect, wallSeg } = makeHelpers(hl.at, hl.angle);
      top(hl.enclosure, 0.23, '#97b487');
      top(uvRect(0.24, 0.50, 0.76, 0.64), 0.26, '#dfd6be');
      // Cucumber trellis garden plot beside Wakaba Mutsumi's villa
      top(uvRect(0.14, 0.16, 0.30, 0.42), 0.27, '#7da16f');
      for (let k = 0; k < 3; k++) {
        prism(localRect(0.22, 0.20 + k * 0.08, 4.5, 0.55), 0.27, 0.75, '#8c7258', '#688c5c');
      }
      // Stone garden retaining walls
      const [nw, ne, se, sw] = hl.enclosure;
      wallSeg(nw, ne, '#b8b09c', '#dcd5c3', 1.1);
      wallSeg(ne, se, '#b8b09c', '#dcd5c3', 1.1);
      wallSeg(se, mid(se, sw, 0.36), '#b8b09c', '#dcd5c3', 1.1);
      wallSeg(mid(se, sw, 0.64), sw, '#b8b09c', '#dcd5c3', 1.1);
      wallSeg(sw, mid(sw, nw, 0.34), '#b8b09c', '#dcd5c3', 1.1);
      wallSeg(mid(sw, nw, 0.56), nw, '#b8b09c', '#dcd5c3', 1.1);
      const hlTrees: [number, number, number, number][] = [
        [0.18, 0.76, 1.45, 71],
        [0.82, 0.76, 1.45, 72],
        [0.84, 0.22, 1.5, 73],
        [0.16, 0.48, 1.3, 74],
      ];
      for (const [u, v, size, seed] of hlTrees) {
        const pt = hl.at(u, v);
        tree(pt[0], pt[1], size, seed, 0.25);
      }
    }

    // 5. 池袋／东池袋商业综合区 (commercial): 阳光城广场、商业步行街、都会配楼与绿岛
    const cm = communityById.get('commercial')!;
    {
      const { uvRect, localRect } = makeHelpers(cm.at, cm.angle);
      // Warm urban stone paving base across the entire Ikebukuro commercial superblock
      top(cm.enclosure, 0.23, '#d4cebc');
      // Central Sunshine City plaza apron & main shopping promenade
      top(uvRect(0.32, 0.20, 0.68, 0.56), 0.255, '#e5decb');
      top(uvRect(0.08, 0.53, 0.92, 0.60), 0.26, '#e2dac6');
      top(uvRect(0.30, 0.16, 0.35, 0.76), 0.258, '#e2dac6');
      top(uvRect(0.65, 0.16, 0.70, 0.88), 0.258, '#e2dac6');
      // Sunshine City south forecourt fountain & planter island
      const sunPlaza = cm.at(0.50, 0.54);
      prism(circle(sunPlaza[0], sunPlaza[1], 3.2, 2.2, 12), 0.26, 0.28, '#ddd5c2', '#7cb8be');
      // Companion Ikebukuro commercial mid-rise retail blocks (east & south-east)
      const cmCompanion: [number, number, number, number, number, string][] = [
        [0.58, 0.85, 11.5, 9.5, 16, '#cdd9d7'],
        [0.14, 0.85, 9.5, 10.0, 14, '#dcd4c2'],
      ];
      for (const [u, v, bw, bd, bh, tone] of cmCompanion) {
        top(localRect(u, v, bw + 0.8, bd + 0.8), 0.26, '#c7c1b0');
        prism(localRect(u, v, bw, bd), 0.26, 3.2, '#e2dac7', '#b8c3bc', 'stone');
        prism(localRect(u, v, bw * 0.92, bd * 0.9), 3.46, bh - 3.2, tone, '#8a9994', 'glass');
        prism(localRect(u, v, bw * 0.96, bd * 0.94), bh + 0.26, 0.3, '#ebe5d3');
      }
      // Urban plaza street trees & planters
      const cmTrees: [number, number, number, number][] = [
        [0.36, 0.20, 1.3, 81],
        [0.64, 0.20, 1.3, 82],
        [0.36, 0.54, 1.35, 83],
        [0.64, 0.54, 1.35, 84],
        [0.12, 0.54, 1.3, 85],
        [0.88, 0.58, 1.3, 86],
        [0.50, 0.72, 1.4, 87],
        [0.66, 0.72, 1.3, 88],
      ];
      for (const [u, v, size, seed] of cmTrees) {
        const pt = cm.at(u, v);
        tree(pt[0], pt[1], size, seed, 0.26);
      }
    }

    // 6. 新宿／大型商业娱乐与CBD核心区 (grand-commercial): 北区高密度摩天CBD + 中央广场 + 南区演艺潮流步行街
    const gc = communityById.get('grand-commercial')!;
    {
      const { uvRect, localRect } = makeHelpers(gc.at, gc.angle);
      // Sleek metropolitan granite-stone base
      top(gc.enclosure, 0.23, '#ccc9bc');
      // North CBD granite plaza around Toyokawa Executive Tower
      top(uvRect(0.08, 0.06, 0.92, 0.42), 0.252, '#d8d5c9');
      // Central Shinjuku station-front square & pedestrian cross-boulevard
      top(uvRect(0.08, 0.43, 0.92, 0.58), 0.26, '#e5decb');
      // South entertainment & Harajuku/Omotesando fashion promenade
      top(uvRect(0.10, 0.62, 0.90, 0.93), 0.256, '#dfd7c4');
      // Central plaza water feature & planter medallion
      const gcPlaza = gc.at(0.50, 0.46);
      prism(circle(gcPlaza[0], gcPlaza[1], 3.8, 2.8, 14), 0.26, 0.26, '#dad4c2', '#79b2b9');
      // Companion high-density CBD skyscrapers flanking Toyokawa Executive Tower
      const cbdTowers: [number, number, number, number, number, string][] = [
        [0.18, 0.14, 15.5, 13.0, 34, '#c4d5d8'],
        [0.84, 0.14, 15.5, 13.0, 38, '#cbd8d6'],
        [0.50, 0.34, 16.0, 11.0, 29, '#ced9d5'],
        [0.18, 0.54, 14.0, 10.5, 22, '#d4dad4'],
      ];
      for (const [u, v, tw, td, th, tone] of cbdTowers) {
        top(localRect(u, v, tw + 1.0, td + 1.0), 0.26, '#bebbb0');
        prism(localRect(u, v, tw, td), 0.26, 4.0, '#d8d3c3', '#bac5c1', 'stone');
        prism(localRect(u, v, tw * 0.9, td * 0.88), 4.26, th - 4.0, tone, '#9eb0b2', 'glass');
        for (let y = 8.0; y < th - 1.5; y += 4.2) {
          prism(localRect(u, v, tw * 0.93, td * 0.91), y, 0.25, '#e8e4d4');
        }
        prism(localRect(u, v, tw * 0.62, td * 0.6), th + 0.26, 1.4, '#6e8085');
      }
      // Companion south commercial retail pavilions framing Harajuku/Omotesando promenade
      for (const u of [0.16, 0.84]) {
        top(localRect(u, 0.88, 12.5, 9.5), 0.26, '#cfc8b6');
        prism(localRect(u, 0.88, 11.5, 8.5), 0.26, 7.2, '#e2d7c1', '#7d908d', 'brick');
        prism(localRect(u, 0.88, 11.8, 1.4, 0, 4.0), 2.3, 0.25, '#c4866b');
      }
      // Omotesando-style zelkova & boulevard trees
      const gcTrees: [number, number, number, number][] = [
        [0.34, 0.25, 1.35, 91],
        [0.66, 0.25, 1.35, 92],
        [0.34, 0.46, 1.4, 93],
        [0.66, 0.46, 1.4, 94],
        [0.34, 0.64, 1.35, 95],
        [0.66, 0.64, 1.35, 96],
        [0.29, 0.82, 1.4, 97],
        [0.71, 0.82, 1.4, 98],
        [0.50, 0.72, 1.35, 99],
      ];
      for (const [u, v, size, seed] of gcTrees) {
        const pt = gc.at(u, v);
        tree(pt[0], pt[1], size, seed, 0.26);
      }
    }
  }
  for (const e of streets) {
    const a = nodes[e.a],
      b = nodes[e.b],
      h = e.bridge ? 0.66 : 0.32;
    if (e.walk) {
      const flatCampus =
        groundHeight(...a) < 0.05 &&
        groundHeight(...b) < 0.05 &&
        allEnclosures.some((enc) => contains(mid(a, b), enc));
      if (flatCampus) {
        ribbon(a, b, e.width + 0.65, 0.295, '#b9b49d');
        ribbon(a, b, e.width, 0.315, '#e2d7bd');
      } else {
        for (let i = 0; i < 12; i++) {
          const p = mid(a, b, i / 12),
            q = mid(a, b, (i + 1) / 12);
          ribbon(
            p,
            q,
            e.width,
            groundHeight(...p) + 0.2,
            '#d6c5a0',
            groundHeight(...q) + 0.2
          );
        }
      }
      continue;
    }
    ribbon(a, b, e.width + 2.9, h - 0.07, '#aaa99b');
    ribbon(a, b, e.width + 2.55, h - 0.045, '#dfd9c7');
    ribbon(
      a,
      b,
      e.width,
      h,
      e.bridge ? '#64787d' : e.width > 4 ? '#626d72' : '#7a7f7c'
    );
    if (e.width > 4) {
      for (let i = 0.16; i < 0.89; i += 0.16)
        ribbon(mid(a, b, i), mid(a, b, i + 0.055), 0.17, h + 0.025, '#e9ddbd');
      for (const t of [0.12, 0.88]) {
        const c = mid(a, b, t),
          dx = b[0] - a[0],
          dz = b[1] - a[1],
          l = Math.hypot(dx, dz);
        for (let k = -2; k <= 2; k++) {
          const x = c[0] - (dz / l) * k * 0.68,
            z = c[1] + (dx / l) * k * 0.68;
          ribbon(
            [x - (dx / l) * 0.7, z - (dz / l) * 0.7],
            [x + (dx / l) * 0.7, z + (dz / l) * 0.7],
            0.35,
            h + 0.03,
            '#f3efe0'
          );
        }
      }
    }
    if (e.bridge) {
      const dx = b[0] - a[0],
        dz = b[1] - a[1],
        l = Math.hypot(dx, dz);
      for (const sign of [-1, 1]) {
        const off: Point = [
            (-dz / l) * (e.width / 2 + 0.65) * sign,
            (dx / l) * (e.width / 2 + 0.65) * sign,
          ],
          p: Point = [a[0] + off[0], a[1] + off[1]],
          q: Point = [b[0] + off[0], b[1] + off[1]];
        ribbon(p, q, 1, h + 0.86, '#d6d5be');
        for (let t = 0; t <= 1; t += 0.2) {
          const k = mid(p, q, t);
          prism(circle(...k, 0.3, 0.3, 4), h, 1.05, '#d9d9c2');
        }
      }
    }
  }
  for (let j = 0; j < nodes.length; j++) {
    const s = streets.find((e) => e.a === j || e.b === j);
    if (s && !s.walk)
      top(
        circle(...nodes[j], s.width * 0.57, s.width * 0.57, 12),
        0.335,
        '#747b7a'
      );
  }
  const entranceColor = '#e4dac0';
  function building(s: Site) {
    const base = groundHeight(s.x, s.z),
      project = (u: number, v: number) => local(s, u, v);
    const rect = (u: number, v: number, w: number, d: number) => [
      project(u - w / 2, v - d / 2),
      project(u + w / 2, v - d / 2),
      project(u + w / 2, v + d / 2),
      project(u - w / 2, v + d / 2),
    ];
    const box = (
      u: number,
      v: number,
      w: number,
      d: number,
      y: number,
      h: number,
      c: string,
      roof = c,
      mat = 'solid'
    ) => prism(rect(u, v, w, d), base + y, h, c, roof, mat);
    const { w, d, h, form } = s,
      col = climates[s.seed % climates.length],
      dark = '#59686d',
      cream = '#e8e2ce',
      slate = '#75858a';
    const roof = (
      u: number,
      v: number,
      rw: number,
      rd: number,
      y: number,
      peak: number,
      color: string
    ) => {
      const p = rect(u, v, rw, rd),
        q = project(u - rw * 0.38, v),
        r = project(u + rw * 0.38, v),
        P = p.map(([x, z]): V => [x, base + y, z]),
        A: V = [q[0], base + y + peak, q[1]],
        B: V = [r[0], base + y + peak, r[1]];
      tri(P[0], A, B, color);
      tri(P[0], B, P[1], color);
      tri(P[2], B, A, color);
      tri(P[2], A, P[3], color);
      tri(P[1], B, P[2], color);
      tri(P[3], A, P[0], color);
    };
    if (form === 'bridge') {
      top(s.polygon, 0.677, '#697a7f');
      for (const v of [-0.45, 0.45]) {
        box(0, d * v, w, 0.32, 0.7, 0.72, '#b8c4b8');
        for (let i = -2; i <= 2; i++)
          box(w * i * 0.18, d * v, 0.45, 0.48, 0.74, 1.1, cream);
      }
      return;
    }
    // Contact shadows and sidewalk aprons sit below the architecture on one grade.
    if (s.key)
      ribbon(
        s.door,
        s.entry,
        form === 'airport' ? 3.5 : 1.55,
        0.29,
        entranceColor,
        0.36
      );
    if (
      form === 'garden' ||
      ['park', 'greenway', 'fountain', 'stadium', 'square'].includes(form)
    ) {
      top(
        s.polygon,
        base + 0.32,
        form === 'stadium'
          ? '#b87560'
          : form === 'square'
            ? '#d4c7a9'
            : '#a3bb91'
      );
      if (form === 'stadium') {
        const oval = (a: number, b: number, n = 32) =>
          Array.from({ length: n }, (_, i) =>
            project(
              a * Math.cos((i * 2 * Math.PI) / n),
              b * Math.sin((i * 2 * Math.PI) / n)
            )
          );
        top(oval(w * 0.47, d * 0.44), base + 0.35, '#f4d8b7');
        top(oval(w * 0.455, d * 0.42), base + 0.36, '#b87560');
        top(oval(w * 0.4, d * 0.35), base + 0.38, '#78a481');
        const [a, b] = [project(0, -d * 0.27), project(0, d * 0.27)];
        ribbon(a, b, 0.18, base + 0.4, '#e3e5bd');
        box(0, -d * 0.42, w * 0.65, d * 0.09, 0.42, 1.2, slate);
        box(0, -d * 0.45, w * 0.65, d * 0.05, 1.62, 0.7, '#89989b');
        for (const sx of [-0.42, 0.42])
          for (const sz of [-0.42, 0.42]) {
            const p = project(w * sx, d * sz);
            prism(circle(p[0], p[1], 0.22, 0.22, 6), base + 0.35, 8.2, '#7d8c90');
            box(w * sx, d * sz, 1.4, 0.55, 8.5, 0.55, '#eef0db');
          }
        return;
      }
      if (form === 'fountain' || form === 'park') {
        const p = project(0, 0);
        prism(
          circle(...p, Math.min(w, d) * 0.21),
          base + 0.34,
          0.52,
          '#dad5c0',
          '#75b5b9'
        );
        crown(p[0], base + 0.94, p[1], 1.15, 2.4, '#b3ded6');
      }
      for (let i = 0; i < (s.key ? 7 : 2); i++) {
        const u = (rand(s.seed + i * 3) - 0.5) * w * 0.8,
          v = (rand(s.seed + 17 + i * 6) - 0.5) * d * 0.83,
          p = project(u, v);
        if (Math.abs(u) < w * 0.14 || !contains(p, s.polygon)) continue;
        tree(...p, 1.1 + rand(i + s.seed) * 0.9, i + s.seed, base + 0.34);
      }
      const p = project(0, -d * 0.4),
        q = project(-w * 0.16, 0),
        r = project(0, d * 0.43);
      ribbon(p, q, 1.05, base + 0.42, cream);
      ribbon(q, r, 1.05, base + 0.42, cream);
      if (form === 'fountain' || form === 'park') {
        for (let i = 0; i < 12; i++) {
          const t = (i * Math.PI) / 6,
            p = project(Math.cos(t) * w * 0.38, Math.sin(t) * d * 0.36),
            q = project(
              Math.cos(t + Math.PI / 6) * w * 0.38,
              Math.sin(t + Math.PI / 6) * d * 0.36
            );
          ribbon(p, q, 1.1, base + 0.45, '#dcd6b9');
          if (i % 3 === 0) {
            prism(
              circle(...p, 0.83, 0.6, 8),
              base + 0.47,
              0.22,
              '#b98a78',
              '#cab28c'
            );
          }
        }
        if (s.key === 'minami-ikebukuro-park') {
          box(
            -w * 0.29,
            -d * 0.24,
            w * 0.21,
            d * 0.23,
            0.34,
            2.6,
            '#cfbd9e',
            '#76928b',
            'glass'
          );
          box(-w * 0.29, -d * 0.24, w * 0.24, d * 0.26, 2.91, 0.23, cream);
        }
        if (form === 'fountain') {
          for (let i = 0; i < 7; i++) {
            const pt = project(w * 0.32, -d * 0.31 + i * 0.65);
            prism(
              circle(...pt, 0.55, 0.35, 6),
              base + 0.46,
              i * 0.09 + 0.15,
              '#b8b7a6'
            );
          }
        }
      }
      if (s.key) {
        box(-w * 0.24, 0.1, 2.8, 0.85, 0.4, 0.55, '#916c51');
        box(w * 0.24, 0, 2.8, 0.85, 0.4, 0.55, '#916c51');
      }
      return;
    }
    top(rect(0.45, 0.42, w + 0.7, d + 0.6), base + 0.1, '#989e8c');
    top(rect(0, 0, w + 0.56, d + 0.5), base + 0.19, '#d2cbb8');
    if (form === 'gate') {
      // Monumental Japanese university main gate: twin stone/brick gatehouses, pillars, and lintel arch.
      for (const side of [-1, 1]) {
        box(side * w * 0.36, 0, w * 0.22, d * 0.68, 0, h * 0.68, '#c59d82', '#7a8a86', 'brick');
        roof(side * w * 0.36, 0, w * 0.25, d * 0.76, h * 0.68, 1.2, '#627375');
        box(side * w * 0.18, d * 0.12, 1.15, 1.15, 0, h * 0.96, '#ddd4be', '#ece5d1');
        box(side * w * 0.18, d * 0.12, 1.4, 1.4, h * 0.96, 0.32, '#8d6552');
      }
      box(0, d * 0.12, w * 0.42, 0.95, h * 0.78, 0.55, '#8e5f4d', '#b3806b');
      box(0, d * 0.12, w * 0.26, 1.05, h * 0.88, 0.45, '#e7dec6');
      return;
    }
    if (form === 'dorm') {
      // Twin-wing campus residence hall with courtyard balconies and bicycle shed.
      box(-w * 0.28, -d * 0.04, w * 0.40, d * 0.88, 0, h, '#c99b82', '#82918c', 'brick');
      box(w * 0.28, -d * 0.04, w * 0.40, d * 0.88, 0, h * 0.86, '#c2ad92', '#82918c', 'stone');
      box(0, -d * 0.26, w * 0.26, d * 0.36, 0, h * 0.78, '#d7cbb4', cream, 'stone');
      for (const wing of [-0.28, 0.28]) {
        const wh = wing < 0 ? h : h * 0.86;
        box(w * wing, -d * 0.04, w * 0.42, d * 0.9, wh, 0.32, cream);
        for (let y = 2.6; y < wh - 1; y += 3.1) {
          box(w * wing, d * 0.42, w * 0.34, 0.7, y, 0.22, cream);
          box(w * wing, d * 0.44, w * 0.32, 0.12, y + 0.22, 0.46, '#7f9897');
        }
      }
      // Courtyard bicycle shed canopy
      box(0, d * 0.26, w * 0.24, d * 0.22, 2.2, 0.18, '#8fa6a2');
      for (const u of [-0.1, 0.1]) box(w * u, d * 0.26, 0.22, 0.22, 0, 2.2, '#647677');
      return;
    }
    if (form === 'stop') {
      const span = w * 0.71;
      for (const u of [-0.43, 0.43])
        box(span * u, 0, 0.44, 0.64, 0, h, '#647879');
      box(0, 0, span + 0.8, d * 0.48, h - 0.3, 0.46, '#9eb8b7');
      box(0, 0, span * 0.73, 0.7, 0.4, 0.47, '#9d8064');
      box(span * 0.41, d * 0.17, 0.8, 0.32, 0.2, 2.6, '#e8c878');
      return;
    }
    if (form === 'sunshine') {
      box(0, 0, w, d, 0, 3.7, '#ddd6be', '#acb6a9', 'stone');
      box(
        -w * 0.25,
        -d * 0.15,
        w * 0.36,
        d * 0.52,
        3.7,
        h - 3.7,
        '#d2deda',
        '#c8d3cb',
        'glass'
      );
      for (let k = 0; k < 6; k++)
        box(
          -w * 0.42 + k * w * 0.068,
          -d * 0.15,
          w * 0.016,
          d * 0.55,
          3.7,
          h - 3.7,
          cream
        );
      box(-w * 0.25, -d * 0.15, w * 0.37, d * 0.55, h, 0.65, '#dce5d8');
      box(-w * 0.25, -d * 0.15, w * 0.22, d * 0.34, h + 0.65, 1.1, slate);
      box(
        w * 0.21,
        -d * 0.08,
        w * 0.44,
        d * 0.61,
        3.7,
        5.1,
        '#c3cfca',
        '#85aa96',
        'glass'
      );
      const aqu = project(w * 0.23, -d * 0.1);
      prism(
        circle(...aqu, w * 0.071, d * 0.14, 18),
        base + 8.8,
        0.52,
        '#d0d3b6',
        '#71b7c0'
      );
      crown(aqu[0] - w * 0.13, base + 8.8, aqu[1], w * 0.065, 2.5, '#8ba7a8');
      const palm = project(w * 0.34, -d * 0.17);
      tree(...palm, 1.06, s.seed, base + 8.85);
      const p = project(w * 0.22, d * 0.09);
      prism(
        circle(...p, w * 0.099, d * 0.105, 14),
        base + 8.99,
        0.32,
        '#e6dabc',
        '#6cb5ba'
      );
      for (let i = 0; i < 4; i++)
        box(
          w * 0.06 + w * 0.085 * i,
          d * 0.22,
          w * 0.062,
          d * 0.055,
          3.72,
          1.0,
          '#819a83'
        );
      box(0, d * 0.45, w * 0.62, d * 0.13, 3.2, 0.46, '#a9cac6');
      for (const u of [-0.27, -0.14, 0, 0.14, 0.27])
        box(u * w, d * 0.49, 0.17, 0.22, 0.23, 3.0, '#627e83');
      return;
    }
    if (form === 'airport') {
      box(0, 0, w, d, 0, 8.1, '#d6e0da', '#d9ddd4', 'glass');
      for (let i = -3; i <= 3; i++) {
        box(i * w * 0.13, 0, w * 0.105, d * 1.03, 8.1, 1.2, '#c4d6d3');
        box(i * w * 0.13, d * 0.69, 1.4, d * 0.49, 2.1, 0.8, '#a4b5b4');
      }
      return;
    }
    if (form === 'lookout') {
      box(0, 0, w * 0.85, d * 0.85, 0.23, 0.83, '#8f745d', '#d1bda0');
      for (const side of [-1, 1])
        for (let i = -2; i <= 2; i++)
          box(i * w * 0.18, side * d * 0.4, 0.27, 0.27, 0.8, 1, '#746f5c');
      box(0, -d * 0.4, w * 0.85, 0.15, 1.7, 0.17, cream);
      box(0, 0, w * 0.32, d * 0.28, 1.06, 0.54, '#9d9681');
      return;
    }
    if (form === 'works') {
      box(0, 0, w, d, 0.15, 0.5, '#c3b197');
      for (let i = -1; i < 2; i++)
        for (const v of [-0.32, 0.32])
          box(i * w * 0.35, d * v, 0.29, 0.32, 0.6, h, '#997c62');
      for (const y of [2, 4.4, 6.8])
        box(0, 0, w * 0.8, d * 0.78, y, 0.21, '#b6ab96');
      box(-w * 0.32, 0, 0.44, 0.55, 0, h + 2, '#c7aa64');
      box(-w * 0.12, 0, w * 0.52, 0.37, h + 1.8, 0.35, '#d3b477');
      return;
    }
    if (form === 'arcade') {
      for (let i = -1; i < 2; i++) {
        const u = i * w * 0.32;
        box(
          u,
          -d * 0.07,
          w * 0.31,
          d * 0.84,
          0.2,
          h * (1 + i * 0.12),
          col,
          slate,
          'brick'
        );
        box(
          u,
          d * 0.39,
          w * 0.31,
          1.35,
          2,
          0.25,
          ['#6e9294', '#c38c73', '#829575'][i + 1]
        );
        box(u, d * 0.39, w * 0.17, 0.13, 2.5, 0.68, cream);
      }
      return;
    }
    if (form === 'pagoda') {
      for (let k = 0; k < 3; k++) {
        const v = 1 - k * 0.22;
        box(0, 0, w * 0.55 * v, d * 0.6 * v, k * 3.2, 2.2, '#a76654');
        roof(0, 0, w * v, d * v, k * 3.2 + 2.1, 1.9, '#556864');
      }
      return;
    }
    if (form === 'court' || form === 'library' || form === 'school') {
      box(
        0,
        -d * 0.03,
        w * 0.98,
        d * 0.89,
        0,
        h,
        form === 'court' ? '#e6d9bf' : '#d7cbb2',
        cream,
        'stone'
      );
      box(0, d * 0.41, w * 0.63, d * 0.22, 0.3, 0.58, cream);
      for (let j = 0; j < 6; j++) {
        const p = project((j - 2.5) * w * 0.105, d * 0.43);
        prism(circle(...p, 0.43, 0.43, 8), base + 0.8, h * 0.57, cream);
      }
      box(0, d * 0.41, w * 0.65, d * 0.2, h * 0.61, 0.55, cream);
      roof(0, d * 0.38, w * 0.67, d * 0.31, h * 0.65, 1.5, '#7d9189');
      if (form === 'court' || form === 'library') {
        box(0, -d * 0.03, w * 0.21, d * 0.46, h, 2.3, cream);
        const p = project(0, -d * 0.03);
        crown(
          p[0],
          base + h + 2,
          p[1],
          Math.min(w * 0.14, d * 0.24),
          3.1,
          form === 'court' ? '#688b80' : '#8d7b65'
        );
      }
      return;
    }
    if (form === 'luxury-tower') {
      // High-density prestige residential tower (e.g. Nagasaki Soyo's tower residence)
      box(0, 0, w * 0.98, d * 0.96, 0, 4.2, '#dfd7c3', '#c6cec7', 'stone');
      box(0, d * 0.49, w * 0.48, 1.4, 2.4, 0.35, '#8a9e9b');
      box(0, -d * 0.02, w * 0.88, d * 0.84, 4.2, h - 4.2, '#d4e0de', '#c2ceca', 'glass');
      for (let y = 7.4; y < h - 1.2; y += 3.4) {
        box(0, -d * 0.02, w * 0.93, d * 0.89, y, 0.26, '#efe9d6');
        box(0, d * 0.43, w * 0.82, 0.14, y + 0.26, 0.55, '#89a8ab');
      }
      box(0, -d * 0.02, w * 0.72, d * 0.68, h, 1.4, '#e7e0cc', '#88a48c');
      const rt = project(w * 0.18, -d * 0.06);
      tree(...rt, 0.95, s.seed, base + h + 1.4);
      return;
    }
    if (form === 'luxury-flat') {
      // Upscale mid-high limestone & glass apartment (e.g. Mizuho's apartment)
      box(0, 0, w * 0.96, d * 0.92, 0, h, '#e4dcc7', '#9aa8a1', 'stone');
      for (let y = 3.2; y < h - 1; y += 3.2) {
        box(0, d * 0.45, w * 0.82, 0.85, y, 0.24, '#f0ead8');
        box(0, d * 0.48, w * 0.80, 0.12, y + 0.24, 0.5, '#829da0');
      }
      box(0, 0, w * 0.99, d * 0.96, h, 0.35, '#efe8d5');
      box(0, d * 0.48, w * 0.38, 1.2, 2.2, 0.28, '#957b63');
      return;
    }
    if (form === 'manor') {
      // Grand Western-style prestige estate manor (Toyokawa / Ouzuka)
      box(0, -d * 0.04, w * 0.94, d * 0.82, 0, h, '#ebe3cf', '#6e7e84', 'stone');
      roof(0, -d * 0.04, w * 0.98, d * 0.88, h, 2.4, '#5a6b73');
      box(0, d * 0.39, w * 0.44, d * 0.22, 0.2, h * 0.62, '#f2ebda', '#7c8d8b');
      roof(0, d * 0.38, w * 0.48, d * 0.28, h * 0.62, 1.15, '#64767d');
      for (const sx of [-0.17, -0.06, 0.06, 0.17]) {
        const p = project(w * sx, d * 0.47);
        prism(circle(...p, 0.26, 0.26, 7), base + 0.25, h * 0.58, '#f4eedd');
      }
      return;
    }
    if (form === 'courtyard-jp') {
      // Traditional Japanese courtyard residence (Nikaido / Leia / Koko / Rana)
      top(rect(0, 0, w * 0.98, d * 0.96), base + 0.24, '#9eb58a');
      box(-w * 0.08, -d * 0.08, w * 0.78, d * 0.68, 0.24, h, '#eadfc7', '#4e5c62', 'timber');
      roof(-w * 0.08, -d * 0.08, w * 0.86, d * 0.78, h + 0.24, 2.2, '#4a565d');
      // Wooden engawa veranda along the south front
      box(-w * 0.08, d * 0.30, w * 0.68, 1.25, 0.24, 0.45, '#b6906a');
      // Garden stone lantern (toro) & courtyard pine
      const lp = project(w * 0.34, d * 0.28);
      prism(circle(...lp, 0.35, 0.35, 6), base + 0.24, 1.35, '#bfb9a8', '#d5cfbd');
      const tp = project(w * 0.35, -d * 0.24);
      tree(...tp, 1.05, s.seed + 3, base + 0.24);
      return;
    }
    if (form === 'apt-low') {
      // Authentic Japanese 3-4 story neighborhood apartment (manshon)
      const bodyCol = ['#dfd3bc', '#d3c5b2', '#cfd9d3', '#e2d7c5'][s.seed % 4];
      box(0, -d * 0.02, w * 0.94, d * 0.88, 0, h, bodyCol, '#86958e', s.seed % 2 ? 'brick' : 'stone');
      box(0, -d * 0.02, w * 0.97, d * 0.91, h, 0.28, cream);
      for (let y = 2.6; y < h - 0.8; y += 3.0) {
        box(0, d * 0.44, w * 0.80, 0.75, y, 0.22, cream);
        box(0, d * 0.47, w * 0.78, 0.12, y + 0.22, 0.46, '#7f9999');
      }
      box(0, d * 0.46, w * 0.28, 1.0, 2.0, 0.22, '#7d938f');
      return;
    }
    const pitched = ['house', 'villa', 'onsen', 'teahouse', 'station'].includes(
      form
    );
    const tall = form === 'tower' || form === 'office';
    const material = tall
      ? 'glass'
      : pitched
        ? 'timber'
        : form === 'music' || form === 'books'
          ? 'brick'
          : 'stone';
    if (!s.key && form === 'office' && s.seed % 3 === 0) {
      box(0, 0, w * 0.95, d * 0.92, 0, h * 0.34, col, cream, 'stone');
      box(
        -w * 0.14,
        -d * 0.09,
        w * 0.61,
        d * 0.65,
        h * 0.34,
        h * 0.66,
        '#cbdbde',
        '#c4cecb',
        'glass'
      );
      for (let k = 1; k <= 4; k++)
        box(
          -w * 0.14,
          -d * 0.09,
          w * 0.63,
          d * 0.67,
          h * (0.34 + 0.16 * k),
          0.23,
          cream
        );
      const p = project(w * 0.26, d * 0.17);
      tree(...p, 0.95, s.seed, base + h * 0.34);
      return;
    }
    box(
      0,
      0,
      w * 0.96,
      d * 0.91,
      0,
      h,
      pitched ? '#e9dec5' : col,
      slate,
      material
    );
    if (pitched) {
      roof(
        0,
        0,
        w,
        d,
        h,
        Math.min(d * 0.31, 3.1),
        ['#667781', '#8b7264', '#647b75', '#99796d'][s.seed % 4]
      );
      box(w * 0.31, -d * 0.17, 0.62, 0.75, h + 0.35, 1.6, '#a39887');
    } else {
      box(0, 0, w * 0.991, d * 0.97, h, 0.28, cream);
      box(0, 0, w * 0.9, d * 0.865, h + 0.28, 0.15, '#8a9892');
      box(
        -w * 0.18,
        -d * 0.09,
        w * 0.24,
        d * 0.27,
        h + 0.42,
        tall ? 1.65 : 0.89,
        slate
      );
      box(w * 0.25, -d * 0.25, w * 0.13, d * 0.18, h + 0.43, 0.53, '#b5b8a9');
      if (tall) {
        for (let k = 1; k < 4; k++)
          box(0, 0, w * 0.98, d * 0.95, (h * k) / 4, 0.25, '#bfccca');
        box(-w * 0.18, -d * 0.09, 0.13, 0.13, h + 1.65, 3, '#677879');
      }
      if (form === 'flat' || form === 'tower')
        for (let y = 2.8; y < h - 0.5; y += 3.3) {
          box(0, d * 0.46, w * 0.78, 0.8, y, 0.24, cream);
          box(0, d * 0.485, w * 0.76, 0.13, y + 0.25, 0.49, '#8faaa9');
        }
    }
    const stripe =
      form === 'clinic'
        ? '#80a7a0'
        : form === 'music'
          ? '#98555a'
          : form === 'cafe'
            ? '#c48763'
            : form === 'books'
              ? '#799280'
              : pitched
                ? '#80938b'
                : '#7b9199';
    box(0, d * 0.47, Math.min(w * 0.7, 8.5), 0.22, 1.95, 0.63, stripe);
    box(0, d * 0.5, Math.min(7, w * 0.52), 1.04, 1.86, 0.22, cream);
    box(0, d * 0.464, 1.6, 0.1, 0.15, 1.64, '#425b61');
    box(0.4, d * 0.474, 0.09, 0.09, 0.55, 0.25, cream);
    if (!pitched && s.seed % 3 === 0) {
      const p = project(w * 0.2, d * 0.13),
        r = Math.min(w, d) * 0.12;
      prism(circle(...p, r * 0.62, r * 0.62, 8), base + h + 0.49, 0.65, slate);
      prism(
        circle(...p, r, r, 12),
        base + h + 1.1,
        Math.max(0.65, r * 0.7),
        '#a5b7ba',
        '#cad3d0'
      );
    }
    if (!pitched && s.seed % 3 === 1) {
      for (let j = 0; j < 3; j++) {
        box(
          -w * 0.21 + j * w * 0.16,
          -d * 0.26,
          w * 0.11,
          d * 0.19,
          h + 0.58,
          0.27,
          '#607a86'
        );
        const p = project(-w * 0.21 + j * w * 0.16, -d * 0.26);
        prism(
          circle(...p, Math.min(w, d) * 0.048),
          base + h + 0.85,
          0.08,
          '#344f59'
        );
      }
    }
    if (form === 'cafe' || form === 'music') {
      for (const side of [-1, 1]) {
        const p = project(side * w * 0.38, d * 0.37);
        prism(circle(...p, 0.43, 0.43, 7), base + 0.25, 0.65, '#ada18b');
        tree(...p, 0.58, s.seed + side + 2, base + 0.87);
      }
    }
    if (form === 'clinic') {
      box(w * 0.3, d * 0.461, 0.25, 0.12, h * 0.63, 1.52, '#fff6d3');
      box(w * 0.3, d * 0.466, 1.3, 0.12, h * 0.63 + 0.62, 0.25, '#fff6d3');
    }
  }
  for (const [i, s] of sites.entries()) {
    current = i + 1;
    const source = native.get(s.key);
    if (!source) {
      building(s);
      continue;
    }
    const child = source.clone(true);
    child.position.set(0, 0, 0);
    child.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(child),
      size = bounds.getSize(new T.Vector3()),
      center = bounds.getCenter(new T.Vector3());
    const pivot = new T.Group();
    child.position.sub(new T.Vector3(center.x, bounds.min.y, center.z));
    pivot.add(child);
    pivot.scale.set(
      s.w / Math.max(0.01, size.x),
      s.h / Math.max(0.01, size.y),
      s.d / Math.max(0.01, size.z)
    );
    pivot.rotation.y = -s.angle;
    pivot.position.set(s.x, groundHeight(s.x, s.z), s.z);
    pivot.userData.citySite = s.key;
    root.add(pivot);
    ribbon(s.door, s.entry, 1.6, 0.29, entranceColor, 0.36);
  }
  current = 0;
  for (const s of scenery) building(s);
  // Forecourt trees line actual frontage. Keep doorways and carriageways clear.
  for (const [i, s] of [...sites, ...scenery].entries()) {
    if (
      s.d < 5 ||
      s.w < 6 ||
      [
        'airport',
        'greenway',
        'bridge',
        'garden',
        'fountain',
        'park',
        'square',
        'stadium',
      ].includes(s.form)
    )
      continue;
    if (i % 3 !== 0) continue;
    const p = local(s, s.w * 0.4, s.d * 0.5 + 0.66);
    const curb = streets.find(
      (e) => e.a === s.street[0] && e.b === s.street[1]
    );
    if (
      curb &&
      distanceToStreet(p, nodes[curb.a], nodes[curb.b]) > curb.width / 2 + 1.3
    )
      tree(...p, 1.15 + rand(i) * 0.55, i, groundHeight(...p) + 0.23);
  }

  // Airfield lies behind the terminal with taxiways, markings, tower and parked aircraft.
  const airport = sites.find((s) => s.form === 'airport');
  if (airport) {
    const a: Point = [-183, 301],
      b: Point = [-11, 301];
    ribbon(a, b, 13.6, 0.12, '#666e70');
    ribbon([-184, 278], [-10, 278], 5, 0.13, '#7a8281');
    for (let x = -178; x < -13; x += 8)
      ribbon([x, 301], [x + 4, 301], 0.39, 0.16, '#eeead4');
    for (const x of [-177, -21]) ribbon([x, 279], [x, 301], 4, 0.14, '#7d8582');
    for (const x of [-148, -121, -94, -67]) {
      ribbon([x, 249], [x, 271], 0.7, 0.22, '#dec777');
      const p: Point = [x, 258];
      top(
        [
          [x, 251],
          [x + 1, 257],
          [x + 7, 261],
          [x + 0.7, 259],
          [x + 0.45, 265],
          [x + 2.3, 266],
          [x, 265.5],
          [x - 2, 266],
          [x - 0.5, 264],
          [x - 0.7, 259],
          [x - 7, 261],
          [x - 1, 257],
        ],
        0.72,
        '#e7e5d8'
      );
      prism(circle(p[0], p[1], 0.45, 4, 12), 0.72, 0.45, '#cdd6d2');
    }
    prism(circle(-39, 232, 2, 2, 8), 0.12, 12, '#acbaba');
    prism(
      circle(-39, 232, 3.6, 3.6, 8),
      12,
      2.4,
      '#4f7383',
      '#d7dcd0',
      'glass'
    );
  }
  for (let i = 0; i < 250; i++) {
    const x = -66 + rand(i * 3) * 135,
      z = -234 + rand(i * 5 + 9) * 132,
      h = groundHeight(x, z);
    if (
      h < 1 ||
      sites.some(
        (s) => Math.abs(s.x - x) < s.w * 0.62 && Math.abs(s.z - z) < s.d * 0.72
      )
    )
      continue;
    tree(x, z, 1.1 + rand(i) * 1.4, i, h);
  }
  for (const [i, e] of streets.entries()) {
    if (e.width < 4.5 || e.bridge || i % 2) continue;
    const a = nodes[e.a],
      b = nodes[e.b],
      p = mid(a, b, 0.26),
      l = Math.hypot(b[0] - a[0], b[1] - a[1]),
      dx = -(b[1] - a[1]) / l,
      dz = (b[0] - a[0]) / l;
    const x = p[0] + dx * (e.width * 0.5 + 0.7),
      z = p[1] + dz * (e.width * 0.5 + 0.7);
    lampLocations.push(new T.Vector3(x, 3.68, z));
    prism(circle(x, z, 0.14, 0.14, 4), 0.25, 3.4, '#67756f');
    ribbon([x, z], [x - dx * 0.88, z - dz * 0.88], 0.29, 3.68, '#e3d7a6');
    if (i % 6 === 0) {
      const c = mid(a, b, 0.11),
        tx = c[0] + dx * (e.width * 0.5 + 0.62),
        tz = c[1] + dz * (e.width * 0.5 + 0.62);
      prism(circle(tx, tz, 0.1, 0.1, 5), 0.28, 2.85, '#68797b');
      ribbon([tx, tz], [tx - dx * 2, tz - dz * 2], 0.17, 3.12, '#819495');
      for (let b = 0; b < 3; b++)
        prism(
          circle(
            tx - dx * (1.5 + b * 0.27),
            tz - dz * (1.5 + b * 0.27),
            0.15,
            0.17,
            6
          ),
          2.91,
          0.22,
          ['#8ac9ad', '#dac588', '#c88377'][b]
        );
    }
    const q = mid(a, b, 0.69);
    tree(
      q[0] + dx * (e.width * 0.5 + 1.1),
      q[1] + dz * (e.width * 0.5 + 1.1),
      1.25 + rand(i) * 0.6,
      i,
      0.28
    );
  }
  const signage: Record<string, [string, string]> = {
    sunshine: ['SUNSHINE CITY', '#30565e'],
    ring: ['RiNG', '#863e50'],
    clinic: ['CLINIC +', '#528575'],
    bookshop: ['BOOKS', '#666e5c'],
    'street-cafe': ['CAFÉ MARGO', '#855d49'],
    cafe: ['CAMPUS CAFÉ', '#9c6649'],
    'otsuka-diner': ['DINER', '#9a6d56'],
    'otome-road': ['OTOME ROAD', '#68628a'],
    'onigawara-laundry': ['LAUNDRY', '#587b8e'],
    'haneda-airport': ['HANEDA', '#536672'],
  };
  for (const [i, s] of sites.entries()) {
    if (!signage[s.key] || native.has(s.key)) continue;
    current = i + 1;
    const fw = Math.min(s.w * 0.72, s.key === 'haneda-airport' ? 34 : 13),
      fh = Math.min(1.75, fw * 0.22);
    const v =
        s.d * (s.form === 'sunshine' || s.form === 'airport' ? 0.506 : 0.47) +
        0.06,
      y =
        groundHeight(s.x, s.z) +
        (s.form === 'airport' ? 5.8 : s.form === 'sunshine' ? 2.3 : 2.53);
    const a = local(s, -fw / 2, v),
      b = local(s, fw / 2, v),
      A: V = [a[0], y, a[1]],
      B: V = [b[0], y, b[1]],
      C: V = [b[0], y + fh, b[1]],
      D: V = [a[0], y + fh, a[1]];
    tri(A, B, C, '#ffffff', 'sign:' + s.key, [0, 0, 1, 0, 1, 1]);
    tri(A, C, D, '#ffffff', 'sign:' + s.key, [0, 0, 1, 1, 0, 1]);
  }
  current = 0;
  for (const [type, g] of batches) {
    const geom = new T.BufferGeometry();
    geom.setAttribute('position', new T.Float32BufferAttribute(g.position, 3));
    geom.setAttribute('color', new T.Float32BufferAttribute(g.color, 3));
    geom.setAttribute('uv', new T.Float32BufferAttribute(g.uv, 2));
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    const mat = new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.83,
      side: T.DoubleSide,
      flatShading: true,
    });
    if (type.startsWith('sign:') && doc) {
      const [label, bg] = signage[type.slice(5)],
        c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = bg;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#f9f1d4';
      g.font = 'bold 18px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.scale(1, 4);
      g.fillText(label, 64, 16, 121);
      mat.map = new T.CanvasTexture(c);
      mat.map.colorSpace = T.SRGBColorSpace;
      mat.emissiveMap = mat.map;
      mat.emissive.set('#ffebba');
      mat.emissiveIntensity = 0.16;
    } else if (type !== 'solid' && doc) {
      mat.map = facade(type);
      mat.emissiveMap = facade(type, true);
      mat.emissive.set('#ffdfb4');
      mat.emissiveIntensity = 0.02;
    }
    const m = new T.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = 'City-' + type;
    m.userData.faceOwners = Uint16Array.from(g.owner);
    m.userData.cityOwners = owners;
    root.add(m);
  }
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return root;
}
