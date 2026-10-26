<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import type { ShellModel, ShellActions, WorldAction } from './types';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { MUSIC_ROLES, musicRoleNames, musicPersonId, type MusicRole } from '../runtime/livehouse';
import { runInteraction } from './interaction-action';
const props = defineProps<{ model: ShellModel; actions: ShellActions; mode: 'register' | 'book' }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement>();
const bandName = ref(''), founderRole = ref<MusicRole | ''>(''), confirmed = ref(false);
const bandId = ref(''), title = ref(''), day = ref(''), time = ref(''), duration = ref('');
const error = ref('');
const owner = computed(() => activeProtagonist(props.model.state));
const bands = computed(() => (props.model.state.livehouse?.bands ?? []).filter(b => b.members.some(m => m.personId === musicPersonId(owner.value))));
const bookings = computed(() => (props.model.state.livehouse?.bookings ?? []).filter(b => bands.value.some(band => band.id === b.bandId)));
let pending: { signature: string; action: Extract<WorldAction, {type:'interior_interact'}> } | undefined;
async function submit() {
  if (props.model.busy) return;
  error.value = '';
  const registration = props.mode === 'register';
  if (registration && (!bandName.value.trim() || !founderRole.value || !confirmed.value)) { error.value = '请填写乐队名、选择分工，并确认本人作为创始成员。'; return; }
  if (!registration && (!bandId.value || !title.value.trim() || !/^\d+$/.test(day.value) || !/^\d{2}:\d{2}$/.test(time.value) || !duration.value)) { error.value = '请选择乐队，填写演出名称、游戏日期、开始时间和时长。'; return; }
  const start = (Number(day.value) - 1) * 1440 + Number(time.value.slice(0, 2)) * 60 + Number(time.value.slice(3));
  const signature = JSON.stringify([props.mode, bandName.value, founderRole.value, bandId.value, title.value, start, duration.value]);
  if (!pending || pending.signature !== signature) {
    const id = 'live-' + crypto.randomUUID();
    pending = { signature, action: registration
      ? { type:'interior_interact', interactionId:'livehouse-create-band', registration:{ id, name:bandName.value.trim(), founderRole:founderRole.value as MusicRole } }
      : { type:'interior_interact', interactionId:'livehouse-booking', booking:{ id, bandId:bandId.value, title:title.value.trim(), start, duration:Number(duration.value) } } };
  }
  if (await runInteraction(props.model, props.actions, pending.action)) emit('close');
  else error.value = props.model.notice || '未保存，可使用相同内容重试。';
}
onMounted(() => nextTick(() => dialog.value?.querySelector<HTMLInputElement>('input,select')?.focus()));
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.model.busy) { event.preventDefault(); event.stopPropagation(); emit('close'); }
  if (event.key !== 'Tab') return;
  const fields = [...dialog.value!.querySelectorAll<HTMLElement>('input,select,button')].filter(e => !(e as HTMLInputElement).disabled);
  const active = (dialog.value!.getRootNode() as Document | ShadowRoot).activeElement;
  if (event.shiftKey && active === fields[0]) { event.preventDefault(); fields.at(-1)?.focus(); }
  else if (!event.shiftKey && active === fields.at(-1)) { event.preventDefault(); fields[0]?.focus(); }
}
</script>
<template>
  <div class="livehouse-overlay" @click.self="!model.busy && emit('close')">
    <section ref="dialog" class="livehouse-dialog" role="dialog" aria-modal="true" :aria-label="mode === 'register' ? '登记乐队' : '预约演出'" @keydown="keydown" data-livehouse-panel>
      <header><small>Live House · 音乐名录</small><h2>{{ mode === 'register' ? '登记新乐队' : '预约演出' }}</h2></header>
      <form @submit.prevent="submit">
        <fieldset :disabled="model.busy">
          <template v-if="mode === 'register'">
            <label>乐队名称<input v-model="bandName" maxlength="40" required placeholder="填写乐队名称" data-band-name></label>
            <label>我的分工<select v-model="founderRole" required data-founder-role><option disabled value="">请选择</option><option v-for="role in MUSIC_ROLES" :key="role" :value="role">{{ musicRoleNames[role] }}</option></select></label>
            <label class="livehouse-confirm"><input v-model="confirmed" type="checkbox" required data-confirm-founder>确认{{ protagonistNames[owner] }}作为创始成员</label>
            <p>登记耗时 20 分钟、消耗 3 点精力。其他成员请在手机消息中发送邀请，对方同意后加入。</p>
          </template>
          <template v-else>
            <label>演出乐队<select v-model="bandId" required data-booking-band><option disabled value="">请选择已加入的乐队</option><option v-for="band in bands" :key="band.id" :value="band.id">{{ band.name }}</option></select></label>
            <label>演出名称<input v-model="title" maxlength="80" required data-booking-title></label>
            <label>游戏第几天<input v-model="day" type="number" min="1" max="365000" required placeholder="填写游戏天数" data-booking-day></label>
            <label>开始时间<input v-model="time" type="time" required data-booking-time></label>
            <label>演出时长<select v-model="duration" required data-booking-duration><option disabled value="">请选择</option><option value="30">30 分钟</option><option value="60">60 分钟</option><option value="90">90 分钟</option><option value="120">120 分钟</option></select></label>
            <p>办理预约耗时 30 分钟、消耗 5 点精力。预约保存当前确认成员，并写入主角成员的日历。</p>
          </template>
          <p v-if="error" role="alert">{{ error }}</p>
          <div class="livehouse-controls"><button type="submit" data-livehouse-submit>确认并保存</button><button type="button" @click="emit('close')">取消</button></div>
        </fieldset>
      </form>
      <details><summary>已登记 {{ bands.length }} 支乐队 · 已预约 {{ bookings.length }} 场</summary>
        <article v-for="band in bands" :key="band.id"><h3>{{ band.name }}</h3><p v-for="member in band.members" :key="member.personId">{{ member.name }} · {{ musicRoleNames[member.role] }}</p></article>
        <p v-for="booking in bookings" :key="booking.id">{{ booking.title }} · 第 {{ Math.floor(booking.start / 1440) + 1 }} 天 {{ String(Math.floor(booking.start % 1440 / 60)).padStart(2,'0') }}:{{ String(booking.start % 60).padStart(2,'0') }} · {{ booking.duration }} 分钟</p>
      </details>
    </section>
  </div>
</template>

