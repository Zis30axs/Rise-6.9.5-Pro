<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { streetRoutes, createCampusWorld, sceneHotspots, type SceneAction } from './scene-world';

const props = withDefaults(defineProps<{ locationId: string; hour: number; paused?: boolean }>(), { paused: false });
const emit = defineEmits<{ hotspot: [action: SceneAction] }>();
const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const mode = ref<'webgl' | 'fallback'>('fallback');
const dragging = ref(false);
const view = ref('0.000,-0.120');
const nodeIndex = ref(0);
const moving = ref(false);
const route = computed(() => streetRoutes[props.locationId] ?? streetRoutes.gate);
const currentNode = computed(() => route.value[nodeIndex.value] ?? route.value[0]);
const nextNode = computed(() => route.value[nodeIndex.value + 1]);
const projected = ref(sceneHotspots.map((spot) => ({ x: spot.fallback[0], y: spot.fallback[1], visible: true })));
const isNight = computed(() => props.hour < 6 || props.hour >= 20);
let win: Window & typeof globalThis;
let doc: Document;
let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let campus: ReturnType<typeof createCampusWorld> | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let resizeObserver: ResizeObserver | undefined;
let intersectionObserver: IntersectionObserver | undefined;
let frame = 0;
let dead = false;
let inView = true;
let width = 0;
let height = 0;
let yaw = 0;
let pitch = -0.12;
let eye = new THREE.Vector3(0, 1.7, 18);
const direction = new THREE.Vector3();
let travel: { from: THREE.Vector3; to: THREE.Vector3; started: number; duration: number; startYaw: number; endYaw: number } | undefined;
let lastFrameAt = 0;
const walkProjected = ref({ x: 50, y: 68, visible: true });
let pointer: { id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean } | undefined;
const raycaster = new THREE.Raycaster();
const rayPointer = new THREE.Vector2();
const projectedPoint = new THREE.Vector3();
const cleanupEvents: (() => void)[] = [];

function listen(target: EventTarget, event: string, callback: EventListener, options?: AddEventListenerOptions) {
  target.addEventListener(event, callback, options);
  cleanupEvents.push(() => target.removeEventListener(event, callback, options));
}
function updateCamera() {
  if (!camera) return;
  camera.position.copy(eye);
  direction.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  camera.lookAt(direction.add(eye));
  camera.updateMatrixWorld();
  view.value = `${yaw.toFixed(3)},${pitch.toFixed(3)}`;
}
function resetView() {
  travel = undefined; moving.value = false;
  const node = currentNode.value;
  yaw = node.yaw; pitch = -0.12; eye.set(...node.position);
  campus?.setWalkTarget(nextNode.value?.position, node.yaw);
  updateCamera();
  requestRender();
}
function render(now = 0) {
  frame = 0;
  if (dead || !renderer || !scene || !camera || !inView || doc.hidden || width < 1 || height < 1) return;
  if (travel && now - lastFrameAt < 32) { requestRender(); return; }
  lastFrameAt = now;
  if (travel) {
    const fraction = Math.min(1, Math.max(0, (now - travel.started) / travel.duration));
    const smooth = fraction * fraction * (3 - 2 * fraction);
    eye.lerpVectors(travel.from, travel.to, smooth);
    yaw = THREE.MathUtils.lerp(travel.startYaw, travel.endYaw, smooth);
    updateCamera();
    if (fraction === 1) { travel = undefined; moving.value = false; }
  }
  try {
    renderer.render(scene, camera);
    const labels: { x: number; y: number; visible: boolean }[] = [];
    projected.value = sceneHotspots.map((spot) => {
      projectedPoint.copy(spot.position).project(camera!);
      const x = (projectedPoint.x + 1) * 50;
      const y = (1 - projectedPoint.y) * 50;
      const edge = width < 650 ? 18 : 7;
      const label = { x: THREE.MathUtils.clamp(x, edge, 100 - edge), y, visible: projectedPoint.z >= -1 && projectedPoint.z <= 1 && x > 0 && x < 100 && y > 14 && y < 86 };
      if (label.visible) {
        for (const previous of labels) {
          if (previous.visible && Math.abs(previous.x - label.x) * width / 100 < 122 && Math.abs(previous.y - label.y) * height / 100 < 39) label.y = previous.y - 44 / height * 100;
        }
      }
      labels.push(label);
      return label;
    });
    if (nextNode.value) {
      projectedPoint.set(nextNode.value.position[0], 0.12, nextNode.value.position[2]).project(camera);
      walkProjected.value = { x: (projectedPoint.x + 1) * 50, y: (1 - projectedPoint.y) * 50, visible: projectedPoint.z >= -1 && projectedPoint.z <= 1 && Math.abs(projectedPoint.x) < 0.85 && Math.abs(projectedPoint.y) < 0.85 };
    }
    if (travel) requestRender();
  } catch {
    useFallback();
  }
}
function requestRender() {
  if (!dead && renderer && !frame && !props.paused && inView && !doc.hidden) frame = win.requestAnimationFrame(render);
}
function resize() {
  if (!root.value || !renderer || !camera || dead || props.paused) return;
  const bounds = root.value.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) return;
  const w = Math.round(bounds.width); const h = Math.round(bounds.height);
  if (w === width && h === height) return;
  width = w; height = h;
  renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, 1.65));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  // Keep a wide courtyard on small screens without an excessively distorted lens.
  camera.fov = width < 650 ? 77 : 68;
  camera.updateProjectionMatrix();
  requestRender();
}
function releaseGraphics() {
  if (frame) { win.cancelAnimationFrame(frame); frame = 0; }
  campus?.dispose(); campus = undefined;
  renderer?.dispose(); renderer = undefined;
  scene?.clear(); scene = undefined; camera = undefined;
}
function useFallback() {
  mode.value = 'fallback';
  dragging.value = false; pointer = undefined; travel = undefined; moving.value = false;
  releaseGraphics();
  projected.value = sceneHotspots.map((spot) => ({ x: spot.fallback[0], y: spot.fallback[1], visible: true }));
}
function initialize() {
  if (dead || !canvas.value || renderer) return;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(68, 1, 0.1, 180);
    campus = createCampusWorld(scene);
    campus.setTime(props.hour, props.locationId);
    mode.value = 'webgl';
    width = height = 0;
    resetView(); resize();
  } catch {
    useFallback();
  }
}
function rotate(dx: number, dy: number) {
  if (moving.value) return;
  yaw = THREE.MathUtils.euclideanModulo(yaw + dx + Math.PI, Math.PI * 2) - Math.PI;
  pitch = THREE.MathUtils.clamp(pitch + dy, -0.52, 0.44);
  updateCamera(); requestRender();
}
function pointerDown(event: PointerEvent) {
  if (props.paused || mode.value !== 'webgl' || event.button !== 0 || !canvas.value) return;
  canvas.value.focus({ preventScroll: true });
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
  try { canvas.value.setPointerCapture(event.pointerId); } catch { /* Capture can disappear during host teardown. */ }
}
function pointerMove(event: PointerEvent) {
  if (props.paused || !pointer || pointer.id !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
  if (distance > 6) pointer.moved = true;
  if (pointer.moved) { dragging.value = true; rotate((pointer.lastX - event.clientX) * 0.0034, (event.clientY - pointer.lastY) * 0.0023); }
  pointer.lastX = event.clientX; pointer.lastY = event.clientY;
}
function pointerUp(event: PointerEvent) {
  if (!pointer || pointer.id !== event.pointerId) return;
  const moved = pointer.moved;
  pointer = undefined; dragging.value = false;
  try { canvas.value?.releasePointerCapture(event.pointerId); } catch { /* Already released by the browser. */ }
  if (moved || props.paused || !canvas.value || !camera || !campus) return;
  const rect = canvas.value.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  rayPointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(rayPointer, camera);
  const hit = raycaster.intersectObjects(campus.pickables, true)[0];
  let object: THREE.Object3D | null = hit?.object ?? null;
  while (object && !object.userData.sceneAction && !object.userData.sceneWalk) object = object.parent;
  if (object?.userData.sceneWalk) { moveTo(nodeIndex.value + 1); return; }
  const action = object?.userData.sceneAction;
  if (sceneHotspots.some((spot) => spot.action === action)) emit('hotspot', action as SceneAction);
}
function cancelPointer() { pointer = undefined; dragging.value = false; }
function keydown(event: KeyboardEvent) {
  if (props.paused || mode.value !== 'webgl') return;
  const directions: Record<string, [number, number]> = { ArrowLeft: [-0.06, 0], ArrowRight: [0.06, 0], ArrowUp: [0, -0.03], ArrowDown: [0, 0.03] };
  const delta = directions[event.key];
  if (!delta) return;
  event.preventDefault(); event.stopPropagation(); rotate(...delta);
}
function select(action: SceneAction) { if (!props.paused) emit('hotspot', action); }
function moveTo(index: number) {
  if (props.paused || moving.value || index < 0 || index >= route.value.length || index === nodeIndex.value) return;
  const node = route.value[index];
  nodeIndex.value = index;
  if (mode.value === 'fallback' || win.matchMedia('(prefers-reduced-motion: reduce)').matches) { resetView(); return; }
  moving.value = true;
  // Fixed viewpoint nodes are presentation only. World travel still belongs to the map action.
  const deltaYaw = THREE.MathUtils.euclideanModulo(node.yaw - yaw + Math.PI, Math.PI * 2) - Math.PI;
  travel = { from: eye.clone(), to: new THREE.Vector3(...node.position), started: win.performance.now(), duration: 700, startYaw: yaw, endYaw: yaw + deltaYaw };
  campus?.setWalkTarget(nextNode.value?.position, node.yaw);
  requestRender();
}

watch(() => props.locationId, () => { nodeIndex.value = 0; campus?.setTime(props.hour, props.locationId); resetView(); });
watch(() => props.hour, () => { campus?.setTime(props.hour, props.locationId); requestRender(); });
watch(() => props.paused, (paused) => { cancelPointer(); if (paused) { if (frame) { win.cancelAnimationFrame(frame); frame = 0; } if (travel) { travel = undefined; moving.value = false; resetView(); } } else { resize(); requestRender(); } });

onMounted(() => {
  if (!root.value || !canvas.value) return;
  doc = root.value.ownerDocument;
  const ownerWindow = doc.defaultView;
  if (!ownerWindow) return;
  win = ownerWindow;
  // Tavern-Helper can adopt Vue-created elements into its parent document. Observe and schedule in the owner realm.
  if (win.ResizeObserver) { resizeObserver = new win.ResizeObserver(resize); resizeObserver.observe(root.value); }
  if (win.IntersectionObserver) {
    intersectionObserver = new win.IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? true;
      if (!inView && frame) { win.cancelAnimationFrame(frame); frame = 0; }
      if (inView) { resize(); requestRender(); }
    });
    intersectionObserver.observe(root.value);
  }
  listen(win, 'resize', resize);
  listen(doc, 'visibilitychange', () => { if (doc.hidden && frame) { win.cancelAnimationFrame(frame); frame = 0; } else { resize(); requestRender(); } });
  listen(canvas.value, 'webglcontextlost', (event) => { event.preventDefault(); useFallback(); });
  initialize();
});
onBeforeUnmount(() => {
  dead = true; cancelPointer();
  resizeObserver?.disconnect(); intersectionObserver?.disconnect();
  cleanupEvents.splice(0).forEach((cleanup) => cleanup());
  const graphics = renderer;
  releaseGraphics();
  // dispose releases renderer resources; explicitly retire this canvas context
  // as well so repeated character-script mounts do not exhaust browser limits.
  graphics?.forceContextLoss();
});
</script>

<template>
  <div ref="root" class="interactive-campus" :class="{ 'is-night': isNight, 'is-paused': paused, 'is-dragging': dragging }" data-unread-city-scene :data-renderer="mode" :data-view="view" :data-scene-node="`${locationId}:${nodeIndex}`">
    <svg class="campus-fallback" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="uc-scene-sky" x2="0" y2="1"><stop stop-color="#a5b5b1"/><stop offset=".58" stop-color="#f0d8b5"/><stop offset="1" stop-color="#d4c6a7"/></linearGradient>
        <linearGradient id="uc-scene-ground" x2="0" y2="1"><stop stop-color="#8c9b78"/><stop offset="1" stop-color="#506b54"/></linearGradient>
        <linearGradient id="uc-scene-path" x2="0" y2="1"><stop stop-color="#c1b49b"/><stop offset="1" stop-color="#e5d8bb"/></linearGradient>
        <pattern id="uc-scene-windows" width="80" height="90" patternUnits="userSpaceOnUse"><rect width="80" height="90" fill="#bdaf96"/><rect x="22" y="14" width="34" height="58" fill="#f0d3a0"/><path d="M39 14v58M22 43h34" stroke="#908e79" stroke-width="3"/></pattern>
      </defs>
      <path fill="url(#uc-scene-sky)" d="M0 0h1600v1000H0z"/>
      <circle cx="280" cy="245" r="73" fill="#ffe9bf" opacity=".7"/>
      <path d="M0 390h110v-65h100v90h120v-105h90v95h110v-80h140v95h95v-110h130v100h130v-55h110v65h120v-120h100v80h180v160H0Z" fill="#9aa595" opacity=".45"/>
      <path fill="url(#uc-scene-ground)" d="M0 545h1600v455H0z"/>
      <path d="M350 300h900v330H350z" fill="url(#uc-scene-windows)"/>
      <path d="M330 283h940v23H330zM340 388h920v12H340zM340 480h920v12H340zM330 610h940v22H330z" fill="#e6d7b9"/>
      <path d="M115 200h215v490H115zM1270 325h215v350h-215z" fill="url(#uc-scene-windows)"/>
      <path d="M100 185h245v22H100zM1255 310h245v22h-245z" fill="#e5d6b7"/>
      <path d="M715 462h170v168H715z" fill="#52665d"/><path d="M700 451h200v22H700zM690 628h220v18H690zM680 646h240v15H680z" fill="#e6d9bd"/>
      <path d="M758 656h86l275 344H445z" fill="url(#uc-scene-path)"/><path d="M0 665l1600-12v53L0 729z" fill="#bfb69a"/>
      <g fill="#365344" opacity=".17"><ellipse cx="200" cy="758" rx="170" ry="28"/><ellipse cx="1390" cy="758" rx="170" ry="28"/></g>
      <g fill="#7b6749"><path d="M175 355h25v405h-25zM1378 365h25v390h-25zM360 440h16v230h-16zM1178 450h16v225h-16z"/></g>
      <g fill="#627951"><circle cx="160" cy="330" r="120"/><circle cx="225" cy="385" r="107"/><circle cx="85" cy="422" r="104"/><circle cx="1400" cy="355" r="125"/><circle cx="1480" cy="425" r="107"/><circle cx="1310" cy="420" r="95"/></g>
      <g fill="#8c9662"><circle cx="183" cy="280" r="90"/><circle cx="1375" cy="300" r="82"/><circle cx="352" cy="455" r="73"/><circle cx="1200" cy="465" r="73"/></g>
      <g fill="#906e49"><path d="M1110 725h195v14h-195zM1110 750h195v14h-195zM1105 779h205v17h-205z"/></g><path d="M1130 792v55m150-55v55M1125 741v50m155-50v50" stroke="#3d5144" stroke-width="9"/>
      <path d="M520 535v216" stroke="#4d5949" stroke-width="9"/><path d="M470 556h132v29H470zM446 602h132v29H446z" fill="#747955"/>
      <path d="M340 600h170v95H340z" fill="#93724e"/><path d="M350 611h150v70H350z" fill="#61745b"/><path d="M367 620h35v45h-35zM414 625h33v45h-33zM457 618h31v44h-31z" fill="#e6d9b8"/>
      <g stroke="#465a4a" stroke-width="8"><path d="M590 608v194m445-212v187"/></g><g fill="#ffdea0"><path d="M576 601h28v36h-28zM1021 583h28v36h-28z"/></g>
    </svg>
    <canvas ref="canvas" class="campus-canvas" :class="{ 'is-visible': mode === 'webgl' }" aria-label="可交互三维场景" :tabindex="paused || mode !== 'webgl' ? -1 : 0" aria-describedby="uc-scene-help" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="cancelPointer" @lostpointercapture="cancelPointer" @keydown="keydown" />
    <div class="campus-atmosphere" aria-hidden="true" />
    <div class="campus-tools" v-show="!paused">
      <span id="uc-scene-help">{{ mode === 'webgl' ? '拖动环视 · 点击路标前行' : '静态场景 · 仍可点击探索' }}</span>
      <button v-if="mode === 'webgl'" type="button" aria-label="重置场景视角" @click="resetView"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1.7 7.1M4 4v6h6"/></svg><span>复位</span></button>
      <button v-else type="button" aria-label="重试三维场景" @click="initialize">重试 3D</button>
    </div>
    <div class="campus-street-nav" v-show="!paused" aria-label="街景观察位置">
      <span class="campus-node-name"><i aria-hidden="true"/>{{ currentNode.label }}<small>局部漫游</small></span>
      <div><button type="button" aria-label="返回上个位置" :disabled="nodeIndex === 0 || moving" @click="moveTo(nodeIndex - 1)">← 返回</button><button type="button" aria-label="向前走" :disabled="!nextNode || moving" @click="moveTo(nodeIndex + 1)">{{ moving ? '移动中…' : nextNode ? `前往${nextNode.label} →` : '已到步道尽头' }}</button></div>
    </div>
    <button v-if="nextNode && !paused && !moving" v-show="mode === 'fallback' || walkProjected.visible" type="button" class="campus-walk-arrow" :style="{ left: `${mode === 'fallback' ? 50 : walkProjected.x}%`, top: `${mode === 'fallback' ? 63 : walkProjected.y}%` }" :aria-label="`沿步道前往${nextNode.label}`" @click="moveTo(nodeIndex + 1)"><span aria-hidden="true">⌃</span><small>{{ nextNode.label }}</small></button>
    <div class="campus-hotspots" v-show="!paused" aria-label="场景探索热点">
      <button v-for="(spot, index) in sceneHotspots" v-show="projected[index]?.visible" :key="spot.action" type="button" class="campus-hotspot" :data-hotspot="spot.action" :aria-label="spot.label" :style="{ left: `${projected[index]?.x}%`, top: `${projected[index]?.y}%` }" @click.stop="select(spot.action)"><i aria-hidden="true"/><span>{{ spot.label }}</span></button>
    </div>
    <span class="campus-credit">交互场景草图 · {{ mode === 'webgl' ? '3D' : '静态' }}</span>
  </div>
</template>
