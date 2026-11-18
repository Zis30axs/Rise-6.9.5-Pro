<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import exhibitCss from './paris-sandbox/exhibit.css?inline';
import city from '../../assets/paris-sandbox/places.json';
import airportPlaces from '../../assets/paris-sandbox/airport.json';
import airportOverview from '../../assets/paris-sandbox/stills/cdg.webp?inline';
import terminal from '../../assets/paris-sandbox/stills/cdg-airport.webp?inline';
import station from '../../assets/paris-sandbox/stills/paris-roissypole.webp?inline';
import { isParisAirport, isParisLocation, parisPlaces } from '../runtime/paris';
import type { InternationalLeg } from '../runtime/california';
import { createParisScene, type ParisArea, type Pin } from './paris-sandbox/scene';
import overview from '../../assets/paris-sandbox/stills/paris.webp?inline';
import eiffel from '../../assets/paris-sandbox/stills/eiffel.webp?inline';
import arc from '../../assets/paris-sandbox/stills/arc.webp?inline';
import louvre from '../../assets/paris-sandbox/stills/louvre.webp?inline';
import cathedral from '../../assets/paris-sandbox/stills/notre-dame.webp?inline';
import invalides from '../../assets/paris-sandbox/stills/invalides.webp?inline';
import bridge from '../../assets/paris-sandbox/stills/alexandre.webp?inline';

const props=withDefaults(defineProps<{
  open?: boolean; standalone?: boolean; locationId?: string; busy?: boolean;
  routes?: readonly InternationalLeg[]; localTime?: string;
  quote?: (id: string) => { blockedReason: string | null } | undefined;
}>(),{open:true,standalone:false,locationId:'',routes:()=>[]});
const emit=defineEmits<{back: []; travel:[id:string]}>();
const area=ref<ParisArea>(isParisAirport(props.locationId) ? 'airport' : 'city');
const places=computed(()=>area.value==='airport' ? airportPlaces : city);
const stills:Record<string,string>={eiffel,arc,louvre,'notre-dame':cathedral,invalides,alexandre:bridge,'cdg-airport':terminal,'paris-roissypole':station};
const nameOf=(id:string)=>id==='haneda-airport' ? '东京羽田国际机场' : parisPlaces.find(p=>p.id===id)?.name ?? id;
const departures=computed(()=>props.routes.map(leg=>({ ...leg, reason:props.quote?.(leg.to)?.blockedReason })));
function currentPin() {
  if (isParisAirport(props.locationId)) return props.locationId;
  return isParisLocation(props.locationId) ? props.locationId.slice('paris-'.length) : '';
}
const dialog=ref<HTMLDialogElement>();
const canvas=ref<HTMLCanvasElement>();
const canvasKey=ref(0);
const selected=ref(currentPin()), mode=ref<'loading'|'live'|'still'>('loading'), marks=ref(false), spinning=ref(false);
const pins=ref<Pin[]>([]), bearing=ref(.34);
const place=computed(()=>places.value.find(p=>p.id===selected.value));
const poster=computed(()=>stills[selected.value]||(area.value==='airport'?airportOverview:overview));
const num=(id:string)=>String(places.value.findIndex(p=>p.id===id)+1).padStart(2,'0');
let scene: ReturnType<typeof createParisScene>|undefined;
let generation=0, unmounted=false;
const visible=()=>props.open && !document.hidden && !unmounted;

function choose(id:string) {
  selected.value=id;spinning.value=false;
  scene?.setSpinning(false);scene?.focus(id);
}
function switchArea(next:ParisArea, pin='') {
  if (next === area.value) { choose(pin); return; }
  release();area.value=next;selected.value=pin;void acquire();
}
watch(()=>props.locationId,id=>{
  if (isParisLocation(id)) switchArea(isParisAirport(id)?'airport':'city',currentPin());
});
function spin() {
  spinning.value=!spinning.value;scene?.setSpinning(spinning.value);
}
function release() {
  generation++;scene?.dispose();scene=undefined;
  spinning.value=false;mode.value='loading';pins.value=[];canvasKey.value++;
}
async function acquire() {
  if (!visible() || scene || mode.value==='still') return;
  const token=++generation;
  await nextTick();
  if (!canvas.value || !visible() || token!==generation) return;
  try {
    const live=createParisScene(canvas.value, area.value, state=>{pins.value=state.pins;bearing.value=state.bearing;},
      ()=>{release();mode.value='still';},()=>{spinning.value=false;});
    scene=live;await live.load();
    if (token!==generation || unmounted) return;
    live.focus(selected.value,false);live.setPaused(!visible());mode.value='live';
  } catch {
    if (token!==generation) return;
    release();mode.value='still';
  }
}
function retry() {release();void acquire();}
function key(e:KeyboardEvent) {
  if(mode.value!=='live') return;
  if(e.key==='ArrowLeft')scene?.turn(-.16);
  else if(e.key==='ArrowRight')scene?.turn(.16);
  else if(e.key==='+' || e.key==='=')scene?.zoom(1.25);
  else if(e.key==='-')scene?.zoom(.8);
  else if(e.key==='Home')choose('');
  else return;
  e.preventDefault();
}
function sync() {
  if (!props.standalone && dialog.value) {
    if (props.open && !dialog.value.open) dialog.value.showModal();
    else if (!props.open && dialog.value.open) dialog.value.close();
  }
  if (visible()) {scene?.setPaused(false);void acquire();}
  else {spinning.value=false;scene?.setSpinning(false);scene?.setPaused(true);}
}
function visibility() {if(document.hidden) release();else sync();}
function close() {emit('back');}
onMounted(()=>{document.addEventListener('visibilitychange',visibility);sync();});
watch(()=>props.open,sync,{flush:'post'});
onBeforeUnmount(()=>{unmounted=true;document.removeEventListener('visibilitychange',visibility);release();});
</script>

<template>
  <component :is="standalone ? 'main' : 'dialog'" ref="dialog" class="paris-exhibit" :class="{'pa-standalone': standalone}" aria-label="巴黎城市沙盘" @cancel.prevent="close">
    <component :is="'style'">{{ exhibitCss }}</component>
    <div class="pa-shell">
      <header class="pa-header">
        <div class="pa-brand">
          <svg width="25" height="27" viewBox="0 0 26 28" fill="none" aria-hidden="true"><path d="M2 18 13 12l11 6-11 6-11-6Zm0-5 11-6 11 6M2 8l11-6 11 6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
          <span>未读之城</span><i></i><span class="pa-subbrand">城市沙盘</span>
        </div>
        <button v-if="!standalone" class="pa-back" @click="close">← 返回世界地图</button>
        <span v-else class="pa-region" lang="fr">FRANCE <b> / </b> ÎLE-DE-FRANCE</span>
      </header>
      <nav class="pa-areas" aria-label="巴黎沙盘区域">
        <button type="button" :aria-pressed="area==='city'" @click="switchArea('city')">塞纳河市区</button>
        <button type="button" :aria-pressed="area==='airport'" @click="switchArea('airport')">戴高乐机场 · CDG</button>
        <span v-if="localTime">巴黎当地 {{ localTime }}</span>
      </nav>
      <div class="pa-layout">
        <section class="pa-stage" aria-label="巴黎模型">
          <div class="pa-paper"></div>
          <canvas :key="canvasKey" ref="canvas" v-show="mode==='live'" tabindex="0" aria-label="巴黎三维模型。左右方向键旋转，加减键缩放，Home 键复位。" @keydown="key"></canvas>
          <img v-if="mode!=='live'" class="pa-poster" :src="poster" :alt="(place?.name ?? '全景')+'的模型渲染图'">
          <div class="pa-city"><span class="pa-country">法 国</span><div><h1 lang="fr">{{ area==='airport' ? 'Roissy' : 'Paris' }}</h1><span class="pa-zh">{{ area==='airport' ? '戴高乐机场' : '巴黎' }}</span></div></div>
          <div v-if="mode==='live'" class="pa-compass" aria-label="北向"><span>N</span><svg viewBox="0 0 44 44" :style="{transform:'rotate('+bearing+'rad)'}" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" stroke-width=".65" opacity=".35"/><path d="m22 5-4.1 17L22 20l4.1 2Z" fill="currentColor"/><path d="m22 39-4.1-17L22 24l4.1-2Z" fill="none" stroke="currentColor" stroke-width=".85"/></svg></div>
          <div v-if="marks && mode==='live'" class="pa-pins">
            <button v-for="pin in pins" :key="pin.id" :class="{chosen:selected===pin.id}" :style="{left:pin.x+'%',top:pin.y+'%'}" :aria-label="places.find(p=>p.id===pin.id)?.name" @click="choose(pin.id)">{{ num(pin.id) }}</button>
          </div>
          <div class="pa-tools" v-if="mode==='live'">
            <button aria-label="缩小" title="缩小" @click="scene?.zoom(.8)">−</button><button aria-label="放大" title="放大" @click="scene?.zoom(1.25)">＋</button>
            <i></i><button :aria-pressed="marks" @click="marks=!marks">标记</button><button :aria-pressed="spinning" @click="spin">环绕</button>
            <i></i><button @click="choose('')">全景</button>
          </div>
          <div v-else-if="mode==='still'" class="pa-tools"><span>模型图</span><button @click="retry">重试三维</button><button @click="choose('')">全景</button></div>
        </section>
        <aside class="pa-aside">
          <div class="pa-index-heading"><h2>{{ area==='airport' ? '机场索引' : '地标索引' }}</h2><span lang="fr">Répertoire</span></div>
          <div class="pa-list" aria-label="选择地标">
            <button v-for="(p,i) in places" :key="p.id" :aria-pressed="selected===p.id" @click="choose(p.id)">
              <span class="pa-no">{{ String(i+1).padStart(2,'0') }}</span><span class="pa-placename"><strong>{{ p.name }}</strong><em lang="fr">{{ p.fr }}</em></span><span class="pa-arrow" aria-hidden="true">↗</span>
            </button>
          </div>
          <div class="pa-note" aria-live="polite"><div class="pa-note-title"><i></i><h3>{{ place?.area ?? (area==='airport' ? '巴黎戴高乐机场' : '塞纳河两岸') }}</h3></div><p>{{ place?.description ?? (area==='airport' ? '环形一号航站楼与 Roissypôle 换乘站之间由 CDGVAL 相连。' : '从铁塔脚下的战神广场，沿河向东，经过卢浮宫的庭院，一直走到西岱岛。') }}</p></div>
          <section v-if="departures.length" class="pa-departures" aria-label="从当前地点出发">
            <h3>从{{ nameOf(locationId) }}出发</h3>
            <button v-for="leg in departures" :key="leg.to" type="button" :disabled="busy || !!leg.reason" :data-paris-to="leg.to" @click="emit('travel',leg.to)">
              <strong>前往{{ nameOf(leg.to) }}</strong>
              <small>{{ leg.method }} · {{ leg.minutes }}分钟 · {{ leg.fare ? '¥'+leg.fare : '免费' }}</small>
              <small v-if="leg.reason">{{ leg.reason }}</small>
            </button>
          </section>
        </aside>
      </div>
      <footer class="pa-footer"><span><i></i> {{ mode==='live' ? '拖动旋转 · 滚轮或双指缩放' : mode==='loading' ? '正在展开沙盘…' : '选择地标可查看特写' }}</span><span>微缩城市模型 <b> / </b> 展示比例</span></footer>
    </div>
  </component>
</template>
