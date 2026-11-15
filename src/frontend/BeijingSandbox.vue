<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AmbientLight, Color, DirectionalLight, Group, Line, LineBasicMaterial,
  BufferGeometry, Float32BufferAttribute, OrthographicCamera, Scene,
  Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import atlas from '../../assets/beijing-sandbox/sandbox.json';
import terrainUrl from '../../assets/beijing-sandbox/sandbox.glb?inline';
import type { InternationalLeg } from '../runtime/california';
import { beijingLocalTime, isBeijingLocation } from '../runtime/beijing';
import { arrangeMapLabels, type MapLabelCandidate } from './map-label-layout';
import {
  clipViewPolygonToNearPlane,
  computePointsBoundingRect,
  computeRectOutlineFromScreenCorners,
  estimateFloatingLabelWidth,
  type OutlineZoneOverlay,
} from './sandbox-zone-overlay';

const props = defineProps<{
  locationId: string;
  routes: readonly InternationalLeg[];
  clock: { hour: number; minute: number };
  busy?: boolean;
  /** The same authoritative quote function used by WorldMap travelTo. */
  quote: (id: string) => { blockedReason: string | null; minutes: number; fare: number; alreadyThere: boolean } | undefined;
}>();
const emit = defineEmits<{ travel: [id: string]; back: [] }>();
const selectedId = ref(isBeijingLocation(props.locationId) ? props.locationId : atlas.startId);
const filter = ref('');
const focus = ref('');
const mode = ref<'auto' | 'day' | 'night'>('auto');
const zoom = ref(1);
const yaw = ref(-0.4);
const tilt = ref(0.85);
const center = ref({ x: 0, z: 0 });
const stage = ref<HTMLDivElement>();
const canvas = ref<HTMLCanvasElement>();
const webglError = ref('');
const viewport = ref({ width: 800, height: 480 });
const hoveredTargetId = ref('');
const outlineZones = ref<OutlineZoneOverlay[]>([]);
const districtPins = ref<{
  id: string; name: string; x: number; y: number; anchorX: number; anchorY: number;
  area: (typeof atlas.focusAreas)[number]; selected: boolean; current: boolean;
}[]>([]);
const pins = ref<{
  id: string; name: string; index: number; left: number; top: number;
  anchorX: number; anchorY: number; visible: boolean; compact: boolean;
}[]>([]);
const areaZones = atlas.focusAreas.flatMap(area => {
  const points = atlas.places.filter(place => area.places.includes(place.id));
  const rect = computePointsBoundingRect(points, 12, 6);
  return rect ? [{ id: area.name, name: area.name, places: area.places, area, ...rect }] : [];
});
const overlayLeaders = computed(() => [
  ...districtPins.value.map(d => ({ id: `d:${d.id}`, x1: d.anchorX, y1: d.anchorY, x2: d.x, y2: d.y })),
  ...pins.value.filter(p => p.visible).map(p => ({ id: `p:${p.id}`, x1: p.anchorX, y1: p.anchorY, x2: p.left, y2: p.top })),
].filter(line => Math.hypot(line.x2 - line.x1, line.y2 - line.y1) > 8));
const selected = computed(() => atlas.places.find(place => place.id === selectedId.value));
const destinationLeg = computed(() => props.routes.find(leg => leg.to === selectedId.value));
const selectedQuote = computed(() => props.quote(selectedId.value));
const allowed = computed(() => !!destinationLeg.value && !!selectedQuote.value
  && !props.busy && !selectedQuote.value.blockedReason
  && !selectedQuote.value.alreadyThere && selectedId.value !== props.locationId);
const filteredPlaces = computed(() => atlas.places.filter(place => {
  const q = filter.value.trim().toLocaleLowerCase();
  return !q || `${place.name} ${place.subtitle} ${place.aliases?.join(' ') ?? ''}`.toLocaleLowerCase().includes(q);
}));
const inBeijing = computed(() => isBeijingLocation(props.locationId));
const localTime = computed(() => beijingLocalTime(props.clock));
const night = computed(() => mode.value === 'night' || (mode.value === 'auto'
  && (localTime.value.hour < 6 || localTime.value.hour >= 19)));

let scene: Scene | undefined;
let renderer: WebGLRenderer | undefined;
let camera: OrthographicCamera | undefined;
let model: Group | undefined;
let routeLine: Line | undefined;
let ambient: AmbientLight | undefined;
let sun: DirectionalLight | undefined;
let observer: ResizeObserver | undefined;
let pendingFrame = 0;
let disposed = false;
let mounted = false;
const pointers = new Map<number, { x: number; y: number }>();
let prevPinch = 0;
const bounds = atlas.bounds;
const limit = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function select(id: string) {
  if (!atlas.places.some(p => p.id === id)) return;
  selectedId.value = id;
  updateRoute();
  schedule();
}
function travel() {
  if (allowed.value) emit('travel', selectedId.value);
}
function chooseArea(area: (typeof atlas.focusAreas)[number]) {
  focus.value = area.name;
  // Only two detailed neighborhoods have authored camera presets.
  // Other focus areas fall back to their available landmark centroids.
  const points = atlas.places.filter(place => area.places.includes(place.id));
  const fallback = {
    x: points.length ? points.reduce((sum, place) => sum + place.x, 0) / points.length : 0,
    z: points.length ? points.reduce((sum, place) => sum + place.z, 0) / points.length : 0,
  };
  const view = 'view' in area ? area.view : undefined;
  center.value = { x: view?.x ?? fallback.x, z: view?.z ?? fallback.z };
  zoom.value = limit((view?.zoom ?? 10) / 3.5, 1, 9);
  yaw.value = view?.yaw ?? -.4;
  tilt.value = limit(view?.tilt ?? .85, 0.3, 1.35);
  if (area.places.length) selectedId.value = area.places[0];
  updateRoute(); schedule();
}
function framePlace() {
  const place = selected.value;
  if (!place) return;
  center.value = { x: place.x, z: place.z };
  zoom.value = 4;
  schedule();
}
function reset() {
  center.value = { x: 0, z: 0 };
  zoom.value = 1;
  yaw.value = -0.4;
  tilt.value = 0.85;
  focus.value = '';
  schedule();
}
function zoomBy(factor: number) { zoom.value = limit(zoom.value * factor, 0.75, 12); schedule(); }
function rotateBy(delta: number) { yaw.value += delta; schedule(); }
function onWheel(event: WheelEvent) { zoomBy(event.deltaY > 0 ? 0.82 : 1.2); }
function down(event: PointerEvent) {
  if (event.button !== 0 && event.button !== 2) return;
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  prevPinch = 0;
}
function move(event: PointerEvent) {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (prevPinch > 0 && distance > 5) zoomBy(distance / prevPinch);
    prevPinch = distance;
    return;
  }
  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;
  if (event.buttons === 2 || event.altKey) {
    yaw.value -= dx * 0.008;
    tilt.value = limit(tilt.value - dy * 0.006, .30, 1.35);
  } else {
    const pixels = Math.min(viewport.value.width, viewport.value.height);
    const unitsPerPx = 250 / Math.max(240, pixels) / zoom.value;
    center.value = {
      x: limit(center.value.x - dx * unitsPerPx, bounds.minX - 30, bounds.maxX + 30),
      z: limit(center.value.z + dy * unitsPerPx, bounds.minZ - 30, bounds.maxZ + 30),
    };
  }
  schedule();
}
function up(event: PointerEvent) {
  pointers.delete(event.pointerId);
  prevPinch = 0;
  const el = event.currentTarget as Element;
  if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
}
function updateCamera() {
  if (!camera) return;
  const { width, height } = viewport.value;
  const aspect = width / Math.max(1, height);
  const hh = Math.max(115, 120 / Math.max(.35, aspect)) / zoom.value;
  camera.left = -hh * aspect; camera.right = hh * aspect;
  camera.top = hh; camera.bottom = -hh;
  camera.near = .1; camera.far = 2000;
  camera.updateProjectionMatrix();
  const horizontal = 240 * Math.cos(tilt.value);
  const vertical = 240 * Math.sin(tilt.value);
  camera.position.set(center.value.x + Math.sin(yaw.value) * horizontal,
    vertical, center.value.z + Math.cos(yaw.value) * horizontal);
  camera.lookAt(center.value.x, 0, center.value.z);
  camera.updateMatrixWorld();
}
function projectWorldPoint(x: number, y: number, z: number) {
  const { width, height } = viewport.value;
  if (!camera || webglError.value) {
    const sx = ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * width;
    const sy = ((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * height;
    return { x: sx, y: sy, visible: sx >= 8 && sx <= width - 8 && sy >= 8 && sy <= height - 8 };
  }
  const point = new Vector3(x, y, z).project(camera);
  const sx = (point.x + 1) * width / 2;
  const sy = (1 - point.y) * height / 2;
  return { x: sx, y: sy, visible: point.z >= -1 && point.z <= 1 && sx >= 8 && sx <= width - 8 && sy >= 8 && sy <= height - 8 };
}
function projectRectOutline(
  id: string,
  targetId: string,
  kind: 'district' | 'place',
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  elevation: number,
  options: { selected?: boolean; current?: boolean } = {},
): OutlineZoneOverlay | null {
  const { width, height } = viewport.value;
  const x0 = Math.min(minX, maxX);
  const x1 = Math.max(minX, maxX);
  const z0 = Math.min(minZ, maxZ);
  const z1 = Math.max(minZ, maxZ);
  if (x1 <= x0 || z1 <= z0) return null;
  if (!camera || webglError.value) {
    const screenPts = [
      projectWorldPoint(x0, elevation, z0),
      projectWorldPoint(x1, elevation, z0),
      projectWorldPoint(x1, elevation, z1),
      projectWorldPoint(x0, elevation, z1),
    ];
    return computeRectOutlineFromScreenCorners(id, targetId, kind, screenPts, width, height, options);
  }
  const viewCorners = [
    new Vector3(x0, elevation, z0),
    new Vector3(x1, elevation, z0),
    new Vector3(x1, elevation, z1),
    new Vector3(x0, elevation, z1),
  ].map(pt => pt.applyMatrix4(camera!.matrixWorldInverse));
  const clipped = clipViewPolygonToNearPlane(viewCorners, 1);
  if (clipped.length < 3) return null;
  const screenPts = clipped.map(pt => {
    const projected = new Vector3(pt.x, pt.y, pt.z).applyMatrix4(camera!.projectionMatrix);
    return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
  });
  return computeRectOutlineFromScreenCorners(id, targetId, kind, screenPts, width, height, options);
}
function updatePins() {
  const { width, height } = viewport.value;
  const narrow = width < 520;
  const nextOutlines: OutlineZoneOverlay[] = [];
  const rawDistricts = areaZones.flatMap(zone => {
    const selectedArea = focus.value === zone.name || (!focus.value && zone.places.includes(selectedId.value));
    const currentArea = zone.places.includes(props.locationId);
    const outline = projectRectOutline(
      `area:${zone.name}`,
      `area:${zone.name}`,
      'district',
      zone.minX,
      zone.maxX,
      zone.minZ,
      zone.maxZ,
      0.8,
      { selected: selectedArea, current: currentArea },
    );
    if (outline) nextOutlines.push(outline);
    const p = projectWorldPoint(zone.cx, 2.2, zone.cz);
    if (!p.visible) return [];
    const widthEstimate = estimateFloatingLabelWidth(zone.name, narrow ? 13 : 14.5, 16, 58, narrow ? 114 : 138);
    return [{
      id: zone.name, name: zone.name, x: p.x, y: p.y, anchorX: p.x, anchorY: p.y,
      area: zone.area, selected: selectedArea, current: currentArea, widthEstimate,
    }];
  });

  const routeIds = new Set(props.routes.map(route => route.to));
  const rawPlaces = atlas.places.flatMap((place, index) => {
    const isSelected = place.id === selectedId.value;
    const isCurrent = place.id === props.locationId;
    if (isSelected || isCurrent) {
      const radius = isCurrent ? 5.8 : 4.6;
      const placeOutline = projectRectOutline(
        `place:${place.id}`,
        `place:${place.id}`,
        'place',
        place.x - radius,
        place.x + radius,
        place.z - radius,
        place.z + radius,
        0.9,
        { selected: isSelected, current: isCurrent },
      );
      if (placeOutline) nextOutlines.push(placeOutline);
    }
    const p = projectWorldPoint(place.x, place.y, place.z);
    if (!p.visible) return [];
    const compact = !isSelected && !isCurrent && zoom.value < 1.55 && (narrow || index >= 6);
    const widthEstimate = compact
      ? 28
      : estimateFloatingLabelWidth(place.name, narrow ? 11.5 : 12.5, 34, 68, narrow ? 118 : 144);
    const priority = isCurrent ? 1.1 : isSelected ? 1.3 : routeIds.has(place.id) ? 2.1 : compact ? 3.5 : 2.7;
    return [{
      id: place.id, name: place.name, index: index + 1, left: p.x, top: p.y,
      anchorX: p.x, anchorY: p.y, compact, widthEstimate, priority,
    }];
  });

  outlineZones.value = nextOutlines;
  const candidates: MapLabelCandidate[] = [
    ...rawDistricts.map(d => ({ id: `d:${d.id}`, x: d.x, y: d.y, width: d.widthEstimate, height: narrow ? 22 : 24, priority: 0.6 })),
    ...rawPlaces.map(p => ({ id: `p:${p.id}`, x: p.left, y: p.top, width: p.widthEstimate, height: p.compact ? 26 : 24, priority: p.priority })),
  ];
  const layout = arrangeMapLabels(candidates, width, Math.max(80, height - 26));
  districtPins.value = rawDistricts.flatMap(d => {
    const box = layout.get(`d:${d.id}`);
    return box ? [{ ...d, x: box.x, y: box.y }] : [];
  });
  pins.value = rawPlaces.map(p => {
    const box = layout.get(`p:${p.id}`);
    return box
      ? { id: p.id, name: p.name, index: p.index, left: box.x, top: box.y, anchorX: p.anchorX, anchorY: p.anchorY, visible: true, compact: p.compact }
      : { id: p.id, name: p.name, index: p.index, left: p.anchorX, top: p.anchorY, anchorX: p.anchorX, anchorY: p.anchorY, visible: false, compact: p.compact };
  });
}
function render() {
  pendingFrame = 0;
  if (disposed) return;
  updateCamera();
  if (scene && renderer && camera) {
    scene.background = new Color(night.value ? '#151f31' : '#d1e2e7');
    if (ambient) ambient.intensity = night.value ? 1.1 : 2.1;
    if (sun) sun.intensity = night.value ? .45 : 2.7;
    renderer.render(scene, camera);
  }
  updatePins();
}
function schedule() {
  if (!pendingFrame && mounted && !disposed) pendingFrame = requestAnimationFrame(render);
}
function updateRoute() {
  if (!scene) return;
  if (routeLine) {
    scene.remove(routeLine);
    routeLine.geometry.dispose(); (routeLine.material as LineBasicMaterial).dispose(); routeLine = undefined;
  }
  const from = props.locationId;
  const to = selectedId.value;
  let line = atlas.routes.find(item => item.from === from && item.to === to);
  let points = line?.points;
  if (!points) {
    line = atlas.routes.find(item => item.to === from && item.from === to);
    points = line?.points.slice().reverse();
  }
  if (!points?.length) return;
  const values = points.flatMap(p => [p[0], 2.2, p[1]]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
  routeLine = new Line(geometry, new LineBasicMaterial({ color: 0xf43f62, linewidth: 2, depthTest: false }));
  routeLine.renderOrder = 20;
  scene.add(routeLine);
}
async function getModelBytes(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    if (comma === -1 || !url.slice(0, comma).endsWith(';base64')) throw new Error('GLB data URL 无效');
    const raw = atob(url.slice(comma + 1));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes.buffer;
  }
  if (url.startsWith('blob:')) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('离线 GLB Blob 读取失败');
    return response.arrayBuffer();
  }
  throw new Error('北京 GLB 必须随角色卡离线打包');
}
const loadAbort = new AbortController();
async function load() {
  if (!canvas.value || disposed) return;
  try {
    const mapScene = new Scene();
    scene = mapScene;
    camera = new OrthographicCamera();
    ambient = new AmbientLight(0xffffff, 2.1);
    sun = new DirectionalLight(0xffffff, 2.7);
    sun.position.set(-65, 180, 35);
    mapScene.add(ambient, sun);
    const gl = new WebGLRenderer({ canvas: canvas.value, alpha: false, antialias: true });
    renderer = gl;
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    resize();
    const bytes = await getModelBytes(terrainUrl, loadAbort.signal);
    if (disposed) return;
    const gltf = await new GLTFLoader().parseAsync(bytes, '');
    if (disposed) return;
    model = gltf.scene;
    scene.add(model);
    updateRoute();
    schedule();
  } catch (error) {
    if (disposed) return;
    webglError.value = error instanceof Error ? error.message : 'WebGL 不可用';
    console.warn('[北京沙盘] 3D 不可用，显示地点列表与平面回退', error);
    schedule();
  }
}
function resize() {
  const root = stage.value;
  if (!root) return;
  const width = Math.max(1, Math.round(root.clientWidth));
  const height = Math.max(1, Math.round(root.clientHeight));
  viewport.value = { width, height };
  renderer?.setSize(width, height, false);
  schedule();
}
watch(() => props.locationId, id => {
  selectedId.value = isBeijingLocation(id) ? id : atlas.startId;
  updateRoute(); schedule();
});
watch(() => props.routes, () => { updateRoute(); schedule(); });
watch(night, schedule);
watch(selectedId, () => { updateRoute(); schedule(); });
onMounted(async () => {
  disposed = false;
  mounted = true;
  await nextTick();
  if (stage.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(resize); observer.observe(stage.value);
  }
  resize();
  void load();
});
onBeforeUnmount(() => {
  disposed = true;
  mounted = false;
  loadAbort.abort();
  observer?.disconnect();
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pointers.clear();
  if (scene) {
    scene.traverse(object => {
      const mesh = object as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
      else mesh.material?.dispose();
    });
  }
  renderer?.dispose();
  renderer?.forceContextLoss();
  model = undefined; scene = undefined; renderer = undefined; camera = undefined;
});
</script>

<template>
  <section class="bj-sandbox" aria-label="北京旅行沙盘" data-beijing-sandbox>
    <header class="bj-heading">
      <div><small>BEIJING · 北京</small><h2>北京市旅行沙盘</h2><p>33 处真实地点 · 旅行与当前位置由角色卡管理</p></div>
      <div class="bj-heading-actions">
        <span>北京时间 {{ String(localTime.hour).padStart(2, '0') }}:{{ String(localTime.minute).padStart(2, '0') }}</span>
        <button type="button" @click="emit('back')">← 返回世界地图</button>
      </div>
    </header>
    <div class="bj-layout">
      <div class="bj-visual">
        <div class="bj-control-row">
          <button v-for="area in atlas.focusAreas" :key="area.name" type="button" :class="{ active: focus === area.name }" @click="chooseArea(area)">{{ area.name }}</button>
        </div>
        <div ref="stage" class="bj-stage" :class="{ 'bj-fallback': !!webglError }" :data-sandbox-theme="night ? 'dark' : 'light'">
          <canvas ref="canvas" class="bj-canvas" aria-label="北京三维城市模型" @contextmenu.prevent @wheel.prevent="onWheel" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up" />
          <div class="bj-pin-layer">
            <svg v-if="outlineZones.length" class="bj-outlines sandbox-outlines" aria-hidden="true">
              <g
                v-for="zone in outlineZones"
                :key="zone.id"
                class="sandbox-outline-zone"
                :class="{
                  'is-place': zone.kind === 'place',
                  selected: zone.selected,
                  current: zone.current,
                  hovered: hoveredTargetId === zone.targetId,
                }"
              >
                <polygon class="sandbox-outline-poly" :points="zone.points" />
                <path v-for="(corner, idx) in zone.corners" :key="idx" class="sandbox-outline-corner" :d="corner" />
              </g>
            </svg>
            <svg v-if="overlayLeaders.length" class="bj-leaders sandbox-leaders" aria-hidden="true">
              <line
                v-for="line in overlayLeaders"
                :key="line.id"
                class="sandbox-leader-line"
                :x1="line.x1"
                :y1="line.y1"
                :x2="line.x2"
                :y2="line.y2"
              />
            </svg>
            <button
              v-for="district in districtPins"
              :key="district.id"
              type="button"
              class="bj-district sandbox-pin sandbox-district-pin"
              :class="{ selected: district.selected, current: district.current }"
              :data-bj-district="district.name"
              :style="{ left: district.x + 'px', top: district.y + 'px' }"
              @pointerenter="hoveredTargetId = 'area:' + district.name"
              @pointerleave="hoveredTargetId = ''"
              @click="chooseArea(district.area)"
            >
              <span class="sandbox-floating-title">{{ district.name }}</span>
            </button>
            <button
              v-for="pin in pins.filter(p => p.visible)"
              :key="pin.id"
              type="button"
              class="bj-pin sandbox-pin sandbox-place-pin"
              :class="{ selected: pin.id === selectedId, here: pin.id === locationId, current: pin.id === locationId, compact: pin.compact }"
              :style="{ left: pin.left + 'px', top: pin.top + 'px' }"
              :title="pin.name"
              :aria-label="'选择' + pin.name"
              @pointerenter="hoveredTargetId = 'place:' + pin.id"
              @pointerleave="hoveredTargetId = ''"
              @click="select(pin.id)"
            >
              <span class="sandbox-place-index" aria-hidden="true">{{ pin.index }}</span>
              <span v-if="!pin.compact" class="sandbox-floating-title">{{ pin.name }}</span>
            </button>
          </div>
          <p v-if="webglError" class="bj-fallback-hint">三维模型暂不可用。地点选择和路线功能仍可通过右侧列表操作。</p>
          <div class="bj-stage-note">拖动平移 · Alt/右键旋转 · 双指/滚轮缩放 · 红点为当前地点</div>
        </div>
        <div class="bj-tools">
          <button type="button" @click="zoomBy(1.2)">＋ 放大</button>
          <button type="button" @click="zoomBy(1/1.2)">－ 缩小</button>
          <button type="button" @click="rotateBy(-.35)">↶ 旋转</button>
          <button type="button" @click="framePlace">聚焦所选</button>
          <button type="button" @click="reset">⌂ 复位</button>
          <button type="button" @click="mode = mode === 'auto' ? 'day' : mode === 'day' ? 'night' : 'auto'">光照：{{ mode === 'auto' ? '自动' : mode === 'day' ? '白天' : '夜景' }}</button>
        </div>
      </div>
      <aside class="bj-panel">
        <small class="bj-eyebrow">{{ selectedId === locationId ? '当前地点' : '地点预览' }}</small>
        <h3>{{ selected?.name ?? '北京' }}</h3>
        <p>{{ selected?.description }}</p>
        <p class="bj-muted">{{ selected?.subtitle }}</p>
        <template v-if="selectedId === locationId"><p class="bj-route-note">你已经在这里。</p></template>
        <template v-else-if="destinationLeg">
          <p class="bj-route-note">{{ destinationLeg.method }} · {{ selectedQuote?.minutes ?? destinationLeg.minutes }} 分钟 · ¥{{ selectedQuote?.fare ?? destinationLeg.fare }}</p>
          <p v-if="selectedQuote?.blockedReason" class="bj-route-note">{{ selectedQuote.blockedReason }}</p>
          <button type="button" class="bj-go" :disabled="!allowed" data-bj-travel @click="travel">确认前往{{ selected?.name }}</button>
        </template>
        <p v-else class="bj-route-note">此处无直达连接，请在下方选择可以前往的下一站。预览不消耗游戏时间。</p>
        <label class="bj-search">搜索地点<input v-model="filter" type="search" placeholder="地点名称或别名" /></label>
        <div class="bj-place-list">
          <button v-for="place in filteredPlaces" :key="place.id" type="button" :aria-pressed="selectedId === place.id" :data-bj-place="place.id" @click="select(place.id)">
            <span>{{ place.name }}</span><small>{{ place.id === locationId ? '当前位置' : routes.some(route => route.to === place.id) ? '可前往' : '预览' }}</small>
          </button>
          <p v-if="!filteredPlaces.length">未找到对应地点。</p>
        </div>
        <div class="bj-route-list"><h4>下一站 · {{ routes.length }}</h4>
          <button v-for="leg in routes" :key="leg.to" type="button"
            :disabled="!isBeijingLocation(leg.to) && (busy || !!quote(leg.to)?.blockedReason)"
            @click="isBeijingLocation(leg.to) ? select(leg.to) : emit('travel', leg.to)">
            {{ leg.method }} · {{ atlas.places.find(p => p.id === leg.to)?.name ?? '东京羽田国际机场（返回日本）' }} · {{ leg.minutes }} 分钟 · ¥{{ leg.fare }}
          </button>
          <p v-if="!routes.length">当前不在北京，先到羽田机场乘国际航班；此处仅能预览地图。</p>
        </div>
        <p class="bj-disclaimer">模型、道路和耗时为艺术化示意。所有旅行结算均走角色卡的 novel_travel；车费为暂定游戏数值，不代表现实票价。</p>
      </aside>
    </div>
  </section>
</template>
