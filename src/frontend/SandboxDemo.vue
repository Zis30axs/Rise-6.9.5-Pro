<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import CampusMapScene from './CampusMapScene.vue';
import { pickCitySandbox } from './city-sandbox';
import { districtMapPlaces, isMapDistrict, mapDistricts, type MapDistrictId } from './map-districts';

const hour = ref(16);
const bearing = ref(0);
const focusZoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const district = ref<MapDistrictId | null>(null);
const looked = ref('');
const viewport = ref<HTMLElement>();
const size = ref({ width: 960, height: 640 });
let cityView = { zoom: 1, bearing: 0, pan: { x: 0, y: 0 } };
let observer: ResizeObserver | undefined;
let wheelTarget: HTMLElement | undefined;
const pointers = new Map<number, { x: number; y: number }>();
let gesture: { center: { x: number; y: number }; distance: number; angle: number; zoom: number; pan: { x: number; y: number } } | undefined;
let tapTarget: string | undefined;
let moved = false;
let multi = false;

const scope = computed(() => district.value ?? 'city');
const stageStyle = computed(() => ({ transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${focusZoom.value})` }));
const districtInfo = computed(() => mapDistricts.find(item => item.id === district.value));
const clockLabel = computed(() => `${String(hour.value).padStart(2, '0')}:00`);

function clampPan(x: number, y: number) {
  const extent = 0.35 + Math.max(0, focusZoom.value - 1) / 2;
  return {
    x: Math.min(size.value.width * extent, Math.max(-size.value.width * extent, x)),
    y: Math.min(size.value.height * extent, Math.max(-size.value.height * extent, y)),
  };
}
function enter(id: string) {
  if (!isMapDistrict(id)) return;
  if (!district.value) cityView = { zoom: focusZoom.value, bearing: bearing.value, pan: { ...pan.value } };
  district.value = id;
  looked.value = '';
  focusZoom.value = 1;
  bearing.value = 0;
  pan.value = { x: 0, y: 0 };
}
function back() {
  district.value = null;
  looked.value = '';
  focusZoom.value = cityView.zoom;
  bearing.value = cityView.bearing;
  pan.value = clampPan(cityView.pan.x, cityView.pan.y);
}
function look(id: string) {
  const place = districtMapPlaces(district.value ?? 'campus').find(item => item.id === id);
  looked.value = place?.name ?? '';
}
function zoomBy(factor: number) {
  focusZoom.value = Math.min(8, Math.max(0.7, focusZoom.value * factor));
  pan.value = clampPan(pan.value.x, pan.value.y);
}
function rotateBy(degrees: number) { bearing.value += degrees; }
function resetView() { focusZoom.value = 1; bearing.value = 0; pan.value = { x: 0, y: 0 }; }
function localPoint(event: PointerEvent) {
  const rect = viewport.value!.getBoundingClientRect();
  return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
}
function beginGesture() {
  const points = [...pointers.values()];
  if (!points.length) { gesture = undefined; return; }
  const a = points[0];
  const b = points[1] ?? a;
  gesture = {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    distance: Math.hypot(a.x - b.x, a.y - b.y),
    angle: Math.atan2(b.y - a.y, b.x - a.x),
    zoom: focusZoom.value,
    pan: { ...pan.value },
  };
}
function pointerDown(event: PointerEvent) {
  if (event.button !== 0 || !viewport.value || (event.target as Element).closest('[data-map-controls], input, label')) return;
  event.preventDefault();
  if (!pointers.size) {
    const target = event.target as Element;
    tapTarget = target.closest('[data-map-target]')?.getAttribute('data-map-target') ?? pickCitySandbox(viewport.value, event.clientX, event.clientY);
    moved = false;
    multi = false;
  } else { multi = true; tapTarget = undefined; }
  pointers.set(event.pointerId, localPoint(event));
  try { viewport.value.setPointerCapture(event.pointerId); } catch { /* The pointer ended as the page closed. */ }
  beginGesture();
}
function pointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId) || !gesture) return;
  event.preventDefault();
  pointers.set(event.pointerId, localPoint(event));
  const points = [...pointers.values()];
  const a = points[0];
  const b = points[1] ?? a;
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  if (Math.hypot(center.x - gesture.center.x, center.y - gesture.center.y) > 6 || Math.abs(distance - gesture.distance) > 6) moved = true;
  if (points.length > 1 && gesture.distance > 0) {
    multi = true;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    bearing.value += Math.atan2(Math.sin(angle - gesture.angle), Math.cos(angle - gesture.angle)) * 180 / Math.PI;
    gesture.angle = angle;
    focusZoom.value = Math.min(8, Math.max(0.7, gesture.zoom * Math.max(0.06, distance / gesture.distance)));
  }
  pan.value = clampPan(gesture.pan.x + center.x - gesture.center.x, gesture.pan.y + center.y - gesture.center.y);
}
function pointerUp(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  const target = pointers.size === 1 && !moved && !multi && event.type === 'pointerup' ? tapTarget : undefined;
  pointers.delete(event.pointerId);
  try { viewport.value?.releasePointerCapture(event.pointerId); } catch { /* Already released. */ }
  if (target?.startsWith('city:')) enter(target.slice(5));
  else if (target && district.value) look(target);
  beginGesture();
  if (!pointers.size) { tapTarget = undefined; moved = false; multi = false; }
}
function onWheel(event: WheelEvent) {
  event.preventDefault();
  if (event.shiftKey) { rotateBy(Math.max(-25, Math.min(25, event.deltaY * 0.15))); return; }
  const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.value.height : 1);
  zoomBy(Math.exp(-Math.min(240, Math.max(-240, pixels)) * 0.0025));
}
onMounted(() => {
  const node = viewport.value;
  if (!node) return;
  wheelTarget = node;
  node.addEventListener('wheel', onWheel, { passive: false });
  const owner = node.ownerDocument.defaultView;
  const resize = () => {
    const bounds = node.getBoundingClientRect();
    if (bounds.width > 0 && bounds.height > 0) size.value = { width: bounds.width, height: bounds.height };
  };
  if (owner?.ResizeObserver) { observer = new owner.ResizeObserver(resize); observer.observe(node); }
  resize();
});
onBeforeUnmount(() => {
  wheelTarget?.removeEventListener('wheel', onWheel);
  observer?.disconnect();
});
</script>

<template>
  <div class="sandbox-demo">
    <header class="sandbox-bar">
      <h1>城市沙盘</h1>
      <button v-if="district" type="button" data-map-controls @click="back">← 返回城市</button>
      <p>{{ districtInfo ? districtInfo.name : '点名称或城区，进入详细沙盘' }}<template v-if="looked"> · {{ looked }}</template></p>
      <label>时刻 <input v-model.number="hour" type="range" min="0" max="23" step="1" aria-label="时刻" /> <span>{{ clockLabel }}</span></label>
      <div class="sandbox-tools" data-map-controls aria-label="沙盘视角">
        <button type="button" aria-label="放大地图" @click="zoomBy(1.3)">+</button>
        <button type="button" aria-label="缩小地图" @click="zoomBy(1 / 1.3)">−</button>
        <button type="button" aria-label="向左旋转地图" @click="rotateBy(-30)">↶</button>
        <button type="button" aria-label="向右旋转地图" @click="rotateBy(30)">↷</button>
        <button type="button" aria-label="复位地图视图" @click="resetView">⌂</button>
      </div>
    </header>
    <div class="world-map sandbox-map">
      <div ref="viewport" class="wm-viewport" role="group" tabindex="0" aria-label="城市沙盘" data-sandbox-demo @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @lostpointercapture="pointerUp">
        <div class="wm-stage" :style="stageStyle">
          <CampusMapScene :scope="scope" :hour="hour" :bearing="bearing" :view-scale="focusZoom" :width="size.width" :height="size.height" location-id="gate" :busy="false" :position="{ x: 0, z: 29 }" player-name="素世" :road-events="[]" :people="[]" :selected-id="district ?? ''" @select="enter" @travel="look" />
        </div>
      </div>
    </div>
  </div>
</template>
