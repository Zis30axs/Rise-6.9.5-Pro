<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MapCharacterAvatar from './MapCharacterAvatar.vue';
import LocalMapGeometry from './LocalMapGeometry.vue';
import { districtMapPlaces, mapDistricts } from './map-districts';
import type { CharacterPortraitId } from './types';
import type { ProtagonistId } from '../runtime/dual-protagonists';
import { campusInteriors } from '../runtime/campus-interiors';
import { transitStops } from '../runtime/transit';
import { createCampusMapProjection, mapBounds, mapDistrictLabels, mapLocationPoint, type CampusMapScope, type MapPoint } from './campus-map-layout';

type MapEvent = { id: string; kind: string; label: string; icon: string; x: number; y: number };
type MapPerson = { contactId: string; name: string; personId?: string; portraitId?: CharacterPortraitId; protagonistId?: ProtagonistId; place?: { id: string }; position?: { x: number; z: number }; source?: 'scene' | 'protagonist' | 'demo' };
const props = withDefaults(defineProps<{
  width: number; height: number; locationId: string; busy: boolean;
  roadEvents: MapEvent[]; people: MapPerson[]; bearing?: number; viewScale?: number;
  scope?: CampusMapScope; disabledIds?: string[]; position?: { x: number; z: number } | null; selectedId?: string; playerName?: string; playerId?: ProtagonistId;
}>(), { bearing: 0, viewScale: 1, scope: 'campus', selectedId: '', disabledIds: () => [] });
const emit = defineEmits<{ travel: [locationId: string]; select: [districtId: string]; event: [eventId: string]; scale: [scale: { metersPerPixel: number }] }>();
const selectedPersonId = ref('');
const projection = computed(() => createCampusMapProjection(props.width, props.height, props.bearing, props.scope));
const bounds = computed(() => mapBounds(props.scope));
const metersPerPixel = computed(() => projection.value.metersPerPixel / Math.max(.01, props.viewScale));
watch(metersPerPixel, value => emit('scale', { metersPerPixel: value }), { immediate: true });
const project = (x: number, z: number, elevation = 0) => projection.value.project(x, z, elevation);
const points = (vertices: MapPoint[]) => vertices.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
const currentOutdoorId = computed(() => campusInteriors.find(room => room.id === props.locationId)?.parentLocationId ?? props.locationId);
const destinations = computed(() => props.scope === 'city' ? [] : districtMapPlaces(props.scope));
const markerWidth = computed(() => props.width < 420 ? 92 : 104);
const primaryIds = computed(() => props.scope === 'campus' ? ['dorm', 'library', 'gate', 'teaching', 'cafe', 'bus-stop'] : destinations.value.slice(0, 6).map(place => place.id));
const markers = computed(() => {
  const main = destinations.value.map((place, index) => ({ place, index })).filter(({ place }) => primaryIds.value.includes(place.id)).flatMap(({ place, index }) => {
    const point = mapLocationPoint(place.id);
    return point ? [{ ...place, index, anchor: project(point.x, point.z) }] : [];
  });
  const arranged = mapDistrictLabels(main, props.width, props.height);
  return arranged.map(place => ({ ...place, leader: points([place.anchor, place.label]) }));
});
const showExtraMarkers = computed(() => props.width >= 330 && props.height >= 300);
const extraMarkers = computed(() => {
  if (!showExtraMarkers.value) return [];
  const size = 44, gap = 2;
  type Box = { x: number; y: number; w: number; h: number };
  const overlaps = (a: Box, b: Box) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  const boxes: Box[] = markers.value.map(marker => ({ x: marker.label.x - markerWidth.value / 2, y: marker.label.y, w: markerWidth.value, h: 44 }));
  const offsets = [[0, 0], [0, -54], [0, 54], [-58, 0], [58, 0], [-58, -54], [58, -54], [-58, 54], [58, 54], [0, -108], [0, 108], [-116, 0], [116, 0], [-116, 54], [116, 54], [-58, 108], [58, 108], [0, -162], [0, 162]];
  return destinations.value.map((place, index) => ({ place, index })).filter(({ place }) => !primaryIds.value.includes(place.id)).flatMap(({ place, index }) => {
    const point = mapLocationPoint(place.id);
    if (!point) return [];
    const anchor = project(point.x, point.z);
    const spot = offsets.map(([dx, dy]) => ({ x: anchor.x + dx, y: anchor.y + dy }))
      .find(candidate => candidate.x >= size / 2 + 4 && candidate.x <= props.width - size / 2 - 4 && candidate.y >= size / 2 + 4 && candidate.y <= props.height - size / 2 - 4 && !boxes.some(box => overlaps(box, { x: candidate.x - size / 2, y: candidate.y - size / 2, w: size, h: size })));
    if (!spot) return [];
    boxes.push({ x: spot.x - size / 2, y: spot.y - size / 2, w: size, h: size });
    const moved = Math.hypot(spot.x - anchor.x, spot.y - anchor.y) > 2;
    return [{ ...place, index, anchor, point: spot, leader: moved ? points([anchor, spot]) : '' }];
  });
});
const districts = computed(() => mapDistrictLabels(mapDistricts.map(item => ({ ...item, anchor: project(item.x, item.z) })), props.width, props.height));
const player = computed(() => {
  const point = props.position ?? mapLocationPoint(props.locationId);
  if (!point || point.x < bounds.value.minX || point.x > bounds.value.maxX || point.z < bounds.value.minZ || point.z > bounds.value.maxZ) return undefined;
  return project(point.x, point.z, 1);
});
const peoplePositions = computed(() => props.people.flatMap(person => {
  const point = person.position ?? (person.place ? mapLocationPoint(person.place.id) : null);
  if (!point || point.x < bounds.value.minX || point.x > bounds.value.maxX || point.z < bounds.value.minZ || point.z > bounds.value.maxZ) return [];
  return [{ ...person, anchor: project(point.x, point.z, 13) }];
}));
const selectedPerson = computed(() => props.people.find(person => person.contactId === selectedPersonId.value));
const stops = computed(() => transitStops.filter(stop => props.scope === 'city' || stop.id === (props.scope === 'campus' ? 'campus' : props.scope)).map(stop => ({ ...stop, anchor: project(stop.x, stop.z) })));
const markerStyle = (point: MapPoint) => ({ left: `${point.x}px`, top: `${point.y}px` });
</script>

<template>
  <div class="campus-map-scene is-raised" data-campus-map-scene :data-map-scope="scope" :data-campus-bearing="bearing.toFixed(3)" :data-campus-meters-per-pixel="metersPerPixel.toFixed(4)" data-campus-progress="1.000" data-map-rise="1.000">
    <LocalMapGeometry :width="width" :height="height" :scope="scope" :bearing="bearing" />
    <svg class="cms-geometry cms-labels" :viewBox="`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`" aria-hidden="true">
      <g v-for="stop in stops" :key="stop.id" :data-transit-stop="stop.id"><circle :cx="stop.anchor.x" :cy="stop.anchor.y" r="4" fill="#e5bc6a" stroke="#fff7d9"/><text :x="stop.anchor.x + 6" :y="stop.anchor.y + 3" class="cms-stop-label">站</text></g>
      <g v-if="scope !== 'city'"><polyline v-for="marker in markers" :key="marker.id" :points="marker.leader" fill="none" stroke="#7c8c70" stroke-width="1" opacity=".75"/><polyline v-for="place in extraMarkers.filter(item => item.leader)" :key="'extra-' + place.id" :points="place.leader" fill="none" stroke="#7c8c70" stroke-width=".8" stroke-dasharray="2 2"/></g>
      <g v-else><polyline v-for="district in districts" :key="district.id" :points="points([district.anchor, district.label])" fill="none" stroke="#7c8c70" stroke-width="1"/></g>
    </svg>
    <template v-if="scope !== 'city'">
      <button v-for="place in markers" :key="place.id" type="button" class="cms-place-pin" :class="{ current: place.id === currentOutdoorId }" :style="{ ...markerStyle(place.label), width: markerWidth + 'px' }" :data-map-target="place.id" :disabled="busy || place.id === locationId || disabledIds.includes(place.id)" :aria-label="place.id === locationId ? place.name + '，当前地点' : '前往' + place.name" @click="emit('travel', place.id)"><span class="cms-pin-index">{{ place.index + 1 }}</span><span>{{ place.name }}<small v-if="place.id === currentOutdoorId">{{ locationId === currentOutdoorId ? '你在这里' : '正在室内' }}</small></span></button>
      <button v-for="place in extraMarkers" :key="place.id" type="button" class="cms-place-dot" :class="{ current: place.id === currentOutdoorId }" :style="markerStyle(place.point)" :data-map-target="place.id" :disabled="busy || place.id === locationId || disabledIds.includes(place.id)" :aria-label="place.id === locationId ? place.name + '，当前地点' : '前往' + place.name" :title="place.name" @click="emit('travel', place.id)"><span>{{ place.index + 1 }}</span></button>
      <button v-if="player" type="button" class="cms-avatar-pin cms-avatar-player" :style="markerStyle(player)" :title="playerName || '当前位置'" :aria-label="'当前位置：' + (playerName || '主角')" data-map-player @click="selectedPersonId = ''"><MapCharacterAvatar :name="playerName || '主角'" :protagonist-id="playerId" /></button>
      <button v-for="person in peoplePositions" :key="person.contactId" type="button" class="cms-avatar-pin cms-avatar-person" :class="{ selected: selectedPersonId === person.contactId }" :style="markerStyle(person.anchor)" :data-map-person-id="person.contactId" :title="person.name" :aria-label="'查看人物：' + person.name" :aria-pressed="selectedPersonId === person.contactId" @click="selectedPersonId = selectedPersonId === person.contactId ? '' : person.contactId"><MapCharacterAvatar :name="person.name" :person-id="person.personId" :portrait-id="person.portraitId" :protagonist-id="person.protagonistId" /></button>
      <div v-if="selectedPerson" class="cms-person-detail" role="status"><strong>{{ selectedPerson.name }}</strong><small>{{ selectedPerson.source === 'protagonist' ? '另一主角 · 当前位置' : selectedPerson.source === 'scene' ? '现场人物' : '演示定位' }}</small><button type="button" aria-label="关闭人物信息" @click="selectedPersonId = ''">×</button></div>
    </template>
    <button v-for="district in scope === 'city' ? districts : []" :key="district.id" type="button" class="cms-district-pin" :class="{ selected: district.id === selectedId }" :style="markerStyle(district.label)" :data-map-target="'city:' + district.id" @click="emit('select', district.id)">{{ district.shortName }}</button>
  </div>
</template>
