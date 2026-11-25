<script setup lang="ts">
import { computed } from 'vue';
import type { MapSheet } from './maps';

const props = withDefaults(defineProps<{
  sheet: MapSheet;
  theme?: 'dark' | 'day';
  showBuildings?: boolean;
}>(), {
  theme: 'dark',
  showBuildings: true,
});

const palette = computed(() => props.theme === 'day' ? {
  land: '#f3f4f6', landStroke: '#cbd5e1',
  pavement: '#e8eaed', subblock: '#eaedef',
  green: '#ceead6', greenStroke: '#a8dab5',
  water: '#aadaff', waterStroke: '#7fbfff',
  runway: '#dadce0',
  roadCase: '#dadce0', minor: '#ffffff', road: '#ffffff', major: '#feefc3', highway: '#fdd663',
  rail: '#9aa0a6', trail: '#81c995',
  block: '#e1e4e8', blockStroke: '#cfd4dc',
  landmark: '#d2dce8', landmarkStroke: '#9cb3ce',
} : {
  land: '#2a384a', landStroke: '#3d5168',
  pavement: '#314155', subblock: '#334459',
  green: '#0e5a45', greenStroke: '#157056',
  water: '#172636', waterStroke: '#243c56',
  runway: '#1e2835',
  roadCase: '#121922', minor: '#212d3b', road: '#1c2532', major: '#18202c', highway: '#1f2b3a',
  rail: '#3b526b', trail: '#3b766c',
  block: '#46586f', blockStroke: '#556b86',
  landmark: '#516885', landmarkStroke: '#7391b5',
});
</script>
<template>
  <g aria-hidden="true">
    <path v-if="sheet.layers.land" :d="sheet.layers.land" :fill="palette.land" :stroke="palette.landStroke" stroke-width="0.9" vector-effect="non-scaling-stroke"/>
    <path v-if="sheet.layers.pavement" :d="sheet.layers.pavement" :fill="palette.pavement"/>
    <path v-if="sheet.layers.subblock" :d="sheet.layers.subblock" :fill="palette.subblock"/>
    <path v-if="sheet.layers.green" :d="sheet.layers.green" :fill="palette.green" :stroke="palette.greenStroke" stroke-width="0.7" vector-effect="non-scaling-stroke"/>
    <path v-if="sheet.layers.water" :d="sheet.layers.water" :fill="palette.water" :stroke="palette.waterStroke" stroke-width="0.9" vector-effect="non-scaling-stroke"/>
    <path v-if="sheet.layers.runway" :d="sheet.layers.runway" :fill="palette.runway" :stroke="palette.blockStroke" stroke-width="0.8" vector-effect="non-scaling-stroke"/>

    <!-- Google Maps Double-Cased Street Network -->
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path v-if="sheet.layers.minor" :d="sheet.layers.minor" :stroke="palette.roadCase" stroke-width="2.6" vector-effect="non-scaling-stroke"/>
      <path v-if="sheet.layers.road" :d="sheet.layers.road" :stroke="palette.roadCase" stroke-width="4.4" vector-effect="non-scaling-stroke"/>
      <path v-if="sheet.layers.major" :d="sheet.layers.major" :stroke="palette.roadCase" stroke-width="6.6" vector-effect="non-scaling-stroke"/>
      <path v-if="sheet.layers.highway" :d="sheet.layers.highway" :stroke="palette.roadCase" stroke-width="8.4" vector-effect="non-scaling-stroke"/>

      <path v-if="sheet.layers.minor" :d="sheet.layers.minor" :stroke="palette.minor" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      <path v-if="sheet.layers.road" :d="sheet.layers.road" :stroke="palette.road" stroke-width="3.0" vector-effect="non-scaling-stroke"/>
      <path v-if="sheet.layers.major" :d="sheet.layers.major" :stroke="palette.major" stroke-width="4.8" vector-effect="non-scaling-stroke"/>
      <path v-if="sheet.layers.highway" :d="sheet.layers.highway" :stroke="palette.highway" stroke-width="6.4" vector-effect="non-scaling-stroke"/>
      <path v-if="sheet.layers.rail" :d="sheet.layers.rail" :stroke="palette.rail" stroke-width="2.0" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>
      <path v-if="sheet.layers.trail" :d="sheet.layers.trail" :stroke="palette.trail" stroke-width="1.6" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
    </g>

    <!-- Building Footprints & Landmarks -->
    <template v-if="showBuildings">
      <path v-if="sheet.layers.block" :d="sheet.layers.block" :fill="palette.block" :stroke="palette.blockStroke" stroke-width="0.65" vector-effect="non-scaling-stroke"/>
      <path v-if="sheet.layers.landmark" :d="sheet.layers.landmark" :fill="palette.landmark" :stroke="palette.landmarkStroke" stroke-width="1.05" vector-effect="non-scaling-stroke"/>
    </template>
  </g>
</template>
