import * as THREE from 'three';
import type { Feature, Geometry, Position } from 'geojson';
import type { AtlasLandmarkKind } from './atlas-landmarks';

export interface AtlasProperties { id: string; name: string; countryId?: string; sourceCountryId?: string }
export type AtlasFeature = Feature<Geometry, AtlasProperties>;
export interface AtlasBounds { x: number; z: number; width: number; height: number }
export const LAT_STRETCH = 1.08;

export function polygons(feature: AtlasFeature): Position[][][] {
  const geometry = feature.geometry;
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
}

/** Deliberately shallow, artistic ridges. These are not measured elevation data. */
export function terrainHeight(lon: number, lat: number) {
  let height = .2;
  const ridges = [
    [86, 31, 15, 3.5, -.18, 1.5], [103, 35, 10, 7, .15, .4],
    [-70, -22, 3, 29, -.12, 1.15], [-111, 43, 5, 17, -.3, .85],
    [10, 46, 6, 2.4, -.13, .65], [38, 9, 4, 7, 0, .65],
    [119, 28, 1.6, 2.5, .4, .14], [138, 36, 1.5, 4, .4, .3],
    [148, -30, 2.7, 10, .1, .4], [59, 57, 2.5, 12, .1, .4],
  ];
  for (const [x, y, w, h, angle, rise] of ridges) {
    const dx = lon - x; const dy = lat - y;
    const u = dx * Math.cos(angle) + dy * Math.sin(angle);
    const v = -dx * Math.sin(angle) + dy * Math.cos(angle);
    height += Math.exp(-((u / w) ** 2 + (v / h) ** 2)) * rise;
  }
  return height;
}

function ringArea(ring: Position[]) {
  let total = 0;
  for (let index = 1; index < ring.length; index++) total += ring[index - 1][0] * ring[index][1] - ring[index][0] * ring[index - 1][1];
  return Math.abs(total);
}

export function featureBounds(feature?: AtlasFeature, allParts = false): AtlasBounds {
  if (!feature) return { x: 0, z: -9, width: 360, height: 162 };
  // Focus the largest land mass, so overseas islands cannot make a country unreadable.
  const parts = polygons(feature).map(polygon => polygon[0]);
  const ring = allParts || feature.properties.id === 'CHN' ? parts.flat() : parts.sort((a, b) => ringArea(b) - ringArea(a))[0];
  if (!ring?.length) return { x: 0, z: 0, width: 10, height: 10 };
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { x: (minX + maxX) / 2, z: -(minY + maxY) / 2 * LAT_STRETCH, width: Math.max(.25, maxX - minX), height: Math.max(.25, (maxY - minY) * LAT_STRETCH) };
}

export function landGeometry(feature: AtlasFeature, heightOffset = 0, subdivide = true) {
  const positions: number[] = []; const colors: number[] = [];
  const low = new THREE.Color('#a6bea2'); const high = new THREE.Color('#cfbe95');
  const addVertex = (x: number, lat: number) => {
    const elevation = terrainHeight(x, lat);
    positions.push(x, elevation + heightOffset, -lat * LAT_STRETCH);
    const color = low.clone().lerp(high, Math.min(1, (elevation - .2) / 1.25));
    colors.push(color.r, color.g, color.b);
  };
  const addTriangle = (a: number[], b: number[], c: number[], iteration: number) => {
    const edge = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1]), Math.hypot(b[0] - c[0], b[1] - c[1]), Math.hypot(c[0] - a[0], c[1] - a[1]));
    if (subdivide && edge > 5 && iteration < 3) {
      const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
      const ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
      addTriangle(a, ab, ca, iteration + 1); addTriangle(ab, b, bc, iteration + 1);
      addTriangle(ca, bc, c, iteration + 1); addTriangle(ab, bc, ca, iteration + 1);
    } else { addVertex(a[0], a[1]); addVertex(b[0], b[1]); addVertex(c[0], c[1]); }
  };
  for (const polygon of polygons(feature)) {
    const outer = polygon[0];
    if (!outer || outer.length < 4) continue;
    const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const hole of polygon.slice(1)) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    const flat = new THREE.ShapeGeometry(shape);
    const points = flat.getAttribute('position'); const indices = flat.index;
    const count = indices?.count ?? points.count;
    for (let index = 0; index < count; index += 3) {
      const triangle = [0, 1, 2].map(offset => { const id = indices ? indices.getX(index + offset) : index + offset; return [points.getX(id), points.getY(id)]; });
      addTriangle(triangle[0], triangle[1], triangle[2], 0);
    }
    flat.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export function borderGeometry(feature: AtlasFeature, offset = .055) {
  const positions: number[] = [];
  for (const polygon of polygons(feature)) for (const ring of polygon) {
    for (let index = 1; index < ring.length; index++) {
      const a = ring[index - 1]; const b = ring[index];
      // Longitude seams are never connected by an artificial line across the atlas.
      if (Math.abs(a[0] - b[0]) > 180) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 2));
      for (let step = 0; step < steps; step++) for (const fraction of [step / steps, (step + 1) / steps]) {
        const lon = a[0] + (b[0] - a[0]) * fraction; const lat = a[1] + (b[1] - a[1]) * fraction;
        positions.push(lon, terrainHeight(lon, lat) + offset, -lat * LAT_STRETCH);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/** Models use a common one-unit scale and simple geometry, with no downloads. */
export function createLandmark(kind: AtlasLandmarkKind) {
  const group = new THREE.Group();
  const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: .88, flatShading: true });
  const ivory = material('#f0e2bf'); const stone = material('#c5a474');
  const metal = material('#819e94'); const red = material('#a8614e'); const dark = material('#59696a');
  const gold = material('#d6ad59');
  const add = (geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(x, y, z); group.add(mesh); return mesh; };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = h / 2, z = 0) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const cone = (radius: number, height: number, mat: THREE.Material, x: number, y: number, z: number, segments = 4) => add(new THREE.ConeGeometry(radius, height, segments), mat, x, y, z);
  const rod = (from: THREE.Vector3, to: THREE.Vector3, radius: number, mat: THREE.Material) => {
    const mesh = add(new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 5), mat, 0, 0, 0);
    mesh.position.copy(from).add(to).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()); return mesh;
  };
  box(.8, .08, .55, stone);
  if (kind === 'eiffel') {
    for (const x of [-.3, .3]) for (const z of [-.24, .24]) rod(new THREE.Vector3(x, .08, z), new THREE.Vector3(x / 4, .92, z / 4), .035, dark);
    box(.5, .05, .4, stone, 0, .35); box(.26, .04, .22, stone, 0, .67);
    cone(.1, .4, dark, 0, 1.05, 0); rod(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, 1.4, 0), .013, gold);
  } else if (kind === 'pyramid') {
    cone(.48, .68, stone, -.2, .42, 0).rotation.y = Math.PI / 4;
    cone(.34, .46, ivory, .35, .31, .2).rotation.y = Math.PI / 4;
    cone(.22, .28, stone, -.4, .22, .44).rotation.y = Math.PI / 4;
  } else if (kind === 'taj') {
    box(.48, .37, .4, ivory, 0, .26);
    add(new THREE.SphereGeometry(.22, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), ivory, 0, .45, 0);
    cone(.045, .13, gold, 0, .72, 0, 6);
    for (const x of [-.32, .32]) for (const z of [-.23, .23]) { add(new THREE.CylinderGeometry(.04, .055, .55, 8), ivory, x, .35, z); cone(.07, .12, gold, x, .68, z, 8); }
  } else if (kind === 'opera') {
    for (let index = 0; index < 5; index++) {
      const shell = add(new THREE.SphereGeometry(.28, 9, 5, 0, Math.PI, 0, Math.PI / 2), ivory, (index - 2) * .13, .1, (index % 2) * .18 - .1);
      shell.scale.set(.8, 1.8 - Math.abs(index - 2) * .25, 1); shell.rotation.z = -.35 + index * .15;
    }
  } else if (kind === 'fuji') {
    cone(.62, .8, dark, 0, .48, 0, 10); cone(.19, .25, ivory, 0, .78, 0, 10);
  } else if (kind === 'wall') {
    for (let index = 0; index < 5; index++) {
      const x = (index - 2) * .25; const z = Math.sin(index * 1.3) * .12;
      box(.29, .2, .13, stone, x, .23, z);
      if (index % 2 === 0) { box(.19, .36, .22, ivory, x, .29, z); cone(.18, .13, dark, x, .52, z).rotation.y = Math.PI / 4; }
      for (const end of [-.09, .09]) box(.055, .08, .14, ivory, x + end, .37, z);
    }
  } else if (kind === 'kremlin') {
    box(.7, .25, .35, red, 0, .2);
    for (const x of [-.27, 0, .27]) { box(.15, .5 + (x === 0 ? .22 : 0), .17, red, x, .35); cone(.13, .35, dark, x, x === 0 ? .9 : .7, 0); add(new THREE.SphereGeometry(.06, 5, 4), gold, x, x === 0 ? 1.09 : .89, 0); }
  } else if (kind === 'clock') {
    box(.28, .79, .28, stone, 0, .48); box(.35, .27, .35, ivory, 0, .83);
    cone(.25, .35, dark, 0, 1.12, 0); const face = add(new THREE.CircleGeometry(.105, 12), dark, 0, .83, .178); face.rotation.y = 0;
    box(.018, .12, .008, gold, 0, .86, .185); box(.07, .018, .008, gold, .025, .83, .185);
  } else if (kind === 'liberty') {
    box(.34, .3, .3, stone, 0, .23); cone(.18, .5, metal, 0, .61, 0, 6);
    add(new THREE.SphereGeometry(.1, 7, 5), metal, 0, .9, 0);
    rod(new THREE.Vector3(.08, .72, 0), new THREE.Vector3(.27, 1.15, 0), .04, metal);
    cone(.07, .16, gold, .27, 1.23, 0, 5);
    for (let index = -2; index <= 2; index++) rod(new THREE.Vector3(0, .95, 0), new THREE.Vector3(index * .065, 1.06 - Math.abs(index) * .02, 0), .012, metal);
  } else {
    cone(.45, .4, dark, 0, .26, 0, 7); box(.14, .46, .13, ivory, 0, .62);
    box(.64, .09, .1, ivory, 0, .79); add(new THREE.SphereGeometry(.085, 8, 6), ivory, 0, .94, 0);
  }
  // Dispose also unused palette materials through userData when the atlas is released.
  group.userData.materials = [ivory, stone, metal, red, dark, gold];
  return group;
}
