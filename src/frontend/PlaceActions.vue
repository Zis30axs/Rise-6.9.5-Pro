<script setup lang="ts">
import { computed } from 'vue';
import { LAW_OFFICE_ID } from '../runtime/law-career';
import { canManageLivehouseAndBand, getCampusInterior, getMlmWorkBlockedReason, isStudyInteraction } from '../runtime/campus-interiors';
import { activeProtagonist } from '../runtime/protagonist-world';
import { getStoreAvailability } from '../runtime/convenience-store';
import { getAdjacentLocations } from '../runtime/location-links';
import { getLocationServiceQuote, getLocationServices, getLocationStatus, getTakeawayQuote } from '../runtime/location-services';
import { getNovelTravelQuote } from '../runtime/model';
import { formatGameNumber } from './format-game-number';
import type { ShellModel } from './types';

const props = defineProps<{ model: ShellModel; catalog?: boolean }>();
const emit = defineEmits<{ travel: [locationId: string]; service: [serviceId: string]; package: [serviceId: string]; activity: [interactionId: string]; store: []; books: []; law: []; map: []; more: [] }>();
const room = computed(() => getCampusInterior(props.model.state.interior?.roomId));
const status = computed(() => getLocationStatus(props.model.state.locationId, props.model.state.clock));
const services = computed(() => getLocationServices(props.model.state).map(service => ({ service, quote: getLocationServiceQuote(props.model.state, service.id) })));
const takeaways = computed(() => getLocationServices(props.model.state).map(service => ({ service, quote: getTakeawayQuote(props.model.state, service.id) })).filter(item => item.quote.item));
const adjacent = computed(() => getAdjacentLocations(props.model.state).map(place => ({ place, quote: getNovelTravelQuote(props.model.state, place.id) })));
const storeAvailable = computed(() => getStoreAvailability(props.model.state).available);
const atBookshop = computed(() => !props.model.state.interior && props.model.state.locationId === 'bookshop');
const activityBlockedReason = (id: string): string | null => {
  if (id === 'livehouse-booking' || id === 'livehouse-create-band') {
    const who = activeProtagonist(props.model.state);
    const check = canManageLivehouseAndBand(props.model.state, who);
    if (!check.allowed) return check.reason ?? '未选修音乐专业';
  }
  const item = room.value?.interactions.find(activity => activity.id === id);
  return item ? getMlmWorkBlockedReason(item, props.model.state.player.stress) : null;
};
const activityDisabled = (id: string) => {
  const item = room.value?.interactions.find(activity => activity.id === id);
  const closed = status.value && (!status.value.isOpen || status.value.minutesUntilClose !== null && !!item && item.minutes > status.value.minutesUntilClose);
  if (props.model.busy || !!closed || !!(item && !isStudyInteraction(id) && item.energyDelta < 0 && props.model.state.player.energy < -item.energyDelta) || !!(item && item.balanceDelta && item.balanceDelta < 0 && props.model.state.player.balance < -item.balanceDelta)) return true;
  return Boolean(activityBlockedReason(id));
};
</script>

<template>
  <nav class="place-actions" :class="{ 'place-actions-catalog': catalog }" data-place-actions aria-label="此地交互与相邻地点">
    <div class="place-action-row">
      <span class="place-row-label">此地<br><small v-if="status && !status.isOpen">休息中</small><small v-else>可做</small></span>
      <div class="place-action-options" tabindex="0" aria-label="此地活动，可左右滚动">
        <button v-for="{ service, quote } in services" :key="service.id" type="button" :data-quick-service="service.id" :disabled="model.busy || (!service.reveal && !!quote.blockedReason)" :title="service.reveal ? service.description : quote.blockedReason ?? service.description" @click="emit('service', service.id)"><span>{{ service.label }}</span><small>{{ service.reveal ? '两人招聘 · 点击查看完整条件' : quote.blockedReason ? (status && !status.isOpen ? `开放 ${status.hoursLabel}` : quote.blockedReason) : service.payout ? `工资 ¥${formatGameNumber(service.payout)} · 精力 −${-service.effects.energy} · ${service.minutes} 分钟` : `${service.price ? `¥${formatGameNumber(service.price)}` : '免费'} · ${service.minutes} 分钟` }}</small></button>
        <button v-for="{ service, quote } in takeaways" :key="`pack-${service.id}`" type="button" :data-quick-package-service="service.id" :disabled="model.busy || !!quote.blockedReason" :title="quote.blockedReason ?? '含打包费，放入背包；稍后可使用或送人'" @click="emit('package', service.id)"><span>{{ quote.item?.name }}</span><small>{{ quote.blockedReason ?? `¥${formatGameNumber(quote.totalPrice)} · 含打包费 ¥${quote.packagingFee}` }}</small></button>
        <button v-for="activity in room?.interactions ?? []" :key="activity.id" type="button" :data-place-activity="activity.id" :disabled="activityDisabled(activity.id)" :title="activityBlockedReason(activity.id) ?? activity.description" @click="emit('activity', activity.id)"><span>{{ activity.label }}</span><small>{{ activityBlockedReason(activity.id) ?? (activity.id === 'dorm-rest' ? '选择休息时长' : isStudyInteraction(activity.id) ? '选择科目与时长' : `${activity.minutes} 分钟${activity.energyDelta < 0 ? ` · 精力 ${activity.energyDelta}` : ''}${activity.balanceDelta ? ` · ¥+${formatGameNumber(activity.balanceDelta)}` : ''}${!activity.energyDelta && !activity.balanceDelta ? ' · 免费' : ''}`) }}</small></button>
        <button v-if="room?.id === LAW_OFFICE_ID" type="button" data-place-law @click="emit('law')"><span>案件卷宗与法庭</span><small>调查证据 · 当庭质证 · 雪莉协助</small></button>
        <button v-if="storeAvailable" type="button" data-place-store data-store-entry :disabled="model.busy" @click="emit('store')"><span>逛便利店</span><small>货架 · 买入背包</small></button>
        <button v-if="atBookshop" type="button" data-place-books data-book-reading-entry :disabled="model.busy || !status?.isOpen" :title="status?.hoursLabel" @click="emit('books')"><span>选书阅读</span><small>{{ status?.isOpen ? '选择科目与时长' : `开放 ${status?.hoursLabel}` }}</small></button>
        <button v-if="!catalog" type="button" data-place-more @click="emit('more')"><span>{{ services.length || room || storeAvailable || atBookshop ? '查看详情' : '看看此地' }}</span><small>地点与开放时间</small></button>
        <span v-else-if="!services.length && !room && !storeAvailable && !atBookshop" class="place-action-empty">可以在这里停留，或直接说出你的行动。</span>
      </div>
    </div>
    <div class="place-action-row">
      <span class="place-row-label">前往<br><small>相邻</small></span>
      <div class="place-action-options" tabindex="0" aria-label="相邻地点，可左右滚动">
        <button v-for="{ place, quote } in adjacent" :key="place.id" type="button" :data-adjacent-place="place.id" :disabled="model.busy || !!quote.blockedReason" :title="quote.blockedReason ?? `前往${place.label}，${quote.minutes} 分钟，精力消耗 ${formatGameNumber(quote.energyCost)}${quote.fare ? `，车费 ${quote.fare} 元` : ''}`" @click="emit('travel', place.id)"><span>{{ place.kind === 'enter' ? '进入' : place.kind === 'exit' ? '走出至' : place.kind === 'transit' ? '乘车至' : '' }}{{ place.label }} <span aria-hidden="true">↗</span></span><small>{{ quote.blockedReason ?? (quote.minutes === 0 ? '直接进出 · 不耗时' : `${quote.minutes} 分钟 · 精力 −${formatGameNumber(quote.energyCost)}${quote.fare ? ` · ¥${quote.fare}` : ''}`) }}</small></button>
        <button type="button" data-place-map aria-label="打开地图切换地点" @click="emit('map')"><span>其他地点 ↗</span><small>打开地图</small></button>
      </div>
    </div>
  </nav>
</template>
