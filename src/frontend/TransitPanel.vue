<script setup lang="ts">
import { computed, ref } from 'vue';
import { getTransitRoutes, requiresTransitReturn, transitStops, transitVehicles, type TransitStop } from '../runtime/transit';
import { getNovelTravelQuote, getRouteOutlook } from '../runtime/model';
import type { ShellModel } from './types';
import { formatGameNumber } from './format-game-number';

const props = defineProps<{ model: ShellModel; stop: TransitStop | null; novelMode?: boolean }>();
const emit = defineEmits<{ ride: [vehicleId: 'btr82a' | 'zbd04a', stopId: string]; approach: [] }>();
const selectedVehicle = ref<'btr82a' | 'zbd04a'>('btr82a');
const routes = computed(() => props.stop ? getTransitRoutes(props.stop.id) : []);
const vehicleName = computed(() => transitVehicles.find(vehicle => vehicle.id === selectedVehicle.value)?.label ?? 'BTR-82A');
const approachMinutes = computed(() => 15 + getRouteOutlook(props.model.state, 'bus-stop').extraMinutes);
const novelApproach = computed(() => props.novelMode ? getNovelTravelQuote(props.model.state, 'bus-stop') : null);
const approachBlocked = computed(() => props.novelMode ? !!novelApproach.value?.blockedReason : !!props.model.state.interior || props.model.state.player.energy < 5);
const districtStop = computed(() => {
  const known = transitStops.find(stop => stop.id !== 'campus' && stop.locationId === props.model.state.locationId);
  const scene = props.model.state.scene;
  if (known || !scene || !requiresTransitReturn(props.model.state.locationId, scene)) return known;
  return transitStops.filter(stop => stop.id !== 'campus').reduce((closest, stop) => Math.hypot(stop.x - scene.x, stop.z - scene.z) < Math.hypot(closest.x - scene.x, closest.z - scene.z) ? stop : closest);
});
const stopDistance = computed(() => districtStop.value && props.model.state.scene ? Math.round(Math.hypot(props.model.state.scene.x - districtStop.value.x, props.model.state.scene.z - districtStop.value.z)) : null);
</script>

<template>
  <section class="transit-panel" aria-label="公交乘车" data-transit-panel>
    <header><small>城市接驳</small><h2>{{ stop ? stop.label : '从公交站出发' }}</h2><p>搭乘 BTR-82A 或 ZBD-04A，去更远的地方走走。</p></header>
    <template v-if="stop">
      <fieldset class="transit-vehicle-picker"><legend>选择车辆</legend><button v-for="vehicle in transitVehicles" :key="vehicle.id" :data-transit-vehicle="vehicle.id" :aria-pressed="selectedVehicle === vehicle.id" :disabled="model.busy" @click="selectedVehicle = vehicle.id">{{ vehicle.label }}</button></fieldset>
      <div class="transit-routes"><button v-for="route in routes" :key="route.stop.id" :data-transit-target="route.stop.id" :disabled="model.busy || model.state.player.balance < route.fare" @click="emit('ride', selectedVehicle, route.stop.id)"><span><strong>{{ route.stop.id === 'home' ? '回家 · 居住区' : route.stop.label }}</strong><small>{{ vehicleName }} · {{ route.minutes }} 分钟 · ¥{{ route.fare }}</small></span><span>{{ model.state.player.balance < route.fare ? '余额不足' : '乘车 ↗' }}</span></button></div>
      <p class="transit-note">确认乘车后扣除车费并推进车程，到站即可自由行走。返程也在站牌附近乘车。</p>
    </template>
    <template v-else><p v-if="districtStop && !novelMode" class="transit-empty">请走回{{ districtStop.label }}的站牌附近乘车返程{{ stopDistance === null ? '。' : `，还有约 ${stopDistance} 米。` }}</p><template v-else><p class="transit-empty">{{ novelMode ? '按已知路线前往南门公交站，精力不足仍可出发。' : model.state.interior ? '先离开房间，再前往南门公交站。' : '走到站牌附近即可上车，也可以先前往南门公交站。' }}</p><button class="transit-approach" data-transit-approach :disabled="model.busy || approachBlocked" @click="emit('approach')">前往南门公交站 <small v-if="novelApproach">{{ novelApproach.minutes }} 分钟 · 精力 −{{ formatGameNumber(novelApproach.energyCost) }}<template v-if="novelApproach.fare"> · 车费 ¥{{ novelApproach.fare }}</template></small><small v-else>{{ approachMinutes }} 分钟 · 精力 −5</small></button><p v-if="novelApproach?.blockedReason" class="transit-empty">{{ novelApproach.blockedReason }}</p></template></template>
    <footer><span>余额 ¥{{ model.state.player.balance.toFixed(2) }}</span><span>乘车不会自动发送对话</span></footer>
  </section>
</template>
