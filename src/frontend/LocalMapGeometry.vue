<script setup lang="ts">
import { computed, useId } from 'vue';
import { createCampusMapProjection, mapAreas, mapBounds, mapPaths, visibleMapBuildings, type CampusMapScope, type MapCameraView, type MapPoint } from './campus-map-layout';

const props = withDefaults(defineProps<{ width: number; height: number; scope?: CampusMapScope; bearing?: number; cameraView?: MapCameraView }>(), { scope: 'city', bearing: 0 });
const clipId = 'map-ground-' + useId();
const bounds = computed(() => mapBounds(props.scope));
const projection = computed(() => createCampusMapProjection(props.width, props.height, props.bearing, props.scope, props.cameraView));
const project = (x: number, z: number, elevation = 0) => projection.value.project(x, z, elevation);
const points = (vertices: MapPoint[]) => vertices.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
const quad = (x1: number, z1: number, x2: number, z2: number, h = 0) => points([project(x1, z1, h), project(x2, z1, h), project(x2, z2, h), project(x1, z2, h)]);
const groundTransform = computed(() => { const { a, b, c, d, e, f } = projection.value; return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`; });
const paths = computed(() => mapPaths.flatMap(path => {
  const x1 = Math.max(bounds.value.minX, path.x - path.width / 2), x2 = Math.min(bounds.value.maxX, path.x + path.width / 2);
  const z1 = Math.max(bounds.value.minZ, path.z - path.depth / 2), z2 = Math.min(bounds.value.maxZ, path.z + path.depth / 2);
  return x2 > x1 && z2 > z1 ? [{ ...path, x1, z1, width: x2 - x1, depth: z2 - z1 }] : [];
}));
const areas = computed(() => mapAreas.filter(area => area.maxX >= bounds.value.minX && area.minX <= bounds.value.maxX && area.maxZ >= bounds.value.minZ && area.minZ <= bounds.value.maxZ));
const buildings = computed(() => visibleMapBuildings(props.scope).map(building => {
  const { x, z, width, depth, height } = building;
  const x1 = x - width / 2, x2 = x + width / 2, z1 = z - depth / 2, z2 = z + depth / 2;
  const nearZ = projection.value.d >= 0 ? z2 : z1, nearX = projection.value.b >= 0 ? x2 : x1;
  const wall = (ax: number, az: number, bx: number, bz: number) => points([project(ax, az), project(bx, bz), project(bx, bz, height), project(ax, az, height)]);
  return { ...building, order: project(x, z).y, projectedHeight: height * projection.value.unit,
    roof: quad(x1, z1, x2, z2, height), front: wall(x1, nearZ, x2, nearZ), side: wall(nearX, z1, nearX, z2),
    inset: quad(x1 + 1, z1 + 1, x2 - 1, z2 - 1, height + .1),
    windows: Array.from({ length: Math.max(1, Math.round(height / 3)) }, (_, floor) => points([project(x1 + 1, nearZ, 1 + floor * 2.7), project(x2 - 1, nearZ, 1 + floor * 2.7)])),
    shadow: quad(x1 + height * .3, z1 + height * .35, x2 + height * .3, z2 + height * .35) };
}).sort((a, b) => a.order - b.order));
</script>

<template>
  <svg class="cms-geometry" :viewBox="`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`" aria-hidden="true">
    <defs><clipPath :id="clipId"><rect :x="bounds.minX" :y="bounds.minZ" :width="bounds.maxX - bounds.minX" :height="bounds.maxZ - bounds.minZ" /></clipPath></defs>
    <g :transform="groundTransform" :clip-path="`url(#${clipId})`">
      <rect :x="bounds.minX" :y="bounds.minZ" :width="bounds.maxX - bounds.minX" :height="bounds.maxZ - bounds.minZ" fill="#c4d1b4" stroke="#8ca083"/>
      <rect v-for="area in areas" :key="area.id" :x="area.minX" :y="area.minZ" :width="area.maxX - area.minX" :height="area.maxZ - area.minZ" :fill="area.id === 'city-park' ? '#8eaf86' : area.id === 'neighborhood' ? '#cbbda2' : '#d4d9bf'" rx="3"/>
      <rect x="22" y="74" width="43" height="15" fill="#90af86" rx="4"/>
      <ellipse cx="46" cy="-11" rx="17" ry="23" fill="#b78c76"/>
      <ellipse cx="46" cy="-11" rx="14" ry="20" fill="#90ac80" stroke="#e9e1c9" stroke-width=".5"/>
      <rect x="35" y="-27" width="22" height="32" fill="none" stroke="#eee7cf" stroke-width=".4"/>
      <rect v-for="(path, index) in paths" :key="index" :x="path.x1" :y="path.z1" :width="path.width" :height="path.depth" :fill="path.kind === 'road' ? '#7d8c85' : '#eee2c7'"/>
      <g data-map-worksite>
        <rect x="-66.5" y="59.5" width="29" height="23" fill="#cfad83" stroke="#a37546" stroke-width="1" stroke-dasharray="2 1" rx="1"/>
        <path d="M-64 78l8 -12m-3 14l8 -12m-3 14l8 -12m-3 12l6 -9" fill="none" stroke="#aa8056" stroke-width=".8" opacity=".75"/>
        <rect x="-59" y="67" width="14" height="10" fill="none" stroke="#776d5d" stroke-width="1" stroke-dasharray="2 1"/>
        <text x="-52" y="64.5" text-anchor="middle" font-size="3" fill="#715139">工地</text>
      </g>
      <ellipse cx="179" cy="-192" rx="23" ry="12" fill="#82adb0" stroke="#bacbb1" stroke-width="2"/>
      <path d="M-70 27H-6M6 27H70" fill="none" stroke="#83947d" stroke-width="1"/>
      <text x="46" y="-10" text-anchor="middle" class="cms-ground-label">运动场</text>
      <text x="42" y="84" text-anchor="middle" class="cms-ground-label">口袋公园</text>
    </g>
    <polygon v-for="building in buildings" :key="building.id + '-shadow'" :points="building.shadow" fill="#536b4d" opacity=".17"/>
    <g v-for="building in buildings" :key="building.id" class="cms-building" :data-building-id="building.id" :data-building-height="building.projectedHeight.toFixed(2)">
      <polygon :points="building.front" fill="#ded2b6" data-wall-face="front"/>
      <polygon :points="building.side" fill="#a5ad91" data-wall-face="side"/>
      <polyline v-for="(line, index) in building.windows" :key="index" :points="line" stroke="#79908b" :stroke-width="Math.max(.5, projection.unit * .75)" stroke-dasharray="2 2"/>
      <polygon :points="building.roof" :fill="building.color" stroke="#f5ecd3" stroke-width=".7"/>
      <polygon :points="building.inset" fill="none" stroke="#e6e4c9" stroke-width=".5"/>
    </g>
  </svg>
</template>
