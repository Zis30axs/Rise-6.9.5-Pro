<script setup lang="ts">
import { computed, ref } from 'vue';
import WorldMap from './WorldMap.vue';
import { locations } from '../runtime/model';
import type { ShellActions, ShellModel } from './types';

type Panel = 'phone' | 'map' | 'schedule' | 'people' | 'status';
const props = defineProps<{ panel: Panel; model: ShellModel; actions: ShellActions }>();
const emit = defineEmits<{ compose: [name: string]; contact: [npcId: string] }>();
const labels: Record<Panel, string> = {
  phone: '演示手机消息', map: '探索地图', schedule: '今日日程', people: '人物档案', status: '个人状态与日记',
};
const selectedContactId = ref('');
const currentLocation = computed(() => locations.find(item => item.id === props.model.state.locationId) ?? locations[0]);
const time = computed(() => `${String(props.model.state.clock.hour).padStart(2, '0')}:${String(props.model.state.clock.minute).padStart(2, '0')}`);
const unread = computed(() => props.model.state.phone.filter(item => !item.read).length);
const activeContact = computed(() => props.model.state.contacts.find(item => item.id === selectedContactId.value) ?? props.model.state.contacts[0]);
const contactMessages = computed(() => props.model.state.phone.filter(item => item.npcId === activeContact.value?.id));
const completedPlans = computed(() => props.model.state.schedule.filter(item => item.done).length);
const energy = computed(() => Math.min(100, Math.max(0, props.model.state.player.energy)));
const unreadFor = (npcId: string) => props.model.state.phone.filter(item => item.npcId === npcId && !item.read).length;
const realUnreadFor = (npcId: string) => props.model.phoneContactUnread.find(contact => contact.npcId === npcId)?.unread ?? 0;
const locationName = (id: string) => locations.find(item => item.id === id)?.name ?? '未知地点';
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

    <WorldMap v-else-if="panel === 'map'" :model="model" :actions="actions" />

    <template v-else-if="panel === 'schedule'">
      <div class="wp-day-summary"><div><h2>第 {{ model.state.clock.day }} 天</h2><p>{{ time }} · {{ currentLocation?.name }}</p></div><span class="wp-badge">已完成 {{ completedPlans }} / {{ model.state.schedule.length }} 项</span></div>
      <div class="wp-day-progress"><span :style="{ width: (model.state.schedule.length ? completedPlans / model.state.schedule.length * 100 : 0) + '%' }"></span></div>
      <div class="wp-plans">
        <article v-for="plan in model.state.schedule" :key="plan.id" class="wp-plan" :class="{ done: plan.done }">
          <div class="wp-plan-time">{{ plan.time }}<small>{{ plan.done ? '已完成' : '待办' }}</small></div>
          <div class="wp-plan-body"><h2>{{ plan.title }}</h2><p>{{ locationName(plan.locationId) }}</p><div class="wp-plan-actions"><button class="wp-text-button" :disabled="model.busy || plan.locationId === model.state.locationId" @click="actions.dispatch({ type: 'travel', locationId: plan.locationId })">{{ plan.locationId === model.state.locationId ? '已在此处' : '前往地点 ↗' }}</button><button class="wp-secondary" :disabled="model.busy || plan.done" @click="actions.dispatch({ type: 'complete_schedule', id: plan.id })">{{ plan.done ? '已完成 ✓' : '完成这件事' }}</button></div></div>
        </article>
        <p v-if="!model.state.schedule.length" class="wp-empty">今天暂时没有安排。</p>
      </div>
      <p class="wp-footnote">演示安排 · 到达地点并到达约定时间后可完成。</p>
    </template>

    <template v-else-if="panel === 'people'">
      <div class="wp-people">
        <article v-for="(contact, index) in model.state.contacts" :key="contact.id" class="wp-person">
          <div class="wp-person-heading"><span class="wp-avatar" :class="'wp-avatar-' + index % 3">{{ contact.name.slice(-2) }}</span><div><h2>{{ contact.name }}</h2><p>{{ contact.tag }}</p></div></div>
          <p class="wp-person-status"><span></span>{{ contact.status }}</p><p class="wp-person-summary">{{ contact.summary }}</p>
          <div class="wp-affinity-label"><span>关系 · 演示值</span><span>{{ contact.affinity }} / 100</span></div><div class="wp-affinity"><span :style="{ width: Math.min(100, Math.max(0, contact.affinity)) + '%' }"></span></div>
          <button class="wp-text-button" @click="emit('compose', contact.name)">从一句问候开始 <span aria-hidden="true">↗</span></button>
          <button v-if="model.mode === 'tavern'" class="wp-contact-phone" :aria-label="`查看${contact.name}的手机会话`" @click="emit('contact', contact.id)"><span>查看手机会话</span><span v-if="realUnreadFor(contact.id)" class="wp-badge">{{ realUnreadFor(contact.id) }} 未读</span><span v-else aria-hidden="true">↗</span></button>
        </article>
        <p v-if="!model.state.contacts.length" class="wp-empty">还没有人物档案。</p>
      </div>
    </template>

    <template v-else-if="panel === 'status'">
      <div class="wp-resources">
        <article class="wp-resource"><h2>精力</h2><p class="wp-resource-value">{{ model.state.player.energy }}<small>/ 100</small></p><div class="wp-energy"><span :style="{ width: energy + '%' }"></span></div><button class="wp-text-button" :disabled="model.busy" @click="actions.dispatch({ type: 'wait', minutes: 15 })">休息 15 分钟 <span aria-hidden="true">↗</span></button></article>
        <article class="wp-resource"><h2>账户余额</h2><p class="wp-resource-value"><small>¥</small>{{ model.state.player.balance.toFixed(2) }}</p><p class="wp-footnote">演示资源，不涉及真实交易</p></article>
      </div>
      <article class="wp-journal"><div class="wp-heading"><h2>日常手记</h2><span class="wp-badge">{{ model.state.journal.length }} 条记录</span></div><div class="wp-journal-list"><article v-for="entry in [...model.state.journal].reverse()" :key="entry.id" class="wp-journal-entry"><time>{{ entry.at }}</time><p>{{ entry.text }}</p></article><p v-if="!model.state.journal.length" class="wp-empty">新的足迹，会留在这里。</p></div></article>
      <p class="wp-footnote">{{ model.connection }} · 世界状态按聊天保存。地点、人物与资源为演示内容。</p>
    </template>
  </section>
</template>
