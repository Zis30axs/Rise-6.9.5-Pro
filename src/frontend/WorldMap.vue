<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import rawAtlasData from './atlas-data.json';
import { getRouteOutlook, getNovelTravelQuote, novelDestinations, locations as allLocations, mapLocations } from '../runtime/model';
import { getTransitRoutes, requiresTransitReturn } from '../runtime/transit';
import { worldScenePeople, worldScenePosition } from '../runtime/world-presence';
import { activeProtagonist, personState, protagonistNames } from '../runtime/protagonist-world';
import { getLocationStatus } from '../runtime/location-services';
import { mapLocationPoint } from './campus-map-layout';
import { districtMapPlaces, isMapDistrict, mapDistricts, type MapDistrictId } from './map-districts';
import type { ShellActions, ShellModel } from './types';
import CampusMapScene from './CampusMapScene.vue';
import AtlasMapScene from './AtlasMapScene.vue';
import { formatGameNumber } from './format-game-number';
import { runInteraction } from './interaction-action';
import { ATLAS_LANDMARKS } from './atlas-landmarks';
import { TOKYO_COUNTRY_ID, TOKYO_REGION_NAME } from '../runtime/tokyo-world';
import openAiMark from '../../assets/openai-mark.svg?inline';

const props = withDefaults(defineProps<{ model: ShellModel; actions: ShellActions; novelMode?: boolean }>(), { novelMode: false });
const emit = defineEmits<{ travelled: [] }>();
const locations = mapLocations;
type Layer = 'district' | 'city' | 'province' | 'country' | 'world';
type Properties = { name: string; id: string; countryId?: string; parentId?: string; sourceCountryId?: string };
type Region = Feature<Geometry, Properties>;
const mapData = rawAtlasData as unknown as { countries: FeatureCollection<Geometry, Properties>; subdivisions: FeatureCollection<Geometry, Properties>; chinaCities?: FeatureCollection<Geometry, Properties>; chinaMaritimeLines?: FeatureCollection<Geometry, Properties> };
const layers: { id: Layer; name: string; depth: number }[] = [
  { id: 'city', name: '城市', depth: 2 }, { id: 'province', name: '所在区域', depth: 3 },
  { id: 'world', name: '世界', depth: 5 },
];
const depth = ref(2);
const focusZoom = ref(1);
const bearing = ref(0);
const layerIndex = computed(() => Math.min(5, Math.max(0, Math.round(depth.value))));
const layer = computed<Layer>(() => (['district', 'district', 'city', 'province', 'country', 'world'] as const)[layerIndex.value]);
const viewport = ref<HTMLElement>();
type AtlasView = { countryId: string; regionId: string };
const atlasScene = ref<{
  pickAt: (clientX: number, clientY: number) => string | undefined;
  panBy: (dx: number, dy: number) => void;
  setZoomAnchor: (clientX: number, clientY: number, targetX?: number, targetY?: number) => void;
  focusFeature: (id: string) => { depth: number; zoom: number } | undefined;
  getCameraSpan: () => number;
  getZoomView: (factor: number, initialSpan?: number) => { depth: number; zoom: number };
  resetView: () => void; isHomeRegion: () => boolean;
}>();
const size = ref({ width: 620, height: 420 });
const scale = computed(() => 2 ** -depth.value * focusZoom.value);
const smooth = (value: number) => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
const rise = computed(() => 1);
const localOpacity = computed(() => 1 - smooth(depth.value - 1));
const pan = ref({ x: 0, y: 0 });
const TOKYO_REGION_ID = mapData.subdivisions.features.find(item => item.properties.countryId === TOKYO_COUNTRY_ID && TOKYO_REGION_NAME.test(item.properties.name))?.properties.id ?? '';
const countryId = ref(TOKYO_COUNTRY_ID);
const regionId = ref(TOKYO_REGION_ID);
const selectedId = ref(TOKYO_REGION_ID || TOKYO_COUNTRY_ID);
const selectedKind = ref<'country' | 'division' | 'landmark'>('division');
const search = ref('');
const showDemoPeople = ref(false);
const activeEventId = ref('');
const selectedCity = ref<MapDistrictId>('campus');
const detailDistrict = ref<MapDistrictId | null>(null);
let cityView: { zoom: number; bearing: number; pan: { x: number; y: number } } | undefined;
const itineraryDraft = ref('');
const localLayer = computed(() => layer.value === 'district');
const geographicLayer = computed(() => layerIndex.value >= 3);
const currentLocation = computed(() => allLocations.find(place => place.id === props.model.state.locationId));
const currentMapPosition = computed(() => props.model.state.interior
  ? mapLocationPoint(props.model.state.interior.roomId) : worldScenePosition(props.model.state));
const needsTransitReturn = computed(() => requiresTransitReturn(props.model.state.locationId, props.model.state.scene));
const transform = computed(() => ({ transform: depth.value > 2 ? 'none' : `translate(${pan.value.x}px, ${pan.value.y}px) scale(${focusZoom.value})` }));
const localZoomScale = computed(() => depth.value < 0 ? 2 ** -depth.value : 1 - .46 * smooth(depth.value / 2));
const localDisplayScale = computed(() => localZoomScale.value * focusZoom.value);
const campusMetersPerPixel = ref(4);
const cityMetersPerPixel = ref(4);
const localScale = computed(() => {
  const metersPerPixel = localLayer.value ? campusMetersPerPixel.value : cityMetersPerPixel.value;
  const target = Math.max(.01, metersPerPixel * 65), unit = 10 ** Math.floor(Math.log10(target));
  const meters = [1, 2, 5, 10].map(n => n * unit).find(n => n >= target) ?? unit * 10;
  return { width: meters / metersPerPixel, label: meters >= 1000 ? `${meters / 1000} km` : `${Math.round(meters)} m` };
});
const localStyle = computed(() => ({ opacity: localOpacity.value, transform: `scale(${localZoomScale.value})`, pointerEvents: localLayer.value ? 'auto' as const : 'none' as const }));
function planeStyle(index: number) {
  const delta = depth.value - index;
  return { opacity: 1 - smooth(Math.abs(delta)), transform: `scale(${1 - delta * .26})`, pointerEvents: layerIndex.value === index ? 'auto' as const : 'none' as const };
}
const atlasStyle = computed(() => ({ opacity: smooth(depth.value - 2), pointerEvents: geographicLayer.value ? 'auto' as const : 'none' as const }));
const currentCountry = computed(() => mapData.countries.features.find(item => item.properties.id === countryId.value));
const currentRegion = computed(() => mapData.subdivisions.features.find(item => item.properties.id === regionId.value && item.properties.countryId === countryId.value));
const countryDivisions = computed(() => mapData.subdivisions.features.filter(item => item.properties.countryId === countryId.value));
const features = computed(() => layer.value === 'world' ? mapData.countries.features : countryDivisions.value);
const filteredFeatures = computed(() => {
  const term = search.value.trim().toLocaleLowerCase();
  return term ? features.value.filter(item => `${item.properties.name} ${item.properties.id}`.toLocaleLowerCase().includes(term)) : features.value;
});
const selectedFeature = computed(() => (selectedKind.value === 'country' ? mapData.countries.features : mapData.subdivisions.features).find(item => item.properties.id === selectedId.value));
const activeLandmark = computed(() => ATLAS_LANDMARKS.find(item => item.id === selectedId.value && selectedKind.value === 'landmark'));
const nearbyLandmarks = computed(() => ATLAS_LANDMARKS.filter(item => item.countryId === countryId.value));
const regionCities = computed(() => mapData.chinaCities?.features.filter(item => item.properties.parentId === regionId.value) ?? []);
const featureName = (item: Region) => item.properties.name;
const isUnion = (item: Region) => item.properties.id === 'SUN';
const layerTitle = computed(() => localLayer.value ? `${cityDetail.value.name} · 详细沙盘` : layer.value === 'city' ? '城市沙盘' : layer.value === 'world' ? '世界 · 架空地理' : layer.value === 'country' ? (currentCountry.value?.properties.name ?? '国家与区域') : (currentRegion.value?.properties.name ?? currentCountry.value?.properties.name ?? '区域地图'));
const layerNote = computed(() => localLayer.value ? cityDetail.value.description : layer.value === 'city' ? '点击城区，进入对应的详细沙盘' : '浅立体示意地形 · 红线与红点为主角所在区域');
const homePath = computed(() => countryId.value === TOKYO_COUNTRY_ID && regionId.value === TOKYO_REGION_ID && Boolean(TOKYO_REGION_ID));
const minimumDepth = computed(() => geographicLayer.value && !homePath.value ? 3 : -2);
const normalizedBearing = computed(() => Math.round(((bearing.value % 360) + 360) % 360));

// Explicit prototype records only; never infer a location from a contact's status text.
const personWorldLocationRefs = [{ contactId: 'lin', locationId: 'library', record: '演示记录：在图书馆整理笔记' }];
const affinityThreshold = 10;
const demoPeople = computed(() => showDemoPeople.value ? personWorldLocationRefs.flatMap(record => {
  const contact = props.model.state.contacts.find(item => item.id === record.contactId);
  const place = locations.find(item => item.id === record.locationId);
  return contact && place && contact.affinity >= affinityThreshold
    ? [{ ...record, name: contact.name, personId: contact.sourcePersonId ?? contact.id, portraitId: contact.portraitId, affinity: contact.affinity, place, source: 'demo' as const }] : [];
}) : []);
/** Location markers share the talk population; NPC disclosure uses this viewpoint's contacts. */
const visiblePeople = computed(() => {
  const state = props.model.state;
  const position = worldScenePosition(state);
  const people = position ? worldScenePeople(state).flatMap(person => {
    if (person.protagonistId && !state.interior && personState(state, person.protagonistId).locationId !== state.locationId) return [];
    const contact = state.contacts.find(item => item.id === person.contactId || item.sourcePersonId === person.id || item.id === person.id);
    if (!person.protagonistId && (!contact || contact.affinity < affinityThreshold || Math.hypot(person.x - position.x, person.z - position.z) > 35)) return [];
    const point = state.interior ? mapLocationPoint(state.interior.roomId) : { x: person.x, z: person.z };
    if (!point) return [];
    return [{ contactId: person.contactId ?? person.id, name: person.protagonistId ? protagonistNames[person.protagonistId] : person.name,
      personId: person.id, portraitId: person.portraitId, protagonistId: person.protagonistId, position: point,
      source: person.protagonistId ? 'protagonist' as const : 'scene' as const }];
  }) : [];
  return [...people, ...demoPeople.value];
});
const routeOutlooks = computed(() => new Map(locations.map(place => [place.id, getRouteOutlook(props.model.state, place.id)])));
const travelMinutes = (locationId: string) => 15 + (routeOutlooks.value.get(locationId)?.extraMinutes ?? 0);
const roadEvents = computed(() => locations.flatMap(place => {
  const outlook = routeOutlooks.value.get(place.id);
  const current = currentLocation.value;
  if (!outlook?.event || !current || place.id === current.id) return [];
  return [{
    id: place.id, kind: outlook.event.kind, label: `${place.name}路线${outlook.event.kind === 'traffic' ? '堵车' : '特殊事件'}`,
    icon: outlook.event.kind === 'traffic' ? '!' : '✦', x: ((mapLocationPoint(place.id)?.x ?? 0) + (props.model.state.scene?.x ?? mapLocationPoint(current.id)?.x ?? 0)) / 2, y: ((mapLocationPoint(place.id)?.z ?? 0) + (props.model.state.scene?.z ?? mapLocationPoint(current.id)?.z ?? 0)) / 2,
    title: `${place.name}路线 · ${outlook.event.title}`,
    detail: `${outlook.event.description} 预计耗时 ${travelMinutes(place.id)} 分钟（含事件 ${outlook.extraMinutes} 分钟）。`,
  }];
}));
const activeEvent = computed(() => roadEvents.value.find(event => event.id === activeEventId.value));
const cityPlaces = mapDistricts;
const cityDetail = computed(() => cityPlaces.find(place => place.id === selectedCity.value) ?? cityPlaces[0]);
const cityRoute = computed(() => getTransitRoutes('campus', selectedCity.value === 'downtown' ? 'zbd04a' : 'btr82a').find(route => route.stop.id === selectedCity.value));
const novelQuotes = computed(() => new Map(novelDestinations.map(place => [place.id, getNovelTravelQuote(props.model.state, place.id)])));
function venueStatusText(locationId: string) {
  const status = getLocationStatus(locationId, props.model.state.clock);
  return status ? `此刻${status.statusLabel} · ${status.hoursLabel}` : '';
}
const localDestinations = computed(() => districtMapPlaces(detailDistrict.value ?? 'campus').map(place => ({ ...place, subtitle: place.kind === 'interior' ? '室内入口' : '室外地点' })));
function destinationDisabled(id: string) {
  if (props.model.busy) return true;
  if (props.novelMode) { const quote = novelQuotes.value.get(id); return !quote || quote.alreadyThere || !!quote.blockedReason; }
  return !!props.model.state.interior || needsTransitReturn.value || id === props.model.state.locationId || !locations.some(place => place.id === id);
}
function destinationNote(id: string) {
  if (!props.novelMode) return `预计 ${travelMinutes(id)} 分钟 · ${routeOutlooks.value.get(id)?.event?.title ?? '路线通畅'}`;
  const quote = novelQuotes.value.get(id);
  if (!quote) return '';
  if (quote.alreadyThere) return '当前地点';
  if (quote.blockedReason) return quote.blockedReason;
  return `${quote.minutes} 分钟 · 精力 −${formatGameNumber(quote.energyCost)}${quote.foodEnergyCost ? ` · 食物能量储备 −${quote.foodEnergyCost} kcal` : ''}${quote.satietyCost ? ` · 饱腹 −${quote.satietyCost}` : ''}${quote.fare ? ` · 车费 ¥${quote.fare}` : ''}${quote.rides.length ? ` · ${quote.rides.length > 1 ? '经校园换乘' : '公交出行'}` : ''}`;
}
function energyCalculationNote(id: string) {
  const quote = novelQuotes.value.get(id);
  if (!quote || quote.alreadyThere) return '';
  const calculation = `${formatGameNumber(quote.baseEnergyCost)} × ${formatGameNumber(quote.baseEnergyMultiplier)} × 状态倍率 ${formatGameNumber(quote.conditionMultiplier)} ≈ ${formatGameNumber(quote.calculatedEnergyCost)} 点精力`;
  return quote.energyCost < quote.calculatedEnergyCost ? `${calculation}；精力不足仍可前往，实际扣除 ${formatGameNumber(quote.energyCost)}` : calculation;
}
async function travelTo(id: string) {
  if (destinationDisabled(id)) return;
  const saved = await runInteraction(props.model, props.actions, { type: props.novelMode ? 'novel_travel' : 'travel', locationId: id });
  if (saved && props.novelMode) emit('travelled');
}

let observer: ResizeObserver | undefined;
let owner: (Window & typeof globalThis) | null = null;
let frame = 0;
let targetDepth = 2;
let ignoreClickUntil = 0;
let tapTarget: string | undefined;
let gestureMoved = false;
let gestureHadMultiple = false;
const now = () => owner?.performance.now() ?? 0;
const pointers = new Map<number, { x: number; y: number }>();
let gesture: { center: { x: number; y: number }; lastCenter: { x: number; y: number }; distance: number; angle: number; depth: number; focus: number; atlasSpan?: number; pan: { x: number; y: number } } | undefined;
function clampPan(x: number, y: number) {
  const extent = .35 + Math.max(0, focusZoom.value - 1) / 2 + Math.max(0, -depth.value) / 2;
  return { x: Math.min(size.value.width * extent, Math.max(-size.value.width * extent, x)), y: Math.min(size.value.height * extent, Math.max(-size.value.height * extent, y)) };
}
watch([depth, focusZoom], () => { pan.value = clampPan(pan.value.x, pan.value.y); }, { flush: 'sync' });
function stopAnimation() { if (frame && owner) owner.cancelAnimationFrame(frame); frame = 0; targetDepth = depth.value; }
function moveDepth(next: number, duration = 0) {
  stopAnimation(); targetDepth = Math.min(5, Math.max(-2, next));
  if (!owner || !duration || owner.matchMedia('(prefers-reduced-motion: reduce)').matches) { depth.value = targetDepth; return; }
  const from = depth.value, started = now(), destination = targetDepth;
  const tick = () => {
    const t = Math.min(1, (now() - started) / duration);
    depth.value = from + (destination - from) * (1 - (1 - t) ** 3);
    if (t < 1) frame = owner!.requestAnimationFrame(tick);
    else { frame = 0; depth.value = destination; }
  };
  frame = owner.requestAnimationFrame(tick);
}
function clearCameraOffset() { cancelGestures(); focusZoom.value = 1; pan.value = { x: 0, y: 0 }; }
function goToLayer(id: Layer) {
  if (id === 'city' && detailDistrict.value) { returnCity(); return; }
  detailDistrict.value = null;
  clearCameraOffset(); search.value = '';
  if (id === 'province' || id === 'district' || id === 'city') { countryId.value = TOKYO_COUNTRY_ID; regionId.value = TOKYO_REGION_ID; }
  atlasScene.value?.resetView();
  moveDepth(id === 'country' ? 4 : id === 'district' ? 0 : layers.find(item => item.id === id)!.depth, 360);
}
function enterDistrict(id: string) {
  if (!isMapDistrict(id)) return;
  if (!detailDistrict.value) cityView = { zoom: focusZoom.value, bearing: bearing.value, pan: { ...pan.value } };
  clearCameraOffset();
  selectedCity.value = id; detailDistrict.value = id;
  moveDepth(0, 360);
  void nextTick(() => viewport.value?.focus({ preventScroll: true }));
}
function returnCity() {
  cancelGestures(); stopAnimation();
  detailDistrict.value = null;
  focusZoom.value = cityView?.zoom ?? 1; bearing.value = cityView?.bearing ?? bearing.value;
  moveDepth(2);
  pan.value = cityView ? clampPan(cityView.pan.x, cityView.pan.y) : { x: 0, y: 0 };
  void nextTick(() => viewport.value?.focus({ preventScroll: true }));
}
function goHome() { selectedId.value = TOKYO_REGION_ID || TOKYO_COUNTRY_ID; selectedKind.value = TOKYO_REGION_ID ? 'division' : 'country'; goToLayer('province'); }
function resetView() { focusZoom.value = 1; pan.value = { x: 0, y: 0 }; bearing.value = 0; atlasScene.value?.resetView(); countryId.value = TOKYO_COUNTRY_ID; regionId.value = TOKYO_REGION_ID; moveDepth(localLayer.value ? 0 : layerIndex.value, 220); }
function rotateBy(degrees: number) { bearing.value += degrees; }
function applyZoomDepth(next: number, duration = 0) {
  if (!geographicLayer.value) {
    const base = localLayer.value ? 0 : 2;
    focusZoom.value = Math.min(12, Math.max(.65, 2 ** (base - next)));
    return;
  }
  const floor = geographicLayer.value && !atlasScene.value?.isHomeRegion() ? 3 : -2;
  focusZoom.value = next < floor ? Math.min(200, 2 ** (floor - next)) : 1;
  moveDepth(Math.max(floor, next), duration);
}
function zoomBy(factor: number, animate = true, anchor?: { x: number; y: number }) {
  if (geographicLayer.value && viewport.value && atlasScene.value) {
    const r = viewport.value.getBoundingClientRect(); atlasScene.value.setZoomAnchor(anchor?.x ?? r.left + r.width / 2, anchor?.y ?? r.top + r.height / 2);
    // Depth and residual zoom encode one physical scale. Commit them together;
    // animating only depth would flash the wrong scale for small countries.
    const view = atlasScene.value.getZoomView(factor); focusZoom.value = view.zoom; moveDepth(view.depth); return;
  }
  const base = frame ? targetDepth : depth.value;
  applyZoomDepth(base - Math.log2(factor * focusZoom.value), animate ? 180 : 0);
}
function wheel(event: WheelEvent) {
  event.preventDefault(); event.stopPropagation();
  if (event.shiftKey) { rotateBy(Math.max(-25, Math.min(25, event.deltaY * .15))); return; }
  const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.value.height : 1);
  zoomBy(Math.exp(-Math.min(240, Math.max(-240, pixels)) * .0025), true, { x: event.clientX, y: event.clientY });
}
function pointerPoint(event: PointerEvent) {
  const rect = viewport.value!.getBoundingClientRect();
  return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
}
function beginGesture() {
  const points = [...pointers.values()];
  if (!points.length) { gesture = undefined; return; }
  const a = points[0], b = points[1] ?? a;
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  gesture = { center, lastCenter: center, distance: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), depth: depth.value, focus: focusZoom.value, atlasSpan: geographicLayer.value ? atlasScene.value?.getCameraSpan() : undefined, pan: { ...pan.value } };
}
function pointerDown(event: PointerEvent) {
  if (event.button !== 0 || !viewport.value || (event.target as Element).closest('[data-map-controls], [data-map-person-id], [data-map-player], input, label')) return;
  event.preventDefault(); event.stopPropagation(); stopAnimation(); viewport.value.focus({ preventScroll: true });
  if (!pointers.size) {
    const target = event.target as Element;
    tapTarget = target.closest('[data-map-target]')?.getAttribute('data-map-target') ?? (geographicLayer.value ? atlasScene.value?.pickAt(event.clientX, event.clientY) : undefined);
    gestureMoved = false; gestureHadMultiple = false;
  } else { gestureHadMultiple = true; tapTarget = undefined; }
  pointers.set(event.pointerId, pointerPoint(event));
  try { viewport.value.setPointerCapture(event.pointerId); } catch { /* Window closed during input. */ }
  beginGesture();
}
function pointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId) || !gesture) return;
  event.preventDefault(); event.stopPropagation(); pointers.set(event.pointerId, pointerPoint(event));
  const points = [...pointers.values()], a = points[0], b = points[1] ?? a;
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance = Math.hypot(a.x - b.x, a.y - b.y);
  if (Math.hypot(center.x - gesture.center.x, center.y - gesture.center.y) > 6 || Math.abs(distance - gesture.distance) > 6) gestureMoved = true;
  if (points.length > 1 && gesture.distance > 0) {
    gestureHadMultiple = true;
    if (geographicLayer.value && viewport.value) { const r = viewport.value.getBoundingClientRect(); atlasScene.value?.setZoomAnchor(r.left + r.width / 2 + gesture.lastCenter.x, r.top + r.height / 2 + gesture.lastCenter.y, r.left + r.width / 2 + center.x, r.top + r.height / 2 + center.y); }
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    // Integrate the shortest angular delta; crossing ±180° never flips the map.
    bearing.value += Math.atan2(Math.sin(angle - gesture.angle), Math.cos(angle - gesture.angle)) * 180 / Math.PI;
    gesture.angle = angle;
    const ratio = Math.max(.06, distance / gesture.distance);
    if (gesture.atlasSpan && atlasScene.value) {
      const view = atlasScene.value.getZoomView(ratio, gesture.atlasSpan); focusZoom.value = view.zoom; moveDepth(view.depth);
    } else applyZoomDepth(gesture.depth - Math.log2(ratio * gesture.focus));
  }
  if (geographicLayer.value) { if (points.length === 1) atlasScene.value?.panBy(center.x - gesture.lastCenter.x, center.y - gesture.lastCenter.y); }
  else pan.value = clampPan(gesture.pan.x + center.x - gesture.center.x, gesture.pan.y + center.y - gesture.center.y);
  gesture.lastCenter = center;
}
function onAtlasView(view: AtlasView) { if (view.countryId) { countryId.value = view.countryId; regionId.value = view.regionId; } }
function selectCountry(id: string) {
  if (!mapData.countries.features.some(item => item.properties.id === id)) return;
  countryId.value = id; regionId.value = id === TOKYO_COUNTRY_ID ? TOKYO_REGION_ID : '';
  selectedKind.value = 'country'; selectedId.value = id; itineraryDraft.value = ''; search.value = '';
  clearCameraOffset(); const view = atlasScene.value?.focusFeature('country:' + id); focusZoom.value = view?.zoom ?? 1; moveDepth(view?.depth ?? 4, 360);
}
function selectDivision(id: string) {
  const feature = mapData.subdivisions.features.find(item => item.properties.id === id);
  if (!feature?.properties.countryId) return;
  countryId.value = feature.properties.countryId; regionId.value = id; selectedId.value = id; selectedKind.value = 'division'; itineraryDraft.value = ''; search.value = '';
  clearCameraOffset(); const view = atlasScene.value?.focusFeature('division:' + id); focusZoom.value = view?.zoom ?? 1; moveDepth(view?.depth ?? 3, 360);
}
function selectFeature(feature: Region) { if (feature.properties.countryId) selectDivision(feature.properties.id); else selectCountry(feature.properties.id); }
function activateTarget(target: string) {
  if (target.startsWith('country:')) selectCountry(target.slice(8));
  else if (target.startsWith('division:')) selectDivision(target.slice(9));
  else if (target.startsWith('landmark:')) { if (ATLAS_LANDMARKS.some(item => item.id === target.slice(9))) { selectedKind.value = 'landmark'; selectedId.value = target.slice(9); } }
  else if (target.startsWith('event:')) { const id = target.slice(6); if (roadEvents.value.some(item => item.id === id)) activeEventId.value = activeEventId.value === id ? '' : id; }
  else if (target.startsWith('city:')) enterDistrict(target.slice(5));
  else if (localLayer.value && localDestinations.value.some(item => item.id === target)) travelTo(target);
}
function pointerUp(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  const target = pointers.size === 1 && !gestureMoved && !gestureHadMultiple && event.type === 'pointerup' ? tapTarget : undefined;
  pointers.delete(event.pointerId);
  try { viewport.value?.releasePointerCapture(event.pointerId); } catch { /* Already released. */ }
  ignoreClickUntil = now() + 450;
  if (target) activateTarget(target);
  beginGesture();
  if (!pointers.size) { tapTarget = undefined; gestureMoved = false; gestureHadMultiple = false; }
}
function guardClick(event: MouseEvent) {
  if (event.detail > 0 && now() < ignoreClickUntil && !(event.target as Element).closest('[data-map-controls], [data-map-person-id], [data-map-player]')) { event.preventDefault(); event.stopImmediatePropagation(); }
}
function cancelGestures() {
  const ids = [...pointers.keys()]; pointers.clear(); gesture = undefined; tapTarget = undefined;
  for (const id of ids) { try { viewport.value?.releasePointerCapture(id); } catch { /* Pointer ended. */ } }
  gestureMoved = false; gestureHadMultiple = false;
}
function keydown(event: KeyboardEvent) {
  if (event.target !== viewport.value) return;
  const offset = 35;
  if (event.key === '+' || event.key === '=') zoomBy(1.3);
  else if (event.key === '-') zoomBy(1 / 1.3);
  else if (event.key === 'Home') resetView();
  else if (event.key === '[') rotateBy(-15);
  else if (event.key === ']') rotateBy(15);
  else if (event.key === 'ArrowLeft') { if (geographicLayer.value) atlasScene.value?.panBy(offset, 0); else pan.value = clampPan(pan.value.x + offset, pan.value.y); }
  else if (event.key === 'ArrowRight') { if (geographicLayer.value) atlasScene.value?.panBy(-offset, 0); else pan.value = clampPan(pan.value.x - offset, pan.value.y); }
  else if (event.key === 'ArrowUp') { if (geographicLayer.value) atlasScene.value?.panBy(0, offset); else pan.value = clampPan(pan.value.x, pan.value.y + offset); }
  else if (event.key === 'ArrowDown') { if (geographicLayer.value) atlasScene.value?.panBy(0, -offset); else pan.value = clampPan(pan.value.x, pan.value.y - offset); }
  else return;
  event.preventDefault(); event.stopPropagation();
}
function draftJourney(kind: 'visit' | 'study') {
  const name = selectedFeature.value?.properties.name ?? activeLandmark.value?.name;
  if (name) itineraryDraft.value = `${name} · 已暂存${kind === 'visit' ? '访问' : '留学'}意向，尚未启程。`;
}
watch(layer, () => { search.value = ''; activeEventId.value = ''; });
onMounted(() => {
  if (!viewport.value) return;
  owner = viewport.value.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  const resize = () => { const bounds = viewport.value?.getBoundingClientRect(); if (bounds && bounds.width > 0 && bounds.height > 0) { size.value = { width: bounds.width, height: bounds.height }; pan.value = clampPan(pan.value.x, pan.value.y); } };
  if (owner?.ResizeObserver) { observer = new owner.ResizeObserver(resize); observer.observe(viewport.value); }
  resize();
});
onBeforeUnmount(() => { observer?.disconnect(); stopAnimation(); cancelGestures(); });
</script>

<template>
  <div class="world-map" :data-map-layer="layer" :data-map-district="detailDistrict ?? ''">
    <nav class="wm-layers" aria-label="地图范围"><button v-for="item in layers" :key="item.id" type="button" :aria-pressed="layer === item.id || (localLayer && item.id === 'city')" :class="{ active: layer === item.id || (localLayer && item.id === 'city') }" @click="goToLayer(item.id)">{{ item.name }}</button></nav>
    <div v-if="detailDistrict" class="wm-detail-back-row"><button type="button" data-map-back aria-label="返回城市总览" @click="returnCity">← 返回城市</button></div>
    <div class="wm-title"><div><h2>{{ layerTitle }}</h2><p>{{ layerNote }}</p></div><span class="wm-zoom-value" aria-live="polite">{{ localLayer || layer === 'city' ? '立体沙盘' : '范围浏览' }}</span></div>
    <div class="wm-layout">
      <div class="wm-map-column">
        <div ref="viewport" class="wm-viewport" role="group" tabindex="0" aria-label="交互地图画布" aria-describedby="uc-map-help" data-world-map-viewport :data-map-layer="layer" :data-map-scale="scale.toFixed(3)" :data-map-depth="depth.toFixed(3)" :data-map-rise="rise.toFixed(3)" :data-map-bearing="bearing.toFixed(3)" @click.capture="guardClick" @wheel="wheel" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @lostpointercapture="pointerUp" @keydown="keydown">
          <div class="wm-stage" :style="transform">
            <div v-show="depth < 2" class="wm-plane wm-local-plane" data-map-plane="district" :style="localStyle" :aria-hidden="!localLayer" :inert="!localLayer">
              <CampusMapScene :scope="detailDistrict ?? 'campus'" :disabled-ids="localDestinations.filter(place => destinationDisabled(place.id)).map(place => place.id)" :bearing="bearing" :view-scale="localDisplayScale" @scale="campusMetersPerPixel = $event.metersPerPixel" :width="size.width" :height="size.height" :location-id="model.state.locationId" :busy="model.busy || (!novelMode && (!!model.state.interior || needsTransitReturn))" :position="currentMapPosition" :player-name="protagonistNames[activeProtagonist(model.state)]" :player-id="activeProtagonist(model.state)" :road-events="roadEvents" :people="visiblePeople" @travel="travelTo" @event="activeEventId = activeEventId === $event ? '' : $event" />
            </div>
            <div v-show="depth > 1 && depth < 3" class="wm-plane wm-city-board" data-map-plane="city" :style="planeStyle(2)" :aria-hidden="layer !== 'city'" :inert="layer !== 'city'">
              <CampusMapScene scope="city" :bearing="bearing" :view-scale="focusZoom * Math.max(.1, 1 - (depth - 2) * .26)" :width="size.width" :height="size.height" :location-id="model.state.locationId" :position="currentMapPosition" :busy="model.busy" :road-events="[]" :people="[]" :selected-id="selectedCity" @select="enterDistrict($event)" @scale="cityMetersPerPixel = $event.metersPerPixel" />
            </div>
            <div v-show="depth > 2" class="wm-plane wm-atlas-plane" data-map-plane="atlas" :style="atlasStyle" :aria-hidden="!geographicLayer" :inert="!geographicLayer">
              <AtlasMapScene ref="atlasScene" :countries="mapData.countries" :subdivisions="mapData.subdivisions" :china-maritime-lines="mapData.chinaMaritimeLines" :width="size.width" :height="size.height" :depth="depth" :zoom="focusZoom" :country-id="countryId" :region-id="regionId" :selected-id="selectedId" :bearing="bearing" :active="depth > 2" @view-change="onAtlasView" @select="activateTarget" />
            </div>
          </div>
          <span class="wm-north" aria-hidden="true" :style="{ transform: `rotate(${bearing}deg)` }">N ↑</span>
          <div class="wm-watermark" aria-label="Open AI Map"><img :src="openAiMark" alt=""/><span>Open AI Map</span></div>
          <div v-if="!geographicLayer" class="wm-local-scale" aria-label="虚构场景示意比例尺"><span>{{ localScale.label }} · 示意</span><i :style="{width:localScale.width+'px'}" /></div>
        </div>
        <div class="wm-map-actions">
          <p id="uc-map-help" class="wm-help">双指旋转 / 缩放 · 单指拖动<br>红点为当前位置 · 朝向 {{ normalizedBearing }}° · 复位可恢复朝北</p>
          <div class="wm-zoom-controls" data-map-controls aria-label="地图缩放"><button type="button" aria-label="放大地图" :disabled="geographicLayer ? (focusZoom >= 200 && minimumDepth >= 3) : focusZoom >= 12" @click="zoomBy(1.3)">+</button><button type="button" aria-label="缩小地图" :disabled="geographicLayer ? depth >= 5 && focusZoom <= 1 : focusZoom <= .65" @click="zoomBy(1 / 1.3)">−</button><button type="button" aria-label="复位地图视图" @click="resetView">⌂</button></div>
          <div class="wm-rotate-controls" data-map-controls aria-label="地图旋转"><button type="button" aria-label="向左旋转地图" @click="rotateBy(-30)">↶</button><button type="button" aria-label="向右旋转地图" @click="rotateBy(30)">↷</button></div>
        </div>
        <div v-if="roadEvents.length && localLayer && !novelMode" class="wm-route-events" aria-label="路段事件"><button v-for="event in roadEvents" :key="event.id" type="button" :data-map-target="'event:' + event.id" :aria-label="'查看' + event.label" @click="activeEventId = activeEventId === event.id ? '' : event.id">{{ event.icon }} {{ event.title }}</button></div>
        <label v-if="localLayer" class="wm-demo-toggle"><input v-model="showDemoPeople" type="checkbox" aria-label="显示演示人物定位"/><span>演示图层：人物定位<small>有明确演示记录，且关系 ≥ {{ affinityThreshold }} 才显示</small></span></label>
        <p v-if="localLayer" class="wm-boundary-note">演示记录 · 只显示已知且关系达标的位置</p>
        <div v-if="activeEvent && localLayer" class="wm-event-detail" role="status"><h3>{{ activeEvent.title }}</h3><p>{{ activeEvent.detail }}</p><button type="button" @click="activeEventId = ''">收起事件详情</button></div>
      </div>
      <aside class="wm-details">
        <template v-if="localLayer">
          <div class="wm-location-now"><small>当前地点</small><h3>{{ currentLocation?.name }}</h3></div>
          <div v-if="model.state.interior && !novelMode" class="wm-detail-note"><p>你在室内，离开房间后可以继续出行。</p><button type="button" class="wm-outline-button" :disabled="model.busy" @click="runInteraction(model, actions, { type: 'leave_interior' })">离开房间，回到入口</button></div>
          <p v-if="novelMode" class="wm-detail-note" data-novel-energy-rule>健康、饱腹和压力各 50% 为中性线。高健康、高饱腹减耗，高压力增耗；以出发时状态计算。</p>
          <button v-for="(place, index) in localDestinations" :key="place.id" type="button" class="wm-destination" :data-destination="place.id" :disabled="destinationDisabled(place.id)" @click="travelTo(place.id)"><span class="wm-list-number">{{ String(index + 1).padStart(2, '0') }}</span><span><b>{{ place.name }}</b><small>{{ place.subtitle }}</small><small v-if="venueStatusText(place.id)" :data-destination-hours="place.id">{{ venueStatusText(place.id) }}</small><small v-if="place.id !== model.state.locationId" class="wm-route-outlook">{{ destinationNote(place.id) }}</small><small v-if="novelMode && place.id !== model.state.locationId" data-novel-energy-quote>{{ energyCalculationNote(place.id) }}</small></span><span>{{ place.id === model.state.locationId ? '当前' : '↗' }}</span></button>
          <p v-if="!novelMode" class="wm-detail-note">基础 15 分钟 · 5 点精力；遇到路段事件时按预告耗时。</p><p v-else class="wm-detail-note">选择地点后按预告结算，再继续阅读；跨区使用现有公交路线。</p>
          <p v-if="!novelMode" class="wm-detail-note">到达学生公寓、教学楼或图书馆后，收起地图，靠近楼门可进入室内。</p><p v-if="needsTransitReturn && !novelMode" class="wm-detail-note">当前在校园外，请在附近公交站乘车返回校园。</p>
          <p v-if="!novelMode && !roadEvents.length" class="wm-detail-note">当前路线暂无特殊情况。</p>
          <div v-if="visiblePeople.length" class="wm-people-summary"><h3>附近人物</h3><p v-for="person in visiblePeople" :key="person.contactId">{{ person.name }}<small>{{ person.source === 'demo' ? '演示定位' : person.source === 'protagonist' ? '另一主角的实际场景位置' : '现场人物（场景存档）' }}</small></p></div>
        </template>
        <template v-else-if="layer === 'city'">
          <small class="wm-kicker">现有城市片区</small><h3>{{ cityDetail.name }}</h3><p class="wm-detail-note">{{ cityDetail.description }}</p>
          <p v-if="venueStatusText(selectedCity)" class="wm-detail-note" :data-destination-hours="selectedCity">{{ venueStatusText(selectedCity) }}</p>
          <nav class="wm-district-list" aria-label="城市片区"><button v-for="place in cityPlaces" :key="place.id" type="button" :aria-pressed="selectedCity === place.id" @click="enterDistrict(place.id)">{{ place.name }}</button></nav>
          <template v-if="selectedCity !== 'campus'">
            <p v-if="novelMode" class="wm-detail-note">{{ destinationNote(selectedCity) }}</p>
            <p v-if="novelMode" class="wm-detail-note" data-novel-energy-quote>{{ energyCalculationNote(selectedCity) }}</p>
            <p v-if="novelMode" class="wm-detail-note" data-novel-energy-rule>健康、饱腹和压力各 50% 为中性线。高健康、高饱腹减耗，高压力增耗；以出发时状态计算。</p>
            <button v-if="novelMode" type="button" class="wm-outline-button" :disabled="destinationDisabled(selectedCity)" @click="travelTo(selectedCity)">前往{{ cityDetail.name }}</button>
            <template v-else><p v-if="cityRoute" class="wm-detail-note">高田接驳站往返 · {{ cityRoute.minutes }} 分钟 · ¥{{ cityRoute.fare }} · {{ selectedCity === 'downtown' ? '东京Metro联程' : '都营巴士 / 东京Metro' }}</p><button v-if="!needsTransitReturn" type="button" class="wm-outline-button" :disabled="destinationDisabled('bus-stop')" @click="travelTo('bus-stop')">前往南门公交站</button><p class="wm-detail-note">收起地图，到公交站牌选择车辆与目的地。远郊之间经校园换乘。</p></template>
          </template>
          <p class="wm-detail-note">点击地图上的城区，或选择上方片区，进入详细沙盘。</p>
        </template>
        <template v-else>
          <nav class="wm-atlas-breadcrumb" aria-label="地理路径"><button @click="goToLayer('world')">世界</button><span>/</span><button @click="selectCountry(countryId)">{{ currentCountry?.properties.name ?? '国家' }}</button><template v-if="currentRegion"><span>/</span><button @click="selectDivision(regionId)">{{ currentRegion.properties.name }}</button></template></nav>
          <button type="button" class="wm-home-region" @click="goHome"><i aria-hidden="true"/> 主角所在区域 · 日本东京·丰岛</button>
          <label class="wm-search"><span>{{ layer === 'world' ? '查找国家 / 地区' : '查找省 / 州 / 一级区域' }}</span><input v-model="search" type="search" placeholder="输入名称" :aria-label="layer === 'world' ? '查找国家或地区' : '查找地图地区'"/></label>
          <p class="wm-coverage">{{ layer === 'world' ? `${mapData.countries.features.length} 个国家与地区` : `${countryDivisions.length} 个一级行政区域` }}</p>
          <div class="wm-region-list" :aria-label="layer === 'world' ? '国家与地区列表' : '地区列表'"><button v-for="feature in filteredFeatures" :key="feature.properties.id" type="button" :data-atlas-feature-id="feature.properties.id" :class="{ active: selectedId === feature.properties.id }" :aria-pressed="selectedId === feature.properties.id" @click="selectFeature(feature)">{{ featureName(feature) }}<small v-if="isUnion(feature)">苏联 · 架空世界</small></button><p v-if="!filteredFeatures.length" class="wm-detail-note">{{ search ? '未找到对应名称。' : '此地区在当前底图中没有一级区划，保留国家整体浏览。' }}</p></div>
          <div v-if="activeLandmark" class="wm-selected-region"><small class="wm-kicker">地标 · 微缩模型</small><h3>{{ activeLandmark.name }}</h3><p class="wm-detail-note">{{ activeLandmark.detail }}</p></div>
          <div v-else-if="selectedFeature" class="wm-selected-region"><small class="wm-kicker">{{ isUnion(selectedFeature) ? '架空世界设定' : '地图浏览' }}</small><h3>{{ featureName(selectedFeature) }}</h3><p v-if="isUnion(selectedFeature)" class="wm-detail-note">本架空世界保留苏维埃社会主义共和国联盟。</p><p v-if="selectedFeature.properties.id === '330000'" class="wm-detail-note">主角所在省份；标记为省域示意，城市尚未命名。</p></div>
          <div v-if="selectedFeature || activeLandmark" class="wm-journey-actions"><button type="button" @click="draftJourney('visit')">计划访问</button><button type="button" @click="draftJourney('study')">留学意向</button></div>
          <p v-if="itineraryDraft" class="wm-draft" role="status">{{ itineraryDraft }}</p>
          <div v-if="nearbyLandmarks.length && layer !== 'world'" class="wm-landmark-list"><h3>区域地标</h3><button v-for="item in nearbyLandmarks" :key="item.id" type="button" @click="activateTarget('landmark:' + item.id)">{{ item.name }}<span aria-hidden="true">↗</span></button></div>
          <p v-if="regionCities.length && layer === 'province'" class="wm-detail-note">省内地名：{{ regionCities.map(item => item.properties.name).join(' · ') }}。所在城市尚未指定。</p>
          <p class="wm-detail-note">地形为艺术化浅起伏，地标为微缩示意。浏览不会推进时间。</p>
        </template>
      </aside>
    </div>
  </div>
</template>

