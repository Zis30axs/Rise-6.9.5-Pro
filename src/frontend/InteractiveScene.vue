<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { streetRoutes, createCampusWorld, sceneHotspots, type SceneAction } from './scene-world';
import { moveScenePosition, sceneEyeHeight } from './scene-movement';
import { sceneAreas, sceneBounds, sceneLandmarks, scenePaths } from './scene-layout';
import { createSceneCrowd } from './scene-crowd';
import { applyCharacterCamera, createCharacterAssetPool, createScenePlayerCharacter, type CharacterCameraMode, type CharacterModelStatus, type CharacterSnapshot } from './scene-character-assets';
import { loadBundledCharacter } from './scene-character-bundle';
import { aircraftPose, createSceneAircraft, loadAircraftModel, type AircraftModelStatus } from './scene-aircraft';
import aircraftAsset from '../../assets/models/ambient-aircraft.glb?inline';
import { createSceneVehicles, createTokyoRoadVehicle, type GroundVehicleId, type GroundVehicleStatus } from './scene-vehicles';
import { recoverScenePresencePosition } from './scene-presence';
import type { ScenePerson, ScenePresence } from '../runtime/scene-context';
import type { AirTrafficState } from './types';
import type { ProtagonistId } from '../runtime/dual-protagonists';
import { protagonistNames } from '../runtime/protagonist-world';

const props = withDefaults(defineProps<{ locationId: string; hour: number; paused?: boolean; freeWalk?: boolean; presence?: ScenePresence | null; people?: ScenePerson[]; busy?: boolean; protagonist?: ProtagonistId; phoneActive?: boolean; airTraffic?: AirTrafficState | null }>(), { paused: false, freeWalk: false, presence: null, people: () => [], busy: false, protagonist: 'soyo', phoneActive: false, airTraffic: null });
const emit = defineEmits<{ hotspot: [action: SceneAction]; presence: [point: { x: number; z: number; yaw: number }]; encounter: [personId: string] }>();
const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const mode = ref<'webgl' | 'fallback'>('fallback');
const cameraMode = ref<CharacterCameraMode>('third-person');
const characterSnapshot = ref<CharacterSnapshot>({ status: 'idle', modelIds: [], instanceCount: 0 });
const playerStatus = ref<CharacterModelStatus>('idle');
const aircraftStatus = ref<AircraftModelStatus>('idle');
const groundVehicleStatus = ref<GroundVehicleStatus>('idle');
const activeVehicleIds = ref<GroundVehicleId[]>([]);
const vehicleStopId = ref('');
const wallNow = ref(Date.now());
const activeAircraft = computed(() => aircraftPose(props.airTraffic?.lastFlight ?? null, wallNow.value));
const aircraftSource = computed(() => props.airTraffic?.lastFlight?.source === 'story' ? '剧情触发' : '随机环境');
let aircraftExpiry = 0;
const dragging = ref(false);
const view = ref('0.000,-0.120');
const position = ref('0.000,1.700,18.000');
const guideOpen = ref(false);
const guideTarget = ref('');
const guideBuildings = ref<{ minX: number; maxX: number; minZ: number; maxZ: number }[]>([]);
const walkPoint = computed(() => { const [x, , z] = position.value.split(',').map(Number); return { x, z }; });
const nearbyPeople = computed(() => props.people.map(person => ({ ...person, distance: Math.hypot(person.x - walkPoint.value.x, person.z - walkPoint.value.z) })).filter(person => person.distance <= 6 && canSeePerson(person)).sort((a, b) => a.distance - b.distance).slice(0, 2));
const walkArea = computed(() => sceneAreas.find(area => walkPoint.value.x >= area.minX && walkPoint.value.x <= area.maxX && walkPoint.value.z >= area.minZ && walkPoint.value.z <= area.maxZ)?.label ?? '校园与街区');
const nearestLandmark = computed(() => sceneLandmarks.reduce((nearest, place) => Math.hypot(place.x - walkPoint.value.x, place.z - walkPoint.value.z) < Math.hypot(nearest.x - walkPoint.value.x, nearest.z - walkPoint.value.z) ? place : nearest));
const destination = computed(() => sceneLandmarks.find(place => place.id === guideTarget.value) ?? nearestLandmark.value);
const destinationDistance = computed(() => Math.round(Math.hypot(destination.value.x - walkPoint.value.x, destination.value.z - walkPoint.value.z)));
const guideViewBox = `${sceneBounds.minX - 5} ${sceneBounds.minZ - 5} ${sceneBounds.maxX - sceneBounds.minX + 10} ${sceneBounds.maxZ - sceneBounds.minZ + 10}`;
const headingDegrees = computed(() => Number(view.value.split(',')[0]) * 180 / Math.PI);
const joystick = ref<HTMLElement>();
const stick = ref({ x: 0, y: 0 });
const keys = new Set<string>();
let stickPointer: { id: number; target: HTMLElement; x: number; y: number; radius: number } | undefined;
let lastWalkAt = 0;
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
let crowd: ReturnType<typeof createSceneCrowd> | undefined;
let characterPool: ReturnType<typeof createCharacterAssetPool> | undefined;
let playerCharacter: ReturnType<typeof createScenePlayerCharacter> | undefined;
let aircraft: ReturnType<typeof createSceneAircraft> | undefined;
let groundVehicles: ReturnType<typeof createSceneVehicles> | undefined;
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
let travel: { from: THREE.Vector3; to: THREE.Vector3; started: number; duration: number; startYaw: number; endYaw: number } | undefined;
let lastFrameAt = 0;
let crowdAnimating = false;
let aircraftAnimating = false;
let vehiclesAnimating = false;
let lastVehicleFrameAt = 0;
let reducedMotion = false;
let presenceDirty = false;
let lastPresenceAt = -Infinity;
let lastPresenceKey = '';
const emittedPresence: { x: number; z: number; yaw: number }[] = [];
const walkProjected = ref({ x: 50, y: 68, visible: true });
let pointer: { id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean; allowPick: boolean } | undefined;
const raycaster = new THREE.Raycaster();
const hotspotRange = 34;
raycaster.far = hotspotRange;
const rayPointer = new THREE.Vector2();
const projectedPoint = new THREE.Vector3();
const cleanupEvents: (() => void)[] = [];

function listen(target: EventTarget, event: string, callback: EventListener, options?: AddEventListenerOptions) {
  target.addEventListener(event, callback, options);
  cleanupEvents.push(() => target.removeEventListener(event, callback, options));
}
function canSeePerson(person: ScenePerson): boolean {
  const origin = walkPoint.value;
  const dx = person.x - origin.x, dz = person.z - origin.z;
  // Nearby controls obey the same building walls as an eye-level tap in the scene.
  return !guideBuildings.value.some(building => {
    let near = 0, far = 1;
    for (const [start, delta, min, max] of [[origin.x, dx, building.minX, building.maxX], [origin.z, dz, building.minZ, building.maxZ]]) {
      if (Math.abs(delta) < 0.000001) { if (start < min || start > max) return false; }
      else {
        const a = (min - start) / delta, b = (max - start) / delta;
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        if (near > far) return false;
      }
    }
    return far > 0.02 && near < 0.98;
  });
}
function updateCamera() {
  position.value = `${eye.x.toFixed(3)},${eye.y.toFixed(3)},${eye.z.toFixed(3)}`;
  if (!camera) return;
  const showPlayer = props.protagonist === 'soyo' && (props.phoneActive || cameraMode.value === 'third-person');
  playerCharacter?.setPhoneActive(props.phoneActive);
  const displayYaw = campus ? applyCharacterCamera(camera, eye, yaw, pitch, campus.movementWorld, cameraMode.value, props.phoneActive, width, height) : yaw;
  playerCharacter?.update(eye, displayYaw, showPlayer);
  view.value = `${yaw.toFixed(3)},${pitch.toFixed(3)}`;
}
function toggleCamera() {
  if (props.phoneActive || props.busy || props.paused) return;
  cameraMode.value = cameraMode.value === 'third-person' ? 'first-person' : 'third-person';
  updateCamera(); requestRender();
}
function flushPresence(force = true) {
  if (!presenceDirty || !campus || mode.value !== 'webgl' || !win) return;
  const now = win.performance.now();
  if (!force && now - lastPresenceAt < 750) return;
  const next = { x: Number(eye.x.toFixed(3)), z: Number(eye.z.toFixed(3)), yaw: Number(yaw.toFixed(3)) };
  const key = `${next.x},${next.z},${next.yaw}`;
  presenceDirty = false;
  if (key === lastPresenceKey) return;
  lastPresenceAt = now; lastPresenceKey = key;
  emittedPresence.push(next);
  if (emittedPresence.length > 8) emittedPresence.shift();
  emit('presence', next);
}
function isAcknowledgedPresence(presence: ScenePresence): boolean {
  return emittedPresence.some(point => Math.abs(point.x - presence.x) <= 0.15 && Math.abs(point.z - presence.z) <= 0.15 && Math.abs(point.yaw - presence.yaw) <= 0.002);
}
function restorePresence(presence: ScenePresence): boolean {
  if (!campus || !Number.isFinite(presence.yaw)) return false;
  const point = recoverScenePresencePosition(presence.x, presence.z, campus.movementWorld);
  if (!point) return false;
  presenceDirty = false;
  stopWalking(false); cancelPointer(); travel = undefined; moving.value = false;
  eye.set(point.x, sceneEyeHeight(point.x, point.z, campus.movementWorld), point.z);
  yaw = presence.yaw; pitch = -0.12;
  presenceDirty = false;
  lastPresenceKey = `${Number(eye.x.toFixed(3))},${Number(eye.z.toFixed(3))},${Number(yaw.toFixed(3))}`;
  campus.setWalkTarget(undefined, yaw); updateCamera(); requestRender();
  return true;
}
function resetView(report = false) {
  stopWalking(false);
  presenceDirty = false;
  travel = undefined; moving.value = false;
  const node = currentNode.value;
  yaw = node.yaw; pitch = -0.12;
  // The visible reset button recentres the view in place; only explicit map travel resets its spawn.
  if (!report) eye.set(...node.position);
  if (campus) eye.y = sceneEyeHeight(eye.x, eye.z, campus.movementWorld);
  campus?.setWalkTarget(undefined, node.yaw);
  updateCamera();
  if (report) { presenceDirty = true; flushPresence(); }
  requestRender();
}
function render(now = 0) {
  frame = 0;
  if (dead || props.paused || !renderer || !scene || !camera || !inView || doc.hidden || width < 1 || height < 1) return;
  if ((travel || hasWalkInput() || crowdAnimating || aircraftAnimating || vehiclesAnimating) && now - lastFrameAt < 32) { requestRender(); return; }
  lastFrameAt = now;
  let playerMoving = false;
  if (hasWalkInput() && campus) {
    const input = { forward: Number(keys.has('KeyW')) - Number(keys.has('KeyS')) - stick.value.y, strafe: Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + stick.value.x };
    const elapsed = lastWalkAt ? (now - lastWalkAt) / 1000 : 0;
    lastWalkAt = now;
    const next = moveScenePosition(eye, input, yaw, elapsed, campus.movementWorld);
    if (Math.hypot(next.x - eye.x, next.z - eye.z) > 0.00001) { presenceDirty = true; playerMoving = true; }
    eye.set(next.x, next.y, next.z);
    updateCamera();
    flushPresence(false);
  } else lastWalkAt = 0;
  if (travel) {
    playerMoving = true;
    const fraction = Math.min(1, Math.max(0, (now - travel.started) / travel.duration));
    const smooth = fraction * fraction * (3 - 2 * fraction);
    eye.lerpVectors(travel.from, travel.to, smooth);
    yaw = THREE.MathUtils.lerp(travel.startYaw, travel.endYaw, smooth);
    updateCamera();
    if (fraction === 1) { travel = undefined; moving.value = false; }
  }
  try {
    playerCharacter?.animate(now, playerMoving && !reducedMotion);
    wallNow.value = Date.now();
    aircraftAnimating = aircraft?.update(wallNow.value, !reducedMotion && !props.phoneActive) ?? false;
    vehiclesAnimating = groundVehicles?.update(lastVehicleFrameAt ? (now - lastVehicleFrameAt) / 1000 : 0, eye, !reducedMotion && !props.busy && !props.phoneActive) ?? false;
    lastVehicleFrameAt = now;
    crowdAnimating = crowd?.update(now, camera, eye, props.freeWalk && !props.busy && !reducedMotion && !props.phoneActive) ?? false;
    renderer.render(scene, camera);
    const labels: { x: number; y: number; visible: boolean }[] = [];
    projected.value = sceneHotspots.map((spot) => {
      projectedPoint.copy(spot.position).project(camera!);
      const x = (projectedPoint.x + 1) * 50;
      const y = (1 - projectedPoint.y) * 50;
      const edge = width < 650 ? 18 : 7;
      // Leave the thumb controls and the top walk caption clear, including on short phones.
      const minLabelY = props.freeWalk ? width <= 760 ? 150 : 170 : height * 0.14;
      const maxLabelY = props.freeWalk ? height - (width <= 760 ? 300 : 235) : height * 0.86;
      const label = { x: THREE.MathUtils.clamp(x, edge, 100 - edge), y, visible: spot.position.distanceTo(eye) <= hotspotRange && projectedPoint.z >= -1 && projectedPoint.z <= 1 && x > 0 && x < 100 && y * height / 100 > minLabelY && y * height / 100 < maxLabelY };
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
    if (travel || hasWalkInput() || crowdAnimating || aircraftAnimating || vehiclesAnimating) requestRender();
  } catch {
    useFallback();
  }
}
function requestRender() {
  if (!dead && renderer && !frame && !props.paused && inView && !doc.hidden) frame = win.requestAnimationFrame(render);
}
function syncAircraft() {
  if (!win || dead) return;
  if (aircraftExpiry) { win.clearTimeout(aircraftExpiry); aircraftExpiry = 0; }
  wallNow.value = Date.now();
  const pass = props.airTraffic?.lastFlight ?? null;
  aircraft?.setPass(pass);
  // A single boundary timer also expires the static/reduced-motion indicator without a frame loop.
  if (pass) {
    const boundary = wallNow.value < pass.startedAt ? pass.startedAt : pass.startedAt + pass.durationMs;
    if (boundary > wallNow.value) aircraftExpiry = win.setTimeout(syncAircraft, Math.min(2_147_000_000, boundary - wallNow.value + 1));
  }
  requestRender();
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
  updateCamera();
  requestRender();
}
function releaseGraphics() {
  if (frame) { win.cancelAnimationFrame(frame); frame = 0; }
  crowd?.dispose(); crowd = undefined; crowdAnimating = false;
  playerCharacter?.dispose(); playerCharacter = undefined;
  characterPool?.dispose(); characterPool = undefined;
  characterSnapshot.value = { status: 'idle', modelIds: [], instanceCount: 0 }; playerStatus.value = 'idle';
  aircraft?.dispose(); aircraft = undefined; aircraftAnimating = false; aircraftStatus.value = 'idle';
  groundVehicles?.dispose(); groundVehicles = undefined; vehiclesAnimating = false; lastVehicleFrameAt = 0;
  groundVehicleStatus.value = 'idle'; activeVehicleIds.value = []; vehicleStopId.value = '';
  campus?.dispose(); campus = undefined;
  renderer?.dispose(); renderer = undefined;
  scene?.clear(); scene = undefined; camera = undefined;
}
function useFallback() {
  stopWalking();
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
    camera = new THREE.PerspectiveCamera(68, 1, 0.1, 360);
    campus = createCampusWorld(scene);
    characterPool = createCharacterAssetPool({ loadModel: loadBundledCharacter, changed(snapshot) { characterSnapshot.value = snapshot; requestRender(); } });
    playerCharacter = createScenePlayerCharacter(scene, characterPool, status => { playerStatus.value = status; requestRender(); });
    crowd = createSceneCrowd(scene, campus.movementWorld, characterPool, requestRender);
    crowd.setPeople(props.people);
    aircraft = createSceneAircraft(scene, {
      loadModel: () => loadAircraftModel(aircraftAsset),
      changed(status) { aircraftStatus.value = status; requestRender(); },
    });
    groundVehicles = createSceneVehicles(scene, {
      loadModel: async id => createTokyoRoadVehicle(id),
      changed(snapshot) {
        groundVehicleStatus.value = snapshot.status; activeVehicleIds.value = snapshot.activeIds;
        vehicleStopId.value = snapshot.stopId; requestRender();
      },
    });
    syncAircraft();
    guideBuildings.value = campus.movementWorld.colliders.flatMap(collider => collider.kind === 'box' && collider.id?.startsWith('building:') ? [{ minX: collider.minX, maxX: collider.maxX, minZ: collider.minZ, maxZ: collider.maxZ }] : []);
    campus.setTime(props.hour, props.locationId);
    mode.value = 'webgl';
    width = height = 0;
    if (!props.presence || !restorePresence(props.presence)) resetView();
    resize();
  } catch {
    useFallback();
  }
}
function rotate(dx: number, dy: number) {
  if (props.phoneActive || moving.value || props.busy || props.paused) return;
  yaw = THREE.MathUtils.euclideanModulo(yaw + dx + Math.PI, Math.PI * 2) - Math.PI;
  pitch = THREE.MathUtils.clamp(pitch + dy, -0.52, 0.44);
  presenceDirty = true;
  updateCamera(); requestRender();
}
function pointerDown(event: PointerEvent) {
  if (props.phoneActive || props.paused || props.busy || mode.value !== 'webgl' || event.button !== 0 || !canvas.value || pointer) return;
  canvas.value.focus({ preventScroll: true });
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, allowPick: event.currentTarget === canvas.value };
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
  const allowPick = pointer.allowPick;
  pointer = undefined; dragging.value = false;
  try { canvas.value?.releasePointerCapture(event.pointerId); } catch { /* Already released by the browser. */ }
  flushPresence();
  if (moved || !allowPick || props.paused || !canvas.value || !camera || !campus) return;
  const rect = canvas.value.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  rayPointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(rayPointer, camera);
  // The first solid hit decides the action, so a passer-by cannot be selected through a building.
  const hit = scene ? raycaster.intersectObjects(scene.children, true)[0] : undefined;
  const personId = hit && crowd?.personAtHit(hit);
  if (personId) { encounter(personId); return; }
  let object: THREE.Object3D | null = hit?.object ?? null;
  while (object && !object.userData.sceneAction && !object.userData.sceneWalk) object = object.parent;
  if (object?.userData.sceneWalk) { moveTo(nodeIndex.value + 1); return; }
  const action = object?.userData.sceneAction;
  if (sceneHotspots.some((spot) => spot.action === action)) select(action as SceneAction);
}
function cancelPointer() {
  const previous = pointer; pointer = undefined; dragging.value = false;
  if (previous) { try { canvas.value?.releasePointerCapture(previous.id); } catch { /* Already released. */ } }
  flushPresence();
}
function hasWalkInput() {
  return !props.phoneActive && props.freeWalk && !props.paused && !props.busy && mode.value === 'webgl' && (keys.size > 0 || stick.value.x !== 0 || stick.value.y !== 0);
}
function releaseStick(flush = true) {
  const previous = stickPointer;
  stickPointer = undefined; stick.value = { x: 0, y: 0 };
  if (previous) { try { previous.target.releasePointerCapture(previous.id); } catch { /* Released during teardown. */ } }
  if (flush) flushPresence();
}
function stopWalking(flush = true) { if (flush) flushPresence(); keys.clear(); releaseStick(false); lastWalkAt = 0; }
function focus() { canvas.value?.focus({ preventScroll: true }); }
defineExpose({ focus, flushPresence });
function stickDown(event: PointerEvent) {
  if (props.phoneActive || !props.freeWalk || props.paused || props.busy || mode.value !== 'webgl' || event.button !== 0 || stickPointer || !joystick.value) return;
  const target = joystick.value;
  const bounds = target.getBoundingClientRect();
  stickPointer = { id: event.pointerId, target, x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, radius: bounds.width / 2 - 22 };
  target.focus({ preventScroll: true });
  try { target.setPointerCapture(event.pointerId); } catch { /* Browser may cancel a gesture during window switching. */ }
  event.preventDefault(); stickMove(event);
  presenceDirty = true;
}
function stickMove(event: PointerEvent) {
  if (!stickPointer || event.pointerId !== stickPointer.id) return;
  event.preventDefault();
  const x = (event.clientX - stickPointer.x) / stickPointer.radius;
  const y = (event.clientY - stickPointer.y) / stickPointer.radius;
  const length = Math.hypot(x, y);
  stick.value = length < 0.12 ? { x: 0, y: 0 } : { x: x / Math.max(1, length), y: y / Math.max(1, length) };
  requestRender();
}
function stickUp(event: PointerEvent) { if (event.pointerId === stickPointer?.id) releaseStick(); }
function keyup(event: KeyboardEvent) { keys.delete(event.code); flushPresence(); }
function keyboardBlur() { keys.clear(); flushPresence(); }
function keydown(event: KeyboardEvent) {
  if (props.phoneActive || props.paused || props.busy || mode.value !== 'webgl' || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  if (props.freeWalk && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
    event.preventDefault(); event.stopPropagation(); keys.add(event.code); presenceDirty = true; requestRender(); return;
  }
  const directions: Record<string, [number, number]> = { ArrowLeft: [-0.06, 0], ArrowRight: [0.06, 0], ArrowUp: [0, -0.03], ArrowDown: [0, 0.03] };
  const delta = directions[event.key];
  if (!delta) return;
  event.preventDefault(); event.stopPropagation(); rotate(...delta);
}
function select(action: SceneAction) { if (!props.phoneActive && !props.paused && !props.busy) { stopWalking(); cancelPointer(); emit('hotspot', action); } }
function encounter(personId: string) {
  if (props.phoneActive || props.paused || props.busy || !props.freeWalk) return;
  const person = props.people.find(candidate => candidate.id === personId);
  if (!person || Math.hypot(person.x - eye.x, person.z - eye.z) > 6 || !canSeePerson(person)) return;
  presenceDirty = true; stopWalking(); cancelPointer(); emit('encounter', personId);
}
function moveTo(index: number) {
  if (props.phoneActive || props.paused || moving.value || index < 0 || index >= route.value.length || index === nodeIndex.value) return;
  const node = route.value[index];
  nodeIndex.value = index;
  if (mode.value === 'fallback' || reducedMotion) { resetView(); return; }
  moving.value = true;
  // Fixed viewpoint nodes are presentation only. World travel still belongs to the map action.
  const deltaYaw = THREE.MathUtils.euclideanModulo(node.yaw - yaw + Math.PI, Math.PI * 2) - Math.PI;
  travel = { from: eye.clone(), to: new THREE.Vector3(...node.position), started: win.performance.now(), duration: 700, startYaw: yaw, endYaw: yaw + deltaYaw };
  campus?.setWalkTarget(nextNode.value?.position, node.yaw);
  requestRender();
}

watch([() => props.presence, () => props.locationId], ([presence, locationId], [previous, previousLocation]) => {
  campus?.setTime(props.hour, locationId);
  if (!campus) return;
  if (presence) {
    // Saving a walking update feeds back through props, often after the camera has moved on.
    // Acknowledge all recent emitted points rather than resetting to the delayed snapshot.
    const samePrevious = previous && Math.abs(previous.x - presence.x) < 0.001 && Math.abs(previous.z - presence.z) < 0.001 && Math.abs(previous.yaw - presence.yaw) < 0.001;
    if (samePrevious || isAcknowledgedPresence(presence)) { requestRender(); return; }
    if (Math.hypot(presence.x - eye.x, presence.z - eye.z) <= 0.2 && Math.abs(presence.yaw - yaw) < 0.002) return;
    if (restorePresence(presence)) return;
  }
  if (previous || locationId !== previousLocation) {
    // Map travel clears scene presence explicitly and selects its own legacy arrival point.
    emittedPresence.length = 0; lastPresenceKey = ''; lastPresenceAt = -Infinity; presenceDirty = false;
    nodeIndex.value = 0; resetView();
  }
});
watch(() => props.phoneActive, () => { stopWalking(); cancelPointer(); travel = undefined; moving.value = false; lastVehicleFrameAt = 0; updateCamera(); requestRender(); });
watch(() => props.people, (people) => { crowd?.setPeople(people); requestRender(); });
watch(() => props.airTraffic?.lastFlight, syncAircraft);
watch(() => props.hour, () => { campus?.setTime(props.hour, props.locationId); requestRender(); });
watch(() => props.freeWalk, () => { stopWalking(); cancelPointer(); requestRender(); });
watch(() => props.paused, (paused) => { stopWalking(); cancelPointer(); lastVehicleFrameAt = 0; if (paused) { if (frame) { win.cancelAnimationFrame(frame); frame = 0; } if (travel) { travel = undefined; moving.value = false; resetView(); } } else { syncAircraft(); resize(); requestRender(); } });
watch(() => props.busy, (busy) => { if (busy) { stopWalking(); cancelPointer(); } else requestRender(); });

onMounted(() => {
  if (!root.value || !canvas.value) return;
  doc = root.value.ownerDocument;
  const ownerWindow = doc.defaultView;
  if (!ownerWindow) return;
  win = ownerWindow;
  const motionPreference = win.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion = motionPreference.matches;
  listen(motionPreference, 'change', () => { reducedMotion = motionPreference.matches; requestRender(); });
  // Tavern-Helper can adopt Vue-created elements into its parent document. Observe and schedule in the owner realm.
  if (win.ResizeObserver) { resizeObserver = new win.ResizeObserver(resize); resizeObserver.observe(root.value); }
  if (win.IntersectionObserver) {
    intersectionObserver = new win.IntersectionObserver((entries) => {
      inView = entries[0]?.isIntersecting ?? true;
      if (!inView) { stopWalking(); cancelPointer(); lastVehicleFrameAt = 0; if (frame) { win.cancelAnimationFrame(frame); frame = 0; } }
      if (inView) { syncAircraft(); resize(); requestRender(); }
    });
    intersectionObserver.observe(root.value);
  }
  listen(win, 'resize', resize);
  listen(win, 'blur', () => { stopWalking(); cancelPointer(); });
  listen(doc, 'keyup', keyup as EventListener);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) { stopWalking(); cancelPointer(); lastVehicleFrameAt = 0; if (frame) { win.cancelAnimationFrame(frame); frame = 0; } } else { syncAircraft(); resize(); requestRender(); } });
  listen(canvas.value, 'webglcontextlost', (event) => { event.preventDefault(); useFallback(); });
  syncAircraft(); initialize();
});
onBeforeUnmount(() => {
  dead = true; stopWalking(); cancelPointer();
  if (aircraftExpiry) win.clearTimeout(aircraftExpiry);
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
  <div ref="root" class="interactive-campus" :class="{ 'is-night': isNight, 'is-paused': paused, 'is-dragging': dragging, 'is-free-walk': freeWalk }" data-unread-city-scene :data-renderer="mode" :data-view="view" :data-position="position" :data-free-walk="freeWalk" :data-scene-node="`${locationId}:${nodeIndex}`" :data-aircraft-status="mode === 'fallback' ? 'fallback' : aircraftStatus" :data-aircraft-id="activeAircraft ? airTraffic?.lastFlight?.id : ''" :data-aircraft-progress="activeAircraft?.progress ?? ''" :data-ground-vehicles="mode === 'fallback' ? 'fallback' : groundVehicleStatus" :data-vehicle-count="activeVehicleIds.length" :data-active-vehicle-ids="activeVehicleIds.join(',')" :data-vehicle-stop="vehicleStopId" :data-character-assets="mode === 'fallback' ? 'fallback' : characterSnapshot.status" :data-character-models="characterSnapshot.modelIds.join(',')" :data-character-instance-count="characterSnapshot.instanceCount" :data-player-model="protagonist === 'soyo' ? 'soyo' : 'none'" :data-player-status="playerStatus" :data-camera-mode="cameraMode" :data-phone-view="phoneActive" :data-player-pose="phoneActive ? 'phone' : 'standing'">
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
    <canvas ref="canvas" class="campus-canvas" :class="{ 'is-visible': mode === 'webgl' }" aria-label="可交互三维场景" :tabindex="phoneActive || paused || busy || mode !== 'webgl' ? -1 : 0" aria-describedby="uc-scene-help" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="cancelPointer" @lostpointercapture="cancelPointer" @keydown="keydown" @blur="keyboardBlur" />
    <div class="campus-atmosphere" aria-hidden="true" />
    <p v-if="activeAircraft && !paused && !phoneActive && (!freeWalk || !guideOpen)" class="campus-air-traffic" role="status"><span aria-hidden="true">✈</span><span>客机正从高空经过<small>{{ aircraftSource }}{{ mode === 'fallback' ? ' · 静态场景不显示飞行模型' : aircraftStatus === 'error' ? ' · 飞行画面暂不可用' : '' }}</small></span></p>
    <div class="campus-tools" v-show="!paused && !phoneActive">
      <span id="uc-scene-help">{{ mode === 'webgl' ? freeWalk ? 'WASD 移动 · 拖动或方向键环视' : '拖动环视 · 自由行走探索校园' : '静态场景 · 仍可点击探索' }}</span>
      <button v-if="mode === 'webgl'" type="button" class="character-camera-toggle" :aria-label="cameraMode === 'third-person' ? '切换为第一人称视角' : '切换为第三人称视角'" :disabled="busy" @click="toggleCamera">{{ cameraMode === 'third-person' ? `${protagonistNames[protagonist]} · 第三人称` : '第一人称' }}</button>
      <button v-if="mode === 'webgl'" type="button" aria-label="重置场景视角" :disabled="busy" @click="resetView(true)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1.7 7.1M4 4v6h6"/></svg><span>复位</span></button>
      <button v-else type="button" aria-label="重试三维场景" @click="initialize">重试 3D</button>
    </div>
    <p v-if="characterSnapshot.status === 'error' && !paused" class="character-load-status" role="status">部分角色外观未能显示，仍可走近搭话。</p>
    <div v-if="freeWalk && !phoneActive && !paused && !busy && mode === 'webgl'" class="free-walk-controls">
      <div class="walk-guide" :class="{ 'is-open': guideOpen }">
        <button type="button" class="walk-mode-caption" :aria-label="guideOpen ? '收起步行导览' : '展开步行导览'" :aria-expanded="guideOpen" aria-controls="uc-walk-guide" @click="guideOpen = !guideOpen">
          <span class="walk-guide-compass" aria-hidden="true"><i :style="{ transform: `rotate(${headingDegrees}deg)` }">↑</i></span>
          <span>{{ walkArea }}<small>自由行走 · {{ guideOpen ? '收起导览 −' : '步行导览 +' }}</small></span>
        </button>
        <div v-if="guideOpen" id="uc-walk-guide" class="walk-guide-body">
          <svg :viewBox="guideViewBox" role="img" aria-label="校园与街区步行导览，箭头为当前位置及朝向">
            <rect :x="sceneBounds.minX" :y="sceneBounds.minZ" :width="sceneBounds.maxX - sceneBounds.minX" :height="sceneBounds.maxZ - sceneBounds.minZ" rx="3" class="guide-ground" />
            <rect v-for="(path, index) in scenePaths" :key="`path-${index}`" :x="path.x - path.width / 2" :y="path.z - path.depth / 2" :width="path.width" :height="path.depth" :class="`guide-${path.kind}`" />
            <rect v-for="(building, index) in guideBuildings" :key="`building-${index}`" :x="building.minX" :y="building.minZ" :width="building.maxX - building.minX" :height="building.maxZ - building.minZ" class="guide-building" />
            <circle v-for="place in sceneLandmarks" :key="place.id" :cx="place.x" :cy="place.z" r="1.8" class="guide-landmark" />
            <circle :cx="destination.x" :cy="destination.z" r="4" class="guide-destination" />
            <g :transform="`translate(${walkPoint.x} ${walkPoint.z}) rotate(${headingDegrees})`" class="guide-player"><circle r="5"/><path d="M0 -9L4 3L0 1L-4 3Z"/></g>
            <text :x="sceneBounds.minX + 4" :y="sceneBounds.minZ + 11" class="guide-north">北 ↑</text>
          </svg>
          <select v-model="guideTarget" aria-label="步行导览目的地"><option value="">附近地标</option><option v-for="place in sceneLandmarks" :key="place.id" :value="place.id">{{ place.label }}</option></select>
          <p>{{ destination.label }} <strong>{{ destinationDistance <= 3 ? '已到附近' : `直线 ${destinationDistance} 米` }}</strong></p>
        </div>
      </div>
      <div v-if="nearbyPeople.length && !guideOpen" class="scene-nearby-people" aria-label="附近可搭话的人物">
        <button v-for="person in nearbyPeople" :key="person.id" type="button" :data-scene-person-id="person.id" :aria-label="`与${person.name}搭话`" @click.stop="encounter(person.id)"><span>与{{ person.name }}搭话</span><small>{{ person.identity }} · {{ person.distance < 1 ? '身旁' : `${Math.round(person.distance)}米` }}</small></button>
      </div>
      <div ref="joystick" class="walk-joystick" role="group" tabindex="0" aria-label="移动摇杆" aria-describedby="uc-walk-help" @pointerdown.stop="stickDown" @pointermove.stop="stickMove" @pointerup.stop="stickUp" @pointercancel="stickUp" @lostpointercapture="stickUp" @keydown="keydown" @blur="keyboardBlur">
        <span class="stick-directions" aria-hidden="true">↟<br>‹　　　›<br>↓</span><span class="stick-knob" :style="{ transform: `translate(${stick.x * 34}px, ${stick.y * 34}px)` }" aria-hidden="true" />
      </div>
      <p id="uc-walk-help" class="walk-move-hint">拖动摇杆移动</p><div class="walk-look-hint" role="group" tabindex="0" aria-label="视角环视区域" @pointerdown.stop="pointerDown" @keydown="keydown" @blur="keyboardBlur"><span aria-hidden="true">↔</span>拖动环视</div>
    </div>
    <div class="campus-street-nav" v-show="!paused && mode === 'fallback'" aria-label="街景观察位置">
      <span class="campus-node-name"><i aria-hidden="true"/>{{ currentNode.label }}<small>局部漫游</small></span>
      <div><button type="button" aria-label="返回上个位置" :disabled="nodeIndex === 0 || moving" @click="moveTo(nodeIndex - 1)">← 返回</button><button type="button" aria-label="向前走" :disabled="!nextNode || moving" @click="moveTo(nodeIndex + 1)">{{ moving ? '移动中…' : nextNode ? `前往${nextNode.label} →` : '已到步道尽头' }}</button></div>
    </div>
    <button v-if="mode === 'fallback' && nextNode && !paused && !moving" type="button" class="campus-walk-arrow" style="left:50%;top:63%" :aria-label="`沿步道前往${nextNode.label}`" @click="moveTo(nodeIndex + 1)"><span aria-hidden="true">⌃</span><small>{{ nextNode.label }}</small></button>
    <div class="campus-hotspots" v-show="!paused && !phoneActive" aria-label="场景探索热点">
      <button v-for="(spot, index) in sceneHotspots" v-show="projected[index]?.visible" :key="spot.action" type="button" class="campus-hotspot" :data-hotspot="spot.action" :aria-label="spot.label" :style="{ left: `${projected[index]?.x}%`, top: `${projected[index]?.y}%` }" @click.stop="select(spot.action)"><i aria-hidden="true"/><span>{{ spot.label }}</span></button>
    </div>
    <span class="campus-credit">交互场景草图 · {{ mode === 'webgl' ? '3D' : '静态' }}</span>
  </div>
</template>
