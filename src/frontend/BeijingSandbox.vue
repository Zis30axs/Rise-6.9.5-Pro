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
const pins = ref<{ id: string; left: number; top: number; visible: boolean }[]>([]);
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
function updatePins() {
  const { width, height } = viewport.value;
  pins.value = atlas.places.map(place => {
    if (!camera || webglError.value) {
      return { id: place.id,
        left: ((place.x - bounds.minX) / (bounds.maxX - bounds.minX)) * width,
        top: ((place.z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * height,
        visible: true };
    }
    const point = new Vector3(place.x, place.y, place.z).project(camera);
    const x = (point.x + 1) * width / 2;
    const y = (1 - point.y) * height / 2;
    return { id: place.id, left: x, top: y,
      visible: point.z >= -1 && point.z <= 1 && x >= 0 && x <= width && y >= 0 && y <= height };
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
        <div ref="stage" class="bj-stage" :class="{ 'bj-fallback': !!webglError }">
          <canvas ref="canvas" class="bj-canvas" aria-label="北京三维城市模型" @contextmenu.prevent @wheel.prevent="onWheel" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up" />
          <div class="bj-pin-layer">
            <button v-for="pin in pins.filter(p => p.visible)" :key="pin.id" type="button" class="bj-pin" :class="{ selected: pin.id === selectedId, here: pin.id === locationId }"
              :style="{ left: pin.left + 'px', top: pin.top + 'px' }" :title="atlas.places.find(p => p.id === pin.id)?.name" :aria-label="'选择' + atlas.places.find(p => p.id === pin.id)?.name" @click="select(pin.id)">
              <span aria-hidden="true">{{ pin.id === locationId ? '●' : '•' }}</span>
              <b v-if="pin.id === selectedId || zoom >= 2.5">{{ atlas.places.find(p => p.id === pin.id)?.name }}</b>
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

<style scoped>
.bj-sandbox { color:#e8e9e9; background:linear-gradient(150deg,#0e1727,#222c38); padding:clamp(10px,2vw,22px); border-radius:16px; width:100%; box-sizing:border-box; }
.bj-heading { display:flex; gap:18px; justify-content:space-between; align-items:flex-start; margin-bottom:14px; }
.bj-heading h2 { font-size:clamp(20px,2vw,29px); margin:2px 0 5px; }
.bj-heading p,.bj-muted,.bj-disclaimer { color:#b5c1c7; font-size:12px; }
.bj-heading small,.bj-eyebrow { color:#91bdd4; letter-spacing:.1em; }
.bj-heading-actions { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.bj-sandbox button { font:inherit; cursor:pointer; background:#27394a; border:1px solid #456078; color:inherit; border-radius:8px; padding:7px 10px; }
.bj-sandbox button:disabled { opacity:.48; cursor:not-allowed; }
.bj-sandbox button:hover:not(:disabled),.bj-sandbox button.active { background:#34536b; }
.bj-layout { display:grid; grid-template-columns:minmax(0,1fr) minmax(220px,300px); gap:14px; }
.bj-visual { min-width:0; }
.bj-control-row,.bj-tools { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:8px; }
.bj-tools { margin:8px 0 0; }
.bj-control-row button,.bj-tools button { padding:6px 9px; font-size:11px; }
.bj-stage { position:relative; width:100%; height:clamp(330px,54vh,680px); background:#b6cbd3; border:1px solid #4b697a; border-radius:11px; overflow:hidden; }
.bj-stage.bj-fallback { background:linear-gradient(130deg,#e2d9bd,#9eb4b1); }
.bj-canvas { display:block; width:100%; height:100%; touch-action:none; }
.bj-pin-layer { position:absolute; inset:0; pointer-events:none; }
.bj-pin { position:absolute; display:flex; align-items:center; gap:3px; transform:translate(-50%,-50%); font-size:10px!important; border:1px solid #fff9!important; padding:2px 5px!important; white-space:nowrap; background:#243549d9!important; pointer-events:auto; box-shadow:0 1px 4px #0009; }
.bj-pin span { color:#b6efff; }
.bj-pin.here { background:#a93845!important; }
.bj-pin.selected { z-index:8; background:#1b6681!important; border-color:#fff!important; }
.bj-pin b { font-size:10px; font-weight:500; }
.bj-stage-note { position:absolute; bottom:6px; left:8px; pointer-events:none; color:#fff; background:#17212acc; padding:4px 7px; border-radius:5px; font-size:10px; }
.bj-fallback-hint { position:absolute; top:8px; left:8px; right:8px; background:#422c2ade; color:white; padding:6px; font-size:12px; }
.bj-panel { padding:10px; border:1px solid #465867; border-radius:11px; min-width:0; background:#1b2937; }
.bj-panel h3 { font-size:20px; margin:3px 0; }
.bj-panel p { font-size:13px; line-height:1.55; }
.bj-route-note { padding:8px 10px; border-left:3px solid #739fb3; background:#273847; }
.bj-sandbox button.bj-go { width:100%; background:#206276; font-weight:700; }
.bj-search { display:flex; flex-direction:column; gap:5px; font-size:12px; margin:12px 0; }
.bj-search input { background:#0f1e2c; border:1px solid #526979; color:#e8e9e9; border-radius:6px; padding:8px; width:100%; box-sizing:border-box; }
.bj-place-list { display:flex; flex-direction:column; gap:4px; max-height:260px; overflow:auto; }
.bj-place-list button { display:flex; justify-content:space-between; text-align:left; font-size:12px; }
.bj-place-list button[aria-pressed="true"] { border-color:#a4c6d4; background:#31576f; }
.bj-place-list small { font-size:10px; color:#c4d3d9; }
.bj-route-list { margin-top:13px; display:flex; gap:4px; flex-direction:column; }
.bj-route-list h4 { margin:0 0 4px; font-size:12px; }
.bj-route-list button { text-align:left; font-size:11px; }
.bj-disclaimer { margin-top:15px; }
@media(max-width:750px){ .bj-heading {flex-direction:column;} .bj-layout {grid-template-columns:minmax(0,1fr);} .bj-stage {height:min(65vh,530px); min-height:320px;} .bj-place-list {max-height:210px;} }
</style>
