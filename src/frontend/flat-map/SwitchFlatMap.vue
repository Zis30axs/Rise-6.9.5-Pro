<script setup lang="ts">
import {computed} from 'vue';
import {positionOf,sheets} from './maps';
import MapLayers from './MapLayers.vue';
const props=defineProps<{locationId:string;roomId?:string}>();
const pos=computed(()=>positionOf(props.roomId||'')||positionOf(props.locationId));
const sheet=computed(()=>sheets[pos.value?.region||'world']);
const view=computed(()=>{const [a,b,c,d]=sheet.value.bounds,w=(c-a)*.55,h=(d-b)*.55,p=pos.value?.pin;return [p?p.x-w/2:a,p?p.y-h/2:b,p?w:c-a,p?h:d-b].join(' ')});
</script>
<template><svg :viewBox="view" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="width:100%;height:100%;background:#344c61"><MapLayers :sheet="sheet"/><circle v-if="pos" :cx="pos.pin.x" :cy="pos.pin.y" :r="(sheet.bounds[2]-sheet.bounds[0])*.006" fill="#7fe8d7" stroke="#fff" vector-effect="non-scaling-stroke"/></svg></template>
