<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { InternationalLeg } from '../runtime/california';
import atlas from '../../assets/california-sandbox/sandbox.json';
import terrain from '../../assets/california-sandbox/sandbox.glb?inline';
import { mountCaliforniaMap } from './california-sandbox-renderer.js';

type Place = { id: string; name: string; subtitle: string; description: string };
const props = defineProps<{
  locationId: string;
  places: readonly Place[];
  routes: readonly InternationalLeg[];
  busy?: boolean;
}>();
const emit = defineEmits<{ travel: [id: string] }>();
const mapRoot = ref<HTMLElement>();
const selectedId = ref(atlas.landmarks.some(place => place.id === props.locationId) ? props.locationId : 'sfo-airport');
const selectedSight = ref<(typeof atlas.sights)[number] | null>(null);
const search = ref('');
const selected = computed(() => props.places.find(place => place.id === selectedId.value));
const routeToSelected = computed(() => selectedSight.value ? undefined : props.routes.find(route => route.to === selectedId.value));
const shownPlaces = computed(() => props.places.filter(place => `${place.name} ${place.subtitle}`.toLowerCase().includes(search.value.trim().toLowerCase())));
const shownSights = computed(() => atlas.sights.filter(sight => `${sight.name} ${sight.desc}`.toLowerCase().includes(search.value.trim().toLowerCase())));
let scene: ReturnType<typeof mountCaliforniaMap> | undefined;

function selectPlace(id: string) {
  if (!props.places.some(place => place.id === id)) return;
  selectedId.value = id;
  selectedSight.value = null;
  syncMap();
}
function goTo(id: string) {
  if (!props.busy && id !== props.locationId && props.routes.some(route => route.to === id)) emit('travel', id);
}
function syncMap() {
  scene?.update({ locationId: props.locationId, ...(!selectedSight.value ? { selectedId: selectedId.value } : {}), route: routeToSelected.value ? [{ from: props.locationId, to: selectedId.value }] : [] });
}
watch(() => props.locationId, id => {
  if (props.places.some(place => place.id === id)) selectedId.value = id;
  selectedSight.value = null;
  syncMap();
});
watch(() => props.routes, syncMap);
onMounted(() => {
  if (!mapRoot.value) return;
  scene = mountCaliforniaMap(mapRoot.value, atlas, terrain, {
    locationId: props.locationId,
    selectedId: selectedId.value,
    onSelect: selectPlace,
    onSightSelect: (id: string | null) => { selectedSight.value = atlas.sights.find(sight => sight.id === id) ?? null; syncMap(); },
  });
  syncMap();
});
onBeforeUnmount(() => scene?.destroy());
</script>

<template>
  <section class="ca-sandbox" aria-label="加州全境沙盘">
    <header class="ca-heading">
      <div><small>CALIFORNIA</small><h2>加州旅行沙盘</h2><p>旧金山湾区、硅谷与太平洋海岸</p></div>
      <span class="ca-current">当前位置 · {{ places.find(place => place.id === locationId)?.name ?? '加州之外' }}</span>
    </header>
    <div ref="mapRoot" class="ca-map-wrap" aria-label="加州立体地图" />
    <aside class="ca-place-panel">
      <template v-if="selectedSight">
        <small>观景地标</small><h3>{{ selectedSight.name }}</h3><p>{{ selectedSight.desc }}</p>
      </template>
      <template v-else-if="selected">
        <small>{{ selected.id === locationId ? '当前位置' : '旅行地点' }}</small>
        <h3>{{ selected.name }}</h3><p>{{ selected.description }}</p><p class="ca-subtitle">{{ selected.subtitle }}</p>
        <button v-if="routeToSelected && selected.id !== locationId" type="button" class="ca-travel" data-ca-travel :disabled="busy" @click="goTo(selected.id)">前往{{ selected.name }} · {{ routeToSelected.minutes }} 分钟 · ¥{{ routeToSelected.fare.toLocaleString('zh-CN') }}</button>
        <p v-else-if="selected.id === locationId" class="ca-route-note">你已在这里。</p>
        <p v-else class="ca-route-note">此地暂无直达行程，可从下方选择可前往的地点。</p>
      </template>
      <label class="ca-search"><span>查找地点</span><input v-model="search" type="search" aria-label="查找加州地点" placeholder="地点或地标名称" /></label>
      <nav class="ca-place-list" aria-label="加州地点">
        <button v-for="place in shownPlaces" :key="place.id" :data-ca-place="place.id" type="button" :aria-pressed="!selectedSight && selectedId === place.id" @click="selectPlace(place.id)"><span>{{ place.name }}</span><small>{{ place.id === locationId ? '当前位置' : routes.some(route => route.to === place.id) ? '可前往' : '查看' }}</small></button>
        <button v-for="sight in shownSights" :key="sight.id" type="button" :aria-pressed="selectedSight?.id === sight.id" @click="selectedSight = sight; scene?.selectSight(sight.id)"><span>{{ sight.name }}</span><small>观景地标</small></button>
        <p v-if="!shownPlaces.length && !shownSights.length">没有匹配地点。</p>
      </nav>
    </aside>
    <nav class="ca-destination-list" aria-label="可前往地点">
      <button v-for="route in routes" :key="route.to" :data-ca-place="route.to" type="button" :class="{ active: !selectedSight && selectedId === route.to }" @click="selectPlace(route.to)"><b>{{ places.find(place => place.id === route.to)?.name ?? route.to }}</b><small>{{ route.method }} · {{ route.minutes }} 分钟 · ¥{{ route.fare.toLocaleString('zh-CN') }}</small></button>
      <p v-if="!routes.length">暂时没有可前往的路线。</p>
    </nav>
  </section>
</template>
