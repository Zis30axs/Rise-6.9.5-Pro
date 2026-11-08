<script lang="ts">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TOKYO_SANDBOX_MODEL_SHA256 } from './tokyo-sandbox-map';
import { readLocalAssetBytes } from './local-asset-buffer';
import tokyoModelAsset from '../../assets/models/unread-city-tokyo-sandbox.glb?inline';

import { disposeThreeTree } from './dispose-three-tree';

// Keep one bundled asset reference: folding repeated equality checks can otherwise
// duplicate this large data URL into multiple chunks during production builds.
const bundledTokyoAssetSources = new Set<string>([tokyoModelAsset]);

async function sandboxSha256(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function checkGlb(bytes: Uint8Array<ArrayBuffer>) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength ||
      view.getUint32(16, true) !== 0x4e4f534a) throw new Error('Invalid offline Tokyo GLB');
  const length = view.getUint32(12, true);
  if (length < 1 || length > bytes.byteLength - 20) throw new Error('Invalid Tokyo GLB payload');
  const definition = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    buffers?: { uri?: unknown }[]; images?: { uri?: unknown }[]; extensionsRequired?: string[];
  };
  if ([...(definition.buffers ?? []), ...(definition.images ?? [])].some(item => item.uri !== undefined)) {
    throw new Error('External resource URI forbidden in offline Tokyo GLB');
  }
  if ((definition.extensionsRequired ?? []).some(ext => ext !== 'EXT_mesh_gpu_instancing')) {
    throw new Error('Offline Tokyo GLB requires an unsupported decoder');
  }
}

/** Deduplicate identical PBR materials in the GLB to cut WebGL shader compilation time by 75%. */
function optimizeGlbScene(root: THREE.Group) {
  const canonical = new Map<string, THREE.MeshStandardMaterial>();
  const redundant = new Set<THREE.Material>();

  root.traverse(obj => {
    if (!(obj instanceof THREE.Mesh) || !(obj.material instanceof THREE.MeshStandardMaterial)) return;
    const m = obj.material;
    if (m.map || m.normalMap || m.emissiveMap || m.roughnessMap || m.metalnessMap) return;
    const key = [
      m.color.getHexString(),
      m.emissive.getHexString(),
      m.roughness.toFixed(2),
      m.metalness.toFixed(2),
      m.opacity.toFixed(2),
      m.transparent ? 1 : 0,
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

  // Record original transforms on top-level children so cached model resets cleanly on reopen
  const container = root.children.length === 1 && root.children[0].children.length > 30
    ? root.children[0]
    : root;
  for (const child of container.children) {
    if (!child.userData.initialPos) {
      child.userData.initialPos = child.position.clone();
      child.userData.initialQuat = child.quaternion.clone();
      child.userData.initialScale = child.scale.clone();
    }
  }
}

const GLB_IDB_NAME = 'unread-city-tokyo-glb-cache-v1';
const GLB_IDB_STORE = 'glb';

async function readIdbCachedGlbBytes(): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (typeof indexedDB === 'undefined' || /jsdom/i.test(navigator?.userAgent ?? '')) return undefined;
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(GLB_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(GLB_IDB_STORE)) db.createObjectStore(GLB_IDB_STORE);
      };
      req.onerror = () => resolve(undefined);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(GLB_IDB_STORE, 'readonly');
          const getReq = tx.objectStore(GLB_IDB_STORE).get(TOKYO_SANDBOX_MODEL_SHA256);
          getReq.onsuccess = () => {
            const val = getReq.result;
            db.close();
            if (val instanceof ArrayBuffer && val.byteLength === 6_232_488) {
              resolve(new Uint8Array(val));
            } else if (val instanceof Uint8Array && val.byteLength === 6_232_488) {
              resolve(val as Uint8Array<ArrayBuffer>);
            } else {
              resolve(undefined);
            }
          };
          getReq.onerror = () => { db.close(); resolve(undefined); };
        } catch {
          db.close();
          resolve(undefined);
        }
      };
    } catch {
      resolve(undefined);
    }
  });
}

function writeIdbCachedGlbBytes(bytes: Uint8Array<ArrayBuffer>) {
  if (typeof indexedDB === 'undefined' || /jsdom/i.test(navigator?.userAgent ?? '')) return;
  try {
    const req = indexedDB.open(GLB_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GLB_IDB_STORE)) db.createObjectStore(GLB_IDB_STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction(GLB_IDB_STORE, 'readwrite');
        tx.objectStore(GLB_IDB_STORE).put(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), TOKYO_SANDBOX_MODEL_SHA256);
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      } catch {
        db.close();
      }
    };
  } catch {
    /* Ignore storage quota errors */
  }
}

/** Boxes from the CiRCLE pack, drawn on top of the fixed city model. */
function attachCirclePackGeometry(root: THREE.Group) {
  if (root.getObjectByName('circle-sandbox-pack')) return;
  const group = new THREE.Group();
  group.name = 'circle-sandbox-pack';
  for (const building of circleSandboxOverlay.buildings) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(building.width, building.height, building.depth),
      new THREE.MeshStandardMaterial({ color: building.color, roughness: 0.86 }),
    );
    mesh.position.set(building.x, building.height / 2, building.z);
    mesh.name = building.id;
    group.add(mesh);
  }
  for (const road of circleSandboxOverlay.roads) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(road.width, 0.1, road.depth),
      new THREE.MeshStandardMaterial({ color: road.kind === 'road' ? '#52676d' : '#e4dac1', roughness: 0.9 }),
    );
    mesh.position.set(road.x, -0.95, road.z);
    mesh.rotation.y = road.rotationY ?? 0;
    group.add(mesh);
  }
  root.add(group);
}

/** Each active view owns its decoded tree and GPU resources. Only local bytes are cached. */
async function loadTokyoGlb(assetUrl: string): Promise<THREE.Group> {
  const bundledSource = bundledTokyoAssetSources.has(assetUrl) && assetUrl.startsWith('data:');
  let bytes = bundledSource ? await readIdbCachedGlbBytes() : undefined;
  const cached = !!bytes;
  if (!bytes) bytes = await readLocalAssetBytes(assetUrl, 10_000_000, 'Invalid offline Tokyo model');
  if (await sandboxSha256(bytes) !== TOKYO_SANDBOX_MODEL_SHA256) {
    // A damaged local byte cache must not make every later retry fail forever.
    if (!cached) throw new Error('Tokyo sandbox pack hash mismatch');
    bytes = await readLocalAssetBytes(assetUrl, 10_000_000, 'Invalid offline Tokyo model');
    if (await sandboxSha256(bytes) !== TOKYO_SANDBOX_MODEL_SHA256) throw new Error('Tokyo sandbox pack hash mismatch');
  }
  checkGlb(bytes);
  if (bundledSource) writeIdbCachedGlbBytes(bytes);
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (!url.startsWith('blob:')) throw new Error('External Tokyo model resource blocked');
    return url;
  });
  const parsed = (await new GLTFLoader(manager).parseAsync(bytes.buffer, '')).scene;
  optimizeGlbScene(parsed);
  attachCirclePackGeometry(parsed);
  return parsed;
}

import {
  projectOldTokyoPosition, TOKYO_PIN_ELEVATION, tokyoDistrictBounds,
  tokyoDistricts, tokyoLocationPosition, type TokyoScope,
} from './tokyo-sandbox-map';
import sandboxData from '../../assets/models/unread-city-tokyo-sandbox-data.json';
import { circleSandboxOverlay } from './circle-sandbox-pack';
import {
  applyTokyoCanvasResolution, nativeTokyoCanvasResolution,
  type TokyoCanvasResolution,
} from './tokyo-sandbox-resolution';
import {
  applyTokyoCameraFlight, frameTokyoMapCamera, measureTokyoGroundScale,
  readTokyoCameraPose, type TokyoCameraPose,
} from './tokyo-sandbox-camera';
import {
  createTokyoSandboxVfx, resolveTokyoAtmosphere,
  type ResolvedAtmospherePreset,
  type TokyoAtmosphereMode,
  type TokyoSandboxVfxController,
} from './tokyo-sandbox-vfx';
import { createTokyoCanvasRenderer, type TokyoCanvasRenderer } from './tokyo-sandbox-canvas';
import { createTokyoSandboxCinematic, type TokyoCinematicController } from './tokyo-sandbox-cinematic';

interface TrafficRoute {
  startX: number; endX: number; startZ: number; endZ: number;
  length: number; dirX: number; dirZ: number; perpX: number; perpZ: number; yaw: number;
}
interface TrafficVehicle {
  routeIndex: number; lane: 1 | -1; speed: number; distance: number; mesh: THREE.Group;
}
interface Su30FlightState {
  node: THREE.Object3D;
  baseScale: number;
  theta: number;
  afterburners: THREE.Object3D[];
  canards: THREE.Object3D[];
}
interface GondolaState {
  node: THREE.Object3D;
  phase: number;
}
interface BakedVehicleState {
  node: THREE.Object3D;
  axis: 'x' | 'z';
  dir: 1 | -1;
  speed: number;
  minCoord: number;
  maxCoord: number;
  fixedCoord: number;
  y: number;
  coord: number;
  initialQuat: THREE.Quaternion;
}

// Six main Tokyo grid arteries derived from sandbox road layout.
// Note: buildVehicle constructs vehicles with front (+headlights) along local +Z,
// so Eastbound (+X) has yaw = +Math.PI / 2 and Southbound (+Z) has yaw = 0.
const trafficRoutes: TrafficRoute[] = [
  // E-W Center Boulevard
  { startX: -186, endX: 192, startZ: 48, endZ: 48, length: 378, dirX: 1, dirZ: 0, perpX: 0, perpZ: 1, yaw: Math.PI / 2 },
  // E-W South Avenue
  { startX: -186, endX: 158, startZ: 118, endZ: 118, length: 344, dirX: 1, dirZ: 0, perpX: 0, perpZ: 1, yaw: Math.PI / 2 },
  // E-W North Avenue
  { startX: -180, endX: 82, startZ: -82, endZ: -82, length: 262, dirX: 1, dirZ: 0, perpX: 0, perpZ: 1, yaw: Math.PI / 2 },
  // N-S West Avenue
  { startX: -82, endX: -82, startZ: -124, endZ: 168, length: 292, dirX: 0, dirZ: 1, perpX: -1, perpZ: 0, yaw: 0 },
  // N-S East Avenue
  { startX: 82, endX: 82, startZ: -165, endZ: 145, length: 310, dirX: 0, dirZ: 1, perpX: -1, perpZ: 0, yaw: 0 },
  // N-S Waterfront Boulevard
  { startX: 186, endX: 186, startZ: -24, endZ: 132, length: 156, dirX: 0, dirZ: 1, perpX: -1, perpZ: 0, yaw: 0 },
];

function buildVehicle(color: THREE.ColorRepresentation, isTaxi = false, isBus = false): THREE.Group {
  const g = new THREE.Group();
  const len = isBus ? 6.6 : isTaxi ? 4.0 : 3.6;
  const wid = isBus ? 2.2 : isTaxi ? 1.7 : 1.6;
  const hgt = isBus ? 2.0 : isTaxi ? 1.1 : 1.0;
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.32 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(wid, hgt, len), bodyMat);
  body.position.y = hgt / 2 + 0.25;
  g.add(body);

  if (!isBus) {
    const cabMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.18, metalness: 0.85 });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.88, hgt * 0.65, len * 0.52), cabMat);
    cabin.position.set(0, hgt + 0.25 * 0.65, -len * 0.05);
    g.add(cabin);
  }

  if (isTaxi) {
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.2, emissive: 0xffc000, emissiveIntensity: 1.4 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(wid * 0.35, 0.22, 0.45), lampMat);
    lamp.position.set(0, hgt * 1.65 + 0.2, -len * 0.05);
    g.add(lamp);
  }

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const wheelGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8);
  wheelGeom.rotateZ(Math.PI / 2);
  const zOffsets = isBus ? [-len * 0.36, 0, len * 0.36] : [-len * 0.32, len * 0.32];
  for (const z of zOffsets) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeom, wheelMat);
      wheel.position.set(side * (wid / 2 + 0.08), 0.32, z);
      g.add(wheel);
    }
  }

  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.8 });
  const hlGeom = new THREE.BoxGeometry(0.26, 0.18, 0.12);
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(hlGeom, hlMat);
    hl.position.set(side * (wid * 0.36), hgt * 0.55, len / 2 + 0.04);
    g.add(hl);
  }

  const beamGeom = new THREE.ConeGeometry(wid * 0.85, 5.8, 12, 1, true);
  beamGeom.rotateX(-Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff3c4,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(beamGeom, beamMat);
  beam.position.set(0, 0.32, len / 2 + 2.9);
  g.add(beam);

  const tlMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff1133, emissiveIntensity: 1.9 });
  for (const side of [-1, 1]) {
    const tl = new THREE.Mesh(hlGeom, tlMat);
    tl.position.set(side * (wid * 0.36), hgt * 0.55, -len / 2 - 0.04);
    g.add(tl);
  }

  return g;
}

function extractDynamicSceneNodes(root: THREE.Group): {
  su30State: Su30FlightState | undefined;
  gondolaStates: GondolaState[];
  bakedVehicleStates: BakedVehicleState[];
} {
  let su30: Su30FlightState | undefined;
  const gondolas: GondolaState[] = [];
  const bakedVehicles: BakedVehicleState[] = [];

  const container = root.children.length === 1 && root.children[0].children.length > 30
    ? root.children[0]
    : root;

  for (const child of container.children) {
    const initPos: THREE.Vector3 = child.userData.initialPos ?? child.position.clone();
    const initQuat: THREE.Quaternion = child.userData.initialQuat ?? child.quaternion.clone();
    const initScale: THREE.Vector3 = child.userData.initialScale ?? child.scale.clone();

    if ((child.children.length >= 40 && initPos.y > 35) || child.userData?.isSu30) {
      child.matrixAutoUpdate = true;
      child.rotation.order = 'YXZ';
      const baseScale = initScale.x > 0.1 ? initScale.x : 1.38;
      child.scale.setScalar(baseScale);
      const afterburners = child.children.filter(
        part => part.position.z < -9.0 && Math.abs(part.position.x) > 0.4 && part.name !== 'su30-local-vfx',
      );
      const canards = child.children.filter(
        part => part.position.z > 3.0 && part.position.z < 4.6 && Math.abs(part.position.x) > 0.8,
      );
      su30 = {
        node: child,
        baseScale,
        theta: 0.72,
        afterburners,
        canards,
      };
      continue;
    }

    if (child.children.length === 4 && initPos.z < -115 && initPos.y > 12) {
      child.matrixAutoUpdate = true;
      const phase = gondolas.length === 0 ? 0.25 : 0.75;
      gondolas.push({ node: child, phase });
      continue;
    }

    if (child.children.length === 9 && Math.abs(initPos.y - 0.22) < 0.6) {
      child.matrixAutoUpdate = true;
      child.quaternion.copy(initQuat);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(initQuat);
      if (Math.abs(forward.x) >= Math.abs(forward.z)) {
        const dir: 1 | -1 = forward.x >= 0 ? 1 : -1;
        bakedVehicles.push({
          node: child,
          axis: 'x',
          dir,
          speed: 19 + (bakedVehicles.length % 5) * 1.8,
          minCoord: -182,
          maxCoord: 182,
          fixedCoord: initPos.z,
          y: initPos.y || 0.22,
          coord: initPos.x,
          initialQuat: initQuat.clone(),
        });
      } else {
        const dir: 1 | -1 = forward.z >= 0 ? 1 : -1;
        bakedVehicles.push({
          node: child,
          axis: 'z',
          dir,
          speed: 18 + (bakedVehicles.length % 5) * 1.6,
          minCoord: -155,
          maxCoord: 155,
          fixedCoord: initPos.x,
          y: initPos.y || 0.22,
          coord: initPos.z,
          initialQuat: initQuat.clone(),
        });
      }
    }
  }
  return { su30State: su30, gondolaStates: gondolas, bakedVehicleStates: bakedVehicles };
}

function sampleSu30Trajectory(theta: number) {
  const x = 18 + 148 * Math.cos(theta) - 24 * Math.sin(2 * theta);
  const z = -12 + 118 * Math.sin(theta) + 28 * Math.cos(2 * theta);
  const y = 54 + 8.5 * Math.cos(2 * theta + 0.4);
  return { x, y, z };
}

function updateSu30Pose(state: Su30FlightState, nowMs: number) {
  const eps = 0.008;
  const p0 = sampleSu30Trajectory(state.theta);
  const p1 = sampleSu30Trajectory(state.theta + eps);
  const p2 = sampleSu30Trajectory(state.theta + 2 * eps);

  const vx = (p1.x - p0.x) / eps;
  const vy = (p1.y - p0.y) / eps;
  const vz = (p1.z - p0.z) / eps;
  const ax = (p2.x - 2 * p1.x + p0.x) / (eps * eps);
  const az = (p2.z - 2 * p1.z + p0.z) / (eps * eps);

  const hSpeed = Math.max(1e-3, Math.hypot(vx, vz));
  const yaw = Math.atan2(vx, vz);
  const pitch = -Math.atan2(vy, hSpeed);
  const curvature = (vz * ax - vx * az) / (hSpeed * hSpeed);
  const roll = Math.max(-0.68, Math.min(0.68, curvature * 0.48));

  state.node.position.set(p0.x, p0.y, p0.z);
  state.node.rotation.order = 'YXZ';
  state.node.rotation.set(pitch, yaw, roll);
  state.node.scale.setScalar(state.baseScale);
  state.node.updateMatrix();

  const pulse = 0.96 + 0.24 * Math.sin(nowMs * 0.045);
  for (const plume of state.afterburners) {
    plume.scale.set(1, 1, pulse);
  }
  for (const canard of state.canards) {
    canard.rotation.x = -pitch * 0.55;
  }
}

function createTrafficForScene(targetScene: THREE.Scene): {
  group: THREE.Group;
  vehicles: TrafficVehicle[];
} {
  const group = new THREE.Group();
  group.name = 'civilian-traffic';
  targetScene.add(group);
  const vehicles: TrafficVehicle[] = [];

  const carColors = ['#f4f3ec', '#d93b3b', '#2f4b66', '#a5afb5', '#39634d', '#f0dc82', '#69557a', '#c28f3a'];
  const specs: { routeIndex: number; lane: 1 | -1; kind: 'bus' | 'taxi' | 'car'; colorIndex: number; speed: number; phase: number }[] = [
    { routeIndex: 0, lane: 1, kind: 'bus', colorIndex: 0, speed: 17, phase: 0.1 },
    { routeIndex: 0, lane: -1, kind: 'taxi', colorIndex: 5, speed: 23, phase: 0.4 },
    { routeIndex: 0, lane: 1, kind: 'car', colorIndex: 1, speed: 21, phase: 0.75 },
    { routeIndex: 0, lane: -1, kind: 'car', colorIndex: 2, speed: 20, phase: 0.9 },

    { routeIndex: 1, lane: 1, kind: 'taxi', colorIndex: 5, speed: 22, phase: 0.2 },
    { routeIndex: 1, lane: -1, kind: 'bus', colorIndex: 4, speed: 18, phase: 0.55 },
    { routeIndex: 1, lane: 1, kind: 'car', colorIndex: 3, speed: 24, phase: 0.8 },

    { routeIndex: 2, lane: 1, kind: 'car', colorIndex: 0, speed: 21, phase: 0.3 },
    { routeIndex: 2, lane: -1, kind: 'car', colorIndex: 6, speed: 19, phase: 0.7 },

    { routeIndex: 3, lane: 1, kind: 'bus', colorIndex: 2, speed: 16, phase: 0.15 },
    { routeIndex: 3, lane: -1, kind: 'car', colorIndex: 1, speed: 22, phase: 0.45 },
    { routeIndex: 3, lane: 1, kind: 'taxi', colorIndex: 5, speed: 25, phase: 0.85 },

    { routeIndex: 4, lane: 1, kind: 'taxi', colorIndex: 5, speed: 24, phase: 0.05 },
    { routeIndex: 4, lane: -1, kind: 'car', colorIndex: 7, speed: 20, phase: 0.4 },
    { routeIndex: 4, lane: 1, kind: 'car', colorIndex: 0, speed: 21, phase: 0.65 },
    { routeIndex: 4, lane: -1, kind: 'car', colorIndex: 3, speed: 22, phase: 0.92 },

    { routeIndex: 5, lane: 1, kind: 'car', colorIndex: 2, speed: 21, phase: 0.25 },
    { routeIndex: 5, lane: -1, kind: 'car', colorIndex: 1, speed: 23, phase: 0.75 },
  ];

  for (const s of specs) {
    const route = trafficRoutes[s.routeIndex];
    const isBus = s.kind === 'bus';
    const isTaxi = s.kind === 'taxi';
    const color = isTaxi ? '#f59e0b' : isBus ? '#2563eb' : carColors[s.colorIndex % carColors.length];
    const mesh = buildVehicle(color, isTaxi, isBus);
    group.add(mesh);
    vehicles.push({
      routeIndex: s.routeIndex,
      lane: s.lane,
      speed: s.speed,
      distance: route.length * s.phase,
      mesh,
    });
  }
  return { group, vehicles };
}

function stepSandboxEntities(
  dt: number,
  nowMs: number,
  vehicles: TrafficVehicle[],
  bakedVehicles: BakedVehicleState[],
  gondolas: GondolaState[],
  su30State: Su30FlightState | undefined,
  vfx: TokyoSandboxVfxController | undefined,
  playerWorldPos?: { x: number; z: number },
  districtCenter?: { x: number; z: number },
) {
  for (const v of vehicles) {
    const route = trafficRoutes[v.routeIndex];
    v.distance = (v.distance + v.speed * dt) % route.length;
    const t = v.lane === 1 ? v.distance : route.length - v.distance;
    const offset = v.lane * 2.2;
    v.mesh.position.set(
      route.startX + route.dirX * t + route.perpX * offset,
      0.22,
      route.startZ + route.dirZ * t + route.perpZ * offset,
    );
    v.mesh.rotation.y = Math.atan2(route.dirX * v.lane, route.dirZ * v.lane);
  }

  for (const bv of bakedVehicles) {
    const span = bv.maxCoord - bv.minCoord;
    bv.coord += bv.dir * bv.speed * dt;
    if (bv.coord > bv.maxCoord) bv.coord = bv.minCoord + ((bv.coord - bv.minCoord) % span);
    if (bv.coord < bv.minCoord) bv.coord = bv.maxCoord - ((bv.minCoord - bv.coord) % span);
    if (bv.axis === 'x') {
      bv.node.position.set(bv.coord, bv.y, bv.fixedCoord);
    } else {
      bv.node.position.set(bv.fixedCoord, bv.y, bv.coord);
    }
    bv.node.quaternion.copy(bv.initialQuat);
  }

  for (let i = 0; i < gondolas.length; i++) {
    const g = gondolas[i];
    g.phase = (g.phase + dt * 0.055) % 1;
    const wave = 0.5 - 0.42 * Math.cos(g.phase * Math.PI * 2);
    const gx = -24 + (10 - -24) * wave;
    const gy = 15 + (69.514 - 15) * wave - 1.25;
    const gz = -120 + (-188 - -120) * wave;
    g.node.position.set(gx, gy, gz);
    g.node.rotation.z = 0.025 * Math.sin(nowMs * 0.0022 + i * Math.PI);
  }

  if (su30State) {
    su30State.theta = (su30State.theta + dt * 0.26) % (Math.PI * 2);
    updateSu30Pose(su30State, nowMs);
  }

  vfx?.update(dt, nowMs, su30State?.node, playerWorldPos, districtCenter);
}

</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MapCharacterAvatar from './MapCharacterAvatar.vue';
import type { CharacterPortraitId } from './types';
import type { ProtagonistId } from '../runtime/dual-protagonists';
import { districtMapPlaces, isMapDistrict, type MapDistrictId } from './map-districts';
import type { MapCameraView } from './campus-map-layout';

type MapEvent = { id: string; kind: string; label: string; icon: string; title: string; detail: string; x: number; y: number };
type MapPerson = {
  contactId: string; name: string; personId?: string; portraitId?: CharacterPortraitId;
  protagonistId?: ProtagonistId; place?: { id: string };
  position?: { x: number; z: number }; source?: 'scene' | 'protagonist' | 'demo';
};
type Pin = { id: string; name: string; x: number; y: number };
type AnchoredPin = Pin & { anchorX: number; anchorY: number };
type DistrictPin = Pin & { available: boolean; selected: boolean };
type PlacePin = AnchoredPin & { disabled: boolean; current: boolean; number: number; compact: boolean };
type PersonPin = AnchoredPin & MapPerson;
type EventPin = AnchoredPin & { icon: string; kind: string; label: string; title: string };
type LeaderLine = { id: string; x1: number; y1: number; x2: number; y2: number };
const props = withDefaults(defineProps<{
  active: boolean; scope: TokyoScope; width: number; height: number;
  bearing: number; viewScale: number; selectedId: string;
  locationId: string; busy: boolean;
  position?: { x: number; z: number } | null;
  disabledIds?: string[];
  playerName?: string; playerId?: ProtagonistId;
  people?: MapPerson[]; roadEvents?: MapEvent[];
  pan?: { x: number; y: number };
  cameraView?: MapCameraView; decorative?: boolean; previewOnly?: boolean;
  atmosphereMode?: TokyoAtmosphereMode; clockMinutes?: number; refreshToken?: number;
}>(), {
  scope: 'city',
  position: null,
  disabledIds: () => [],
  people: () => [],
  roadEvents: () => [],
  atmosphereMode: 'auto',
  clockMinutes: 780,
  refreshToken: 0,
});
const emit = defineEmits<{
  select: [districtId: MapDistrictId];
  travel: [locationId: string]; event: [eventId: string];
  scale: [value: { metersPerPixel: number }];
}>();

// Static import makes a missing source GLB a build error, never a silent empty glob.
// Lite keeps this asset in the existing local asset ZIP.
const sceneRoot = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const canvasGeneration = ref(0);
const status = ref<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
const variant = ref<'glb' | 'procedural' | 'canvas'>('glb');
const activePreset = ref<ResolvedAtmospherePreset>('day');
const districtPins = ref<DistrictPin[]>([]);
const placePins = ref<PlacePin[]>([]);
const personPins = ref<PersonPin[]>([]);
const eventPins = ref<EventPin[]>([]);
const leaderLines = ref<LeaderLine[]>([]);
const playerPin = ref<Pin | null>(null);
const selectedPerson = ref('');
const cameraPosition = ref('');
const cameraFlying = ref(false);
type CameraFlight = {
  from: TokyoCameraPose;
  started: number;
  duration: number;
  frame: number;
  owner: Window;
};
let cameraFlight: CameraFlight | undefined;
let epoch = 0;
let renderer: THREE.WebGLRenderer | undefined;
let canvasRenderer: TokyoCanvasRenderer | undefined;
let appliedCanvasResolution: TokyoCanvasResolution | undefined;
let canvasOwner: Window | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let model: THREE.Group | undefined;
let trafficGroup: THREE.Group | undefined;
let hemiLight: THREE.HemisphereLight | undefined;
let sunLight: THREE.DirectionalLight | undefined;
let vfxController: TokyoSandboxVfxController | undefined;
let cinematicController: TokyoCinematicController | undefined;
let animFrame = 0;
let lastTick = 0;
let lastDraw = 0;
let reducedMotion = false;
let motionPreference: MediaQueryList | undefined;
let canvasPreferred = false;
let requestedEffectUntil = 0;

let trafficVehicles: TrafficVehicle[] = [];
let su30State: Su30FlightState | undefined;
let gondolaStates: GondolaState[] = [];
let bakedVehicleStates: BakedVehicleState[] = [];
let latestPlayerWorldPos: { x: number; z: number } | undefined;
let latestDistrictCenter: { x: number; z: number } | undefined;

function bindDynamicSceneNodes(root: THREE.Group) {
  const extracted = extractDynamicSceneNodes(root);
  su30State = extracted.su30State;
  gondolaStates = extracted.gondolaStates;
  bakedVehicleStates = extracted.bakedVehicleStates;
}

function initTraffic(targetScene: THREE.Scene) {
  if (trafficGroup) {
    disposeModel(trafficGroup);
    trafficGroup = undefined;
  }
  const created = createTrafficForScene(targetScene);
  trafficGroup = created.group;
  trafficVehicles = created.vehicles;
}

function animateTraffic(dt: number, nowMs = 0) {
  stepSandboxEntities(
    dt,
    nowMs,
    trafficVehicles,
    bakedVehicleStates,
    gondolaStates,
    su30State,
    vfxController,
    latestPlayerWorldPos,
    latestDistrictCenter,
  );
}

function loopAnimation(now: number) {
  if (status.value !== 'ready' || !camera || (!renderer && !canvasRenderer)) {
    animFrame = 0;
    return;
  }
  if (document.hidden || !props.active) { animFrame = 0; return; }
  if (lastDraw && now - lastDraw < 1000 / 30) {
    animFrame = requestAnimationFrame(loopAnimation); return;
  }
  lastDraw = now;
  const dt = Math.max(0, Math.min((now - (lastTick || now)) / 1000, 0.1));
  lastTick = now;
  if (renderer && (!reducedMotion || now < requestedEffectUntil)) animateTraffic(dt, now);
  cinematicController?.update(now, reducedMotion);
  if (!cameraFlight) {
    drawScene(now);
  }
  animFrame = requestAnimationFrame(loopAnimation);
}

const disposeModel = disposeThreeTree;

function stopCameraFlight() {
  const previous = cameraFlight;
  cameraFlight = undefined;
  if (previous?.frame) previous.owner.cancelAnimationFrame(previous.frame);
  cameraFlying.value = false;
}

function beginCameraFlight() {
  stopCameraFlight();
  const owner = canvas.value?.ownerDocument.defaultView;
  if (!camera || (!renderer && !canvasRenderer) || !props.active || props.decorative || !owner ||
      owner.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const flight: CameraFlight = {
    from: readTokyoCameraPose(camera),
    started: owner.performance.now(),
    duration: 440,
    frame: 0,
    owner,
  };
  cameraFlight = flight;
  cameraFlying.value = true;
  const step = () => {
    flight.frame = 0;
    if (cameraFlight !== flight) return;
    render();
    if (cameraFlight === flight) flight.frame = owner.requestAnimationFrame(step);
  };
  flight.frame = owner.requestAnimationFrame(step);
}

function release() {
  stopCameraFlight();
  epoch++;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = 0; }
  lastTick = 0; lastDraw = 0; requestedEffectUntil = 0;
  canvas.value?.removeEventListener('webglcontextlost', contextLost, true);
  districtPins.value = []; placePins.value = []; personPins.value = [];
  eventPins.value = []; leaderLines.value = []; playerPin.value = null;

  if (vfxController) { vfxController.dispose(); vfxController = undefined; }
  if (cinematicController) { cinematicController.dispose(); cinematicController = undefined; }
  if (canvasRenderer) { canvasRenderer.dispose(); canvasRenderer = undefined; }
  if (trafficGroup) { disposeModel(trafficGroup); trafficGroup = undefined; }
  trafficVehicles = [];
  su30State = undefined;
  gondolaStates = [];
  bakedVehicleStates = [];
  hemiLight = undefined;
  sunLight = undefined;
  if (model) disposeModel(model);
  model = undefined;
  // Also release any partially initialized effects left behind by a failed load.
  if (scene) disposeModel(scene);
  scene = undefined; camera = undefined;
  const previous = renderer; renderer = undefined;
  previous?.dispose(); previous?.forceContextLoss();
  if (canvas.value) { canvas.value.width = 1; canvas.value.height = 1; }
  appliedCanvasResolution = undefined;
  status.value = 'idle';
  selectedPerson.value = '';
  cameraPosition.value = '';
}

/** Use the same new layout when WebGL works but an optional development GLB is absent. */
function createGeometricPreview(): THREE.Group {
  const root = new THREE.Group();
  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: .9 }));
    mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  const backdrop = addBox(490, .3, 490, 25, -2.2, -20, '#a6bcae');
  backdrop.userData.tokyoBackdrop = true;
  for (const district of tokyoDistricts) {
    const baseColor = new THREE.Color(district.color).lerp(new THREE.Color('#c2cbb7'), .55);
    addBox(district.maxX - district.minX, .14, district.maxZ - district.minZ,
      (district.maxX + district.minX) / 2, -1.6, (district.maxZ + district.minZ) / 2, baseColor);
  }
  for (const road of [...sandboxData.roads, ...circleSandboxOverlay.roads]) {
    const item = addBox(road.width, .1, road.depth, road.x, -.95, road.z,
      road.kind === 'road' ? '#52676d' : '#e4dac1');
    item.rotation.y = road.rotationY ?? 0;
  }
  for (const building of [...sandboxData.buildings, ...circleSandboxOverlay.buildings]) {
    addBox(building.width, building.height, building.depth,
      building.x, building.height / 2, building.z, building.color);
  }
  const { mountains } = sandboxData;
  for (const [x, z, height] of [
    [mountains.x, mountains.z, mountains.height],
    [mountains.x - 40, mountains.z + 15, mountains.height * .75],
    [mountains.x + 38, mountains.z + 15, mountains.height * .62],
  ]) {
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(39, height, 7),
      new THREE.MeshStandardMaterial({ color: '#54765b', flatShading: true }));
    mountain.position.set(x, height / 2 - 1, z); root.add(mountain);
  }
  // Procedural Su-30SM2 preview jet so procedural fallback also has the patrolling aircraft
  const jet = new THREE.Group();
  jet.userData.isSu30 = true;
  jet.position.set(58.73, 51.95, 82.8);
  jet.scale.setScalar(1.38);
  const airframeMat = new THREE.MeshStandardMaterial({ color: '#5c768d', roughness: 0.45, metalness: 0.35 });
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 14), airframeMat);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.22, 4.4), airframeMat);
  wings.position.set(0, 0, -1.2);
  const plumeMat = new THREE.MeshStandardMaterial({ color: '#ff8a2b', emissive: '#ff5500', emissiveIntensity: 0.9 });
  const plumeL = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.8, 8), plumeMat);
  plumeL.rotation.x = -Math.PI / 2;
  plumeL.position.set(-0.95, -0.1, -10.3);
  const plumeR = plumeL.clone();
  plumeR.position.set(0.95, -0.1, -10.3);
  jet.add(fuselage, wings, plumeL, plumeR);
  root.add(jet);
  return root;
}

/** Both display backends consume the same camera; map gestures and pins never fork. */
function drawScene(now = performance.now()) {
  if (!camera) return;
  if (canvasRenderer) {
    canvasRenderer.render(camera, {
      width: Math.max(1, props.width), height: Math.max(1, props.height),
      mode: props.atmosphereMode, clockMinutes: props.clockMinutes,
      scope: props.scope,
      selectedDistrict: props.scope === 'city' ? props.selectedId : props.scope,
      time: Math.max(0, now), reducedMotion,
    });
  } else if (renderer && scene) renderer.render(scene, camera);
}

function render() {
  if (!props.active || (!renderer && !canvasRenderer) || !camera) return;
  const width = Math.max(1, props.width), height = Math.max(1, props.height);
  const bounds = tokyoDistrictBounds(props.scope);
  const chosenDistrict = props.scope === 'city'
    ? undefined : tokyoDistricts.find(district => district.id === props.scope);
  const highlightDistrict = props.scope === 'city'
    ? tokyoDistricts.find(district => district.id === props.selectedId)
    : chosenDistrict;
  latestDistrictCenter = highlightDistrict ? { x: highlightDistrict.x, z: highlightDistrict.z } : undefined;

  const cameraCenter = props.cameraView?.center
    ? projectOldTokyoPosition(props.cameraView.center)
    : chosenDistrict ? { x: chosenDistrict.x, z: chosenDistrict.z } : undefined;
  // WorldMap owns input, but the drag/zoom must move this 3D camera rather than
  // CSS-transforming the whole canvas and leaving its projected pins behind.
  const mapZoom = Math.max(.65, Math.min(12,
    (props.cameraView?.zoom ?? props.viewScale) * (props.decorative ? 1 : 1.08)));
  frameTokyoMapCamera(camera, {
    bounds, width, height, bearing: props.bearing, zoom: mapZoom,
    pan: props.pan, center: cameraCenter, overhead: props.cameraView?.overhead,
    summit: { x: sandboxData.mountains.x, y: sandboxData.mountains.height, z: sandboxData.mountains.z },
  });
  const flight = cameraFlight;
  if (flight) {
    const elapsed = (flight.owner.performance.now() - flight.started) / flight.duration;
    const progress = Math.min(1, Math.max(0, elapsed));
    if (progress < 1) {
      const targetPose = readTokyoCameraPose(camera);
      const eased = 1 - (1 - progress) ** 3;
      applyTokyoCameraFlight(camera, flight.from, targetPose, eased);
    } else stopCameraFlight();
  }
  const metersPerPixel = measureTokyoGroundScale(camera, width, height);
  cameraPosition.value = camera.position.toArray().map(value => value.toFixed(2)).join(',');
  // Keep the native backing resolution in overview, during a camera flight,
  // and when zoomed in. Only reallocate the WebGL buffer for a real resize or
  // device-pixel-ratio change, never for a camera gesture or animation frame.
  const resolution = nativeTokyoCanvasResolution(
    width, height, canvas.value?.ownerDocument.defaultView?.devicePixelRatio,
  );
  if (renderer) {
    appliedCanvasResolution = applyTokyoCanvasResolution(renderer, resolution, appliedCanvasResolution);
  }

  const positionHint = props.scope === 'city' ? undefined : props.scope;
  const player = props.position ? projectOldTokyoPosition(props.position, positionHint)
    : tokyoLocationPosition(props.locationId, positionHint);
  latestPlayerWorldPos = player ? { x: player.x, z: player.z } : undefined;

  drawScene();
  if (props.decorative) {
    districtPins.value = []; placePins.value = []; personPins.value = [];
    eventPins.value = []; leaderLines.value = []; playerPin.value = null;
    return;
  }

  function project(x: number, z: number, elevation = 3) {
    const p = new THREE.Vector3(x, elevation, z).project(camera!);
    return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2,
      visible: p.z > -1 && p.z < 1 && p.x > -.94 && p.x < .94 && p.y > -.93 && p.y < .93 };
  }
  if (props.scope === 'city') {
    districtPins.value = tokyoDistricts.flatMap(district => {
      const p = project(district.x, district.z, 16);
      return p.visible ? [{
        id: district.id, name: district.shortName, x: p.x, y: p.y,
        available: isMapDistrict(district.id), selected: props.selectedId === district.id,
      }] : [];
    });
  } else {
    districtPins.value = [];
  }

  const places = props.scope === 'city' ? [] : districtMapPlaces(props.scope);
  const occupiedPlaces: { x: number; y: number }[] = [];
  const separate = (anchor: { x: number; y: number }, occupied: { x: number; y: number }[], gap: number, offsets: number[][]) => {
    const placed = offsets
      .map(([dx, dy]) => ({
        x: Math.max(24, Math.min(width - 24, anchor.x + dx)),
        y: Math.max(24, Math.min(height - 24, anchor.y + dy)),
      }))
      .find(cand => occupied.every(other => Math.hypot(cand.x - other.x, cand.y - other.y) >= gap))
      ?? { x: anchor.x, y: anchor.y };
    occupied.push(placed);
    return placed;
  };
  placePins.value = places.flatMap((place, index) => {
    const point = tokyoLocationPosition(place.id, positionHint);
    if (!point) return [];
    const p = project(point.x, point.z, TOKYO_PIN_ELEVATION);
    if (!p.visible) return [];
    const compact = index >= 6 || width < 520;
    const placed = separate(p, occupiedPlaces, compact ? 26 : 34, [
      [0, 0], [0, -26], [0, 26], [-32, -16], [32, -16], [-32, 16], [32, 16], [0, -48], [0, 48],
    ]);
    return [{
      id: place.id, name: place.name, x: placed.x, y: placed.y, anchorX: p.x, anchorY: p.y,
      compact, number: index + 1,
      current: place.id === props.locationId,
      disabled: props.busy || place.id === props.locationId || props.disabledIds.includes(place.id),
    }];
  });
  const playerScreen = player ? project(player.x, player.z, TOKYO_PIN_ELEVATION) : null;
  playerPin.value = playerScreen?.visible
    ? { id: 'player', name: props.playerName || '当前位置', x: playerScreen.x, y: playerScreen.y } : null;

  const busyPins: { x: number; y: number }[] = playerPin.value ? [playerPin.value] : [];
  personPins.value = props.scope === 'city' ? [] : props.people.flatMap(person => {
    const world = person.position
      ? projectOldTokyoPosition(person.position, positionHint)
      : (person.place ? tokyoLocationPosition(person.place.id, positionHint) : undefined);
    if (!world) return [];
    const point = project(world.x, world.z, TOKYO_PIN_ELEVATION);
    if (!point.visible) return [];
    const chosen = separate(point, busyPins, 44, [[0, 0], [-46, 0], [46, 0], [0, -46], [0, 46], [-46, -46], [46, -46]]);
    return [{ ...person, id: person.contactId, name: person.name, x: chosen.x, y: chosen.y, anchorX: point.x, anchorY: point.y }];
  });
  const eventOccupied = [...placePins.value.map(pin => ({ x: pin.x, y: pin.y })), ...busyPins];
  eventPins.value = props.scope === 'city' ? [] : props.roadEvents.flatMap(event => {
    const destination = tokyoLocationPosition(event.id, positionHint);
    const world = destination && player
      ? { x: (destination.x + player.x) / 2, z: (destination.z + player.z) / 2 }
      : projectOldTokyoPosition({ x: event.x, z: event.y }, positionHint);
    const p = project(world.x, world.z, TOKYO_PIN_ELEVATION);
    if (!p.visible) return [];
    const placed = separate(p, eventOccupied, 36, [
      [0, 0], [0, -28], [0, 28], [-28, 0], [28, 0],
    ]);
    return [{
      id: event.id, name: event.icon, icon: event.icon, kind: event.kind,
      label: event.label, title: event.title,
      x: placed.x, y: placed.y, anchorX: p.x, anchorY: p.y,
    }];
  });
  const leaderFor = (id: string, pin: AnchoredPin) => Math.hypot(pin.x - pin.anchorX, pin.y - pin.anchorY) > 2
    ? [{ id, x1: pin.anchorX, y1: pin.anchorY, x2: pin.x, y2: pin.y }] : [];
  leaderLines.value = [
    ...placePins.value.flatMap(pin => leaderFor('place:' + pin.id, pin)),
    ...personPins.value.flatMap(pin => leaderFor('person:' + pin.contactId, pin)),
    ...eventPins.value.flatMap(pin => leaderFor('event:' + pin.id, pin)),
  ];
  emit('scale', { metersPerPixel });
}

/**
 * Direct 3D ground/landmark picking when the user clicks or taps on the 3D canvas
 * near a district landmark (city layer) or place building (district layer).
 */
function pickAt(clientX: number, clientY: number): boolean {
  if (!camera || !canvas.value || status.value !== 'ready' || props.decorative) return false;
  const rect = canvas.value.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return false;

  // 1. Check screen-space proximity to projected pins first (generous touch halo for mobile)
  if (props.scope === 'city') {
    let bestDistrict: DistrictPin | undefined;
    let bestDist = 44;
    for (const d of districtPins.value) {
      if (!d.available) continue;
      const dist = Math.hypot(d.x - localX, d.y - localY);
      if (dist < bestDist) {
        bestDist = dist;
        bestDistrict = d;
      }
    }
    if (bestDistrict) {
      selectDistrict(bestDistrict.id);
      return true;
    }
  } else {
    let bestPlace: PlacePin | undefined;
    let bestDist = 36;
    for (const p of placePins.value) {
      if (p.disabled) continue;
      const dist = Math.hypot(p.x - localX, p.y - localY);
      if (dist < bestDist) {
        bestDist = dist;
        bestPlace = p;
      }
    }
    if (bestPlace) {
      emit('travel', bestPlace.id);
      return true;
    }
  }

  // 2. Intersect ray with the 3D landmark plane (y = 8) to allow tapping directly on 3D buildings/blocks
  const ndc = new THREE.Vector2((localX / rect.width) * 2 - 1, -(localY / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -8), new THREE.Vector3());
  if (!hit) return false;

  if (props.scope === 'city') {
    let chosen: typeof tokyoDistricts[number] | undefined;
    let bestScore = Infinity;
    for (const d of tokyoDistricts) {
      if (!isMapDistrict(d.id)) continue;
      const insideBox = hit.x >= d.minX && hit.x <= d.maxX && hit.z >= d.minZ && hit.z <= d.maxZ;
      const dist = Math.hypot(hit.x - d.x, hit.z - d.z);
      if ((insideBox || dist <= 48) && dist < bestScore) {
        bestScore = dist;
        chosen = d;
      }
    }
    if (chosen) {
      selectDistrict(chosen.id);
      return true;
    }
  } else {
    const places = districtMapPlaces(props.scope);
    let chosenId = '';
    let bestDist = 26;
    for (const place of places) {
      const disabled = props.busy || place.id === props.locationId || props.disabledIds.includes(place.id);
      if (disabled) continue;
      const pt = tokyoLocationPosition(place.id, props.scope);
      if (!pt) continue;
      const dist = Math.hypot(hit.x - pt.x, hit.z - pt.z);
      if (dist < bestDist) {
        bestDist = dist;
        chosenId = place.id;
      }
    }
    if (chosenId) {
      emit('travel', chosenId);
      return true;
    }
  }
  return false;
}

function triggerFlares() {
  if (canvasRenderer) canvasRenderer.triggerFlares();
  else if (vfxController) {
    // A deliberate effects action still completes when ambient motion is paused.
    requestedEffectUntil = performance.now() + 3400;
    vfxController.triggerSu30Flares(su30State?.node);
  }
}

function contextLost(event: Event) {
  event.preventDefault(); event.stopImmediatePropagation();
  if (event.target !== canvas.value || !renderer) return;
  void loadCanvasFallback();
}
function refresh() { canvasPreferred = false; release(); return load(); }
function visibilityChanged() {
  if (document.hidden) release(); else if (props.active) void load();
}
function motionPreferenceChanged(event: MediaQueryListEvent) {
  reducedMotion = event.matches;
  if (reducedMotion) stopCameraFlight();
  cinematicController?.update(performance.now(), reducedMotion);
  render();
}
defineExpose({ pickAt, triggerFlares, refresh });

function startAnimation() {
  if (animFrame) return;
  lastTick = performance.now();
  animFrame = requestAnimationFrame(loopAnimation);
}

/** A context cannot change from WebGL to 2D; mount a fresh canvas before retrying. */
async function loadCanvasFallback() {
  release();
  canvasPreferred = true;
  if (!props.active || document.hidden || !sceneRoot.value) return;
  const request = ++epoch;
  status.value = 'loading';
  canvasGeneration.value++;
  await nextTick();
  if (request !== epoch || !props.active || !canvas.value) return;
  try {
    canvasRenderer = createTokyoCanvasRenderer(canvas.value);
    camera = new THREE.PerspectiveCamera(50, 1, .25, 6500);
    variant.value = 'canvas';
    activePreset.value = resolveTokyoAtmosphere(props.atmosphereMode, props.clockMinutes).preset;
    status.value = 'ready';
    render();
    startAnimation();
  } catch (error) {
    if (request !== epoch) return;
    console.warn('[UnreadCity] Tokyo map canvas unavailable', error);
    release(); status.value = 'fallback';
  }
}

async function load() {
  if (!props.active || document.hidden || !sceneRoot.value || renderer || canvasRenderer || status.value === 'loading') return;
  if (canvasPreferred) return loadCanvasFallback();
  const request = ++epoch;
  status.value = 'loading';
  let pending: THREE.Group | undefined;
  let pendingVariant: 'glb' | 'procedural' = 'glb';
  try {
    canvasGeneration.value++;
    await nextTick();
    if (request !== epoch || !props.active || !canvas.value) return;
    // Detect missing GPU support before decoding the multi-megabyte offline model.
    canvas.value.addEventListener('webglcontextlost', contextLost, true);
    renderer = new THREE.WebGLRenderer({
      canvas: canvas.value,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const bundled = bundledTokyoAssetSources.values().next().value;
    if (props.previewOnly) {
      pending = createGeometricPreview();
      pendingVariant = 'procedural';
    } else if (bundled) {
      try {
        pending = await loadTokyoGlb(bundled);
      } catch (error) {
        if (request !== epoch || !props.active) return;
        console.warn('[UnreadCity] Tokyo GLB decode failed, showing geometric preview', error);
        pending = createGeometricPreview();
        pendingVariant = 'procedural';
      }
    } else {
      pending = createGeometricPreview();
      pendingVariant = 'procedural';
    }
    if (request !== epoch || !props.active) { disposeModel(pending); return; }

    if (!canvas.value) { disposeModel(pending); return; }
    variant.value = pendingVariant;
    model = pending; pending = undefined;
    scene = new THREE.Scene();
    scene.add(model);
    hemiLight = new THREE.HemisphereLight(0xffffff, 0x6e837b, 2.5);
    scene.add(hemiLight);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-170, 460, 230); scene.add(sun);
    sunLight = sun;
    camera = new THREE.PerspectiveCamera(50, 1, .25, 6500);

    bindDynamicSceneNodes(model);
    initTraffic(scene);
    vfxController = createTokyoSandboxVfx(scene, renderer, model, hemiLight, sunLight);
    const profile = vfxController.setAtmosphere(props.atmosphereMode, props.clockMinutes);
    cinematicController = createTokyoSandboxCinematic(scene, model);
    cinematicController.setAtmosphere(profile);
    activePreset.value = profile.preset;
    animateTraffic(0, reducedMotion ? 0 : performance.now());

    status.value = 'ready';
    render();

    startAnimation();
  } catch (error) {
    if (pending) disposeModel(pending);
    if (request === epoch) {
      console.warn('[UnreadCity] Tokyo map WebGL unavailable', error);
      await loadCanvasFallback();
    }
  }
}
function selectDistrict(id: string) { if (isMapDistrict(id)) emit('select', id); }

watch(() => props.active, active => { if (active) void load(); else release(); });
watch(() => props.refreshToken, () => { void refresh(); });
watch(() => [props.atmosphereMode, props.clockMinutes] as const, ([mode, mins]) => {
  const profile = vfxController?.setAtmosphere(mode, mins) ?? resolveTokyoAtmosphere(mode, mins);
  cinematicController?.setAtmosphere(profile);
  activePreset.value = profile.preset;
  render();
});
watch(() => ({
  scope: props.scope, width: props.width, height: props.height,
  bearing: props.bearing, zoom: props.viewScale,
  panX: props.pan?.x ?? 0, panY: props.pan?.y ?? 0,
  selectedId: props.selectedId, locationId: props.locationId, position: props.position,
  busy: props.busy, disabledIds: props.disabledIds, playerId: props.playerId, playerName: props.playerName,
  people: props.people, roadEvents: props.roadEvents,
  cameraView: props.cameraView, decorative: props.decorative,
}), (next, previous) => {
  if (next.scope !== previous.scope) {
    // Same GLB, same WebGL canvas; change the 3D camera to visit the landmark.
    beginCameraFlight();
  } else if (cameraFlight &&
    (next.width !== previous.width || next.height !== previous.height ||
     next.bearing !== previous.bearing || next.zoom !== previous.zoom ||
     next.panX !== previous.panX || next.panY !== previous.panY ||
     next.cameraView !== previous.cameraView)) {
    // A new user gesture supersedes a scripted camera flight.
    stopCameraFlight();
  }
  render();
});
onMounted(() => {
  canvasOwner = (canvas.value ?? sceneRoot.value)?.ownerDocument.defaultView ?? undefined;
  motionPreference = canvasOwner?.matchMedia?.('(prefers-reduced-motion: reduce)');
  reducedMotion = motionPreference?.matches ?? false;
  motionPreference?.addEventListener('change', motionPreferenceChanged);
  // Moving between monitors or changing the browser's display scale may alter
  // DPR without changing the map panel's CSS dimensions.
  canvasOwner?.addEventListener('resize', render);
  document.addEventListener('visibilitychange', visibilityChanged);
  if (props.active) void load();
});
onBeforeUnmount(() => {
  motionPreference?.removeEventListener('change', motionPreferenceChanged);
  motionPreference = undefined;
  canvasOwner?.removeEventListener('resize', render);
  canvasOwner = undefined;
  document.removeEventListener('visibilitychange', visibilityChanged);
  release();
});
</script>

<template>
  <div ref="sceneRoot" class="tokyo-sandbox-scene" :data-tokyo-sandbox-status="status"
    :data-tokyo-sandbox-model="variant" :data-tokyo-sandbox-scope="scope"
    :data-tokyo-atmosphere="activePreset"
    :data-tokyo-camera="cameraPosition" :data-tokyo-camera-flight="cameraFlying ? 'flying' : 'idle'">
    <canvas :key="canvasGeneration" ref="canvas" v-show="status === 'ready'" class="tokyo-sandbox-canvas" aria-hidden="true" />
    <p v-if="status === 'loading'" class="tokyo-sandbox-fallback" role="status">正在展开立体沙盘…</p>
    <p v-if="status === 'fallback'" class="tokyo-sandbox-fallback" role="status">沙盘暂不可用，可以刷新重试，或从地点列表选择目的地。</p>
    <template v-if="status === 'ready'">
      <svg v-if="leaderLines.length" class="tokyo-sandbox-leaders" aria-hidden="true">
        <line v-for="line in leaderLines" :key="line.id" :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" />
      </svg>
      <button v-for="district in districtPins.filter(item => item.available)" :key="district.id"
        type="button" class="tokyo-sandbox-pin tokyo-sandbox-district"
        :class="{ selected: district.selected }"
        :style="{ left: district.x + 'px', top: district.y + 'px' }"
        :data-map-target="'city:' + district.id" @click="selectDistrict(district.id)">{{ district.name }}</button>
      <span v-for="district in districtPins.filter(item => !item.available)" :key="district.id"
        class="tokyo-sandbox-caption" :style="{ left: district.x + 'px', top: district.y + 'px' }">{{ district.name }}</span>
      <button v-for="place in placePins" :key="place.id" type="button"
        class="tokyo-sandbox-pin tokyo-sandbox-place" :class="{ current: place.current, compact: place.compact }"
        :data-map-target="place.id" :data-map-location="place.id"
        :style="{ left: place.x + 'px', top: place.y + 'px' }"
        :title="place.name" :aria-label="place.current ? place.name + '，当前位置' : '前往' + place.name"
        :disabled="place.disabled" @click="emit('travel', place.id)">
        <span class="tokyo-sandbox-place-index">{{ place.number }}</span>
        <span v-if="!place.compact">{{ place.name }}</span>
      </button>
      <button v-for="event in eventPins" :key="event.id" type="button" class="tokyo-sandbox-event"
        :class="{ special: event.kind === 'special' }"
        :data-map-target="'event:' + event.id" data-map-event :data-event-kind="event.kind"
        :style="{ left: event.x + 'px', top: event.y + 'px' }"
        :title="event.title" :aria-label="event.label"
        @click="emit('event', event.id)"><span>{{ event.icon }}</span></button>
      <button v-if="playerPin" type="button" class="tokyo-sandbox-avatar tokyo-sandbox-player"
        :style="{ left: playerPin.x + 'px', top: playerPin.y + 'px' }"
        :aria-label="'当前位置：' + playerPin.name" data-map-player @click="selectedPerson = ''">
        <MapCharacterAvatar :name="playerPin.name" :protagonist-id="playerId" />
      </button>
      <button v-for="person in personPins" :key="person.contactId" type="button"
        class="tokyo-sandbox-avatar tokyo-sandbox-person"
        :class="{ selected: selectedPerson === person.contactId }"
        :data-map-person-id="person.contactId"
        :aria-label="'查看人物：' + person.name"
        :style="{ left: person.x + 'px', top: person.y + 'px' }"
        @click="selectedPerson = selectedPerson === person.contactId ? '' : person.contactId">
        <MapCharacterAvatar :name="person.name" :person-id="person.personId"
          :portrait-id="person.portraitId" :protagonist-id="person.protagonistId" />
      </button>
      <div v-if="selectedPerson && personPins.some(person => person.contactId === selectedPerson)"
        class="tokyo-sandbox-person-detail" role="status">
        {{ personPins.find(person => person.contactId === selectedPerson)?.name }}
        <button type="button" @click="selectedPerson = ''">×</button>
      </div>
    </template>
  </div>
</template>
