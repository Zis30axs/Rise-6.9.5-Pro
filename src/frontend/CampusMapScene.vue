<script setup lang="ts">
import { computed, watch } from 'vue';
import { locations } from '../runtime/model';

type MapEvent = { id: string; kind: string; label: string; icon: string; x: number; y: number };
type MapPerson = { contactId: string; name: string; place: { x: number; y: number } };
type Point = { x: number; y: number };
const props = withDefaults(defineProps<{
  progress: number; width: number; height: number; locationId: string; busy: boolean;
  roadEvents: MapEvent[]; people: MapPerson[]; bearing?: number; viewScale?: number;
}>(), { bearing: 0, viewScale: 1 });
const emit = defineEmits<{ travel: [locationId: string]; event: [eventId: string]; scale: [scale: { metersPerPixel: number }] }>();
const bearing = computed(() => Number.isFinite(props.bearing) ? props.bearing : 0);
const designs: Record<string, { width: number; depth: number; height: number; floors: number; roof: string; wall: string; side: string }> = {
  gate: { width: 24, depth: 8, height: 9, floors: 1, roof: '#978162', wall: '#ddcea7', side: '#ab9670' },
  library: { width: 23, depth: 17, height: 24, floors: 4, roof: '#7b947e', wall: '#e5daba', side: '#adac8b' },
  cafe: { width: 18, depth: 13, height: 13, floors: 2, roof: '#b77753', wall: '#efcf9f', side: '#c39973' },
  dorm: { width: 18, depth: 16, height: 32, floors: 6, roof: '#6e8791', wall: '#d5d8c7', side: '#98aaa4' },
};

// One projection is shared by the ground, all building surfaces, and DOM targets.
// No separate CSS perspective is used, so pinch/resize cannot detach a marker.
const projection = computed(() => {
  const input = Math.max(0, Math.min(1, Number.isFinite(props.progress) ? props.progress : 0));
  const p = input * input * (3 - 2 * input);
  const width = Math.max(1, props.width), height = Math.max(1, props.height);
  const angle = ((bearing.value % 360) + p * 22) * Math.PI / 180;
  const compression = 1 - .43 * p;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const raw = (x: number, y: number, z = 0) => ({ x: cos * x - sin * y, y: (sin * x + cos * y) * compression - z * p });
  // Fit the actual rotated slab and roof corners, not the unrotated ground.
  // The positive-height screen offset stays vertical at every bearing.
  const bounds: Point[] = [-10, 111].flatMap(x => [-10, 111].flatMap(y => [raw(x, y), raw(x, y, -2.6)]));
  for (const place of locations) {
    const design = designs[place.id] ?? designs.library;
    for (const x of [place.x - design.width / 2, place.x + design.width / 2]) {
      for (const y of [place.y - design.depth / 2, place.y + design.depth / 2]) bounds.push(raw(x, y, design.height + 1));
    }
  }
  const minX = Math.min(...bounds.map(point => point.x)), maxX = Math.max(...bounds.map(point => point.x));
  const minY = Math.min(...bounds.map(point => point.y)), maxY = Math.max(...bounds.map(point => point.y));
  const unit = Math.max(.1, Math.min((width - 24) / (maxX - minX), (height - 24) / (maxY - minY)));
  const a = Math.cos(angle) * unit, b = Math.sin(angle) * unit * compression;
  const c = -Math.sin(angle) * unit, d = Math.cos(angle) * unit * compression;
  return { p, unit, a, b, c, d, e: width / 2 - (minX + maxX) * unit / 2, f: height / 2 - (minY + maxY) * unit / 2 };
});
const metersPerPixel = computed(() => {
  const { a, b, c, d } = projection.value;
  const outerScale = Number.isFinite(props.viewScale) ? Math.max(.01, props.viewScale) : 1;
  // Fictional campus convention: 1 design unit = 10m. Invert the affine ground
  // projection along the screen's horizontal axis; raised walls are not distance.
  return Math.hypot(d, b) / Math.abs(a * d - b * c) * 10 / outerScale;
});
watch(metersPerPixel, value => emit('scale', { metersPerPixel: value }), { immediate: true });
function project(x: number, y: number, height = 0): Point {
  const m = projection.value;
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f - height * m.unit * m.p };
}
const points = (vertices: Point[]) => vertices.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
const quad = (x1: number, y1: number, x2: number, y2: number, z: number) => points([
  project(x1, y1, z), project(x2, y1, z), project(x2, y2, z), project(x1, y2, z),
]);
const groundTransform = computed(() => {
  const { a, b, c, d, e, f } = projection.value;
  return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
});
const slab = computed(() => {
  const nearY = projection.value.d >= 0 ? 107 : -7, nearX = projection.value.b >= 0 ? 107 : -7;
  return {
    front: points([project(-7, nearY), project(107, nearY), project(107, nearY, -2.6), project(-7, nearY, -2.6)]),
    side: points([project(nearX, -7), project(nearX, 107), project(nearX, 107, -2.6), project(nearX, -7, -2.6)]),
  };
});
function convexHull(vertices: Point[]): Point[] {
  const sorted = [...vertices].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (items: Point[]) => {
    const hull: Point[] = [];
    for (const point of items) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
const buildings = computed(() => locations.map((place, index) => {
  const design = designs[place.id] ?? designs.library;
  const x1 = place.x - design.width / 2, x2 = place.x + design.width / 2;
  const y1 = place.y - design.depth / 2, y2 = place.y + design.depth / 2;
  const floorHeight = design.height / design.floors;
  const southVisible = projection.value.d >= 0, eastVisible = projection.value.b >= 0;
  const faces = [
    { id: southVisible ? 'south' : 'north', role: 'front', from: { x: x1, y: southVisible ? y2 : y1 }, to: { x: x2, y: southVisible ? y2 : y1 }, columns: 4, fill: southVisible ? design.wall : design.side },
    { id: eastVisible ? 'east' : 'west', role: 'side', from: { x: eastVisible ? x2 : x1, y: y1 }, to: { x: eastVisible ? x2 : x1, y: y2 }, columns: 3, fill: eastVisible ? design.side : design.wall },
  ].map(face => {
    const at = (t: number, z = 0) => project(face.from.x + (face.to.x - face.from.x) * t, face.from.y + (face.to.y - face.from.y) * t, z);
    const windows = Array.from({ length: design.floors }, (_, floor) => Array.from({ length: face.columns }, (_, column) => {
      const t1 = (column + .22) / face.columns, t2 = (column + .73) / face.columns;
      const z1 = (floor + .25) * floorHeight, z2 = (floor + .72) * floorHeight;
      return { id: `${floor}-${column}`, polygon: points([at(t1, z1), at(t2, z1), at(t2, z2), at(t1, z2)]), lit: (floor + column + index) % 4 === 0 };
    })).flat();
    return {
      ...face, polygon: points([at(0), at(1), at(1, design.height), at(0, design.height)]), windows,
      floorLines: Array.from({ length: Math.max(0, design.floors - 1) }, (_, i) => points([at(0, (i + 1) * floorHeight), at(1, (i + 1) * floorHeight)])),
    };
  });
  const roof = quad(x1, y1, x2, y2, design.height);
  const label = project(place.x, y2 + 4.5);
  // The two near-side destinations converge when tilted; keep thumb targets apart.
  if (place.id === 'gate') label.x -= 7 * projection.value.p;
  if (place.id === 'cafe') label.x += 7 * projection.value.p;
  const projectedHeight = design.height * projection.value.unit * projection.value.p;
  return {
    ...place, index, design, projectedHeight, depth: project(place.x, place.y).y,
    roof, inset: quad(x1 + 1.5, y1 + 1.5, x2 - 1.5, y2 - 1.5, design.height + .15),
    skylight: quad(x1 + design.width * .3, y1 + design.depth * .23, x1 + design.width * .7, y1 + design.depth * .47, design.height + .3),
    faces, southVisible,
    door: points([project(place.x - 1.8, y2), project(place.x + 1.8, y2), project(place.x + 1.8, y2, 4.2), project(place.x - 1.8, y2, 4.2)]),
    shadow: points(convexHull([x1, x2].flatMap(x => [y1, y2].flatMap(y => [
      project(x, y), project(x + design.height * .45 * projection.value.p, y + design.height * .48 * projection.value.p),
    ])))),
    label,
    entrance: project(place.x, y2),
    caption: project(place.x, place.y, design.height + .4),
  };
}).sort((a, b) => a.depth - b.depth));
const markerWidth = computed(() => props.width < 420 ? 88 : 98);
const markers = computed(() => {
  const width = markerWidth.value, halfWidth = width / 2;
  const clampX = (value: number) => Math.min(props.width - halfWidth - 4, Math.max(halfWidth + 4, value));
  const clampY = (value: number) => Math.min(props.height - 70, Math.max(4, value));
  const short = props.height < 220;
  const upperY = short ? 4 : clampY(props.height * .29 - 22);
  const lowerY = short ? props.height - 70 : Math.max(upperY + 48, clampY(props.height * .72 - 22));
  const labels = buildings.value.map(building => {
    const left = building.id === 'library' || building.id === 'gate';
    const upper = building.id === 'library' || building.id === 'dorm';
    const target = { x: left ? halfWidth + 4 : props.width - halfWidth - 4, y: upper ? upperY : lowerY };
    const p = projection.value.p;
    const label = {
      x: clampX(building.label.x * (1 - p) + target.x * p),
      y: clampY(building.label.y * (1 - p) + target.y * p),
    };
    // Stable screen-space columns prevent labels swapping under the fingers.
    // Even a rotated flat plan keeps the four 44px targets disjoint.
    const columnGap = short ? 26 : 4;
    label.x = left ? Math.min(label.x, props.width / 2 - halfWidth - columnGap) : Math.max(label.x, props.width / 2 + halfWidth + columnGap);
    return { ...building, label, left };
  });
  for (const [upperId, lowerId] of [['library', 'gate'], ['dorm', 'cafe']]) {
    const upper = labels.find(item => item.id === upperId), lower = labels.find(item => item.id === lowerId);
    if (!upper || !lower) continue;
    if (lower.label.y - upper.label.y < 48) {
      const midpoint = (upper.label.y + lower.label.y) / 2;
      upper.label.y = Math.max(4, Math.min(props.height - 118, midpoint - 24));
      lower.label.y = upper.label.y + 48;
    }
  }
  return labels.map(building => {
    const { label, left } = building;
    const edge = { x: label.x + (left ? halfWidth : -halfWidth), y: label.y + 22 };
    const elbow = { x: edge.x + (left ? 10 : -10), y: building.entrance.y };
    return { ...building, label, leader: points([building.entrance, elbow, edge]) };
  });
});
const trees = computed(() => [
  [14, 22], [20, 28], [13, 34], [52, 18], [55, 25], [89, 29], [88, 38],
  [19, 61], [25, 65], [16, 78], [67, 87], [75, 88], [86, 83], [26, 12],
].map(([x, y], index) => {
  const base = project(x, y), top = project(x, y, 5.5);
  return { index, base, top, radius: projection.value.unit * (index % 3 === 0 ? 2.4 : 2), depth: base.y };
}));
const scenery = computed(() => [
  ...buildings.value.map(building => ({ kind: 'building' as const, id: building.id, depth: building.depth, building })),
  ...trees.value.map(tree => ({ kind: 'tree' as const, id: `tree-${tree.index}`, depth: tree.depth, tree })),
].sort((a, b) => a.depth - b.depth));
const peoplePositions = computed(() => props.people.map(person => {
  const building = buildings.value.find(item => item.x === person.place.x && item.y === person.place.y);
  const anchor = project(person.place.x, person.place.y, (building?.design.height ?? 10) + 2.5);
  return { ...person, anchor };
}));
const eventPositions = computed(() => {
  if (props.height < 220) {
    // A fixed central lane guarantees room for all three 44px route targets on
    // the shortest phone canvas; leader lines preserve their route positions.
    return props.roadEvents.map((event, index) => {
      const routeAnchor = project(event.x, event.y);
      const anchor = { x: props.width / 2, y: props.roadEvents.length === 1 ? props.height / 2 : 26 + index * (props.height - 52) / (props.roadEvents.length - 1) };
      return { ...event, anchor, routeAnchor, displaced: Math.hypot(anchor.x - routeAnchor.x, anchor.y - routeAnchor.y) > 8 };
    });
  }
  // Collision space is the real 44px touch target, not just the 25px icon.
  // Inflating obstacles turns placement into a nearest free centre search.
  const radius = 22, gap = 4, inset = 4;
  const minX = radius + inset, maxX = Math.max(minX, props.width - radius - inset);
  const minY = radius + inset, maxY = Math.max(minY, props.height - radius - inset);
  const clampX = (value: number) => Math.max(minX, Math.min(maxX, value));
  const clampY = (value: number) => Math.max(minY, Math.min(maxY, value));
  const blocked = markers.value.map(marker => ({
    left: marker.label.x - markerWidth.value / 2 - radius - gap,
    right: marker.label.x + markerWidth.value / 2 + radius + gap,
    top: marker.label.y - radius - gap,
    bottom: marker.label.y + 44 + radius + gap,
  }));
  return props.roadEvents.map(event => {
    const routeAnchor = project(event.x, event.y);
    // The closest point outside axis-aligned rectangles lies on the original
    // centre, an obstacle edge, or a viewport edge. Crossing these coordinates
    // covers even narrow free corridors without a coarse placement grid.
    const xs = new Set([clampX(routeAnchor.x), minX, maxX]);
    const ys = new Set([clampY(routeAnchor.y), minY, maxY]);
    for (const box of blocked) {
      xs.add(clampX(box.left)); xs.add(clampX(box.right));
      ys.add(clampY(box.top)); ys.add(clampY(box.bottom));
    }
    let anchor = { x: clampX(routeAnchor.x), y: clampY(routeAnchor.y) };
    let bestDistance = Infinity;
    for (const x of xs) for (const y of ys) {
      if (blocked.some(box => x > box.left && x < box.right && y > box.top && y < box.bottom)) continue;
      const distance = (x - routeAnchor.x) ** 2 + (y - routeAnchor.y) ** 2;
      if (distance < bestDistance) { anchor = { x, y }; bestDistance = distance; }
    }
    // The runtime exposes at most three other destinations; all three 44px
    // events fit beside the four labels even at the 320×170 minimum canvas.
    blocked.push({ left: anchor.x - radius * 2 - gap, right: anchor.x + radius * 2 + gap, top: anchor.y - radius * 2 - gap, bottom: anchor.y + radius * 2 + gap });
    return { ...event, anchor, routeAnchor, displaced: Math.hypot(anchor.x - routeAnchor.x, anchor.y - routeAnchor.y) > 8 };
  });
});
function markerStyle(point: Point) { return { left: `${point.x}px`, top: `${point.y}px` }; }
</script>

<template>
  <div class="campus-map-scene" data-campus-map-scene :data-campus-bearing="bearing.toFixed(3)" :data-campus-meters-per-pixel="metersPerPixel.toFixed(4)" :data-campus-progress="progress.toFixed(3)" :data-map-rise="projection.p.toFixed(3)" :class="{ 'is-raised': progress > .5 }">
    <svg class="cms-geometry" :viewBox="`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`" aria-hidden="true">
      <polygon :points="slab.front" fill="#869b79" />
      <polygon :points="slab.side" fill="#6d896f" />
      <g :transform="groundTransform">
        <rect x="-7" y="-7" width="114" height="114" rx="4" fill="#d6ddbd" stroke="#a6b897" stroke-width=".6" />
        <g fill="#bfd0aa"><path d="M-6-6H59V13H20v31H-6Z"/><path d="M83-6h23v58H84V30H58V14H83Z"/><path d="M-6 69h35v37H-6Z"/><path d="M65 79h41v27H65Z"/></g>
        <path d="M-10 58C10 46 25 50 39 58S66 66 80 57 99 51 111 58" fill="none" stroke="#a8c3b5" stroke-width="11" />
        <path d="M-10 58C10 46 25 50 39 58S66 66 80 57 99 51 111 58" fill="none" stroke="#b9d1c3" stroke-width="6" />
        <g fill="none" stroke-linejoin="round" stroke-linecap="round">
          <path d="M46 109V69L36 47V29M36 47H70V23M70 47V64H76M-6 47H107" stroke="#b2bba0" stroke-width="7.4"/>
          <path d="M46 109V69L36 47V29M36 47H70V23M70 47V64H76M-6 47H107" stroke="#f2edd5" stroke-width="6"/>
          <path d="M46 109V69L36 47V29M36 47H70V23M70 47V64H76M-6 47H107" stroke="#d1ceb7" stroke-width=".45" stroke-dasharray="1.2 2.2"/>
          <path d="M15 14V38H26M84 80H64V70M16 82H31" stroke="#e8e5ca" stroke-width="2.3"/>
        </g>
        <g fill="#99b18d"><circle cx="17" cy="16" r="3"/><circle cx="20" cy="72" r="4"/><circle cx="83" cy="90" r="4.5"/><circle cx="91" cy="17" r="3.4"/></g>
        <g fill="#d4c69c" stroke="#a9ae89" stroke-width=".5"><rect x="24" y="43" width="5" height="1.6" rx=".5"/><rect x="57" y="50" width="5" height="1.6" rx=".5"/><rect x="50" y="84" width="1.6" height="5" rx=".5"/></g>
        <g fill="#9aad8d" opacity=".6"><circle cx="7" cy="9" r=".4"/><circle cx="9" cy="12" r=".5"/><circle cx="54" cy="34" r=".5"/><circle cx="59" cy="37" r=".4"/><circle cx="95" cy="73" r=".5"/></g>
      </g>
      <g :opacity=".09 + projection.p * .2"><polygon v-for="building in buildings" :key="building.id" :points="building.shadow" fill="#536b4d"/></g>
      <g v-for="tree in trees" :key="tree.index" class="cms-tree-shadow">
        <ellipse :cx="tree.base.x + tree.radius * .7 * projection.p" :cy="tree.base.y + tree.radius * .2" :rx="tree.radius * 1.2" :ry="tree.radius * .55" fill="#6c895e" :opacity=".13 + projection.p * .15"/>
      </g>
      <g class="cms-label-leaders" :opacity=".3 + projection.p * .6">
        <polyline v-for="marker in markers" :key="marker.id" :points="marker.leader" fill="none" stroke="#f6f2dc" stroke-width="3" stroke-linejoin="round"/>
        <polyline v-for="marker in markers" :key="marker.id + '-ink'" :points="marker.leader" fill="none" stroke="#72866a" stroke-width="1" stroke-linejoin="round"/>
      </g>
      <g v-for="event in eventPositions" :key="event.id + '-route'" class="cms-event-leader">
        <template v-if="event.displaced">
          <line :x1="event.routeAnchor.x" :y1="event.routeAnchor.y" :x2="event.anchor.x" :y2="event.anchor.y" stroke="#9c8052" stroke-width="1" stroke-dasharray="2 3" opacity=".8"/>
          <circle :cx="event.routeAnchor.x" :cy="event.routeAnchor.y" r="2" fill="#a28755"/>
        </template>
      </g>
      <template v-for="item in scenery" :key="item.id">
        <g v-if="item.kind === 'tree'" class="cms-tree">
          <path :d="`M${item.tree.base.x},${item.tree.base.y}L${item.tree.top.x},${item.tree.top.y}`" stroke="#817a55" :stroke-width="Math.max(1, projection.unit * .7)"/>
          <ellipse :cx="item.tree.top.x" :cy="item.tree.top.y" :rx="item.tree.radius" :ry="item.tree.radius * (.73 + projection.p * .35)" fill="#6f936d"/>
          <ellipse :cx="item.tree.top.x - item.tree.radius * .24" :cy="item.tree.top.y - item.tree.radius * .2" :rx="item.tree.radius * .65" :ry="item.tree.radius * .66" fill="#9bb180"/>
        </g>
        <g v-else class="cms-building" :data-building-id="item.building.id" :data-building-height="item.building.projectedHeight.toFixed(2)">
          <template v-for="building in [item.building]" :key="building.id">
            <g v-for="face in building.faces" :key="face.role" :data-wall-face="face.id">
              <polygon :points="face.polygon" :fill="face.fill" class="cms-wall" :class="'cms-wall-' + face.role" />
              <g :opacity="projection.p">
                <polyline v-for="(line, index) in face.floorLines" :key="index" :points="line" fill="none" stroke="#737e68" stroke-width=".8" opacity=".25" />
                <polygon v-for="window in face.windows" :key="window.id" :points="window.polygon" :fill="window.lit ? '#e8c580' : '#657d76'" stroke="#e9dfbc" stroke-width=".45" />
                <polygon v-if="face.id === 'south'" :points="building.door" fill="#4d6c63" stroke="#eee0b8" stroke-width=".8" />
              </g>
            </g>
            <polygon :points="building.roof" :fill="building.design.roof" stroke="#f3edd7" stroke-width="1.3" stroke-linejoin="round" />
            <polygon :points="building.inset" fill="none" stroke="#e5e5cb" stroke-width=".8" opacity=".7" />
            <polygon :points="building.skylight" fill="#ced8c8" stroke="#627e73" stroke-width=".7" />
            <path v-if="building.id === locationId" :d="`M${building.entrance.x - 4},${building.entrance.y + 3}h8`" stroke="#f8df9d" stroke-width="3" stroke-linecap="round" />
          </template>
        </g>
      </template>
    </svg>
    <button v-for="building in markers" :key="building.id" type="button" class="cms-place-pin" :class="{ current: building.id === locationId }" :style="{ ...markerStyle(building.label), width: markerWidth + 'px' }" :data-map-target="building.id" :disabled="busy || building.id === locationId" :aria-label="building.id === locationId ? building.name + '，当前地点' : '前往' + building.name" @click="emit('travel', building.id)">
      <span class="cms-pin-index">{{ building.index + 1 }}</span><span>{{ building.name }}<small v-if="building.id === locationId">你在这里</small></span>
    </button>
    <button v-for="event in eventPositions" :key="event.id" type="button" class="cms-road-event" :class="event.kind" :style="markerStyle(event.anchor)" :data-map-target="'event:' + event.id" :aria-label="'查看' + event.label" @click="emit('event', event.id)"><span aria-hidden="true">{{ event.icon }}</span></button>
    <span v-for="person in peoplePositions" :key="person.contactId" class="wm-person-pin cms-person-pin" :style="markerStyle(person.anchor)"><i aria-hidden="true"/>{{ person.name }}<small>演示定位</small></span>
  </div>
</template>
