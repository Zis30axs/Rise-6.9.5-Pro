<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import sandboxData from '../../assets/models/unread-city-tokyo-sandbox-data.json';
import CampusMapScene from './CampusMapScene.vue';
import { isMapDistrict, type MapDistrictId } from './map-districts';
import { readLocalAssetBytes } from './local-asset-buffer';

const props = withDefaults(defineProps<{
  active: boolean;
  width: number;
  height: number;
  bearing: number;
  viewScale: number;
  selectedId: string;
  locationId: string;
  busy: boolean;
  position?: { x: number; z: number } | null;
}>(), { position: null });
const emit = defineEmits<{ select: [district: MapDistrictId]; scale: [value: { metersPerPixel: number }] }>();

// Deliberately optional: the binary is distributed locally with the offline resource pack.
// Without the binary, build a geometric city from the same bundled JSON.
const bundledModels = import.meta.glob<string>('../../assets/models/unread-city-tokyo-sandbox.glb', {
  query: '?inline',
  import: 'default',
});
type Pin = { id: string; name: string; x: number; y: number; visible: boolean; available: boolean; selected: boolean };
const canvas = ref<HTMLCanvasElement>();
const status = ref<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
const pins = ref<Pin[]>([]);
let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.OrthographicCamera | undefined;
let model: THREE.Group | undefined;
let modelVariant: 'glb' | 'procedural' = 'procedural';
let epoch = 0;
const cityBounds = {
  minX: Math.min(...sandboxData.districts.map(d => d.minX)),
  maxX: Math.max(...sandboxData.districts.map(d => d.maxX)),
  minZ: Math.min(...sandboxData.districts.map(d => d.minZ)),
  maxZ: Math.max(...sandboxData.districts.map(d => d.maxZ)),
};
const center = new THREE.Vector3((cityBounds.minX + cityBounds.maxX) / 2, 0, (cityBounds.minZ + cityBounds.maxZ) / 2);

/**
 * A lightweight geometric version of the supplied city layout. It also makes the
 * city map usable when the optional offline GLB is not installed.
 * This is display-only: saved movement, NPC presence and travel rules stay authoritative.
 */
function makeProceduralCity(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'tokyo-sandbox-layout';
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(680, 680),
    new THREE.MeshStandardMaterial({ color: '#9fb4a5', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.2;
  root.add(ground);
  const slab = (w: number, h: number, d: number, x: number, y: number, z: number, color: string | number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .92 }));
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  // The supplied rectangles are intentionally scenic, not district membership checks.
  for (const district of sandboxData.districts) {
    const color = new THREE.Color(district.color);
    color.lerp(new THREE.Color('#b6c6b4'), .52);
    slab(district.maxX - district.minX, .15, district.maxZ - district.minZ,
      (district.minX + district.maxX) / 2, -1.65, (district.minZ + district.maxZ) / 2, color.getHex());
  }
  for (const road of sandboxData.roads) {
    const lane = slab(road.width, .12, road.depth, road.x, -.92, road.z,
      road.kind === 'road' ? '#556a70' : '#e4d7bc');
    lane.rotation.y = road.rotationY ?? 0;
  }
  for (const building of sandboxData.buildings) {
    slab(building.width, building.height, building.depth,
      building.x, building.height / 2, building.z, building.color);
    if (building.roofType === 'pitched' || building.roofType === 'japanese' || building.roofType === 'mansion') {
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(building.width, building.depth) * .65, 4, 4),
        new THREE.MeshStandardMaterial({ color: '#6d6962', roughness: .94 }));
      roof.rotation.y = Math.PI / 4;
      roof.position.set(building.x, building.height + 1.8, building.z);
      root.add(roof);
    }
  }
  const peaks = [
    [sandboxData.mountains.x, sandboxData.mountains.z, sandboxData.mountains.height],
    [sandboxData.mountains.x - 43, sandboxData.mountains.z + 18, sandboxData.mountains.height * .65],
    [sandboxData.mountains.x + 43, sandboxData.mountains.z + 8, sandboxData.mountains.height * .78],
  ];
  for (const [x, z, height] of peaks) {
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(37, height, 7),
      new THREE.MeshStandardMaterial({ color: '#55785a', roughness: 1, flatShading: true }));
    mountain.position.set(x, height / 2 - 1, z);
    root.add(mountain);
  }
  return root;
}

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
    const image: unknown = texture.source?.data;
    texture.dispose();
    if (image && typeof image === 'object' && 'close' in image && typeof image.close === 'function') image.close();
  }
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  root.removeFromParent();
}

function release() {
  epoch++;
  pins.value = [];
  if (model) disposeModel(model);
  model = undefined;
  scene?.clear();
  scene = undefined;
  camera = undefined;
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = undefined;
  status.value = 'idle';
  modelVariant = 'procedural';
}

function checkLocalGlb(bytes: Uint8Array<ArrayBuffer>) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength ||
      view.getUint32(16, true) !== 0x4e4f534a) throw new Error('Invalid city model');
  const length = view.getUint32(12, true);
  if (length <= 0 || length > bytes.byteLength - 20) throw new Error('Invalid city model payload');
  const parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    buffers?: { uri?: unknown }[];
    images?: { uri?: unknown }[];
    extensionsRequired?: string[];
  };
  if ([...(parsed.buffers ?? []), ...(parsed.images ?? [])].some(resource => resource.uri !== undefined)) {
    throw new Error('Remote city model resources are forbidden');
  }
  if ((parsed.extensionsRequired ?? []).some(name => name !== 'EXT_mesh_gpu_instancing')) {
    throw new Error('City model requires an unsupported decoder');
  }
}

function render() {
  if (!props.active || !renderer || !scene || !camera) return;
  const width = Math.max(1, props.width), height = Math.max(1, props.height);
  const aspect = width / height;
  const spanX = cityBounds.maxX - cityBounds.minX + 90;
  const spanZ = cityBounds.maxZ - cityBounds.minZ + 90;
  const diameter = Math.hypot(spanX, spanZ);
  const vertical = Math.max(diameter / Math.max(0.8, aspect), diameter * .78);
  camera.left = -vertical * aspect / 2;
  camera.right = vertical * aspect / 2;
  camera.top = vertical / 2;
  camera.bottom = -vertical / 2;
  camera.near = 1;
  camera.far = 3000;
  const theta = (props.bearing + 35) * Math.PI / 180;
  camera.position.set(center.x + Math.sin(theta) * 620, 510, center.z + Math.cos(theta) * 620);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(1.4, window.devicePixelRatio || 1));
  renderer.setSize(width, height, false);
  renderer.render(scene, camera);
  pins.value = sandboxData.districts.map(district => {
    const projected = new THREE.Vector3(district.x, 22, district.z).project(camera!);
    return {
      id: district.id,
      name: district.shortName,
      x: (projected.x + 1) * width / 2,
      y: (1 - projected.y) * height / 2,
      visible: projected.z >= -1 && projected.z <= 1 &&
        projected.x >= -.92 && projected.x <= .92 && projected.y >= -.9 && projected.y <= .9,
      available: isMapDistrict(district.id),
      selected: props.selectedId === district.id,
    };
  });
  emit('scale', { metersPerPixel: vertical / height / Math.max(0.01, props.viewScale) });
}

async function load() {
  if (!props.active || !canvas.value || renderer || status.value === 'loading') return;
  const asset = Object.values(bundledModels)[0];
  const request = ++epoch;
  status.value = 'loading';
  let pending: THREE.Group | undefined;
  try {
    if (asset) {
      try {
        const inline = await asset();
        const bytes = await readLocalAssetBytes(inline, 10_000_000, 'Invalid bundled Tokyo sandbox');
        checkLocalGlb(bytes);
        const manager = new THREE.LoadingManager();
        manager.setURLModifier(url => {
          if (!url.startsWith('blob:')) throw new Error('External model resource blocked');
          return url;
        });
        pending = (await new GLTFLoader(manager).parseAsync(bytes.buffer, '')).scene;
        modelVariant = 'glb';
      } catch {
        pending = makeProceduralCity();
        modelVariant = 'procedural';
      }
    } else {
      pending = makeProceduralCity();
      modelVariant = 'procedural';
    }
    if (request !== epoch || !props.active) { disposeModel(pending); return; }
    model = pending;
    pending = undefined;
    scene = new THREE.Scene();
    scene.add(model);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x647e77, 2.6));
    const sunlight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunlight.position.set(-190, 420, 200);
    scene.add(sunlight);
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 3000);
    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    status.value = 'ready';
    render();
  } catch {
    if (pending) disposeModel(pending);
    if (request === epoch) { release(); status.value = 'fallback'; }
  }
}
function select(id: string) {
  if (isMapDistrict(id)) emit('select', id);
}
watch(() => props.active, active => { if (active) void load(); else release(); });
watch(() => [props.width, props.height, props.bearing, props.viewScale, props.selectedId], render);
onMounted(() => { if (props.active) void load(); });
onBeforeUnmount(release);
</script>

<template>
  <div class="tokyo-sandbox-scene" :data-tokyo-sandbox-status="status" :data-tokyo-sandbox-model="modelVariant">
    <canvas ref="canvas" v-show="status === 'ready'" class="tokyo-sandbox-canvas" aria-hidden="true" />
    <CampusMapScene v-if="status !== 'ready'" scope="city" :width="width" :height="height"
      :bearing="bearing" :view-scale="viewScale" :location-id="locationId" :position="position"
      :busy="busy" :selected-id="selectedId" :road-events="[]" :people="[]"
      @select="select" @scale="emit('scale', $event)" />
    <template v-if="status === 'ready'">
      <template v-for="pin in pins" :key="pin.id">
        <button v-if="pin.visible && pin.available" type="button" class="tokyo-sandbox-pin"
          :class="{ selected: pin.selected }" :style="{ left: pin.x + 'px', top: pin.y + 'px' }"
          :data-map-target="'city:' + pin.id" @click="select(pin.id)">{{ pin.name }}</button>
        <span v-else-if="pin.visible" class="tokyo-sandbox-caption"
          :style="{ left: pin.x + 'px', top: pin.y + 'px' }">{{ pin.name }}</span>
      </template>
    </template>
  </div>
</template>

<style scoped>
.tokyo-sandbox-scene { position: absolute; inset: 0; overflow: hidden; }
.tokyo-sandbox-canvas { display: block; width: 100%; height: 100%; pointer-events: none; }
.tokyo-sandbox-pin, .tokyo-sandbox-caption {
  position: absolute; transform: translate(-50%, -50%); z-index: 2;
  max-width: 110px; padding: 5px 8px; border-radius: 8px;
  font: 600 11px/1.3 system-ui, sans-serif; text-align: center;
  background: rgba(248, 249, 239, .92); color: #3f4c42;
  border: 1px solid rgba(58, 82, 63, .35); box-shadow: 0 1px 6px #0003;
}
.tokyo-sandbox-pin { cursor: pointer; }
.tokyo-sandbox-pin.selected { outline: 2px solid #ab6754; outline-offset: 1px; }
.tokyo-sandbox-caption { opacity: .88; pointer-events: none; }
</style>
