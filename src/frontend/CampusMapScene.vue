<script setup lang="ts">
import { computed, watch } from 'vue';
import { mapLocations } from '../runtime/model';
import { campusInteriors } from '../runtime/campus-interiors';
import { transitStops } from '../runtime/transit';
import { createCampusMapProjection, mapAreas, mapBounds, mapDistrictLabels, mapLocationPoint, mapPaths, visibleMapBuildings, type CampusMapScope, type MapPoint } from './campus-map-layout';

type MapEvent = { id: string; kind: string; label: string; icon: string; x: number; y: number };
type MapPerson = { contactId: string; name: string; place: { id: string } };
const props = withDefaults(defineProps<{
  width: number; height: number; locationId: string; busy: boolean;
  roadEvents: MapEvent[]; people: MapPerson[]; bearing?: number; viewScale?: number;
  scope?: CampusMapScope; position?: { x: number; z: number } | null; selectedId?: string;
}>(), { bearing: 0, viewScale: 1, scope: 'campus', selectedId: '' });
const emit = defineEmits<{ travel: [locationId: string]; select: [districtId: string]; event: [eventId: string]; scale: [scale: { metersPerPixel: number }] }>();
const projection = computed(() => createCampusMapProjection(props.width, props.height, props.bearing, props.scope));
const bounds = computed(() => mapBounds(props.scope));
const metersPerPixel = computed(() => projection.value.metersPerPixel / Math.max(.01, props.viewScale));
watch(metersPerPixel, value => emit('scale', { metersPerPixel: value }), { immediate: true });
const project = (x: number, z: number, elevation = 0) => projection.value.project(x, z, elevation);
const points = (vertices: MapPoint[]) => vertices.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
const quad = (x1: number, z1: number, x2: number, z2: number, elevation = 0) => points([project(x1, z1, elevation), project(x2, z1, elevation), project(x2, z2, elevation), project(x1, z2, elevation)]);
const groundTransform = computed(() => { const { a, b, c, d, e, f } = projection.value; return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`; });
const slab = computed(() => {
  const { minX, maxX, minZ, maxZ } = bounds.value;
  const z = projection.value.d >= 0 ? maxZ : minZ, x = projection.value.b >= 0 ? maxX : minX;
  return [points([project(minX, z), project(maxX, z), project(maxX, z, -4), project(minX, z, -4)]), points([project(x, minZ), project(x, maxZ), project(x, maxZ, -4), project(x, minZ, -4)])];
});
const paths = computed(() => mapPaths.flatMap(path => {
  const x1 = Math.max(bounds.value.minX, path.x - path.width / 2), x2 = Math.min(bounds.value.maxX, path.x + path.width / 2);
  const z1 = Math.max(bounds.value.minZ, path.z - path.depth / 2), z2 = Math.min(bounds.value.maxZ, path.z + path.depth / 2);
  return x2 > x1 && z2 > z1 ? [{ ...path, x1, z1, width: x2 - x1, depth: z2 - z1 }] : [];
}));
const areas = computed(() => mapAreas.filter(area => area.minX >= bounds.value.minX && area.maxX <= bounds.value.maxX && area.minZ >= bounds.value.minZ && area.maxZ <= bounds.value.maxZ));
const buildings = computed(() => visibleMapBuildings(props.scope).map(building => {
  const { x, z, width, depth, height } = building;
  const x1 = x - width / 2, x2 = x + width / 2, z1 = z - depth / 2, z2 = z + depth / 2;
  const nearZ = projection.value.d >= 0 ? z2 : z1, nearX = projection.value.b >= 0 ? x2 : x1;
  const wall = (ax: number, az: number, bx: number, bz: number) => points([project(ax, az), project(bx, bz), project(bx, bz, height), project(ax, az, height)]);
  return { ...building, order: project(x, z).y, projectedHeight: height * projection.value.unit,
    roof: quad(x1, z1, x2, z2, height), front: wall(x1, nearZ, x2, nearZ), side: wall(nearX, z1, nearX, z2),
    inset: quad(x1 + 1, z1 + 1, x2 - 1, z2 - 1, height + .1),
    windows: Array.from({ length: Math.max(1, Math.round(height / 3)) }, (_, floor) => {
      const h = 1 + floor * 2.7;
      return points([project(x1 + 1, nearZ, h), project(x2 - 1, nearZ, h)]);
    }), shadow: quad(x1 + height * .3, z1 + height * .35, x2 + height * .3, z2 + height * .35) };
}).sort((a, b) => a.order - b.order));
const currentOutdoorId = computed(() => campusInteriors.find(room => room.id === props.locationId)?.parentLocationId ?? props.locationId);
const destinations = computed(() => mapLocations);
const markerWidth = computed(() => props.width < 420 ? 92 : 104);
const primaryIds = ['dorm', 'library', 'gate', 'teaching', 'cafe', 'bus-stop'];
const markers = computed(() => destinations.value.map((place, index) => ({ place, index })).filter(({ place }) => primaryIds.includes(place.id)).map(({ place, index }) => {
  const point = mapLocationPoint(place.id)!;
  const leftIds = ['dorm', 'library', 'gate'], rightIds = ['teaching', 'cafe', 'bus-stop'];
  const left = leftIds.includes(place.id), row = (left ? leftIds : rightIds).indexOf(place.id);
  const half = markerWidth.value / 2;
  const label = { x: left ? half + 4 : props.width - half - 4, y: 6 + row * Math.max(48, (props.height - 74) / 2) };
  const anchor = project(point.x, point.z);
  const edge = { x: label.x + (left ? half : -half), y: label.y + 22 };
  return { ...place, index, label, anchor, leader: points([anchor, { x: edge.x + (left ? 8 : -8), y: anchor.y }, edge]) };
}));
const showExtraMarkers = computed(() => props.width >= 330 && props.height >= 300);
const extraMarkers = computed(() => {
  if (!showExtraMarkers.value) return [];
  const size = 44, gap = 2;
  type Box = { x: number; y: number; w: number; h: number };
  const overlaps = (a: Box, b: Box) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  const boxes: Box[] = markers.value.map(marker => ({ x: marker.label.x - markerWidth.value / 2, y: marker.label.y, w: markerWidth.value, h: 44 }));
  const offsets = [[0, 0], [0, -54], [0, 54], [-58, 0], [58, 0], [-58, -54], [58, -54], [-58, 54], [58, 54], [0, -108], [0, 108], [-116, 0], [116, 0], [-116, 54], [116, 54], [-58, 108], [58, 108], [0, -162], [0, 162]];
  return destinations.value.map((place, index) => ({ place, index })).filter(({ place }) => !primaryIds.includes(place.id)).flatMap(({ place, index }) => {
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
const districts = computed(() => mapDistrictLabels([
  { id: 'campus', name: '校园与南门', x: 0, z: 15 },
  ...transitStops.filter(stop => stop.id !== 'campus').map(stop => ({ id: stop.id, name: stop.id === 'home' ? '家与住宅区' : stop.id === 'commercial' ? '商业区' : stop.id === 'downtown' ? '市中心区' : '城市公园', x: stop.x, z: stop.z })),
].map(item => ({ ...item, anchor: project(item.x, item.z) })), props.width, props.height));
const player = computed(() => {
  const point = props.position ?? mapLocationPoint(props.locationId);
  if (!point || point.x < bounds.value.minX || point.x > bounds.value.maxX || point.z < bounds.value.minZ || point.z > bounds.value.maxZ) return undefined;
  return project(point.x, point.z, 1);
});
const peoplePositions = computed(() => props.people.flatMap(person => {
  const point = mapLocationPoint(person.place.id);
  return point ? [{ ...person, anchor: project(point.x, point.z, 13) }] : [];
}));
const stops = computed(() => transitStops.filter(stop => props.scope === 'city' || stop.id === 'campus').map(stop => ({ ...stop, anchor: project(stop.x, stop.z) })));
const markerStyle = (point: MapPoint) => ({ left: `${point.x}px`, top: `${point.y}px` });
</script>

<template>
  <div class="campus-map-scene is-raised" data-campus-map-scene :data-map-scope="scope" :data-campus-bearing="bearing.toFixed(3)" :data-campus-meters-per-pixel="metersPerPixel.toFixed(4)" data-campus-progress="1.000" data-map-rise="1.000">
    <svg class="cms-geometry" :viewBox="`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`" aria-hidden="true">
      <polygon v-for="(face, index) in slab" :key="index" :points="face" :fill="index ? '#769077' : '#8da17d'" />
      <g :transform="groundTransform">
        <rect :x="bounds.minX" :y="bounds.minZ" :width="bounds.maxX - bounds.minX" :height="bounds.maxZ - bounds.minZ" fill="#c4d1b4" stroke="#8ca083"/>
        <rect v-for="area in areas" :key="area.id" :x="area.minX" :y="area.minZ" :width="area.maxX - area.minX" :height="area.maxZ - area.minZ" :fill="area.id === 'city-park' ? '#8eaf86' : area.id === 'neighborhood' ? '#cbbda2' : '#d4d9bf'" rx="3"/>
        <rect x="22" y="74" width="43" height="15" fill="#90af86" rx="4"/>
        <ellipse cx="46" cy="-11" rx="17" ry="23" fill="#b78c76"/>
        <ellipse cx="46" cy="-11" rx="14" ry="20" fill="#90ac80" stroke="#e9e1c9" stroke-width=".5"/>
        <rect x="35" y="-27" width="22" height="32" fill="none" stroke="#eee7cf" stroke-width=".4"/>
        <rect v-for="(path, index) in paths" :key="index" :x="path.x1" :y="path.z1" :width="path.width" :height="path.depth" :fill="path.kind === 'road' ? '#7d8c85' : '#eee2c7'"/>
        <ellipse v-if="scope === 'city'" cx="179" cy="-192" rx="23" ry="12" fill="#82adb0" stroke="#bacbb1" stroke-width="2"/>
        <path d="M-70 27H-6M6 27H70" fill="none" stroke="#83947d" stroke-width="1"/>
        <rect v-for="x in [-5, 5]" :key="x" :x="x - .5" y="26.5" width="1" height="1" fill="#efe3bd"/>
        <text x="46" y="-10" text-anchor="middle" class="cms-ground-label">运动场</text>
        <text x="42" y="84" text-anchor="middle" class="cms-ground-label">口袋公园</text>
        <text x="0" y="53" text-anchor="middle" class="cms-ground-label">南门十字街</text>
      </g>
      <polygon v-for="building in buildings" :key="building.id + '-shadow'" :points="building.shadow" fill="#536b4d" opacity=".17"/>
      <g v-for="building in buildings" :key="building.id" class="cms-building" :data-building-id="building.id" :data-building-height="building.projectedHeight.toFixed(2)">
        <polygon :points="building.front" fill="#ded2b6" class="cms-wall" data-wall-face="front"/>
        <polygon :points="building.side" fill="#a5ad91" class="cms-wall" data-wall-face="side"/>
        <polyline v-for="(line, index) in building.windows" :key="index" :points="line" stroke="#79908b" :stroke-width="Math.max(.5, projection.unit * .75)" stroke-dasharray="2 2"/>
        <polygon :points="building.roof" :fill="building.color" stroke="#f5ecd3" stroke-width=".7"/>
        <polygon :points="building.inset" fill="none" stroke="#e6e4c9" stroke-width=".5"/>
      </g>
      <g v-for="stop in stops" :key="stop.id" :data-transit-stop="stop.id"><circle :cx="stop.anchor.x" :cy="stop.anchor.y" r="4" fill="#e5bc6a" stroke="#fff7d9"/><text :x="stop.anchor.x + 6" :y="stop.anchor.y + 3" class="cms-stop-label">站</text></g>
      <g v-if="scope === 'campus'" class="cms-label-leaders"><polyline v-for="marker in markers" :key="marker.id" :points="marker.leader" fill="none" stroke="#7c8c70" stroke-width="1" opacity=".75"/><polyline v-for="place in extraMarkers.filter(item => item.leader)" :key="'extra-' + place.id" :points="place.leader" fill="none" stroke="#7c8c70" stroke-width=".8" stroke-dasharray="2 2" opacity=".7"/></g>
      <g v-else class="cms-label-leaders"><polyline v-for="district in districts" :key="district.id" :points="points([district.anchor, district.label])" fill="none" stroke="#7c8c70" stroke-width="1"/></g>
      <g v-if="player" class="cms-player-position" :data-player-world-x="position?.x" :data-player-world-z="position?.z"><circle :cx="player.x" :cy="player.y" r="7" fill="#b45845" stroke="#fff0c3" stroke-width="2"/><circle :cx="player.x" :cy="player.y" r="2" fill="#fff5d8"/></g>
    </svg>
    <template v-if="scope === 'campus'">
      <button v-for="place in markers" :key="place.id" type="button" class="cms-place-pin" :class="{ current: place.id === currentOutdoorId }" :style="{ ...markerStyle(place.label), width: markerWidth + 'px' }" :data-map-target="place.id" :disabled="busy || place.id === locationId" :aria-label="place.id === locationId ? place.name + '，当前地点' : '前往' + place.name" @click="emit('travel', place.id)"><span class="cms-pin-index">{{ place.index + 1 }}</span><span>{{ place.name }}<small v-if="place.id === currentOutdoorId">{{ locationId === currentOutdoorId ? '你在这里' : '正在室内' }}</small></span></button>
      <button v-for="place in extraMarkers" :key="place.id" type="button" class="cms-place-dot" :class="{ current: place.id === currentOutdoorId }" :style="markerStyle(place.point)" :data-map-target="place.id" :disabled="busy || place.id === locationId" :aria-label="place.id === locationId ? place.name + '，当前地点' : '前往' + place.name" :title="place.name" @click="emit('travel', place.id)"><span>{{ place.index + 1 }}</span></button>
      <span v-for="person in peoplePositions" :key="person.contactId" class="wm-person-pin cms-person-pin" :style="markerStyle(person.anchor)">{{ person.name }}<small>演示定位</small></span>
    </template>
    <button v-for="district in scope === 'city' ? districts : []" :key="district.id" type="button" class="cms-district-pin" :class="{ selected: district.id === selectedId }" :style="markerStyle(district.label)" :data-map-target="'city:' + district.id" @click="emit('select', district.id)">{{ district.name }}</button>
  </div>
</template>
