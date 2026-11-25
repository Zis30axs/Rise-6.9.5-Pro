import data from './data.json';
export type Region = keyof typeof data;
export type Pin = {
  id: string; name: string; x: number; y: number;
  group: string; kind: string; cat?: string; sub?: string; desc?: string;
};
export type RoadLabel = { name: string; pts: number[][]; tier: string; minZoom?: number };
export type RoadShield = { code: string; x: number; y: number; kind: string };
export type DistrictMark = { id: string; name: string; x: number; y: number };
export type RouteEdge = { from: string; to: string; minutes: number; method: string; pts: number[][] };
export type MapSheet = {
  name: string;
  bounds: number[];
  layers: Record<string, string>;
  pins: Pin[];
  roads?: RoadLabel[];
  shields?: RoadShield[];
  districts?: DistrictMark[];
  routeGraph?: RouteEdge[];
  graph?: { nodes: number[][]; edges: number[][] };
};
export const sheets: Record<Region, MapSheet> = data as unknown as Record<Region, MapSheet>;
export const regions: Region[] = ['world', 'tokyo', 'beijing', 'california', 'london', 'moscow', 'paris', 'cdg'];
export const order = ['land', 'pavement', 'subblock', 'green', 'water', 'runway', 'minor', 'road', 'major', 'highway', 'rail', 'trail', 'block', 'landmark'];

const position = new Map<string, { region: Region; pin: Pin }>();
for (const region of regions) {
  for (const pin of sheets[region].pins) {
    if (pin.kind === 'place') position.set(pin.id, { region, pin });
  }
}
export const positionOf = (id: string) => position.get(id);
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const CAT_COLORS: Record<string, string> = {
  shopping: '#d89b28',
  food: '#ea6828',
  transit: '#3b82f6',
  park: '#1ca672',
  school: '#0ea5e9',
  culture: '#8b5cf6',
  home: '#64748b',
  medical: '#ef4444',
  office: '#6366f1',
  region: '#14b8a6',
  landmark: '#38bdf8',
};

export function pinColor(p: Pin): string {
  return CAT_COLORS[p.cat || 'landmark'] || '#38bdf8';
}

export function glyph(p: Pin) {
  if (p.kind === 'region') return '◎';
  if (p.cat === 'transit' || /机场|车站|交通站|接驳站|换乘站/.test(p.name)) return '↗';
  if (p.cat === 'park' || /公园|山顶|绿道|山麓|花园|山道|森林/.test(p.name)) return '♧';
  if (p.cat === 'school' || /校园|学校|教学|图书/.test(p.name)) return '▤';
  if (p.cat === 'food') return '☕';
  if (p.cat === 'shopping' || /店|餐厅|商场|市场|咖啡|小卖/.test(p.name)) return '▣';
  if (p.cat === 'home') return '⌂';
  if (p.cat === 'medical') return '✚';
  return '◆';
}

export function labels(
  pins: { pin: Pin; x: number; y: number }[],
  width: number,
  height: number,
  chosen: string,
  here: string,
  zoom = 1
) {
  const boxes: number[][] = [];
  const limit = zoom >= 3 ? 34 : zoom >= 1.8 ? 24 : 16;
  return pins
    .slice()
    .sort(
      (a, b) =>
        Number(b.pin.id === chosen) * 8 +
        Number(b.pin.id === here) * 4 +
        Number(b.pin.kind === 'place') -
        (Number(a.pin.id === chosen) * 8 +
          Number(a.pin.id === here) * 4 +
          Number(a.pin.kind === 'place'))
    )
    .flatMap((p) => {
      const w = Array.from(p.pin.name).reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 12.5 : 7), 0) + 10;
      for (const side of [1, -1]) {
        const x = side === 1 ? p.x + 13 : p.x - 13 - w;
        const y = p.y - 11;
        if (
          boxes.length >= limit ||
          x < 6 ||
          x + w > width - 6 ||
          y < 6 ||
          y + 22 > height - 6 ||
          boxes.some(([a, b, c, d]) => x < c + 4 && x + w > a - 4 && y < d + 3 && y + 22 > b - 3)
        )
          continue;
        boxes.push([x - 2, y, x + w, y + 22]);
        return [{ ...p, tx: side === 1 ? x : x + w, anchor: (side === 1 ? 'start' : 'end') as 'start' | 'end' }];
      }
      return [];
    });
}

export function solveRoutePath(region: Region, fromId: string, toId: string): number[][] {
  const sheet = sheets[region];
  const fp = sheet.pins.find((p) => p.id === fromId);
  const tp = sheet.pins.find((p) => p.id === toId);
  if (!fp || !tp || fromId === toId) return [];

  if (region === 'tokyo' && sheet.graph) {
    const { nodes, edges } = sheet.graph;
    const adj: [number, number][][] = Array.from({ length: nodes.length }, () => []);
    for (const [u, v, walk] of edges) {
      const w = Math.hypot(nodes[u][0] - nodes[v][0], nodes[u][1] - nodes[v][1]) * (walk ? 1.05 : 1);
      adj[u].push([v, w]);
      adj[v].push([u, w]);
    }
    const nearest = (x: number, y: number) => {
      let b = 0, bd = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        const d = Math.hypot(nodes[i][0] - x, nodes[i][1] - y);
        if (d < bd) { bd = d; b = i; }
      }
      return b;
    };
    const s = nearest(fp.x, fp.y), e = nearest(tp.x, tp.y);
    const dist = new Float64Array(nodes.length).fill(Infinity);
    const prev = new Int32Array(nodes.length).fill(-1);
    const vis = new Uint8Array(nodes.length);
    dist[s] = 0;
    for (let k = 0; k < nodes.length; k++) {
      let u = -1, best = Infinity;
      for (let i = 0; i < nodes.length; i++) if (!vis[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === e) break;
      vis[u] = 1;
      for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
    if (dist[e] < Infinity) {
      const mid: number[][] = [];
      for (let cur = e; cur !== -1; cur = prev[cur]) mid.push(nodes[cur]);
      mid.reverse();
      return [[fp.x, fp.y], ...mid, [tp.x, tp.y]];
    }
  }

  if (sheet.routeGraph?.length) {
    const adj = new Map<string, { to: string; pts: number[][] }[]>();
    for (const r of sheet.routeGraph) {
      if (!adj.has(r.from)) adj.set(r.from, []);
      if (!adj.has(r.to)) adj.set(r.to, []);
      adj.get(r.from)!.push({ to: r.to, pts: r.pts });
      adj.get(r.to)!.push({ to: r.from, pts: [...r.pts].reverse() });
    }
    const q = [fromId], prev = new Map<string, { from: string; pts: number[][] } | null>([[fromId, null]]);
    while (q.length) {
      const u = q.shift()!;
      if (u === toId) break;
      for (const edge of adj.get(u) || []) {
        if (!prev.has(edge.to)) { prev.set(edge.to, { from: u, pts: edge.pts }); q.push(edge.to); }
      }
    }
    if (prev.has(toId)) {
      const segs: number[][][] = [];
      for (let cur = toId; prev.get(cur); cur = prev.get(cur)!.from) segs.push(prev.get(cur)!.pts);
      segs.reverse();
      return [[fp.x, fp.y], ...segs.flat(), [tp.x, tp.y]];
    }
  }

  return [[fp.x, fp.y], [(fp.x + tp.x) / 2, fp.y * 0.35 + ((fp.y + tp.y) / 2) * 0.65], [tp.x, tp.y]];
}
