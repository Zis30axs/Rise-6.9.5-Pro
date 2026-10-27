<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { getCampusInterior, getInteriorMovementWorld, getMlmWorkBlockedReason, isStudyInteraction, INTERIOR_INTERACTION_RANGE } from '../runtime/campus-interiors';
import { createInteriorWorld } from './scene-interior';
import { isScenePositionWalkable, moveScenePosition } from './scene-movement';
import { applyCharacterCamera, createCharacterAssetPool, createScenePlayerCharacter, type CharacterCameraMode, type CharacterModelStatus, type CharacterSnapshot } from './scene-character-assets';
import { loadBundledCharacter } from './scene-character-bundle';
import type { ProtagonistId } from '../runtime/dual-protagonists';
import { protagonistNames } from '../runtime/protagonist-world';

interface InteriorPresence { roomId: string; x: number; z: number; yaw: number; activityId: string | null }
const props = withDefaults(defineProps<{ interior: InteriorPresence; hour: number; paused?: boolean; freeWalk?: boolean; busy?: boolean; protagonist?: ProtagonistId; phoneActive?: boolean; stress?: number }>(), { paused: false, freeWalk: false, busy: false, protagonist: 'soyo', phoneActive: false });
const emit = defineEmits<{ presence: [point: { x: number; z: number; yaw: number }]; interact: [interactionId: string]; leave: [] }>();
const room = computed(() => getCampusInterior(props.interior.roomId)!);
const root = ref<HTMLElement>(), canvas = ref<HTMLCanvasElement>(), joystick = ref<HTMLElement>();
const mode = ref<'webgl' | 'fallback'>('fallback');
const cameraMode = ref<CharacterCameraMode>('third-person');
const characterSnapshot = ref<CharacterSnapshot>({ status: 'idle', modelIds: [], instanceCount: 0 });
const playerStatus = ref<CharacterModelStatus>('idle');
const objectsOpen = ref(false), view = ref('0.000,-0.080'), position = ref('0.000,1.700,3.800');
const point = computed(() => { const [x, , z] = position.value.split(',').map(Number); return { x, z }; });
const objects = computed(() => room.value.interactions.map(item => ({ ...item, distance: Math.hypot(item.x - point.value.x, item.z - point.value.z), blockedReason: getMlmWorkBlockedReason(item, props.stress ?? 0) })));

const projected = ref<Record<string, { x: number; y: number; visible: boolean }>>({});
const stick = ref({ x: 0, y: 0 });
let win: Window & typeof globalThis, doc: Document;
let renderer: THREE.WebGLRenderer | undefined, scene: THREE.Scene | undefined, camera: THREE.PerspectiveCamera | undefined;
let world: ReturnType<typeof createInteriorWorld> | undefined;
let characterPool: ReturnType<typeof createCharacterAssetPool> | undefined;
let playerCharacter: ReturnType<typeof createScenePlayerCharacter> | undefined;
let resizeObserver: ResizeObserver | undefined, intersectionObserver: IntersectionObserver | undefined;
let frame = 0, width = 0, height = 0, inView = true, dead = false, lastWalkAt = 0;
let reducedMotion = false;
let yaw = 0, pitch = -0.08;
const eye = new THREE.Vector3(0, 1.7, 3.8), projection = new THREE.Vector3();
const keys = new Set<string>(), cleanup: (() => void)[] = [];
let pointer: { id: number; target: HTMLElement; x: number; y: number } | undefined;
let stickPointer: { id: number; target: HTMLElement; x: number; y: number; radius: number } | undefined;
let presenceDirty = false, lastPresenceAt = -Infinity, lastPresenceKey = '';
const acknowledged: { x: number; z: number; yaw: number }[] = [];
function listen(target: EventTarget, name: string, callback: EventListener) { target.addEventListener(name, callback); cleanup.push(() => target.removeEventListener(name, callback)); }
function flushPresence(force = true) {
  if (!presenceDirty || !win) return;
  const now = win.performance.now(); if (!force && now - lastPresenceAt < 750) return;
  const rounded = { x: Number(eye.x.toFixed(3)), z: Number(eye.z.toFixed(3)) };
  // Rounding a swept point at a furniture corner must not move the saved point into it.
  const validRounded = isScenePositionWalkable(rounded.x, rounded.z, getInteriorMovementWorld(room.value));
  const next = { x: validRounded ? rounded.x : eye.x, z: validRounded ? rounded.z : eye.z, yaw: Number(yaw.toFixed(3)) };
  const key = `${next.x},${next.z},${next.yaw}`; presenceDirty = false;
  if (key === lastPresenceKey) return;
  lastPresenceAt = now; lastPresenceKey = key; acknowledged.push(next); if (acknowledged.length > 8) acknowledged.shift(); emit('presence', next);
}
function updateCamera() {
  position.value = `${eye.x.toFixed(3)},1.700,${eye.z.toFixed(3)}`; view.value = `${yaw.toFixed(3)},${pitch.toFixed(3)}`;
  if (!camera) return;
  const showPlayer = props.protagonist === 'soyo' && (props.phoneActive || cameraMode.value === 'third-person');
  playerCharacter?.setPhoneActive(props.phoneActive);
  const displayYaw = world ? applyCharacterCamera(camera, eye, yaw, pitch, world.movementWorld, cameraMode.value, props.phoneActive, width, height, 2.6) : yaw;
  playerCharacter?.update(eye, displayYaw, showPlayer);
}
function toggleCamera() {
  if (props.phoneActive || props.busy || props.paused) return;
  cameraMode.value = cameraMode.value === 'third-person' ? 'first-person' : 'third-person';
  updateCamera(); requestRender();
}
function releasePointer() { const previous = pointer; pointer = undefined; if (previous) try { previous.target.releasePointerCapture(previous.id); } catch { /* Already released during host teardown. */ } }
function releaseStick() { const previous = stickPointer; stickPointer = undefined; stick.value = { x: 0, y: 0 }; if (previous) try { previous.target.releasePointerCapture(previous.id); } catch { /* Browser may have cancelled the gesture. */ } }
function stop() { keys.clear(); releaseStick(); releasePointer(); lastWalkAt = 0; flushPresence(); }
function hasInput() { return !props.phoneActive && props.freeWalk && !props.paused && !props.busy && mode.value === 'webgl' && (keys.size > 0 || stick.value.x !== 0 || stick.value.y !== 0); }
function requestRender() { if (!dead && !frame && renderer && !props.paused && inView && !doc.hidden) frame = win.requestAnimationFrame(render); }
function render(now: number) {
  frame = 0; if (dead || !renderer || !scene || !camera || !world || props.paused || doc.hidden || !inView) return;
  let playerMoving = false;
  if (hasInput()) {
    const elapsed = lastWalkAt ? (now - lastWalkAt) / 1000 : 0; lastWalkAt = now;
    const next = moveScenePosition(eye, { forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')) - stick.value.y, strafe: Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + stick.value.x }, yaw, elapsed, world.movementWorld);
    if (Math.hypot(next.x - eye.x, next.z - eye.z) > 0.00001) { presenceDirty = true; playerMoving = true; }
    eye.set(next.x, 1.7, next.z); updateCamera(); flushPresence(false);
  } else lastWalkAt = 0;
  try {
    playerCharacter?.animate(now, playerMoving && !reducedMotion);
    renderer.render(scene, camera);
    projected.value = Object.fromEntries(objects.value.map(item => {
      projection.set(item.x, 1.1, item.z).project(camera!);
      const x = (projection.x + 1) * 50, y = (1 - projection.y) * 50;
      return [item.id, { x, y, visible: item.distance <= INTERIOR_INTERACTION_RANGE && projection.z >= -1 && projection.z <= 1 && x > 12 && x < 88 && y * height / 100 > 180 && y * height / 100 < height - 245 }];
    }));
    if (hasInput()) requestRender();
  } catch { useFallback(); }
}
function resize() {
  if (!root.value || !renderer || !camera || props.paused) return;
  const rect = root.value.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return;
  width = Math.round(rect.width); height = Math.round(rect.height);
  renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, 1.65)); renderer.setSize(width, height, false); camera.aspect = width / height; camera.fov = width < 650 ? 77 : 68; updateCamera(); requestRender();
}
function disposeGraphics() {
  if (frame) { win.cancelAnimationFrame(frame); frame = 0; }
  playerCharacter?.dispose(); playerCharacter = undefined; characterPool?.dispose(); characterPool = undefined;
  playerStatus.value = 'idle'; characterSnapshot.value = { status: 'idle', modelIds: [], instanceCount: 0 };
  world?.dispose(); world = undefined; const previous = renderer; renderer = undefined; previous?.dispose(); if (dead) previous?.forceContextLoss(); scene?.clear(); scene = undefined; camera = undefined;
}
function useFallback() { stop(); mode.value = 'fallback'; objectsOpen.value = true; disposeGraphics(); }
function restorePresence() {
  stop(); const saved = props.interior, movement = getInteriorMovementWorld(room.value);
  const valid = isScenePositionWalkable(saved.x, saved.z, movement), point = valid ? saved : room.value.spawn;
  eye.set(point.x, 1.7, point.z); yaw = Number.isFinite(point.yaw) ? point.yaw : room.value.spawn.yaw; pitch = -0.08;
  presenceDirty = false; lastPresenceKey = `${Number(eye.x.toFixed(3))},${Number(eye.z.toFixed(3))},${Number(yaw.toFixed(3))}`; updateCamera(); requestRender();
}
function initialize() {
  if (dead || !canvas.value || renderer || !room.value) return;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, alpha: false, antialias: true, powerPreference: 'low-power' }); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; renderer.setClearColor(0xe6ddc9);
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(68, 1, 0.08, 50); world = createInteriorWorld(scene, room.value, doc);
    characterPool = createCharacterAssetPool({ loadModel: loadBundledCharacter, changed(snapshot) { characterSnapshot.value = snapshot; requestRender(); } });
    playerCharacter = createScenePlayerCharacter(scene, characterPool, status => { playerStatus.value = status; requestRender(); });
    world.setTime(props.hour); mode.value = 'webgl'; restorePresence(); resize();
  } catch { useFallback(); }
}
function focus() { canvas.value?.focus({ preventScroll: true }); }
// Indoor camera bridges use the outdoor entrance on the city board, avoiding
// a camera path through an opaque ceiling. Draw a stable room frame beneath it.
function setSwitchCamera(_lift: number) {
  if (dead || !renderer || !scene || !camera) return false;
  resize(); updateCamera();
  try { renderer.render(scene, camera); return true; } catch { useFallback(); return false; }
}
function clearSwitchCamera() { if (!dead) { updateCamera(); requestRender(); } }
function presentationReady() { return mode.value === 'fallback' || !!renderer && width > 0 && height > 0; }
defineExpose({ focus, flushPresence, setSwitchCamera, clearSwitchCamera, presentationReady });
function rotate(dx: number, dy: number) {
  if (props.phoneActive || props.paused || props.busy || mode.value !== 'webgl') return;
  yaw = THREE.MathUtils.euclideanModulo(yaw + dx + Math.PI, Math.PI * 2) - Math.PI; pitch = THREE.MathUtils.clamp(pitch + dy, -0.6, 0.5); presenceDirty = true; updateCamera(); requestRender();
}
function pointerDown(event: PointerEvent) {
  if (props.phoneActive || props.paused || props.busy || mode.value !== 'webgl' || event.button !== 0 || pointer) return;
  const target = event.currentTarget as HTMLElement; focus(); pointer = { id: event.pointerId, target, x: event.clientX, y: event.clientY }; try { target.setPointerCapture(event.pointerId); } catch { /* Cancelled pointer capture is harmless. */ }
}
function pointerMove(event: PointerEvent) {
  if (!pointer || event.pointerId !== pointer.id) return;
  rotate((pointer.x - event.clientX) * 0.0034, (event.clientY - pointer.y) * 0.0023); pointer.x = event.clientX; pointer.y = event.clientY;
}
function pointerEnd(event: PointerEvent) { if (event.pointerId === pointer?.id) { releasePointer(); flushPresence(); } }
function stickDown(event: PointerEvent) {
  if (props.phoneActive || !props.freeWalk || props.paused || props.busy || mode.value !== 'webgl' || event.button !== 0 || stickPointer || !joystick.value) return;
  const target = joystick.value, rect = target.getBoundingClientRect(); stickPointer = { id: event.pointerId, target, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: rect.width / 2 - 21 }; target.focus({ preventScroll: true }); try { target.setPointerCapture(event.pointerId); } catch { /* Browser may cancel on window switch. */ } event.preventDefault(); stickMove(event);
}
function stickMove(event: PointerEvent) {
  if (!stickPointer || event.pointerId !== stickPointer.id) return; event.preventDefault();
  const x = (event.clientX - stickPointer.x) / stickPointer.radius, y = (event.clientY - stickPointer.y) / stickPointer.radius, length = Math.hypot(x, y);
  stick.value = length < 0.12 ? { x: 0, y: 0 } : { x: x / Math.max(1, length), y: y / Math.max(1, length) }; requestRender();
}
function stickEnd(event: PointerEvent) { if (event.pointerId === stickPointer?.id) { releaseStick(); flushPresence(); } }
function keydown(event: KeyboardEvent) {
  if (props.phoneActive || props.paused || props.busy || mode.value !== 'webgl' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (props.freeWalk && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) { event.preventDefault(); event.stopPropagation(); keys.add(event.code); requestRender(); return; }
  const deltas: Record<string, [number, number]> = { ArrowLeft: [-0.06, 0], ArrowRight: [0.06, 0], ArrowUp: [0, -0.03], ArrowDown: [0, 0.03] }; const delta = deltas[event.key];
  if (delta) { event.preventDefault(); event.stopPropagation(); rotate(...delta); }
}
function keyup(event: KeyboardEvent) { keys.delete(event.code); flushPresence(); }
function keyboardBlur() { keys.clear(); lastWalkAt = 0; flushPresence(); }
function interact(id: string) {
  if (props.phoneActive || props.paused || props.busy) return;
  const item = objects.value.find(item => item.id === id); if (!item || item.distance > INTERIOR_INTERACTION_RANGE || item.blockedReason) return;
  stop(); objectsOpen.value = false; emit('interact', id);
}
function approach(id: string) {
  if (props.phoneActive || mode.value !== 'fallback' || props.paused || props.busy) return;
  const item = room.value.interactions.find(item => item.id === id); if (!item || !isScenePositionWalkable(item.x, item.z, getInteriorMovementWorld(room.value))) return;
  eye.set(item.x, 1.7, item.z); presenceDirty = true; updateCamera(); flushPresence();
}
function leave() { if (!props.phoneActive && !props.paused && !props.busy) { stop(); emit('leave'); } }
watch(() => props.interior, (next, previous) => {
  if (!previous || next.roomId !== previous.roomId) { stop(); disposeGraphics(); acknowledged.length = 0; restorePresence(); initialize(); return; }
  if (acknowledged.some(item => Math.abs(item.x - next.x) < 0.15 && Math.abs(item.z - next.z) < 0.15 && Math.abs(item.yaw - next.yaw) < 0.002)) return;
  if (Math.abs(previous.x - next.x) < 0.001 && Math.abs(previous.z - next.z) < 0.001 && Math.abs(previous.yaw - next.yaw) < 0.001) return;
  restorePresence();
});
watch(() => props.phoneActive, () => { stop(); updateCamera(); requestRender(); });
watch(() => props.hour, hour => { world?.setTime(hour); requestRender(); });
watch([() => props.paused, () => props.busy, () => props.freeWalk], () => { stop(); if (props.paused && frame) { win.cancelAnimationFrame(frame); frame = 0; } else { resize(); requestRender(); } });
onMounted(() => {
  if (!root.value || !canvas.value) return; doc = root.value.ownerDocument; const owner = doc.defaultView; if (!owner) return; win = owner;
  const motionPreference = win.matchMedia('(prefers-reduced-motion: reduce)'); reducedMotion = motionPreference.matches;
  listen(motionPreference, 'change', () => { reducedMotion = motionPreference.matches; requestRender(); });
  restorePresence();
  if (win.ResizeObserver) { resizeObserver = new win.ResizeObserver(resize); resizeObserver.observe(root.value); }
  if (win.IntersectionObserver) { intersectionObserver = new win.IntersectionObserver(entries => { inView = entries[0]?.isIntersecting ?? true; if (!inView) { stop(); if (frame) { win.cancelAnimationFrame(frame); frame = 0; } } else { resize(); requestRender(); } }); intersectionObserver.observe(root.value); }
  listen(win, 'resize', resize); listen(win, 'blur', stop); listen(doc, 'keyup', keyup as EventListener);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) { stop(); if (frame) { win.cancelAnimationFrame(frame); frame = 0; } } else { resize(); requestRender(); } });
  listen(canvas.value, 'webglcontextlost', event => { event.preventDefault(); if (renderer) useFallback(); }); initialize();
});
onBeforeUnmount(() => { dead = true; stop(); resizeObserver?.disconnect(); intersectionObserver?.disconnect(); cleanup.splice(0).forEach(remove => remove()); disposeGraphics(); });
</script>

<template>
  <div ref="root" class="interior-scene" :class="{ 'is-paused': paused, 'is-free-walk': freeWalk, 'is-fallback': mode === 'fallback' }" data-unread-city-interior :data-room-id="interior.roomId" :data-renderer="mode" :data-position="position" :data-view="view" :data-character-assets="mode === 'fallback' ? 'fallback' : characterSnapshot.status" :data-character-models="characterSnapshot.modelIds.join(',')" :data-character-instance-count="characterSnapshot.instanceCount" :data-player-model="protagonist === 'soyo' ? 'soyo' : 'none'" :data-player-status="playerStatus" :data-camera-mode="cameraMode" :data-phone-view="phoneActive" :data-player-pose="phoneActive ? 'phone' : 'standing'">
    <div v-if="mode === 'fallback'" class="interior-static-scene" aria-label="室内静态示意图"><span class="interior-static-window"/><span class="interior-static-board">{{ room.label }}</span><span class="interior-static-table"/><span class="interior-static-floor"/></div>
    <canvas ref="canvas" class="interior-canvas" :class="{ 'is-visible': mode === 'webgl' }" aria-label="室内三维场景" :tabindex="phoneActive || paused || busy || mode !== 'webgl' ? -1 : 0" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerEnd" @pointercancel="pointerEnd" @lostpointercapture="pointerEnd" @keydown="keydown" @blur="keyboardBlur" />
    <div v-show="!paused && !phoneActive" class="interior-hud">
      <div class="interior-title"><span>校园室内</span><strong>{{ room.label }}</strong><small>{{ mode === 'webgl' ? '走近物件后互动' : '静态模式 · 点击走近后互动' }}</small></div>
      <div class="interior-buttons"><button v-if="mode === 'webgl'" type="button" class="character-camera-toggle" :aria-label="cameraMode === 'third-person' ? '切换为第一人称视角' : '切换为第三人称视角'" :disabled="busy" @click="toggleCamera">{{ cameraMode === 'third-person' ? `${protagonistNames[protagonist]} · 第三人称` : '第一人称' }}</button><button type="button" :disabled="busy" data-interior-leave @click="leave">离开{{ room.label }}</button><button v-if="freeWalk || mode === 'fallback'" type="button" aria-label="室内物件" :aria-expanded="objectsOpen" @click="objectsOpen = !objectsOpen">物件 {{ objectsOpen ? '−' : '+' }}</button></div>
      <div v-if="objectsOpen" class="interior-objects" aria-label="室内互动列表"><p>{{ room.description }}</p><article v-for="item in objects" :key="item.id"><strong>{{ item.label }}<small>{{ Math.round(item.distance) }} 米</small></strong><span>{{ item.id === 'dorm-rest' ? '选择短休、中休或长休，直接结算时间与精力。' : isStudyInteraction(item.id) ? '选择短、中、长三档学习，程序随机确定时长并结算精力。' : item.description }}</span><div><button v-if="mode === 'fallback' && item.distance > INTERIOR_INTERACTION_RANGE" type="button" :disabled="busy" :data-interior-approach="item.id" @click="approach(item.id)">走近{{ item.label }}</button><button type="button" :data-interior-action="item.id" :disabled="busy || item.distance > INTERIOR_INTERACTION_RANGE || !!item.blockedReason" :title="item.blockedReason ?? item.description" @click="interact(item.id)">{{ item.distance > INTERIOR_INTERACTION_RANGE ? '请先走近' : item.label }}<small v-if="item.id === 'dorm-rest'">选择休息时长</small><small v-else-if="isStudyInteraction(item.id)">选择学习时长</small><small v-else>{{ item.blockedReason ?? `${item.minutes} 分钟${item.energyDelta > 0 ? ` · 精力 +${item.energyDelta}` : item.energyDelta < 0 ? ` · 精力 ${item.energyDelta}` : ''}` }}</small></button></div></article></div>
    </div>
    <div v-if="!phoneActive && !paused && !busy && !objectsOpen && mode === 'webgl'" class="interior-hotspots"><button v-for="item in objects" v-show="projected[item.id]?.visible" :key="item.id" type="button" :data-interior-hotspot="item.id" :disabled="!!item.blockedReason" :title="item.blockedReason ?? item.description" :style="{ left: `${projected[item.id]?.x}%`, top: `${projected[item.id]?.y}%` }" @click="interact(item.id)"><i/>{{ item.label }}<small>{{ item.blockedReason ?? (item.id === 'dorm-rest' ? '选择休息时长' : isStudyInteraction(item.id) ? '选择学习时长' : `${item.minutes} 分钟`) }}</small></button></div>
    <div v-if="freeWalk && !phoneActive && !paused && !busy && mode === 'webgl'" class="interior-walk-controls">
      <div ref="joystick" class="interior-joystick" role="group" tabindex="0" aria-label="移动摇杆" data-interior-stick @pointerdown.stop="stickDown" @pointermove.stop="stickMove" @pointerup.stop="stickEnd" @pointercancel="stickEnd" @lostpointercapture="stickEnd" @keydown="keydown" @blur="keyboardBlur"><span aria-hidden="true">↑<br>‹　　　›<br>↓</span><i :style="{ transform: `translate(${stick.x * 32}px, ${stick.y * 32}px)` }"/></div>
      <div class="interior-look" role="group" tabindex="0" aria-label="视角环视区域" data-interior-look @pointerdown.stop="pointerDown" @pointermove.stop="pointerMove" @pointerup.stop="pointerEnd" @pointercancel="pointerEnd" @lostpointercapture="pointerEnd" @keydown="keydown" @blur="keyboardBlur"><span aria-hidden="true">↔</span>拖动环视</div>
      <p class="interior-walk-help">WASD / 摇杆移动 · 拖动环视</p>
    </div>
    <button v-if="mode === 'fallback' && !paused" type="button" class="interior-retry" :disabled="busy" @click="initialize">静态模式 · 重试 3D</button>
    <span class="interior-credit">校园室内草图 · {{ mode === 'webgl' ? '3D' : '静态' }}</span>
  </div>
</template>
