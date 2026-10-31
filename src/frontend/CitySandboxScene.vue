<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import MapCharacterAvatar from './MapCharacterAvatar.vue';
import type { CharacterPortraitId } from './types';
import type { ProtagonistId } from '../runtime/dual-protagonists';
import { districtMapPlaces, isMapDistrict, type MapDistrictId } from './map-districts';
import { mapLocationPoint, type MapCameraView } from './campus-map-layout';
import {
  projectOldTokyoPosition, tokyoDistrictBounds,
  tokyoDistricts, tokyoLocationPosition, TOKYO_SANDBOX_MODEL_SHA256, type TokyoScope,
} from './tokyo-sandbox-map';
import sandboxData from '../../assets/models/unread-city-tokyo-sandbox-data.json';
import { readLocalAssetBytes } from './local-asset-buffer';
import {
  applyTokyoCanvasResolution, nativeTokyoCanvasResolution,
  type TokyoCanvasResolution,
} from './tokyo-sandbox-resolution';
import {
  applyTokyoCameraFlight, frameTokyoMapCamera, measureTokyoGroundScale,
  readTokyoCameraPose, type TokyoCameraPose,
} from './tokyo-sandbox-camera';
import tokyoModelAsset from '../../assets/models/unread-city-tokyo-sandbox.glb?inline';

type MapEvent = { id: string; kind: string; label: string; icon: string; x: number; y: number };
type MapPerson = {
  contactId: string; name: string; personId?: string; portraitId?: CharacterPortraitId;
  protagonistId?: ProtagonistId; place?: { id: string };
  position?: { x: number; z: number }; source?: 'scene' | 'protagonist' | 'demo';
};
type Pin = { id: string; name: string; x: number; y: number };
type DistrictPin = Pin & { available: boolean; selected: boolean };
type PlacePin = Pin & { disabled: boolean; current: boolean; number: number; compact: boolean };
type PersonPin = Pin & MapPerson;
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
}>(), { scope: 'city', position: null, disabledIds: () => [], people: () => [], roadEvents: () => [] });
const emit = defineEmits<{
  select: [districtId: MapDistrictId];
  travel: [locationId: string]; event: [eventId: string];
  scale: [value: { metersPerPixel: number }];
}>();

// Static import makes a missing source GLB a build error, never a silent empty glob.
// Lite extracts this data URL into unread-city-tokyo-sandbox.zip, not the main Lite ZIP.
const canvas = ref<HTMLCanvasElement>();
const status = ref<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
const variant = ref<'glb' | 'procedural'>('glb');
const districtPins = ref<DistrictPin[]>([]);
const placePins = ref<PlacePin[]>([]);
const personPins = ref<PersonPin[]>([]);
const eventPins = ref<Pin[]>([]);
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
let appliedCanvasResolution: TokyoCanvasResolution | undefined;
let canvasOwner: Window | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let model: THREE.Group | undefined;

function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const texture of textures) {
    const bitmap: unknown = texture.source?.data;
    texture.dispose();
    if (bitmap && typeof bitmap === 'object' && 'close' in bitmap &&
        typeof bitmap.close === 'function') bitmap.close();
  }
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  root.removeFromParent();
}

function stopCameraFlight() {
  const previous = cameraFlight;
  cameraFlight = undefined;
  if (previous?.frame) previous.owner.cancelAnimationFrame(previous.frame);
  cameraFlying.value = false;
}

function beginCameraFlight() {
  stopCameraFlight();
  const owner = canvas.value?.ownerDocument.defaultView;
  if (!camera || !renderer || !props.active || props.decorative || !owner ||
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
  districtPins.value = []; placePins.value = []; personPins.value = [];
  eventPins.value = []; playerPin.value = null;
  if (model) disposeModel(model);
  model = undefined; scene?.clear(); scene = undefined; camera = undefined;
  renderer?.dispose(); renderer = undefined;
  appliedCanvasResolution = undefined;
  status.value = 'idle';
  selectedPerson.value = '';
  cameraPosition.value = '';
}

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

/** Use the same new layout when WebGL works but an optional development GLB is absent. */
function createGeometricPreview(): THREE.Group {
  const root = new THREE.Group();
  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.ColorRepresentation) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: .9 }));
    mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  addBox(490, .3, 490, 25, -2.2, -20, '#a6bcae');
  for (const district of tokyoDistricts) {
    const baseColor = new THREE.Color(district.color).lerp(new THREE.Color('#c2cbb7'), .55);
    addBox(district.maxX - district.minX, .14, district.maxZ - district.minZ,
      (district.maxX + district.minX) / 2, -1.6, (district.maxZ + district.minZ) / 2, baseColor);
  }
  for (const road of sandboxData.roads) {
    const item = addBox(road.width, .1, road.depth, road.x, -.95, road.z,
      road.kind === 'road' ? '#52676d' : '#e4dac1');
    item.rotation.y = road.rotationY ?? 0;
  }
  for (const building of sandboxData.buildings) {
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
  return root;
}

function render() {
  if (!props.active || !renderer || !scene || !camera) return;
  const width = Math.max(1, props.width), height = Math.max(1, props.height);
  const bounds = tokyoDistrictBounds(props.scope);
  const chosenDistrict = props.scope === 'city'
    ? undefined : tokyoDistricts.find(district => district.id === props.scope);
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
  appliedCanvasResolution = applyTokyoCanvasResolution(renderer, resolution, appliedCanvasResolution);
  renderer.render(scene, camera);
  if (props.decorative) {
    districtPins.value = []; placePins.value = []; personPins.value = [];
    eventPins.value = []; playerPin.value = null;
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
  placePins.value = places.flatMap((place, index) => {
    const point = tokyoLocationPosition(place.id, props.scope === 'city' ? undefined : props.scope);
    if (!point) return [];
    const p = project(point.x, point.z, 9);
    if (!p.visible) return [];
    return [{
      id: place.id, name: place.name, x: p.x, y: p.y,
      compact: index >= 6, number: index + 1,
      current: place.id === props.locationId,
      disabled: props.busy || place.id === props.locationId || props.disabledIds.includes(place.id),
    }];
  });
  const player = props.position ? projectOldTokyoPosition(props.position, props.scope === 'city' ? undefined : props.scope)
    : tokyoLocationPosition(props.locationId, props.scope === 'city' ? undefined : props.scope);
  const playerScreen = player ? project(player.x, player.z, 16) : null;
  playerPin.value = playerScreen?.visible
    ? { id: 'player', name: props.playerName || '当前位置', x: playerScreen.x, y: playerScreen.y } : null;

  const busyPins: { x: number; y: number }[] = playerPin.value ? [playerPin.value] : [];
  personPins.value = props.scope === 'city' ? [] : props.people.flatMap(person => {
    const original = person.position ??
      (person.place ? mapLocationPoint(person.place.id) : undefined);
    if (!original) return [];
    const result = projectOldTokyoPosition(original, props.scope === 'city' ? undefined : props.scope);
    const point = project(result.x, result.z, 16);
    if (!point.visible) return [];
    const offsets = [[0, 0], [-46, 0], [46, 0], [0, -46], [0, 46], [-46, -46], [46, -46]];
    const chosen = offsets.map(([dx, dy]) => ({ x: Math.max(22, Math.min(width - 22, point.x + dx)),
      y: Math.max(22, Math.min(height - 22, point.y + dy)) }))
      .find(candidate => busyPins.every(other => Math.hypot(candidate.x - other.x, candidate.y - other.y) >= 44)) ??
      { x: point.x, y: point.y };
    busyPins.push(chosen);
    return [{ ...person, id: person.contactId, x: chosen.x, y: chosen.y }];
  });
  eventPins.value = props.scope === 'city' ? [] : props.roadEvents.flatMap(event => {
    const point = projectOldTokyoPosition({ x: event.x, z: event.y }, props.scope === 'city' ? undefined : props.scope);
    const p = project(point.x, point.z, 4);
    return p.visible ? [{ id: event.id, name: event.icon, x: p.x, y: p.y }] : [];
  });
  emit('scale', { metersPerPixel });
}

async function load() {
  if (!props.active || !canvas.value || renderer || status.value === 'loading') return;
  const request = ++epoch;
  status.value = 'loading';
  let pending: THREE.Group | undefined;
  try {
    const bundled = tokyoModelAsset;
    if (props.previewOnly) {
      pending = createGeometricPreview();
      variant.value = 'procedural';
    } else if (bundled) {
      try {
        const bytes = await readLocalAssetBytes(bundled, 10_000_000, 'Invalid offline Tokyo model');
        if (await sandboxSha256(bytes) !== TOKYO_SANDBOX_MODEL_SHA256) {
          throw new Error('Tokyo sandbox pack hash mismatch');
        }
        checkGlb(bytes);
        const manager = new THREE.LoadingManager();
        manager.setURLModifier(url => {
          if (!url.startsWith('blob:')) throw new Error('External Tokyo model resource blocked');
          return url;
        });
        pending = (await new GLTFLoader(manager).parseAsync(bytes.buffer, '')).scene;
        variant.value = 'glb';
      } catch (error) {
        console.warn('[UnreadCity] Tokyo GLB decode failed, showing geometric preview', error);
        pending = createGeometricPreview();
        variant.value = 'procedural';
      }
    } else {
      pending = createGeometricPreview();
      variant.value = 'procedural';
    }
    if (request !== epoch || !props.active) { disposeModel(pending); return; }
    model = pending; pending = undefined;
    scene = new THREE.Scene();
    scene.add(model);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6e837b, 2.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-170, 460, 230); scene.add(sun);
    camera = new THREE.PerspectiveCamera(50, 1, .25, 6500);
    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    status.value = 'ready';
    render();
  } catch (error) {
    if (pending) disposeModel(pending);
    if (request === epoch) {
      console.warn('[UnreadCity] Tokyo map WebGL unavailable', error);
      release(); status.value = 'fallback';
    }
  }
}
function selectDistrict(id: string) { if (isMapDistrict(id)) emit('select', id); }

watch(() => props.active, active => { if (active) void load(); else release(); });
watch(() => ({
  scope: props.scope, width: props.width, height: props.height,
  bearing: props.bearing, zoom: props.viewScale,
  panX: props.pan?.x ?? 0, panY: props.pan?.y ?? 0,
  selectedId: props.selectedId, locationId: props.locationId, position: props.position,
  disabledIds: props.disabledIds, playerId: props.playerId, playerName: props.playerName,
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
  canvasOwner = canvas.value?.ownerDocument.defaultView ?? undefined;
  // Moving between monitors or changing the browser's display scale may alter
  // DPR without changing the map panel's CSS dimensions.
  canvasOwner?.addEventListener('resize', render);
  if (props.active) void load();
});
onBeforeUnmount(() => {
  canvasOwner?.removeEventListener('resize', render);
  canvasOwner = undefined;
  release();
});
</script>

<template>
  <div class="tokyo-sandbox-scene" :data-tokyo-sandbox-status="status"
    :data-tokyo-sandbox-model="variant" :data-tokyo-sandbox-scope="scope"
    :data-tokyo-camera="cameraPosition" :data-tokyo-camera-flight="cameraFlying ? 'flying' : 'idle'">
    <canvas ref="canvas" v-show="status === 'ready'" class="tokyo-sandbox-canvas" aria-hidden="true" />
    <p v-if="status === 'fallback'" class="tokyo-sandbox-fallback" role="status">沙盘暂不可用，请从右侧地点列表选择目的地。</p>
    <template v-if="status === 'ready'">
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
        :data-map-target="'event:' + event.id" :style="{ left: event.x + 'px', top: event.y + 'px' }"
        @click="emit('event', event.id)">{{ event.name }}</button>
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
