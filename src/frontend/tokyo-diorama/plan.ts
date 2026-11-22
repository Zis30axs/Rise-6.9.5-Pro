import data from '../../../assets/models/unread-city-tokyo-sandbox-data.json';
import { districtMapPlaces, isMapDistrict } from '../map-districts';
import { tokyoDistricts, tokyoLocationPosition } from '../tokyo-sandbox-map';
export type Point = [number, number];
export interface Street {
  a: number;
  b: number;
  width: number;
  bridge: boolean;
  walk?: boolean;
}
export interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
  angle: number;
  street: [number, number];
  district: string;
  seed: number;
}
export interface Site extends Lot {
  key: string;
  title: string;
  form: string;
  h: number;
  ids: string[];
  polygon: Point[];
  door: Point;
  entry: Point;
}
export const nodes: Point[] = [];
export const streets: Street[] = [];
export const sites: Site[] = [];
export const byId = new Map<string, Site>();
export const scenery: Site[] = [];
export const destinations = new Map<
  string,
  ReturnType<typeof districtMapPlaces>[number]
>();
const xs = [
  -302, -257, -207, -181, -142, -96, -74, -30, 15, 55, 83, 119, 158, 179, 207,
  248, 275, 311, 350, 393,
];
const zs = [
  -242, -204, -165, -127, -92, -68, -30, 10, 47, 78, 117, 146, 188, 209, 248,
  283, 325,
];
const riverCol = 13,
  cols = xs.length;
export const sections: { left: Point; right: Point }[] = [];
export const mid = (a: Point, b: Point, t = 0.5): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
export const distance = (a: Point, b: Point) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
export function local(s: Lot, u: number, v: number): Point {
  const c = Math.cos(s.angle),
    k = Math.sin(s.angle);
  return [s.x + c * u - k * v, s.z + k * u + c * v];
}
export function closest(p: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  return mid(
    a,
    b,
    Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)
      )
    )
  );
}
export function rand(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function contains(p: Point, poly: Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function warped(x: number, z: number): Point {
  const bend = 16 * Math.sin((z + 62) / 61) + 12 * Math.sin(z / 122);
  return [
    x +
      bend * Math.exp(-((x - 195) ** 2) / 12000) +
      3.5 * Math.sin(z / 69 + x / 115),
    z + 5 * Math.sin(x / 64 + z / 131) + 3 * Math.sin((x - z) / 76),
  ];
}
for (const z of zs) for (const x of xs) nodes.push(warped(x, z));
const node = (i: number, j: number) => j * cols + i;
const special = (i: number, j: number) =>
  i >= 0 && j >= 0 && i < cols - 1 && j < zs.length - 1
    ? i === riverCol
      ? 'river'
      : xs[i] >= -207 && xs[i + 1] <= 15 && zs[j] >= 209
        ? 'airport'
        : xs[i] >= -74 && xs[i + 1] <= 83 && zs[j + 1] <= -92
          ? 'mountain'
          : xs[i] >= 275 && xs[i + 1] <= 311 && zs[j] >= -92 && zs[j + 1] <= -30
            ? 'asukayama'
            : ''
    : '';
const adjacent = new Map<number, number[]>();
function street(a: number, b: number, width: number, bridge = false) {
  streets.push({ a, b, width, bridge });
  for (const [i, j] of [
    [a, b],
    [b, a],
  ]) {
    const list = adjacent.get(i) || [];
    list.push(j);
    adjacent.set(i, list);
  }
}
for (let j = 0; j < zs.length; j++)
  for (let i = 0; i < cols; i++) {
    const n = node(i, j);
    if (i === riverCol) sections.push({ left: nodes[n], right: nodes[n + 1] });
    if (i < cols - 1) {
      const top = special(i, j - 1),
        bottom = special(i, j);
      if (i === riverCol) {
        if ([2, 5, 8, 10, 12, 14].includes(j)) street(n, n + 1, 5.8, true);
      } else if (!(top && top === bottom))
        street(n, n + 1, [4, 8, 10, 12].includes(j) ? 5.4 : 3.1);
    }
    if (j < zs.length - 1) {
      const left = special(i - 1, j),
        right = special(i, j);
      if (!(left && left === right))
        street(n, n + cols, [5, 10, 14, 17].includes(i) ? 5.4 : 3.1);
    }
  }
export function districtAt(x: number, z: number) {
  let best = tokyoDistricts[0],
    score = Infinity;
  for (const d of tokyoDistricts) {
    const dx = Math.max(d.minX - x, 0, x - d.maxX),
      dz = Math.max(d.minZ - z, 0, z - d.maxZ);
    const k = dx * dx + dz * dz + Math.hypot(x - d.x, z - d.z) * 0.01;
    if (k < score) {
      best = d;
      score = k;
    }
  }
  return best.id;
}
const lots: Lot[] = [];
for (let j = 0; j < zs.length - 1; j++)
  for (let i = 0; i < cols - 1; i++) {
    if (special(i, j)) continue;
    const n = node(i, j),
      a = nodes[n],
      b = nodes[n + 1],
      c = nodes[n + cols],
      d = nodes[n + cols + 1];
    for (let side = 0; side < 2; side++)
      for (let part = 0; part < 2; part++) {
        const edge: [number, number] = side
            ? [n + cols, n + cols + 1]
            : [n, n + 1],
          front = side ? c : a,
          end = side ? d : b;
        const center = mid(
          mid(a, b, (part + 0.5) / 2),
          mid(c, d, (part + 0.5) / 2),
          side ? 0.73 : 0.27
        );
        const depth = Math.min(distance(a, c), distance(b, d)) * 0.43 - 3.8,
          w = distance(front, end) * 0.45 - 3.3;
        lots.push({
          x: center[0],
          z: center[1],
          w,
          d: depth,
          angle:
            Math.atan2(end[1] - front[1], end[0] - front[0]) +
            (side ? 0 : Math.PI),
          street: edge,
          district: districtAt(...center),
          seed: n * 13 + side * 2 + part,
        });
      }
  }
const groups: Record<string, string[]> = {
  library: ['library', 'study-room'],
  teaching: ['teaching', 'classroom'],
  dorm: ['dorm', 'dorm-room'],
  'street-cafe': ['street-cafe', 'margo-cafe-room'],
  'minami-ikebukuro-park': ['minami-ikebukuro-park', 'book-cafe'],

  sunshine: [
    'aquarium',
    'manten-planetarium',
    'sunshine-shopping',
    'observation-roof',
    'cosplay-convention',
  ],
  ring: ['ring-entrance', 'ring-desk'],
  clinic: ['clinic', 'clinic-room'],
  'onigawara-laundry': ['onigawara-laundry', 'onigawara-laundry-home'],
  circle: ['circle', 'circle-cafe', 'circle-studio'],
  'asukayama-park': ['asukayama-park', 'asukayama'],
};
const titles: Record<string, string> = {
  sunshine: 'Sunshine City 阳光城',
  ring: 'Livehouse RiNG',
  circle: 'CiRCLE 现场屋',
  'asukayama-park': '飞鸟山公园',
};
const types: Record<string, string> = {
  sunshine: 'sunshine',
  'chitose-bridge': 'bridge',
  'takao-summit': 'lookout',
  'otsuka-diner': 'cafe',
  'matcha-shop': 'cafe',
  'ochanomizu-music': 'arcade',
  'akihabara-games': 'arcade',
  'jinbocho-books': 'arcade',
  'harajuku-pop-up': 'arcade',
  ring: 'music',
  library: 'library',
  teaching: 'school',
  sports: 'stadium',
  courthouse: 'court',
  gate: 'gate',
  junction: 'square',
  home: 'stop',
  commercial: 'stop',
  downtown: 'stop',
  'grand-commercial': 'stop',
  'city-park': 'greenway',
  'pocket-park': 'park',
  'minami-ikebukuro-park': 'park',
  'asukayama-park': 'fountain',
  'haneda-airport': 'airport',
  'toyokawa-executive-tower': 'tower',
  'soyo-house': 'tower',
  'majo-highrise-home': 'tower',
  'koto-apartment': 'books',
  clinic: 'clinic',
  'bus-stop': 'stop',
  'street-cafe': 'cafe',
  cafe: 'cafe',
  bookshop: 'books',
  circle: 'music',
  'circle-studio': 'studio',
  livehouse: 'music',
  'ktv-lounge': 'music',
  highland: 'stop',
  'residential-mutsumi': 'villa',
  'takao-mountain': 'station',
  'takao-onsen': 'onsen',
  'takao-teahouse': 'teahouse',
  'construction-site': 'works',
  'otome-road': 'arcade',
  'residential-supermarket': 'shop',
  convenience: 'shop',
  'onigawara-laundry': 'shop',
};
const heights: Record<string, number> = {
  sunshine: 47,
  tower: 34,
  library: 10,
  school: 13,
  stadium: 2,
  court: 13,
  gate: 5,
  square: 0.1,
  stop: 3.4,
  park: 0.2,
  fountain: 0.6,
  greenway: 0.2,
  airport: 13,
  books: 13,
  clinic: 7,
  cafe: 5,
  studio: 6,
  music: 9,
  villa: 7,
  onsen: 5,
  pagoda: 13,
  teahouse: 5,
  station: 7,
  works: 9,
  arcade: 6,
  shop: 6,
  bridge: 1.3,
  lookout: 5,
};
function poly(s: Lot, form: string): Point[] {
  const w = s.w / 2,
    d = s.d / 2,
    k = Math.min(w, d) * 0.25;
  if (['park', 'greenway', 'fountain', 'stadium', 'square'].includes(form))
    return [
      [-w + k, -d],
      [w * 0.55, -d],
      [w, -d * 0.3],
      [w * 0.87, d * 0.7],
      [w * 0.3, d],
      [-w * 0.76, d * 0.86],
      [-w, d * 0.37],
      [-w, -d * 0.48],
    ].map(([u, v]) => local(s, u, v));
  return [
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
  ].map(([u, v]) => local(s, u, v));
}
// Enforce a curb setback against both street directions on skewed blocks.
const corridors = streets
  .filter((e) => !e.bridge)
  .map((e) => ({ a: nodes[e.a], b: nodes[e.b], radius: e.width / 2 + 0.66 }));
function setback(l: Lot): Lot {
  const near = corridors.filter(
    ({ a, b, radius }) =>
      distance([l.x, l.z], closest([l.x, l.z], a, b)) <
      Math.hypot(l.w, l.d) / 2 + radius + 1
  );
  let fit = { ...l };
  for (let k = 0; k < 18; k++) {
    const corners = poly(fit, 'building');
    if (
      near.every(({ a, b, radius }) =>
        corners.every((p) => distance(p, closest(p, a, b)) >= radius)
      )
    )
      break;
    fit = { ...fit, w: fit.w * 0.94, d: fit.d * 0.95 };
  }
  return fit;
}
function structure(
  l: Lot,
  key: string,
  title: string,
  ids: string[],
  form: string,
  h: number
): Site {
  if (
    ![
      'bridge',
      'greenway',
      'airport',
      'station',
      'onsen',
      'lookout',
      'teahouse',
      'fountain',
    ].includes(form)
  )
    l = setback(l);
  const door = local(l, 0, l.d / 2),
    entry = closest(door, nodes[l.street[0]], nodes[l.street[1]]);
  return {
    ...l,
    key,
    title,
    form,
    h,
    ids,
    polygon: poly(l, form),
    door,
    entry,
  };
}
const curated: Record<string, Point> = {
  'city-park': [166, -97],
  'majo-highrise-home': [178, 110],
  'kamezaki-residence': [177, 56],
  'residential-taki': [167, -82],
  'residential-arisa': [182, -69],
  'otsuka-diner': [152, 51],
  'matcha-shop': [93, 118],
  'ochanomizu-music': [70, 8],
  'akihabara-games': [85, 6],
  'jinbocho-books': [32, 29],
  'harajuku-pop-up': [-168, -41],
  sunshine: [150, 88],
  ring: [110, 126],
  'minami-ikebukuro-park': [120, 155],
  'otome-road': [165, 95],
  'onigawara-laundry': [-134, 116],
  'residential-supermarket': [-119, 131],
};
const used = new Set<number>();
for (const district of tokyoDistricts) {
  if (!isMapDistrict(district.id)) continue;
  const rows = districtMapPlaces(district.id).filter(
    (p) =>
      !!tokyoLocationPosition(
        p.id,
        district.id as ReturnType<
          (typeof import('../map-districts'))['locationDistrict']
        >
      )
  );
  for (const place of rows) destinations.set(place.id, place);
  const blockForms = new Set([
    'sunshine',
    'stadium',
    'library',
    'school',
    'court',
    'park',
  ]);
  const keyFor = (id: string) =>
    Object.keys(groups).find((k) => groups[k].includes(id)) || id;
  const priority = (id: string) => {
    const key = keyFor(id);
    return key === 'sunshine'
      ? -4
      : blockForms.has(types[key])
        ? -3
        : types[key] || groups[key]
          ? -1
          : 0;
  };
  for (const place of [...rows].sort(
    (a, b) => priority(a.id) - priority(b.id)
  )) {
    if (byId.has(place.id) || place.id === 'book-cafe') continue;
    const key = keyFor(place.id),
      ids = groups[key] || [key];
    const building = data.buildings.find(
        (b) => b.roomId && ids.includes(b.roomId)
      ),
      pt = tokyoLocationPosition(ids[0], district.id)!;
    const desired: Point =
      curated[key] || (building ? [building.x, building.z] : [pt.x, pt.z]);
    const form =
      types[key] ||
      (/office/.test(key)
        ? 'office'
        : /house|residential|residence|home/.test(key)
          ? 'house'
          : 'flat');
    let lot: Lot;
    if (form === 'greenway') {
      const j = 3,
        a = sections[j],
        b = sections[j + 1],
        near = mid(a.left, a.right, 0.239),
        far = mid(b.left, b.right, 0.239),
        c = mid(near, far);
      lot = {
        x: c[0],
        z: c[1],
        w: distance(near, far) * 0.78,
        d: 3.2,
        angle: Math.atan2(far[1] - near[1], far[0] - near[0]),
        street: [node(riverCol, j), node(riverCol, j + 1)],
        district: district.id,
        seed: 5051,
      };
    } else if (form === 'bridge') {
      const e = streets.find((e) => e.bridge && Math.floor(e.a / cols) === 8)!;
      const a = nodes[e.a],
        b = nodes[e.b],
        p = mid(a, b);
      lot = {
        x: p[0],
        z: p[1],
        w: distance(a, b) * 0.78,
        d: e.width + 1,
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
        street: [e.a, e.b],
        district: district.id,
        seed: 891,
      };
    } else if (
      district.id === 'takao-mountain' ||
      district.id === 'haneda-airport' ||
      key === 'asukayama-park'
    ) {
      const x =
          key === 'haneda-airport'
            ? -115
            : key === 'asukayama-park'
              ? 293
              : desired[0],
        z =
          key === 'haneda-airport'
            ? 226
            : key === 'asukayama-park'
              ? -60
              : desired[1];
      const e = streets
        .filter((e) => !e.bridge)
        .reduce((a, b) =>
          distance([x, z], closest([x, z], nodes[a.a], nodes[a.b])) <
          distance([x, z], closest([x, z], nodes[b.a], nodes[b.b]))
            ? a
            : b
        );
      lot = {
        x,
        z,
        w: form === 'airport' ? 106 : form === 'fountain' ? 23 : 15,
        d: form === 'airport' ? 16 : form === 'fountain' ? 40 : 10,
        angle: form === 'airport' ? Math.PI : 0,
        street: [e.a, e.b],
        district: district.id,
        seed: sites.length + 1,
      };
    } else {
      const candidates = lots
        .map((l, i) => ({
          l,
          i,
          cost:
            distance([l.x, l.z], desired) +
            (l.district !== district.id ? 105 : 0),
        }))
        .filter((o) => !used.has(o.i))
        .sort((a, b) => a.cost - b.cost);
      const full = blockForms.has(form)
        ? candidates.find(({ l, i, cost }) => {
            const a = i - (i % 4);
            return (
              cost < candidates[0].cost + 40 &&
              l.w >= 9 &&
              l.d >= 7 &&
              [a, a + 1, a + 2, a + 3].every((k) => !used.has(k))
            );
          })
        : undefined;
      const { l, i } = full || candidates[0];
      used.add(i);
      lot = { ...l, district: district.id };
      if (full) {
        const a = i - (i % 4),
          c = lots.slice(a, a + 4),
          x = c.reduce((t, l) => t + l.x, 0) / 4,
          z = c.reduce((t, l) => t + l.z, 0) / 4;
        const front = mid([c[0].x, c[0].z], [c[1].x, c[1].z]),
          rear = mid([c[2].x, c[2].z], [c[3].x, c[3].z]);
        lot = {
          ...lot,
          x,
          z,
          w: Math.min(...c.map((l) => l.w)) * 2 + 1.6,
          d: distance(front, rear) + Math.min(...c.map((l) => l.d)),
        };
        for (let k = a; k < a + 4; k++) used.add(k);
      }
      // A single street frontage can span the adjacent plot in the same block.
      if (
        !full &&
        [
          'sunshine',
          'stadium',
          'school',
          'court',
          'library',
          'park',
          'greenway',
          'tower',
          'music',
          'villa',
        ].includes(form)
      ) {
        const k = i % 2 === 0 ? i + 1 : i - 1,
          other = lots[k];
        if (!used.has(k) && other && other.street[0] === l.street[0]) {
          used.add(k);
          lot = {
            ...lot,
            x: (l.x + other.x) / 2,
            z: (l.z + other.z) / 2,
            w: l.w + other.w + 1.6,
          };
        }
      }
    }
    const s = structure(
      lot,
      key,
      titles[key] || rows.find((p) => p.id === ids[0])?.name || place.name,
      ids,
      form,
      heights[form] ?? (form === 'house' ? 5.6 : 11)
    );
    if (form === 'bridge') {
      s.door = mid(nodes[s.street[0]], nodes[s.street[1]], 0.1);
      s.entry = s.door;
    }
    sites.push(s);
    for (const id of ids) byId.set(id, s);
  }
}
// The mountain's walking network meets the city at the foothill intersection.
const mountain = sites.filter((s) => s.district === 'takao-mountain');
const foothill = node(7, 4),
  trailStops: Record<string, number> = {};
function trail(a: number, p: Point) {
  const b = nodes.push(p) - 1;
  street(a, b, 1.55);
  streets[streets.length - 1].walk = true;
  return b;
}
for (const [key, via] of [
  ['takao-mountain', [2, -99]],
  ['takao-onsen', [39, -98]],
  ['takao-teahouse', [-32, -130]],
  ['takao-summit', [-41, -182]],
] as [string, Point][]) {
  const s = mountain.find((s) => s.key === key)!;
  const parent =
    key === 'takao-teahouse'
      ? trailStops['takao-mountain']
      : key === 'takao-summit'
        ? trailStops['takao-teahouse']
        : foothill;
  const corner =
    key === 'takao-teahouse'
      ? trail(parent, [-25, -99])
      : key === 'takao-summit'
        ? trail(parent, [-47, -158])
        : parent;
  const a = trail(corner, via),
    b = trail(a, s.door);
  s.street = [a, b];
  s.entry = s.door;
  trailStops[key] = a;
}
for (let i = 0; i < lots.length; i++) {
  if (used.has(i)) continue;
  const l = lots[i],
    r = rand(l.seed),
    city = ['commercial', 'grand-commercial', 'downtown'].includes(l.district),
    edge = l.x < -252 || l.z < -165 || l.x > 315;
  const form =
    r < (edge ? 0.29 : 0.09)
      ? 'garden'
      : city
        ? r > 0.77
          ? 'office'
          : r > 0.43
            ? 'flat'
            : 'shop'
        : r > 0.72
          ? 'flat'
          : r > 0.38
            ? 'house'
            : r > 0.21
              ? 'shop'
              : 'garden';
  const lot = {
    ...l,
    w: l.w * (0.71 + 0.22 * rand(i + 13)),
    d: l.d * (0.72 + 0.24 * rand(i - 5)),
  };
  const h =
    form === 'office'
      ? 13 + rand(i + 11) * 17
      : form === 'flat'
        ? 7 + rand(i - 7) * (city ? 13 : 7)
        : form === 'house'
          ? 4 + rand(i + 17) * 3
          : 4 + rand(i) * 2;
  scenery.push(structure(lot, '', '', [], form, h));
}
export function roadRoute(a: Site, b: Site): Point[] {
  if (a === b) return [a.door];
  if (a.street[0] === b.street[0] && a.street[1] === b.street[1])
    return [a.door, a.entry, b.entry, b.door];
  const costs = new Map<number, number>(),
    prev = new Map<number, number>(),
    done = new Set<number>();
  for (const n of a.street) costs.set(n, distance(a.entry, nodes[n]));
  while (true) {
    let at = -1,
      cost = Infinity;
    for (const [n, c] of costs)
      if (!done.has(n) && c < cost) {
        at = n;
        cost = c;
      }
    if (at < 0) break;
    done.add(at);
    for (const n of adjacent.get(at) || []) {
      const v = cost + distance(nodes[at], nodes[n]);
      if (v < (costs.get(n) ?? Infinity)) {
        costs.set(n, v);
        prev.set(n, at);
      }
    }
  }
  const end = b.street.reduce((x, y) =>
    (costs.get(x) ?? Infinity) + distance(nodes[x], b.entry) <
    (costs.get(y) ?? Infinity) + distance(nodes[y], b.entry)
      ? x
      : y
  );
  if (!costs.has(end)) return [];
  const path = [end];
  while (prev.has(path[0])) path.unshift(prev.get(path[0])!);
  return [a.door, a.entry, ...path.map((n) => nodes[n]), b.entry, b.door];
}
export function groundHeight(x: number, z: number) {
  const h = Math.max(0, 1 - ((x - 8) / 79) ** 2 - ((z + 176) / 82) ** 2);
  return 27 * h * h;
}
