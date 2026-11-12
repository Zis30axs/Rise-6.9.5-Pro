<script lang="ts">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CALIFORNIA_SANDBOX_MODEL_SHA256 } from './california-sandbox-map';
import { readLocalAssetBytes } from './local-asset-buffer';
import californiaModelAsset from '../../assets/models/unread-city-california-sandbox.glb?inline';

import { disposeThreeTree } from './dispose-three-tree';
import {
  applyCaliforniaCameraFlight, frameCaliforniaMapCamera,
  readCaliforniaCameraPose, type CaliforniaCameraPose,
} from './california-sandbox-camera';
import {
  applyTokyoCanvasResolution, nativeTokyoCanvasResolution,
  type TokyoCanvasResolution,
} from './tokyo-sandbox-resolution';
import {
  createTokyoSandboxVfx,
  type ResolvedAtmospherePreset, type TokyoAtmosphereMode,
  type TokyoSandboxVfxController,
} from './tokyo-sandbox-vfx';

async function sandboxSha256(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function checkGlb(bytes: Uint8Array<ArrayBuffer>) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength ||
      view.getUint32(16, true) !== 0x4e4f534a) throw new Error('Invalid offline California GLB');
  const length = view.getUint32(12, true);
  if (length < 1 || length > bytes.byteLength - 20) throw new Error('Invalid California GLB payload');
  const definition = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    buffers?: { uri?: unknown }[]; images?: { uri?: unknown }[];
    extensionsRequired?: string[];
  };
  if ([...(definition.buffers ?? []), ...(definition.images ?? [])].some(item => item.uri !== undefined)) {
    throw new Error('External resource URI forbidden in offline California GLB');
  }
  if ((definition.extensionsRequired ?? []).some(ext => ext !== 'EXT_mesh_gpu_instancing')) {
    throw new Error('Offline California GLB requires an unsupported decoder');
  }
}

/** Deduplicate identical PBR materials in the GLB to cut WebGL shader compilation time. */
function optimizeGlbScene(root: THREE.Group) {
  const canonical = new Map<string, THREE.MeshStandardMaterial>();
  const redundant = new Set<THREE.Material>();
  root.traverse(obj => {
    if (!(obj instanceof THREE.Mesh) || !(obj.material instanceof THREE.MeshStandardMaterial)) return;
    const m = obj.material;
    if (m.map || m.normalMap || m.emissiveMap || m.roughnessMap || m.metalnessMap) return;
    const key = [
      m.color.getHexString(), m.emissive.getHexString(),
      m.roughness.toFixed(2), m.metalness.toFixed(2),
      m.opacity.toFixed(2), m.transparent ? 1 : 0,
    ].join('|');
    const shared = canonical.get(key);
    if (shared) {
      if (shared !== m) {
        redundant.add(m);
        obj.material = shared;
      }
    } else {
      canonical.set(key, m);
    }
  });
  redundant.forEach(mat => mat.dispose());
}

const GLB_IDB_NAME = 'unread-city-california-glb-cache-v1';
const GLB_IDB_STORE = 'glb';

async function readIdbCachedGlbBytes(): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(GLB_IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(GLB_IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise<Uint8Array<ArrayBuffer> | undefined>((resolve, reject) => {
        const tx = db.transaction(GLB_IDB_STORE, 'readonly');
        const getReq = tx.objectStore(GLB_IDB_STORE).get(CALIFORNIA_SANDBOX_MODEL_SHA256);
        getReq.onsuccess = () => {
          const val = getReq.result;
          resolve(val instanceof ArrayBuffer ? new Uint8Array(val) : undefined);
        };
        getReq.onerror = () => reject(getReq.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

function writeIdbCachedGlbBytes(bytes: Uint8Array<ArrayBuffer>) {
  if (typeof indexedDB === 'undefined') return;
  try {
    const req = indexedDB.open(GLB_IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(GLB_IDB_STORE);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction(GLB_IDB_STORE, 'readwrite');
        tx.objectStore(GLB_IDB_STORE).put(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          CALIFORNIA_SANDBOX_MODEL_SHA256,
        );
      } finally {
        db.close();
      }
    };
  } catch {
    // IndexedDB is a best-effort cache; the inline asset still loads.
  }
}

async function loadCaliforniaGlb(assetUrl: string): Promise<THREE.Group> {
  let bytes = assetUrl === californiaModelAsset && assetUrl.startsWith('data:')
    ? await readIdbCachedGlbBytes() : undefined;
  const cached = !!bytes;
  if (!bytes) bytes = await readLocalAssetBytes(assetUrl, 10_000_000, 'Invalid offline California model');
  if (await sandboxSha256(bytes) !== CALIFORNIA_SANDBOX_MODEL_SHA256) {
    // A damaged local byte cache must not make every later retry fail forever.
    if (!cached) throw new Error('California sandbox pack hash mismatch');
    bytes = await readLocalAssetBytes(assetUrl, 10_000_000, 'Invalid offline California model');
    if (await sandboxSha256(bytes) !== CALIFORNIA_SANDBOX_MODEL_SHA256) throw new Error('California sandbox pack hash mismatch');
  }
  checkGlb(bytes);
  if (assetUrl === californiaModelAsset && assetUrl.startsWith('data:')) writeIdbCachedGlbBytes(bytes);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (!url.startsWith('blob:')) throw new Error('External California model resource blocked');
    return url;
  });
  const parsed = (await new GLTFLoader(manager).parseAsync(bytes.buffer, '')).scene;
  optimizeGlbScene(parsed);
  return parsed;
}

/** Ribbon strip following the terrain, for one travel leg. */
function buildRouteRibbon(
  points: { x: number; y: number; z: number }[], halfWidth: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const next = points[Math.min(points.length - 1, i + 1)];
    const prev = points[Math.max(0, i - 1)];
    const dx = next.x - prev.x, dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len * halfWidth, pz = dx / len * halfWidth;
    positions.push(p.x - px, p.y, p.z - pz, p.x + px, p.y, p.z + pz);
    if (i > 0) {
      const base = (i - 1) * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  CALIFORNIA_PIN_ELEVATION, californiaDistricts,
  californiaLandmarks, californiaLandmarkStructures, californiaLocationPosition, californiaRoutePoints,
} from './california-sandbox-map';
import type { InternationalLeg } from '../runtime/california';

type Place = { id: string; name: string; subtitle: string; description: string };
type PlacePin = { id: string; name: string; x: number; y: number; current: boolean; disabled: boolean };
type DistrictCaption = { id: string; name: string; x: number; y: number };
type LandmarkCaption = { id: string; name: string; x: number; y: number };

const props = withDefaults(defineProps<{
  locationId: string;
  places: readonly Place[];
  routes: readonly InternationalLeg[];
  busy?: boolean;
  atmosphereMode?: TokyoAtmosphereMode;
  clockMinutes?: number;
}>(), {
  busy: false,
  atmosphereMode: 'auto',
  clockMinutes: 780,
});
const emit = defineEmits<{
  travel: [locationId: string];
}>();

// Static import makes a missing source GLB a build error, never a silent empty map.
// Lite keeps this asset in the existing local asset ZIP.
const sceneRoot = ref<HTMLElement>();
const canvasHost = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const status = ref<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
const activePreset = ref<ResolvedAtmospherePreset>('day');
const placePins = ref<PlacePin[]>([]);
const districtCaptions = ref<DistrictCaption[]>([]);
const landmarkCaptions = ref<LandmarkCaption[]>([]);
const playerPin = ref<{ name: string; x: number; y: number } | null>(null);
const selectedId = ref(props.locationId);
const bearing = ref(0);
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const size = ref({ width: 640, height: 480 });

let epoch = 0;
let renderer: THREE.WebGLRenderer | undefined;
let appliedCanvasResolution: TokyoCanvasResolution | undefined;
let canvasOwner: Window | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let model: THREE.Group | undefined;
let terrain: THREE.Mesh | undefined;
let routeGroup: THREE.Group | undefined;
let hemiLight: THREE.HemisphereLight | undefined;
let sunLight: THREE.DirectionalLight | undefined;
let vfxController: TokyoSandboxVfxController | undefined;
let animFrame = 0;
let lastTick = 0;
let cameraFlight: { from: CaliforniaCameraPose; to: CaliforniaCameraPose; started: number; duration: number } | undefined;
let placeWorld = new Map<string, THREE.Vector3>();
let districtWorld = new Map<string, THREE.Vector3>();
let landmarkWorld = new Map<string, THREE.Vector3>();
let dragState: { x: number; y: number; panX: number; panY: number } | undefined;
let resizeObserver: ResizeObserver | undefined;

const selected = (): Place => {
  const place = props.places.find(item => item.id === selectedId.value);
  if (place) return place;
  const landmark = californiaLandmarks.find(item => item.id === selectedId.value);
  if (landmark) {
    return { id: landmark.id, name: landmark.name, subtitle: landmark.subtitle, description: landmark.desc };
  }
  return props.places[0];
};
const routeToSelected = () => props.routes.find(route => route.to === selectedId.value);

function terrainHeightAt(x: number, z: number): number {
  if (!terrain) return 0;
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
  const hits = raycaster.intersectObject(terrain, false);
  return hits.length ? hits[0].point.y : 0;
}

function rebuildWorldPositions() {
  placeWorld = new Map();
  for (const landmark of californiaLandmarks) {
    const y = terrainHeightAt(landmark.x, landmark.z);
    placeWorld.set(landmark.id, new THREE.Vector3(landmark.x, y + CALIFORNIA_PIN_ELEVATION, landmark.z));
  }
  districtWorld = new Map();
  for (const district of californiaDistricts) {
    const y = terrainHeightAt(district.x, district.z);
    districtWorld.set(district.id, new THREE.Vector3(district.x, y + 2, district.z));
  }
  landmarkWorld = new Map();
  for (const structure of californiaLandmarkStructures) {
    const y = terrainHeightAt(structure.x, structure.z);
    landmarkWorld.set(structure.landmarkId,
      new THREE.Vector3(structure.x, y + 6, structure.z));
  }
}

function rebuildRoutes() {
  if (!scene || !routeGroup) return;
  while (routeGroup.children.length) {
    const child = routeGroup.children[0];
    routeGroup.remove(child);
    disposeThreeTree(child);
  }
  for (const leg of props.routes) {
    const points = californiaRoutePoints(leg.from, leg.to);
    if (!points) continue;
    const lifted = points.map(point => ({
      x: point.x, y: terrainHeightAt(point.x, point.z) + 1.0, z: point.z,
    }));
    const isSelected = leg.to === selectedId.value;
    const material = new THREE.MeshBasicMaterial({
      color: isSelected ? 0xf6d58b : 0xc9a86a,
      transparent: true, opacity: isSelected ? 0.95 : 0.55, side: THREE.DoubleSide,
    });
    const ribbon = new THREE.Mesh(buildRouteRibbon(lifted, isSelected ? 1.6 : 1.1), material);
    ribbon.name = `route:${leg.from}:${leg.to}`;
    routeGroup.add(ribbon);
  }
}

function projectToScreen(world: THREE.Vector3): { x: number; y: number; visible: boolean } {
  const v = world.clone().project(camera!);
  return {
    x: (v.x * 0.5 + 0.5) * size.value.width,
    y: (-v.y * 0.5 + 0.5) * size.value.height,
    visible: v.z < 1,
  };
}

function render() {
  if (!renderer || !scene || !camera || status.value !== 'ready') return;
  // A camera flight owns the pose while it runs; re-framing here would wipe it.
  if (!cameraFlight) {
    const width = Math.max(1, size.value.width), height = Math.max(1, size.value.height);
    const center = selectedId.value !== props.locationId
      ? californiaLocationPosition(selectedId.value) : undefined;
    frameCaliforniaMapCamera(camera, {
      width, height, bearing: bearing.value, zoom: zoom.value,
      pan: pan.value, center,
    });
  }
  const pins: PlacePin[] = [];
  for (const place of props.places) {
    const world = placeWorld.get(place.id);
    if (!world) continue;
    const screen = projectToScreen(world);
    if (!screen.visible) continue;
    pins.push({
      id: place.id, name: place.name, x: screen.x, y: screen.y,
      current: place.id === props.locationId,
      disabled: props.busy || place.id === props.locationId
        || !props.routes.some(route => route.to === place.id),
    });
  }
  placePins.value = pins;
  const captions: DistrictCaption[] = [];
  for (const district of californiaDistricts) {
    const world = districtWorld.get(district.id);
    if (!world) continue;
    const screen = projectToScreen(world);
    if (screen.visible) captions.push({ id: district.id, name: district.shortName, x: screen.x, y: screen.y });
  }
  districtCaptions.value = captions;
  const landmarks: LandmarkCaption[] = [];
  for (const structure of californiaLandmarkStructures) {
    const world = landmarkWorld.get(structure.landmarkId);
    if (!world) continue;
    const screen = projectToScreen(world);
    if (screen.visible) landmarks.push({ id: structure.landmarkId, name: structure.name, x: screen.x, y: screen.y });
  }
  landmarkCaptions.value = landmarks;
  const player = placeWorld.get(props.locationId);
  if (player) {
    const screen = projectToScreen(player);
    playerPin.value = screen.visible
      ? { name: props.places.find(p => p.id === props.locationId)?.name ?? props.locationId, x: screen.x, y: screen.y }
      : null;
  } else {
    playerPin.value = null;
  }
  renderer.render(scene, camera);
}

function loopAnimation(nowMs: number) {
  animFrame = 0;
  if (document.hidden || !renderer || !scene || !camera) return;
  const dt = Math.min(0.1, Math.max(0, (nowMs - lastTick) / 1000));
  lastTick = nowMs;
  if (cameraFlight) {
    const t = Math.min(1, (nowMs - cameraFlight.started) / cameraFlight.duration);
    const eased = t * t * (3 - 2 * t);
    applyCaliforniaCameraFlight(camera, cameraFlight.from, cameraFlight.to, eased);
    if (t >= 1) cameraFlight = undefined;
  }
  const player = placeWorld.get(props.locationId);
  vfxController?.update(dt, nowMs, undefined,
    player ? { x: player.x, z: player.z } : undefined, undefined);
  render();
  animFrame = requestAnimationFrame(loopAnimation);
}

function startLoop() {
  if (animFrame) return;
  lastTick = performance.now();
  animFrame = requestAnimationFrame(loopAnimation);
}

function stopLoop() {
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = 0;
}

function beginCameraFlightTo(point: { x: number; z: number }) {
  if (!camera || status.value !== 'ready') return;
  const from = readCaliforniaCameraPose(camera);
  const target = new THREE.Vector3(point.x, 0, point.z);
  const to: CaliforniaCameraPose = {
    position: target.clone().add(new THREE.Vector3(0, 320, 320)),
    target,
  };
  cameraFlight = { from, to, started: performance.now(), duration: 600 };
}

function selectPlace(id: string) {
  selectedId.value = id;
  const point = californiaLocationPosition(id);
  if (point) beginCameraFlightTo(point);
  rebuildRoutes();
  render();
}

function flyToLandmark(id: string) {
  const structure = californiaLandmarkStructures.find(item => item.landmarkId === id);
  if (!structure) return;
  beginCameraFlightTo({ x: structure.x, z: structure.z });
  render();
}

function goToSelected() {
  const route = routeToSelected();
  if (!route || props.busy) return;
  emit('travel', route.to);
}

function rotateBy(delta: number) {
  cameraFlight = undefined;
  bearing.value = (bearing.value + delta + 360) % 360;
  render();
}

function resetView() {
  cameraFlight = undefined;
  bearing.value = 0;
  zoom.value = 1;
  pan.value = { x: 0, y: 0 };
  selectedId.value = props.locationId;
  rebuildRoutes();
  render();
}

function refresh() {
  release();
  return load();
}

function release() {
  stopLoop();
  cameraFlight = undefined;
  if (renderer) {
    renderer.dispose();
    renderer = undefined;
  }
  if (scene) {
    disposeThreeTree(scene);
    scene = undefined;
  }
  if (vfxController) {
    vfxController.dispose();
    vfxController = undefined;
  }
  model = undefined;
  terrain = undefined;
  routeGroup = undefined;
  camera = undefined;
  hemiLight = undefined;
  sunLight = undefined;
  appliedCanvasResolution = undefined;
}

async function load() {
  if (document.hidden || !sceneRoot.value || !canvasHost.value || renderer || status.value === 'loading') return;
  const request = ++epoch;
  status.value = 'loading';
  let pending: THREE.Group | undefined;
  try {
    const element = sceneRoot.value.ownerDocument.createElement('canvas');
    element.className = 'california-sandbox-canvas';
    element.setAttribute('aria-hidden', 'true');
    canvas.value = element;
    canvasHost.value.replaceChildren(element);
    await nextTick();
    if (request !== epoch || !canvas.value) return;
    pending = await loadCaliforniaGlb(californiaModelAsset);
    if (request !== epoch) {
      disposeThreeTree(pending);
      return;
    }
    model = pending;
    pending = undefined;
    scene = new THREE.Scene();
    scene.add(model);
    terrain = model.getObjectByName('california-terrain') as THREE.Mesh | undefined;
    hemiLight = new THREE.HemisphereLight(0xffffff, 0x6e837b, 2.5);
    scene.add(hemiLight);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-170, 460, 230);
    scene.add(sun);
    sunLight = sun;
    camera = new THREE.PerspectiveCamera(50, 1, .25, 6500);
    routeGroup = new THREE.Group();
    routeGroup.name = 'california-routes';
    scene.add(routeGroup);
    canvas.value.addEventListener('webglcontextlost', contextLost, true);
    renderer = new THREE.WebGLRenderer({
      canvas: canvas.value, alpha: true, antialias: true, powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    vfxController = createTokyoSandboxVfx(scene, renderer, model, hemiLight, sunLight);
    activePreset.value = vfxController.setAtmosphere(props.atmosphereMode, props.clockMinutes).preset;
    appliedCanvasResolution = applyTokyoCanvasResolution(
      renderer, nativeTokyoCanvasResolution(size.value.width, size.value.height, window.devicePixelRatio),
    );
    rebuildWorldPositions();
    rebuildRoutes();
    status.value = 'ready';
    render();
    startLoop();
  } catch (error) {
    if (pending) disposeThreeTree(pending);
    if (request === epoch) {
      console.warn('[UnreadCity] California map WebGL unavailable', error);
      release();
      status.value = 'fallback';
    }
  }
}

function contextLost(event: Event) {
  event.preventDefault();
  release();
  status.value = 'fallback';
}

function onPointerDown(event: PointerEvent) {
  if (status.value !== 'ready') return;
  cameraFlight = undefined;
  dragState = { x: event.clientX, y: event.clientY, panX: pan.value.x, panY: pan.value.y };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!dragState) return;
  pan.value = {
    x: dragState.panX + (event.clientX - dragState.x),
    y: dragState.panY + (event.clientY - dragState.y),
  };
  render();
}

function onPointerUp() {
  dragState = undefined;
}

function onWheel(event: WheelEvent) {
  if (status.value !== 'ready') return;
  event.preventDefault();
  cameraFlight = undefined;
  zoom.value = Math.max(0.65, Math.min(12, zoom.value * (event.deltaY > 0 ? 1 / 1.15 : 1.15)));
  render();
}

function visibilityChanged() {
  if (document.hidden) stopLoop();
  else if (status.value === 'ready') startLoop();
  else if (status.value === 'idle') void load();
}

defineExpose({ refresh });

watch(() => props.locationId, id => {
  selectedId.value = id;
  rebuildRoutes();
  render();
});
watch(() => [props.atmosphereMode, props.clockMinutes] as const, ([mode, mins]) => {
  if (vfxController) {
    activePreset.value = vfxController.setAtmosphere(mode, mins).preset;
    render();
  }
});
watch(() => props.routes, () => {
  rebuildRoutes();
  render();
});

onMounted(() => {
  canvasOwner = (canvas.value ?? sceneRoot.value)?.ownerDocument.defaultView ?? undefined;
  canvasOwner?.addEventListener('resize', render);
  document.addEventListener('visibilitychange', visibilityChanged);
  if (sceneRoot.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      size.value = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
      if (renderer) {
        appliedCanvasResolution = applyTokyoCanvasResolution(
          renderer,
          nativeTokyoCanvasResolution(size.value.width, size.value.height, window.devicePixelRatio),
          appliedCanvasResolution,
        );
      }
      render();
    });
    resizeObserver.observe(sceneRoot.value);
  }
  void load();
});
onBeforeUnmount(() => {
  canvasOwner?.removeEventListener('resize', render);
  canvasOwner = undefined;
  document.removeEventListener('visibilitychange', visibilityChanged);
  resizeObserver?.disconnect();
  release();
});
</script>

<template>
  <section ref="sceneRoot" class="california-sandbox-scene"
    :data-california-sandbox-status="status" :data-california-atmosphere="activePreset"
    @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"
    @pointercancel="onPointerUp" @wheel="onWheel">
    <header class="ca-heading">
      <div><small>CALIFORNIA · WEST COAST</small><h2>加利福尼亚州</h2>
      <p>从北加州红木海岸，到南加州太平洋沿岸</p></div>
      <span class="ca-live">立体沙盘 · 游戏世界</span>
    </header>
    <div ref="canvasHost" v-show="status === 'ready'" class="california-sandbox-renderer" />
    <p v-if="status === 'loading'" class="california-sandbox-fallback" role="status">正在展开加州立体沙盘…</p>
    <p v-if="status === 'fallback'" class="california-sandbox-fallback" role="status">
      沙盘暂不可用，可以<button type="button" @click="refresh">刷新重试</button>，或从地点列表选择目的地。
    </p>
    <template v-if="status === 'ready'">
      <span v-for="caption in districtCaptions" :key="caption.id" class="california-sandbox-caption"
        :style="{ left: caption.x + 'px', top: caption.y + 'px' }">{{ caption.name }}</span>
      <button v-for="landmark in landmarkCaptions" :key="landmark.id" type="button"
        class="california-sandbox-landmark"
        :style="{ left: landmark.x + 'px', top: landmark.y + 'px' }"
        :title="landmark.name" :aria-label="'飞向地标：' + landmark.name"
        @click="flyToLandmark(landmark.id)">◆ {{ landmark.name }}</button>
      <button v-for="place in placePins" :key="place.id" type="button"
        class="california-sandbox-pin" :class="{ current: place.current }"
        :data-map-target="place.id" :data-map-location="place.id"
        :style="{ left: place.x + 'px', top: place.y + 'px' }"
        :title="place.name" :aria-label="place.current ? place.name + '，当前位置' : '查看' + place.name"
        :disabled="place.disabled" @click="selectPlace(place.id)">{{ place.name }}</button>
      <span v-if="playerPin" class="california-sandbox-player" :aria-label="'当前位置：' + playerPin.name"
        :style="{ left: playerPin.x + 'px', top: playerPin.y + 'px' }">●</span>
      <aside v-if="selected()" class="ca-place-panel">
        <small>SELECTED LOCATION</small>
        <h3>{{ selected().name }}</h3>
        <p>{{ selected().description }}</p>
        <p class="ca-subtitle">{{ selected().subtitle }}</p>
        <button v-if="routeToSelected()" type="button" :disabled="busy" @click="goToSelected">
          前往这里 · {{ routeToSelected()!.minutes }} 分钟 · ¥{{ routeToSelected()!.fare }}
        </button>
        <p v-else-if="selected().id === locationId" class="ca-unavailable">你现在就在这里。</p>
        <p v-else class="ca-unavailable">当前尚无直达行程；可从湾区枢纽继续探索。</p>
      </aside>
    </template>
    <nav class="ca-destination-list" aria-label="可前往地点">
      <button v-for="route in routes" :key="route.to" type="button"
        :class="{ active: selectedId === route.to }" :disabled="busy"
        @click="selectPlace(route.to)">
        <b>{{ places.find(place => place.id === route.to)?.name ?? route.to }}</b>
        <small>{{ route.method }} · {{ route.minutes }} 分钟</small>
      </button>
    </nav>
    <div class="ca-controls" aria-label="地图控制">
      <button type="button" aria-label="向左旋转地图" @click="rotateBy(-30)">↶</button>
      <button type="button" aria-label="向右旋转地图" @click="rotateBy(30)">↷</button>
      <button type="button" aria-label="复位地图视图" @click="resetView">⌂</button>
    </div>
  </section>
</template>

<style scoped>
.california-sandbox-scene{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(220px,.8fr);gap:14px;color:#e8e6dc;background:linear-gradient(145deg,#182b32,#243b40 58%,#17262e);border:1px solid #52666a;border-radius:14px;padding:16px;min-height:580px;position:relative}
.ca-heading{grid-column:1/-1;display:flex;justify-content:space-between;gap:12px;align-items:start}.ca-heading small{font-size:10px;letter-spacing:2px;color:#b7c7b5}.ca-heading h2{font-size:22px;margin:5px 0}.ca-heading p{font-size:12px;color:#c2cec5;margin:4px 0}.ca-live{font-size:10px;border:1px solid #6c8982;border-radius:20px;padding:6px 9px;color:#c4d5c5;white-space:nowrap}
.california-sandbox-renderer{position:relative;min-width:0;background:radial-gradient(ellipse at 40% 50%,#47737a,#24464e 72%);border-radius:10px;overflow:hidden;min-height:470px}
.california-sandbox-renderer canvas{width:100%;height:100%;display:block}
.california-sandbox-fallback{grid-column:1/-1;color:#e2c99a;font-size:13px}
.california-sandbox-fallback button{margin-left:6px;border:1px solid #b49c70;background:#a88c5c;color:#172a2c;border-radius:6px;padding:4px 10px;cursor:pointer}
.california-sandbox-pin{position:absolute;transform:translate(-50%,-100%);background:#20363a;border:1px solid #e1bc79;color:#e6e5d9;border-radius:8px;padding:5px 9px;font-size:12px;cursor:pointer;white-space:nowrap;z-index:3}
.california-sandbox-pin.current{border-color:#f6d58b;background:#344b49;font-weight:700}
.california-sandbox-pin:disabled{opacity:.45;cursor:not-allowed}
.california-sandbox-caption{position:absolute;transform:translate(-50%,-50%);font-size:11px;letter-spacing:2px;color:#d9d0b8;text-shadow:0 1px 3px #17262e;pointer-events:none;z-index:2}
.california-sandbox-landmark{position:absolute;transform:translate(-50%,-50%);background:rgba(32,54,58,.85);border:1px solid #c0362c;color:#f2e6d9;border-radius:8px;padding:3px 8px;font-size:11px;cursor:pointer;white-space:nowrap;z-index:3}
.california-sandbox-player{position:absolute;transform:translate(-50%,-50%);color:#ff5a4e;font-size:16px;text-shadow:0 0 6px #ff5a4e;pointer-events:none;z-index:4}
.ca-place-panel{background:#263b3d;border:1px solid #536c66;border-radius:10px;padding:14px;align-self:start}.ca-place-panel small{font-size:10px;letter-spacing:2px;color:#b7c7b5}.ca-place-panel h3{font-size:18px;margin:7px 0}.ca-place-panel p{font-size:12px;color:#c2cec5;margin:4px 0}.ca-place-panel .ca-subtitle{color:#a9c1b3}.ca-place-panel button{margin-top:12px;width:100%;border:1px solid #b49c70;background:#a88c5c;color:#172a2c;border-radius:7px;padding:10px;font-weight:700;cursor:pointer}.ca-place-panel button:disabled{opacity:.45;cursor:not-allowed}.ca-unavailable{margin-top:12px!important;color:#e2c99a!important}
.ca-destination-list{grid-column:1/-1;display:flex;gap:8px;overflow-x:auto;padding-bottom:3px}.ca-destination-list button{min-width:145px;text-align:left;background:#20363a;border:1px solid #536a65;color:#e6e5d9;border-radius:8px;padding:9px;cursor:pointer}.ca-destination-list button.active{border-color:#e1bc79;background:#344b49}.ca-destination-list button:disabled{opacity:.4}.ca-destination-list b,.ca-destination-list small{display:block}.ca-destination-list b{font-size:12px}.ca-destination-list small{font-size:10px;color:#b9c7bc;margin-top:4px}
.ca-controls{grid-column:1/-1;display:flex;gap:8px}.ca-controls button{background:#20363a;border:1px solid #536a65;color:#e6e5d9;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:14px}
@media(max-width:720px){.california-sandbox-scene{grid-template-columns:1fr}.california-sandbox-renderer{min-height:400px}.ca-heading{flex-direction:column}.ca-destination-list{grid-column:1}}
</style>
