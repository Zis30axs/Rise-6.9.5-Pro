import * as T from 'three';
import {
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
  for (const e of streets) {
    const a = nodes[e.a],
      b = nodes[e.b],
      h = e.bridge ? 0.66 : 0.32;
    if (e.walk) {
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
    if (form === 'stop' || form === 'gate') {
      const span = w * 0.71;
      for (const u of [-0.43, 0.43])
        box(span * u, 0, 0.44, 0.64, 0, h, '#647879');
      box(
        0,
        0,
        span + 0.8,
        form === 'gate' ? 1.15 : d * 0.48,
        h - 0.3,
        0.46,
        form === 'gate' ? '#996855' : '#9eb8b7'
      );
      if (form === 'stop') {
        box(0, 0, span * 0.73, 0.7, 0.4, 0.47, '#9d8064');
        box(span * 0.41, d * 0.17, 0.8, 0.32, 0.2, 2.6, '#e8c878');
      }
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
