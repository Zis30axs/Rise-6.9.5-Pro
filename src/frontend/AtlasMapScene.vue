<script setup lang="ts">
import { geoContains, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import * as THREE from 'three';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { TOKYO_CENTER, TOKYO_COUNTRY_ID, TOKYO_REGION_NAME } from '../runtime/tokyo-world';
import {
  createLandmark,
  polygons,
  type AtlasFeature,
  type AtlasProperties,
} from './atlas-geometry';
import {
  clampGlobeLat,
  computeGlobeBounds,
  computeGlobeCameraPose,
  featureAnchorLatLon,
  formatAltitudeKm,
  formatLatLon,
  GLOBE_FOV_DEG,
  GLOBE_OCEANS,
  GLOBE_RADIUS,
  globeBorderGeometry,
  globeLandGeometry,
  globeSurfaceElevation,
  greatCircleDistanceKm,
  interpolateGreatCircle,
  LAND_BASE_OFFSET,
  latLonToSphere,
  layoutGlobeLabels,
  MAJOR_COUNTRY_PRIORITIES,
  MAX_GLOBE_TILT,
  normalizeLon,
  orientObjectOnSphere,
  spherePointToLatLon,
  withAntarcticaCountry,
  WORLD_ORBIT_SPAN_DEG,
  type GlobeAngularBounds,
  type GlobeLabelCandidate,
  type LatLon,
} from './atlas-globe';
import { ATLAS_LANDMARKS } from './atlas-landmarks';
import './atlas-scene.css';

const props = withDefaults(defineProps<{
  countries: FeatureCollection<Geometry, AtlasProperties>;
  subdivisions: FeatureCollection<Geometry, AtlasProperties>;
  chinaMaritimeLines?: FeatureCollection<Geometry, AtlasProperties>;
  depth: number;
  countryId?: string;
  regionId?: string;
  selectedId?: string;
  width: number;
  height: number;
  bearing?: number;
  active?: boolean;
  zoom?: number;
}>(), { countryId: 'JPN', regionId: '', selectedId: '', bearing: 0, active: true, zoom: 1 });

const emit = defineEmits<{
  'view-change': [view: { countryId: string; regionId: string }];
  select: [target: string];
  'tilt-change': [tiltDeg: number];
}>();

const HOME = TOKYO_CENTER;
const EARTH_SPHERE = new THREE.Sphere(new THREE.Vector3(0, 0, 0), GLOBE_RADIUS);

const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const mode = ref<'webgl' | 'fallback'>('webgl');
const center = ref<LatLon>();
const pointerGeo = ref<LatLon>();
const tiltDeg = ref(0);
const altitudeKm = ref(15200);
const scaleBar = ref({ label: '约 1,500 km', width: 64 });
const cameraScale = ref(WORLD_ORBIT_SPAN_DEG);
const projectedHome = ref({ x: 0, y: 0, visible: false });
const visibleLabels = ref<GlobeLabelCandidate[]>([]);
const visibleDivisionCount = ref(0);
const maritimeVisibleParts = ref(0);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smooth = (t: number) => {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

let owner: (Window & typeof globalThis) | null = null;
let frame = 0;
let dead = false;
let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let globeGroup: THREE.Group | undefined;
let countryGroup: THREE.Group | undefined;
let divisionGroup: THREE.Group | undefined;
let landmarkGroup: THREE.Group | undefined;
let highlightGroup: THREE.Group | undefined;
let homeGroup: THREE.Group | undefined;
let homeBeacon: THREE.Mesh | undefined;
let homePulseRing: THREE.Mesh | undefined;
let previousView = '';
let lastSelection = '';
let pendingAnchor: { point: LatLon; nx: number; ny: number } | undefined;
let flyAnimation: {
  from: LatLon;
  to: LatLon;
  startedAt: number;
  durationMs: number;
} | undefined;

const raycaster = new THREE.Raycaster();
const projectedPoint = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const ownedGeometries = new Set<THREE.BufferGeometry>();
const ownedMaterials = new Set<THREE.Material>();
const countryMaterials = new Map<string, THREE.MeshStandardMaterial>();
const countryPickables: THREE.Mesh[] = [];
const landmarkObjects = new Map<string, THREE.Object3D>();
const divisionCache = new Map<string, { group: THREE.Group; mesh: THREE.Mesh }>();
let divisionPickables: THREE.Mesh[] = [];

const subdivisionsList = computed(() => props.subdivisions.features as AtlasFeature[]);
const countryList = computed(() => withAntarcticaCountry(props.countries.features as AtlasFeature[]));
const countryMetaMap = computed(() => {
  const map = new Map<string, { feature: AtlasFeature; bounds: GlobeAngularBounds; anchor: LatLon }>();
  for (const feature of countryList.value) {
    map.set(feature.properties.id, {
      feature,
      bounds: computeGlobeBounds(feature),
      anchor: featureAnchorLatLon(feature),
    });
  }
  return map;
});
const divisionRecords = computed(() =>
  subdivisionsList.value.map(feature => ({
    feature,
    bounds: computeGlobeBounds(feature),
    anchor: featureAnchorLatLon(feature),
  })),
);
const homeRegion = computed(() =>
  subdivisionsList.value.find(
    feature => feature.properties.countryId === TOKYO_COUNTRY_ID && TOKYO_REGION_NAME.test(feature.properties.name),
  ),
);
const selected = computed(() => props.selectedId || props.regionId || props.countryId || TOKYO_COUNTRY_ID);
const maritimePartCount = computed(() => (props.chinaMaritimeLines?.features ?? []).flatMap(polygons).length);
const normalizedBearing = computed(() => ((Math.round(props.bearing) % 360) + 360) % 360);

function fitSpanDeg(bounds: GlobeAngularBounds): number {
  const aspect = clamp(props.width / Math.max(1, props.height), 0.4, 2.2);
  const adjustedLon = bounds.lonSpan * Math.max(0.28, Math.cos(bounds.lat * Math.PI / 180));
  const radialSpan = Math.max(adjustedLon / aspect, bounds.latSpan * 0.9, bounds.angularSpan * 1.15);
  return clamp(radialSpan * 1.45, 2.4, WORLD_ORBIT_SPAN_DEG);
}

function fitFeatureBounds(feature?: AtlasFeature): GlobeAngularBounds {
  const initial = computeGlobeBounds(feature);
  if (feature?.properties.id !== 'CHN') return initial;
  const extras = props.chinaMaritimeLines?.features.map(line => computeGlobeBounds(line, true)) ?? [];
  if (!extras.length) return initial;
  const all = [initial, ...extras];
  const minLon = Math.min(...all.map(b => b.lon - b.lonSpan / 2));
  const maxLon = Math.max(...all.map(b => b.lon + b.lonSpan / 2));
  const minLat = Math.min(...all.map(b => b.lat - b.latSpan / 2));
  const maxLat = Math.max(...all.map(b => b.lat + b.latSpan / 2));
  const lon = (minLon + maxLon) / 2;
  const lat = clampGlobeLat((minLat + maxLat) / 2);
  return {
    lon,
    lat,
    lonSpan: maxLon - minLon,
    latSpan: maxLat - minLat,
    angularSpan: Math.max((maxLon - minLon) * Math.cos(lat * Math.PI / 180), maxLat - minLat),
  };
}

const homeStops = computed(() => {
  const world = computeGlobeBounds();
  const japan = countryList.value.find(feature => feature.properties.id === TOKYO_COUNTRY_ID);
  const country = fitFeatureBounds(japan);
  const region = computeGlobeBounds(homeRegion.value ?? japan);
  return {
    world: { lon: 112, lat: 26, spanDeg: WORLD_ORBIT_SPAN_DEG },
    country: { lon: country.lon, lat: country.lat, spanDeg: clamp(fitSpanDeg(country), 12, 34) },
    region: { lon: region.lon || HOME.lon, lat: region.lat || HOME.lat, spanDeg: clamp(fitSpanDeg(region), 2.4, 7.5) },
  };
});

function homeTarget(depthValue: number) {
  const { world, country, region } = homeStops.value;
  const phase = clamp(depthValue, 3, 5);
  const mix = smooth(phase < 4 ? phase - 3 : phase - 4);
  const from = phase < 4 ? region : country;
  const to = phase < 4 ? country : world;
  const point = interpolateGreatCircle(from.lon, from.lat, to.lon, to.lat, mix);
  return {
    lon: point.lon,
    lat: clampGlobeLat(point.lat),
    spanDeg: Math.exp(THREE.MathUtils.lerp(Math.log(from.spanDeg), Math.log(to.spanDeg), mix)),
  };
}

function activeCenterLatLon(): LatLon {
  const base = homeTarget(props.depth);
  if (!center.value) return { lon: base.lon, lat: base.lat };
  if (flyAnimation && owner) {
    const elapsed = (owner.performance.now?.() ?? Date.now()) - flyAnimation.startedAt;
    const t = flyAnimation.durationMs > 0 ? clamp(elapsed / flyAnimation.durationMs, 0, 1) : 1;
    const eased = 1 - (1 - t) ** 3;
    const pos = interpolateGreatCircle(flyAnimation.from.lon, flyAnimation.from.lat, flyAnimation.to.lon, flyAnimation.to.lat, eased);
    if (t >= 1) {
      center.value = { lon: flyAnimation.to.lon, lat: clampGlobeLat(flyAnimation.to.lat) };
      flyAnimation = undefined;
    }
    return { lon: pos.lon, lat: clampGlobeLat(pos.lat) };
  }
  return center.value;
}

const cameraTarget = computed(() => {
  const base = homeTarget(props.depth);
  const active = center.value ?? { lon: base.lon, lat: base.lat };
  return {
    lon: active.lon,
    lat: clampGlobeLat(active.lat),
    spanDeg: clamp(base.spanDeg / Math.max(0.02, props.zoom), 0.75, 148),
  };
});

const centerLon = computed(() => cameraTarget.value.lon);
const centerLat = computed(() => cameraTarget.value.lat);
const displayCoordText = computed(() => {
  const pt = pointerGeo.value ?? { lon: centerLon.value, lat: centerLat.value };
  return formatLatLon(pt.lon, pt.lat);
});
const altitudeLabel = computed(() => formatAltitudeKm(altitudeKm.value));

function ownGeometry<T extends THREE.BufferGeometry>(geometry: T) {
  ownedGeometries.add(geometry);
  return geometry;
}

function ownMaterial<T extends THREE.Material>(material: T) {
  ownedMaterials.add(material);
  return material;
}

function lineFor(feature: AtlasFeature, color: string, offset = LAND_BASE_OFFSET + 0.08, opacity = 1) {
  return new THREE.LineSegments(
    ownGeometry(globeBorderGeometry(feature, offset)),
    ownMaterial(new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: false,
    })),
  );
}

function releaseGroup(group: THREE.Group) {
  group.traverse(object => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry) {
      renderable.geometry.dispose();
      ownedGeometries.delete(renderable.geometry);
    }
    if (renderable.material) {
      for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) {
        material.dispose();
        ownedMaterials.delete(material);
      }
    }
  });
  group.clear();
}

function createStarfield(): THREE.Points {
  const count = 780;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let seed = 0x51a7beef;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const u = nextRand() * 2 - 1;
    const theta = nextRand() * Math.PI * 2;
    const r = 920 + nextRand() * 260;
    const ring = Math.sqrt(Math.max(0, 1 - u * u));
    positions[i * 3] = r * ring * Math.cos(theta);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * ring * Math.sin(theta);
    const tint = nextRand();
    const brightness = 0.55 + nextRand() * 0.45;
    colors[i * 3] = brightness * (tint > 0.72 ? 0.84 : 1.0);
    colors[i * 3 + 1] = brightness * (tint > 0.72 ? 0.92 : 0.96);
    colors[i * 3 + 2] = brightness;
  }
  const geo = ownGeometry(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = ownMaterial(new THREE.PointsMaterial({
    size: 1.5,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
  }));
  return new THREE.Points(geo, mat);
}

function createGraticuleLines(): THREE.LineSegments {
  const pts: number[] = [];
  const step = 4;
  const alt = 0.14;
  for (let lon = -180; lon < 180; lon += 20) {
    for (let lat = -80; lat < 80; lat += step) {
      const a = latLonToSphere(lon, lat, alt);
      const b = latLonToSphere(lon, Math.min(80, lat + step), alt);
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    for (let lon = -180; lon < 180; lon += step) {
      const a = latLonToSphere(lon, lat, alt);
      const b = latLonToSphere(lon + step, lat, alt);
      pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const geo = ownGeometry(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(
    geo,
    ownMaterial(new THREE.LineBasicMaterial({ color: '#6cb8dc', transparent: true, opacity: 0.14, depthWrite: false })),
  );
}

function createAtmosphereRim(radius: number, backSide: boolean, strength: number, power: number): THREE.Mesh {
  const geo = ownGeometry(new THREE.SphereGeometry(radius, 72, 48));
  const mat = ownMaterial(new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#57bfff') },
      uStrength: { value: strength },
      uPower: { value: power },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uPower;
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;
      void main() {
        float ndv = dot(normalize(vWorldNormal), normalize(vViewDir));
        float rim = ${backSide ? 'clamp(0.68 - ndv, 0.0, 1.0)' : 'clamp(1.0 - max(0.0, ndv), 0.0, 1.0)'};
        float alpha = pow(rim, uPower) * uStrength;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    side: backSide ? THREE.BackSide : THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = backSide ? 200 : 12;
  return mesh;
}

function createHomePulseMarker() {
  const group = new THREE.Group();
  const baseGeo = ownGeometry(new THREE.SphereGeometry(0.45, 16, 12));
  const baseMat = ownMaterial(new THREE.MeshBasicMaterial({ color: '#ff3853', toneMapped: false, depthTest: false }));
  homeBeacon = new THREE.Mesh(baseGeo, baseMat);
  homeBeacon.userData.target = `division:${homeRegion.value?.properties.id ?? 'JPN-1860'}`;

  const ringGeo = ownGeometry(new THREE.RingGeometry(0.62, 0.96, 32));
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = ownMaterial(new THREE.MeshBasicMaterial({
    color: '#ff6479',
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthTest: false,
    toneMapped: false,
  }));
  homePulseRing = new THREE.Mesh(ringGeo, ringMat);
  group.add(homeBeacon, homePulseRing);
  orientObjectOnSphere(group, HOME.lon, HOME.lat, globeSurfaceElevation(HOME.lon, HOME.lat, LAND_BASE_OFFSET + 0.14));
  return group;
}

function initialize() {
  if (!canvas.value || dead || renderer) return;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(owner?.devicePixelRatio || 1, 1.75));
    renderer.setClearColor('#030914', 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(GLOBE_FOV_DEG, Math.max(0.3, props.width / Math.max(1, props.height)), 0.15, 2400);

    // Space + Sunlight lighting gives subtle terminator depth while keeping night/far longitudes clean and readable.
    scene.add(new THREE.HemisphereLight('#d9eeff', '#1f445c', 1.65));
    scene.add(new THREE.AmbientLight('#8fb8d6', 0.45));
    const sun = new THREE.DirectionalLight('#fff4de', 1.45);
    sun.position.set(220, 140, 260);
    scene.add(sun);

    scene.add(createStarfield());
    globeGroup = new THREE.Group();
    countryGroup = new THREE.Group();
    divisionGroup = new THREE.Group();
    landmarkGroup = new THREE.Group();
    highlightGroup = new THREE.Group();
    homeGroup = new THREE.Group();
    globeGroup.add(countryGroup, divisionGroup, landmarkGroup, highlightGroup, homeGroup);
    scene.add(globeGroup);

    // Glossy ocean bathymetry sphere + coordinate grid + outer Fresnel atmospheric limb scatter.
    const ocean = new THREE.Mesh(
      ownGeometry(new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64)),
      ownMaterial(new THREE.MeshPhongMaterial({
        color: '#0e3550',
        emissive: '#051929',
        specular: '#4a98c4',
        shininess: 22,
      })),
    );
    ocean.renderOrder = 0;
    globeGroup.add(ocean);
    globeGroup.add(createGraticuleLines());
    globeGroup.add(createAtmosphereRim(GLOBE_RADIUS * 1.006, false, 0.34, 3.0));
    globeGroup.add(createAtmosphereRim(GLOBE_RADIUS * 1.064, true, 0.62, 3.2));

    for (const feature of countryList.value) {
      const isChina = feature.properties.id === 'CHN';
      const material = ownMaterial(new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.04,
        side: THREE.DoubleSide,
        polygonOffset: isChina,
        polygonOffsetFactor: isChina ? -3 : 0,
        polygonOffsetUnits: isChina ? -3 : 0,
      }));
      countryMaterials.set(feature.properties.id, material);
      const mesh = new THREE.Mesh(ownGeometry(globeLandGeometry(feature)), material);
      mesh.userData.target = `country:${feature.properties.id}`;
      mesh.renderOrder = isChina ? 5 : 1;
      countryGroup.add(mesh);
      countryPickables.push(mesh);
      countryGroup.add(lineFor(feature, '#82aa9a', LAND_BASE_OFFSET + 0.07, 0.55));
    }

    // Preserve China's red sovereign border & islands independently of protagonist Tokyo marker.
    const china = countryList.value.find(feature => feature.properties.id === 'CHN');
    if (china) {
      const outline = lineFor(china, '#f33d53', LAND_BASE_OFFSET + 0.16);
      outline.material.toneMapped = false;
      outline.renderOrder = 100;
      homeGroup.add(outline);
    }
    const japan = countryList.value.find(feature => feature.properties.id === TOKYO_COUNTRY_ID);
    if (japan) {
      const outline = lineFor(japan, '#ff4059', LAND_BASE_OFFSET + 0.15);
      outline.material.toneMapped = false;
      outline.renderOrder = 100;
      homeGroup.add(outline);
    }
    if (homeRegion.value) {
      const outline = lineFor(homeRegion.value, '#ff4059', LAND_BASE_OFFSET + 0.19);
      outline.material.toneMapped = false;
      outline.renderOrder = 101;
      homeGroup.add(outline);
    }
    for (const feature of props.chinaMaritimeLines?.features ?? []) {
      const strips = new THREE.Mesh(
        ownGeometry(globeLandGeometry(feature, LAND_BASE_OFFSET + 0.15, false)),
        ownMaterial(new THREE.MeshBasicMaterial({
          color: '#f33d53',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.96,
          depthTest: true,
          toneMapped: false,
        })),
      );
      strips.renderOrder = 100;
      homeGroup.add(strips);
      const outline = lineFor(feature, '#f33d53', LAND_BASE_OFFSET + 0.18);
      outline.material.toneMapped = false;
      outline.renderOrder = 101;
      homeGroup.add(outline);
    }

    homeGroup.add(createHomePulseMarker());

    for (const landmark of ATLAS_LANDMARKS) {
      if (!countryMetaMap.value.has(landmark.countryId)) continue;
      const model = createLandmark(landmark.kind);
      model.userData.target = `landmark:${landmark.id}`;
      model.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) ownedGeometries.add(mesh.geometry);
        if (mesh.material) {
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) ownedMaterials.add(material);
        }
        object.userData.target = `landmark:${landmark.id}`;
      });
      for (const material of model.userData.materials as THREE.Material[]) ownedMaterials.add(material);
      orientObjectOnSphere(model, landmark.lon, landmark.lat, globeSurfaceElevation(landmark.lon, landmark.lat, LAND_BASE_OFFSET) - 0.04);
      landmarkObjects.set(landmark.id, model);
      landmarkGroup.add(model);
    }

    mode.value = 'webgl';
    updateCamera();
    requestRender();
  } catch {
    fallback();
  }
}

function makeDivisionMeshes() {
  if (!divisionGroup || !renderer || !camera) return;
  const span = cameraTarget.value.spanDeg;
  const targetVec = latLonToSphere(cameraTarget.value.lon, cameraTarget.value.lat, 0).normalize();
  const candidates = span > 68
    ? []
    : divisionRecords.value
        .filter(({ bounds, feature }) => {
          const isFocusedCountry = feature.properties.countryId === props.countryId;
          const threshold = isFocusedCountry ? span * 1.45 : span * 0.95;
          if (Math.abs(bounds.lat - cameraTarget.value.lat) > threshold + bounds.latSpan) return false;
          const divVec = latLonToSphere(bounds.lon, bounds.lat, 0).normalize();
          const angDistDeg = Math.acos(clamp(divVec.dot(targetVec), -1, 1)) * 180 / Math.PI;
          if (angDistDeg > span * 1.15 + bounds.angularSpan) return false;
          return bounds.angularSpan / Math.max(1, span) > 0.025 || isFocusedCountry;
        })
        .sort((a, b) => {
          const da = greatCircleDistanceKm(a.bounds.lon, a.bounds.lat, cameraTarget.value.lon, cameraTarget.value.lat);
          const db = greatCircleDistanceKm(b.bounds.lon, b.bounds.lat, cameraTarget.value.lon, cameraTarget.value.lat);
          return da - db;
        })
        .slice(0, 240);

  const visible = new Set(candidates.map(record => record.feature.properties.id));
  for (const [id, cached] of divisionCache) cached.group.visible = visible.has(id);
  divisionPickables = [];
  for (const { feature } of candidates) {
    let cached = divisionCache.get(feature.properties.id);
    if (!cached) {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(
        ownGeometry(globeLandGeometry(feature, LAND_BASE_OFFSET + 0.04, false)),
        ownMaterial(new THREE.MeshBasicMaterial({
          color: '#b8d6b2',
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        })),
      );
      mesh.userData.target = `division:${feature.properties.id}`;
      mesh.userData.countryId = feature.properties.countryId;
      mesh.renderOrder = feature.properties.countryId === 'CHN' ? 10 : 3;
      group.add(mesh);
      const outline = lineFor(feature, '#78b09f', LAND_BASE_OFFSET + 0.09, 0.78);
      outline.renderOrder = feature.properties.countryId === 'CHN' ? 11 : 4;
      group.add(outline);
      divisionGroup.add(group);
      cached = { group, mesh };
      divisionCache.set(feature.properties.id, cached);
    }
    divisionPickables.push(cached.mesh);
  }
  if (divisionCache.size > 340) {
    for (const [id, cached] of divisionCache) {
      if (!visible.has(id)) {
        releaseGroup(cached.group);
        divisionGroup.remove(cached.group);
        divisionCache.delete(id);
      }
    }
  }
  visibleDivisionCount.value = candidates.length;
}

function updateHighlights() {
  if (!highlightGroup || lastSelection === `${selected.value}|${props.countryId}`) return;
  lastSelection = `${selected.value}|${props.countryId}`;
  releaseGroup(highlightGroup);
  for (const [id, material] of countryMaterials) {
    const highlighted = id === selected.value || (props.depth < 4.7 && id === props.countryId);
    material.color.set(highlighted ? '#f0d89e' : '#ffffff');
  }
  const feature = [...countryList.value, ...subdivisionsList.value].find(item => item.properties.id === selected.value);
  if (feature && feature.properties.id !== TOKYO_COUNTRY_ID && feature.properties.id !== homeRegion.value?.properties.id) {
    const line = lineFor(feature, '#ffd670', LAND_BASE_OFFSET + 0.18, 0.98);
    line.material.toneMapped = false;
    line.renderOrder = 95;
    highlightGroup.add(line);
  }
}

function sphereHitAt(nx: number, ny: number): THREE.Vector3 | undefined {
  if (!camera) return undefined;
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const hit = raycaster.ray.intersectSphere(EARTH_SPHERE, new THREE.Vector3());
  return hit ?? undefined;
}

function groundAt(nx: number, ny: number): LatLon | undefined {
  if (!camera || mode.value === 'fallback') {
    const point = fallbackProjection().invert?.([(nx + 1) * props.width / 2, (1 - ny) * props.height / 2]);
    if (!point || !point.every(Number.isFinite)) return undefined;
    return { lon: normalizeLon(point[0]), lat: clampGlobeLat(point[1]) };
  }
  const hit = sphereHitAt(nx, ny);
  return hit ? spherePointToLatLon(hit) : undefined;
}

function updateScale() {
  const a = groundAt(-70 / Math.max(1, props.width), 0);
  const b = groundAt(70 / Math.max(1, props.width), 0);
  let distanceKm = 0;
  if (a && b) {
    distanceKm = greatCircleDistanceKm(a.lon, a.lat, b.lon, b.lat);
  } else {
    const degPerViewport = cameraTarget.value.spanDeg;
    distanceKm = (140 / Math.max(1, props.height)) * degPerViewport * 111.195;
  }
  if (!(distanceKm > 0)) return;
  const base = 10 ** Math.floor(Math.log10(distanceKm));
  const ratio = distanceKm / base;
  const nice = base * (ratio >= 5 ? 5 : ratio >= 2 ? 2 : 1);
  scaleBar.value = {
    label: nice < 1 ? `约 ${Math.round(nice * 1000)} m` : `约 ${nice >= 10 ? Math.round(nice).toLocaleString('en-US') : Number(nice.toPrecision(3))} km`,
    width: clamp(70 * nice / distanceKm, 28, 108),
  };
}

function contains(feature: AtlasFeature, lon: number, lat: number) {
  if (feature.properties.id === 'ATA') return geoContains(feature, [lon, lat]);
  const insideRing = (ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if ((a[1] > lat) !== (b[1] > lat) && lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  return polygons(feature).some(polygon => insideRing(polygon[0]) && !polygon.slice(1).some(insideRing));
}

function reportView() {
  const lon = cameraTarget.value.lon;
  const lat = cameraTarget.value.lat;
  const candidates = divisionRecords.value.filter(
    ({ bounds, feature }) =>
      Math.abs(bounds.lon - lon) <= bounds.lonSpan / 2 + 0.2 &&
      Math.abs(bounds.lat - lat) <= bounds.latSpan / 2 + 0.2 &&
      contains(feature, lon, lat),
  );
  const division = candidates.find(record => record.feature.properties.countryId === 'CHN') ?? candidates[0];
  const china = countryMetaMap.value.get('CHN')?.feature;
  const inChina = Boolean(china && contains(china, lon, lat));
  const countryId = inChina
    ? 'CHN'
    : division?.feature.properties.countryId ??
      countryList.value.find(feature => contains(feature, lon, lat))?.properties.id ??
      '';
  const regionId = division?.feature.properties.countryId === countryId ? division.feature.properties.id : '';
  const key = `${countryId}|${regionId}`;
  if (countryId && key !== previousView) {
    previousView = key;
    emit('view-change', { countryId, regionId });
  }
}

function applyCameraPose(latLon: LatLon, spanDeg: number) {
  const width = Math.max(1, Math.round(props.width));
  const height = Math.max(1, Math.round(props.height));
  const aspect = width / height;
  const pose = computeGlobeCameraPose({
    lon: latLon.lon,
    lat: latLon.lat,
    spanDeg,
    headingDeg: props.bearing,
    tiltDeg: tiltDeg.value,
    aspect,
  });
  altitudeKm.value = pose.altitudeKm;
  cameraScale.value = spanDeg;
  if (!camera || !renderer) return;
  camera.aspect = aspect;
  camera.position.copy(pose.eye);
  camera.up.copy(pose.up);
  camera.lookAt(pose.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

function updateCamera() {
  const width = Math.max(1, Math.round(props.width));
  const height = Math.max(1, Math.round(props.height));
  const activeLatLon = activeCenterLatLon();
  const baseTarget = homeTarget(props.depth);
  const spanDeg = clamp(baseTarget.spanDeg / Math.max(0.02, props.zoom), 0.75, 148);
  applyCameraPose(activeLatLon, spanDeg);

  if (!camera || !renderer) {
    if (pendingAnchor) {
      const after = groundAt(pendingAnchor.nx, pendingAnchor.ny);
      if (after) {
        center.value = {
          lon: normalizeLon(activeLatLon.lon + (pendingAnchor.point.lon - after.lon)),
          lat: clampGlobeLat(activeLatLon.lat + (pendingAnchor.point.lat - after.lat)),
        };
      }
      pendingAnchor = undefined;
    }
    updateScale();
    reportView();
    return;
  }

  if (pendingAnchor) {
    const afterVec = sphereHitAt(pendingAnchor.nx, pendingAnchor.ny);
    if (afterVec) {
      const anchorVec = latLonToSphere(pendingAnchor.point.lon, pendingAnchor.point.lat, 0).normalize();
      const rot = new THREE.Quaternion().setFromUnitVectors(afterVec.clone().normalize(), anchorVec);
      const nextCenterVec = latLonToSphere(activeLatLon.lon, activeLatLon.lat, 0).normalize().applyQuaternion(rot);
      const nextCenter = spherePointToLatLon(nextCenterVec);
      center.value = { lon: nextCenter.lon, lat: clampGlobeLat(nextCenter.lat) };
      applyCameraPose(center.value, spanDeg);
    }
    pendingAnchor = undefined;
  }

  const size = new THREE.Vector2();
  renderer.getSize(size);
  if (size.x !== width || size.y !== height) renderer.setSize(width, height, false);

  makeDivisionMeshes();
  const landmarkScale = clamp(spanDeg * 0.042, 0.08, 12.5);
  for (const landmark of ATLAS_LANDMARKS) {
    const model = landmarkObjects.get(landmark.id);
    if (!model) continue;
    model.visible = spanDeg > 92 ? landmark.worldPriority <= (props.width > 550 ? 2 : 1) : true;
    model.scale.setScalar(landmarkScale);
  }
  const homeScale = clamp(spanDeg * 0.022, 0.16, 2.2);
  if (homeBeacon) homeBeacon.scale.setScalar(homeScale);
  if (homePulseRing) homePulseRing.scale.setScalar(homeScale);

  updateHighlights();
  updateScale();
  reportView();
}

function updateProjectedOverlays() {
  if (!camera || !renderer) return;
  const camPos = camera.position;
  const homeWorld = latLonToSphere(HOME.lon, HOME.lat, globeSurfaceElevation(HOME.lon, HOME.lat, LAND_BASE_OFFSET + 0.16));
  const homeHemi = homeWorld.clone().normalize().dot(tmpVec.copy(camPos).sub(homeWorld).normalize());
  projectedPoint.copy(homeWorld).project(camera);
  const hx = (projectedPoint.x + 1) / 2 * props.width;
  const hy = (1 - projectedPoint.y) / 2 * props.height;
  projectedHome.value = {
    x: hx,
    y: hy,
    visible: homeHemi > 0.08 && projectedPoint.z >= -1 && projectedPoint.z <= 1 && Math.abs(projectedPoint.x) < 0.96 && Math.abs(projectedPoint.y) < 0.92,
  };

  maritimeVisibleParts.value = (props.chinaMaritimeLines?.features ?? []).flatMap(polygons).filter(polygon => {
    const pt = polygon[0][0];
    const world = latLonToSphere(pt[0], pt[1], LAND_BASE_OFFSET + 0.18);
    const hemi = world.clone().normalize().dot(tmpVec.copy(camPos).sub(world).normalize());
    if (hemi <= 0.05) return false;
    projectedPoint.copy(world).project(camera!);
    return projectedPoint.z >= -1 && projectedPoint.z <= 1 && Math.abs(projectedPoint.x) < 1 && Math.abs(projectedPoint.y) < 1;
  }).length;

  const span = cameraTarget.value.spanDeg;
  const candidates: GlobeLabelCandidate[] = [];
  const projectCandidate = (
    id: string,
    target: string,
    name: string,
    kind: GlobeLabelCandidate['kind'],
    lon: number,
    lat: number,
    priority: number,
    yOffset = 0,
    active = false,
  ) => {
    const alt = kind === 'ocean' ? 0.06 : globeSurfaceElevation(lon, lat, LAND_BASE_OFFSET + 0.1);
    const world = latLonToSphere(lon, lat, alt);
    const hemi = world.clone().normalize().dot(tmpVec.copy(camPos).sub(world).normalize());
    if (hemi <= 0.14) return;
    projectedPoint.copy(world).project(camera!);
    if (projectedPoint.z < -1 || projectedPoint.z > 1) return;
    candidates.push({
      id,
      target,
      name,
      kind,
      x: (projectedPoint.x + 1) / 2 * props.width,
      y: (1 - projectedPoint.y) / 2 * props.height + yOffset,
      hemisphereDot: hemi,
      priority,
      active,
    });
  };

  for (const landmark of ATLAS_LANDMARKS) {
    const model = landmarkObjects.get(landmark.id);
    if (!model?.visible) continue;
    projectCandidate(
      `lm-${landmark.id}`,
      `landmark:${landmark.id}`,
      landmark.name,
      'landmark',
      landmark.lon,
      landmark.lat,
      86 + (3 - landmark.worldPriority) * 4,
      12,
      selected.value === landmark.id,
    );
  }

  for (const [id, meta] of countryMetaMap.value) {
    const major = MAJOR_COUNTRY_PRIORITIES[id];
    const isSel = id === selected.value || id === props.countryId;
    if (span > 52 && !major && !isSel) continue;
    if (span > 22 && !major && meta.bounds.angularSpan < 5 && !isSel) continue;
    projectCandidate(
      `ct-${id}`,
      `country:${id}`,
      meta.feature.properties.name,
      'country',
      meta.anchor.lon,
      meta.anchor.lat,
      (major ?? 52) + (isSel ? 12 : 0),
      0,
      isSel,
    );
  }

  if (span < 42) {
    const activeCountry = props.countryId || TOKYO_COUNTRY_ID;
    for (const record of divisionRecords.value) {
      const feature = record.feature;
      const inFocus = feature.properties.countryId === activeCountry;
      if (!inFocus && span > 14) continue;
      if (record.bounds.angularSpan < span * 0.055 && feature.properties.id !== selected.value && feature.properties.id !== homeRegion.value?.properties.id) continue;
      projectCandidate(
        `dv-${feature.properties.id}`,
        `division:${feature.properties.id}`,
        feature.properties.name,
        'division',
        record.anchor.lon,
        record.anchor.lat,
        72 + (inFocus ? 8 : 0) + (feature.properties.id === selected.value ? 15 : 0),
        0,
        feature.properties.id === selected.value,
      );
    }
  }

  if (span > 32) {
    for (const ocean of GLOBE_OCEANS) {
      projectCandidate(`oc-${ocean.id}`, '', ocean.name, 'ocean', ocean.lon, ocean.lat, ocean.priority);
    }
  }

  const occupied = projectedHome.value.visible ? [{ x: hx, y: hy, w: 68, h: 30 }] : [];
  visibleLabels.value = layoutGlobeLabels(candidates, props.width, props.height, occupied);
}

function render() {
  frame = 0;
  if (dead || !props.active || root.value?.ownerDocument.hidden) return;
  if (!renderer || !scene || !camera) {
    if (pendingAnchor || flyAnimation) updateCamera();
    return;
  }
  try {
    if (pendingAnchor || flyAnimation) updateCamera();
    if (homePulseRing && owner) {
      const phase = ((owner.performance.now?.() ?? Date.now()) % 1800) / 1800;
      const pulse = 1 + phase * 0.9;
      const baseScale = clamp(cameraTarget.value.spanDeg * 0.022, 0.16, 2.2);
      homePulseRing.scale.setScalar(baseScale * pulse);
      const mat = homePulseRing.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - phase) * 0.72;
    }
    renderer.render(scene, camera);
    updateProjectedOverlays();
    if (flyAnimation) requestRender();
  } catch {
    fallback();
  }
}

function requestRender() {
  if (!dead && owner && !frame && props.active) frame = owner.requestAnimationFrame(render);
}

function panBy(dx: number, dy: number) {
  flyAnimation = undefined;
  const current = center.value ?? { lon: cameraTarget.value.lon, lat: cameraTarget.value.lat };
  const startVec = camera ? sphereHitAt(0, 0) : undefined;
  const finishVec = camera ? sphereHitAt(dx * 2 / Math.max(1, props.width), -dy * 2 / Math.max(1, props.height)) : undefined;
  if (startVec && finishVec) {
    const rot = new THREE.Quaternion().setFromUnitVectors(finishVec.clone().normalize(), startVec.clone().normalize());
    const rotated = latLonToSphere(current.lon, current.lat, 0).normalize().applyQuaternion(rot);
    const next = spherePointToLatLon(rotated);
    center.value = { lon: next.lon, lat: clampGlobeLat(next.lat) };
  } else {
    const span = cameraTarget.value.spanDeg;
    const rad = props.bearing * Math.PI / 180;
    const degPerPx = span / Math.max(120, props.height);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const moveEast = -dx * cos + dy * sin;
    const moveNorth = dy * cos + dx * sin;
    const nextLat = clampGlobeLat(current.lat + moveNorth * degPerPx);
    const lonFactor = 1 / Math.max(0.28, Math.cos(nextLat * Math.PI / 180));
    center.value = { lon: normalizeLon(current.lon + moveEast * degPerPx * lonFactor), lat: nextLat };
  }
  updateCamera();
  requestRender();
}

function adjustTilt(deltaDeg: number) {
  const next = clamp(tiltDeg.value + deltaDeg, 0, MAX_GLOBE_TILT);
  if (Math.abs(next - tiltDeg.value) < 0.01) return;
  tiltDeg.value = next;
  emit('tilt-change', next);
  updateCamera();
  requestRender();
}

function setTilt(deg: number) {
  const next = clamp(deg, 0, MAX_GLOBE_TILT);
  tiltDeg.value = next;
  emit('tilt-change', next);
  updateCamera();
  requestRender();
}

function toggleTilt() {
  setTilt(tiltDeg.value < 20 ? 48 : 0);
}

function getTilt() {
  return tiltDeg.value;
}

function getTelemetry() {
  return {
    lon: centerLon.value,
    lat: centerLat.value,
    altitudeKm: altitudeKm.value,
    tiltDeg: tiltDeg.value,
    headingDeg: normalizedBearing.value,
  };
}

function setZoomAnchor(clientX: number, clientY: number, targetX = clientX, targetY = clientY) {
  const surface = camera && mode.value === 'webgl' ? canvas.value : root.value;
  if (!surface) return;
  const rect = surface.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const nx = (clientX - rect.left) / rect.width * 2 - 1;
  const ny = 1 - (clientY - rect.top) / rect.height * 2;
  const pt = groundAt(nx, ny);
  if (!pt) return;
  flyAnimation = undefined;
  center.value = { lon: cameraTarget.value.lon, lat: cameraTarget.value.lat };
  pendingAnchor = {
    point: pt,
    nx: (targetX - rect.left) / rect.width * 2 - 1,
    ny: 1 - (targetY - rect.top) / rect.height * 2,
  };
  requestRender();
}

function startFlyTo(target: LatLon, durationMs = 460) {
  const reducedMotion = Boolean(owner?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const from = center.value ?? { lon: cameraTarget.value.lon, lat: cameraTarget.value.lat };
  if (reducedMotion || durationMs <= 0 || !renderer) {
    flyAnimation = undefined;
    center.value = { lon: target.lon, lat: clampGlobeLat(target.lat) };
    return;
  }
  flyAnimation = {
    from,
    to: { lon: target.lon, lat: clampGlobeLat(target.lat) },
    startedAt: owner?.performance.now?.() ?? Date.now(),
    durationMs,
  };
}

function focusFeature(id: string) {
  const raw = id.replace(/^(country|division):/, '');
  const isDivision = id.startsWith('division:');
  const feature = (isDivision ? subdivisionsList.value : countryList.value).find(item => item.properties.id === raw);
  if (!feature) return;
  const bounds = fitFeatureBounds(feature);
  const anchor = featureAnchorLatLon(feature);
  pendingAnchor = undefined;
  startFlyTo(anchor, 480);
  const depthValue = isDivision ? 3 : 4;
  const targetSpan = isDivision ? clamp(fitSpanDeg(bounds), 2.2, 22) : clamp(fitSpanDeg(bounds), 8, 62);
  const zoom = clamp(homeTarget(depthValue).spanDeg / targetSpan, 0.04, 120);
  updateCamera();
  requestRender();
  return { depth: depthValue, zoom };
}

function focusLandmark(id: string) {
  const landmark = ATLAS_LANDMARKS.find(item => item.id === id);
  if (!landmark) return;
  pendingAnchor = undefined;
  startFlyTo({ lon: landmark.lon, lat: landmark.lat }, 480);
  if (tiltDeg.value < 22) {
    tiltDeg.value = 38;
    emit('tilt-change', tiltDeg.value);
  }
  const depthValue = 4;
  const zoom = clamp(homeTarget(depthValue).spanDeg / 14, 0.25, 120);
  updateCamera();
  requestRender();
  return { depth: depthValue, zoom, countryId: landmark.countryId };
}

function resetView() {
  flyAnimation = undefined;
  center.value = undefined;
  pendingAnchor = undefined;
  previousView = '';
  tiltDeg.value = 0;
  emit('tilt-change', 0);
  updateCamera();
  requestRender();
}

function isHomeRegion() {
  return Boolean(homeRegion.value && contains(homeRegion.value, cameraTarget.value.lon, cameraTarget.value.lat));
}

function getCameraSpan() {
  return cameraTarget.value.spanDeg;
}

function getZoomView(factor: number, initialSpan?: number) {
  const base = Number.isFinite(initialSpan) && initialSpan! > 0 ? initialSpan! : cameraTarget.value.spanDeg;
  const desired = clamp(base / (Number.isFinite(factor) && factor > 0 ? factor : 1), 0.75, 160);
  const provinceSpan = homeTarget(3).spanDeg;
  const worldSpan = homeTarget(5).spanDeg;
  if (desired >= worldSpan) return { depth: 5, zoom: 1 };
  if (desired < provinceSpan) {
    if (isHomeRegion()) return { depth: Math.max(-2, 3 - Math.log2(provinceSpan / desired)), zoom: 1 };
    return { depth: 3, zoom: Math.min(120, provinceSpan / desired) };
  }
  let low = 3;
  let high = 5;
  for (let iteration = 0; iteration < 32; iteration++) {
    const middle = (low + high) / 2;
    if (homeTarget(middle).spanDeg < desired) low = middle;
    else high = middle;
  }
  return { depth: (low + high) / 2, zoom: 1 };
}

function pickAt(clientX: number, clientY: number) {
  if (!renderer || !camera || !canvas.value || !props.active || mode.value !== 'webgl') return;
  const rect = canvas.value.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1 || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
  raycaster.setFromCamera(
    new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2),
    camera,
  );
  const landmarks = [...landmarkObjects.values()].filter(model => model.visible);
  const landmarkHit = raycaster.intersectObjects(landmarks, true)[0];
  if (landmarkHit) return landmarkHit.object.userData.target as string;
  const countryHits = raycaster.intersectObjects(countryPickables, false);
  const chinaHit = countryHits.find(hit => hit.object.userData.target === 'country:CHN');
  if (divisionGroup?.visible) {
    const hits = raycaster.intersectObjects(divisionPickables, false);
    const hit = hits.find(item => item.object.userData.countryId === 'CHN') ?? chinaHit ?? hits[0];
    if (hit) return hit.object.userData.target as string;
  }
  return (chinaHit ?? countryHits[0])?.object.userData.target as string | undefined;
}

function handlePointerHover(event: PointerEvent) {
  if (mode.value !== 'webgl' || !canvas.value || !camera) return;
  const rect = canvas.value.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const nx = (event.clientX - rect.left) / rect.width * 2 - 1;
  const ny = 1 - (event.clientY - rect.top) / rect.height * 2;
  const pt = groundAt(nx, ny);
  if (pt) pointerGeo.value = pt;
}

function handlePointerLeave() {
  pointerGeo.value = undefined;
}

function fallbackProjection() {
  const target = cameraTarget.value;
  const radiusPx = Math.min(Math.max(80, props.width), Math.max(80, props.height)) * 0.44 * (WORLD_ORBIT_SPAN_DEG / Math.max(4, target.spanDeg));
  return geoOrthographic()
    .clipAngle(90)
    .translate([props.width / 2, props.height / 2])
    .scale(radiusPx)
    .rotate([-target.lon, -target.lat, -props.bearing]);
}

const fallbackDiscRadius = computed(() => fallbackProjection().scale());
const fallbackGraticulePath = computed(() => geoPath(fallbackProjection())(geoGraticule10()) ?? '');
const fallbackPaths = computed(() => {
  const target = cameraTarget.value;
  const path = geoPath(fallbackProjection());
  const nearby = target.spanDeg < 70
    ? divisionRecords.value
        .filter(({ bounds }) => greatCircleDistanceKm(bounds.lon, bounds.lat, target.lon, target.lat) < 4200)
        .slice(0, 220)
        .map(record => record.feature)
    : [];
  return [...countryList.value, ...nearby].map(feature => ({
    id: feature.properties.id,
    name: feature.properties.name,
    division: Boolean(feature.properties.countryId),
    path: path(feature) ?? '',
    home: feature.properties.id === TOKYO_COUNTRY_ID || feature.properties.id === homeRegion.value?.properties.id,
  }));
});
const fallbackMaritimePaths = computed(() => {
  const path = geoPath(fallbackProjection());
  return props.chinaMaritimeLines?.features.map(feature => path(feature) ?? '') ?? [];
});
const fallbackHome = computed(() => {
  const point = fallbackProjection()([HOME.lon, HOME.lat]);
  return point
    ? {
        x: point[0],
        y: point[1],
        visible: point[0] > 12 && point[0] < props.width - 12 && point[1] > 12 && point[1] < props.height - 25,
      }
    : undefined;
});

function fallback() {
  mode.value = 'fallback';
  updateCamera();
}

function contextLost(event: Event) {
  event.preventDefault();
  fallback();
}

watch(
  () => [props.depth, props.zoom, props.width, props.height, props.countryId, props.regionId, props.selectedId, props.bearing, props.active],
  () => {
    if (props.active) {
      updateCamera();
      requestRender();
    }
  },
);

onMounted(() => {
  owner = root.value?.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  if (canvas.value) canvas.value.addEventListener('webglcontextlost', contextLost);
  initialize();
});

onBeforeUnmount(() => {
  dead = true;
  if (frame && owner) owner.cancelAnimationFrame(frame);
  canvas.value?.removeEventListener('webglcontextlost', contextLost);
  countryPickables.length = 0;
  divisionPickables = [];
  divisionCache.clear();
  countryMaterials.clear();
  landmarkObjects.clear();
  for (const geometry of ownedGeometries) geometry.dispose();
  for (const material of ownedMaterials) material.dispose();
  ownedGeometries.clear();
  ownedMaterials.clear();
  renderer?.dispose(); renderer?.forceContextLoss();
  renderer = undefined;
  scene = undefined;
  camera = undefined;
  globeGroup = undefined;
  countryGroup = undefined;
  divisionGroup = undefined;
  landmarkGroup = undefined;
  highlightGroup = undefined;
  homeGroup = undefined;
});

defineExpose({
  pickAt,
  panBy,
  setZoomAnchor,
  focusFeature,
  focusLandmark,
  resetView,
  isHomeRegion,
  getCameraSpan,
  getZoomView,
  adjustTilt,
  setTilt,
  getTilt,
  toggleTilt,
  getTelemetry,
});
</script>

<template>
  <div
    ref="root"
    class="atlas-scene"
    :data-atlas-renderer="mode"
    :data-atlas-country="countryId"
    :data-atlas-region="regionId"
    :data-atlas-bearing="normalizedBearing"
    :data-atlas-camera-scale="cameraScale.toFixed(3)"
    :data-atlas-center="`${centerLon.toFixed(2)},${centerLat.toFixed(2)}`"
    :data-atlas-tilt="tiltDeg.toFixed(1)"
    :data-atlas-altitude="Math.round(altitudeKm)"
    :data-atlas-division-count="visibleDivisionCount"
    :data-atlas-maritime-parts="maritimePartCount"
    :data-atlas-maritime-visible="maritimeVisibleParts"
  >
    <canvas
      v-if="mode === 'webgl'"
      ref="canvas"
      class="atlas-canvas"
      :width="Math.max(1, Math.round(width))"
      :height="Math.max(1, Math.round(height))"
      @pointermove="handlePointerHover"
      @pointerleave="handlePointerLeave"
    />
    <svg
      v-else
      class="atlas-fallback"
      :viewBox="`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`"
      preserveAspectRatio="xMidYMid slice"
      aria-label="立体地球仪地图"
    >
      <circle
        class="atlas-svg-atmo"
        :cx="width / 2"
        :cy="height / 2"
        :r="fallbackDiscRadius * 1.045"
      />
      <circle
        class="atlas-svg-ocean"
        :cx="width / 2"
        :cy="height / 2"
        :r="fallbackDiscRadius"
      />
      <path class="atlas-svg-graticule" :d="fallbackGraticulePath" />
      <g>
        <path
          v-for="item in fallbackPaths"
          :key="item.id"
          :d="item.path"
          :class="{ division: item.division, antarctica: item.id === 'ATA', active: item.id === selectedId || item.id === countryId || item.id === regionId, home: item.home }"
          :data-map-target="(item.division ? 'division:' : 'country:') + item.id"
          @click="emit('select', (item.division ? 'division:' : 'country:') + item.id)"
        />
      </g>
      <g class="atlas-maritime">
        <path v-for="(line, index) in fallbackMaritimePaths" :key="'maritime-' + index" :d="line" class="home" />
      </g>
      <circle v-if="fallbackHome?.visible" :cx="fallbackHome.x" :cy="fallbackHome.y" r="4.5" class="home-dot" />
    </svg>

    <button
      v-if="mode === 'webgl' && projectedHome.visible"
      type="button"
      class="atlas-home-pin"
      data-atlas-home-marker
      :data-map-target="'division:' + (homeRegion?.properties.id ?? 'JPN-1860')"
      :style="{ left: projectedHome.x + 'px', top: projectedHome.y + 'px' }"
      @click="emit('select', 'division:' + (homeRegion?.properties.id ?? 'JPN-1860'))"
    >
      <i></i><span>东京</span>
    </button>

    <template v-for="item in visibleLabels" :key="item.id">
      <span
        v-if="item.kind === 'ocean'"
        class="atlas-ocean-label"
        :style="{ left: item.x + 'px', top: item.y + 'px' }"
      >{{ item.name }}</span>
      <button
        v-else
        type="button"
        :class="[
          item.kind === 'landmark' ? 'atlas-landmark-label' : item.kind === 'country' ? 'atlas-country-label' : 'atlas-division-label',
          { 'is-selected': item.active },
        ]"
        :data-map-target="item.target"
        :style="{ left: item.x + 'px', top: item.y + 'px' }"
        @click="emit('select', item.target)"
      >{{ item.name }}</button>
    </template>

    <div class="atlas-telemetry" data-map-controls>
      <span class="atlas-coords" data-atlas-coords>{{ displayCoordText }}</span>
      <span class="atlas-alt">视角海拔 {{ altitudeLabel }}</span>
      <button
        type="button"
        class="atlas-hud-btn"
        data-atlas-tilt-toggle
        :aria-pressed="tiltDeg >= 20"
        @click.stop="toggleTilt"
      >{{ tiltDeg >= 20 ? `3D 倾斜 ${Math.round(tiltDeg)}°` : '垂直俯视' }}</button>
    </div>

    <div class="atlas-scale"><span>{{ scaleBar.label }}</span><i :style="{ width: scaleBar.width + 'px' }"></i></div>
    <p class="atlas-relief-note">立体地球仪示意 · 地形与地标按艺术比例缩放</p>
  </div>
</template>
