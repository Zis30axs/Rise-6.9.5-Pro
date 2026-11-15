import * as THREE from 'three';
import { polygons, terrainHeight, type AtlasFeature } from './atlas-geometry';

export const GLOBE_RADIUS = 100;
export const EARTH_RADIUS_KM = 6371;
export const RELIEF_HEIGHT_SCALE = 0.45;
export const LAND_BASE_OFFSET = 0.28;
export const MAX_GLOBE_LAT = 82;
export const MAX_GLOBE_TILT = 62;
export const GLOBE_FOV_DEG = 38;
export const WORLD_ORBIT_SPAN_DEG = 132;

export interface LatLon {
  lon: number;
  lat: number;
}

export interface GlobeAngularBounds {
  lon: number;
  lat: number;
  lonSpan: number;
  latSpan: number;
  angularSpan: number;
}

export interface GlobeCameraParams {
  lon: number;
  lat: number;
  spanDeg: number;
  headingDeg: number;
  tiltDeg: number;
  aspect: number;
  fovDeg?: number;
}

export interface GlobeCameraPose {
  eye: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  surfaceNormal: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  forward: THREE.Vector3;
  effectiveTiltDeg: number;
  distanceToSurface: number;
  altitudeKm: number;
}

export interface GlobeLabelCandidate {
  id: string;
  target: string;
  name: string;
  kind: 'home' | 'landmark' | 'country' | 'division' | 'ocean';
  x: number;
  y: number;
  hemisphereDot: number;
  priority: number;
  active?: boolean;
}

export const GLOBE_OCEANS: ReadonlyArray<{ id: string; name: string; lon: number; lat: number; priority: number }> = [
  { id: 'pacific-n', name: '北太平洋', lon: -158, lat: 24, priority: 42 },
  { id: 'pacific-s', name: '南太平洋', lon: -130, lat: -24, priority: 38 },
  { id: 'pacific-w', name: '太平洋', lon: 158, lat: 14, priority: 44 },
  { id: 'atlantic', name: '大西洋', lon: -36, lat: 18, priority: 40 },
  { id: 'indian', name: '印度洋', lon: 78, lat: -18, priority: 40 },
  { id: 'arctic', name: '北冰洋', lon: 40, lat: 77, priority: 30 },
  { id: 'southern', name: '南大洋', lon: 20, lat: -61, priority: 28 },
];

export const MAJOR_COUNTRY_PRIORITIES: Readonly<Record<string, number>> = {
  CHN: 96,
  JPN: 95,
  SUN: 90,
  USA: 89,
  GBR: 84,
  FRA: 83,
  DEU: 82,
  IND: 81,
  AUS: 80,
  BRA: 79,
  CAN: 78,
  KOR: 77,
  EGY: 75,
  ITA: 74,
  ESP: 73,
  THA: 71,
  SGP: 70,
  MEX: 69,
  ARG: 68,
  IDN: 67,
  SAU: 66,
  TUR: 65,
  VNM: 64,
  ATA: 63,
  NZL: 62,
};

/**
 * Natural Earth build script omits ATA (`prepare_atlas_data.mjs`), so supply a
 * seamless circumpolar Antarctic polygon compatible with both 3D WebGL and d3-geo.
 */
export const ANTARCTICA_FEATURE: AtlasFeature = {
  type: 'Feature',
  properties: { id: 'ATA', name: '南极洲' },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-180, -77.8], [-170, -78.1], [-158, -77.6], [-145, -75.6], [-130, -74.2],
      [-115, -74.1], [-102, -72.6], [-90, -72.4], [-76, -73.2], [-68, -69.0],
      [-63, -64.8], [-57.5, -63.2], [-55.5, -64.2], [-60.5, -67.5], [-61.5, -72.2],
      [-58, -75.2], [-45, -77.8], [-32, -77.4], [-20, -73.8], [-8, -70.6],
      [5, -69.9], [18, -69.9], [32, -69.0], [44, -67.9], [56, -67.0],
      [68, -67.8], [74, -69.2], [84, -66.8], [98, -66.0], [112, -66.2],
      [126, -66.6], [140, -66.8], [154, -68.5], [166, -70.8], [170, -73.5],
      [166, -77.4], [174, -78.2], [180, -77.8], [-180, -77.8],
    ]],
  },
};

export function withAntarcticaCountry<T extends { properties: { id: string } }>(features: readonly T[]): T[] {
  if (features.some(feature => feature.properties.id === ANTARCTICA_FEATURE.properties.id)) {
    return [...features];
  }
  return [...features, ANTARCTICA_FEATURE as unknown as T];
}

function isSouthernPolarRing(ring: readonly number[][]): boolean {
  if (ring.length < 4) return false;
  const openSpan = Math.abs((ring.at(-2)?.[0] ?? 0) - (ring[0]?.[0] ?? 0));
  return openSpan >= 340 && ring.every(point => point[1] < -45);
}

function expandSouthernPolarRing(ring: readonly number[][]): number[][] {
  const openCoast = ring.slice(0, -1).map(point => [point[0], point[1]]);
  const polarBottom: number[][] = [];
  for (let lon = 180; lon >= -180; lon -= 15) {
    polarBottom.push([lon, -89.995]);
  }
  const closed = [...openCoast, ...polarBottom];
  closed.push([...closed[0]!]);
  return closed;
}

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vAxis = new THREE.Vector3();
const _matBasis = new THREE.Matrix4();

export function normalizeLon(lon: number): number {
  if (!Number.isFinite(lon)) return 0;
  let wrapped = ((lon + 180) % 360 + 360) % 360 - 180;
  if (wrapped === -180 && lon > 0) wrapped = 180;
  return wrapped;
}

export function clampGlobeLat(lat: number): number {
  if (!Number.isFinite(lat)) return 0;
  return THREE.MathUtils.clamp(lat, -MAX_GLOBE_LAT, MAX_GLOBE_LAT);
}

export function shortestLonDelta(fromLon: number, toLon: number): number {
  return ((toLon - fromLon + 540) % 360) - 180;
}

/**
 * Convert geographic (lon, lat) in degrees to a right-handed Y-up sphere coordinate:
 * North Pole = +Y, Prime Meridian (lon=0, lat=0) = +Z, East (lon=+90, lat=0) = +X.
 */
export function latLonToSphere(lon: number, lat: number, altitudeOffset = 0, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  const r = GLOBE_RADIUS + altitudeOffset;
  const cosPhi = Math.cos(phi);
  return out.set(
    r * cosPhi * Math.sin(lambda),
    r * Math.sin(phi),
    r * cosPhi * Math.cos(lambda),
  );
}

export function spherePointToLatLon(point: THREE.Vector3): LatLon {
  const len = point.length();
  if (len < 1e-8) return { lon: 0, lat: 0 };
  const lat = Math.asin(THREE.MathUtils.clamp(point.y / len, -1, 1)) * 180 / Math.PI;
  const lon = Math.atan2(point.x, point.z) * 180 / Math.PI;
  return { lon: normalizeLon(lon), lat };
}

/**
 * Orthonormal surface frame at (lon, lat):
 * east × north = normal (radially outward).
 */
export function sphereTangentBasis(lon: number, lat: number): {
  normal: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
} {
  const normal = latLonToSphere(lon, lat, 0).normalize();
  const lambda = lon * Math.PI / 180;
  const east = new THREE.Vector3(Math.cos(lambda), 0, -Math.sin(lambda)).normalize();
  const north = new THREE.Vector3().crossVectors(normal, east).normalize();
  return { normal, east, north };
}

/**
 * Place a miniature landmark standing radially upright on the sphere (+Y along normal, +Z South).
 */
export function orientObjectOnSphere(object: THREE.Object3D, lon: number, lat: number, altitudeOffset = 0): void {
  const { normal, east, north } = sphereTangentBasis(lon, lat);
  latLonToSphere(lon, lat, altitudeOffset, object.position);
  _matBasis.makeBasis(east, normal, north.clone().negate());
  object.quaternion.setFromRotationMatrix(_matBasis);
}

export function greatCircleDistanceKm(lonA: number, latA: number, lonB: number, latB: number): number {
  const rad = Math.PI / 180;
  const lat1 = latA * rad;
  const lat2 = latB * rad;
  const dLat = (latB - latA) * rad;
  const dLon = shortestLonDelta(lonA, lonB) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(THREE.MathUtils.clamp(h, 0, 1)), Math.sqrt(THREE.MathUtils.clamp(1 - h, 0, 1)));
}

/** Smooth SLERP across Earth surface along the shorter great-circle arc. */
export function interpolateGreatCircle(lonA: number, latA: number, lonB: number, latB: number, t: number): LatLon {
  const mix = THREE.MathUtils.clamp(t, 0, 1);
  if (mix <= 0) return { lon: normalizeLon(lonA), lat: latA };
  if (mix >= 1) return { lon: normalizeLon(lonB), lat: latB };
  latLonToSphere(lonA, latA, 0, _vA).normalize();
  latLonToSphere(lonB, latB, 0, _vB).normalize();
  const dot = THREE.MathUtils.clamp(_vA.dot(_vB), -1, 1);
  const omega = Math.acos(dot);
  if (omega < 1e-5) {
    return {
      lon: normalizeLon(lonA + shortestLonDelta(lonA, lonB) * mix),
      lat: THREE.MathUtils.lerp(latA, latB, mix),
    };
  }
  if (Math.PI - omega < 1e-4) {
    // Near-antipodal fallback avoids unstable axis choice while smoothly crossing poles/equator.
    _vAxis.set(0, 1, 0).cross(_vA);
    if (_vAxis.lengthSq() < 1e-5) _vAxis.set(1, 0, 0);
    _vAxis.normalize();
    const rotated = _vA.clone().applyAxisAngle(_vAxis, omega * mix);
    return spherePointToLatLon(rotated);
  }
  const sinOmega = Math.sin(omega);
  const s0 = Math.sin((1 - mix) * omega) / sinOmega;
  const s1 = Math.sin(mix * omega) / sinOmega;
  const blended = _vA.clone().multiplyScalar(s0).addScaledVector(_vB, s1);
  return spherePointToLatLon(blended);
}

/** Procedural natural biome + elevation color for offline Google Earth-like terrain. */
export function terrainBiomeColor(lon: number, lat: number, elevation: number, out = new THREE.Color()): THREE.Color {
  const elevRatio = THREE.MathUtils.clamp((elevation - 0.2) / 1.15, 0, 1);
  const absLat = Math.abs(lat);
  const tropicalFactor = THREE.MathUtils.clamp(1 - absLat / 24, 0, 1);
  const desertLat = Math.exp(-(((absLat - 25) / 10) ** 2));
  const eurasianArid = Math.exp(-(((lon - 64) / 28) ** 2 + ((lat - 40) / 11) ** 2));
  const saharaArabia = Math.exp(-(((lon - 22) / 28) ** 2 + ((lat - 22) / 9) ** 2));
  const australiaArid = Math.exp(-(((lon - 134) / 14) ** 2 + ((lat + 24) / 8) ** 2));
  const dryness = THREE.MathUtils.clamp(Math.max(saharaArabia * 0.95, eurasianArid * 0.78, australiaArid * 0.85) + desertLat * 0.14, 0, 1);
  const polarMix = THREE.MathUtils.clamp((absLat - 57) / 21, 0, 1);

  const forest = new THREE.Color('#4d7d4d').lerp(new THREE.Color('#6b8f59'), elevRatio * 0.55);
  if (tropicalFactor > 0.05) forest.lerp(new THREE.Color('#3b7343'), tropicalFactor * 0.55);
  out.copy(forest).lerp(new THREE.Color('#be9f6a'), dryness * 0.78);
  if (elevRatio > 0.45) {
    const mountainT = THREE.MathUtils.clamp((elevRatio - 0.45) / 0.55, 0, 1);
    out.lerp(new THREE.Color('#a69571'), mountainT * 0.72);
    if (elevRatio > 0.82) out.lerp(new THREE.Color('#cfd9d4'), (elevRatio - 0.82) / 0.18 * 0.56);
  }
  if (polarMix > 0.01) out.lerp(new THREE.Color('#dde8ee'), polarMix * 0.86);
  return out;
}

export function globeSurfaceElevation(lon: number, lat: number, altitudeOffset = LAND_BASE_OFFSET): number {
  return altitudeOffset + terrainHeight(lon, lat) * RELIEF_HEIGHT_SCALE;
}

export function globeLandGeometry(
  feature: AtlasFeature,
  altitudeOffset = LAND_BASE_OFFSET,
  subdivide = true,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  const sphereVec = new THREE.Vector3();
  const edgeThreshold = subdivide ? 4.4 : 6.2;
  const polarCap = polygons(feature).some(poly => poly[0] && isSouthernPolarRing(poly[0]));
  const maxIter = polarCap ? 5 : subdivide ? 4 : 2;

  const addVertex = (lon: number, lat: number) => {
    const elevation = terrainHeight(lon, lat);
    latLonToSphere(lon, lat, altitudeOffset + elevation * RELIEF_HEIGHT_SCALE, sphereVec);
    positions.push(sphereVec.x, sphereVec.y, sphereVec.z);
    terrainBiomeColor(lon, lat, elevation, color);
    colors.push(color.r, color.g, color.b);
  };

  const addTriangle = (a: number[], b: number[], c: number[], iteration: number) => {
    const edge = Math.max(
      Math.hypot(a[0] - b[0], a[1] - b[1]),
      Math.hypot(b[0] - c[0], b[1] - c[1]),
      Math.hypot(c[0] - a[0], c[1] - a[1]),
    );
    if (edge > edgeThreshold && iteration < maxIter) {
      const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
      const ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
      addTriangle(a, ab, ca, iteration + 1);
      addTriangle(ab, b, bc, iteration + 1);
      addTriangle(ca, bc, c, iteration + 1);
      addTriangle(ab, bc, ca, iteration + 1);
    } else {
      addVertex(a[0], a[1]);
      addVertex(b[0], b[1]);
      addVertex(c[0], c[1]);
    }
  };

  for (const polygon of polygons(feature)) {
    const outer = polygon[0];
    if (!outer || outer.length < 4) continue;
    const outerPoints = isSouthernPolarRing(outer) ? expandSouthernPolarRing(outer) : outer;
    const shape = new THREE.Shape(outerPoints.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const hole of polygon.slice(1)) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    const flat = new THREE.ShapeGeometry(shape);
    const points = flat.getAttribute('position');
    const indices = flat.index;
    const count = indices?.count ?? points.count;
    for (let index = 0; index < count; index += 3) {
      const triangle = [0, 1, 2].map(offset => {
        const id = indices ? indices.getX(index + offset) : index + offset;
        return [points.getX(id), points.getY(id)];
      });
      addTriangle(triangle[0], triangle[1], triangle[2], 0);
    }
    flat.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function globeBorderGeometry(feature: AtlasFeature, altitudeOffset = LAND_BASE_OFFSET + 0.08): THREE.BufferGeometry {
  const positions: number[] = [];
  const sphereVec = new THREE.Vector3();
  for (const polygon of polygons(feature)) {
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index++) {
        const a = ring[index - 1];
        const b = ring[index];
        if (Math.abs(a[0] - b[0]) > 180) continue;
        const steps = Math.max(1, Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 1.8));
        for (let step = 0; step < steps; step++) {
          for (const fraction of [step / steps, (step + 1) / steps]) {
            const lon = a[0] + (b[0] - a[0]) * fraction;
            const lat = a[1] + (b[1] - a[1]) * fraction;
            latLonToSphere(lon, lat, globeSurfaceElevation(lon, lat, altitudeOffset), sphereVec);
            positions.push(sphereVec.x, sphereVec.y, sphereVec.z);
          }
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function ringSignedArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum) / 2;
}

const globePrimaryBoundsCache = new WeakMap<AtlasFeature, GlobeAngularBounds>();
const globeAllPartsBoundsCache = new WeakMap<AtlasFeature, GlobeAngularBounds>();

export function computeGlobeBounds(feature?: AtlasFeature, allParts = false): GlobeAngularBounds {
  if (!feature) {
    return { lon: 105, lat: 24, lonSpan: 360, latSpan: 162, angularSpan: WORLD_ORBIT_SPAN_DEG };
  }
  if (feature.properties.id === ANTARCTICA_FEATURE.properties.id) {
    return { lon: 15, lat: -80, lonSpan: 60, latSpan: 44, angularSpan: 52 };
  }
  const cache = allParts ? globeAllPartsBoundsCache : globePrimaryBoundsCache;
  const cached = cache.get(feature);
  if (cached) return cached;
  const parts = polygons(feature).map(polygon => polygon[0]).filter(Boolean);
  const ring = allParts || feature.properties.id === 'CHN'
    ? parts.flat()
    : parts.sort((a, b) => ringSignedArea(b) - ringSignedArea(a))[0];
  if (!ring?.length) {
    const empty = { lon: 0, lat: 0, lonSpan: 10, latSpan: 10, angularSpan: 12 };
    cache.set(feature, empty);
    return empty;
  }
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const lon = (minLon + maxLon) / 2;
  const lat = clampGlobeLat((minLat + maxLat) / 2);
  const lonSpan = Math.max(0.3, maxLon - minLon);
  const latSpan = Math.max(0.3, maxLat - minLat);
  const cosLat = Math.max(0.28, Math.cos(lat * Math.PI / 180));
  const angularSpan = Math.max(lonSpan * cosLat, latSpan);
  const result = { lon, lat, lonSpan, latSpan, angularSpan };
  cache.set(feature, result);
  return result;
}

export function featureAnchorLatLon(feature: AtlasFeature): LatLon {
  const bounds = computeGlobeBounds(feature, false);
  if (feature.properties.id === 'ATA') return { lon: 15, lat: -80 };
  if (feature.properties.id === 'CHN') return { lon: 104.2, lat: 35.8 };
  if (feature.properties.id === 'RUS' || feature.properties.id === 'SUN') return { lon: 92, lat: 60 };
  if (feature.properties.id === 'USA') return { lon: -98.5, lat: 39.5 };
  if (feature.properties.id === 'CAN') return { lon: -106, lat: 57 };
  if (feature.properties.id === 'JPN') return { lon: 138.3, lat: 36.2 };
  return { lon: bounds.lon, lat: bounds.lat };
}

/**
 * Compute perspective eye/target/up on the curved 3D Earth with smooth horizon tilt
 * and portrait-safe space framing (never clipping inside the globe or flipping at poles).
 */
export function computeGlobeCameraPose(params: GlobeCameraParams): GlobeCameraPose {
  const fovRad = (params.fovDeg ?? GLOBE_FOV_DEG) * Math.PI / 180;
  const tanHalfFov = Math.tan(fovRad / 2);
  const aspect = Math.max(0.35, params.aspect || 1);
  const spanDeg = THREE.MathUtils.clamp(params.spanDeg, 0.7, 165);
  const { normal, east, north } = sphereTangentBasis(params.lon, params.lat);
  const surfacePoint = normal.clone().multiplyScalar(GLOBE_RADIUS + LAND_BASE_OFFSET * 0.75);

  const headingRad = params.headingDeg * Math.PI / 180;
  const forward = north.clone().multiplyScalar(Math.cos(headingRad)).addScaledVector(east, Math.sin(headingRad)).normalize();

  // From orbital view, boost distance gently on tall narrow phone screens so the globe disc never clips horizontally.
  const orbitFactor = THREE.MathUtils.smoothstep(spanDeg, 45, WORLD_ORBIT_SPAN_DEG);
  const portraitScale = 1 + orbitFactor * Math.max(0, 1 / Math.min(1, aspect) - 1) * 0.72;
  const chordRadius = GLOBE_RADIUS * Math.sin(THREE.MathUtils.clamp(spanDeg * 0.45, 0.35, 76) * Math.PI / 180);
  const baseDistance = (chordRadius / tanHalfFov) * portraitScale;
  const distanceToSurface = Math.max(2.6, baseDistance);

  // Softly taper maximum oblique tilt when zoomed all the way out to space so Earth remains centered in frame.
  const tiltAllowance = 1 - orbitFactor * 0.65;
  const effectiveTiltDeg = THREE.MathUtils.clamp(params.tiltDeg, 0, MAX_GLOBE_TILT) * tiltAllowance;
  const tiltRad = effectiveTiltDeg * Math.PI / 180;

  // Camera steps south (-forward) and lowers along normal as tilt opens up, looking across the horizon toward +forward.
  const viewFromTarget = normal.clone().multiplyScalar(Math.cos(tiltRad)).addScaledVector(forward, -Math.sin(tiltRad)).normalize();
  const eye = surfacePoint.clone().addScaledVector(viewFromTarget, distanceToSurface);
  const up = normal.clone().multiplyScalar(Math.sin(tiltRad)).addScaledVector(forward, Math.cos(tiltRad)).normalize();

  const horizonShift = Math.sin(tiltRad) * Math.min(distanceToSurface * 0.16, GLOBE_RADIUS * 0.24);
  const target = surfacePoint.clone().addScaledVector(forward, horizonShift);
  const radialClearance = Math.max(0.02, eye.length() - GLOBE_RADIUS);
  const altitudeKm = EARTH_RADIUS_KM * (radialClearance / GLOBE_RADIUS);

  return {
    eye,
    target,
    up,
    surfaceNormal: normal,
    east,
    north,
    forward,
    effectiveTiltDeg,
    distanceToSurface,
    altitudeKm,
  };
}

export function layoutGlobeLabels(
  candidates: readonly GlobeLabelCandidate[],
  viewportWidth: number,
  viewportHeight: number,
  initialOccupied: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [],
): GlobeLabelCandidate[] {
  const occupied = [...initialOccupied];
  const minX = 36;
  const maxX = Math.max(minX + 10, viewportWidth - 36);
  const minY = 44;
  const maxY = Math.max(minY + 10, viewportHeight - 36);

  const sorted = [...candidates]
    .filter(item =>
      item.hemisphereDot > 0.14
      && Number.isFinite(item.x)
      && Number.isFinite(item.y)
      && item.x >= minX
      && item.x <= maxX
      && item.y >= minY
      && item.y <= maxY,
    )
    .sort((a, b) => (Number(Boolean(b.active)) - Number(Boolean(a.active))) || (b.priority - a.priority));

  const kept: GlobeLabelCandidate[] = [];
  for (const item of sorted) {
    const charWidth = item.kind === 'country' ? 12 : item.kind === 'ocean' ? 13 : 10;
    const boxW = Math.min(230, Math.max(48, item.name.length * charWidth + (item.kind === 'landmark' ? 22 : 14)));
    const boxH = item.kind === 'landmark' ? 28 : 24;
    if (occupied.some(box => Math.abs(box.x - item.x) < (box.w + boxW) * 0.5 && Math.abs(box.y - item.y) < (box.h + boxH) * 0.5)) {
      continue;
    }
    occupied.push({ x: item.x, y: item.y, w: boxW, h: boxH });
    kept.push(item);
  }
  return kept;
}

export function formatLatLon(lon: number, lat: number): string {
  const normLon = normalizeLon(lon);
  const clampedLat = THREE.MathUtils.clamp(lat, -90, 90);
  const latStr = `${Math.abs(clampedLat).toFixed(2)}°${clampedLat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(normLon).toFixed(2)}°${normLon >= 0 ? 'E' : 'W'}`;
  return `${latStr}  ${lonStr}`;
}

export function formatAltitudeKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '0 km';
  if (km < 1) return `${Math.max(10, Math.round(km * 1000))} m`;
  if (km >= 1000) return `${Math.round(km).toLocaleString('en-US')} km`;
  if (km >= 20) return `${Math.round(km)} km`;
  return `${km.toFixed(1)} km`;
}
