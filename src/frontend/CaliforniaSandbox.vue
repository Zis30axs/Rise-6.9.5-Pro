<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { InternationalLeg } from '../runtime/california';

type Place = { id: string; name: string; subtitle: string; description: string };
const props = defineProps<{
  locationId: string;
  places: readonly Place[];
  routes: readonly InternationalLeg[];
  busy?: boolean;
}>();
const emit = defineEmits<{ travel: [id: string] }>();
const selectedId = ref(props.locationId);
watch(() => props.locationId, id => { selectedId.value = id; });
const selected = computed(() => props.places.find(place => place.id === selectedId.value) ?? props.places[0]);
const routeToSelected = computed(() => props.routes.find(route => route.to === selectedId.value));
const cities = [
  { id: 'sfo-airport', name: '旧金山湾区', x: 170, y: 225, kind: 'hub' },
  { id: 'california-sacramento', name: '萨克拉门托', x: 225, y: 155, kind: 'city' },
  { id: 'california-eureka', name: '尤里卡', x: 112, y: 95, kind: 'city' },
  { id: 'california-redding', name: '雷丁', x: 230, y: 58, kind: 'city' },
  { id: 'california-yosemite', name: '优胜美地', x: 290, y: 245, kind: 'park' },
  { id: 'california-fresno', name: '弗雷斯诺', x: 260, y: 315, kind: 'city' },
  { id: 'california-monterey', name: '蒙特雷', x: 150, y: 300, kind: 'city' },
  { id: 'california-los-angeles', name: '洛杉矶', x: 270, y: 430, kind: 'hub' },
  { id: 'california-death-valley', name: '死亡谷', x: 385, y: 315, kind: 'park' },
  { id: 'california-san-diego', name: '圣迭戈', x: 315, y: 525, kind: 'hub' },
];
function selectPlace(id: string) {
  if (props.places.some(place => place.id === id)) selectedId.value = id;
}
function goTo(id: string) {
  if (!props.busy && props.routes.some(route => route.to === id)) emit('travel', id);
}
</script>

<template>
  <section class="ca-sandbox" aria-label="加州全境沙盘">
    <header class="ca-heading">
      <div><small>CALIFORNIA · WEST COAST</small><h2>加利福尼亚州</h2><p>从北加州红木海岸，到南加州太平洋沿岸</p></div>
      <span class="ca-live">离线地图 · 游戏世界</span>
    </header>
    <div class="ca-map-wrap">
      <svg class="ca-map" viewBox="0 0 500 600" role="group" aria-label="加利福尼亚州示意地图">
        <defs>
          <linearGradient id="caLand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d7c7a1"/><stop offset="1" stop-color="#9f9b79"/></linearGradient>
          <linearGradient id="caCoast" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8d5d5"/><stop offset="1" stop-color="#6e9da5"/></linearGradient>
          <filter id="caShadow" x="-30%" y="-20%" width="170%" height="160%"><feDropShadow dx="8" dy="10" stdDeviation="5" flood-color="#172a32" flood-opacity=".35"/></filter>
        </defs>
        <path d="M0 0H500V600H0Z" fill="url(#caCoast)"/>
        <path d="M122 30 L350 30 L366 80 L390 112 L377 153 L401 195 L385 233 L405 278 L378 319 L363 359 L340 402 L330 449 L313 500 L291 558 L266 548 L248 511 L229 482 L215 447 L194 415 L177 380 L161 346 L149 312 L130 280 L117 243 L105 205 L96 166 L91 128 L105 91Z" fill="url(#caLand)" stroke="#e9dfc7" stroke-width="4" filter="url(#caShadow)"/>
        <path d="M105 91 L122 30 L350 30 L366 80 L390 112 L377 153 L401 195 L385 233 L405 278 L378 319 L363 359 L340 402 L330 449 L313 500 L291 558" fill="none" stroke="#f0e5c9" stroke-width="2" opacity=".7"/>
        <path d="M160 70 Q215 140 170 225 T270 430" fill="none" stroke="#8c8060" stroke-width="2" stroke-dasharray="5 6" opacity=".6"/>
        <path d="M350 60 Q300 140 330 220 T290 360" fill="none" stroke="#8c8060" stroke-width="2" stroke-dasharray="5 6" opacity=".6"/>
        <path d="M180 245 Q240 270 300 245 M200 330 Q270 350 360 330 M230 430 Q280 450 330 430" fill="none" stroke="#a1a18a" stroke-width="1.5" opacity=".7"/>
        <text x="30" y="250" fill="#e7f1ed" font-size="15" letter-spacing="4" transform="rotate(-78 30 250)">PACIFIC OCEAN</text>
        <text x="405" y="190" fill="#625d4c" font-size="10" transform="rotate(78 405 190)">NEVADA</text>
        <text x="305" y="20" fill="#625d4c" font-size="10">OREGON</text>
        <text x="305" y="580" fill="#625d4c" font-size="10">MEXICO</text>
        <g v-for="city in cities" :key="city.id" class="ca-marker" :class="{ active: selectedId === city.id, available: places.some(p => p.id === city.id) }" @click="selectPlace(city.id)" @keydown.enter="selectPlace(city.id)" tabindex="0" role="button" :aria-label="city.name">
          <circle :cx="city.x" :cy="city.y" :r="selectedId === city.id ? 9 : 6" :class="'ca-dot ca-' + city.kind"/>
          <circle v-if="selectedId === city.id" :cx="city.x" :cy="city.y" r="15" class="ca-pulse"/>
          <text :x="city.x + 12" :y="city.y - 10" class="ca-city-label">{{ city.name }}</text>
        </g>
        <g v-if="locationId === 'california-openai' || locationId === 'california-anthropic' || locationId === 'california-market'">
          <path d="M170 225 L225 155 L260 315 L270 430 L315 525" class="ca-route-line"/>
        </g>
      </svg>
      <aside class="ca-map-legend"><span><i class="hub"/> 城市枢纽</span><span><i class="city"/> 城市</span><span><i class="park"/> 国家公园</span></aside>
    </div>
    <aside class="ca-place-panel" v-if="selected">
      <small>SELECTED LOCATION</small><h3>{{ selected.name }}</h3><p>{{ selected.description }}</p>
      <p class="ca-subtitle">{{ selected.subtitle }}</p>
      <button v-if="routeToSelected" type="button" :disabled="busy" @click="goTo(selected.id)">前往这里 · {{ routeToSelected.minutes }} 分钟 · ¥{{ routeToSelected.fare }}</button>
      <p v-else class="ca-unavailable">当前尚无直达行程；可从湾区枢纽继续探索。</p>
    </aside>
    <nav class="ca-destination-list" aria-label="可前往地点">
      <button v-for="route in routes" :key="route.to" type="button" :class="{ active: selectedId === route.to }" :disabled="busy" @click="selectPlace(route.to)">
        <b>{{ places.find(place => place.id === route.to)?.name ?? route.to }}</b><small>{{ route.method }} · {{ route.minutes }} 分钟</small>
      </button>
    </nav>
  </section>
</template>

<style scoped>
.ca-sandbox{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(220px,.8fr);gap:14px;color:#e8e6dc;background:linear-gradient(145deg,#182b32,#243b40 58%,#17262e);border:1px solid #52666a;border-radius:14px;padding:16px;min-height:580px}
.ca-heading{grid-column:1/-1;display:flex;justify-content:space-between;gap:12px;align-items:start}.ca-heading small,.ca-place-panel>small{font-size:10px;letter-spacing:2px;color:#b7c7b5}.ca-heading h2{font-size:22px;margin:5px 0}.ca-heading p,.ca-place-panel p{font-size:12px;color:#c2cec5;margin:4px 0}.ca-live{font-size:10px;border:1px solid #6c8982;border-radius:20px;padding:6px 9px;color:#c4d5c5;white-space:nowrap}
.ca-map-wrap{position:relative;min-width:0;background:radial-gradient(ellipse at 40% 50%,#47737a,#24464e 72%);border-radius:10px;overflow:hidden;min-height:470px}.ca-map{width:100%;height:100%;min-height:470px}.ca-city-label{font-size:11px;fill:#273b36;paint-order:stroke;stroke:#d9d0b8;stroke-width:3px;stroke-linejoin:round;font-weight:700}.ca-marker{cursor:pointer;outline:none}.ca-marker:focus .ca-dot{stroke:#fff;stroke-width:3}.ca-dot{stroke:#f4edda;stroke-width:2}.ca-hub{fill:#a94f43}.ca-city{fill:#596f54}.ca-park{fill:#4b897d}.ca-pulse{fill:none;stroke:#f6d58b;stroke-width:2;opacity:.8}.ca-route-line{fill:none;stroke:#e2b66c;stroke-width:3;stroke-dasharray:6 6;opacity:.9}.ca-map-legend{position:absolute;left:10px;bottom:10px;display:flex;flex-wrap:wrap;gap:9px;background:#142a30d9;padding:7px 9px;border-radius:8px;font-size:10px}.ca-map-legend span{display:flex;align-items:center;gap:5px}.ca-map-legend i{width:8px;height:8px;border-radius:50%;display:inline-block}.ca-map-legend .hub{background:#a94f43}.ca-map-legend .city{background:#596f54}.ca-map-legend .park{background:#4b897d}
.ca-place-panel{background:#263b3d;border:1px solid #536c66;border-radius:10px;padding:14px;align-self:start}.ca-place-panel h3{font-size:18px;margin:7px 0}.ca-place-panel .ca-subtitle{color:#a9c1b3}.ca-place-panel button{margin-top:12px;width:100%;border:1px solid #b49c70;background:#a88c5c;color:#172a2c;border-radius:7px;padding:10px;font-weight:700;cursor:pointer}.ca-place-panel button:disabled{opacity:.45;cursor:not-allowed}.ca-unavailable{margin-top:12px!important;color:#e2c99a!important}
.ca-destination-list{grid-column:1/-1;display:flex;gap:8px;overflow-x:auto;padding-bottom:3px}.ca-destination-list button{min-width:145px;text-align:left;background:#20363a;border:1px solid #536a65;color:#e6e5d9;border-radius:8px;padding:9px;cursor:pointer}.ca-destination-list button.active{border-color:#e1bc79;background:#344b49}.ca-destination-list button:disabled{opacity:.4}.ca-destination-list b,.ca-destination-list small{display:block}.ca-destination-list b{font-size:12px}.ca-destination-list small{font-size:10px;color:#b9c7bc;margin-top:4px}
@media(max-width:720px){.ca-sandbox{grid-template-columns:1fr}.ca-map-wrap{min-height:400px}.ca-map{min-height:400px}.ca-heading{flex-direction:column}.ca-destination-list{grid-column:1}}
</style>
