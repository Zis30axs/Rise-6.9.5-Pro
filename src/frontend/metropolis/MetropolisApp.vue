<script setup lang="ts">
import {computed, ref} from 'vue';
import CityStage from './CityStage.vue';
import type {Layer, Mode, World} from './types';
withDefaults(defineProps<{embedded?:boolean}>(),{embedded:false});
const emit=defineEmits<{journey:[]}>();
const mode=ref<Mode>('golden');const stage=ref<InstanceType<typeof CityStage>>();const selected=ref<string|null>(null);const touring=ref(false);const orbit=ref(false);const traffic=ref(true);const labels=ref(true);const layerMenu=ref(false);const bearing=ref(-.52);const ready=ref(false);const failure=ref('');const notice=ref('');
const world=ref<World|null>(null);const layers=ref<Record<Layer,boolean>>({terrain:true,water:true,buildings:true,roads:true,rail:true,nature:true,details:true});
const modes:{id:Mode;label:string;time:string;desc:string}[]=[{id:'golden',label:'日落金辉',time:'17:40',desc:'日光落在城市的轮廓上。'},{id:'day',label:'晴空日光',time:'12:00',desc:'看见山海与街区的每一处细节。'},{id:'blue',label:'蓝调时刻',time:'18:50',desc:'暮色渐深，城市正要醒来。'},{id:'night',label:'万家灯火',time:'21:30',desc:'循着灯火，走入另一座城市。'}];
const currentMode=computed(()=>modes.find(m=>m.id===mode.value)!);const places=computed(()=>world.value?.landmarks??[]);const place=computed(()=>places.value.find(p=>p.id===selected.value));
const layerChoices:{id:Layer;name:string;en:string}[]=[{id:'buildings',name:'城市建筑',en:'ARCHITECTURE'},{id:'roads',name:'道路与桥梁',en:'ROAD NETWORK'},{id:'rail',name:'高架轻轨',en:'ELEVATED RAIL'},{id:'nature',name:'森林与公园',en:'LANDSCAPE'}];
function onReady(w:World){world.value=w;ready.value=true;}
function onSelect(id:string|null){selected.value=id;}
function selectPlace(id:string){touring.value=false;orbit.value=false;selected.value=id;}
function stop(){touring.value=false;orbit.value=false;}
function beginTour(){orbit.value=false;touring.value=!touring.value;}
function capture(){stage.value?.exportImage();notice.value='城市风景已生成';setTimeout(()=>notice.value='',2800);}
function reset(){stop();stage.value?.reset();}
</script>
<template>
 <main class="metropolis" :class="[`mode-${mode}`,{exploring:!!place,'metropolis--embedded':embedded}]">
  <header class="masthead">
   <a class="brand" href="#" aria-label="未读之城，回到全景" @click.prevent="reset"><span class="brand-mark"><svg viewBox="0 0 34 34" fill="none" aria-hidden="true"><path d="M6 25V11l6-4v18M16 25V5l6 4v16M26 25V15l4-3v13M3 29h28" stroke="currentColor" stroke-width="1.6"/></svg></span><span>UNREAD CITY<small>未读之城 · 城市沙盘</small></span></a>
   <nav class="light-modes" aria-label="城市光照"><button v-for="m in modes" :key="m.id" :class="{active:mode===m.id}" :aria-pressed="mode===m.id" @click="mode=m.id"><i :class="m.id"></i>{{m.label}}</button></nav>
   <button v-if="embedded" class="journey-button" data-metropolis-journey @click="emit('journey')">世界与行程 <span>↗</span></button><div v-else class="live-status"><span class="live-dot"></span><span>城市运行中<small>{{currentMode.time}} <b>LOCAL TIME</b></small></span></div>
  </header>
  <CityStage ref="stage" :mode="mode" :layers="layers" :traffic="traffic" :labels="labels" :selected="selected" :touring="touring" :orbit="orbit" @ready="onReady" @select="onSelect" @interaction="stop" @bearing="bearing=$event" @failure="failure=$event" />
  <aside class="city-intro">
   <div class="eyebrow"><span></span> A CITY BETWEEN MOUNTAINS & SEA</div>
   <h1>山海之间，<br>万象生长。</h1>
   <p class="intro-copy">沿河岸漫步，越过高架与云端。<br>在一座微缩都市里，<br>发现未被读过的风景。</p>
   <div class="city-edition"><span>未读之城</span><span>山海都会 <i>／</i> 02</span></div>
   <div class="intro-rule"></div>
   <div class="city-coordinates"><span>海湾 · 山脊 · 都会</span><small>COASTAL METROPOLIS</small></div>
   <button class="tour-button" :class="{playing:touring}" :disabled="!ready" @click="beginTour"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path v-if="!touring" d="m7 4 9 6-9 6V4Z" fill="currentColor"/><path v-else d="M6 4v12M13 4v12" stroke="currentColor" stroke-width="3"/></svg>{{touring?'暂停城市漫游':'开始城市漫游'}}<span>↗</span></button>
   <div class="tour-caption">{{touring?'镜头正在带你走进每一处风景':`${places.length || 6} 个视角，慢慢看见这座城`}}</div>
   <section v-if="place" class="landmark-card" :style="{'--place-accent':place.accent}">
    <button class="card-close" aria-label="关闭地标介绍并回到全景" @click="selected=null">×</button><div class="landmark-category">{{place.category}}</div><h2>{{place.name}}</h2><p class="landmark-en">{{place.en}}</p><p class="landmark-description">{{place.description}}</p><span class="landmark-caption">城市切片 <i>／</i> {{String(places.indexOf(place)+1).padStart(2,'0')}}</span>
   </section>
   <div v-else class="city-note"><span class="note-line"></span><span>{{currentMode.desc}}<small>拖动沙盘，寻找你的城市视角。</small></span></div>
  </aside>
  <div class="scene-meta"><span class="scene-index">02</span><span>THE LIVING CITY<small>山海都会 · 全新城市地貌</small></span></div>
  <div class="compass" aria-hidden="true"><span>N</span><svg viewBox="0 0 52 52" :style="{transform:`rotate(${-bearing*180/Math.PI}deg)`}"><circle cx="26" cy="26" r="22" fill="none" stroke="currentColor" stroke-opacity=".25"/><path d="M26 8 31 29 26 26 21 29Z" fill="#dcc090"/><path d="m26 44-5-15 5 3 5-3Z" fill="#a8bdc6" fill-opacity=".4"/></svg></div>
  <div class="map-toolbar">
   <button title="放大" aria-label="放大沙盘" @click="stage?.zoom(.84)">+</button><button title="缩小" aria-label="缩小沙盘" @click="stage?.zoom(1.19)">−</button><span></span>
   <button title="回到全景" aria-label="回到全景" @click="reset"><svg viewBox="0 0 20 20" fill="none"><path d="M5 7a6 6 0 1 1-1 5M5 3v4H1" stroke="currentColor" stroke-width="1.4"/></svg></button>
   <button title="缓慢环绕" aria-label="缓慢环绕城市" :aria-pressed="orbit" :class="{active:orbit}" @click="orbit=!orbit;touring=false"><svg viewBox="0 0 20 20" fill="none"><ellipse cx="10" cy="10" rx="8" ry="4" stroke="currentColor" stroke-width="1.3"/><path d="m10 3 3 3-3 3" stroke="currentColor" stroke-width="1.3"/></svg></button>
   <button title="保存城市风景" aria-label="保存城市风景图片" @click="capture"><svg viewBox="0 0 20 20" fill="none"><path d="M3 6h4l1-2h4l1 2h4v10H3V6Z" stroke="currentColor" stroke-width="1.3"/><circle cx="10" cy="11" r="3" stroke="currentColor" stroke-width="1.3"/></svg></button>
  </div>
  <div class="layer-panel" v-if="layerMenu"><div class="layer-heading">城市图层<span>LAYERS</span></div><label v-for="l in layerChoices" :key="l.id"><span>{{l.name}}<small>{{l.en}}</small></span><input type="checkbox" v-model="layers[l.id]"/><i></i></label><label><span>城市交通<small>TRAFFIC IN MOTION</small></span><input type="checkbox" v-model="traffic"/><i></i></label><label><span>地标名称<small>PLACE LABELS</small></span><input type="checkbox" v-model="labels"/><i></i></label></div>
  <footer class="exploration-bar">
   <div class="explore-title"><span>探索这座城</span><small>EXPLORE THE CITY</small></div>
   <nav class="places" aria-label="地标视角"><button v-for="(p,i) in places" :key="p.id" :class="{active:selected===p.id}" @click="selectPlace(p.id)"><small>{{String(i+1).padStart(2,'0')}}</small><span>{{p.name}}</span><i>↗</i></button></nav>
   <button class="layers-button" aria-label="城市图层" :class="{active:layerMenu}" :aria-expanded="layerMenu" @click="layerMenu=!layerMenu"><svg viewBox="0 0 20 20" fill="none"><path d="m10 3 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4M2 15l8 4 8-4" stroke="currentColor" stroke-width="1.2"/></svg><span>图层</span></button>
  </footer>
  <div class="interaction-hint"><span>拖动旋转</span><i>·</i><span>滚轮缩放</span><i>·</i><span>点击地标探索</span></div>
  <div v-if="!ready&&!failure" class="scene-loading"><span></span>城市正在生长…</div>
  <div v-if="failure" class="scene-error">沙盘暂时无法显示，请刷新页面重试。<small>{{failure}}</small></div>
  <div v-if="notice" class="toast" role="status">{{notice}}</div>
 </main>
</template>
