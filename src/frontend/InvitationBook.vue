<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import MapCharacterAvatar from './MapCharacterAvatar.vue';
import { locations, getNovelTravelQuote } from '../runtime/model';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { gameCalendar } from '../runtime/game-calendar';
import { invitationCards, invitationContactIdentity, invitationDraftError, invitationDraftText, defaultInvitationTime, type InvitationShelf } from './invitation-book';
import type { ShellModel } from './types';

const props = defineProps<{ model: ShellModel; novelMode: boolean; nearbyPersonIds: string[] }>();
const emit = defineEmits<{ compose: [text: string]; travel: [id: string] }>();
const owner = computed(() => activeProtagonist(props.model.state));
const cards = computed(() => invitationCards(props.model.state));
const shelves: { id: InvitationShelf; label: string; empty: string }[] = [
  { id: 'upcoming', label: '近期约定', empty: '还没有约好的见面' },
  { id: 'pending', label: '待回应', empty: '暂时没有等待回应的邀请' },
  { id: 'history', label: '往期记录', empty: '那些见面的日子，会留在这里' },
];
const shelf = ref<InvitationShelf>('upcoming');
const selectedId = ref('');
const composing = ref(false);
const detailElement = ref<HTMLElement>();
const formElement = ref<HTMLFormElement>();
const search = ref('');
const targetId = ref('');
const source = ref<'sms' | 'meeting'>('sms');
const date = ref('');
const time = ref('');
const locationId = ref('');
const activity = ref('');
const error = ref('');
const visibleCards = computed(() => cards.value.filter(item => item.shelf === shelf.value));
const selected = computed(() => visibleCards.value.find(item => item.id === selectedId.value) ?? visibleCards.value[0] ?? null);
const nextMeeting = computed(() => cards.value.find(item => item.shelf === 'upcoming'));
const calendar = computed(() => gameCalendar(props.model.state.clock.day));
const contacts = computed(() => props.model.state.contacts.filter(item => !search.value.trim() || item.name.includes(search.value.trim())));
const target = computed(() => props.model.state.contacts.find(item => item.id === targetId.value));
const canMeet = computed(() => !!target.value && [target.value.id, target.value.sourcePersonId].some(id => !!id && props.nearbyPersonIds.includes(id)));
const places = locations.filter(item => item.id !== 'court-hearing');
const placeName = (id: string) => locations.find(item => item.id === id)?.name ?? '约定地点';
const travelQuote = computed(() => selected.value && props.novelMode ? getNovelTravelQuote(props.model.state, selected.value.locationId) : null);
const atDestination = computed(() => selected.value?.locationId === (props.model.state.interior?.roomId ?? props.model.state.locationId));
const travelBlocked = computed(() => props.model.busy || atDestination.value || !!travelQuote.value?.blockedReason);
const draft = computed(() => ({ name: target.value?.name ?? '', source: source.value, date: date.value, time: time.value,
  location: places.find(item => item.id === locationId.value)?.name ?? '', activity: activity.value }));

watch(canMeet, value => { if (!value) source.value = 'sms'; });
watch(owner, () => { composing.value = false; selectedId.value = ''; shelf.value = 'upcoming'; resetDraft(); });
watch(() => props.model.memoryScope, () => { composing.value = false; selectedId.value = ''; resetDraft(); });
function resetDraft() {
  search.value = ''; targetId.value = ''; source.value = 'sms'; activity.value = ''; error.value = '';
  const defaults = defaultInvitationTime(props.model.state);
  date.value = defaults.date; time.value = defaults.time;
  locationId.value = places.some(item => item.id === props.model.state.locationId) ? props.model.state.locationId : 'cafe';
}
async function startInvitation() {
  if (props.model.busy) return;
  if (!date.value) resetDraft();
  composing.value = true;
  await nextTick(); formElement.value?.querySelector<HTMLInputElement>('input[type="search"]')?.focus({ preventScroll: true });
}
async function selectCard(id: string) {
  selectedId.value = id;
  await nextTick();
  detailElement.value?.focus({ preventScroll: true });
  if (globalThis.matchMedia?.('(max-width: 600px)').matches) detailElement.value?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function submitInvitation() {
  if (props.model.busy) return;
  error.value = invitationDraftError(draft.value, props.model.state);
  if (source.value === 'meeting' && !canMeet.value) error.value = '对方现在不在身边，可以先发短信。';
  if (!error.value) emit('compose', invitationDraftText(draft.value));
}
function followUp() {
  const row = selected.value;
  if (!row || props.model.busy) return;
  emit('compose', `给${row.name}发短信，聊聊${row.date} ${row.time}在${placeName(row.locationId)}见面的约定：`);
}
</script>

<template>
  <section class="invitation-book" :data-invitation-owner="owner" aria-label="邀约簿">
    <header class="ib-cover">
      <div class="ib-cover-copy"><p class="ib-eyebrow">{{ protagonistNames[owner] }}的邀约簿</p><h2>{{ composing ? '写一份新的邀请' : '下一次，见面吧。' }}</h2><p class="ib-cover-note">{{ calendar.month }} 月 {{ calendar.date }} 日 · {{ calendar.weekdayLabel }}<span v-if="nextMeeting && !composing"> · {{ nextMeeting.relativeTime }}</span></p></div>
      <button v-if="!composing" type="button" class="ib-primary" :disabled="model.busy" data-new-invitation @click="startInvitation"><span aria-hidden="true">＋</span> 发起邀约</button>
      <button v-else type="button" class="ib-secondary" @click="composing = false">返回邀约簿</button>
    </header>

    <template v-if="!composing">
      <nav class="ib-shelves" aria-label="邀约分类"><button v-for="tab in shelves" :key="tab.id" type="button" :aria-pressed="shelf === tab.id" :data-invitation-shelf="tab.id" @click="shelf = tab.id; selectedId = ''">{{ tab.label }}<span>{{ cards.filter(item => item.shelf === tab.id).length }}</span></button></nav>
      <div v-if="visibleCards.length" class="ib-pages">
        <div class="ib-list" aria-label="邀约列表">
          <button v-for="row in visibleCards" :key="row.id" type="button" class="ib-card" :class="{ 'is-selected': selected?.id === row.id }" :aria-pressed="selected?.id === row.id" :data-invitation="row.id" @click="selectCard(row.id)">
            <span class="ib-card-top"><MapCharacterAvatar :name="row.name" :person-id="row.personId" :portrait-id="row.portraitId" :protagonist-id="row.protagonistId" /><span class="ib-card-person"><strong>{{ row.name }}</strong><small>{{ row.source === 'sms' ? '短信邀约' : '当面邀约' }}</small></span><span class="ib-card-arrow" aria-hidden="true">↗</span></span>
            <span class="ib-card-time">{{ row.time }}<small>{{ gameCalendar(row.day).month }} 月 {{ gameCalendar(row.day).date }} 日</small></span>
            <span class="ib-card-place">{{ placeName(row.locationId) }}</span><span class="ib-status" :class="'ib-status-' + row.status">{{ row.statusLabel }}</span>
          </button>
        </div>
        <article v-if="selected" :key="selected.id" ref="detailElement" class="ib-detail" tabindex="-1" :aria-label="'和' + selected.name + '的邀约详情'" data-invitation-detail>
          <div class="ib-detail-heading"><span class="ib-eyebrow">{{ selected.incoming ? '收到的邀请' : '留给彼此的时间' }}</span><span class="ib-status" :class="'ib-status-' + selected.status">{{ selected.statusLabel }}</span></div>
          <h3>和{{ selected.name }}的约定</h3>
          <dl class="ib-facts"><div><dt>见面时间</dt><dd>{{ selected.date }}<br><strong>{{ selected.time }}</strong> <span>{{ gameCalendar(selected.day).weekdayLabel }}</span></dd></div><div><dt>约定地点</dt><dd>{{ placeName(selected.locationId) }}</dd></div></dl>
          <section class="ib-message"><h4>那时的邀请</h4><p>{{ selected.message }}</p></section>
          <section v-if="selected.response" class="ib-message ib-reply"><h4>{{ selected.incoming ? '你的回应' : '收到的回应' }}</h4><p>{{ selected.response }}</p></section>
          <p v-else class="ib-unanswered">还没有留下回应。</p>
          <footer class="ib-detail-footer"><p class="ib-timing">{{ selected.relativeTime }}</p><p v-if="travelQuote && selected.status === 'accepted' && selected.shelf === 'upcoming' && !atDestination" class="ib-travel-note">{{ travelQuote.blockedReason || `路程约 ${travelQuote.minutes} 分钟 · 精力 −${travelQuote.energyCost}${travelQuote.fare ? ` · 车费 ¥${travelQuote.fare}` : ''}` }}</p><div class="ib-actions"><button v-if="selected.status === 'accepted' && selected.shelf === 'upcoming'" type="button" class="ib-primary" :disabled="travelBlocked" data-invitation-travel @click="emit('travel', selected.id)">{{ atDestination ? '已在约定地点' : '前往约定地点 ↗' }}</button><button type="button" class="ib-secondary" :disabled="model.busy" @click="followUp">聊聊这次约定</button></div></footer>
        </article>
      </div>
      <div v-else class="ib-empty"><svg viewBox="0 0 80 80" aria-hidden="true"><rect x="13" y="21" width="54" height="43" rx="5"/><path d="m14 26 26 20 26-20M29 16v-6m22 6v-6M34 58h12"/></svg><h3>{{ shelves.find(tab => tab.id === shelf)?.empty }}</h3><p>想一起走走，还是坐下来聊聊天？<br>给想见的人留一句邀请吧。</p><button type="button" class="ib-secondary" :disabled="model.busy" @click="startInvitation">写一份邀请 ↗</button></div>
    </template>

    <form v-else ref="formElement" class="ib-compose" data-invitation-form @submit.prevent="submitInvitation">
      <fieldset class="ib-people"><legend>想见谁</legend><label class="ib-search"><span class="sr-only">搜索联系人</span><input v-model="search" type="search" placeholder="找一位朋友…" aria-label="搜索联系人" /></label><div class="ib-contact-grid"><button v-for="contact in contacts" :key="contact.id" type="button" class="ib-contact" :aria-pressed="targetId === contact.id" :data-invite-contact="contact.id" @click="targetId = contact.id; error = ''"><MapCharacterAvatar v-bind="invitationContactIdentity(contact)"/><span>{{ contact.name }}</span><span v-if="targetId === contact.id" class="ib-check" aria-hidden="true">✓</span></button></div><p v-if="!contacts.length" class="ib-unanswered">{{ model.state.contacts.length ? '没有找到这个名字。' : '认识新的朋友后，就可以在这里写邀请了。' }}</p></fieldset>
      <fieldset class="ib-form-fields"><legend>把时间留出来</legend><div class="ib-field-pair"><label>日期<input v-model="date" type="date" :min="calendar.iso" required aria-label="见面日期" /></label><label>时间<input v-model="time" type="time" required aria-label="见面时间" /></label></div><label>见面地点<select v-model="locationId" required aria-label="见面地点"><option v-for="place in places" :key="place.id" :value="place.id">{{ place.name }}</option></select></label><label>想一起做的事<textarea v-model="activity" rows="3" maxlength="300" placeholder="喝杯咖啡，或者去没逛过的街道走走…" required aria-label="想一起做的事"></textarea></label><div class="ib-channel" role="group" aria-label="邀请方式"><button type="button" :aria-pressed="source === 'sms'" @click="source = 'sms'">发短信邀请</button><button type="button" :aria-pressed="source === 'meeting'" :disabled="!canMeet" :title="canMeet ? '当面提出邀请' : '对方在身边时可用'" @click="source = 'meeting'">当面邀请</button></div><p v-if="target && !canMeet" class="ib-unanswered">对方不在身边，先发条短信吧。</p></fieldset>
      <footer class="ib-compose-footer"><p v-if="error" class="ib-error" role="alert">{{ error }}</p><p v-else class="ib-unanswered">写好后，回到故事里说给对方听。</p><button type="submit" class="ib-primary" :disabled="model.busy || !target" data-compose-invitation>写入正文 ↗</button></footer>
    </form>
  </section>
</template>
