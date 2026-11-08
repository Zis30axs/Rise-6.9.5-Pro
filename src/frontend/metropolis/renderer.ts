import type { CameraState, CityRenderer, Face, Layer, Mode, RenderState, Route, ScreenPoint, V3, World } from './types';

// All projection and painting happens in CSS pixels. Only the final surfaces use DPR.
type RGB = [number, number, number];
type RGBA = [number, number, number, number];
type P2 = { x: number; y: number };
type Box2 = { x: number; y: number; w: number; h: number };
type Paint = string | CanvasGradient;
type Patch = { path: Path2D; fill?: Paint; stroke?: string; width?: number };
type Plane = { x: number; y: number; z: number; d: number };
interface CompiledFace {
  points: V3[]; indices: number[]; center: V3; normal: V3; color: RGBA;
  layer: Layer; doubleSided: boolean; facade?: Face['facade']; glow: number; seed: number;
}
interface CompiledLine { a: number; b: number; color: RGBA; width: number; layer: Layer; glow: number; dashed: boolean; }
interface DrawItem {
  kind: 'face' | 'line' | 'shadow'; path: Path2D; points: P2[]; bounds: Box2;
  depth: number; fill?: Paint; stroke?: string; width?: number; patches?: Patch[];
  glow?: number; glowColor?: string; plane?: Plane; layer: Layer; dashed?: boolean;
}
interface CompiledRoute { source: Route; points: V3[]; cumulative: number[]; length: number; }
interface Vehicle { items: DrawItem[]; bounds: Box2; depth: number; near: number; }
interface View {
  width: number; height: number; cx: number; cy: number; focal: number; distance: number;
  target: V3; eye: V3; right: V3; up: V3; forward: V3;
}
interface Palette {
  ambient: number; diffuse: number; tint: RGB; fog: RGB; haze: string;
  sun: V3; water: RGB; window: RGB[]; night: number;
}
const TAU = Math.PI * 2;
const NEAR = .18;
const LAYERS: Layer[] = ['terrain', 'water', 'buildings', 'roads', 'rail', 'nature', 'details'];
const EDGE = '#0a1b25';
const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const normalise = (a: V3): V3 => { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mixColor = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const colorCss = (c: RGB | RGBA, alpha = 1) => `rgba(${Math.round(clamp(c[0], 0, 250))},${Math.round(clamp(c[1], 0, 250))},${Math.round(clamp(c[2], 0, 250))},${clamp(alpha).toFixed(3)})`;
const hash = (seed: number) => { let n = Math.imul(seed ^ 0x45d9f3b, 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const PALETTES: Record<Mode, Palette> = {
  golden: { ambient: .61, diffuse: .35, tint: [1.06, 1.015, .91], fog: [116, 139, 143], haze: '#b9946242', sun: normalise([-1, 1.3, .8]), water: [47, 104, 119], window: [[111, 174, 190], [45, 112, 138], [203, 187, 146], [37, 85, 112]], night: .18 },
  day: { ambient: .65, diffuse: .34, tint: [1, 1.025, 1.04], fog: [125, 160, 171], haze: '#a4c3ca31', sun: normalise([-.7, 1.7, .7]), water: [46, 118, 139], window: [[147, 193, 207], [89, 145, 164], [186, 210, 212], [61, 119, 144]], night: 0 },
  blue: { ambient: .47, diffuse: .27, tint: [.78, .92, 1.10], fog: [73, 106, 137], haze: '#819cb836', sun: normalise([-.9, .8, .5]), water: [32, 75, 108], window: [[233, 188, 116], [212, 210, 167], [87, 136, 164], [45, 83, 112]], night: .72 },
  night: { ambient: .38, diffuse: .20, tint: [.69, .86, 1.08], fog: [31, 57, 80], haze: '#5e86b51c', sun: normalise([-.5, .9, -.8]), water: [22, 51, 76], window: [[239, 190, 107], [221, 213, 168], [88, 142, 165], [33, 65, 91]], night: 1 },
};
const colors = new Map<string, RGBA>();
function parseColor(value: string): RGBA {
  const cached = colors.get(value); if (cached) return cached;
  let result: RGBA = [160, 177, 178, 1];
  if (value[0] === '#') {
    let h = value.slice(1); if (h.length <= 4) h = h.split('').map(c => c + c).join('');
    if (h.length === 6 || h.length === 8) result = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  } else {
    const values = value.match(/[\d.]+/g)?.map(Number);
    if (value.startsWith('rgb') && values && values.length >= 3) result = [values[0], values[1], values[2], values[3] ?? 1];
    else if (value === 'white') result = [245, 243, 231, 1];
    else if (value === 'black') result = [18, 30, 39, 1];
  }
  colors.set(value, result); return result;
}
function faceNormal(points: V3[]): V3 {
  const n: V3 = [0, 0, 0];
  for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
  return normalise(n);
}
function centerOf(points: V3[]): V3 {
  const c: V3 = [0, 0, 0]; for (const p of points) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return [c[0] / points.length, c[1] / points.length, c[2] / points.length];
}
function quadPoint(p: V3[], u: number, v: number): V3 { return lerp3(lerp3(p[0], p[3], u), lerp3(p[1], p[2], u), v); }
function boundsOf(points: P2[], pad = 0): Box2 {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const p of points) { l = Math.min(l, p.x); r = Math.max(r, p.x); t = Math.min(t, p.y); b = Math.max(b, p.y); }
  return { x: l - pad, y: t - pad, w: r - l + pad * 2, h: b - t + pad * 2 };
}
function intersects(a: Box2, b: Box2) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function polygonPath(points: P2[], close = true): Path2D {
  const path = new Path2D(); if (!points.length) return path;
  path.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) path.lineTo(points[i].x, points[i].y); if (close) path.closePath(); return path;
}
function polygonArea(points: P2[]) { let s = 0; for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; }
function setView(camera: CameraState, width: number, height: number): View {
  const s = Math.sin(camera.yaw), c = Math.cos(camera.yaw), sp = Math.sin(camera.pitch), cp = Math.cos(camera.pitch);
  const distance = Math.max(2, camera.distance), right: V3 = [c, 0, -s], up: V3 = [-s * sp, cp, -c * sp], forward: V3 = [-s * cp, -sp, -c * cp];
  return { width, height, cx: width * .5, cy: height * (.51 + (camera.offsetY ?? 0)), focal: height / (2 * Math.tan(19 * Math.PI / 180)), distance, target: [...camera.target], eye: [camera.target[0] - forward[0] * distance, camera.target[1] - forward[1] * distance, camera.target[2] - forward[2] * distance], right, up, forward };
}
function cameraPoint(point: V3, view: View): V3 { const p = sub(point, view.target); return [dot(p, view.right), dot(p, view.up), view.distance + dot(p, view.forward)]; }
function projectPoint(point: V3, view: View): ScreenPoint {
  const p = cameraPoint(point, view), scale = view.focal / Math.max(NEAR, p[2]);
  const x = view.cx + p[0] * scale, y = view.cy - p[1] * scale;
  return { x, y, depth: p[2], scale, visible: p[2] > NEAR && x >= 0 && x <= view.width && y >= 0 && y <= view.height };
}
function clipNear(points: V3[]): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], ai = a[2] >= NEAR, bi = b[2] >= NEAR;
    if (ai) out.push(a); if (ai !== bi) out.push(lerp3(a, b, (NEAR - a[2]) / (b[2] - a[2])));
  }
  return out;
}
function tessellate(face: Face): V3[][] {
  const p = face.points;
  if (p.length !== 4 || face.facade || !['terrain', 'water', 'roads', 'rail'].includes(face.layer)) return [p];
  const a = Math.max(length(sub(p[1], p[0])), length(sub(p[2], p[3]))), b = Math.max(length(sub(p[3], p[0])), length(sub(p[2], p[1])));
  if (Math.max(a, b) < 4 || a * b < 10) return [p];
  const nu = Math.min(16, Math.max(1, Math.ceil(a / 2.8))), nv = Math.min(16, Math.max(1, Math.ceil(b / 2.8))), out: V3[][] = [];
  const at = (u: number, v: number) => lerp3(lerp3(p[0], p[1], u), lerp3(p[3], p[2], u), v);
  for (let u = 0; u < nu; u++) for (let v = 0; v < nv; v++) out.push([at(u / nu, v / nv), at((u + 1) / nu, v / nv), at((u + 1) / nu, (v + 1) / nv), at(u / nu, (v + 1) / nv)]);
  return out;
}

/** Canvas-only perspective city renderer; World remains immutable. */
export function createCityRenderer(canvas: HTMLCanvasElement, world: World): CityRenderer {
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!context) throw new Error('暂时无法展开城市，请刷新页面重试。');
  const ctx = context;
  const cache = canvas.ownerDocument.createElement('canvas');
  const staticContext = cache.getContext('2d', { alpha: false });
  if (!staticContext) throw new Error('暂时无法展开城市，请刷新页面重试。');
  const base = staticContext;
  let width = 1, height = 1, ratio = 1, disposed = false, cacheValid = false;
  let view = setView({ target: [0, .9, -1.1], yaw: -.52, pitch: .63, distance: 43 }, width, height);
  let lastCamera: CameraState | null = null, lastMode: Mode = 'golden', lastLayerMask = -1;
  let lastPaint = -Infinity, lastBuild = -Infinity, buildCost = 20, lastTraffic = false;
  let palette = PALETTES.golden;
  const vertices: V3[] = [], vertexIndex = new Map<string, number>(), faces: CompiledFace[] = [], lines: CompiledLine[] = [];
  const intern = (p: V3) => { const key = `${p[0].toFixed(5)},${p[1].toFixed(5)},${p[2].toFixed(5)}`; const old = vertexIndex.get(key); if (old !== undefined) return old; const i = vertices.length; vertices.push(p); vertexIndex.set(key, i); return i; };
  let faceSeed = 0;
  for (const source of world.faces) for (const points of tessellate(source)) {
    const normal = faceNormal(points); if (length(normal) < .5) continue;
    faces.push({ points, indices: points.map(intern), center: centerOf(points), normal, color: parseColor(source.color), layer: source.layer, doubleSided: !!source.doubleSided, facade: source.facade, glow: source.glow ?? 0, seed: faceSeed++ });
  }
  for (const line of world.lines) for (let i = 1; i < line.points.length; i++) {
    const a = line.points[i - 1], b = line.points[i], n = Math.max(1, Math.ceil(length(sub(b, a)) / 1.4));
    for (let k = 0; k < n; k++) lines.push({ a: intern(lerp3(a, b, k / n)), b: intern(lerp3(a, b, (k + 1) / n)), color: parseColor(line.color), width: line.width, layer: line.layer, glow: line.glow ?? 0, dashed: !!line.dashed });
  }
  const cameraVertices = new Float64Array(vertices.length * 3), screenVertices = new Float64Array(vertices.length * 2);
  const routes: CompiledRoute[] = world.routes.map(source => {
    const points = source.points.map(p => [...p] as V3);
    if (source.closed && points.length > 1 && length(sub(points[0], points[points.length - 1])) > .001) points.push(points[0]);
    const cumulative = [0]; for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + length(sub(points[i], points[i - 1])));
    return { source, points, cumulative, length: cumulative[cumulative.length - 1] ?? 0 };
  }).filter(r => r.points.length > 1 && r.length > .1);
  const minBuildingY = new Map<string, number>();
  for (const face of faces) if (face.layer === 'buildings') for (const p of face.points) { const key = `${p[0].toFixed(3)},${p[2].toFixed(3)}`; minBuildingY.set(key, Math.min(minBuildingY.get(key) ?? Infinity, p[1])); }
  const shadowRoofs = faces.filter(f => f.layer === 'buildings' && f.normal[1] > .92 && f.points.length === 4 && f.center[1] > .7).slice(0, 450);
  let staticItems: DrawItem[] = [], occluders: DrawItem[] = [], grid = new Map<number, number[]>(), gridColumns = 1;
  let facadeBudget = 0;

  function fogAmount(depth: number) { return clamp((depth - view.distance + 4) / 46, 0, .34) * (lastMode === 'night' ? .65 : 1); }
  function shade(rgb: RGBA, normal: V3, depth: number, layer: Layer, glow = 0, glass = false): string {
    const sun = Math.max(0, dot(normal, palette.sun));
    const light = palette.ambient + palette.diffuse * sun + Math.max(0, normal[1]) * .035;
    let c: RGB = [rgb[0] * light * palette.tint[0], rgb[1] * light * palette.tint[1], rgb[2] * light * palette.tint[2]];
    if (layer === 'water' && normal[1] > .7) c = mixColor(c, palette.water, .63);
    if (glass && palette.night < .5) {
      const reflectedSky: RGB = [26 + sun * 30, 77 + sun * 45, 102 + sun * 47];
      c = mixColor(c, reflectedSky, .52);
    }
    if (layer === 'buildings' && normal[1] > .7 && lastMode === 'golden') {
      c = mixColor(c, [224, 211, 183], .11 * sun);
    }
    const floor: RGB = lastMode === 'night' ? [16, 26, 37] : [23, 36, 42];
    c = [Math.max(floor[0], c[0]), Math.max(floor[1], c[1]), Math.max(floor[2], c[2])];
    if (glow) c = mixColor(c, [Math.min(246, rgb[0] * 1.1), Math.min(240, rgb[1] * 1.08), Math.min(220, rgb[2])], clamp(glow * (.35 + palette.night * .65), 0, .85));
    const fogScale = glass ? .30 : layer === 'buildings' ? .60 : layer === 'water' ? .8 : 1;
    return colorCss(mixColor(c, palette.fog, fogAmount(depth) * fogScale), rgb[3]);
  }
  function projectedFace(face: CompiledFace): { points: P2[]; depth: number; normal: V3; plane: Plane } | null {
    let normal = face.normal;
    const facing = dot(normal, sub(view.eye, face.center));
    if (!face.doubleSided && facing <= .0001) return null;
    if (face.doubleSided && facing < 0) normal = [-normal[0], -normal[1], -normal[2]];
    let near = false, sum = 0;
    for (const i of face.indices) { const d = cameraVertices[i * 3 + 2]; if (d < NEAR) near = true; sum += d; }
    let points: P2[];
    if (near) {
      const clipped = clipNear(face.indices.map(i => [cameraVertices[i * 3], cameraVertices[i * 3 + 1], cameraVertices[i * 3 + 2]] as V3));
      if (clipped.length < 3) return null;
      points = clipped.map(p => ({ x: view.cx + p[0] * view.focal / p[2], y: view.cy - p[1] * view.focal / p[2] }));
    } else points = face.indices.map(i => ({ x: screenVertices[i * 2], y: screenVertices[i * 2 + 1] }));
    const plane = { x: dot(normal, view.right), y: dot(normal, view.up), z: dot(normal, view.forward), d: dot(normal, sub(face.center, view.eye)) };
    return { points, depth: sum / face.indices.length, normal, plane };
  }
  function addFacade(face: CompiledFace, item: DrawItem) {
    const f = face.facade; if (!f || face.points.length !== 4 || item.bounds.w < 3 || item.bounds.h < 4 || facadeBudget > 26000) return;
    const p = face.points, q = p.map(v => projectPoint(v, view));
    if (q.some(a => a.depth < NEAR)) return;
    const horizontal = (Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y) + Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y)) / 2;
    const vertical = (Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) + Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y)) / 2;
    if (horizontal < 3 || vertical < 6) return;
    const columns = clamp(Math.round(f.columns), 1, 16), rows = clamp(Math.round(f.rows), 1, 40);
    const fog = fogAmount(item.depth) * (f.style === 'glass' ? .30 : .6);
    const windowColors = palette.window.map((c, i) => colorCss(mixColor(c, palette.fog, fog), i === 3 ? .56 : (palette.night > .5 ? .92 : .56)));
    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const point = (u: number, v: number) => projectPoint(quadPoint(p, u, v), view);
    if (horizontal / columns < 2.0 || vertical / rows < 2.1) {
      const stride = Math.max(1, Math.ceil(2.5 * rows / vertical));
      const mullions = new Path2D();
      for (let r = 1; r < rows; r += stride) { const a = point(.06, r / rows), b = point(.94, r / rows); mullions.moveTo(a.x, a.y); mullions.lineTo(b.x, b.y); }
      item.patches = [{ path: mullions, stroke: colorCss(mixColor(palette.window[palette.night > .5 ? 0 : 1], palette.fog, fog), palette.night > .5 ? .32 : .22), width: .55 }];
      return;
    }
    const gutterX = f.style === 'stone' ? .26 : f.style === 'warm' ? .22 : .10, gutterY = f.style === 'glass' ? .12 : .23;
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const random = hash(f.seed + row * 719 + col * 37), grouped = hash(f.seed + Math.floor(row / 3) * 93 + col * 59);
      const lit = palette.night > .5 ? random > .31 && grouped > .18 : random > .87;
      const color = palette.night > .5 ? (lit ? (random > .83 ? 1 : 0) : (random > .18 ? 3 : 2)) : (random > .83 ? 2 : random > .38 ? 0 : 1);
      const u0 = (col + gutterX) / columns, u1 = (col + 1 - gutterX) / columns, v0 = (row + gutterY) / rows, v1 = (row + 1 - gutterY) / rows;
      const a = point(u0, v0), b = point(u0, v1), c = point(u1, v1), d = point(u1, v0);
      paths[color].moveTo(a.x, a.y); paths[color].lineTo(b.x, b.y); paths[color].lineTo(c.x, c.y); paths[color].lineTo(d.x, d.y); paths[color].closePath(); facadeBudget++;
    }
    item.patches = paths.map((path, i) => ({ path, fill: windowColors[i] }));
    if (f.style === 'glass' && horizontal > 12) {
      const reflection = new Path2D(); const a = point(.14, .03), b = point(.14, .97), c = point(.29, .97), d = point(.29, .03);
      reflection.moveTo(a.x, a.y); reflection.lineTo(b.x, b.y); reflection.lineTo(c.x, c.y); reflection.lineTo(d.x, d.y); reflection.closePath();
      item.patches.push({ path: reflection, fill: colorCss([188, 220, 219], palette.night > .5 ? .055 : .11) });
    }
  }
  function addWater(face: CompiledFace, item: DrawItem) {
    if (face.normal[1] < .7 || item.bounds.w < 4 || item.bounds.h < 2) return;
    const ripples = new Path2D(), p = face.points;
    if (p.length !== 4 && p.length !== 3) return;
    const count = clamp(Math.round(polygonArea(item.points) / 190), 1, 20);
    for (let i = 0; i < count; i++) {
      let u = .07 + hash(face.seed * 19 + i * 43) * .86, v = .07 + hash(face.seed * 29 + i * 67) * .86;
      let a: V3, b: V3;
      if (p.length === 4) { a = quadPoint(p, Math.max(.03, u - .06), v); b = quadPoint(p, Math.min(.97, u + .06), v + .012); }
      else { if (u + v > .9) { u *= .45; v *= .45; } a = [p[0][0] + (p[1][0] - p[0][0]) * u + (p[2][0] - p[0][0]) * v, p[0][1] + .012, p[0][2] + (p[1][2] - p[0][2]) * u + (p[2][2] - p[0][2]) * v]; b = [a[0] + .10 + hash(i + face.seed) * .19, a[1], a[2] + .035]; }
      const A = projectPoint(a, view), B = projectPoint(b, view); ripples.moveTo(A.x, A.y); ripples.lineTo(B.x, B.y);
    }
    item.patches = [{ path: ripples, stroke: colorCss(lastMode === 'golden' ? [199, 202, 167] : [148, 192, 207], palette.night ? .10 : .16), width: .6 }];
  }
  function paintItem(c: CanvasRenderingContext2D, item: DrawItem) {
    if (item.glow && item.glow > .01) { c.shadowColor = item.glowColor ?? '#dec48a'; c.shadowBlur = Math.min(9, item.glow * (2 + palette.night * 7)) * ratio; }
    if (item.fill) { c.fillStyle = item.fill; c.fill(item.path); }
    if (item.stroke) { c.strokeStyle = item.stroke; c.lineWidth = item.width ?? .5; if (item.dashed) c.setLineDash([2.5, 3.5]); c.stroke(item.path); if (item.dashed) c.setLineDash([]); }
    if (item.glow) c.shadowBlur = 0;
    if (item.patches) for (const patch of item.patches) {
      if (patch.fill) { c.fillStyle = patch.fill; c.fill(patch.path); }
      if (patch.stroke) { c.strokeStyle = patch.stroke; c.lineWidth = patch.width ?? .5; c.stroke(patch.path); }
    }
  }
  function background() {
    base.fillStyle = EDGE; base.fillRect(0, 0, width, height);
    const haze = base.createRadialGradient(width * .53, height * .39, 0, width * .53, height * .47, Math.max(width * .61, height * .67));
    haze.addColorStop(0, palette.haze); haze.addColorStop(.48, lastMode === 'golden' ? '#63888624' : '#528b9b20'); haze.addColorStop(1, '#0a1b2500'); base.fillStyle = haze; base.fillRect(0, 0, width, height);
    const center = projectPoint([0, -.45, 0], view), sx = clamp(center.scale * 21, 40, width), sy = clamp(center.scale * 7.5, 25, height * .42);
    base.save(); base.translate(center.x, center.y + 12); base.scale(1, sy / sx);
    const shadow = base.createRadialGradient(0, 0, sx * .15, 0, 0, sx); shadow.addColorStop(0, '#02121ba3'); shadow.addColorStop(.62, '#04141d5c'); shadow.addColorStop(1, '#04141d00'); base.fillStyle = shadow; base.beginPath(); base.arc(0, 0, sx, 0, TAU); base.fill(); base.restore();
  }
  function buildShadows(state: RenderState): DrawItem[] {
    if (!state.layers.buildings || !state.layers.terrain) return [];
    const out: DrawItem[] = [];
    for (const roof of shadowRoofs) {
      const floor = Math.min(...roof.points.map(p => minBuildingY.get(`${p[0].toFixed(3)},${p[2].toFixed(3)}`) ?? p[1]));
      const h = roof.center[1] - floor; if (h < .6) continue;
      const reach = Math.min(3.2, h * (lastMode === 'golden' ? .55 : .27));
      const dx = -palette.sun[0] * reach, dz = -palette.sun[2] * reach;
      const points = roof.points.map(p => [p[0] + dx, floor + .025, p[2] + dz] as V3).map(p => projectPoint(p, view));
      if (points.some(p => p.depth < NEAR)) continue;
      const bounds = boundsOf(points, 2); if (!intersects(bounds, { x: 0, y: 0, w: width, h: height })) continue;
      const path = polygonPath(points); out.push({ kind: 'shadow', points, bounds, path, depth: points.reduce((s, p) => s + p.depth, 0) / points.length, fill: `rgba(13,35,45,${palette.night > .5 ? .07 : .16})`, stroke: `rgba(13,35,45,${palette.night > .5 ? .025 : .045})`, width: 4, layer: 'terrain' });
    }
    return out;
  }
  function buildStatic(state: RenderState) {
    const start = performance.now(); view = setView(state.camera, width, height); palette = PALETTES[state.mode]; lastMode = state.mode;
    lastCamera = { ...state.camera, target: [...state.camera.target] }; facadeBudget = 0;
    for (let i = 0; i < vertices.length; i++) { const p = cameraPoint(vertices[i], view), scale = view.focal / Math.max(NEAR, p[2]); cameraVertices[i * 3] = p[0]; cameraVertices[i * 3 + 1] = p[1]; cameraVertices[i * 3 + 2] = p[2]; screenVertices[i * 2] = view.cx + p[0] * scale; screenVertices[i * 2 + 1] = view.cy - p[1] * scale; }
    const visible = { x: -3, y: -3, w: width + 6, h: height + 6 }, water: DrawItem[] = [], items = buildShadows(state);
    for (const face of faces) {
      if (!state.layers[face.layer]) continue;
      const projected = projectedFace(face); if (!projected) continue;
      const bounds = boundsOf(projected.points); if (!intersects(bounds, visible) || polygonArea(projected.points) < .15) continue;
      const glass = face.facade?.style === 'glass' && Math.abs(projected.normal[1]) < .55;
      const fill = shade(face.color, projected.normal, projected.depth, face.layer, face.glow, glass);
      const flatSurface = face.layer === 'water' || (face.layer === 'terrain' && Math.abs(projected.normal[1]) > .87);
      const mountain = face.layer === 'terrain' && !flatSurface;
      const item: DrawItem = { kind: 'face', path: polygonPath(projected.points), points: projected.points, bounds, depth: projected.depth, fill, stroke: fill, width: flatSurface || mountain ? .85 : .35, plane: projected.plane, layer: face.layer, glow: face.glow * palette.night, glowColor: colorCss(face.color) };
      if (face.facade) addFacade(face, item);
      if (face.layer === 'water') addWater(face, item);
      items.push(item);
    }
    for (const line of lines) {
      if (!state.layers[line.layer]) continue;
      let a: V3 = [cameraVertices[line.a * 3], cameraVertices[line.a * 3 + 1], cameraVertices[line.a * 3 + 2]], b: V3 = [cameraVertices[line.b * 3], cameraVertices[line.b * 3 + 1], cameraVertices[line.b * 3 + 2]];
      if (a[2] <= NEAR && b[2] <= NEAR) continue;
      if (a[2] < NEAR) a = lerp3(a, b, (NEAR - a[2]) / (b[2] - a[2])); if (b[2] < NEAR) b = lerp3(b, a, (NEAR - b[2]) / (a[2] - b[2]));
      const points = [a, b].map(p => ({ x: view.cx + p[0] * view.focal / p[2], y: view.cy - p[1] * view.focal / p[2] })), depth = (a[2] + b[2]) / 2;
      const bounds = boundsOf(points, 3); if (!intersects(bounds, visible)) continue;
      const tint = mixColor([line.color[0], line.color[1], line.color[2]], palette.fog, fogAmount(depth));
      const lineWidth = clamp(line.width * clamp(Math.sqrt(43 / view.distance), .8, 1.8), .28, 4);
      items.push({ kind: 'line', path: polygonPath(points, false), points, bounds, depth: depth - .006, stroke: colorCss(tint, line.color[3] * (line.glow ? .78 + palette.night * .22 : .72)), width: lineWidth, layer: line.layer, glow: line.glow * (.3 + palette.night), glowColor: colorCss(tint, .6), dashed: line.dashed });
    }
    water.sort((a, b) => b.depth - a.depth); items.sort((a, b) => b.depth - a.depth);
    base.setTransform(ratio, 0, 0, ratio, 0, 0); base.lineJoin = 'round'; base.lineCap = 'round'; base.shadowBlur = 0;
    background(); for (const item of water) paintItem(base, item); for (const item of items) paintItem(base, item);
    staticItems = items; occluders = items.filter(i => i.kind === 'face' && i.plane && i.layer !== 'water');
    grid = new Map(); gridColumns = Math.max(1, Math.ceil(width / 64));
    for (let i = 0; i < occluders.length; i++) {
      const b = occluders[i].bounds, x0 = clamp(Math.floor(b.x / 64), 0, gridColumns - 1), x1 = clamp(Math.floor((b.x + b.w) / 64), 0, gridColumns - 1), y0 = Math.max(0, Math.floor(b.y / 64)), y1 = Math.min(Math.ceil(height / 64) - 1, Math.floor((b.y + b.h) / 64));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const key = y * gridColumns + x, cell = grid.get(key); if (cell) cell.push(i); else grid.set(key, [i]); }
    }
    lastLayerMask = LAYERS.reduce((mask, layer, i) => mask | (state.layers[layer] ? 1 << i : 0), 0);
    cacheValid = true; lastBuild = performance.now(); buildCost = buildCost * .65 + (lastBuild - start) * .35;
  }

  function routePoint(route: CompiledRoute, distance: number): { position: V3; forward: V3 } {
    let d = route.source.closed ? ((distance % route.length) + route.length) % route.length : clamp(distance, 0, route.length - .00001);
    let lo = 0, hi = route.cumulative.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (route.cumulative[mid] <= d) lo = mid; else hi = mid; }
    const span = route.cumulative[hi] - route.cumulative[lo] || 1, a = route.points[lo], b = route.points[hi];
    return { position: lerp3(a, b, (d - route.cumulative[lo]) / span), forward: normalise(sub(b, a)) };
  }
  function makeVehicle(position: V3, forward: V3, kind: Route['kind'], color: string, seed: number): Vehicle | null {
    const heading = normalise([forward[0], 0, forward[2]]), right: V3 = [heading[2], 0, -heading[0]];
    const transform = (x: number, y: number, z: number): V3 => [position[0] + right[0] * x + heading[0] * z, position[1] + y, position[2] + right[2] * x + heading[2] * z];
    const items: DrawItem[] = []; let near = Infinity;
    const add = (points: V3[], color: string, glow = 0, double = false) => {
      const normal = faceNormal(points), center = centerOf(points); if (!double && dot(normal, sub(view.eye, center)) < .0001) return;
      const p = points.map(v => projectPoint(v, view)); if (p.some(v => v.depth < NEAR)) return;
      near = Math.min(near, ...p.map(v => v.depth)); const depth = p.reduce((s, v) => s + v.depth, 0) / p.length;
      const fill = shade(parseColor(color), normal, depth, 'details', glow);
      items.push({ kind: 'face', path: polygonPath(p), points: p, bounds: boundsOf(p, 1), depth, fill, stroke: fill, width: .30, layer: 'details', glow: glow * palette.night, glowColor: color });
    };
    const box = (w: number, h: number, l: number, y: number, c: string, z = 0) => {
      const a = transform(-w / 2, y, z - l / 2), b = transform(w / 2, y, z - l / 2), c0 = transform(w / 2, y, z + l / 2), d = transform(-w / 2, y, z + l / 2), A = transform(-w / 2, y + h, z - l / 2), B = transform(w / 2, y + h, z - l / 2), C = transform(w / 2, y + h, z + l / 2), D = transform(-w / 2, y + h, z + l / 2);
      add([A, D, C, B], c); add([a, A, B, b], c); add([b, B, C, c0], c); add([c0, C, D, d], c); add([d, D, A, a], c);
    };
    const side = (x: number, y0: number, y1: number, z0: number, z1: number, c: string, glow = 0) => add([transform(x, y0, z0), transform(x, y1, z0), transform(x, y1, z1), transform(x, y0, z1)], c, glow, true);
    const lamp = (x: number, y: number, z: number, c: string) => {
      const p = projectPoint(transform(x, y, z), view); if (p.depth < NEAR) return;
      const path = new Path2D(); path.arc(p.x, p.y, clamp(p.scale * .016, .45, 1.25), 0, TAU);
      items.push({ kind: 'face', path, points: [p], bounds: { x: p.x - 3, y: p.y - 3, w: 6, h: 6 }, depth: p.depth - .008, fill: c, layer: 'details', glow: palette.night * .45, glowColor: c });
    };
    if (kind === 'rail') {
      box(.24, .22, .44, .035, '#dce4df'); box(.21, .025, .42, .255, '#efead7');
      for (const x of [-.121, .121]) {
        side(x, .065, .108, -.213, .213, color);
        for (let i = 0; i < 4; i++) side(x * 1.003, .13, .215, -.192 + i * .099, -.119 + i * .099, palette.night > .4 ? '#dfc48d' : '#284b61', palette.night > .4 ? .4 : 0);
      }
      add([transform(.085, .125, .221), transform(.085, .22, .221), transform(-.085, .22, .221), transform(-.085, .125, .221)], '#284758', 0, true);
      lamp(-.075, .092, .223, '#ffefbe'); lamp(.075, .092, .223, '#ffefbe');
    } else if (kind === 'road') {
      const body = ['#e6dfca', '#b7654c', '#6b9e9c', color, '#ccd4cf'][seed % 5];
      box(.135, .075, .29, .027, body); box(.115, .06, .145, .102, '#c3d1d1', -.012);
      add([transform(.056, .105, .062), transform(.056, .159, .062), transform(-.056, .159, .062), transform(-.056, .105, .062)], '#355264', 0, true);
      lamp(-.043, .074, .147, '#ffe9bc'); lamp(.043, .074, .147, '#ffe9bc');
    } else {
      const outline = [[-.20, -.47], [.20, -.47], [.20, .22], [0, .52], [-.20, .22]];
      const top = outline.map(([x, z]) => transform(x, .16, z)), bottom = outline.map(([x, z]) => transform(x * .85, .035, z));
      add([...top].reverse(), '#eee6cc');
      for (let i = 0; i < top.length; i++) { const j = (i + 1) % top.length; add([bottom[i], top[i], top[j], bottom[j]], '#e3e9e0'); }
      box(.29, .19, .49, .16, '#d8e1d8', -.075); box(.33, .025, .55, .35, color, -.075);
      for (const x of [-.146, .146]) side(x, .22, .31, -.26, .12, palette.night > .4 ? '#d7ba80' : '#315868', palette.night > .4 ? .3 : 0);
      box(.025, .20, .025, .37, '#cfc3a7', -.075); lamp(0, .57, -.075, '#f5cf91');
      const wake = new Path2D(); for (const side of [-1, 1]) { const a = projectPoint(transform(side * .13, .018, -.46), view), b = projectPoint(transform(side * .34, .018, -1.23), view); wake.moveTo(a.x, a.y); wake.quadraticCurveTo((a.x + b.x) / 2 + side * 2, (a.y + b.y) / 2, b.x, b.y); }
      const p = [projectPoint(transform(-.38, .018, -1.25), view), projectPoint(transform(.38, .018, -.4), view)];
      items.push({ kind: 'line', points: p, path: wake, bounds: boundsOf(p, 2), depth: p.reduce((s, v) => s + v.depth, 0) / 2, stroke: '#c0ded63b', width: .85, layer: 'water' });
    }
    if (!items.length) return null;
    items.sort((a, b) => b.depth - a.depth);
    const bounds = boundsOf(items.flatMap(i => [{ x: i.bounds.x, y: i.bounds.y }, { x: i.bounds.x + i.bounds.w, y: i.bounds.y + i.bounds.h }]), 4);
    if (!intersects(bounds, { x: 0, y: 0, w: width, h: height })) return null;
    return { items, bounds, near, depth: projectPoint(position, view).depth };
  }
  function restoreForeground(vehicle: Vehicle) {
    const b = vehicle.bounds, indices = new Set<number>(), x0 = clamp(Math.floor(b.x / 64), 0, gridColumns - 1), x1 = clamp(Math.floor((b.x + b.w) / 64), 0, gridColumns - 1), y0 = Math.max(0, Math.floor(b.y / 64)), y1 = Math.min(Math.ceil(height / 64) - 1, Math.floor((b.y + b.h) / 64));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const i of grid.get(y * gridColumns + x) ?? []) indices.add(i);
    const mask = new Path2D(); let hasMask = false;
    const threshold = Math.max(NEAR, vehicle.near - .018);
    for (const i of indices) {
      const item = occluders[i]; if (!intersects(b, item.bounds) || !item.plane) continue;
      const plane = item.plane;
      const A = plane.x / view.focal, B = -plane.y / view.focal, C = plane.z - plane.x * view.cx / view.focal + plane.y * view.cy / view.focal - plane.d / threshold;
      const output: P2[] = [], p = item.points;
      for (let k = 0; k < p.length; k++) { const a = p[k], b = p[(k + 1) % p.length], da = A * a.x + B * a.y + C, db = A * b.x + B * b.y + C, ai = da < 0, bi = db < 0; if (ai) output.push(a); if (ai !== bi) { const t = da / (da - db); output.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); } }
      if (output.length < 3 || !intersects(boundsOf(output), vehicle.bounds)) continue;
      let winding = 0;
      for (let k = 0; k < output.length; k++) { const a = output[k], b = output[(k + 1) % output.length]; winding += a.x * b.y - b.x * a.y; }
      if (winding < 0) output.reverse();
      mask.moveTo(output[0].x, output[0].y); for (let k = 1; k < output.length; k++) mask.lineTo(output[k].x, output[k].y); mask.closePath(); hasMask = true;
    }
    if (!hasMask) return;
    const x = Math.max(0, Math.floor(b.x)), y = Math.max(0, Math.floor(b.y)), w = Math.max(0, Math.min(width - x, Math.ceil(b.x + b.w) - x)), h = Math.max(0, Math.min(height - y, Math.ceil(b.y + b.h) - y));
    if (!w || !h) return;
    ctx.save(); ctx.clip(mask); ctx.drawImage(cache, x * ratio, y * ratio, w * ratio, h * ratio, x, y, w, h); ctx.restore();
  }
  function traffic(state: RenderState) {
    const vehicles: Vehicle[] = []; let total = 0;
    for (const route of routes) {
      const source = route.source, layer: Layer = source.kind === 'rail' ? 'rail' : source.kind === 'road' ? 'roads' : 'water';
      if (!state.layers[layer]) continue;
      const count = clamp(Math.floor(source.count), 0, 45);
      for (let i = 0; i < count && total < 110; i++) {
        const travel = state.time * source.speed + i * route.length / Math.max(1, count) + hash(i + source.id.length) * .3;
        const phase = ((travel % (route.length * 2)) + route.length * 2) % (route.length * 2);
        const direction = !source.closed && phase > route.length ? -1 : 1;
        const distance = source.closed ? travel % route.length : (direction > 0 ? phase : route.length * 2 - phase);
        const cars = source.kind === 'rail' ? 4 : 1;
        for (let car = 0; car < cars; car++) {
          const sample = routePoint(route, distance - car * .495 * direction), forward = sample.forward.map(v => v * direction) as V3;
          const vehicle = makeVehicle(sample.position, forward, source.kind, source.color, i + car);
          if (vehicle) vehicles.push(vehicle); total++;
        }
      }
    }
    vehicles.sort((a, b) => b.depth - a.depth);
    for (const vehicle of vehicles) { for (const item of vehicle.items) paintItem(ctx, item); restoreForeground(vehicle); }
  }
  function cameraChanged(camera: CameraState) { return !lastCamera || Math.abs(camera.yaw - lastCamera.yaw) > .00018 || Math.abs(camera.pitch - lastCamera.pitch) > .00018 || Math.abs(camera.distance - lastCamera.distance) > .004 || Math.abs((camera.offsetY ?? 0) - (lastCamera.offsetY ?? 0)) > .00015 || camera.target.some((v, i) => Math.abs(v - lastCamera!.target[i]) > .0015); }

  return {
    resize(w, h, dpr) {
      if (disposed) return; width = Math.max(1, Math.round(w)); height = Math.max(1, Math.round(h));
      ratio = clamp(dpr || 1, .75, Math.min(2.5, Math.sqrt(8_000_000 / (width * height))));
      canvas.width = cache.width = Math.max(1, Math.round(width * ratio)); canvas.height = cache.height = Math.max(1, Math.round(height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); base.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; cacheValid = false;
      if (lastCamera) view = setView(lastCamera, width, height);
    },
    render(state) {
      if (disposed || width < 2 || height < 2) return;
      const now = performance.now(), layerMask = LAYERS.reduce((m, layer, i) => m | (state.layers[layer] ? 1 << i : 0), 0);
      const styleChanged = !cacheValid || state.mode !== lastMode || layerMask !== lastLayerMask;
      const moved = cameraChanged(state.camera);
      // A bounded 30 Hz camera pass avoids reprojecting ten thousand faces at display refresh rate.
      if (!styleChanged && moved && now - lastBuild < Math.max(30, Math.min(72, buildCost * .75))) return;
      if (!styleChanged && !moved && !state.traffic && !lastTraffic) return;
      if (!styleChanged && !moved && state.traffic && now - lastPaint < 28) return;
      if (styleChanged || moved) buildStatic(state);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.drawImage(cache, 0, 0, width, height);
      if (state.traffic) traffic(state);
      lastPaint = now; lastTraffic = state.traffic;
    },
    project(point) { return projectPoint(point, view); },
    dispose() { disposed = true; cache.width = 0; cache.height = 0; staticItems = []; occluders = []; grid.clear(); vertices.length = 0; faces.length = 0; lines.length = 0; vertexIndex.clear(); },
  };
}
