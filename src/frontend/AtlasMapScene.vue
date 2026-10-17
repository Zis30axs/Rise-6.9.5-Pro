<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { geoEquirectangular, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import { ATLAS_LANDMARKS } from './atlas-landmarks';
import { borderGeometry, createLandmark, featureBounds, landGeometry, LAT_STRETCH, polygons, terrainHeight, type AtlasBounds, type AtlasFeature, type AtlasProperties } from './atlas-geometry';

const props = withDefaults(defineProps<{
  countries: FeatureCollection<Geometry, AtlasProperties>;
  subdivisions: FeatureCollection<Geometry, AtlasProperties>;
  chinaMaritimeLines?: FeatureCollection<Geometry, AtlasProperties>;
  depth: number; countryId?: string; regionId?: string; selectedId?: string;
  width: number; height: number; bearing?: number; active?: boolean; zoom?: number;
}>(), { countryId: 'CHN', regionId: '330000', selectedId: '', bearing: 0, active: true, zoom: 1 });
const emit = defineEmits<{ 'view-change': [view: { countryId: string; regionId: string }]; select: [target: string] }>();
const root = ref<HTMLElement>(); const canvas = ref<HTMLCanvasElement>();
const mode = ref<'webgl' | 'fallback'>('fallback');
const cameraScale = ref(360);
const center = ref<{ x: number; z: number }>();
const scaleBar = ref({ label: '100 km', width: 70 });
const visibleDivisionCount = ref(0);
const maritimeVisibleParts = ref(0);
const projectedLandmarks = ref<{ id: string; name: string; x: number; y: number }[]>([]);
const projectedHome = ref({ x: 0, y: 0, visible: false });
const focusedCountry = computed(() => props.countries.features.find(feature => feature.properties.id === props.countryId));
const focusedRegion = computed(() => props.subdivisions.features.find(feature => feature.properties.id === props.regionId && feature.properties.countryId === props.countryId));
const divisions = computed(() => props.subdivisions.features.filter(feature => feature.properties.countryId === props.countryId));
const homeRegion = computed(() => props.subdivisions.features.find(feature => feature.properties.id === '330000'));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const selected = computed(() => props.selectedId.replace(/^(country|division):/, ''));

let owner: Window & typeof globalThis;
let renderer: THREE.WebGLRenderer | undefined; let scene: THREE.Scene | undefined; let camera: THREE.OrthographicCamera | undefined;
let countryGroup: THREE.Group | undefined; let divisionGroup: THREE.Group | undefined; let landmarkGroup: THREE.Group | undefined;
let highlightGroup: THREE.Group | undefined; let homeGroup: THREE.Group | undefined;
let loadedCountry = ''; let lastSelection = ''; let frame = 0; let dead = false; let failed = false;
let previousView = ''; let pendingAnchor: { x: number; z: number; nx: number; ny: number } | undefined;
const divisionCache = new Map<string, { group: THREE.Group; mesh: THREE.Mesh }>();
let divisionPickables: THREE.Object3D[] = []; const countryPickables: THREE.Object3D[] = [];
const landmarkObjects = new Map<string, THREE.Group>();
const countryMaterials = new Map<string, THREE.MeshStandardMaterial>();
const ownedGeometries = new Set<THREE.BufferGeometry>(); const ownedMaterials = new Set<THREE.Material>();
const raycaster = new THREE.Raycaster(); const projectedPoint = new THREE.Vector3();
const HOME = { lon: 120.2, lat: 29.2 }; // Province-level illustration only; no fictional campus coordinate is asserted.
const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const divisionRecords = computed(() => props.subdivisions.features.map(feature => ({ feature, bounds: featureBounds(feature) })));

function fitSpan(bounds: AtlasBounds) {
  const aspect = Math.max(.3, props.width / Math.max(1, props.height));
  // Radial fit keeps the entire focus usable through a full two-finger turn.
  return Math.max(bounds.width / aspect, bounds.height * .83, Math.hypot(bounds.width, bounds.height) * Math.min(.68, .68 / aspect)) * 1.3;
}
function fitFeatureBounds(feature?: AtlasFeature) {
  const initial = featureBounds(feature);
  if (feature?.properties.id !== 'CHN') return initial;
  const bounds = [initial, ...(props.chinaMaritimeLines?.features.map(line => featureBounds(line, true)) ?? [])];
  const minX = Math.min(...bounds.map(bound => bound.x - bound.width / 2)); const maxX = Math.max(...bounds.map(bound => bound.x + bound.width / 2));
  const minZ = Math.min(...bounds.map(bound => bound.z - bound.height / 2)); const maxZ = Math.max(...bounds.map(bound => bound.z + bound.height / 2));
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, width: maxX - minX, height: maxZ - minZ };
}
const homeStops = computed(() => {
  const world = featureBounds(); const country = fitFeatureBounds(props.countries.features.find(feature => feature.properties.id === 'CHN')); const region = featureBounds(homeRegion.value);
  return { world: { ...world, span: fitSpan(world) }, country: { ...country, span: fitSpan(country) }, region: { ...region, span: fitSpan(region) } };
});
function homeTarget(depth: number) {
  const { world, country, region } = homeStops.value;
  const phase = clamp(depth, 3, 5); const mix = smooth(phase < 4 ? phase - 3 : phase - 4);
  const from = phase < 4 ? region : country; const to = phase < 4 ? country : world;
  return {
    x: THREE.MathUtils.lerp(from.x, to.x, mix), z: THREE.MathUtils.lerp(from.z, to.z, mix),
    span: Math.exp(THREE.MathUtils.lerp(Math.log(from.span), Math.log(to.span), mix)),
  };
}
const cameraTarget = computed(() => {
  const target = homeTarget(props.depth);
  return { x: center.value?.x ?? target.x, z: center.value?.z ?? target.z, span: target.span / Math.max(.02, props.zoom) };
});
function fallbackProjection() {
  const target = cameraTarget.value;
  return geoEquirectangular().center([target.x, -target.z / LAT_STRETCH]).translate([props.width / 2, props.height / 2])
    .scale(Math.max(1, props.height) / target.span * 180 / Math.PI).angle(-props.bearing);
}
const fallbackPaths = computed(() => {
  const target = cameraTarget.value;
  const path = geoPath(fallbackProjection());
  const nearby = target.span < 145 ? divisionRecords.value.filter(({ bounds }) => Math.abs(bounds.x - target.x) < target.span && Math.abs(bounds.z - target.z) < target.span).slice(0, 260).map(record => record.feature) : [];
  return [...props.countries.features, ...nearby].map(feature => ({
    id: feature.properties.id, name: feature.properties.name, division: Boolean(feature.properties.countryId),
    path: path(feature) ?? '', home: feature.properties.id === 'CHN' || feature.properties.id === '330000',
  }));
});
const fallbackMaritimePaths = computed(() => {
  const path = geoPath(fallbackProjection());
  return props.chinaMaritimeLines?.features.map(feature => path(feature) ?? '') ?? [];
});
const fallbackHome = computed(() => {
  const point = fallbackProjection()([HOME.lon, HOME.lat]);
  return point ? { x: point[0], y: point[1], visible: point[0] > 12 && point[0] < props.width - 12 && point[1] > 12 && point[1] < props.height - 25 } : undefined;
});

function ownGeometry<T extends THREE.BufferGeometry>(geometry: T) { ownedGeometries.add(geometry); return geometry; }
function ownMaterial<T extends THREE.Material>(material: T) { ownedMaterials.add(material); return material; }
function lineFor(feature: Parameters<typeof borderGeometry>[0], color: string, offset = .07, opacity = 1) {
  return new THREE.LineSegments(ownGeometry(borderGeometry(feature, offset)), ownMaterial(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })));
}
function releaseGroup(group: THREE.Group) {
  group.traverse(object => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry) { renderable.geometry.dispose(); ownedGeometries.delete(renderable.geometry); }
    if (renderable.material) for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) { material.dispose(); ownedMaterials.delete(material); }
  });
  group.clear();
}
function makeDivisionMeshes() {
  if (!divisionGroup || !renderer || !camera) return;
  const target = cameraTarget.value; const unitsPerPixel = target.span / Math.max(1, props.height);
  const radius = target.span * Math.max(1.2, props.width / props.height);
  const candidates = target.span > 145 ? [] : divisionRecords.value.filter(({ bounds }) =>
    Math.abs(bounds.x - target.x) < radius + bounds.width / 2 && Math.abs(bounds.z - target.z) < radius + bounds.height / 2 &&
    Math.max(bounds.width, bounds.height) / unitsPerPixel > 11,
  ).filter(({ bounds }) => {
    projectedPoint.set(bounds.x, .3, bounds.z).project(camera!);
    return Math.abs(projectedPoint.x) < 1.25 + bounds.width / target.span && Math.abs(projectedPoint.y) < 1.25 + bounds.height / target.span;
  }).sort((a, b) => Math.hypot(a.bounds.x - target.x, a.bounds.z - target.z) - Math.hypot(b.bounds.x - target.x, b.bounds.z - target.z)).slice(0, 260);
  const visible = new Set(candidates.map(record => record.feature.properties.id));
  for (const [id, cached] of divisionCache) cached.group.visible = visible.has(id);
  divisionPickables = [];
  for (const { feature } of candidates) {
    let cached = divisionCache.get(feature.properties.id);
    if (!cached) {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(ownGeometry(landGeometry(feature, .035, false)), ownMaterial(new THREE.MeshBasicMaterial({ color: '#c2cfb1', transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })));
      mesh.userData.target = `division:${feature.properties.id}`; mesh.userData.countryId = feature.properties.countryId;
      mesh.renderOrder = feature.properties.countryId === 'CHN' ? 10 : 1; group.add(mesh);
      const outline = lineFor(feature, '#55746e', .065, .76); outline.renderOrder = feature.properties.countryId === 'CHN' ? 11 : 2; group.add(outline);
      divisionGroup.add(group); cached = { group, mesh }; divisionCache.set(feature.properties.id, cached);
    }
    divisionPickables.push(cached.mesh);
  }
  // Retain a small nearby cache; long pans never accumulate every ADM1 mesh in memory.
  if (divisionCache.size > 360) for (const [id, cached] of divisionCache) {
    if (!visible.has(id)) { releaseGroup(cached.group); divisionGroup.remove(cached.group); divisionCache.delete(id); }
  }
  visibleDivisionCount.value = candidates.length;
}
function updateHighlights() {
  if (!highlightGroup || lastSelection === `${selected.value}|${loadedCountry}`) return;
  lastSelection = `${selected.value}|${loadedCountry}`; releaseGroup(highlightGroup);
  for (const [id, material] of countryMaterials) material.color.set(id === selected.value || (props.depth < 4.7 && id === props.countryId) ? '#e1cda3' : '#ffffff');
  const feature = [...props.countries.features, ...divisions.value].find(item => item.properties.id === selected.value);
  if (feature && feature.properties.id !== 'CHN' && feature.properties.id !== '330000') highlightGroup.add(lineFor(feature, '#e9c675', .12));
}
function initialize() {
  if (!canvas.value || dead || renderer) return;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(owner.devicePixelRatio || 1, 1.5)); renderer.setClearColor('#18363b', 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
    scene = new THREE.Scene(); camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 2500);
    scene.add(new THREE.HemisphereLight('#fff3d6', '#506d78', 2.15));
    const light = new THREE.DirectionalLight('#fff0cb', 2.2); light.position.set(-120, 180, 110); scene.add(light);
    countryGroup = new THREE.Group(); divisionGroup = new THREE.Group(); landmarkGroup = new THREE.Group(); highlightGroup = new THREE.Group(); homeGroup = new THREE.Group();
    scene.add(countryGroup, divisionGroup, landmarkGroup, highlightGroup, homeGroup);
    const ocean = new THREE.Mesh(ownGeometry(new THREE.PlaneGeometry(720, 440)), ownMaterial(new THREE.MeshStandardMaterial({ color: '#234a50', roughness: 1 })));
    ocean.rotation.x = -Math.PI / 2; ocean.position.y = -.13; scene.add(ocean);
    const grid: number[] = [];
    for (let lon = -180; lon <= 180; lon += 30) grid.push(lon, -.1, -92, lon, -.1, 75);
    for (let lat = -60; lat <= 80; lat += 20) grid.push(-180, -.1, -lat * LAT_STRETCH, 180, -.1, -lat * LAT_STRETCH);
    const gridGeometry = ownGeometry(new THREE.BufferGeometry()); gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    scene.add(new THREE.LineSegments(gridGeometry, ownMaterial(new THREE.LineBasicMaterial({ color: '#64867f', transparent: true, opacity: .13 }))));
    for (const feature of props.countries.features) {
      const isChina = feature.properties.id === 'CHN';
      const material = ownMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide, polygonOffset: isChina, polygonOffsetFactor: isChina ? -4 : 0, polygonOffsetUnits: isChina ? -4 : 0 }));
      countryMaterials.set(feature.properties.id, material);
      const mesh = new THREE.Mesh(ownGeometry(landGeometry(feature)), material);
      mesh.userData.target = `country:${feature.properties.id}`; mesh.renderOrder = isChina ? 5 : 0; countryGroup.add(mesh); countryPickables.push(mesh);
      countryGroup.add(lineFor(feature, '#637c70', .055, .85));
    }
    const china = props.countries.features.find(feature => feature.properties.id === 'CHN');
    if (china) { const outline = lineFor(china, '#f33d53', .13); outline.material.toneMapped = false; outline.renderOrder = 100; homeGroup.add(outline); }
    if (homeRegion.value) { const outline = lineFor(homeRegion.value, '#ff4059', .14); outline.material.toneMapped = false; outline.renderOrder = 101; homeGroup.add(outline); }
    for (const feature of props.chinaMaritimeLines?.features ?? []) {
      // DataV's narrow polygon strips are auxiliary cartography, never countries or destinations.
      const strips = new THREE.Mesh(ownGeometry(landGeometry(feature, .14, false)), ownMaterial(new THREE.MeshBasicMaterial({ color: '#f33d53', side: THREE.DoubleSide, transparent: true, opacity: 1, depthTest: false, depthWrite: false, toneMapped: false })));
      strips.renderOrder = 100; homeGroup.add(strips); const outline = lineFor(feature, '#f33d53', .16); outline.material.toneMapped = false; outline.renderOrder = 101; homeGroup.add(outline);
    }
    for (const landmark of ATLAS_LANDMARKS) {
      if (!props.countries.features.some(feature => feature.properties.id === landmark.countryId)) continue;
      const model = createLandmark(landmark.kind); model.userData.target = `landmark:${landmark.id}`;
      model.traverse(object => {
        const mesh = object as THREE.Mesh; if (mesh.geometry) ownedGeometries.add(mesh.geometry);
        if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) ownedMaterials.add(material);
        object.userData.target = `landmark:${landmark.id}`;
      });
      for (const material of model.userData.materials as THREE.Material[]) ownedMaterials.add(material);
      model.position.set(landmark.lon, terrainHeight(landmark.lon, landmark.lat) + .12, -landmark.lat * LAT_STRETCH);
      landmarkObjects.set(landmark.id, model); landmarkGroup.add(model);
    }
    mode.value = 'webgl'; updateCamera(); requestRender();
  } catch { fallback(); }
}
function updateCamera() {
  const width = Math.max(1, Math.round(props.width)); const height = Math.max(1, Math.round(props.height));
  const target = cameraTarget.value; const aspect = width / height; const bearing = props.bearing * Math.PI / 180;
  cameraScale.value = target.span;
  if (!camera || !renderer) {
    if (pendingAnchor) {
      const after = groundAt(pendingAnchor.nx, pendingAnchor.ny);
      if (after) center.value = { x: clamp(target.x + pendingAnchor.x - after.x, -180, 180), z: clamp(target.z + pendingAnchor.z - after.z, -90, 72) };
      pendingAnchor = undefined;
    }
    updateScale(); reportView(); return;
  }
  camera.left = -target.span * aspect / 2; camera.right = -camera.left; camera.top = target.span / 2; camera.bottom = -camera.top;
  camera.position.set(target.x + Math.sin(bearing) * 330, 520, target.z + Math.cos(bearing) * 330);
  camera.lookAt(target.x, 0, target.z); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  if (pendingAnchor) {
    const after = groundAt(pendingAnchor.nx, pendingAnchor.ny);
    if (after) {
      center.value = { x: clamp(target.x + pendingAnchor.x - after.x, -180, 180), z: clamp(target.z + pendingAnchor.z - after.z, -90, 72) };
      camera.position.x += center.value.x - target.x; camera.position.z += center.value.z - target.z;
      camera.lookAt(center.value.x, 0, center.value.z); camera.updateMatrixWorld();
    }
    pendingAnchor = undefined;
  }
  const size = new THREE.Vector2(); renderer.getSize(size); if (size.x !== width || size.y !== height) renderer.setSize(width, height, false);
  makeDivisionMeshes();
  // Each silhouette has a restrained screen size; it never expands to fill a province.
  for (const landmark of ATLAS_LANDMARKS) {
    const model = landmarkObjects.get(landmark.id); if (!model) continue;
    model.visible = target.span > 160 ? landmark.worldPriority <= (props.width > 550 ? 2 : 1) : true;
    model.scale.setScalar(clamp(target.span * .065, .1, 32));
  }
  updateHighlights();
  updateScale();
}
function groundAt(nx: number, ny: number) {
  if (!camera) {
    const point = fallbackProjection().invert?.([(nx + 1) * props.width / 2, (1 - ny) * props.height / 2]);
    if (!point || !point.every(Number.isFinite)) return;
    // Use the longitude copy nearest the current center when the view crosses
    // the date line; SVG coordinates and gestures share one inverse projection.
    const longitude = cameraTarget.value.x + ((point[0] - cameraTarget.value.x + 540) % 360 - 180);
    return new THREE.Vector3(longitude, 0, -point[1] * LAT_STRETCH);
  }
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point) ?? undefined;
}
function contains(feature: AtlasFeature, lon: number, lat: number) {
  const insideRing = (ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]; const b = ring[j];
      if ((a[1] > lat) !== (b[1] > lat) && lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  return polygons(feature).some(polygon => insideRing(polygon[0]) && !polygon.slice(1).some(insideRing));
}
function reportView() {
  const target = cameraTarget.value; const lon = target.x; const lat = -target.z / LAT_STRETCH;
  const candidates = divisionRecords.value.filter(({ bounds, feature }) => Math.abs(bounds.x - lon) <= bounds.width / 2 + .1 && Math.abs(bounds.z - target.z) <= bounds.height / 2 + .1 && contains(feature, lon, lat));
  const division = candidates.find(record => record.feature.properties.countryId === 'CHN') ?? candidates[0];
  const china = props.countries.features.find(feature => feature.properties.id === 'CHN');
  const inChina = china && contains(china, lon, lat);
  const countryId = inChina ? 'CHN' : division?.feature.properties.countryId ?? props.countries.features.find(feature => contains(feature, lon, lat))?.properties.id ?? '';
  const regionId = division?.feature.properties.countryId === countryId ? division.feature.properties.id : '';
  const key = `${countryId}|${regionId}`;
  if (countryId && key !== previousView) { previousView = key; emit('view-change', { countryId, regionId }); }
}
function updateScale() {
  const a = groundAt(-70 / Math.max(1, props.width), 0); const b = groundAt(70 / Math.max(1, props.width), 0);
  if (!a || !b) {
    const target = cameraTarget.value; const radians = Math.PI / 180; const bearing = props.bearing * radians;
    const longitudeScale = Math.cos(-target.z / LAT_STRETCH * radians);
    setScaleDistance(70 * target.span / Math.max(1, props.height) * 111.195 * Math.hypot(Math.cos(bearing) * longitudeScale, Math.sin(bearing)));
    return;
  }
  const radians = Math.PI / 180; const latA = -a.z / LAT_STRETCH * radians; const latB = -b.z / LAT_STRETCH * radians;
  const haversine = Math.sin((latB - latA) / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin((b.x - a.x) * radians / 2) ** 2;
  const distance = 6371 * 2 * Math.atan2(Math.sqrt(clamp(haversine, 0, 1)), Math.sqrt(1 - clamp(haversine, 0, 1)));
  setScaleDistance(distance);
}
function setScaleDistance(distance: number) {
  if (!(distance > 0)) return;
  const base = 10 ** Math.floor(Math.log10(distance)); const ratio = distance / base;
  const nice = base * (ratio >= 5 ? 5 : ratio >= 2 ? 2 : 1);
  scaleBar.value = { label: nice < 1 ? `约 ${Math.round(nice * 1000)} m` : `约 ${Number(nice.toPrecision(3))} km`, width: Math.max(25, Math.min(100, 70 * nice / distance)) };
}
function panBy(dx: number, dy: number) {
  const start = groundAt(0, 0); const finish = groundAt(dx * 2 / Math.max(1, props.width), -dy * 2 / Math.max(1, props.height));
  const target = cameraTarget.value;
  if (start && finish) center.value = { x: clamp(target.x + start.x - finish.x, -180, 180), z: clamp(target.z + start.z - finish.z, -90, 72) };
  updateCamera(); requestRender();
}
function setZoomAnchor(clientX: number, clientY: number, targetX = clientX, targetY = clientY) {
  const surface = camera ? canvas.value : root.value;
  if (!surface) return;
  const rect = surface.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return;
  const nx = (clientX - rect.left) / rect.width * 2 - 1; const ny = 1 - (clientY - rect.top) / rect.height * 2;
  const point = groundAt(nx, ny); if (!point) return;
  const target = cameraTarget.value; center.value = { x: target.x, z: target.z };
  pendingAnchor = { x: point.x, z: point.z, nx: (targetX - rect.left) / rect.width * 2 - 1, ny: 1 - (targetY - rect.top) / rect.height * 2 };
  requestRender();
}
function focusFeature(id: string) {
  const raw = id.replace(/^(country|division):/, '');
  const isDivision = id.startsWith('division:');
  const feature = (isDivision ? props.subdivisions.features : props.countries.features).find(item => item.properties.id === raw);
  if (!feature) return;
  const bounds = fitFeatureBounds(feature); center.value = { x: bounds.x, z: bounds.z }; pendingAnchor = undefined;
  const depth = isDivision ? 3 : 4; const zoom = clamp(homeTarget(depth).span / fitSpan(bounds), .02, 200);
  updateCamera(); requestRender(); return { depth, zoom };
}
function resetView() { center.value = undefined; pendingAnchor = undefined; previousView = ''; updateCamera(); requestRender(); }
function isHomeRegion() {
  const target = cameraTarget.value;
  return Boolean(homeRegion.value && contains(homeRegion.value, target.x, -target.z / LAT_STRETCH));
}
function getCameraSpan() { return cameraTarget.value.span; }
function getZoomView(factor: number, initialSpan?: number) {
  const base = Number.isFinite(initialSpan) && initialSpan! > 0 ? initialSpan! : cameraTarget.value.span;
  const desired = base / (Number.isFinite(factor) && factor > 0 ? factor : 1);
  const provinceSpan = homeTarget(3).span; const worldSpan = homeTarget(5).span;
  if (desired >= worldSpan) return { depth: 5, zoom: 1 };
  if (desired < provinceSpan) {
    if (isHomeRegion()) return { depth: Math.max(-2, 3 - Math.log2(provinceSpan / desired)), zoom: 1 };
    return { depth: 3, zoom: Math.min(200, provinceSpan / desired) };
  }
  // depth drives a smooth geographic camera path, not a log2 pixel scale.
  // Invert that exact path so one + / wheel step is the requested physical ratio.
  let low = 3; let high = 5;
  for (let iteration = 0; iteration < 32; iteration++) {
    const middle = (low + high) / 2;
    if (homeTarget(middle).span < desired) low = middle; else high = middle;
  }
  return { depth: (low + high) / 2, zoom: 1 };
}
function render() {
  frame = 0;
  if (dead || !props.active || root.value?.ownerDocument.hidden) return;
  if (!renderer || !scene || !camera) {
    // Pure two-finger translation may only move the pending screen anchor;
    // consume it on RAF even when no reactive camera prop changed.
    if (pendingAnchor) updateCamera();
    return;
  }
  try {
    // Pointer-only midpoint movement may not change props. Consume its anchor
    // here, after Vue has applied any simultaneous scale and bearing changes.
    if (pendingAnchor) updateCamera();
    renderer.render(scene, camera);
    projectedPoint.set(HOME.lon, terrainHeight(HOME.lon, HOME.lat) + .2, -HOME.lat * LAT_STRETCH).project(camera);
    const x = (projectedPoint.x + 1) / 2 * props.width; const y = (1 - projectedPoint.y) / 2 * props.height;
    projectedHome.value = { x, y, visible: Math.abs(projectedPoint.x) < .96 && Math.abs(projectedPoint.y) < .9 };
    maritimeVisibleParts.value = (props.chinaMaritimeLines?.features ?? []).flatMap(polygons).filter(polygon => {
      const point = polygon[0][0]; projectedPoint.set(point[0], .36, -point[1] * LAT_STRETCH).project(camera!);
      return Math.abs(projectedPoint.x) < 1 && Math.abs(projectedPoint.y) < 1;
    }).length;
    const occupied: { x: number; y: number }[] = projectedHome.value.visible ? [{ x, y }] : [];
    projectedLandmarks.value = ATLAS_LANDMARKS.flatMap(landmark => {
      const model = landmarkObjects.get(landmark.id); if (!model?.visible) return [];
      projectedPoint.copy(model.position).project(camera!);
      const x = (projectedPoint.x + 1) / 2 * props.width; const y = (1 - projectedPoint.y) / 2 * props.height + 11;
      if (projectedPoint.z < -1 || projectedPoint.z > 1 || x < 34 || x > props.width - 34 || y < 44 || y > props.height - 28) return [];
      if (occupied.some(previous => Math.abs(previous.x - x) < 80 && Math.abs(previous.y - y) < 47)) return [];
      occupied.push({ x, y }); return [{ id: landmark.id, name: landmark.name, x, y }];
    });
    reportView();
  } catch { fallback(); }
}
function requestRender() {
  if (!dead && owner && !frame && props.active) frame = owner.requestAnimationFrame(render);
}
function pickAt(clientX: number, clientY: number) {
  if (!renderer || !camera || !canvas.value || !props.active || mode.value !== 'webgl') return;
  const rect = canvas.value.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1 || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return;
  raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), camera);
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
defineExpose({ pickAt, panBy, setZoomAnchor, focusFeature, resetView, isHomeRegion, getCameraSpan, getZoomView });
function releaseGraphics(permanent = false) {
  if (frame) owner.cancelAnimationFrame(frame); frame = 0;
  for (const geometry of ownedGeometries) geometry.dispose(); ownedGeometries.clear();
  for (const material of ownedMaterials) material.dispose(); ownedMaterials.clear();
  const oldRenderer = renderer; renderer = undefined; oldRenderer?.dispose();
  // Permanently removed windows must free their browser WebGL context, not only buffers.
  // The contextlost handler is already detached by onBeforeUnmount; fallback never forces loss.
  if (permanent) oldRenderer?.forceContextLoss();
  scene?.clear(); scene = undefined; camera = undefined;
  countryPickables.length = 0; divisionPickables = []; landmarkObjects.clear(); countryMaterials.clear(); divisionCache.clear();
  countryGroup = divisionGroup = landmarkGroup = highlightGroup = homeGroup = undefined; loadedCountry = ''; lastSelection = '';
}
function fallback() { failed = true; releaseGraphics(); mode.value = 'fallback'; projectedLandmarks.value = []; projectedHome.value.visible = false; }
function contextLost(event: Event) { event.preventDefault(); fallback(); }
function onVisibility() { if (!root.value?.ownerDocument.hidden) requestRender(); }
watch(() => [props.depth, props.countryId, props.regionId, props.selectedId, props.width, props.height, props.bearing, props.active, props.zoom], () => {
  if (!props.active) { if (frame && owner) owner.cancelAnimationFrame(frame); frame = 0; return; }
  if (!renderer && !failed && owner) initialize();
  updateCamera(); requestRender();
});
onMounted(() => {
  if (!root.value || !canvas.value) return;
  owner = root.value.ownerDocument.defaultView as Window & typeof globalThis;
  canvas.value.addEventListener('webglcontextlost', contextLost);
  root.value.ownerDocument.addEventListener('visibilitychange', onVisibility); if (props.active) initialize();
});
onBeforeUnmount(() => {
  dead = true; canvas.value?.removeEventListener('webglcontextlost', contextLost);
  root.value?.ownerDocument.removeEventListener('visibilitychange', onVisibility); releaseGraphics(true);
});
</script>

<template>
  <section ref="root" class="atlas-scene" :data-atlas-renderer="mode" :data-atlas-country="countryId" :data-atlas-region="regionId" :data-atlas-bearing="bearing.toFixed(2)" :data-atlas-camera-scale="cameraScale.toFixed(3)" :data-atlas-center="`${cameraTarget.x.toFixed(3)},${(-cameraTarget.z / LAT_STRETCH).toFixed(3)}`" :data-atlas-division-count="visibleDivisionCount" :data-atlas-maritime-parts="chinaMaritimeLines?.features.flatMap(polygons).length ?? 0" :data-atlas-maritime-visible="maritimeVisibleParts" aria-label="可旋转的世界浅浮雕地图">
    <canvas ref="canvas" v-show="mode === 'webgl'" class="atlas-canvas" aria-label="国家、省份与立体地标，点选或使用下方地区列表" />
    <svg v-if="mode === 'fallback' && active" class="atlas-fallback" :viewBox="`0 0 ${width} ${height}`" aria-label="世界地图平面备用显示">
      <path v-for="feature in fallbackPaths" :key="`${feature.division}:${feature.id}`" :d="feature.path" :class="{ home: feature.home, selected: feature.id === selected, division: feature.division }" :data-map-target="`${feature.division ? 'division' : 'country'}:${feature.id}`" tabindex="0" role="button" :aria-label="`查看${feature.name}`" @keydown.enter="emit('select', `${feature.division ? 'division' : 'country'}:${feature.id}`)"><title>{{ feature.name }}</title></path>
      <path v-for="feature in fallbackPaths.filter(item => item.home)" :key="`home-outline:${feature.id}`" :d="feature.path" class="atlas-home-outline" aria-hidden="true" />
      <path v-for="(path, index) in fallbackMaritimePaths" :key="`maritime-${index}`" :d="path" class="atlas-maritime" aria-hidden="true" />
      <g v-if="fallbackHome?.visible" :transform="`translate(${fallbackHome.x},${fallbackHome.y})`" class="atlas-fallback-home" data-atlas-home-marker aria-label="主角所在浙江省域示意标记"><circle r="5" /><text y="18" text-anchor="middle">浙江</text></g>
    </svg>
    <div class="atlas-corner-note"><span class="atlas-red-dot" />所在区域：中国 · 浙江<small>省域示意 · 城市未命名</small></div>
    <span v-if="projectedHome.visible && mode === 'webgl'" class="atlas-home-pin" :style="{ left: `${projectedHome.x}px`, top: `${projectedHome.y}px` }" aria-label="主角所在浙江省域示意标记" data-atlas-home-marker><i />浙江</span>
    <button v-for="landmark in projectedLandmarks" :key="landmark.id" class="atlas-landmark-label" :data-map-target="`landmark:${landmark.id}`" :style="{ left: `${landmark.x}px`, top: `${landmark.y}px` }" :aria-label="`查看地标：${landmark.name}`" @click="emit('select', `landmark:${landmark.id}`)">{{ landmark.name }}</button>
    <div class="atlas-scale" aria-label="地图中心附近的近似比例尺"><span>{{ scaleBar.label }}</span><i :style="{ width: `${scaleBar.width}px` }" /></div>
    <span class="atlas-relief-note">{{ mode === 'fallback' ? '3D 暂不可用 · 可继续浏览平面地图' : '浅起伏为艺术化示意 · 地标非等比例' }}</span>
  </section>
</template>
