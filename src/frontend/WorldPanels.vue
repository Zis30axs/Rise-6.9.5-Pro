<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import WorldMap from './WorldMap.vue';
import StoryEngineSettings from './StoryEngineSettings.vue';
import AcademicProgress from './AcademicProgress.vue';
import AcademicTimetable from './AcademicTimetable.vue';
import { formatGameNumber } from './format-game-number';
import { runInteraction } from './interaction-action';
import { locations, getNovelTravelQuote } from '../runtime/model';
import { getActiveAirliner } from '../runtime/air-traffic';
import { getCampusInterior, getInteriorActivity } from '../runtime/campus-interiors';
import { transitStops, transitVehicles } from '../runtime/transit';
import { getStoreAvailability } from '../runtime/convenience-store';
import type { ShellActions, ShellModel } from './types';

type Panel = 'phone' | 'map' | 'schedule' | 'status';
const props = defineProps<{ panel: Panel; model: ShellModel; actions: ShellActions; novelMode?: boolean }>();
const emit = defineEmits<{ compose: [name: string]; transit: []; travelled: []; store: []; inventory: []; phone: [] }>();
const labels: Record<Panel, string> = {
  phone: '演示手机消息', map: '探索地图', schedule: '今日日程', status: '个人状态与日记',
};
const selectedContactId = ref('');
const currentLocation = computed(() => locations.find(item => item.id === props.model.state.locationId) ?? locations[0]);
const time = computed(() => `${String(props.model.state.clock.hour).padStart(2, '0')}:${String(props.model.state.clock.minute).padStart(2, '0')}`);
const unread = computed(() => props.model.state.phone.filter(item => !item.read).length);
const activeContact = computed(() => props.model.state.contacts.find(item => item.id === selectedContactId.value) ?? props.model.state.contacts[0]);
const contactMessages = computed(() => props.model.state.phone.filter(item => item.npcId === activeContact.value?.id));
const completedPlans = computed(() => props.model.state.schedule.filter(item => item.done).length);
const storeAvailability = computed(() => getStoreAvailability(props.model.state));
function condition(value: number, inverse = false) {
  const score = inverse ? 100 - value : value;
  return score >= 70 ? '充裕' : score >= 40 ? '平稳' : score > 0 ? '偏低' : '耗尽';
}
const bodyStats = computed(() => [
  { id: 'energy', label: '精力', value: props.model.state.player.energy, maximum: 100, state: condition(props.model.state.player.energy), note: '行动与学习消耗；低精力仍可休息、交谈与轻量出行' },
  { id: 'health', label: '健康', value: props.model.state.player.health, maximum: 100, state: condition(props.model.state.player.health), note: '长休与部分活动恢复；影响出行体力消耗' },
  { id: 'satiety', label: '饱腹', value: props.model.state.player.satiety, maximum: 100, state: props.model.state.player.satiety >= 70 ? '饱足' : props.model.state.player.satiety >= 40 ? '尚可' : '饥饿', note: '每经过 15 分钟刻度消耗 1 点，吃喝时补充' },
  { id: 'foodEnergy', label: '食物能量储备', value: props.model.state.player.foodEnergy, maximum: 3000, state: props.model.state.player.foodEnergy >= 600 ? '有储备' : props.model.state.player.foodEnergy > 0 ? '储备偏低' : '暂无储备', note: '每推进 1 分钟消耗 2 kcal，使用食物后补充' },
]);
const mindStats = computed(() => [
  { id: 'morale', label: '精神', value: props.model.state.player.morale, maximum: 100, state: condition(props.model.state.player.morale), note: '学习消耗精神；休息、咖啡与放松可恢复' },
  { id: 'stress', label: '压力', value: props.model.state.player.stress, maximum: 100, state: props.model.state.player.stress < 30 ? '放松' : props.model.state.player.stress < 70 ? '有压力' : '紧绷', note: '越低越轻松；学习可能增加，休息和散步可缓解' },
]);
const recentChanges = computed(() => props.model.state.journal.slice(-5).reverse());
const inventoryCount = computed(() => props.model.state.inventory.reduce((sum, item) => sum + item.quantity, 0));
const unreadFor = (npcId: string) => props.model.state.phone.filter(item => item.npcId === npcId && !item.read).length;
const locationName = (id: string) => locations.find(item => item.id === id)?.name ?? '未知地点';
async function travelToPlan(locationId: string) {
  const destination = props.novelMode ? locationId : getCampusInterior(locationId)?.parentLocationId ?? locationId;
  if (await runInteraction(props.model, props.actions, { type: props.novelMode ? 'novel_travel' : 'travel', locationId: destination })) {
    if (props.novelMode) emit('travelled');
  }
}
function courseTravelBlocked(locationId: string) {
  if (props.novelMode) return getNovelTravelQuote(props.model.state, locationId).blockedReason;
  if (props.model.state.interior && props.model.state.locationId !== locationId) return '先离开当前房间，再前往建筑入口。';
  return null;
}
const airNow = ref(Date.now());
const activeAirliner = computed(() => getActiveAirliner(props.model.state.airTraffic, airNow.value));
const lastAirliner = computed(() => props.model.state.airTraffic.lastFlight);
const interior = computed(() => getCampusInterior(props.model.state.interior?.roomId));
const lastActivity = computed(() => interior.value ? getInteriorActivity(interior.value, props.model.state.interior?.activityId, props.model.state.interior?.lastRest, props.model.state.interior?.lastStudy) : undefined);
const airlinerSource = computed(() => lastAirliner.value?.source === 'story' ? '剧情触发' : '随机环境');
let airBoundaryTimer: ReturnType<typeof setTimeout> | undefined;
function refreshAirStatus() {
  if (airBoundaryTimer) { clearTimeout(airBoundaryTimer); airBoundaryTimer = undefined; }
  airNow.value = Date.now();
  const flight = lastAirliner.value;
  if (props.panel !== 'status' || !flight) return;
  const boundary = airNow.value < flight.startedAt ? flight.startedAt : flight.startedAt + flight.durationMs;
  if (boundary > airNow.value) airBoundaryTimer = setTimeout(refreshAirStatus, Math.min(2_147_000_000, boundary - airNow.value + 1));
}
watch([() => props.panel, lastAirliner], refreshAirStatus, { immediate: true });
onBeforeUnmount(() => { if (airBoundaryTimer) clearTimeout(airBoundaryTimer); });
</script>

<template>
  <section class="world-panels" :class="'world-panel-' + panel" :aria-label="labels[panel]">
    <template v-if="panel === 'phone'">
      <p class="wp-demo-note">本地演示消息 · 进入酒馆后使用 ST-iPhonie</p>
      <div class="wp-phone-layout">
        <aside class="wp-contacts">
          <div class="wp-heading"><h2>联系人</h2><span class="wp-badge">{{ unread }} 未读</span></div>
          <button v-for="(contact, index) in model.state.contacts" :key="contact.id" class="wp-contact" :class="{ selected: activeContact?.id === contact.id }" :aria-pressed="activeContact?.id === contact.id" @click="selectedContactId = contact.id">
            <span class="wp-avatar" :class="'wp-avatar-' + index % 3">{{ contact.name.slice(-2) }}</span>
            <span class="wp-contact-info"><b>{{ contact.name }}</b><small>{{ contact.status }}</small></span>
            <span v-if="unreadFor(contact.id)" class="wp-badge">{{ unreadFor(contact.id) }}</span>
          </button>
          <p v-if="!model.state.contacts.length" class="wp-empty">还没有联系人。</p>
        </aside>
        <div v-if="activeContact" class="wp-conversation">
          <div class="wp-conversation-heading"><h2>{{ activeContact.name }}</h2><p>{{ activeContact.tag }} · {{ activeContact.status }}</p></div>
          <div class="wp-message-list">
            <article v-for="message in contactMessages" :key="message.id" class="wp-message">
              <time>{{ message.at }}</time><p class="wp-message-bubble">{{ message.text }}</p>
              <button v-if="!message.read" class="wp-text-button" :disabled="model.busy" :aria-label="'将 ' + activeContact.name + ' 的消息标为已读'" @click="actions.dispatch({ type: 'read_phone', id: message.id })">标为已读 <span aria-hidden="true">✓</span></button>
              <span v-else class="wp-message-read">已读 ✓</span>
            </article>
            <p v-if="!contactMessages.length" class="wp-empty">暂时没有消息。</p>
          </div>
          <button class="wp-primary" @click="emit('compose', activeContact.name)">写一条消息 <span aria-hidden="true">↗</span></button>
          <p class="wp-footnote">点击后填写行动，确认发送才会继续叙事。</p>
        </div>
      </div>
    </template>

    <template v-else-if="panel === 'map'"><WorldMap :model="model" :actions="actions" :novel-mode="novelMode" @travelled="emit('travelled')" /></template>

    <template v-else-if="panel === 'schedule'">
      <AcademicTimetable v-if="model.state.academics" :major-id="model.state.academics.majorId" :day="model.state.clock.day" :hour="model.state.clock.hour" :minute="model.state.clock.minute" :busy="model.busy" :current-location-id="model.state.locationId" :travel-label="novelMode ? '前往课程地点' : '前往建筑入口'" :blocked-reason="courseTravelBlocked" @travel="travelToPlan" />
      <div class="wp-day-summary"><div><h2>第 {{ model.state.clock.day }} 天</h2><p>{{ time }} · {{ currentLocation?.name }}</p></div><span class="wp-badge">已完成 {{ completedPlans }} / {{ model.state.schedule.length }} 项</span></div>
      <div class="wp-day-progress"><span :style="{ width: (model.state.schedule.length ? completedPlans / model.state.schedule.length * 100 : 0) + '%' }"></span></div>
      <div class="wp-plans">
        <article v-for="plan in model.state.schedule" :key="plan.id" class="wp-plan" :class="{ done: plan.done }">
          <div class="wp-plan-time">{{ plan.time }}<small>{{ plan.done ? '已完成' : '待办' }}</small></div>
          <div class="wp-plan-body"><h2>{{ plan.title }}</h2><p>{{ locationName(plan.locationId) }}</p><div class="wp-plan-actions"><button class="wp-text-button" :data-schedule-destination="plan.locationId" :disabled="model.busy || plan.locationId === model.state.locationId" @click="travelToPlan(plan.locationId)">{{ plan.locationId === model.state.locationId ? '已在此处' : '前往地点 ↗' }}</button><button class="wp-secondary" :disabled="model.busy || plan.done" @click="runInteraction(model, actions, { type: 'complete_schedule', id: plan.id })">{{ plan.done ? '已完成 ✓' : '完成这件事' }}</button></div></div>
        </article>
        <p v-if="!model.state.schedule.length" class="wp-empty">今天暂时没有安排。</p>
      </div>
      <p class="wp-footnote">演示安排 · 到达地点并到达约定时间后可完成。</p>
    </template>

    <template v-else-if="panel === 'status'">
      <StoryEngineSettings />
      <section class="wp-status-overview" data-status-section="overview" aria-label="此刻状态"><div><small>第 {{ model.state.clock.day }} 天 · 星期{{ ['一', '二', '三', '四', '五', '六', '日'][(model.state.clock.day - 1) % 7] }}</small><strong>{{ time }}</strong><h2>{{ currentLocation.name }}</h2><p>{{ model.busy ? '正在继续故事…' : '停留在这里，等待你的下一步行动。' }}</p></div><button class="wp-secondary" :disabled="model.busy" @click="runInteraction(model, actions, { type: 'wait', minutes: 15 })">休息 15 分钟 ↗</button><p v-if="lastActivity" class="wp-last-activity">最近完成：{{ lastActivity.result }}</p></section>
      <section class="wp-status-section" data-status-section="body" aria-label="身体状态"><div class="wp-heading"><h2>身体状态</h2><small>当前值与变化来源</small></div><div class="wp-wellbeing"><article v-for="stat in bodyStats" :key="stat.id" class="wp-wellbeing-stat"><div class="wp-heading"><h2>{{ stat.label }}</h2><small>{{ stat.state }}</small></div><p :data-player-stat="stat.id"><strong>{{ formatGameNumber(stat.value) }}</strong><small>{{ stat.id === 'foodEnergy' ? 'kcal' : '/ 100' }}</small></p><div class="wp-energy"><span :style="{ width: Math.min(100, Math.max(0, stat.value / stat.maximum * 100)) + '%' }"></span></div><small>{{ stat.note }}</small></article></div></section>
      <section class="wp-status-section" data-status-section="mind" aria-label="精神与压力"><div class="wp-heading"><h2>精神与压力</h2><small>感受与负担</small></div><div class="wp-wellbeing wp-mind-stats"><article v-for="stat in mindStats" :key="stat.id" class="wp-wellbeing-stat" :class="{ 'wp-stress': stat.id === 'stress' }"><div class="wp-heading"><h2>{{ stat.label }}</h2><small>{{ stat.state }}</small></div><p :data-player-stat="stat.id"><strong>{{ formatGameNumber(stat.value) }}</strong><small>/ 100</small></p><div class="wp-energy"><span :style="{ width: stat.value + '%' }"></span></div><small>{{ stat.note }}</small></article></div></section>
      <section class="wp-status-section" data-status-section="resources" aria-label="账户与携带物品"><div class="wp-heading"><h2>账户与携带物品</h2></div><div class="wp-resources"><article class="wp-resource"><h2>Appie Pay</h2><p class="wp-footnote">余额、银行卡与交易流水在手机中查看。</p><button type="button" class="wp-text-button" @click="emit('phone')">打开手机 ↗</button></article><article class="wp-resource"><h2>随身携带</h2><p class="wp-resource-value">{{ model.state.inventory.length }}<small>种 · {{ inventoryCount }} 份／件</small></p><button type="button" class="wp-text-button" data-status-open-inventory @click="emit('inventory')">打开背包 ↗</button></article></div><button v-if="storeAvailability.available" type="button" class="wp-secondary wp-store-entry" data-open-store :disabled="model.busy" @click="emit('store')">逛便利店 ↗</button></section>
      <section class="wp-status-section" data-status-section="recent" aria-label="最近变化"><div class="wp-heading"><h2>最近变化</h2><small>已保存的活动记录</small></div><div class="wp-journal-list"><article v-for="entry in recentChanges" :key="entry.id" class="wp-journal-entry"><time>{{ entry.at }}</time><p>{{ entry.text }}</p></article><p v-if="!recentChanges.length" class="wp-empty">活动完成后会在这里记录实际结果。</p></div></section>
      <AcademicProgress :academics="model.state.academics" />
      <article v-if="interior" class="wp-air-traffic" aria-label="室内活动"><div class="wp-heading"><h2>室内活动</h2><span class="wp-badge">{{ interior.label }}</span></div><p>{{ lastActivity ? lastActivity.result : '已进入室内，可以走近物件进行观察、学习或休息。' }}</p><small>位置与活动按当前聊天保存，退出房间后回到原入口。</small></article>
      <article class="wp-air-traffic" aria-label="公交出行"><div class="wp-heading"><h2>公交出行</h2><span class="wp-badge">已乘坐 {{ model.state.transit.sequence }} 次</span></div><p v-if="model.state.transit.lastRide">{{ transitVehicles.find(vehicle => vehicle.id === model.state.transit.lastRide?.vehicleId)?.label }} · {{ transitStops.find(stop => stop.id === model.state.transit.lastRide?.fromStopId)?.label }} → {{ transitStops.find(stop => stop.id === model.state.transit.lastRide?.toStopId)?.label }}，{{ model.state.transit.lastRide.minutes }} 分钟，车费 ¥{{ model.state.transit.lastRide.fare }}。</p><p v-else>在南门公交站搭乘 BTR-82A 或 ZBD-04A，前往更远的城区。</p><button class="wp-text-button" @click="emit('transit')">查看公交线路 ↗</button></article>
      <article class="wp-air-traffic" aria-label="空中动态"><div class="wp-heading"><h2>空中动态</h2><span class="wp-badge">累计经过 {{ model.state.airTraffic.sequence }} 次</span></div><p>{{ interior ? '当前在室内，无法直接观察天空；已记录的空中事件保留。' : activeAirliner ? '一架客机正从远处高空平稳经过。' : lastAirliner ? '最近的客机已飞离视野。' : '天空暂时平静，偶尔会有客机经过。' }}</p><small v-if="lastAirliner">最近一次：{{ airlinerSource }} · {{ activeAirliner ? '正在经过' : '已记录' }}</small><small v-else>环境中可能随机出现，也可能由对话剧情触发。</small></article>
      <article class="wp-journal"><div class="wp-heading"><h2>日常手记</h2><span class="wp-badge">{{ model.state.journal.length }} 条记录</span></div><div class="wp-journal-list"><article v-for="entry in [...model.state.journal].reverse()" :key="entry.id" class="wp-journal-entry"><time>{{ entry.at }}</time><p>{{ entry.text }}</p></article><p v-if="!model.state.journal.length" class="wp-empty">新的足迹，会留在这里。</p></div></article>
      <p class="wp-footnote">{{ model.connection }} · 世界状态按聊天保存。地点、人物与资源为演示内容。</p>
    </template>
  </section>
</template>
