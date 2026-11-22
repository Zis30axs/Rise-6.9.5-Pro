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
          : xs[i] >= -74 &&
              xs[i + 1] <= 55 &&
              zs[j] >= -68 &&
              zs[j + 1] <= 47
            ? 'campus'
            : xs[i] >= 275 && xs[i + 1] <= 311 && zs[j] >= -92 && zs[j + 1] <= -30
              ? 'asukayama'
              : xs[i] >= -74 && xs[i + 1] <= 83 && zs[j] >= 117 && zs[j + 1] <= 188
                ? 'downtown'
                : xs[i] >= -207 && xs[i + 1] <= -96 && zs[j] >= 78 && zs[j + 1] <= 188
                  ? 'home'
                  : xs[i] >= 119 && xs[i + 1] <= 179 && zs[j] >= -165 && zs[j + 1] <= -68
                    ? 'riverside'
                    : xs[i] >= 350 && xs[i + 1] <= 393 && zs[j] >= -127 && zs[j + 1] <= -68
                      ? 'highland'
                      : xs[i] >= 83 && xs[i + 1] <= 179 && zs[j] >= 47 && zs[j + 1] <= 188
                        ? 'commercial'
                        : xs[i] >= -207 && xs[i + 1] <= -96 && zs[j] >= -165 && zs[j + 1] <= 10
                          ? 'grand-commercial'
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
      } else if (i === 7 && j === 8) {
        const gateCurb = nodes.push(mid(nodes[n], nodes[n + 1], 0.5)) - 1;
        street(n, gateCurb, 5.4);
        street(gateCurb, n + 1, 5.4);
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
const campusNW = nodes[node(6, 5)],
  campusNE = nodes[node(9, 5)],
  campusSE = nodes[node(9, 8)],
  campusSW = nodes[node(6, 8)];
export function campusAt(u: number, v: number): Point {
  return mid(mid(campusNW, campusNE, u), mid(campusSW, campusSE, u), v);
}
export const campusAngle = Math.atan2(
  campusSE[1] - campusSW[1],
  campusSE[0] - campusSW[0]
);
export const campusEnclosure: Point[] = [
  campusAt(0.044, 0.052),
  campusAt(0.956, 0.052),
  campusAt(0.956, 0.942),
  campusAt(0.044, 0.942),
];
const campusSouthCurb =
  streets.find((e) => e.a === node(7, 8) && e.b !== node(8, 8) && !e.walk && e.width > 4)
    ?.b ?? node(7, 8);
function campusPath(a: number, b: number, width: number) {
  street(a, b, width);
  streets[streets.length - 1].walk = true;
}
function campusNode(u: number, v: number) {
  return nodes.push(campusAt(u, v)) - 1;
}
const cGatePlaza = campusNode(0.48, 0.86),
  cPromenade = campusNode(0.48, 0.74),
  cLibraryPlaza = campusNode(0.48, 0.56),
  cQuadCenter = campusNode(0.48, 0.34),
  cTeachingPlaza = campusNode(0.48, 0.25),
  cWestSouth = campusNode(0.28, 0.74),
  cDormPlaza = campusNode(0.28, 0.45),
  cWestNorth = campusNode(0.28, 0.25),
  cEastSouth = campusNode(0.64, 0.74),
  cSportsPlaza = campusNode(0.64, 0.45),
  cEastNorth = campusNode(0.64, 0.25);
campusPath(campusSouthCurb, cGatePlaza, 3.0);
campusPath(cGatePlaza, cPromenade, 3.0);
campusPath(cPromenade, cLibraryPlaza, 2.8);
campusPath(cLibraryPlaza, cQuadCenter, 2.6);
campusPath(cQuadCenter, cTeachingPlaza, 2.6);
campusPath(cWestSouth, cPromenade, 2.2);
campusPath(cPromenade, cEastSouth, 2.2);
campusPath(cWestSouth, cDormPlaza, 2.2);
campusPath(cDormPlaza, cWestNorth, 2.1);
campusPath(cWestNorth, cTeachingPlaza, 2.1);
campusPath(cEastSouth, cSportsPlaza, 2.2);
campusPath(cSportsPlaza, cEastNorth, 2.1);
campusPath(cEastNorth, cTeachingPlaza, 2.1);
campusPath(node(6, 7), cWestSouth, 2.0);
campusPath(node(9, 7), cEastSouth, 2.0);
const campusLayout: Record<
  string,
  { u: number; v: number; w: number; d: number; angle: number; street: [number, number] }
> = {
  teaching: {
    u: 0.48,
    v: 0.145,
    w: 40,
    d: 15.5,
    angle: campusAngle,
    street: [cQuadCenter, cTeachingPlaza],
  },
  library: {
    u: 0.48,
    v: 0.45,
    w: 30,
    d: 14,
    angle: campusAngle,
    street: [cPromenade, cLibraryPlaza],
  },
  dorm: {
    u: 0.155,
    v: 0.45,
    w: 34,
    d: 17.5,
    angle: campusAngle - Math.PI / 2,
    street: [cWestSouth, cDormPlaza],
  },
  sports: {
    u: 0.815,
    v: 0.45,
    w: 46,
    d: 26,
    angle: campusAngle + Math.PI / 2,
    street: [cEastSouth, cSportsPlaza],
  },
  cafe: {
    u: 0.59,
    v: 0.65,
    w: 11.5,
    d: 8,
    angle: campusAngle,
    street: [cPromenade, cEastSouth],
  },
  gate: {
    u: 0.48,
    v: 0.9,
    w: 22,
    d: 6.8,
    angle: campusAngle,
    street: [campusSouthCurb, cGatePlaza],
  },
};
export const campusSiteKeys = new Set(Object.keys(campusLayout));

export interface ResidentialCommunity {
  id: 'downtown' | 'home' | 'riverside' | 'highland' | 'commercial' | 'grand-commercial';
  name: string;
  at: (u: number, v: number) => Point;
  angle: number;
  enclosure: Point[];
  siteKeys: Set<string>;
}

function makeEnclave(
  id: ResidentialCommunity['id'],
  name: string,
  i0: number,
  i1: number,
  j0: number,
  j1: number,
  insetU = 0.045,
  insetV = 0.055
) {
  const nw = nodes[node(i0, j0)],
    ne = nodes[node(i1, j0)],
    se = nodes[node(i1, j1)],
    sw = nodes[node(i0, j1)];
  const at = (u: number, v: number): Point =>
    mid(mid(nw, ne, u), mid(sw, se, u), v);
  const angle = Math.atan2(se[1] - sw[1], se[0] - sw[0]);
  const enclosure: Point[] = [
    at(insetU, insetV),
    at(1 - insetU, insetV),
    at(1 - insetU, 1 - insetV),
    at(insetU, 1 - insetV),
  ];
  const ptNode = (u: number, v: number) => nodes.push(at(u, v)) - 1;
  return { id, name, at, angle, enclosure, ptNode };
}

// 1. 目白台豪华住宅区 (downtown): 西区高密度豪宅塔楼群(长崎素世等) + 东区名门庭院宅邸区(丰川/王冢/二阶堂/莲见/清告)
const dt = makeEnclave('downtown', '目白台豪华住宅区', 6, 10, 10, 12, 0.038, 0.068);
const dtWestGate = dt.ptNode(0.24, 0.07),
  dtTowerPlaza = dt.ptNode(0.24, 0.54),
  dtTowerWest = dt.ptNode(0.12, 0.54),
  dtTowerEast = dt.ptNode(0.39, 0.54),
  dtTowerSouth = dt.ptNode(0.24, 0.88),
  dtCenterNorth = dt.ptNode(0.49, 0.14),
  dtCenterMid = dt.ptNode(0.49, 0.54),
  dtCenterSouth = dt.ptNode(0.49, 0.88),
  dtEastNorth = dt.ptNode(0.71, 0.24),
  dtEastMid = dt.ptNode(0.71, 0.54),
  dtEastSouth = dt.ptNode(0.71, 0.82),
  dtEastGate = dt.ptNode(0.95, 0.54);
campusPath(node(7, 10), dtWestGate, 2.6);
campusPath(dtWestGate, dtTowerPlaza, 2.5);
campusPath(dtTowerWest, dtTowerPlaza, 2.1);
campusPath(dtTowerPlaza, dtTowerEast, 2.2);
campusPath(dtTowerPlaza, dtTowerSouth, 2.2);
campusPath(dtTowerSouth, node(7, 12), 2.2);
campusPath(node(8, 10), dtCenterNorth, 2.8);
campusPath(dtCenterNorth, dtCenterMid, 2.6);
campusPath(dtCenterMid, dtCenterSouth, 2.4);
campusPath(dtCenterSouth, node(8, 12), 2.4);
campusPath(dtTowerEast, dtCenterMid, 2.2);
campusPath(dtCenterNorth, dtEastNorth, 2.1);
campusPath(dtCenterMid, dtEastMid, 2.3);
campusPath(dtCenterSouth, dtEastSouth, 2.1);
campusPath(dtEastNorth, dtEastMid, 2.2);
campusPath(dtEastMid, dtEastSouth, 2.2);
campusPath(dtEastMid, dtEastGate, 2.2);
campusPath(dtEastGate, node(10, 11), 2.2);

// 2. 杂司谷温情生活社区 (home): 北区低层公寓院(艾玛/黑部/梅露露) + 中轴生活街角与公园 + 西南MyGO小巷 + 东南家庭院落
const hm = makeEnclave('home', '杂司谷生活社区', 2, 5, 9, 12, 0.048, 0.048);
const hmNorthWest = hm.ptNode(0.20, 0.34),
  hmNorthMid = hm.ptNode(0.48, 0.34),
  hmNorthEast = hm.ptNode(0.76, 0.34),
  hmNorthGate = hm.ptNode(0.48, 0.06),
  hmMidWest = hm.ptNode(0.20, 0.58),
  hmParkCenter = hm.ptNode(0.48, 0.58),
  hmMidEast = hm.ptNode(0.76, 0.58),
  hmEastGate = hm.ptNode(0.95, 0.58),
  hmWestGate = hm.ptNode(0.06, 0.58),
  hmSouthWest = hm.ptNode(0.25, 0.78),
  hmSouthMid = hm.ptNode(0.48, 0.78),
  hmSouthEast = hm.ptNode(0.72, 0.78),
  hmSouthGate = hm.ptNode(0.48, 0.95);
campusPath(node(4, 9), hmNorthGate, 2.2);
campusPath(hmNorthGate, hmNorthMid, 2.2);
campusPath(hmNorthWest, hmNorthMid, 2.1);
campusPath(hmNorthMid, hmNorthEast, 2.1);
campusPath(hmNorthWest, hmMidWest, 2.1);
campusPath(hmNorthMid, hmParkCenter, 2.3);
campusPath(hmNorthEast, hmMidEast, 2.1);
campusPath(node(2, 11), hmWestGate, 2.2);
campusPath(hmWestGate, hmMidWest, 2.2);
campusPath(hmMidWest, hmParkCenter, 2.4);
campusPath(hmParkCenter, hmMidEast, 2.4);
campusPath(hmMidEast, hmEastGate, 2.6);
campusPath(hmEastGate, node(5, 11), 2.6);
campusPath(hmMidWest, hmSouthWest, 2.0);
campusPath(hmParkCenter, hmSouthMid, 2.2);
campusPath(hmMidEast, hmSouthEast, 2.0);
campusPath(hmSouthWest, hmSouthMid, 2.0);
campusPath(hmSouthMid, hmSouthEast, 2.0);
campusPath(hmSouthMid, hmSouthGate, 2.2);
campusPath(hmSouthGate, node(4, 12), 2.2);

// 3. 神田川河岸公寓社区 (riverside): 椎名立希 / 紫藤爱丽莎 / 照泽 / 广崎教员 / 单身公寓
const rv = makeEnclave('riverside', '神田川河岸社区', 11, 13, 2, 5, 0.125, 0.048);
const rvNorth = rv.ptNode(0.50, 0.16),
  rvMidNorth = rv.ptNode(0.50, 0.36),
  rvCenter = rv.ptNode(0.50, 0.54),
  rvSouth = rv.ptNode(0.50, 0.80),
  rvWestGate = rv.ptNode(0.14, 0.54),
  rvEastNorth = rv.ptNode(0.86, 0.36),
  rvEastSouth = rv.ptNode(0.86, 0.70);
campusPath(node(12, 2), rvNorth, 2.2);
campusPath(rvNorth, rvMidNorth, 2.2);
campusPath(rvMidNorth, rvCenter, 2.3);
campusPath(rvCenter, rvSouth, 2.2);
campusPath(rvSouth, node(12, 5), 2.2);
campusPath(node(11, 4), rvWestGate, 2.1);
campusPath(rvWestGate, rvCenter, 2.1);
campusPath(rvMidNorth, rvEastNorth, 2.1);
campusPath(rvEastNorth, node(13, 3), 2.1);
campusPath(rvSouth, rvEastSouth, 2.1);
campusPath(rvEastSouth, node(13, 4), 2.1);

// 4. 高原坡地别墅社区 (highland): 若叶睦家与高原接驳站
const hl = makeEnclave('highland', '高原坡地别墅社区', 18, 19, 3, 5, 0.075, 0.065);
const hlCourt = hl.ptNode(0.50, 0.56),
  hlSouthGate = hl.ptNode(0.50, 0.90),
  hlWestGate = hl.ptNode(0.09, 0.56);
campusPath(node(18, 4), hlWestGate, 2.2);
campusPath(hlWestGate, hlCourt, 2.2);
campusPath(hlCourt, hlSouthGate, 2.2);
campusPath(hlSouthGate, node(18, 5), 2.2);

// 5. 池袋／东池袋商业综合区 (commercial): 阳光城核心广场 + 乙女路/茶寮步行街 + RiNG/南池袋公园 + 东侧都会公寓带
const cm = makeEnclave('commercial', '池袋商业综合区', 10, 13, 8, 12, 0.055, 0.045);
const cmNorthGate = cm.ptNode(0.50, 0.05),
  cmNorthWest = cm.ptNode(0.32, 0.21),
  cmNorthMid = cm.ptNode(0.50, 0.21),
  cmNorthEast = cm.ptNode(0.68, 0.21),
  cmWestNorth = cm.ptNode(0.32, 0.39),
  cmWestMid = cm.ptNode(0.32, 0.56),
  cmCenterSouth = cm.ptNode(0.50, 0.56),
  cmEastNorth = cm.ptNode(0.68, 0.39),
  cmEastMid = cm.ptNode(0.68, 0.56),
  cmWestGate = cm.ptNode(0.06, 0.56),
  cmEastGate = cm.ptNode(0.94, 0.56),
  cmSouthWest = cm.ptNode(0.32, 0.74),
  cmSouthMid = cm.ptNode(0.58, 0.74),
  cmSouthEast = cm.ptNode(0.68, 0.74),
  cmSouthGate = cm.ptNode(0.58, 0.94);
campusPath(node(11, 8), cmNorthGate, 2.8);
campusPath(cmNorthGate, cmNorthMid, 2.8);
campusPath(cmNorthWest, cmNorthMid, 2.4);
campusPath(cmNorthMid, cmNorthEast, 2.4);
campusPath(cmNorthWest, cmWestNorth, 2.4);
campusPath(cmWestNorth, cmWestMid, 2.5);
campusPath(cmNorthEast, cmEastNorth, 2.4);
campusPath(cmEastNorth, cmEastMid, 2.5);
campusPath(node(10, 10), cmWestGate, 2.8);
campusPath(cmWestGate, cmWestMid, 2.8);
campusPath(cmWestMid, cmCenterSouth, 3.0);
campusPath(cmCenterSouth, cmEastMid, 3.0);
campusPath(cmEastMid, cmEastGate, 2.6);
campusPath(cmEastGate, node(13, 10), 2.6);
campusPath(cmWestMid, cmSouthWest, 2.5);
campusPath(cmCenterSouth, cmSouthMid, 2.6);
campusPath(cmEastMid, cmSouthEast, 2.4);
campusPath(cmSouthWest, cmSouthMid, 2.5);
campusPath(cmSouthMid, cmSouthEast, 2.4);
campusPath(cmSouthMid, cmSouthGate, 2.6);
campusPath(cmSouthGate, node(12, 12), 2.6);

// 6. 新宿／大型商业娱乐与CBD核心区 (grand-commercial): 北区丰川总裁楼CBD摩天群 + 中央站前广场 + 南区演艺潮流步行街
const gc = makeEnclave('grand-commercial', '新宿大型商业娱乐区', 2, 5, 2, 7, 0.048, 0.042);
const gcNorthGate = gc.ptNode(0.50, 0.05),
  gcCbdWest = gc.ptNode(0.34, 0.25),
  gcCbdCenter = gc.ptNode(0.50, 0.25),
  gcCbdEast = gc.ptNode(0.66, 0.25),
  gcPlazaWest = gc.ptNode(0.34, 0.46),
  gcPlazaCenter = gc.ptNode(0.50, 0.46),
  gcPlazaEast = gc.ptNode(0.66, 0.46),
  gcWestGate = gc.ptNode(0.06, 0.46),
  gcEastGate = gc.ptNode(0.94, 0.46),
  gcEntWest = gc.ptNode(0.34, 0.64),
  gcEntCenter = gc.ptNode(0.50, 0.64),
  gcEntEast = gc.ptNode(0.66, 0.64),
  gcSouthMid = gc.ptNode(0.50, 0.82),
  gcSouthGate = gc.ptNode(0.50, 0.95);
campusPath(node(4, 2), gcNorthGate, 2.8);
campusPath(gcNorthGate, gcCbdCenter, 2.8);
campusPath(gcCbdWest, gcCbdCenter, 2.5);
campusPath(gcCbdCenter, gcCbdEast, 2.5);
campusPath(gcCbdWest, gcPlazaWest, 2.5);
campusPath(gcCbdCenter, gcPlazaCenter, 2.8);
campusPath(gcCbdEast, gcPlazaEast, 2.5);
campusPath(node(2, 4), gcWestGate, 2.8);
campusPath(gcWestGate, gcPlazaWest, 2.8);
campusPath(gcPlazaWest, gcPlazaCenter, 3.0);
campusPath(gcPlazaCenter, gcPlazaEast, 3.0);
campusPath(gcPlazaEast, gcEastGate, 2.8);
campusPath(gcEastGate, node(5, 4), 2.8);
campusPath(gcPlazaWest, gcEntWest, 2.5);
campusPath(gcPlazaCenter, gcEntCenter, 2.8);
campusPath(gcPlazaEast, gcEntEast, 2.5);
campusPath(gcEntWest, gcEntCenter, 2.6);
campusPath(gcEntCenter, gcEntEast, 2.6);
campusPath(gcEntCenter, gcSouthMid, 2.6);
campusPath(gcSouthMid, gcSouthGate, 2.6);
campusPath(gcSouthGate, node(4, 7), 2.6);

interface CommunitySiteSpec {
  community: ResidentialCommunity['id'];
  u: number;
  v: number;
  w: number;
  d: number;
  angle: number;
  street: [number, number];
}

const communityLayout: Record<string, CommunitySiteSpec> = {
  // 目白台豪华住宅区 — 西区高密度豪宅塔楼群
  'soyo-house': {
    community: 'downtown',
    u: 0.24,
    v: 0.30,
    w: 19,
    d: 13.5,
    angle: dt.angle,
    street: [dtWestGate, dtTowerPlaza],
  },
  'mizuho-apartment': {
    community: 'downtown',
    u: 0.24,
    v: 0.77,
    w: 16,
    d: 11,
    angle: dt.angle + Math.PI,
    street: [dtTowerPlaza, dtTowerSouth],
  },
  'takada-residence': {
    community: 'downtown',
    u: 0.39,
    v: 0.77,
    w: 15,
    d: 11,
    angle: dt.angle + Math.PI,
    street: [dtTowerEast, dtCenterMid],
  },
  // 目白台豪华住宅区 — 东区名门庭院宅邸区
  downtown: {
    community: 'downtown',
    u: 0.58,
    v: 0.14,
    w: 14,
    d: 6.2,
    angle: dt.angle + Math.PI,
    street: [node(8, 10), dtCenterNorth],
  },
  'ouzuka-residence': {
    community: 'downtown',
    u: 0.59,
    v: 0.44,
    w: 18,
    d: 12.5,
    angle: dt.angle - Math.PI / 2,
    street: [dtCenterNorth, dtCenterMid],
  },
  'toyokawa-house': {
    community: 'downtown',
    u: 0.59,
    v: 0.79,
    w: 18,
    d: 12.5,
    angle: dt.angle - Math.PI / 2,
    street: [dtCenterMid, dtCenterSouth],
  },
  'nikaido-house': {
    community: 'downtown',
    u: 0.83,
    v: 0.24,
    w: 16,
    d: 11,
    angle: dt.angle + Math.PI / 2,
    street: [dtEastNorth, dtEastMid],
  },
  'residential-leia': {
    community: 'downtown',
    u: 0.83,
    v: 0.54,
    w: 15.5,
    d: 11,
    angle: dt.angle + Math.PI / 2,
    street: [dtEastNorth, dtEastMid],
  },
  'kiyoaki-house': {
    community: 'downtown',
    u: 0.83,
    v: 0.82,
    w: 14.5,
    d: 10,
    angle: dt.angle + Math.PI / 2,
    street: [dtEastMid, dtEastSouth],
  },

  // 杂司谷生活社区 — 北区现代低层公寓院落
  'nanoka-honoka-home': {
    community: 'home',
    u: 0.20,
    v: 0.19,
    w: 16.5,
    d: 10.5,
    angle: hm.angle,
    street: [hmNorthWest, hmNorthMid],
  },
  'emma-yuki-home': {
    community: 'home',
    u: 0.48,
    v: 0.19,
    w: 17.5,
    d: 10.5,
    angle: hm.angle,
    street: [hmNorthWest, hmNorthMid],
  },
  'residential-meruru': {
    community: 'home',
    u: 0.76,
    v: 0.19,
    w: 14.5,
    d: 10,
    angle: hm.angle,
    street: [hmNorthMid, hmNorthEast],
  },
  // 杂司谷生活社区 — 中轴生活街角
  'onigawara-laundry': {
    community: 'home',
    u: 0.20,
    v: 0.46,
    w: 15,
    d: 9.8,
    angle: hm.angle,
    street: [hmMidWest, hmParkCenter],
  },
  'residential-supermarket': {
    community: 'home',
    u: 0.69,
    v: 0.46,
    w: 15.5,
    d: 9.8,
    angle: hm.angle,
    street: [hmParkCenter, hmMidEast],
  },
  home: {
    community: 'home',
    u: 0.87,
    v: 0.47,
    w: 11.5,
    d: 6.2,
    angle: hm.angle,
    street: [hmMidEast, hmEastGate],
  },
  // 杂司谷生活社区 — 西南 MyGO 温情一户建小巷
  'residential-tomori': {
    community: 'home',
    u: 0.16,
    v: 0.69,
    w: 13,
    d: 9.2,
    angle: hm.angle,
    street: [hmMidWest, hmSouthWest],
  },
  'residential-anon': {
    community: 'home',
    u: 0.35,
    v: 0.69,
    w: 13,
    d: 9.2,
    angle: hm.angle,
    street: [hmSouthWest, hmSouthMid],
  },
  'residential-rana': {
    community: 'home',
    u: 0.25,
    v: 0.87,
    w: 14,
    d: 9.2,
    angle: hm.angle + Math.PI,
    street: [hmSouthWest, hmSouthMid],
  },
  // 杂司谷生活社区 — 东南烟火气家庭院落
  'amaori-family-home': {
    community: 'home',
    u: 0.62,
    v: 0.69,
    w: 14,
    d: 9.5,
    angle: hm.angle,
    street: [hmSouthMid, hmSouthEast],
  },
  'sena-family-home': {
    community: 'home',
    u: 0.82,
    v: 0.69,
    w: 15,
    d: 9.8,
    angle: hm.angle,
    street: [hmMidEast, hmSouthEast],
  },
  'haga-residence': {
    community: 'home',
    u: 0.62,
    v: 0.87,
    w: 13.5,
    d: 9.2,
    angle: hm.angle + Math.PI,
    street: [hmSouthMid, hmSouthEast],
  },
  'koko-old-house': {
    community: 'home',
    u: 0.82,
    v: 0.87,
    w: 15,
    d: 9.5,
    angle: hm.angle + Math.PI,
    street: [hmSouthMid, hmSouthEast],
  },

  // 神田川河岸公寓社区
  'majo-studio': {
    community: 'riverside',
    u: 0.27,
    v: 0.20,
    w: 13.5,
    d: 10.5,
    angle: rv.angle - Math.PI / 2,
    street: [rvNorth, rvMidNorth],
  },
  'terazawa-flat': {
    community: 'riverside',
    u: 0.74,
    v: 0.22,
    w: 13.5,
    d: 10.5,
    angle: rv.angle + Math.PI / 2,
    street: [rvNorth, rvMidNorth],
  },
  'hirosaki-staff-flat': {
    community: 'riverside',
    u: 0.27,
    v: 0.45,
    w: 14,
    d: 10.5,
    angle: rv.angle - Math.PI / 2,
    street: [rvMidNorth, rvCenter],
  },
  'residential-taki': {
    community: 'riverside',
    u: 0.74,
    v: 0.54,
    w: 14.5,
    d: 10.5,
    angle: rv.angle + Math.PI / 2,
    street: [rvMidNorth, rvCenter],
  },
  'residential-arisa': {
    community: 'riverside',
    u: 0.74,
    v: 0.82,
    w: 14.5,
    d: 10.5,
    angle: rv.angle + Math.PI / 2,
    street: [rvCenter, rvSouth],
  },

  // 高原坡地别墅社区
  'residential-mutsumi': {
    community: 'highland',
    u: 0.52,
    v: 0.34,
    w: 22,
    d: 13,
    angle: hl.angle,
    street: [hlWestGate, hlCourt],
  },
  highland: {
    community: 'highland',
    u: 0.50,
    v: 0.80,
    w: 13,
    d: 6,
    angle: hl.angle + Math.PI,
    street: [hlCourt, hlSouthGate],
  },

  // 池袋／东池袋商业综合区 (commercial)
  'koto-apartment': {
    community: 'commercial',
    u: 0.19,
    v: 0.12,
    w: 15.5,
    d: 9.8,
    angle: cm.angle,
    street: [cmNorthWest, cmNorthMid],
  },
  'otsuka-diner': {
    community: 'commercial',
    u: 0.50,
    v: 0.12,
    w: 16,
    d: 9.5,
    angle: cm.angle,
    street: [cmNorthGate, cmNorthMid],
  },
  'kamezaki-residence': {
    community: 'commercial',
    u: 0.81,
    v: 0.12,
    w: 14.5,
    d: 9.8,
    angle: cm.angle,
    street: [cmNorthMid, cmNorthEast],
  },
  clinic: {
    community: 'commercial',
    u: 0.18,
    v: 0.29,
    w: 14.5,
    d: 10,
    angle: cm.angle - Math.PI / 2,
    street: [cmNorthWest, cmWestNorth],
  },
  'matcha-shop': {
    community: 'commercial',
    u: 0.18,
    v: 0.47,
    w: 14.5,
    d: 10,
    angle: cm.angle - Math.PI / 2,
    street: [cmWestNorth, cmWestMid],
  },
  sunshine: {
    community: 'commercial',
    u: 0.50,
    v: 0.37,
    w: 30,
    d: 26,
    angle: cm.angle,
    street: [cmWestMid, cmCenterSouth],
  },
  'otome-road': {
    community: 'commercial',
    u: 0.82,
    v: 0.30,
    w: 15,
    d: 10,
    angle: cm.angle + Math.PI / 2,
    street: [cmNorthEast, cmEastNorth],
  },
  'majo-highrise-home': {
    community: 'commercial',
    u: 0.82,
    v: 0.48,
    w: 14.5,
    d: 11,
    angle: cm.angle + Math.PI / 2,
    street: [cmEastNorth, cmEastMid],
  },
  ring: {
    community: 'commercial',
    u: 0.20,
    v: 0.65,
    w: 21,
    d: 10.5,
    angle: cm.angle + Math.PI,
    street: [cmWestMid, cmSouthWest],
  },
  commercial: {
    community: 'commercial',
    u: 0.52,
    v: 0.63,
    w: 14,
    d: 6.2,
    angle: cm.angle + Math.PI,
    street: [cmCenterSouth, cmEastMid],
  },
  'residential-uika': {
    community: 'commercial',
    u: 0.81,
    v: 0.66,
    w: 14,
    d: 10,
    angle: cm.angle + Math.PI / 2,
    street: [cmEastMid, cmSouthEast],
  },
  'minami-ikebukuro-park': {
    community: 'commercial',
    u: 0.31,
    v: 0.86,
    w: 30,
    d: 19,
    angle: cm.angle + Math.PI,
    street: [cmSouthWest, cmSouthMid],
  },
  'residential-nyamu': {
    community: 'commercial',
    u: 0.79,
    v: 0.85,
    w: 15,
    d: 10.5,
    angle: cm.angle + Math.PI / 2,
    street: [cmSouthMid, cmSouthEast],
  },

  // 新宿／大型商业娱乐与CBD核心区 (grand-commercial)
  'toyokawa-executive-tower': {
    community: 'grand-commercial',
    u: 0.51,
    v: 0.14,
    w: 34,
    d: 13,
    angle: gc.angle,
    street: [gcCbdWest, gcCbdCenter],
  },
  'mlm-office': {
    community: 'grand-commercial',
    u: 0.21,
    v: 0.34,
    w: 16,
    d: 11,
    angle: gc.angle - Math.PI / 2,
    street: [gcCbdWest, gcPlazaWest],
  },
  'legal-office': {
    community: 'grand-commercial',
    u: 0.80,
    v: 0.34,
    w: 17,
    d: 11,
    angle: gc.angle + Math.PI / 2,
    street: [gcCbdEast, gcPlazaEast],
  },
  'grand-commercial': {
    community: 'grand-commercial',
    u: 0.49,
    v: 0.53,
    w: 17,
    d: 6.5,
    angle: gc.angle + Math.PI,
    street: [gcPlazaWest, gcPlazaCenter],
  },
  'residential-marina': {
    community: 'grand-commercial',
    u: 0.81,
    v: 0.54,
    w: 15,
    d: 10,
    angle: gc.angle + Math.PI / 2,
    street: [gcPlazaEast, gcEntEast],
  },
  'ktv-lounge': {
    community: 'grand-commercial',
    u: 0.23,
    v: 0.73,
    w: 25,
    d: 12,
    angle: gc.angle + Math.PI,
    street: [gcEntWest, gcEntCenter],
  },
  livehouse: {
    community: 'grand-commercial',
    u: 0.75,
    v: 0.73,
    w: 28,
    d: 12,
    angle: gc.angle + Math.PI,
    street: [gcEntCenter, gcEntEast],
  },
  'harajuku-pop-up': {
    community: 'grand-commercial',
    u: 0.49,
    v: 0.89,
    w: 34,
    d: 11,
    angle: gc.angle + Math.PI,
    street: [gcEntCenter, gcSouthMid],
  },
};

const allEnclaveDefs = [dt, hm, rv, hl, cm, gc].map(
  (c) => ({
    id: c.id,
    name: c.name,
    at: c.at,
    angle: c.angle,
    enclosure: c.enclosure,
    siteKeys: new Set(
      Object.entries(communityLayout)
        .filter(([, spec]) => spec.community === c.id)
        .map(([k]) => k)
    ),
  })
);
export const residentialCommunities: ResidentialCommunity[] = allEnclaveDefs.filter(
  (c) => ['downtown', 'home', 'riverside', 'highland'].includes(c.id)
);
export const commercialDistricts: ResidentialCommunity[] = allEnclaveDefs.filter(
  (c) => ['commercial', 'grand-commercial'].includes(c.id)
);
export const communityById = new Map(allEnclaveDefs.map((c) => [c.id, c]));
export const communitySiteKeys = new Set(Object.keys(communityLayout));
export const allEnclosures: Point[][] = [
  campusEnclosure,
  ...allEnclaveDefs.map((c) => c.enclosure),
];
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
  dorm: 'dorm',
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
  'soyo-house': 'luxury-tower',
  'mizuho-apartment': 'luxury-flat',
  'takada-residence': 'villa',
  'toyokawa-house': 'manor',
  'ouzuka-residence': 'manor',
  'nikaido-house': 'courtyard-jp',
  'residential-leia': 'courtyard-jp',
  'koko-old-house': 'courtyard-jp',
  'residential-rana': 'courtyard-jp',
  'emma-yuki-home': 'apt-low',
  'nanoka-honoka-home': 'apt-low',
  'sena-family-home': 'apt-low',
  'residential-meruru': 'apt-low',
  'terazawa-flat': 'apt-low',
  'hirosaki-staff-flat': 'apt-low',
  'majo-studio': 'apt-low',
  'residential-taki': 'apt-low',
  'residential-arisa': 'apt-low',
  'kamezaki-residence': 'apt-low',
  'residential-uika': 'apt-low',
  'residential-nyamu': 'luxury-flat',
  'residential-marina': 'apt-low',
  'majo-highrise-home': 'luxury-tower',
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
  'luxury-tower': 38,
  'luxury-flat': 19,
  manor: 8.8,
  'courtyard-jp': 5.8,
  'apt-low': 10.2,
  library: 11.2,
  school: 13.5,
  dorm: 13,
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
    !campusSiteKeys.has(key) &&
    !communitySiteKeys.has(key) &&
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
  'jinbocho-books': [68, 28],
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
    } else if (campusLayout[key]) {
      const spec = campusLayout[key],
        [x, z] = campusAt(spec.u, spec.v);
      lot = {
        x,
        z,
        w: spec.w,
        d: spec.d,
        angle: spec.angle,
        street: spec.street,
        district: district.id,
        seed: sites.length + 101,
      };
    } else if (communityLayout[key]) {
      const spec = communityLayout[key],
        comm = communityById.get(spec.community)!,
        [x, z] = comm.at(spec.u, spec.v);
      lot = {
        x,
        z,
        w: spec.w,
        d: spec.d,
        angle: spec.angle,
        street: spec.street,
        district: district.id,
        seed: sites.length + 201,
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
