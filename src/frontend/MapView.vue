<script setup lang="ts">
import {defineAsyncComponent,inject,watch} from 'vue';
import FlatMap from './flat-map/FlatMap.vue';
import {mapMode,setMapMode} from './flat-map/preference';
import {sandboxCacheKey} from './sandbox-cache';
import type { ShellModel,ShellActions } from './types';
import style from './flat-map/map.css?inline';
const props=defineProps<{model:ShellModel;actions:ShellActions;novelMode?:boolean;tokyoOnly?:boolean;refreshToken?:number}>();
const emit=defineEmits<{travelled:[]}>();
const WorldMap=defineAsyncComponent(()=>import('./WorldMap.vue').then(m=>m.default));
const cache=inject(sandboxCacheKey,undefined);
// The old component parks its scene during unmount. Clear it after Vue swaps branches.
watch(mapMode,v=>{if(v==='2d')cache?.clear()},{flush:'post'});
</script>
<template>
 <section class="uc-map-view" :data-map-view="mapMode">
 <component :is="'style'">{{style}}</component>
 <header class="fm-toolbar"><span><i/> 城市地图</span><nav aria-label="地图显示方式"><button type="button" :aria-pressed="mapMode==='2d'" @click="setMapMode('2d')">2D 平面</button><button type="button" :aria-pressed="mapMode==='3d'" @click="setMapMode('3d')">3D 沙盘</button></nav></header>
 <FlatMap v-if="mapMode==='2d'" v-bind="props" @travelled="emit('travelled')"/>
 <WorldMap v-else v-bind="props" @travelled="emit('travelled')"/>
 </section>
</template>
