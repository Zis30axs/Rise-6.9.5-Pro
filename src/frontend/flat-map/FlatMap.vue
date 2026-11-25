<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { clamp, glyph, labels, pinColor, positionOf, regions, sheets, solveRoutePath, type Pin, type Region } from './maps';
import { mapTrip, submitMapTrip } from '../map-travel';
import type { ShellActions, ShellModel } from '../types';
import MapLayers from './MapLayers.vue';
import { worldMapRadarPeople } from '../../runtime/world-presence';
import { scenePersonLabel } from '../../runtime/scene-context';
import { formatGameNumber } from '../format-game-number';
import { getNovelBackground } from '../novel-backgrounds';

const props = defineProps<{ model: ShellModel; actions: ShellActions; novelMode?: boolean; tokyoOnly?: boolean }>();
const emit = defineEmits<{ travelled: [] }>();

const here = computed(() => props.model.state.interior?.roomId || props.model.state.locationId);
const actual = computed(() => positionOf(here.value) || positionOf(props.model.state.locationId));
const choices = computed(() => props.tokyoOnly ? (['tokyo'] as Region[]) : regions);
const region = ref<Region>(props.tokyoOnly ? 'tokyo' : actual.value?.region || 'tokyo');
const sheet = computed(() => sheets[region.value]);
const selected = ref(''), query = ref(''), group = ref(''), cat = ref(''), directory = ref(false), sending = ref(false);
const theme = ref<'dark' | 'day'>('dark');
const regionOpen = ref(false), catOpen = ref(false);
const openMacro = ref<Record<string, boolean>>({ asia: true, europe: true, america: false, global: false });
const openGroupFold = ref<Record<string, boolean>>({});
const macroGroups = [
  { id: 'asia', label: '东亚沙盘', items: ['tokyo', 'beijing'] as Region[] },
  { id: 'europe', label: '欧洲沙盘', items: ['london', 'moscow', 'paris', 'cdg'] as Region[] },
  { id: 'america', label: '北美沙盘', items: ['california'] as Region[] },
  { id: 'global', label: '全球总览', items: ['world'] as Region[] },
];
const showBuildings = ref(true), showRoads = ref(true);

const stage = ref<HTMLElement>(), svg = ref<SVGSVGElement>(), size = ref({ w: 680, h: 440 });
const center = ref({ x: 0, y: 0 }), zoom = ref(1);
const scale = computed(() => {
  const [a, b, c, d] = sheet.value.bounds;
  return Math.min((size.value.w - 38) / (c - a), (size.value.h - 44) / (d - b)) * zoom.value;
});
const matrix = computed(() => `translate(${size.value.w / 2} ${size.value.h / 2}) scale(${scale.value}) translate(${-center.value.x} ${-center.value.y})`);

const chosen = computed(() => sheet.value.pins.find(p => p.id === selected.value));
const chosenBg = computed(() => chosen.value && region.value !== 'world' ? getNovelBackground(chosen.value.id, props.model.state.clock.hour) : undefined);
const quote = computed(() => chosen.value?.kind === 'place' ? mapTrip(props.model, chosen.value.id, !!props.novelMode) : undefined);
const groups = computed(() => [...new Set(sheet.value.pins.map(p => p.group).filter(Boolean))]);
const normalize = (s: string) => s.toLowerCase().replace(/[\s·／\u30fb-]/g, '');

const available = computed(() => sheet.value.pins.filter(p =>
  (!group.value || p.group === group.value) &&
  (!cat.value || p.cat === cat.value) &&
  (!query.value || normalize(p.name + p.id + p.group + (p.sub || '')).includes(normalize(query.value)))
));

const dots = computed(() => {
  const { w, h } = size.value, c = center.value, s = scale.value, seen = new Set<string>(), out = [];
  const pins = available.value.slice().sort((a, b) =>
    Number(b.id === selected.value) * 4 + Number(b.id === here.value) * 2 -
    (Number(a.id === selected.value) * 4 + Number(a.id === here.value) * 2)
  );
  for (const pin of pins) {
    const x = (pin.x - c.x) * s + w / 2, y = (pin.y - c.y) * s + h / 2, key = pin.x + ',' + pin.y;
    if (x < 4 || y < 4 || x > w - 4 || y > h - 4 || seen.has(key)) continue;
    seen.add(key);
    out.push({ pin, x, y, color: pinColor(pin) });
  }
  return out;
});

const captions = computed(() => labels(dots.value, size.value.w, size.value.h, selected.value, here.value, zoom.value));
const captionedIds = computed(() => new Set(captions.value.map(c => c.pin.id)));

const screenRoads = computed(() => {
  if (!showRoads.value || !sheet.value.roads) return [];
  const { w, h } = size.value, c = center.value, s = scale.value, out = [];
  for (const r of sheet.value.roads) {
    if (zoom.value < (r.minZoom || 1)) continue;
    const pts = r.pts.map(([px, py]) => [(px - c.x) * s + w / 2, (py - c.y) * s + h / 2]);
    let bi = -1, bl = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      if (mx < 28 || my < 24 || mx > w - 28 || my > h - 28) continue;
      const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (l > bl) { bl = l; bi = i; }
    }
    if (bi < 0 || bl < r.name.length * 10) continue;
    const a = pts[bi], b = pts[bi + 1];
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    if (ang > 90 || ang < -90) ang += 180;
    out.push({ name: r.name, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, ang, tier: r.tier });
  }
  return out.slice(0, 18);
});

const screenShields = computed(() => {
  if (!showRoads.value || !sheet.value.shields) return [];
  const { w, h } = size.value, c = center.value, s = scale.value;
  return sheet.value.shields.map(sh => ({
    ...sh,
    sx: (sh.x - c.x) * s + w / 2,
    sy: (sh.y - c.y) * s + h / 2,
    bw: sh.code.length * 8 + 12,
  })).filter(sh => sh.sx > 24 && sh.sy > 20 && sh.sx < w - 24 && sh.sy < h - 24);
});

const routeSvgPath = computed(() => {
  if (!chosen.value || chosen.value.id === here.value || actual.value?.region !== region.value) return '';
  const pts = solveRoutePath(region.value, actual.value.pin.id, chosen.value.id);
  if (pts.length < 2) return '';
  return 'M' + pts.map(([x, y]) => `${(x - center.value.x) * scale.value + size.value.w / 2},${(y - center.value.y) * scale.value + size.value.h / 2}`).join(' L');
});

const peopleOpen = ref(false);
const nearby = computed(() => peopleOpen.value && chosen.value
  ? worldMapRadarPeople(props.model.state)
      .filter(r => r.locationId === chosen.value!.id || (r.atCurrentPlace && chosen.value!.id === here.value))
      .map(r => ({ id: r.person.id, name: scenePersonLabel(r.person), near: r.canTalk }))
  : []);
watch(selected, () => peopleOpen.value = false);

const siblings = computed(() => chosen.value ? sheet.value.pins.filter(p => p.x === chosen.value!.x && p.y === chosen.value!.y && p.id !== chosen.value!.id) : []);

function bounded(x: number, y: number) {
  const [a, b, c, d] = sheet.value.bounds;
  center.value = { x: clamp(x, a, c), y: clamp(y, b, d) };
}
function reset() {
  const [a, b, c, d] = sheet.value.bounds;
  zoom.value = region.value === 'tokyo' ? 1.4 : 1;
  bounded((a + c) / 2, (b + d) / 2);
}
function setRegion(r: Region) {
  if (!choices.value.includes(r)) return;
  region.value = r; regionOpen.value = false; group.value = ''; cat.value = ''; query.value = ''; selected.value = ''; directory.value = false; reset();
}
function focus(pin: Pin) {
  selected.value = pin.id; bounded(pin.x, pin.y);
  zoom.value = Math.max(zoom.value, region.value === 'world' ? 1.1 : region.value === 'tokyo' ? 3.2 : 2.1);
  directory.value = false; query.value = '';
}
function locate() {
  const p = actual.value;
  if (!p || !choices.value.includes(p.region)) return;
  setRegion(p.region); focus(p.pin);
}
function filterGroup(name: string) {
  group.value = name; selected.value = ''; query.value = ''; reset();
  const ps = available.value;
  if (!name || !ps.length) return;
  const x = ps.map(p => p.x), y = ps.map(p => p.y), a = Math.min(...x), b = Math.min(...y), c = Math.max(...x), d = Math.max(...y);
  bounded((a + c) / 2, (b + d) / 2);
  zoom.value = clamp(Math.min((size.value.w - 60) / (c - a || 1), (size.value.h - 60) / (d - b || 1)) / scale.value, 1, 15);
}
function changeZoom(f: number, px = size.value.w / 2, py = size.value.h / 2) {
  const s = scale.value, old = center.value;
  zoom.value = clamp(zoom.value * f, 0.8, 36);
  bounded(old.x + (px - size.value.w / 2) * (1 / s - 1 / scale.value), old.y + (py - size.value.h / 2) * (1 / s - 1 / scale.value));
}
function choose(p: Pin) {
  if (p.kind === 'region') { setRegion(p.id as Region); return; }
  focus(p);
}
async function depart() {
  const p = chosen.value;
  if (!p || p.kind !== 'place' || sending.value || props.model.busy || quote.value?.blocked) return;
  sending.value = true;
  try { if (await submitMapTrip(props.model, props.actions, p.id, !!props.novelMode)) emit('travelled'); }
  finally { sending.value = false; }
}

const fingers = new Map<number, { x: number; y: number }>();
let moved = false, from = { x: 0, y: 0 }, pressed = '';
function coords(e: MouseEvent) {
  const r = svg.value!.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function down(e: PointerEvent) {
  if (e.button !== 0) return;
  const p = coords(e);
  if (!fingers.size) { from = p; moved = false; pressed = (e.target as Element).closest('[data-pin]')?.getAttribute('data-pin') || ''; }
  else moved = true;
  fingers.set(e.pointerId, p); svg.value?.setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  const prev = fingers.get(e.pointerId);
  if (!prev) return;
  const p = coords(e), other = [...fingers].find(([id]) => id !== e.pointerId)?.[1];
  fingers.set(e.pointerId, p);
  if (Math.hypot(p.x - from.x, p.y - from.y) > 4) moved = true;
  if (!moved) return;
  if (other) {
    const a = Math.hypot(prev.x - other.x, prev.y - other.y), b = Math.hypot(p.x - other.x, p.y - other.y);
    if (a > 4 && b > 4) changeZoom(b / a, (prev.x + other.x) / 2, (prev.y + other.y) / 2);
  }
  const factor = other ? 2 : 1;
  bounded(center.value.x - (p.x - prev.x) / scale.value / factor, center.value.y - (p.y - prev.y) / scale.value / factor);
}
function up(e: PointerEvent) {
  if (!fingers.delete(e.pointerId)) return;
  if (e.type === 'pointerup' && !moved && !fingers.size && pressed) {
    const p = sheet.value.pins.find(x => x.id === pressed);
    if (p) choose(p);
  }
}
function wheel(e: WheelEvent) {
  const p = coords(e);
  changeZoom(Math.exp(-clamp(e.deltaY, -180, 180) * 0.003), p.x, p.y);
}

let observer: ResizeObserver | undefined;
reset();
if (actual.value?.region === region.value) focus(actual.value.pin);
onMounted(() => {
  const el = stage.value!;
  const measure = () => {
    const r = el.getBoundingClientRect();
    if (r.width > 50 && r.height > 50) size.value = { w: r.width, h: r.height };
  };
  measure();
  const R = el.ownerDocument.defaultView?.ResizeObserver;
  if (R) { observer = new R(measure); observer.observe(el); }
});
onBeforeUnmount(() => { observer?.disconnect(); fingers.clear(); });
watch(here, locate);

const catChips = [
  { id: '', label: '全部' },
  { id: 'shopping', label: '商业' },
  { id: 'food', label: '餐饮' },
  { id: 'culture', label: '演艺文化' },
  { id: 'school', label: '文教' },
  { id: 'home', label: '住宅' },
  { id: 'park', label: '公园' },
  { id: 'transit', label: '交通' },
];
</script>
<template>
  <section class="fm" :data-flat-region="region" :data-fm-theme="theme" aria-label="平面地图">
    <div class="fm-head">
      <div class="fm-title-row">
        <div>
          <small>未读之城 · 2D 导航地图</small>
          <h2>{{ sheet.name }}<em>2D 地图</em></h2>
        </div>
        <div class="fm-head-controls">
          <div v-if="!tokyoOnly" class="fm-region-fold">
            <button type="button" class="fm-fold-trigger" :aria-expanded="regionOpen" @click="regionOpen = !regionOpen">
              <span>🌏 {{ sheet.name }}</span>
              <small>{{ sheet.pins.length }}处</small>
              <i>{{ regionOpen ? '▴' : '▾' }}</i>
            </button>
            <!-- Keep native select synchronized for accessibility & automated test suites -->
            <label class="fm-region fm-sr-only">切换地区
              <select aria-label="切换地区" :value="region" @change="setRegion(($event.target as HTMLSelectElement).value as Region)">
                <option v-for="r in choices" :key="r" :value="r">{{ sheets[r].name }}</option>
              </select>
            </label>
            <div v-if="regionOpen" class="fm-region-drawer">
              <div v-for="mg in macroGroups" :key="mg.id" class="fm-macro-group">
                <button type="button" class="fm-macro-head" @click="openMacro[mg.id] = !openMacro[mg.id]">
                  <span>{{ mg.label }}</span><i>{{ openMacro[mg.id] ? '▾' : '▸' }}</i>
                </button>
                <div v-if="openMacro[mg.id]" class="fm-macro-body">
                  <button v-for="r in mg.items.filter(x => choices.includes(x))" :key="r" type="button"
                          :class="['fm-region-opt', { active: region === r }]" @click="setRegion(r)">
                    <span>{{ sheets[r].name }}</span><small>{{ sheets[r].pins.length }} 处</small>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <button type="button" class="fm-cat-toggle" :aria-expanded="catOpen" @click="catOpen = !catOpen">
            筛选{{ cat ? ' · 已选' : '' }} {{ catOpen ? '▴' : '▾' }}
          </button>
        </div>
      </div>
      <div v-if="catOpen" class="fm-cats" role="group" aria-label="分类筛选">
        <button v-for="c in catChips" :key="c.id" type="button" :class="['fm-cat', { active: cat === c.id }]" @click="cat = cat === c.id ? '' : c.id">{{ c.label }}</button>
      </div>
    </div>

    <div class="fm-body">
      <div ref="stage" class="fm-stage" :class="{ ocean: region === 'world' || region === 'california', day: theme === 'day' }">
        <svg ref="svg" class="fm-svg" :viewBox="'0 0 ' + size.w + ' ' + size.h" role="img" :aria-label="sheet.name + '地点图'"
             @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up" @wheel.prevent="wheel">
          <MapLayers :sheet="sheet" :theme="theme" :show-buildings="showBuildings" :transform="matrix"/>

          <!-- Active Route Polyline -->
          <g v-if="routeSvgPath" fill="none" stroke-linecap="round" stroke-linejoin="round" pointer-events="none">
            <path :d="routeSvgPath" stroke="rgba(59,130,246,0.34)" stroke-width="9"/>
            <path :d="routeSvgPath" stroke="#3b82f6" stroke-width="4" stroke-dasharray="6 5"/>
          </g>

          <!-- Angled Street Labels -->
          <g v-for="(rd, idx) in screenRoads" :key="'rd-' + idx" pointer-events="none"
             :transform="`translate(${rd.x} ${rd.y}) rotate(${rd.ang})`">
            <text text-anchor="middle" dominant-baseline="central" :class="['fm-road-label', rd.tier]">{{ rd.name }}</text>
          </g>

          <!-- Highway Shields -->
          <g v-for="(sh, idx) in screenShields" :key="'sh-' + idx" pointer-events="none" :transform="`translate(${sh.sx} ${sh.sy})`">
            <rect :x="-sh.bw / 2" y="-8" :width="sh.bw" height="16" rx="4" class="fm-shield-bg"/>
            <text y="0.5" text-anchor="middle" dominant-baseline="central" class="fm-shield-txt">{{ sh.code }}</text>
          </g>

          <!-- POI Category Badges & Secondary Golden Dots -->
          <g v-for="p in dots" :key="p.pin.id" :data-pin="p.pin.id" :transform="'translate(' + p.x + ' ' + p.y + ')'"
             :class="['fm-mark', { 'is-here': p.pin.id === here, 'is-chosen': p.pin.id === selected, 'is-sight': p.pin.kind === 'sight' }]">
            <circle r="13" fill="transparent"/>
            <template v-if="p.pin.id === here">
              <circle r="12" fill="rgba(66,133,244,0.25)"/>
              <circle r="6.8" fill="#4285f4" stroke="#ffffff" stroke-width="2.2"/>
            </template>
            <template v-else-if="captionedIds.has(p.pin.id) || p.pin.id === selected">
              <circle class="fm-ring" :style="{ fill: p.color }" :r="p.pin.id === selected ? 10.5 : 8.5"/>
              <text y="0.5" text-anchor="middle" dominant-baseline="central" class="fm-glyph">{{ glyph(p.pin) }}</text>
            </template>
            <circle v-else r="3.3" class="fm-dot"/>
          </g>

          <g v-for="p in captions" :key="'cap-' + p.pin.id" :data-pin="p.pin.id">
            <text :x="p.tx" :y="p.y + 4" :text-anchor="p.anchor" :class="['fm-label', p.pin.cat || '', { 'is-here': p.pin.id === here }]">{{ p.pin.name }}</text>
          </g>
        </svg>

        <!-- Compass Dial -->
        <button type="button" class="fm-north" title="复位全图与正北" @click="filterGroup(''); reset()">
          <span class="fm-north-ptr">▲</span><b>北</b>
        </button>

        <!-- Floating Right Pill (Layers + Theme + Zoom + Locate) -->
        <div class="fm-zoom">
          <button type="button" aria-label="切换日夜主题" :title="theme === 'dark' ? '切换日间地图' : '切换深色导航地图'" @click="theme = theme === 'dark' ? 'day' : 'dark'">{{ theme === 'dark' ? '☀' : '☾' }}</button>
          <button type="button" aria-label="开关建筑轮廓" title="显示/隐藏建筑轮廓" @click="showBuildings = !showBuildings">▤</button>
          <button type="button" aria-label="放大地图" @click="changeZoom(1.5)">＋</button>
          <button type="button" aria-label="缩小地图" @click="changeZoom(1 / 1.5)">−</button>
          <button type="button" aria-label="全图" title="全图" @click="filterGroup(''); reset()">⛶</button>
        </div>
        <button type="button" class="fm-locate" :disabled="!actual" @click="locate">⊿ 我的位置</button>
      </div>

      <aside class="fm-side">
        <div class="fm-tools">
          <label><span aria-hidden="true">⌕</span><input v-model="query" type="search" aria-label="搜索当前地图地点" placeholder="搜索地点或地址" @input="directory = true"></label>
          <button type="button" :aria-expanded="directory" @click="directory = !directory">目录</button>
        </div>

        <div v-if="directory" class="fm-directory">
          <div class="fm-results">
            <template v-if="query">
              <button v-for="p in available" :key="p.id" type="button" :data-place="p.id" @click="choose(p)">
                <i :style="{ background: pinColor(p) }">{{ glyph(p) }}</i>
                <span>{{ p.name }}<small>{{ [p.group, p.sub].filter(Boolean).join(' · ') }}</small></span>
                <b>›</b>
              </button>
            </template>
            <template v-else>
              <div v-for="(g, gi) in (groups.length ? groups : ['全部地点'])" :key="g" class="fm-dir-group">
                <button type="button" class="fm-dir-head" @click="openGroupFold[g] = !(openGroupFold[g] ?? gi < 2)">
                  <span>{{ g }}（{{ available.filter(x => !x.group || x.group === g).length }}）</span>
                  <b>{{ (openGroupFold[g] ?? gi < 2) ? '▾' : '▸' }}</b>
                </button>
                <div v-show="openGroupFold[g] ?? gi < 2">
                  <button v-for="p in available.filter(x => !x.group || x.group === g)" :key="p.id" type="button" :data-place="p.id" @click="choose(p)">
                    <i :style="{ background: pinColor(p) }">{{ glyph(p) }}</i>
                    <span>{{ p.name }}<small>{{ p.sub || p.group }}</small></span>
                    <b>›</b>
                  </button>
                </div>
              </div>
            </template>
            <p v-if="!available.length">没有找到这个地点。</p>
          </div>
        </div>

        <div v-else-if="chosen" class="fm-detail">
          <div v-if="chosenBg" class="fm-bg-preview" :data-phase="chosenBg.phase"><img :src="chosenBg.src" :alt="chosen.name + '场景背景'"></div>
          <small>{{ [chosen.group, chosen.sub || (chosen.kind === 'sight' ? '观景点' : '地点')].filter(Boolean).join(' · ') }}</small>
          <h3>{{ chosen.name }}</h3>
          <p v-if="chosen.desc" class="fm-desc">{{ chosen.desc }}</p>
          <div v-if="siblings.length" class="fm-siblings">
            <span>同址</span>
            <button type="button" v-for="p in siblings" :key="p.id" @click="choose(p)">{{ p.name }}</button>
          </div>
          <template v-if="quote">
            <p class="fm-quote" role="status">{{ quote.blocked || ('约 ' + quote.minutes + ' 分钟　·　精力 −' + formatGameNumber(quote.energy) + (quote.fare ? '　·　¥' + quote.fare : '')) }}</p>
            <button class="fm-go" type="button" :disabled="!!quote.blocked || model.busy || sending" @click="depart">前往此地 <span>→</span></button>
            <button v-if="chosen.id === here" class="fm-people" type="button" :aria-expanded="peopleOpen" @click="peopleOpen = !peopleOpen">此处人物</button>
            <div v-if="peopleOpen">
              <p v-for="p in nearby" :key="p.id">{{ p.name }} · {{ p.near ? '近处' : '远处' }}</p>
              <p v-if="!nearby.length">此刻没有看到其他人。</p>
            </div>
          </template>
          <p v-else>观景地标 · 仅供浏览</p>
        </div>

        <div v-else class="fm-detail">
          <small>{{ region === 'world' ? '世界图集' : '地点导航' }}</small>
          <h3>{{ region === 'world' ? '选择一座沙盘城市' : '探索' + sheet.name }}</h3>
          <p>点选地图上的彩色地标、建筑区块，或在上方搜索框查找地点与路线。</p>
        </div>
      </aside>
    </div>
  </section>
</template>
