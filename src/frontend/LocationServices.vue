<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getLocationServiceQuote, getLocationServices, getLocationStatus, getTakeawayQuote } from '../runtime/location-services';
import { getCampusInterior } from '../runtime/campus-interiors';
import { getStoreAvailability, PACKAGING_FEE } from '../runtime/convenience-store';
import { locations } from '../runtime/model';
import { formatGameNumber } from './format-game-number';
import { completeLocationService, packageLocationService, serviceEffects as effects, signedServiceEffect as signed } from './location-service-action';
import type { ShellActions, ShellModel } from './types';
import { MARGO_CAFE_ROOM_ID } from '../runtime/margo-cafe-venue';
import { LAW_OFFICE_ID } from '../runtime/law-career';

const props = defineProps<{ model: ShellModel; actions: ShellActions; novelMode: boolean }>();
const emit = defineEmits<{ map: []; store: []; books: []; activities: []; law: [] }>();
const status = computed(() => getLocationStatus(props.model.state.locationId, props.model.state.clock));
const place = computed(() => locations.find(item => item.id === props.model.state.locationId));
const room = computed(() => getCampusInterior(props.model.state.interior?.roomId));
const services = computed(() => getLocationServices(props.model.state).map(service => ({ service, quote: getLocationServiceQuote(props.model.state, service.id), takeaway: getTakeawayQuote(props.model.state, service.id) })));
const storeAvailable = computed(() => getStoreAvailability(props.model.state).available);
const atBookshop = computed(() => !props.model.state.interior && props.model.state.locationId === 'bookshop');
const receipt = ref('');
const attempted = ref(false);
const revealingJob = ref<string | null>(null);
const time = computed(() => `${String(props.model.state.clock.hour).padStart(2, '0')}:${String(props.model.state.clock.minute).padStart(2, '0')}`);
const guidance = computed(() => {
  if (room.value?.id === LAW_OFFICE_ID) return '可以翻阅委托卷宗、核对证物并在模拟庭审中质证；雪莉会协助艾玛参与案件。';
  if (room.value?.id === MARGO_CAFE_ROOM_ID) return '可以向在场的店主与来客打招呼，点一杯饮品，或在窗边坐一会儿。';
  if (room.value) return '上方可直接选择房间里的学习、整理与休息，也可在 3D 中靠近桌椅、书架或床铺探索。';
  if (storeAvailable.value) return '在店门前打开货架选购，购买的商品放入背包，使用时才结算效果。';
  if (atBookshop.value) return '可选择本专业学科巩固，也可探索其他专业；选科后查看耗时与学习代价。';
  if (services.value.length) return '';
  if (props.model.state.locationId === 'dorm' || props.model.state.locationId === 'teaching' || props.model.state.locationId === 'library') return '学习与休息在建筑内进行。点击上方“进入”可直接走进房间；3D 漫游时也可走到门前进入。';
  return '这里可以停留、观察环境，或打开地图继续探索。此处暂未提供可结算的消费或活动。';
});

async function useService(serviceId: string) {
  const quote = getLocationServiceQuote(props.model.state, serviceId);
  if (props.model.busy || quote.blockedReason || !quote.service) return;
  receipt.value = '';
  if (quote.service.reveal && revealingJob.value !== serviceId) {
    attempted.value = false;
    revealingJob.value = serviceId;
    return;
  }
  attempted.value = true;
  const savedReceipt = await completeLocationService(props.model, props.actions, serviceId);
  if (!savedReceipt) return;
  attempted.value = false;
  revealingJob.value = null;
  receipt.value = savedReceipt;
}
async function packService(serviceId: string) {
  const quote = getTakeawayQuote(props.model.state, serviceId);
  if (props.model.busy || quote.blockedReason || !quote.item) return;
  receipt.value = '';
  attempted.value = true;
  const savedReceipt = await packageLocationService(props.model, props.actions, serviceId);
  if (!savedReceipt) return;
  attempted.value = false;
  receipt.value = savedReceipt;
}
watch(() => [props.model.state.locationId, props.model.state.protagonists?.accounts.active, props.model.state.academics?.majorId], () => {
  receipt.value = '';
  attempted.value = false;
  revealingJob.value = null;
});
</script>

<template>
  <section class="location-services" data-location-services aria-label="此地服务">
    <header class="location-service-heading">
      <div><small>此刻所在 · 第 {{ model.state.clock.day }} 天 {{ time }}</small><h2>{{ room?.label ?? status?.label ?? place?.name ?? '当前地点' }}</h2></div>
      <span v-if="status" class="location-open-status" :class="{ closed: !status.isOpen }" data-location-open-status>{{ status.statusLabel }}</span>
    </header>
    <p v-if="status" class="location-hours" data-location-hours>开放时间 · {{ status.hoursLabel }}</p>
    <p class="location-description">{{ status?.description ?? place?.description }}</p>
    <p v-if="status && !status.isOpen" class="location-closed-note" data-location-closed>此刻暂停服务，距离开放还有 {{ status.minutesUntilOpen }} 分钟。可先去其他地点。</p>
    <p v-if="receipt" class="location-service-receipt" data-location-service-receipt role="status">{{ receipt }}</p>
    <p v-if="attempted && model.notice" class="location-service-error" data-location-service-error role="alert">{{ model.notice }}<span>本次活动尚未保存，可以重试。</span></p>
    <div v-if="services.length" class="location-service-list">
      <article v-for="{ service, quote, takeaway } in services" :key="service.id" class="location-service-card" :data-location-service="service.id">
        <div class="location-service-title"><h3>{{ service.label }}</h3><strong>{{ service.reveal && revealingJob !== service.id ? '待遇面议' : service.payout ? `报酬 ¥${formatGameNumber(service.payout)}` : service.price ? `¥${formatGameNumber(service.price)}` : '免费' }}</strong></div>
        <p :class="{ 'backend-recruitment-copy': !!service.reveal }">{{ service.description }}</p>
        <small v-if="!service.reveal || revealingJob === service.id" class="location-service-duration">用时 {{ service.minutes }} 分钟</small>
        <p v-if="!quote.blockedReason && (!service.reveal || revealingJob === service.id)" class="location-service-effects" data-location-service-preview>{{ service.payout ? `收工工资 ¥${formatGameNumber(quote.payout)} · ` : "" }}此次实际变化：<template v-for="(effect, index) in effects(quote)" :key="effect.key"><span :class="{ harmful: effect.harmful }">{{ effect.label }} {{ signed(effect.value) }}{{ effect.unit }}</span><template v-if="index < effects(quote).length - 1"> · </template></template></p>
        <p v-else class="location-service-blocked" data-location-service-blocked>{{ quote.blockedReason }}</p>
        <div v-if="service.reveal && revealingJob === service.id" class="location-service-reveal" :data-job-reveal="service.id" role="group" aria-label="工作安排">
          <p>{{ service.reveal }}</p>
          <div class="location-service-reveal-actions">
            <button type="button" :data-confirm-backend-job="service.id" :disabled="model.busy || !!quote.blockedReason" @click="useService(service.id)">接下这班</button>
            <button type="button" class="location-service-cancel" :data-cancel-backend-job="service.id" @click="revealingJob = null">不接了</button>
          </div>
        </div>
        <button v-else type="button" :data-use-location-service="service.id" :disabled="model.busy || !!quote.blockedReason" @click="useService(service.id)">{{ service.reveal ? '前去应聘' : service.payout ? '开始打工' : service.price ? '购买并享用' : '开始活动' }} <span aria-hidden="true">↗</span></button>
        <button v-if="takeaway.item" type="button" class="location-service-pack" :data-package-service="service.id" :disabled="model.busy || !!takeaway.blockedReason" :title="takeaway.blockedReason ?? '放入背包，稍后食用或送人；当前不结算食用效果'" @click="packService(service.id)">打包带走 · ¥{{ formatGameNumber(takeaway.totalPrice) }}<small>含打包费 ¥{{ PACKAGING_FEE }}，不立即食用</small></button>
        <p v-if="takeaway.item && takeaway.blockedReason && takeaway.blockedReason !== quote.blockedReason" class="location-service-blocked">打包：{{ takeaway.blockedReason }}</p>
      </article>
    </div>
    <p v-if="services.some(({ service }) => !!service.payout)" class="location-service-note">工资在整班结束后发放；请先确认精力充足，也要在收工时间前完成。</p>
    <p v-if="services.some(({ service }) => !service.payout)" class="location-service-note">“购买并享用”当场结算耗时与效果；“打包带走”加包装费后放入背包，使用时才结算。</p>
    <div v-if="guidance" class="location-guidance" data-location-guidance>
      <p>{{ guidance }}</p>
      <button v-if="room?.id === LAW_OFFICE_ID" type="button" data-location-law :disabled="model.busy" @click="emit('law')">打开案件卷宗 ↗</button>
      <button v-if="storeAvailable" type="button" data-location-store :disabled="model.busy" @click="emit('store')">打开便利店货架 ↗</button>
      <button v-if="atBookshop" type="button" data-location-books :disabled="model.busy || !status?.isOpen" @click="emit('books')">选书阅读 ↗</button>
      <button v-if="room" type="button" :disabled="model.busy" @click="emit('activities')">查看上方房间活动 ↑</button>
    </div>
    <footer class="location-service-footer"><small>账户余额 ¥{{ model.state.player.balance.toFixed(2) }}</small><button type="button" data-location-map @click="emit('map')">打开地图 ↗</button></footer>
  </section>
</template>
